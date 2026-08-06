/**
 * 배치 시뮬레이션 — 작업계획 4장의 목표 지표를 재는 도구.
 *
 *   클리어율 35~50%  ·  레벨업 15~20회  ·  무기별 편차 ±10%p  ·  각성 도달률 70%+
 *   첫 사망 4~6분(미숙련)
 *
 * 사용:  npm run sim -- [runs=60] [seconds=900]
 */
import { STARTER_WEAPONS, type WeaponId } from '../game/weapons';
import { runOnce, type RunResult } from './run';

/**
 * 실력·정답률 조합 — 한 반의 분포를 흉내 낸다.
 *
 * ⚠️ **이 프로필은 아직 사람 데이터로 보정되지 않았다.**
 * skill 0.3 은 이동 방향 오차가 ±126° 라 사실상 무작위 보행이었고, 실제 초보 학생도
 * 눈앞의 몬스터는 피한다. 그래서 미숙련을 0.45 로 잡았다.
 * 교실 파일럿에서 실제 생존 시간 분포를 받아 이 값을 다시 맞춰야 한다.
 */
const PROFILES = [
  { name: '미숙련', skill: 0.45, accuracy: 0.6 },
  { name: '보통', skill: 0.65, accuracy: 0.8 },
  { name: '숙련', skill: 0.9, accuracy: 0.95 },
];

type Agg = {
  n: number;
  cleared: number;
  timeSum: number;
  levelSum: number;
  levelUpSum: number;
  killSum: number;
  evolvedRuns: number;
  /** 6분 이상 생존한 판 (각성을 볼 기회가 있었던 판) */
  longRuns: number;
  longEvolved: number;
  deaths: number[];
};

const emptyAgg = (): Agg => ({
  n: 0, cleared: 0, timeSum: 0, levelSum: 0, levelUpSum: 0, killSum: 0,
  evolvedRuns: 0, longRuns: 0, longEvolved: 0, deaths: [],
});

/** 각성을 볼 기회가 있었다고 보는 최소 생존 시간(초) */
const LONG_RUN_SEC = 360;

function add(a: Agg, r: RunResult) {
  a.n++;
  if (r.cleared) a.cleared++;
  else a.deaths.push(r.time);
  a.timeSum += r.time;
  a.levelSum += r.level;
  a.levelUpSum += r.levelUps;
  a.killSum += r.kills;
  if (r.evolved.length) a.evolvedRuns++;
  if (r.time >= LONG_RUN_SEC) {
    a.longRuns++;
    if (r.evolved.length) a.longEvolved++;
  }
}

const pct = (x: number, n: number) => (n ? ((x / n) * 100).toFixed(1) + '%' : '-');
const avg = (x: number, n: number) => (n ? (x / n).toFixed(1) : '-');
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function runBatch(runsPerCell: number, maxSeconds: number) {
  const byWeapon = new Map<WeaponId, Agg>();
  const byProfile = new Map<string, Agg>();
  const all = emptyAgg();
  const t0 = Date.now();
  let totalSteps = 0;

  for (const w of STARTER_WEAPONS) {
    byWeapon.set(w, emptyAgg());
    for (const p of PROFILES) {
      if (!byProfile.has(p.name)) byProfile.set(p.name, emptyAgg());
      for (let i = 0; i < runsPerCell; i++) {
        const seed = (STARTER_WEAPONS.indexOf(w) * 1e6 + PROFILES.indexOf(p) * 1e4 + i) >>> 0;
        const r = runOnce({ seed, starter: w, accuracy: p.accuracy, skill: p.skill, maxSeconds });
        totalSteps += r.steps;
        add(byWeapon.get(w)!, r);
        add(byProfile.get(p.name)!, r);
        add(all, r);
      }
    }
  }

  const elapsed = (Date.now() - t0) / 1000;
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push(`■ 배치 결과 — ${all.n}판 (셀당 ${runsPerCell}판), ${elapsed.toFixed(1)}초 소요`);
  push(`  실시간 대비 ${((all.timeSum / elapsed) | 0).toLocaleString()}배속 · 총 ${totalSteps.toLocaleString()} 스텝`);
  push();

  push('■ 목표 지표');
  const clearRate = (all.cleared / all.n) * 100;
  const lvUps = all.levelUpSum / all.n;
  const evoRate = (all.evolvedRuns / all.n) * 100;
  const firstDeath = median(byProfile.get('미숙련')!.deaths);
  const ok = (b: boolean) => (b ? '✅' : '⚠️');
  push(`  ${ok(clearRate >= 35 && clearRate <= 50)} 클리어율        ${clearRate.toFixed(1)}%   (목표 35~50%)`);
  push(`  ${ok(lvUps >= 15 && lvUps <= 20)} 레벨업 횟수     ${lvUps.toFixed(1)}회  (목표 15~20)`);
  const evoLong = all.longRuns ? (all.longEvolved / all.longRuns) * 100 : 0;
  push(`  ${ok(evoLong >= 70)} 각성 도달률     ${evoLong.toFixed(1)}%   (6분 이상 생존 ${all.longRuns}판 기준, 목표 70%+)`);
  push(`     └ 참고: 전체 판 기준 ${evoRate.toFixed(1)}% — 조기 사망 판이 섞여 해석하기 어렵다`);
  push(`  ⏳ 미숙련 첫 사망  ${mmss(firstDeath)}  (파일럿 보정 전까지 판정 보류)`);
  push();

  push('■ 무기별');
  push('  무기            판수   클리어율   평균생존   평균Lv  각성률');
  const rates: number[] = [];
  for (const [w, a] of byWeapon) {
    const cr = (a.cleared / a.n) * 100;
    rates.push(cr);
    push(
      `  ${w.padEnd(12)} ${String(a.n).padStart(5)}   ${pct(a.cleared, a.n).padStart(7)}   ` +
        `${mmss(a.timeSum / a.n).padStart(7)}   ${avg(a.levelSum, a.n).padStart(5)}  ${pct(a.evolvedRuns, a.n).padStart(6)}`,
    );
  }
  const spread = Math.max(...rates) - Math.min(...rates);
  push(`  ${ok(spread <= 20)} 무기별 클리어율 편차 ${spread.toFixed(1)}%p (목표 20%p 이내 = ±10%p)`);
  push();

  push('■ 실력 프로필별');
  push('  프로필     판수   클리어율   평균생존   중앙 사망시각   평균Lv');
  for (const [name, a] of byProfile) {
    push(
      `  ${name.padEnd(8)} ${String(a.n).padStart(5)}   ${pct(a.cleared, a.n).padStart(7)}   ` +
        `${mmss(a.timeSum / a.n).padStart(7)}   ${mmss(median(a.deaths)).padStart(11)}   ${avg(a.levelSum, a.n).padStart(5)}`,
    );
  }

  return { text: lines.join('\n'), clearRate, lvUps, evoRate, firstDeath, spread };
}

/* ── CLI ── */
const args = process.argv.slice(2);
const num = (k: string, d: number) => {
  const hit = args.find((a: string) => a.startsWith(k + '='));
  return hit ? Number(hit.split('=')[1]) : d;
};
console.log(runBatch(num('runs', 15), num('seconds', 900)).text);
