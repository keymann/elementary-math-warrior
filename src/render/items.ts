/**
 * 무기 투사체 · 보석 · 아이템 렌더.
 *
 * 지금까지는 전부 색깔 원이었다. 무기 이름이 연필·컴퍼스·각도기인데 화면에는 동그라미만
 * 날아가면 이름이 아무 의미가 없다. **이름과 같은 형태**로 그린다.
 */
import type { ProjKind } from '../game/projectiles';

type Ctx = CanvasRenderingContext2D;

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
};

/* ─────────────────────────── 무기 투사체 ─────────────────────────── */

/** 연필 — 노란 육각 몸통 + 나무 결 + 흑연심 + 지우개 */
function pencil(ctx: Ctx, len: number, gold = false) {
  const h = len * 0.26;
  rect(ctx, -len / 2, -h / 2, len * 0.16, h, gold ? '#ffb3c1' : '#f28ba0'); // 지우개
  rect(ctx, -len / 2 + len * 0.16, -h / 2, len * 0.06, h, '#c9c9c9'); // 금속 띠
  rect(ctx, -len / 2 + len * 0.22, -h / 2, len * 0.52, h, gold ? '#ffd54a' : '#f2c14e'); // 몸통
  rect(ctx, -len / 2 + len * 0.22, -h / 2, len * 0.52, h * 0.26, gold ? '#fff0a8' : '#f8d97a'); // 하이라이트
  ctx.beginPath(); // 깎인 나무
  ctx.moveTo(len * 0.24, -h / 2);
  ctx.lineTo(len * 0.44, 0);
  ctx.lineTo(len * 0.24, h / 2);
  ctx.closePath();
  ctx.fillStyle = '#e0b489';
  ctx.fill();
  ctx.beginPath(); // 흑연심
  ctx.moveTo(len * 0.38, -h * 0.16);
  ctx.lineTo(len * 0.5, 0);
  ctx.lineTo(len * 0.38, h * 0.16);
  ctx.closePath();
  ctx.fillStyle = gold ? '#6b5b12' : '#3a3a3a';
  ctx.fill();
}

/** 샤프펜슬 — 가느다란 금속 몸통 + 얇은 심 */
function mechPencil(ctx: Ctx, len: number, laser = false) {
  const h = len * 0.14;
  if (laser) {
    ctx.globalAlpha = 0.5;
    rect(ctx, -len * 0.8, -h, len * 1.6, h * 2, '#9be7ff');
    ctx.globalAlpha = 1;
  }
  rect(ctx, -len / 2, -h / 2, len * 0.7, h, laser ? '#8fd8ff' : '#4a6b8a');
  rect(ctx, -len / 2, -h / 2, len * 0.7, h * 0.3, laser ? '#d8f4ff' : '#7aa0c0');
  rect(ctx, len * 0.2, -h * 0.28, len * 0.3, h * 0.56, '#c9c9c9');
  rect(ctx, len * 0.46, -h * 0.14, len * 0.16, h * 0.28, '#2b2b2b');
}

/** 컴퍼스 — 경첩과 두 다리, 한쪽은 바늘 한쪽은 심 */
function compass(ctx: Ctx, r: number, whirl = false) {
  const open = whirl ? 0.85 : 0.6;
  ctx.strokeStyle = whirl ? '#9ad7ff' : '#c0cbd6';
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-r * open, r);
  ctx.moveTo(0, -r);
  ctx.lineTo(r * open, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -r, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = whirl ? '#e3f4ff' : '#8fa3b5';
  ctx.fill();
  rect(ctx, -r * open - r * 0.1, r * 0.8, r * 0.2, r * 0.4, '#3a3a3a'); // 바늘
  rect(ctx, r * open - r * 0.1, r * 0.8, r * 0.2, r * 0.4, '#2b2b2b'); // 심
}

/** 각도기 — 반원 눈금판 조각 */
function protractor(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 224, 138, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#a8823a';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.beginPath(); // 눈금
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (Math.PI / 6) * i;
    ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
  }
  ctx.strokeStyle = '#7a5f28';
  ctx.lineWidth = Math.max(0.8, r * 0.08);
  ctx.stroke();
}

/** 계산기 — 액정과 버튼이 보이는 작은 계산기 */
function calculator(ctx: Ctx, r: number, superMode = false) {
  const w = r * 1.5;
  const h = r * 1.9;
  rect(ctx, -w / 2, -h / 2, w, h, superMode ? '#3d5afe' : '#2f3b46');
  rect(ctx, -w / 2 + r * 0.16, -h / 2 + r * 0.16, w - r * 0.32, h * 0.3, superMode ? '#c9f7ff' : '#9fe8a0');
  const bw = (w - r * 0.5) / 3;
  for (let i = 0; i < 6; i++) {
    const bx = -w / 2 + r * 0.25 + (i % 3) * bw;
    const by = -h / 2 + h * 0.48 + Math.floor(i / 3) * (h * 0.2);
    rect(ctx, bx, by, bw * 0.72, h * 0.14, superMode ? '#ffd54a' : '#5a6b7a');
  }
}

/** 지우개 — 흰·분홍 블록 (파동은 이 색의 고리로 퍼진다) */
function eraserRing(ctx: Ctx, r: number, black = false) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = black ? 'rgba(150,110,220,0.9)' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.stroke();
  // 지우개 가루
  ctx.fillStyle = black ? 'rgba(180,150,255,0.8)' : 'rgba(255,220,225,0.85)';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    ctx.fillRect(Math.cos(a) * r - r * 0.06, Math.sin(a) * r - r * 0.06, r * 0.12, r * 0.12);
  }
}

/**
 * 투사체 하나를 그린다.
 * `owner` 는 어떤 무기가 쏜 것인지 — 이름에 맞는 모양을 고르는 데 쓴다.
 */
export function drawProjectile(
  ctx: Ctx,
  kind: ProjKind,
  owner: string,
  x: number,
  y: number,
  r: number,
  vx: number,
  vy: number,
) {
  ctx.save();
  ctx.translate(x, y);

  switch (owner) {
    case '연필':
    case '황금연필':
      ctx.rotate(Math.atan2(vy, vx));
      pencil(ctx, r * 4.6, owner === '황금연필');
      break;
    case '샤프펜슬':
    case '레이저샤프':
      ctx.rotate(Math.atan2(vy, vx));
      mechPencil(ctx, r * 5.4, owner === '레이저샤프');
      break;
    case '컴퍼스':
    case '회오리컴퍼스':
      ctx.rotate(Math.atan2(vy, vx) + Math.PI / 2);
      compass(ctx, r * 1.15, owner === '회오리컴퍼스');
      break;
    case '각도기':
      ctx.rotate(Math.atan2(vy, vx) + Math.PI / 2);
      protractor(ctx, r * 1.6);
      break;
    case '계산기':
    case '슈퍼계산기':
      ctx.rotate(Math.atan2(vy, vx) * 0.3);
      calculator(ctx, r, owner === '슈퍼계산기');
      break;
    case '지우개':
    case '블랙홀지우개':
      eraserRing(ctx, r, owner === '블랙홀지우개');
      break;
    default:
      // 알 수 없는 무기 — 기본 형태
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = kind === 'aura' ? 'rgba(255,255,255,0.6)' : '#fff2c2';
      ctx.fill();
  }

  ctx.restore();
}

/* ─────────────────────────── 보석 ─────────────────────────── */

/** 경험치 보석 — 깎인 결정. 큰 보석(보스·탱크)은 금색 */
export function drawGem(ctx: Ctx, x: number, y: number, r: number, big: boolean, t: number) {
  const s = 1 + Math.sin(t * 4 + x * 0.05) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.35);
  ctx.lineTo(r, -r * 0.35);
  ctx.lineTo(r * 0.62, r * 1.15);
  ctx.lineTo(-r * 0.62, r * 1.15);
  ctx.lineTo(-r, -r * 0.35);
  ctx.closePath();
  ctx.fillStyle = big ? '#ffd54a' : '#5ad1ff';
  ctx.fill();
  ctx.beginPath(); // 광택 면
  ctx.moveTo(0, -r * 1.35);
  ctx.lineTo(r * 0.35, -r * 0.2);
  ctx.lineTo(-r * 0.35, -r * 0.2);
  ctx.closePath();
  ctx.fillStyle = big ? '#fff2b0' : '#c9f2ff';
  ctx.fill();
  ctx.restore();
}

/* ─────────────────────────── 특수 아이템 ─────────────────────────── */

export function drawPickup(ctx: Ctx, kind: 'fish' | 'magnet' | 'bomb', x: number, y: number, r: number, t: number) {
  const bob = Math.sin(t * 4) * r * 0.18;
  ctx.save();
  ctx.translate(x, y + bob);

  // 눈에 띄게 후광
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.stroke();

  if (kind === 'fish') {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7ec8e3';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.8, 0);
    ctx.lineTo(r * 1.4, -r * 0.5);
    ctx.lineTo(r * 1.4, r * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#5aa7c7';
    ctx.fill();
    rect(ctx, -r * 0.55, -r * 0.16, r * 0.22, r * 0.22, '#1a2b33');
  } else if (kind === 'magnet') {
    // U자 자석
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = '#d7443e';
    ctx.beginPath();
    ctx.arc(0, r * 0.1, r * 0.66, Math.PI, 0);
    ctx.stroke();
    rect(ctx, -r * 0.87, r * 0.1, r * 0.42, r * 0.6, '#d7443e');
    rect(ctx, r * 0.45, r * 0.1, r * 0.42, r * 0.6, '#d7443e');
    rect(ctx, -r * 0.87, r * 0.55, r * 0.42, r * 0.25, '#e8e8e8');
    rect(ctx, r * 0.45, r * 0.55, r * 0.42, r * 0.25, '#e8e8e8');
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.15, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2b33';
    ctx.fill();
    rect(ctx, -r * 0.14, -r * 0.95, r * 0.28, r * 0.5, '#8a6b3a'); // 심지
    ctx.beginPath();
    ctx.arc(0, -r * 1.05, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb454';
    ctx.fill();
  }
  ctx.restore();
}
