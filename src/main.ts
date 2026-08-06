/**
 * Phase 2 부트스트랩 — 전투 코어 확인용 실행 화면.
 *
 * 확인 항목
 *  1. 퀴즈 없이 10분 생존 루프가 끝까지 도는가
 *  2. 무기 6종의 발사 패턴이 의도대로 나오는가
 *  3. 보석 → XP → 레벨업 → 강화 적용 파이프라인이 이어지는가
 *  4. 적 300체에서 60fps가 유지되는가 (Phase 1 기준 유지)
 */
import './style.css';
import './quiz/quiz.css';
import './vendor/problems.js';
import { Loop, type LoopStats } from './core/loop';
import { Input } from './core/input';
import { Viewport } from './render/viewport';
import { drawEmoji, drawGrid, drawJoystick, circle, ring } from './render/draw';
import { World, type RunEvent } from './game/world';
import { PICKUP_EMOJI, PICKUP_LABEL } from './game/pickups';
import { BALANCE as B2 } from './game/balance';
import { ENEMY_KINDS } from './game/enemies';
import { BALANCE as B } from './game/balance';
import { STARTER_WEAPONS, WEAPON_BY_ID, type WeaponId } from './game/weapons';
import { PASSIVE_BY_ID } from './game/stats';
import { Hud } from './ui/hud';
import { QuizSelector, type Grade } from './quiz/selector';
import { CardOverlay, QuizOverlay, showAwaken } from './ui/overlays';
import { makeRng } from './core/rng';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'game';
app.appendChild(canvas);

const vp = new Viewport(canvas);
const input = new Input(canvas);
const hud = new Hud(app);
hud.applySafeArea(vp.safe);

let starter: WeaponId = STARTER_WEAPONS[0];
let grade: Grade = 4;
const world = new World(20260806, starter);
const quizOverlay = new QuizOverlay(app);
const cardOverlay = new CardOverlay(app);
let selector = new QuizSelector(grade, makeRng(20260806));

let stats: LoopStats = { fps: 0, frameMs: 0, droppedFrames: 0 };
let lowPerf = false;
let lowFpsFor = 0;
/** 최근 레벨업 알림 (화면 중앙 배너) */
let banner = { text: '', until: 0 };

let trialCorrect = 0;
/** 검증용 이벤트 로그 */
const eventLog: string[] = [];

world.on((e: RunEvent) => {
  eventLog.push(`${world.time.toFixed(1)} ${e.type}${'id' in e ? ':' + e.id : ''}${'kind' in e ? ':' + e.kind : ''}`);
  switch (e.type) {
    case 'levelup':
      void runLevelUpFlow();
      break;
    case 'awaken':
      banner = { text: `✨ ${e.evolution.result}`, until: world.time + 1.8 };
      break;
    case 'boss':
      bossName.textContent = e.name;
      bossBar.classList.add('show');
      banner = { text: `⚔️ ${e.name} 등장! (타이머 정지)`, until: world.time + 2.4 };
      break;
    case 'bossdown':
      bossBar.classList.remove('show');
      banner = { text: '🎉 보스 격파!', until: world.time + 2 };
      break;
    case 'shield':
      void runShieldFlow();
      break;
    case 'bonus':
      void runBonusFlow();
      break;
    case 'trial':
      void runTrialFlow();
      break;
    case 'transcend':
      banner = { text: '🔥 초월! 힘이 솟아난다', until: world.time + 2.4 };
      break;
    case 'pickup':
      banner = { text: PICKUP_LABEL[e.kind], until: world.time + 1.8 };
      break;
    case 'gameover':
      showResult(e.reason);
      break;
  }
});

/** 별 몬스터 보너스 문제 — 맞히면 맵 전체 자석 또는 폭탄이 떨어진다 */
async function runBonusFlow() {
  await withPaused(async () => {
    const quiz = selector.next();
    if (!quiz) return;
    const ok = await quizOverlay.ask(quiz, '⭐ 보너스 문제! 맞히면 특별 아이템');
    selector.grade_(quiz, ok);
    if (!ok) return;
    const kind = Math.random() < 0.5 ? 'magnet' : 'bomb';
    const a = Math.random() * Math.PI * 2;
    world.dropPickup(kind, world.player.x + Math.cos(a) * 140, world.player.y + Math.sin(a) * 140);
    banner = { text: `${PICKUP_EMOJI[kind]} 아이템 드랍! 주우러 가자`, until: world.time + 2 };
  });
}

/** 초월 수련 — 특별 문제 3개. 맞힌 수만큼 초월이 강해진다. */
async function runTrialFlow() {
  await withPaused(async () => {
    trialCorrect = 0;
    for (let i = 0; i < B2.transcend.trialQuestions; i++) {
      const quiz = selector.next();
      if (!quiz) break;
      const ok = await quizOverlay.ask(quiz, `🔥 초월 수련 ${i + 1}/${B2.transcend.trialQuestions}`);
      selector.grade_(quiz, ok);
      if (ok) trialCorrect++;
    }
    world.addTranscendBonus(trialCorrect);
    banner = { text: `🔥 초월 수련 ${trialCorrect}/${B2.transcend.trialQuestions} 성공`, until: world.time + 2.4 };
  });
}

/** 최종보스 방어막 — 맞힐 때까지 문제를 낸다. 틀려도 벌은 없다. */
async function runShieldFlow() {
  await withPaused(async () => {
    for (let guard = 0; guard < 12; guard++) {
      const quiz = selector.next();
      if (!quiz) break;
      const ok = await quizOverlay.ask(quiz, '🛡 방어막을 깨라!');
      selector.grade_(quiz, ok);
      if (ok) break;
    }
    world.breakShield();
    banner = { text: '💥 방어막이 깨졌다!', until: world.time + 1.6 };
  });
}

/**
 * 퀴즈 흐름 직렬화.
 *
 * 레벨업·보너스·초월 수련·방어막이 **같은 오버레이 하나를 공유**한다.
 * 두 흐름이 겹치면 뒤에 온 쪽이 앞의 DOM 을 덮어써 앞 흐름의 Promise 가
 * 영원히 resolve 되지 않는다(실제로 초월 수련·최종보스 구간이 통째로 사라졌다).
 * 그래서 모든 흐름을 하나의 체인에 태워 순서대로 실행한다.
 */
let chain: Promise<void> = Promise.resolve();
let queued = 0;

function enqueue(fn: () => Promise<void>) {
  queued++;
  chain = chain
    .then(async () => {
      loop.setPaused(true);
      await fn();
    })
    .catch((err) => console.error('[flow]', err))
    .finally(() => {
      queued--;
      if (queued === 0 && !world.over) loop.setPaused(false);
    });
  return chain;
}

/** 이전 이름 유지 — 내부적으로 큐에 넣는다 */
function withPaused(fn: () => Promise<void>) {
  return enqueue(fn);
}

/**
 * 레벨업 처리: **게임을 멈추고** 퀴즈 → (정답이면) 카드 3택 → 각성 판정.
 *
 * 퀴즈가 열려 있는 동안 타이머가 멈추는 것이 이 게임의 핵심 규칙이다.
 * 문제 푸는 시간이 생존 시간을 깎으면 학생은 문제를 대충 찍게 된다
 * (원작 블랙박스 측정 3장에서 확인한 결정).
 */
async function runLevelUpFlow() {
  await enqueue(async () => {
  while (world.pendingLevelUps > 0 && !world.over) {
    world.pendingLevelUps--;

    const quiz = selector.next();
    let ok = true;
    if (quiz) {
      ok = await quizOverlay.ask(quiz);
      selector.grade_(quiz, ok);
    }

    if (ok) {
      const choices = world.rollChoices(3);
      if (choices.length) {
        const picked = await cardOverlay.pick(choices);
        world.applyUpgrade(picked);
        banner = { text: `${picked.emoji} ${picked.id}`, until: world.time + 1.4 };
      }
        // 각성은 정답을 맞힌 뒤에만 판정한다
        const evo = world.tryEvolve();
        if (evo) await showAwaken(app, evo, WEAPON_BY_ID.get(evo.result)?.emoji ?? '✨');
      }
    }
  });
}

/* ── 보스 체력바 ── */
const bossBar = document.createElement('div');
bossBar.className = 'bossbar';
bossBar.innerHTML = `<div class="name"></div><div class="track"><div class="fill"></div></div><div class="shield">🛡 방어막 — 문제를 풀어야 깨진다!</div>`;
app.appendChild(bossBar);
const bossName = bossBar.querySelector('.name') as HTMLElement;
const bossFill = bossBar.querySelector('.fill') as HTMLElement;

/* ── 결과 오버레이 ── */
const result = document.createElement('div');
result.className = 'overlay';
app.appendChild(result);

function showResult(reason: 'dead' | 'cleared') {
  const t = Math.floor(world.time);
  result.innerHTML = `
    <div class="panel">
      <div class="big">${reason === 'cleared' ? '🏆' : '💤'}</div>
      <h2>${reason === 'cleared' ? '10분 생존 성공!' : '여기까지!'}</h2>
      <div class="stat-grid">
        <div><b>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</b><span>생존 시간</span></div>
        <div><b>${world.kills}</b><span>처치 수</span></div>
        <div><b>Lv.${world.player.level}</b><span>최종 레벨</span></div>
        <div><b>${selector.accuracy === null ? '-' : Math.round(selector.accuracy * 100) + '%'}</b><span>정답률</span></div>
      </div>
      <button class="restart">다시 도전!</button>
    </div>`;
  result.classList.add('show');
  result.querySelector('.restart')!.addEventListener('click', restart);
  loop.setPaused(true);
}

function restart() {
  result.classList.remove('show');
  bossBar.classList.remove('show');
  const seed = Math.floor(Math.random() * 1e9);
  world.reset(seed, starter);
  selector = new QuizSelector(grade, makeRng(seed));
  loop.setPaused(false);
}

/* ── 개발용 컨트롤 (Phase 5 정식 UI 로 교체) ── */
const bar = document.createElement('div');
bar.className = 'devbar';
bar.innerHTML =
  STARTER_WEAPONS.map(
    (id) => `<button data-w="${id}" class="${id === starter ? 'on' : ''}">${WEAPON_BY_ID.get(id)!.emoji}</button>`,
  ).join('') +
  ([3, 4, 5, 6] as Grade[])
    .map((g) => `<button data-g="${g}" class="${g === grade ? 'on' : ''}">${g}학년</button>`)
    .join('') +
  `<button data-n="300">적300</button><button data-n="0" class="on">일반</button><button data-pause>⏸</button>`;
app.appendChild(bar);
bar.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('button') as HTMLElement | null;
  if (!el) return;
  if (el.dataset.w) {
    starter = el.dataset.w as WeaponId;
    bar.querySelectorAll('button[data-w]').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
    restart();
  }
  if (el.dataset.g) {
    grade = Number(el.dataset.g) as Grade;
    bar.querySelectorAll('button[data-g]').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
    restart();
  }
  if (el.dataset.n !== undefined) {
    world.stressTarget = Number(el.dataset.n);
    bar.querySelectorAll('button[data-n]').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
  }
  if (el.dataset.pause !== undefined) {
    loop.setPaused(!loop.isPaused);
    el.classList.toggle('on', loop.isPaused);
  }
});

const loop = new Loop({
  update: (dt) => world.update(dt, input.axis()),
  render: (alpha) => render(alpha),
  onStats: (s) => {
    stats = s;
    if (s.fps < B.perf.lowFpsThreshold) {
      lowFpsFor += 1;
      if (lowFpsFor >= B.perf.lowFpsSeconds) lowPerf = true;
    } else {
      lowFpsFor = 0;
    }
  },
});

input.onTap('escape', () => loop.setPaused(!loop.isPaused));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.setPaused(true);
});

/* ─────────────────────────── 렌더 ─────────────────────────── */

function render(alpha: number) {
  const { ctx } = vp;
  vp.begin();

  const p = world.player;
  const pxPos = p.px + (p.x - p.px) * alpha;
  const pyPos = p.py + (p.y - p.py) * alpha;
  if (world.shakeRequest > 0) {
    vp.addShake(world.shakeRequest);
    world.shakeRequest = 0;
  }
  vp.follow(pxPos, pyPos, 1 / 60);

  ctx.fillStyle = '#26331f';
  ctx.fillRect(0, 0, vp.width, vp.height);
  drawGrid(ctx, vp.camX, vp.camY, vp.scale, vp.width, vp.height);

  const cull = vp.viewRadiusWorld + 90;
  const S = vp.scale;
  const visible = (x: number, y: number) => Math.abs(x - vp.camX) < cull && Math.abs(y - vp.camY) < cull;

  // 보석
  world.gems.forEach((g) => {
    if (!visible(g.x, g.y)) return;
    circle(ctx, vp.toScreenX(g.x), vp.toScreenY(g.y), B.gem.radius * S, g.xp > 1 ? '#ffd54a' : '#5ad1ff');
  });

  // 적
  world.enemies.forEach((e) => {
    const ex = e.px + (e.x - e.px) * alpha;
    const ey = e.py + (e.y - e.py) * alpha;
    if (!visible(ex, ey)) return;
    const kind = ENEMY_KINDS[e.kind];
    const sx = vp.toScreenX(ex);
    const sy = vp.toScreenY(ey);
    if (lowPerf) {
      circle(ctx, sx, sy, kind.radius * S, e.flash > 0 ? '#fff' : kind.color);
    } else {
      if (e.flash > 0) circle(ctx, sx, sy, kind.radius * S * 1.15, 'rgba(255,255,255,0.75)');
      drawEmoji(ctx, kind.emoji, sx, sy, kind.radius * 2.2 * S, vp.dpr);
    }
  });

  // 투사체
  world.projectiles.forEach((pr) => {
    if (!visible(pr.x, pr.y)) return;
    const sx = vp.toScreenX(pr.x);
    const sy = vp.toScreenY(pr.y);
    const r = pr.radius * S;
    switch (pr.kind) {
      case 'aura':
        ring(ctx, sx, sy, r, 'rgba(255,255,255,0.65)', Math.max(2, 4 * S));
        break;
      case 'orbit':
        circle(ctx, sx, sy, r, '#9ad7ff');
        ring(ctx, sx, sy, r, 'rgba(255,255,255,0.6)', 2);
        break;
      case 'bolt':
        circle(ctx, sx, sy, r, '#ffd166');
        ring(ctx, sx, sy, r * 1.5, 'rgba(255,209,102,0.45)', 2);
        break;
      case 'cone':
        circle(ctx, sx, sy, r, '#ffe08a');
        break;
      case 'pierce':
        circle(ctx, sx, sy, r, '#b0f0d0');
        break;
      default:
        circle(ctx, sx, sy, r, '#fff2c2');
    }
  });

  // 특수 아이템 (생선·자석·폭탄)
  world.pickups.forEach((it) => {
    if (!visible(it.x, it.y)) return;
    const ix = vp.toScreenX(it.x);
    const iy = vp.toScreenY(it.y) - Math.sin(it.age * 4) * 4; // 살짝 떠 있게
    ring(ctx, ix, iy, 22 * S, 'rgba(255,255,255,0.35)', 2);
    drawEmoji(ctx, PICKUP_EMOJI[it.kind], ix, iy, 30 * S, vp.dpr);
  });

  // 보스
  if (world.boss.active) {
    const b = world.boss;
    const bx = vp.toScreenX(b.px + (b.x - b.px) * alpha);
    const by = vp.toScreenY(b.py + (b.y - b.py) * alpha);
    const br = b.def.radius * S;
    if (b.flash > 0) circle(ctx, bx, by, br * 1.1, 'rgba(255,255,255,0.8)');
    drawEmoji(ctx, b.def.emoji, bx, by, br * 2.1, vp.dpr);
    if (b.shielded) {
      ring(ctx, bx, by, br * 1.25, 'rgba(120,200,255,0.9)', Math.max(3, 5 * S));
      ring(ctx, bx, by, br * 1.45, 'rgba(120,200,255,0.4)', Math.max(2, 3 * S));
    }
  }

  // 플레이어
  const sx = vp.toScreenX(pxPos);
  const sy = vp.toScreenY(pyPos);
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
    ring(ctx, sx, sy, B.player.radius * S + 4, 'rgba(255,120,120,0.9)', 3);
  }
  drawEmoji(ctx, '🦔', sx, sy, B.player.radius * 2.6 * S, vp.dpr);

  // 보스 체력바
  if (world.boss.active) {
    bossFill.style.width = `${Math.max(0, (world.boss.hp / world.boss.maxHp) * 100)}%`;
    bossBar.classList.toggle('shielded', world.boss.shielded);
  }

  // 조이스틱 — 터치·마우스 모두 동일하게 표시
  const j = input.joystick();
  if (j.active) drawJoystick(ctx, j.ox, j.oy, j.kx, j.ky, j.radius);

  // 레벨업 배너
  if (banner.text && world.time < banner.until) {
    ctx.save();
    ctx.font = `700 ${Math.round(20 * Math.min(1.4, S + 0.5))}px Pretendard, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const w = ctx.measureText(banner.text).width + 28;
    ctx.fillRect(vp.width / 2 - w / 2, vp.height * 0.18, w, 38);
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(banner.text, vp.width / 2, vp.height * 0.18 + 26);
    ctx.restore();
  }

  hud.update({
    hp: p.hp,
    maxHp: p.maxHp,
    time: world.time,
    level: p.level,
    xp: p.xp,
    xpNext: p.xpNext,
    kills: world.kills,
    enemies: world.enemies.active,
    fps: stats.fps,
    frameMs: stats.frameMs,
    dpr: vp.dpr,
    lowPerf,
    accuracy: selector.accuracy,
    weapons: [...world.weapons].map(([id, level]) => ({
      id,
      level,
      emoji: WEAPON_BY_ID.get(id)?.emoji ?? '?',
    })),
    passives: [...world.passives].map(([id, level]) => ({
      id,
      level,
      emoji: PASSIVE_BY_ID.get(id)?.emoji ?? '?',
    })),
  });
}

loop.start();

/* 자동화 계측 훅 (Playwright에서 읽는다) */
declare global {
  interface Window {
    __engine: {
      stats: () => LoopStats;
      enemies: () => number;
      setStress: (n: number) => void;
      lowPerf: () => boolean;
      pos: () => { x: number; y: number };
      axis: () => { x: number; y: number };
      joystick: () => { active: boolean; ox: number; oy: number; kx: number; ky: number };
      paused: () => boolean;
      snapshot: () => {
        time: number;
        hp: number;
        maxHp: number;
        level: number;
        kills: number;
        enemies: number;
        projectiles: number;
        gems: number;
        over: string | null;
        transcended: boolean;
        timeFrozen: boolean;
        bossActive: boolean;
        weapons: [string, number][];
        passives: [string, number][];
      };
      setStarter: (id: WeaponId) => void;
      setGrade: (g: Grade) => void;
      quiz: () => { total: number; correct: number; accuracy: number | null; open: boolean };
      /** 테스트용 — 무기/패시브 레벨을 즉시 부여한다 */
      grant: (kind: 'weapon' | 'passive', id: string, level: number) => void;
      /** 테스트용 — 타임라인 큐를 확인하려고 시각을 앞당긴다 */
      skipTo: (t: number) => void;
      events: () => string[];
      boss: () => { active: boolean; name: string; hp: number; maxHp: number; shielded: boolean } | null;
      timeFrozen: () => boolean;
      tryEvolve: () => string | null;
      answer: (correct: boolean) => boolean;
      restart: () => void;
      /** 테스트용 — 무적으로 두고 10분 루프를 끝까지 돌린다 */
      godMode: (on: boolean) => void;
    };
  }
}

let god = false;
setInterval(() => {
  if (god && !world.over) world.player.hp = world.player.maxHp;
}, 100);

window.__engine = {
  stats: () => stats,
  enemies: () => world.enemies.active,
  setStress: (n) => {
    world.stressTarget = n;
  },
  lowPerf: () => lowPerf,
  pos: () => ({ x: world.player.x, y: world.player.y }),
  axis: () => input.axis(),
  joystick: () => {
    const j = input.joystick();
    return { active: j.active, ox: j.ox, oy: j.oy, kx: j.kx, ky: j.ky };
  },
  paused: () => loop.isPaused,
  snapshot: () => ({
    time: world.time,
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    level: world.player.level,
    kills: world.kills,
    enemies: world.enemies.active,
    projectiles: world.projectiles.active,
    gems: world.gems.active,
    over: world.over,
    transcended: world.transcended,
    timeFrozen: world.timeFrozen,
    bossActive: world.boss.active,
    weapons: [...world.weapons],
    passives: [...world.passives],
  }),
  setStarter: (id) => {
    starter = id;
    restart();
  },
  setGrade: (g) => {
    grade = g;
    restart();
  },
  grant: (kind, id, level) => {
    world.applyUpgrade({
      type: kind,
      id,
      emoji: '',
      level,
      isNew: true,
      text: '',
    } as unknown as Parameters<typeof world.applyUpgrade>[0]);
  },
  tryEvolve: () => world.tryEvolve()?.result ?? null,
  skipTo: (t) => world.skipTo(t),
  events: () => eventLog.slice(),
  boss: () =>
    world.boss.active
      ? {
          active: true,
          name: world.boss.def.name,
          hp: Math.round(world.boss.hp),
          maxHp: world.boss.maxHp,
          shielded: world.boss.shielded,
        }
      : null,
  timeFrozen: () => world.timeFrozen,
  quiz: () => ({
    total: selector.total,
    correct: selector.correct,
    accuracy: selector.accuracy,
    open: !!document.querySelector('.quiz-overlay.show'),
  }),
  /** 테스트용 — 열려 있는 퀴즈에 정답/오답으로 응답한다 */
  answer: (correct) => {
    const root = document.querySelector('.quiz-overlay.show');
    if (!root) return false;
    const btns = [...root.querySelectorAll<HTMLButtonElement>('.choice')].filter((b) => !b.disabled);
    if (!btns.length) return false;
    const correctBtn = root.querySelector<HTMLButtonElement>('.choice.correct');
    if (correctBtn) return false;
    // 정답 인덱스는 DOM 에 없으므로 __answerIndex 로 표시해 둔다
    const idx = Number(root.getAttribute('data-answer') ?? '-1');
    const target = correct ? btns.find((b) => Number(b.dataset.i) === idx) : btns.find((b) => Number(b.dataset.i) !== idx);
    (target ?? btns[0]).click();
    return true;
  },
  restart,
  godMode: (on) => {
    god = on;
  },
};
