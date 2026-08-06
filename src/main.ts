/**
 * Phase 1 부트스트랩 — 엔진 골격 확인용 실행 화면.
 *
 * 확인 항목
 *  1. 고정 타임스텝 루프가 프레임률과 무관하게 같은 속도로 도는가
 *  2. 키보드 / 터치 / 마우스가 하나의 조작으로 합쳐지는가
 *  3. 적 300체에서 60fps가 나오는가
 */
import './style.css';
import { Loop, type LoopStats } from './core/loop';
import { Input } from './core/input';
import { Viewport } from './render/viewport';
import { drawEmoji, drawGrid, drawJoystick, circle, ring } from './render/draw';
import { World } from './game/world';
import { BALANCE as B } from './game/balance';
import { Hud } from './ui/hud';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
canvas.id = 'game';
app.appendChild(canvas);

const vp = new Viewport(canvas);
const input = new Input(canvas);
const world = new World(20260806);
const hud = new Hud(app);
hud.applySafeArea(vp.safe);

let stats: LoopStats = { fps: 0, frameMs: 0, droppedFrames: 0 };
let lowPerf = false;
let lowFpsFor = 0;

// ── 개발용 컨트롤 (Phase 2에서 제거)
const bar = document.createElement('div');
bar.className = 'devbar';
bar.innerHTML = `
  <button data-n="0">일반 스폰</button>
  <button data-n="100">적 100</button>
  <button data-n="300">적 300</button>
  <button data-n="600">적 600</button>
  <button data-pause>일시정지</button>
`;
app.appendChild(bar);
bar.addEventListener('click', (e) => {
  const el = e.target as HTMLElement;
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
    // 저사양 자동 전환 — 교실 보급형 태블릿에서 끊기느니 이펙트를 줄인다
    if (s.fps < B.perf.lowFpsThreshold) {
      lowFpsFor += 1;
      if (lowFpsFor >= B.perf.lowFpsSeconds) lowPerf = true;
    } else {
      lowFpsFor = 0;
    }
  },
});

input.onTap('escape', () => loop.setPaused(!loop.isPaused));

// 백그라운드에서 타이머가 흐르면 태블릿 멀티태스킹 중 억울하게 죽는다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loop.setPaused(true);
});

function render(alpha: number) {
  const { ctx } = vp;
  vp.begin();

  const p = world.player;
  const pxPos = p.px + (p.x - p.px) * alpha;
  const pyPos = p.py + (p.y - p.py) * alpha;
  vp.follow(pxPos, pyPos, 1 / 60);

  ctx.fillStyle = '#26331f';
  ctx.fillRect(0, 0, vp.width, vp.height);
  drawGrid(ctx, vp.camX, vp.camY, vp.scale, vp.width, vp.height);

  const cull = vp.viewRadiusWorld + 80;
  const er = B.enemy.radius * vp.scale;

  // 적: 저사양 모드에서는 이모지 대신 단색 원 (드로우콜·셰이핑 비용 절감)
  world.enemies.forEach((e) => {
    const ex = e.px + (e.x - e.px) * alpha;
    const ey = e.py + (e.y - e.py) * alpha;
    if (Math.abs(ex - vp.camX) > cull || Math.abs(ey - vp.camY) > cull) return;
    const sx = vp.toScreenX(ex);
    const sy = vp.toScreenY(ey);
    if (lowPerf) circle(ctx, sx, sy, er, '#c2554a');
    else drawEmoji(ctx, '👾', sx, sy, er * 2.2, vp.dpr);
  });

  // 플레이어
  const sx = vp.toScreenX(pxPos);
  const sy = vp.toScreenY(pyPos);
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) {
    ring(ctx, sx, sy, B.player.radius * vp.scale + 4, 'rgba(255,120,120,0.9)', 3);
  }
  drawEmoji(ctx, '🦔', sx, sy, B.player.radius * 2.6 * vp.scale, vp.dpr);

  // 조이스틱 — 터치·마우스 모두 동일하게 표시
  const j = input.joystick();
  if (j.active) drawJoystick(ctx, j.ox, j.oy, j.kx, j.ky, j.radius);

  hud.update({
    hp: p.hp,
    maxHp: p.maxHp,
    time: world.time,
    enemies: world.enemies.active,
    fps: stats.fps,
    frameMs: stats.frameMs,
    dpr: vp.dpr,
    lowPerf,
  });
}

loop.start();

// 성능 측정 자동화용 훅 (Playwright에서 읽는다)
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
    };
  }
}
window.__engine = {
  stats: () => stats,
  enemies: () => world.enemies.active,
  setStress: (n: number) => {
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
};
