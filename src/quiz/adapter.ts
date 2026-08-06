/**
 * 주관식 빈칸 문제(`{promptHtml, blanks}`) → 게임용 4지선다 변환.
 *
 * 원 프로젝트(low-grade-operator-exercise-web)의 생성기는 손글씨/숫자패드 입력을
 * 전제로 만들어졌다. 게임에서는 이동 중에 빠르게 고를 수 있어야 하므로 4지선다가
 * 필요하다. 이 어댑터가 유일한 신규 작업이며, 생성기 자체는 수정하지 않는다.
 */
import { pickDistractors } from './distractors';
import type { AdaptFailure, AnswerForm, GameQuiz, RawProblem } from './types';

/* ───────────────────────── 정답 형태 판별 ───────────────────────── */

const isInt = (s: string) => /^-?\d+$/.test(s.trim());
const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s.trim());
const placesOf = (s: string) => {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

type Layout =
  | { kind: 'scalar' }
  | { kind: 'fraction'; nIdx: number; dIdx: number }
  | { kind: 'mixed'; wIdx: number; nIdx: number; dIdx: number }
  | { kind: 'fracPair'; a: { n: number; d: number }; b: { n: number; d: number } }
  | { kind: 'quotRem' }
  | { kind: 'unsupported'; reason: string };

/**
 * promptHtml의 DOM 구조를 보고 빈칸이 무엇을 의미하는지 판별한다.
 * (생성기가 `frB`/`mixedB`/`B(0)…B(1)` 중 무엇으로 답란을 만들었는지)
 */
function detectLayout(doc: HTMLElement, blanks: string[]): Layout {
  const blankEls = [...doc.querySelectorAll<HTMLElement>('.blank')];
  if (blankEls.length !== blanks.length) {
    return { kind: 'unsupported', reason: `빈칸 수 불일치 (${blankEls.length} vs ${blanks.length})` };
  }
  const biOf = (el: HTMLElement) => Number(el.dataset.bi ?? -1);

  if (blanks.length === 1) return { kind: 'scalar' };

  // 빈칸을 품은 .frac 만 답란 후보다. 좌변 피연산자도 .frac/.mixed 로 그려지므로
  // 단순히 querySelector('.mixed') 하면 피연산자를 집어 오탐한다.
  const answerFracs = [...doc.querySelectorAll<HTMLElement>('.frac')].filter(
    (f) => f.querySelector('.fn .blank') && f.querySelector('.fd .blank'),
  );

  // 대분수: 빈칸을 가진 .mixed (정수 빈칸 + 분자·분모 빈칸)
  const answerMixed = [...doc.querySelectorAll<HTMLElement>('.mixed')].find(
    (m) => m.querySelectorAll('.blank').length === 3 && m.querySelector('.frac .fn .blank'),
  );
  if (answerMixed) {
    const frac = answerMixed.querySelector<HTMLElement>('.frac')!;
    const wEl = [...answerMixed.querySelectorAll<HTMLElement>('.blank')].find((el) => !frac.contains(el));
    const nEl = frac.querySelector<HTMLElement>('.fn .blank');
    const dEl = frac.querySelector<HTMLElement>('.fd .blank');
    if (wEl && nEl && dEl) {
      return { kind: 'mixed', wIdx: biOf(wEl), nIdx: biOf(nEl), dIdx: biOf(dEl) };
    }
  }

  // 분수 1개
  if (answerFracs.length === 1 && blanks.length === 2) {
    const nEl = answerFracs[0].querySelector<HTMLElement>('.fn .blank')!;
    const dEl = answerFracs[0].querySelector<HTMLElement>('.fd .blank')!;
    return { kind: 'fraction', nIdx: biOf(nEl), dIdx: biOf(dEl) };
  }

  // 통분: 분수 2개(분자·분모 빈칸 4개)를 같은 분모로 고치기
  if (answerFracs.length === 2 && blanks.length === 4) {
    const idx = answerFracs.map((f) => ({
      n: biOf(f.querySelector<HTMLElement>('.fn .blank')!),
      d: biOf(f.querySelector<HTMLElement>('.fd .blank')!),
    }));
    return { kind: 'fracPair', a: idx[0], b: idx[1] };
  }

  // 몫…나머지: 빈칸 2개 사이에 "…"
  if (blanks.length === 2 && doc.textContent?.includes('…')) {
    return { kind: 'quotRem' };
  }

  return { kind: 'unsupported', reason: `지원하지 않는 답란 구조 (빈칸 ${blanks.length}개)` };
}

function toForm(layout: Layout, blanks: string[]): AnswerForm | null {
  switch (layout.kind) {
    case 'scalar': {
      const s = blanks[0].trim();
      if (!isNum(s)) return null;
      const v = parseFloat(s);
      return isInt(s) ? { kind: 'int', value: v } : { kind: 'decimal', value: v, places: placesOf(s) };
    }
    case 'fraction': {
      const n = blanks[layout.nIdx];
      const d = blanks[layout.dIdx];
      if (!isInt(n) || !isInt(d)) return null;
      return { kind: 'fraction', n: parseInt(n, 10), d: parseInt(d, 10) };
    }
    case 'mixed': {
      const [w, n, d] = [blanks[layout.wIdx], blanks[layout.nIdx], blanks[layout.dIdx]];
      if (!isInt(w) || !isInt(n) || !isInt(d)) return null;
      return { kind: 'mixed', w: parseInt(w, 10), n: parseInt(n, 10), d: parseInt(d, 10) };
    }
    case 'fracPair': {
      const g = (i: number) => blanks[i];
      const vals = [g(layout.a.n), g(layout.a.d), g(layout.b.n), g(layout.b.d)];
      if (!vals.every(isInt)) return null;
      const [an, ad, bn, bd] = vals.map((v) => parseInt(v, 10));
      // 통분 결과는 두 분수의 분모가 같아야 한다
      if (ad !== bd) return null;
      return { kind: 'fracPair', an, bn, d: ad };
    }
    case 'quotRem': {
      const [q, r] = blanks;
      if (!isInt(q) || !isNum(r)) return null;
      return { kind: 'quotRem', q: parseInt(q, 10), r: parseFloat(r), rPlaces: placesOf(r.trim()) };
    }
    default:
      return null;
  }
}

function answerTextOf(form: AnswerForm): string {
  switch (form.kind) {
    case 'int':
      return String(form.value);
    case 'decimal':
      return String(form.value);
    case 'fraction':
      return `${form.n}/${form.d}`;
    case 'mixed':
      return `${form.w} ${form.n}/${form.d}`;
    case 'fracPair':
      return `${form.an}/${form.d}, ${form.bn}/${form.d}`;
    case 'quotRem':
      return `${form.q}…${form.r}`;
  }
}

/* ───────────────────────── 렌더 ───────────────────────── */

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

const fracHtml = (n: string, d: string) =>
  `<span class="frac"><span class="fn">${esc(n)}</span><span class="fl"></span><span class="fd">${esc(d)}</span></span>`;

/** 보기 평문("3/4", "1 2/5", "7…0.3")을 수식 HTML로. */
export function choiceHtml(text: string): string {
  const pair = text.match(/^(-?\d+)\/(\d+),\s*(-?\d+)\/(\d+)$/);
  if (pair) {
    return `<span class="pair">${fracHtml(pair[1], pair[2])}<span class="op">,</span>${fracHtml(pair[3], pair[4])}</span>`;
  }
  const mixed = text.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return `<span class="mixed"><span class="t">${esc(mixed[1])}</span>${fracHtml(mixed[2], mixed[3])}</span>`;
  }
  const frac = text.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return fracHtml(frac[1], frac[2]);

  const qr = text.match(/^(-?\d+)…(-?[\d.]+)$/);
  if (qr) {
    return `<span class="qr"><span class="t">${esc(qr[1])}</span><span class="op">…</span><span class="t">${esc(qr[2])}</span></span>`;
  }
  return `<span class="t">${esc(text)}</span>`;
}

/** 빈칸을 "?"로 치환한 지문. 세로셈·분수 구조는 그대로 살린다. */
function promptWithQuestionMarks(root: HTMLElement): string {
  root.querySelectorAll<HTMLElement>('.blank').forEach((el) => {
    el.classList.add('ask');
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    el.textContent = '?';
  });
  return root.innerHTML;
}

/* ───────────────────────── 공개 API ───────────────────────── */

export type AdaptResult = { quiz: GameQuiz } | { failure: AdaptFailure };

export function adapt(
  raw: RawProblem,
  meta: { itemId: string; groupLabel: string; itemName: string; std: string },
  rand: () => number = Math.random,
): AdaptResult {
  const host = document.createElement('div');
  host.innerHTML = raw.promptHtml;

  const layout = detectLayout(host, raw.blanks);
  if (layout.kind === 'unsupported') {
    return { failure: { itemId: meta.itemId, reason: layout.reason, promptHtml: raw.promptHtml } };
  }

  const form = toForm(layout, raw.blanks);
  if (!form) {
    return { failure: { itemId: meta.itemId, reason: '정답 파싱 실패', promptHtml: raw.promptHtml } };
  }

  const answerText = answerTextOf(form);
  const picked = pickDistractors(answerText, form, rand);
  if (!picked) {
    return { failure: { itemId: meta.itemId, reason: '오답 후보 부족', promptHtml: raw.promptHtml } };
  }

  // 정답 위치를 균등하게 섞는다 (한쪽으로 몰리면 위치만 보고 찍힌다)
  const texts = [answerText, ...picked.texts];
  const rules = ['정답', ...picked.rules];
  for (let i = texts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [texts[i], texts[j]] = [texts[j], texts[i]];
    [rules[i], rules[j]] = [rules[j], rules[i]];
  }

  return {
    quiz: {
      ...meta,
      promptHtml: promptWithQuestionMarks(host),
      choices: texts.map(choiceHtml),
      choicesText: texts,
      answer: texts.indexOf(answerText),
      form: form.kind,
      rules,
    },
  };
}

/**
 * 특정 유형에서 4지선다 문항 n개를 뽑는다.
 * 변환 실패분은 버리고 재시도하되, 무한루프를 막기 위해 상한을 둔다.
 */
export function makeQuizzes(
  itemId: string,
  count: number,
  rand: () => number = Math.random,
): { quizzes: GameQuiz[]; failures: AdaptFailure[] } {
  const meta = window.Curriculum.itemMeta(itemId);
  const quizzes: GameQuiz[] = [];
  const failures: AdaptFailure[] = [];
  if (!meta) return { quizzes, failures };

  const seen = new Set<string>();
  const maxTry = count * 12;
  for (let i = 0; i < maxTry && quizzes.length < count; i++) {
    const set = window.Curriculum.generateSet(itemId, 1, seen);
    if (!set || !set.length) break;
    const raw = set[0];
    seen.add(raw.promptHtml);

    const r = adapt(raw, { itemId, groupLabel: meta.groupLabel, itemName: meta.name, std: meta.std }, rand);
    if ('quiz' in r) quizzes.push(r.quiz);
    else failures.push(r.failure);
  }
  return { quizzes, failures };
}
