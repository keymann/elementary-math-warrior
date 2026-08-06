/**
 * 보완 문제 생성기.
 *
 * 재사용한 `problems.js` 는 **연산 전용**이라 규칙 찾기·자료와 그래프·도형의 이동이 없다.
 * 원작 블랙박스 측정에서 이 세 영역이 실제로 출제되는 것을 확인했으므로 직접 만든다.
 * (작업계획 2.3 "커버리지 공백 — 보완 필요")
 *
 * 출력은 어댑터를 거치지 않고 곧바로 `GameQuiz` 다.
 */
import type { Rng } from '../core/rng';
import type { GameQuiz } from './types';

const LBL = (s: string) => `<span class="t lbl">${s}</span>`;
const ASK = '<span class="blank ask">?</span>';
const expr = (inner: string) => `<span class="expr">${inner}</span>`;

const ri = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

const shuffleInto = (rng: Rng, answer: string, wrongs: string[]) => {
  const texts = [answer, ...wrongs];
  for (let i = texts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [texts[i], texts[j]] = [texts[j], texts[i]];
  }
  return { texts, answer: texts.indexOf(answer) };
};

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
  const m = MOVES[ri(rng, 0, MOVES.length - 1)];
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

export type ExtraGenId = 'x-rule' | 'x-graph' | 'x-move';

export const EXTRA_GENERATORS: Record<ExtraGenId, (grade: number, rng: Rng) => GameQuiz> = {
  'x-rule': ruleFinding,
  'x-graph': barGraph,
  'x-move': shapeMove,
};

/** 학년별로 보완 영역을 얼마나 섞을지 — 연산이 주가 되도록 소수만 */
export const EXTRA_RATIO = 0.25;
