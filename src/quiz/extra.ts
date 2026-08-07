/**
 * 보완 문제 생성기.
 *
 * 재사용한 `problems.js` 는 **연산 전용**이라 규칙 찾기·자료와 그래프·도형의 이동이 없다.
 * 원작 블랙박스 측정에서 이 세 영역이 실제로 출제되는 것을 확인했으므로 직접 만든다.
 * (작업계획 2.3 "커버리지 공백 — 보완 필요")
 *
 * 이후 **유형을 더 늘렸다.** 출제 빈도를 절반으로 낮추면 한 판에 나오는 문항이 줄어드는데,
 * 유형이 3종뿐이면 남은 문항이 죄다 연산이 되어 오히려 단조로워진다.
 * 적게 내는 대신 **한 문항의 종류가 넓어야** 한다.
 *
 * 학년별로 열리는 유형이 다르다. 3학년에게 평균·백분율을 내면 문제가 아니라 사고다.
 *
 * 출력은 어댑터를 거치지 않고 곧바로 `GameQuiz` 다.
 */
import type { Rng } from '../core/rng';
import type { GameQuiz } from './types';

const LBL = (s: string) => `<span class="t lbl">${s}</span>`;
const ASK = '<span class="blank ask">?</span>';
const expr = (inner: string) => `<span class="expr">${inner}</span>`;

const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

const shuffleInto = (rng: Rng, answer: string, wrongs: string[]) => {
  const texts = [answer, ...wrongs];
  for (let i = texts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [texts[i], texts[j]] = [texts[j], texts[i]];
  }
  return { texts, answer: texts.indexOf(answer) };
};

/**
 * 보기가 모자랄 때 정답 근처의 값으로 채운다.
 *
 * 단위가 붙은 답("12cm²", "3시 05분", "1200원", "45°")도 그대로 다루려고
 * **첫 숫자만** 바꾸고 나머지 문자열은 보존한다.
 * 흔들 폭은 자릿수에 비례시킨다 — 1200원의 오답이 1201원이면 아무도 안 고른다.
 */
function padNumeric(answer: string, taken: Set<string>, need: number): string[] {
  const m = answer.match(/\d+(\.\d+)?/);
  if (!m) return [];
  const v = Number(m[0]);
  const step = Math.max(1, Math.round(Math.abs(v) * 0.1));
  const out: string[] = [];
  for (const d of [step, -step, step * 2, -step * 2, 1, -1, step * 3, -step * 3]) {
    if (out.length >= need) break;
    const nv = v + d;
    if (nv < 0 || nv === v) continue;
    const t = answer.replace(m[0], String(nv));
    if (taken.has(t)) continue;
    taken.add(t);
    out.push(t);
  }
  return out;
}

const wrap = (
  itemId: string,
  itemName: string,
  std: string,
  groupLabel: string,
  promptHtml: string,
  answer: string,
  wrongs: string[],
  rules: string[],
  rng: Rng,
): GameQuiz => {
  /**
   * 오답이 정답과 같거나 서로 겹치면 **똑같은 보기가 두 개** 나오고, 그중 하나는
   * 정답인데 오답으로 채점된다. 생성기 11종마다 따로 막으면 반드시 하나를 빠뜨리므로
   * 여기 한 곳에서 걸러내고 모자란 만큼 채운다.
   * (전수 검사에서 어림하기 196/400, 시간 계산 208/400 이 걸렸다)
   */
  const taken = new Set([answer]);
  const clean: string[] = [];
  for (const w of wrongs) {
    if (taken.has(w)) continue;
    taken.add(w);
    clean.push(w);
  }
  if (clean.length < 3) clean.push(...padNumeric(answer, taken, 3 - clean.length));
  wrongs = clean.slice(0, 3);

  const { texts, answer: idx } = shuffleInto(rng, answer, wrongs);
  const ruleOf = (t: string) => (t === answer ? '정답' : rules[wrongs.indexOf(t)] ?? '오답');
  return {
    itemId,
    groupLabel,
    itemName,
    std,
    promptHtml,
    choices: texts.map((t) => `<span class="t">${t}</span>`),
    choicesText: texts,
    answer: idx,
    form: 'int',
    rules: texts.map(ruleOf),
  };
};

/* ── 규칙 찾기 (등차수열) ── */
function ruleFinding(grade: number, rng: Rng): GameQuiz {
  const step = grade <= 3 ? ri(rng, 2, 9) : ri(rng, 4, 25);
  const start = ri(rng, 3, grade <= 3 ? 20 : 60);
  const seq = [0, 1, 2, 3].map((i) => start + step * i);
  const ans = start + step * 4;
  const html = expr(LBL(`규칙을 찾아라!  ${seq.join(', ')},`) + ASK);
  return wrap(
    'x-rule',
    '규칙 찾기',
    '4수04-01',
    `${grade}학년`,
    html,
    String(ans),
    [String(ans + step), String(ans - step), String(seq[3] + step * 2 + 1)],
    ['한 칸 더 간 값', '마지막 항을 그대로 씀', '규칙을 잘못 읽음'],
    rng,
  );
}

/* ── 자료와 그래프 (막대그래프 읽기) ── */
function barGraph(grade: number, rng: Rng): GameQuiz {
  const unit = [2, 5, 10][ri(rng, 0, 2)];
  const bars = ri(rng, 3, 9);
  const ans = unit * bars;
  const bar = '▉'.repeat(bars);
  const html = expr(
    LBL(`한 칸이 ${unit}명을 나타내는 막대그래프예요.`) +
      `<span class="bar">${bar}</span>` +
      LBL(`막대가 ${bars}칸이면 몇 명일까?`),
  );
  return wrap(
    'x-graph',
    '자료와 그래프',
    '4수05-01',
    `${grade}학년`,
    html,
    String(ans),
    [String(unit + bars), String(ans + unit), String(bars)],
    ['곱하지 않고 더함', '한 칸 더 셈', '칸 수를 그대로 답함'],
    rng,
  );
}

/* ── 도형의 이동 (밀기·뒤집기·돌리기) ── */
const MOVES = [
  { q: '오른쪽으로 3칸 그대로 옮기면', a: '밀기', wrong: ['뒤집기', '돌리기', '늘이기'] },
  { q: '거울에 비친 모습처럼 바꾸면', a: '뒤집기', wrong: ['밀기', '돌리기', '줄이기'] },
  { q: '한 점을 중심으로 방향을 바꾸면', a: '돌리기', wrong: ['밀기', '뒤집기', '옮기기'] },
];

function shapeMove(grade: number, rng: Rng): GameQuiz {
  const m = pick(rng, MOVES);
  const html = expr(LBL(`도형을 ${m.q} 어떤 이동일까?`));
  return wrap(
    'x-move',
    '도형의 이동',
    '4수02-05',
    `${grade}학년`,
    html,
    m.a,
    m.wrong,
    ['다른 이동과 혼동', '다른 이동과 혼동', '이동이 아닌 변형'],
    rng,
  );
}

/* ── 시각과 시간 ── */
const two = (n: number) => String(n).padStart(2, '0');

function timeCalc(grade: number, rng: Rng): GameQuiz {
  const h = ri(rng, 1, 11);
  const m = ri(rng, 0, 11) * 5;
  const addM = ri(rng, 3, 11) * 5 + (grade >= 4 ? ri(rng, 0, 1) * 40 : 0);
  const total = h * 60 + m + addM;
  const ah = Math.floor(total / 60) % 12 || 12;
  const am = total % 60;
  const fmt = (hh: number, mm: number) => `${hh}시 ${two(mm)}분`;
  const html = expr(
    LBL(`${fmt(h, m)}에서 ${addM}분이 지나면 몇 시 몇 분일까?`),
  );
  // 시간을 넘길 때 60분을 못 넘기는 실수, 분만 더하는 실수를 오답으로 쓴다
  const wrongMinOnly = `${h}시 ${two((m + addM) % 60)}분`;
  const wrongNoCarry = `${h}시 ${two(Math.min(59, m + (addM % 60)))}분`;
  const wrongOverHour = fmt((ah % 12) + 1 > 12 ? 1 : ah + 1 > 12 ? 1 : ah + 1, am);
  return wrap(
    'x-time',
    '시각과 시간',
    '3수03-01',
    `${grade}학년`,
    html,
    fmt(ah, am),
    [...new Set([wrongMinOnly, wrongNoCarry, wrongOverHour])].filter((w) => w !== fmt(ah, am)).slice(0, 3),
    ['시를 올리지 않음', '60분을 넘기지 않음', '한 시간 더 셈'],
    rng,
  );
}

/* ── 단위 바꾸기 ── */
const UNITS = [
  { from: 'cm', to: 'mm', mul: 10, max: 40 },
  { from: 'm', to: 'cm', mul: 100, max: 12 },
  { from: 'km', to: 'm', mul: 1000, max: 8 },
  { from: 'kg', to: 'g', mul: 1000, max: 7 },
  { from: 'L', to: 'mL', mul: 1000, max: 6 },
] as const;

function unitConvert(grade: number, rng: Rng): GameQuiz {
  const u = pick(rng, UNITS);
  const n = ri(rng, 2, u.max);
  const ans = n * u.mul;
  const html = expr(LBL(`${n}${u.from} 는 몇 ${u.to} 일까?`));
  return wrap(
    'x-unit',
    '단위 바꾸기',
    '3수03-03',
    `${grade}학년`,
    html,
    `${ans}${u.to}`,
    [`${n * (u.mul / 10)}${u.to}`, `${n * u.mul * 10}${u.to}`, `${n + u.mul}${u.to}`],
    ['0을 하나 덜 붙임', '0을 하나 더 붙임', '곱하지 않고 더함'],
    rng,
  );
}

/* ── 직사각형의 넓이·둘레 ── */
function rectangle(grade: number, rng: Rng): GameQuiz {
  const w = ri(rng, 3, grade >= 5 ? 18 : 12);
  const h = ri(rng, 2, grade >= 5 ? 15 : 9);
  const askArea = rng() < 0.5;
  const area = w * h;
  const peri = (w + h) * 2;
  const html = expr(
    LBL(`가로 ${w}cm, 세로 ${h}cm 인 직사각형의 ${askArea ? '넓이' : '둘레'}는?`),
  );
  return askArea
    ? wrap(
        'x-area',
        '직사각형의 넓이',
        '4수03-05',
        `${grade}학년`,
        html,
        `${area}cm²`,
        [`${peri}cm²`, `${w + h}cm²`, `${area * 2}cm²`],
        ['둘레를 구함', '가로+세로만 함', '두 배로 곱함'],
        rng,
      )
    : wrap(
        'x-area',
        '직사각형의 둘레',
        '4수03-05',
        `${grade}학년`,
        html,
        `${peri}cm`,
        [`${w + h}cm`, `${area}cm`, `${peri + 2}cm`],
        ['두 배를 안 함', '넓이를 구함', '변을 하나 더 셈'],
        rng,
      );
}

/* ── 각의 크기 ── */
function angles(grade: number, rng: Rng): GameQuiz {
  if (rng() < 0.45) {
    // 각의 종류
    const a = ri(rng, 1, 17) * 10;
    const kind = a < 90 ? '예각' : a === 90 ? '직각' : '둔각';
    const html = expr(LBL(`${a}° 인 각은 무슨 각일까?`));
    return wrap(
      'x-angle',
      '각의 종류',
      '4수02-01',
      `${grade}학년`,
      html,
      kind,
      ['예각', '직각', '둔각'].filter((k) => k !== kind).concat('평각').slice(0, 3),
      ['각의 크기를 잘못 읽음', '기준(90°)을 혼동', '없는 분류'],
      rng,
    );
  }
  // 삼각형 세 각의 합
  const a = ri(rng, 2, 12) * 10;
  const b = ri(rng, 2, Math.max(2, Math.floor((170 - a) / 10))) * 10;
  const ans = 180 - a - b;
  const html = expr(LBL(`삼각형의 두 각이 ${a}°, ${b}° 일 때 나머지 한 각은?`));
  return wrap(
    'x-angle',
    '삼각형의 각',
    '4수02-02',
    `${grade}학년`,
    html,
    `${ans}°`,
    [`${360 - a - b}°`, `${a + b}°`, `${Math.abs(90 - a - b)}°`],
    ['360°로 계산함', '두 각을 더함', '90°를 기준으로 함'],
    rng,
  );
}

/* ── 어림하기(반올림) ── */
function rounding(grade: number, rng: Rng): GameQuiz {
  const place = pick(rng, [10, 100, 1000] as const);
  const n = ri(rng, place, place * 90);
  const ans = Math.round(n / place) * place;
  const name = place === 10 ? '십' : place === 100 ? '백' : '천';
  // "십의 자리**에서** 반올림"은 십의 자리 숫자를 보고 올리는 것이라 결과가 백 단위다.
  // Math.round(n/10)*10 은 "십의 자리**까지** 나타내기"다 — 교과서 표현(5수01-04)을 쓴다
  const html = expr(LBL(`${n} 을 반올림하여 ${name}의 자리까지 나타내면?`));
  return wrap(
    'x-round',
    '어림하기',
    '5수01-04',
    `${grade}학년`,
    html,
    String(ans),
    [String(Math.floor(n / place) * place), String(Math.ceil(n / place) * place + place), String(n)],
    ['항상 버림', '항상 올림 후 더 감', '반올림하지 않음'],
    rng,
  );
}

/* ── 평균 ── */
function average(grade: number, rng: Rng): GameQuiz {
  const n = ri(rng, 3, 5);
  const avg = ri(rng, 4, 24);
  const nums: number[] = [];
  let rest = avg * n;
  for (let i = 0; i < n - 1; i++) {
    const v = Math.max(1, Math.min(rest - (n - 1 - i), avg + ri(rng, -4, 4)));
    nums.push(v);
    rest -= v;
  }
  nums.push(rest);
  const sum = nums.reduce((a, b) => a + b, 0);
  const html = expr(LBL(`${nums.join(', ')} 의 평균은?`));
  return wrap(
    'x-avg',
    '평균',
    '5수05-02',
    `${grade}학년`,
    html,
    String(sum / n),
    [String(sum), String(Math.max(...nums)), String(Math.round(sum / (n + 1)))],
    ['나누지 않음', '가장 큰 수를 고름', '개수를 잘못 셈'],
    rng,
  );
}

/* ── 거스름돈 ── */
function change(grade: number, rng: Rng): GameQuiz {
  const paid = pick(rng, [1000, 2000, 5000, 10000] as const);
  const cost = ri(rng, 1, Math.floor(paid / 100) - 1) * 100;
  const ans = paid - cost;
  const html = expr(LBL(`${paid}원으로 ${cost}원짜리 물건을 샀어요. 거스름돈은?`));
  return wrap(
    'x-money',
    '거스름돈',
    '3수01-05',
    `${grade}학년`,
    html,
    `${ans}원`,
    [`${paid + cost}원`, `${Math.abs(cost - ans)}원`, `${ans - 100}원`],
    ['빼지 않고 더함', '뺄셈 방향을 바꿈', '받아내림 실수'],
    rng,
  );
}

/* ── 비율과 백분율 ── */
function percent(grade: number, rng: Rng): GameQuiz {
  const whole = pick(rng, [20, 25, 40, 50, 80, 200] as const);
  const pct = pick(rng, [10, 20, 25, 50, 75] as const);
  const ans = (whole * pct) / 100;
  const html = expr(LBL(`${whole}의 ${pct}% 는 얼마일까?`));
  return wrap(
    'x-percent',
    '백분율',
    '6수04-02',
    `${grade}학년`,
    html,
    String(ans),
    [String(whole - ans), String(pct), String(ans * 10)],
    ['남은 쪽을 구함', '퍼센트를 그대로 씀', '자릿수 실수'],
    rng,
  );
}

export type ExtraGenId =
  | 'x-rule'
  | 'x-graph'
  | 'x-move'
  | 'x-time'
  | 'x-unit'
  | 'x-area'
  | 'x-angle'
  | 'x-round'
  | 'x-avg'
  | 'x-money'
  | 'x-percent';

type Gen = { fn: (grade: number, rng: Rng) => GameQuiz; minGrade: number };

/** 유형별 생성기와 **열리는 학년**. 3학년에게 평균·백분율은 문제가 아니라 사고다 */
const GENS: Record<ExtraGenId, Gen> = {
  'x-rule': { fn: ruleFinding, minGrade: 3 },
  'x-graph': { fn: barGraph, minGrade: 3 },
  'x-move': { fn: shapeMove, minGrade: 3 },
  'x-time': { fn: timeCalc, minGrade: 3 },
  'x-unit': { fn: unitConvert, minGrade: 3 },
  'x-money': { fn: change, minGrade: 3 },
  'x-area': { fn: rectangle, minGrade: 4 },
  'x-angle': { fn: angles, minGrade: 4 },
  'x-round': { fn: rounding, minGrade: 4 },
  'x-avg': { fn: average, minGrade: 5 },
  'x-percent': { fn: percent, minGrade: 6 },
};

export const EXTRA_GENERATORS: Record<ExtraGenId, (grade: number, rng: Rng) => GameQuiz> =
  Object.fromEntries(Object.entries(GENS).map(([k, v]) => [k, v.fn])) as Record<
    ExtraGenId,
    (grade: number, rng: Rng) => GameQuiz
  >;

/** 해당 학년에서 낼 수 있는 유형 목록 */
export function extraIdsFor(grade: number): ExtraGenId[] {
  return (Object.keys(GENS) as ExtraGenId[]).filter((id) => grade >= GENS[id].minGrade);
}

/**
 * 보완 영역 비율.
 *
 * 유형이 3종일 때는 0.25 였다. 유형을 11종으로 늘리고 **출제 문항 수는 절반으로**
 * 줄였으므로, 같은 비율이면 연산 외 영역이 한 판에 두세 번밖에 안 나온다.
 * 연산이 주라는 원칙은 유지하되(과반) 비율을 올린다.
 */
export const EXTRA_RATIO = 0.38;
