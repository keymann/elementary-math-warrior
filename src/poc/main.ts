/**
 * 어댑터 PoC — distractor 품질을 눈으로 확인하기 위한 검수 페이지.
 *
 * 확인 목표
 *  1. 75개 유형 전부에서 4지선다 변환이 되는가 (실패 유형 색출)
 *  2. 오답이 "그럴듯한 실수"로 보이는가 (규칙 라벨을 함께 표시)
 *  3. 찍기로 못 맞히는가 — 정답 위치 분포, 최댓값/최솟값 편향 측정
 */
import '../vendor/problems.js';
import { makeQuizzes } from '../quiz/adapter';
import type { AdaptFailure, GameQuiz } from '../quiz/types';
import './poc.css';

const SAMPLES_PER_ITEM = 3;
const STAT_SAMPLES_PER_ITEM = 40;

/* ───────── 지표 계산 ───────── */

/** 보기 평문을 수치로. 편향 측정용(분수·대분수·몫…나머지 포함). */
function numeric(text: string): number | null {
  const mixed = text.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = text.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const qr = text.match(/^(-?\d+)…(-?[\d.]+)$/);
  if (qr) return +qr[1] + +qr[2] / 1000;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

type Stats = {
  total: number;
  posCount: number[];
  isMax: number;
  isMin: number;
  dupChoices: number;
  ruleCount: Map<string, number>;
};

function emptyStats(): Stats {
  return { total: 0, posCount: [0, 0, 0, 0], isMax: 0, isMin: 0, dupChoices: 0, ruleCount: new Map() };
}

function accumulate(st: Stats, q: GameQuiz) {
  st.total++;
  st.posCount[q.answer]++;
  if (new Set(q.choicesText).size !== q.choicesText.length) st.dupChoices++;

  const vals = q.choicesText.map(numeric);
  if (vals.every((v) => v !== null)) {
    const nums = vals as number[];
    const a = nums[q.answer];
    if (a === Math.max(...nums)) st.isMax++;
    if (a === Math.min(...nums)) st.isMin++;
  }
  q.rules.forEach((r, i) => {
    if (i === q.answer) return;
    st.ruleCount.set(r, (st.ruleCount.get(r) ?? 0) + 1);
  });
}

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) + '%' : '–');

/* ───────── 렌더 ───────── */

function quizCard(q: GameQuiz): string {
  const choices = q.choices
    .map((html, i) => {
      const ok = i === q.answer;
      return `<li class="choice ${ok ? 'ok' : ''}">
        <span class="cnum">${i + 1}</span>
        <span class="cval">${html}</span>
        <span class="crule">${ok ? '정답' : q.rules[i]}</span>
      </li>`;
    })
    .join('');
  return `<article class="card">
    <div class="prompt">${q.promptHtml}</div>
    <ul class="choices">${choices}</ul>
  </article>`;
}

function main() {
  const app = document.getElementById('app')!;
  const groups = window.Curriculum.GROUPS;

  const overall = emptyStats();
  const failures: AdaptFailure[] = [];
  const itemRows: string[] = [];
  const sections: string[] = [];

  for (const g of groups) {
    const cards: string[] = [];
    for (const item of g.items) {
      // 눈으로 볼 샘플
      const shown = makeQuizzes(item.id, SAMPLES_PER_ITEM);
      // 지표용 대량 샘플
      const bulk = makeQuizzes(item.id, STAT_SAMPLES_PER_ITEM);

      const st = emptyStats();
      bulk.quizzes.forEach((q) => {
        accumulate(st, q);
        accumulate(overall, q);
      });
      failures.push(...shown.failures, ...bulk.failures);

      const okRate = bulk.quizzes.length / STAT_SAMPLES_PER_ITEM;
      const flag = okRate < 0.9 ? 'bad' : okRate < 1 ? 'warn' : 'good';
      itemRows.push(
        `<tr class="${flag}"><td>${g.label}</td><td>${item.name}</td><td>${item.std || '–'}</td>
         <td>${bulk.quizzes.length}/${STAT_SAMPLES_PER_ITEM}</td>
         <td>${st.total ? pct(st.isMax, st.total) : '–'}</td>
         <td>${bulk.failures.length ? bulk.failures[0].reason : ''}</td></tr>`,
      );

      if (shown.quizzes.length) {
        cards.push(
          `<div class="item">
             <h3>${item.name} <small>${item.std || ''}</small></h3>
             <div class="cards">${shown.quizzes.map(quizCard).join('')}</div>
           </div>`,
        );
      } else {
        cards.push(
          `<div class="item fail"><h3>${item.name}</h3>
           <p class="failmsg">변환 실패: ${shown.failures[0]?.reason ?? '샘플 없음'}</p></div>`,
        );
      }
    }
    sections.push(`<section><h2>${g.label}</h2>${cards.join('')}</section>`);
  }

  const posDist = overall.posCount.map((c) => pct(c, overall.total)).join(' / ');
  const topRules = [...overall.ruleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `<li><span>${r}</span><b>${pct(c, overall.total * 3)}</b></li>`)
    .join('');

  const summary = `
    <div class="summary">
      <h2>품질 지표</h2>
      <div class="kpis">
        <div class="kpi"><b>${overall.total}</b><span>변환 성공 문항</span></div>
        <div class="kpi"><b>${failures.length}</b><span>변환 실패</span></div>
        <div class="kpi ${Math.abs(overall.isMax / overall.total - 0.25) > 0.1 ? 'bad' : 'good'}">
          <b>${pct(overall.isMax, overall.total)}</b><span>정답이 최댓값 <i>(목표 25%)</i></span></div>
        <div class="kpi ${Math.abs(overall.isMin / overall.total - 0.25) > 0.1 ? 'bad' : 'good'}">
          <b>${pct(overall.isMin, overall.total)}</b><span>정답이 최솟값 <i>(목표 25%)</i></span></div>
        <div class="kpi ${overall.dupChoices ? 'bad' : 'good'}">
          <b>${overall.dupChoices}</b><span>보기 중복 <i>(목표 0)</i></span></div>
      </div>
      <p class="posdist">정답 위치 분포 (1/2/3/4): <b>${posDist}</b> <i>— 목표 각 25%</i></p>
      <details><summary>오답 규칙 분포 (전체 오답 대비)</summary><ul class="rules">${topRules}</ul></details>
      ${
        failures.length
          ? `<details open><summary>변환 실패 ${failures.length}건</summary><ul class="fails">${[
              ...new Map(failures.map((f) => [f.itemId + f.reason, f])).values(),
            ]
              .map((f) => `<li><code>${f.itemId}</code> ${f.reason}</li>`)
              .join('')}</ul></details>`
          : ''
      }
      <details><summary>유형별 표 (${itemRows.length}종)</summary>
        <div class="tablewrap"><table>
          <thead><tr><th>학기</th><th>유형</th><th>성취기준</th><th>변환</th><th>최댓값비율</th><th>실패사유</th></tr></thead>
          <tbody>${itemRows.join('')}</tbody>
        </table></div>
      </details>
    </div>`;

  app.innerHTML = summary + sections.join('');
}

main();
