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

world.on((e: RunEvent) => {
  if (e.type === 'levelup') void runLevelUpFlow();
  else if (e.type === 'awaken') banner = { text: `✨ ${e.evolution.result}`, until: world.time + 1.8 };
  else showResult(e.reason);
});

/**
 * 레벨업 처리: **게임을 멈추고** 퀴즈 → (정답이면) 카드 3택 → 각성 판정.
 *
 * 퀴즈가 열려 있는 동안 타이머가 멈추는 것이 이 게임의 핵심 규칙이다.
 * 문제 푸는 시간이 생존 시간을 깎으면 학생은 문제를 대충 찍게 된다
 * (원작 블랙박스 측정 3장에서 확인한 결정).
 */
let flowRunning = false;
async function runLevelUpFlow() {
  if (flowRunning) return; // 여러 레벨이 한꺼번에 올라도 순차 처리
  flowRunning = true;
  loop.setPaused(true);

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

  flowRunning = false;
  if (!world.over) loop.setPaused(false);
}

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

  // 플레이어
  const sx = vp.toScreenX(pxPos);
  const sy = vp.toScreenY(pyPos);
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
    ring(ctx, sx, sy, B.player.radius * S + 4, 'rgba(255,120,120,0.9)', 3);
  }
  drawEmoji(ctx, '🦔', sx, sy, B.player.radius * 2.6 * S, vp.dpr);

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
        weapons: [string, number][];
        passives: [string, number][];
      };
      setStarter: (id: WeaponId) => void;
      setGrade: (g: Grade) => void;
      quiz: () => { total: number; correct: number; accuracy: number | null; open: boolean };
      /** 테스트용 — 무기/패시브 레벨을 즉시 부여한다 */
      grant: (kind: 'weapon' | 'passive', id: string, level: number) => void;
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
