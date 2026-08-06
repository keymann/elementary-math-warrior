/**
 * distractor(오답 보기) 생성.
 *
 * 원칙
 *  1. 무작위 숫자를 뿌리지 않는다. **초등학생이 실제로 저지르는 실수**를 재현해야
 *     "제일 큰 수 찍기" 같은 편법이 통하지 않는다.
 *  2. 정답과 자릿수·형태가 비슷해야 한다.
 *  3. 생성 실패(후보 부족)는 조용히 넘기지 않고 호출부에 알린다.
 */
import type { AnswerForm } from './types';

export type Candidate = { text: string; rule: string };

const MAX_TRY = 40;

/* ───────────────────────── 유틸 ───────────────────────── */

const fmt = (v: number, places = 0) =>
  places > 0 ? trimZeros(v.toFixed(places)) : String(Math.round(v));

function trimZeros(s: string) {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** 자릿수 유지 여부 — 정답이 3자리인데 오답이 1자리면 티가 난다. */
function sameMagnitude(a: number, b: number) {
  if (a === 0 || b === 0) return Math.abs(a - b) <= 2;
  const la = Math.floor(Math.log10(Math.abs(a)));
  const lb = Math.floor(Math.log10(Math.abs(b)));
  return Math.abs(la - lb) <= 1;
}

function digitsOf(n: number) {
  return String(Math.abs(Math.trunc(n))).split('');
}

/** 인접 두 자리 바꿔치기 (예: 1476 → 1746) */
function swapAdjacentDigits(n: number): number | null {
  const ds = digitsOf(n);
  if (ds.length < 2) return null;
  for (let i = 0; i < ds.length - 1; i++) {
    if (ds[i] !== ds[i + 1]) {
      const c = [...ds];
      [c[i], c[i + 1]] = [c[i + 1], c[i]];
      const v = parseInt(c.join(''), 10) * Math.sign(n || 1);
      if (v !== n) return v;
    }
  }
  return null;
}

/* ───────────────────────── 형태별 규칙 ───────────────────────── */

function intCandidates(v: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (val: number, rule: string) => {
    if (!Number.isFinite(val) || val === v || val < 0) return;
    if (!sameMagnitude(v, val)) return;
    out.push({ text: String(Math.round(val)), rule });
  };

  // 한 자리 수 정답은 후보가 금방 마르므로 근접값을 먼저 넓게 확보한다.
  if (v <= 9) {
    for (const d of [1, 2, 3, 4]) {
      push(v + d, `계산 오차 (+${d})`);
      push(v - d, `계산 오차 (−${d})`);
    }
    push(v * 10, '자릿수 밀림 (×10)');
    return out;
  }

  // 받아올림/받아내림 누락 — 한 자리 단위가 통째로 빠지는 전형적 실수
  const unit = Math.pow(10, Math.max(0, digitsOf(v).length - 2));
  push(v - unit, `받아올림 누락 (−${unit})`);
  push(v + unit, `받아올림 과다 (+${unit})`);

  // 부분곱 누락 — 곱셈 세로셈에서 십의 자리 곱을 빠뜨린 꼴
  if (v >= 100) {
    push(Math.round(v / 10) * 10, '일의 자리 처리 실수');
    push(Math.floor(v / 10) * 10, '일의 자리 버림');
  }

  // 자릿수 밀림
  push(v * 10, '자릿수 밀림 (×10)');
  if (v % 10 === 0) push(v / 10, '자릿수 밀림 (÷10)');

  // 근접값 — 위아래를 **대칭으로** 확보한다.
  // 한쪽만 채우면 정답이 항상 최솟값/최댓값 쪽에 몰려 "제일 큰 보기는 피하면 된다"가 성립한다.
  for (const d of [1, 2, 3]) {
    push(v + d, `계산 오차 (+${d})`);
    push(v - d, `계산 오차 (−${d})`);
  }

  // 숫자 바꿔쓰기
  const sw = swapAdjacentDigits(v);
  if (sw !== null) push(sw, '자리 바꿔 쓰기');

  return out;
}

function decimalCandidates(v: number, places: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (val: number, rule: string) => {
    if (!Number.isFinite(val) || val < 0) return;
    const text = fmt(val, places);
    if (text === fmt(v, places)) return;
    out.push({ text, rule });
  };

  push(v * 10, '소수점 위치 오류 (×10)');
  push(v / 10, '소수점 위치 오류 (÷10)');
  const step = Math.pow(10, -places);
  const label = (k: number) => trimZeros((step * k).toFixed(places));
  for (const k of [1, 2, 3]) {
    push(v + step * k, `계산 오차 (+${label(k)})`);
    push(v - step * k, `계산 오차 (−${label(k)})`);
  }
  push(Math.trunc(v), '소수 부분 버림');
  push(v + step * 10, '자릿수 오정렬');
  push(v - step * 10, '자릿수 오정렬');

  return out;
}

function fractionCandidates(n: number, d: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (nn: number, dd: number, rule: string) => {
    if (!Number.isFinite(nn) || !Number.isFinite(dd)) return;
    if (dd <= 0 || nn < 0) return;
    if (nn === n && dd === d) return;
    out.push({ text: `${nn}/${dd}`, rule });
  };

  if (n !== d) push(d, n, '분자·분모 뒤바꿈');
  for (const k of [1, 2]) {
    push(n + k, d, `분자 계산 오차 (+${k})`);
    if (n > k) push(n - k, d, `분자 계산 오차 (−${k})`);
    push(n, d + k, `분모 계산 오차 (+${k})`); // 분모↑ ⇒ 값은 작아진다
    if (d > k + 1) push(n, d - k, `분모 계산 오차 (−${k})`);
  }
  push(n * 2, d * 2, '약분하지 않음');
  push(n + d, d, '분자·분모를 더함');

  return out;
}

function mixedCandidates(w: number, n: number, d: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (ww: number, nn: number, dd: number, rule: string) => {
    if (dd <= 0 || nn < 0 || ww < 0) return;
    if (ww === w && nn === n && dd === d) return;
    out.push({ text: `${ww} ${nn}/${dd}`, rule });
  };

  push(w + 1, n, d, '자연수 부분 오차 (+1)');
  if (w > 0) push(w - 1, n, d, '자연수 부분 오차 (−1)');
  if (n !== d) push(w, d, n, '분자·분모 뒤바꿈');
  for (const k of [1, 2]) {
    push(w, n + k, d, `분자 계산 오차 (+${k})`);
    if (n > k) push(w, n - k, d, `분자 계산 오차 (−${k})`);
  }
  push(w, n, d + 1, '분모 계산 오차 (+1)');
  if (d > 2) push(w, n, d - 1, '분모 계산 오차 (−1)');
  push(w, n + d, d, '가분수로 잘못 남김');

  return out;
}

/** 통분: 두 분수를 같은 분모로. 오답은 "공통분모를 잘못 잡은" 실수를 재현한다. */
function fracPairCandidates(an: number, bn: number, d: number): Candidate[] {
  const out: Candidate[] = [];
  const push = (a: number, b: number, dd: number, rule: string) => {
    if (dd <= 0 || a < 0 || b < 0) return;
    if (a === an && b === bn && dd === d) return;
    out.push({ text: `${a}/${dd}, ${b}/${dd}`, rule });
  };

  push(an, bn, d * 2, '공통분모를 2배로 잡음');
  if (d % 2 === 0) push(an, bn, d / 2, '공통분모를 절반으로 잡음');
  push(an + 1, bn, d, '한쪽 분자만 잘못 고침');
  push(an, bn + 1, d, '한쪽 분자만 잘못 고침');
  push(bn, an, d, '두 분자를 뒤바꿈');
  push(an * 2, bn * 2, d, '분자만 2배로 고침');

  return out;
}

function quotRemCandidates(q: number, r: number, rPlaces: number): Candidate[] {
  const out: Candidate[] = [];
  const rs = (v: number) => fmt(v, rPlaces);
  const push = (qq: number, rr: number, rule: string) => {
    if (qq < 0 || rr < 0) return;
    if (qq === q && rs(rr) === rs(r)) return;
    out.push({ text: `${qq}…${rs(rr)}`, rule });
  };

  push(q + 1, r, '몫 오차 (+1)');
  if (q > 1) push(q - 1, r, '몫 오차 (−1)');
  const step = Math.pow(10, -rPlaces);
  push(q, r + step, '나머지 오차');
  if (r > 0) push(q, Math.max(0, r - step), '나머지 오차');
  push(r, q, '몫과 나머지 뒤바꿈');

  return out;
}

/* ───────────────────────── 공개 API ───────────────────────── */

export function candidatesFor(form: AnswerForm): Candidate[] {
  switch (form.kind) {
    case 'int':
      return intCandidates(form.value);
    case 'decimal':
      return decimalCandidates(form.value, form.places);
    case 'fraction':
      return fractionCandidates(form.n, form.d);
    case 'mixed':
      return mixedCandidates(form.w, form.n, form.d);
    case 'fracPair':
      return fracPairCandidates(form.an, form.bn, form.d);
    case 'quotRem':
      return quotRemCandidates(form.q, form.r, form.rPlaces);
  }
}

/** 보기 평문을 수치로. 크기 순위(rank) 제어에 쓴다. */
export function valueOf(text: string): number | null {
  const mixed = text.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = text.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const qr = text.match(/^(-?\d+)…(-?[\d.]+)$/);
  if (qr) return +qr[1] + +qr[2] / 1000;
  const pair = text.match(/^(-?\d+)\/(\d+),\s*(-?\d+)\/(\d+)$/);
  if (pair) return +pair[1] / +pair[2] + +pair[3] / +pair[4];
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1, guard = 0; i > 0 && guard < MAX_TRY * 4; i--, guard++) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * 정답 1개 + 오답 3개를 고른다.
 *
 * **크기 순위 제어**가 핵심이다. 규칙만 무작위로 뽑으면 `×10` 오답이 항상 최댓값이 되어
 * "제일 큰 보기는 정답이 아니다"라는 편법이 성립한다(PoC 초기 측정: 정답이 최댓값인 비율 3.4%).
 * 그래서 정답이 4개 중 몇 번째로 큰지를 먼저 무작위로 정하고, 그 순위가 되도록 오답을 고른다.
 *
 * 후보가 모자라면 null — 호출부가 그 문항을 버리고 다시 생성하도록 한다.
 */
export function pickDistractors(
  answerText: string,
  form: AnswerForm,
  rand: () => number,
): { texts: string[]; rules: string[] } | null {
  const pool = candidatesFor(form).filter((c) => c.text !== answerText);

  // 같은 값이 다른 규칙으로 중복 생성될 수 있다 (예: −1 과 자리바꿈이 같은 값)
  const seen = new Set<string>([answerText]);
  const uniq: Candidate[] = [];
  for (const c of pool) {
    if (seen.has(c.text)) continue;
    seen.add(c.text);
    uniq.push(c);
  }
  if (uniq.length < 3) return null;

  const av = valueOf(answerText);
  if (av === null) {
    shuffle(uniq, rand);
    const c = uniq.slice(0, 3);
    return { texts: c.map((x) => x.text), rules: c.map((x) => x.rule) };
  }

  const smaller = uniq.filter((c) => (valueOf(c.text) ?? av) < av);
  const larger = uniq.filter((c) => (valueOf(c.text) ?? av) > av);
  shuffle(smaller, rand);
  shuffle(larger, rand);

  // 목표: 정답보다 작은 오답 k개 (k=0..3 균등) → 정답의 크기 순위가 균등해진다
  const want = Math.floor(rand() * 4);
  const k = Math.min(want, smaller.length, 3);
  const need = 3 - k;
  if (larger.length < need) {
    // 큰 쪽이 부족하면 작은 쪽으로 최대한 채운다 (완전 실패보다 낫다)
    const k2 = Math.min(smaller.length, 3 - larger.length);
    if (k2 + larger.length < 3) return null;
    const chosen = [...smaller.slice(0, k2), ...larger];
    shuffle(chosen, rand);
    return { texts: chosen.map((c) => c.text), rules: chosen.map((c) => c.rule) };
  }

  const chosen = [...smaller.slice(0, k), ...larger.slice(0, need)];
  shuffle(chosen, rand);
  return { texts: chosen.map((c) => c.text), rules: chosen.map((c) => c.rule) };
}
