/**
 * 부트스트랩 (Phase 5).
 *
 * 화면 흐름:  시작 화면 → 플레이 → (일시정지) → 결과 → 시작 화면
 *
 * 완료 기준은 "첫 방문자가 설명 없이 한 판을 끝낼 수 있음"이다.
 * 그래서 학년·무기를 고르지 않아도 기본값으로 바로 시작되고, 조작 안내는
 * 시작 직후 화면에 잠깐 떠 있다가 사라진다.
 */
import './style.css';
import './quiz/quiz.css';
import './vendor/problems.js';
import { Loop, type LoopStats } from './core/loop';
import { Input } from './core/input';
import { makeRng } from './core/rng';
import { Viewport } from './render/viewport';
import { drawEmoji, drawGrid, drawJoystick, circle, ring } from './render/draw';
import { World, type RunEvent } from './game/world';
import { BALANCE as B } from './game/balance';
import { ENEMY_KINDS } from './game/enemies';
import { PICKUP_EMOJI, PICKUP_LABEL } from './game/pickups';
import { PASSIVE_BY_ID } from './game/stats';
import { STARTER_WEAPONS, WEAPON_BY_ID, type WeaponId } from './game/weapons';
import { QuizSelector, type Grade } from './quiz/selector';
import { CardOverlay, QuizOverlay, showAwaken } from './ui/overlays';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import {
  clearRun,
  computeScore,
  loadBest,
  loadRun,
  saveBest,
  saveRun,
  starsFor,
  titleFor,
  type SavedRun,
} from './meta/save';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'game';
app.appendChild(canvas);

const vp = new Viewport(canvas);
const input = new Input(canvas);
const hud = new Hud(app);
hud.applySafeArea(vp.safe);

const quizOverlay = new QuizOverlay(app);
const cardOverlay = new CardOverlay(app);
const screens = new Screens(app);
screens.bestOf = (g) => loadBest()[g];

let grade: Grade = 4;
let starter: WeaponId = STARTER_WEAPONS[0];
let seed = 20260806;

const world = new World(seed, starter);
let selector = new QuizSelector(grade, makeRng(seed));

let stats: LoopStats = { fps: 0, frameMs: 0, droppedFrames: 0 };
let lowPerf = false;
let lowFpsFor = 0;
let banner = { text: '', until: 0 };
let trialCorrect = 0;
/** 'home' 이면 게임 화면을 그리지 않는다 */
let mode: 'home' | 'play' = 'home';
const eventLog: string[] = [];

/* ─────────────────────────── HUD 정지 버튼 ─────────────────────────── */
// ESC 는 키보드에서만 쓸 수 있다. 태블릿에도 정지 수단이 있어야 한다.
const pauseBtn = document.createElement('button');
pauseBtn.className = 'pausebtn';
pauseBtn.textContent = '⏸';
pauseBtn.setAttribute('aria-label', '일시정지');
app.appendChild(pauseBtn);
pauseBtn.addEventListener('click', () => void openPause());

/* ─────────────────────────── 보스 체력바 ─────────────────────────── */
const bossBar = document.createElement('div');
bossBar.className = 'bossbar';
bossBar.innerHTML =
  '<div class="name"></div><div class="track"><div class="fill"></div></div>' +
  '<div class="shield">🛡 방어막 — 문제를 풀어야 깨진다!</div>';
app.appendChild(bossBar);
const bossName = bossBar.querySelector('.name') as HTMLElement;
const bossFill = bossBar.querySelector('.fill') as HTMLElement;

/* ─────────────────────────── 이벤트 ─────────────────────────── */

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
      void showResult(e.reason);
      break;
  }
});

/* ─────────────────────────── 퀴즈 흐름 (직렬화) ─────────────────────────── */

/**
 * 레벨업·보너스·초월 수련·방어막이 **같은 오버레이 하나를 공유**한다.
 * 두 흐름이 겹치면 뒤에 온 쪽이 앞의 DOM 을 덮어써 앞 흐름의 Promise 가
 * 영원히 resolve 되지 않는다. 그래서 하나의 체인에 태워 순서대로 실행한다.
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
      if (queued === 0 && !world.over && mode === 'play') loop.setPaused(false);
    });
  return chain;
}

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
      if (!ok) continue;

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
  });
}

/** 별 몬스터 보너스 문제 — 맞히면 맵 전체 자석 또는 폭탄이 떨어진다 */
async function runBonusFlow() {
  await enqueue(async () => {
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
  await enqueue(async () => {
    trialCorrect = 0;
    for (let i = 0; i < B.transcend.trialQuestions; i++) {
      const quiz = selector.next();
      if (!quiz) break;
      const ok = await quizOverlay.ask(quiz, `🔥 초월 수련 ${i + 1}/${B.transcend.trialQuestions}`);
      selector.grade_(quiz, ok);
      if (ok) trialCorrect++;
    }
    world.addTranscendBonus(trialCorrect);
    banner = { text: `🔥 초월 수련 ${trialCorrect}/${B.transcend.trialQuestions} 성공`, until: world.time + 2.4 };
  });
}

/** 최종보스 방어막 — 맞힐 때까지 문제를 낸다. 틀려도 벌은 없다. */
async function runShieldFlow() {
  await enqueue(async () => {
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

/* ─────────────────────────── 화면 전환 ─────────────────────────── */

async function goHome() {
  mode = 'home';
  loop.setPaused(true);
  bossBar.classList.remove('show');
  const saved = loadRun();
  const r = await screens.start({
    grade,
    starter,
    best: loadBest()[grade],
    canResume: !!saved,
  });
  if (r.action === 'resume' && saved) resumeRun(saved);
  else if (r.action === 'new') startRun(r.grade, r.starter);
  else startRun(grade, starter);
}

function startRun(g: Grade, w: WeaponId) {
  grade = g;
  starter = w;
  seed = Math.floor(Math.random() * 1e9);
  world.reset(seed, starter);
  selector = new QuizSelector(grade, makeRng(seed));
  clearRun();
  mode = 'play';
  banner = { text: '🕹️ 드래그하거나 방향키로 움직이자!', until: 4 };
  loop.setPaused(false);
}

function resumeRun(s: SavedRun) {
  grade = s.grade;
  starter = s.starter as WeaponId;
  seed = s.seed;
  world.reset(seed, starter);
  selector = new QuizSelector(grade, makeRng(seed));
  // 진행도만 복원한다 — 적·투사체는 새로 시작한다
  world.skipTo(s.time);
  world.kills = s.kills;
  world.player.level = s.level;
  world.player.xp = s.xp;
  world.player.maxHp = s.maxHp;
  world.player.hp = s.hp;
  world.weapons.clear();
  for (const [id, lv] of s.weapons) world.weapons.set(id as WeaponId, lv);
  world.passives.clear();
  for (const [id, lv] of s.passives) world.applyUpgrade({ type: 'passive', id, emoji: '', level: lv, isNew: true, text: '' } as never);
  mode = 'play';
  banner = { text: '💾 이어서 시작!', until: world.time + 2.5 };
  loop.setPaused(false);
}

function snapshotRun(): SavedRun {
  return {
    grade,
    starter,
    seed,
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    xp: world.player.xp,
    hp: world.player.hp,
    maxHp: world.player.maxHp,
    weapons: [...world.weapons],
    passives: [...world.passives],
    quizTotal: selector.total,
    quizCorrect: selector.correct,
    savedAt: Date.now(),
  };
}

async function openPause() {
  if (mode !== 'play' || world.over || queued > 0) return;
  loop.setPaused(true);
  const r = await screens.pause({
    time: world.time,
    level: world.player.level,
    kills: world.kills,
    accuracy: selector.accuracy,
    quizTotal: selector.total,
    weapons: [...world.weapons].map(([id, level]) => ({ id, level, emoji: WEAPON_BY_ID.get(id)?.emoji ?? '?' })),
    passives: [...world.passives].map(([id, level]) => ({ id, level, emoji: PASSIVE_BY_ID.get(id)?.emoji ?? '?' })),
  });
  if (r === 'resume') {
    loop.setPaused(false);
  } else {
    // 그만두면 이어할 수 있게 남겨 둔다
    saveRun(snapshotRun());
    void goHome();
  }
}

async function showResult(reason: 'dead' | 'cleared') {
  mode = 'home';
  loop.setPaused(true);
  bossBar.classList.remove('show');
  clearRun();

  const cleared = reason === 'cleared';
  const score = computeScore(world.time, world.kills, world.player.level, selector.accuracy);
  const newBest = saveBest(grade, score);

  const r = await screens.result({
    cleared,
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    accuracy: selector.accuracy,
    score,
    stars: starsFor(world.time, cleared),
    title: titleFor(selector.accuracy),
    newBest,
  });
  if (r === 'retry') startRun(grade, starter);
  else void goHome();
}

/* ─────────────────────────── 루프 ─────────────────────────── */

const loop = new Loop({
  update: (dt) => {
    if (mode === 'play') world.update(dt, input.axis());
  },
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

input.onTap('escape', () => void openPause());

// 백그라운드에서 타이머가 흐르면 태블릿 멀티태스킹 중 억울하게 죽는다
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') {
    loop.setPaused(true);
    saveRun(snapshotRun());
  }
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

  world.gems.forEach((g) => {
    if (!visible(g.x, g.y)) return;
    circle(ctx, vp.toScreenX(g.x), vp.toScreenY(g.y), B.gem.radius * S, g.xp > 1 ? '#ffd54a' : '#5ad1ff');
  });

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

  world.pickups.forEach((it) => {
    if (!visible(it.x, it.y)) return;
    const ix = vp.toScreenX(it.x);
    const iy = vp.toScreenY(it.y) - Math.sin(it.age * 4) * 4;
    ring(ctx, ix, iy, 22 * S, 'rgba(255,255,255,0.35)', 2);
    drawEmoji(ctx, PICKUP_EMOJI[it.kind], ix, iy, 30 * S, vp.dpr);
  });

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
    bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
    bossBar.classList.toggle('shielded', b.shielded);
  }

  const sx = vp.toScreenX(pxPos);
  const sy = vp.toScreenY(pyPos);
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
    ring(ctx, sx, sy, B.player.radius * S + 4, 'rgba(255,120,120,0.9)', 3);
  }
  drawEmoji(ctx, '🦔', sx, sy, B.player.radius * 2.6 * S, vp.dpr);

  const j = input.joystick();
  if (j.active) drawJoystick(ctx, j.ox, j.oy, j.kx, j.ky, j.radius);

  if (banner.text && world.time < banner.until) {
    ctx.save();
    ctx.font = `700 ${Math.round(20 * Math.min(1.4, S + 0.5))}px Pretendard, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const w = ctx.measureText(banner.text).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(vp.width / 2 - w / 2, vp.height * 0.18, w, 38);
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(banner.text, vp.width / 2, vp.height * 0.18 + 26);
    ctx.restore();
  }

  // 홈 화면에서는 HUD 를 숨긴다
  hud.setVisible(mode === 'play');
  pauseBtn.classList.toggle('show', mode === 'play');
  if (mode !== 'play') return;

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
    weapons: [...world.weapons].map(([id, level]) => ({ id, level, emoji: WEAPON_BY_ID.get(id)?.emoji ?? '?' })),
    passives: [...world.passives].map(([id, level]) => ({ id, level, emoji: PASSIVE_BY_ID.get(id)?.emoji ?? '?' })),
  });
}

loop.start();
void goHome();

/* ─────────────────────────── 자동화 계측 훅 ─────────────────────────── */

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
      snapshot: () => Record<string, unknown>;
      setStarter: (id: WeaponId) => void;
      setGrade: (g: Grade) => void;
      quiz: () => { total: number; correct: number; accuracy: number | null; open: boolean };
      grant: (kind: 'weapon' | 'passive', id: string, level: number) => void;
      tryEvolve: () => string | null;
      skipTo: (t: number) => void;
      boss: () => { name: string; hp: number; maxHp: number; shielded: boolean } | null;
      timeFrozen: () => boolean;
      events: () => string[];
      mode: () => string;
      /** 테스트용 — 시작 화면을 건너뛰고 바로 시작 */
      begin: (g?: Grade, w?: WeaponId) => void;
      godMode: (on: boolean) => void;
    };
  }
}

let god = false;
setInterval(() => {
  if (god && mode === 'play' && !world.over) world.player.hp = world.player.maxHp;
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
    pickups: world.pickups.active,
    over: world.over,
    transcended: world.transcended,
    timeFrozen: world.timeFrozen,
    bossActive: world.boss.active,
    mode,
    weapons: [...world.weapons],
    passives: [...world.passives],
  }),
  setStarter: (id) => startRun(grade, id),
  setGrade: (g) => startRun(g, starter),
  quiz: () => ({
    total: selector.total,
    correct: selector.correct,
    accuracy: selector.accuracy,
    open: !!document.querySelector('.quiz-overlay.show'),
  }),
  grant: (kind, id, level) => {
    world.applyUpgrade({ type: kind, id, emoji: '', level, isNew: true, text: '' } as never);
  },
  tryEvolve: () => world.tryEvolve()?.result ?? null,
  skipTo: (t) => world.skipTo(t),
  boss: () =>
    world.boss.active
      ? {
          name: world.boss.def.name,
          hp: Math.round(world.boss.hp),
          maxHp: world.boss.maxHp,
          shielded: world.boss.shielded,
        }
      : null,
  timeFrozen: () => world.timeFrozen,
  events: () => eventLog.slice(),
  mode: () => mode,
  begin: (g = grade, w = starter) => {
    screens.hide();
    startRun(g, w);
  },
  godMode: (on) => {
    god = on;
  },
};
