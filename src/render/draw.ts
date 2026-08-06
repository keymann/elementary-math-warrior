/**
 * 드로잉 유틸 + 스프라이트 캐시.
 *
 * 이모지를 `fillText`로 매 프레임 그리면 폰트 셰이핑 비용이 커서 적 300체에서 바로 무너진다.
 * 한 번만 오프스크린 캔버스에 그려두고 `drawImage`로 복사한다. (원작도 에셋 파일 없이
 * 절차 드로잉 + 이모지로 처리했고, 로딩 없는 즉시 실행은 교실 환경에서 큰 이점이다)
 */

const cache = new Map<string, HTMLCanvasElement>();

/** 이모지를 지정 크기(CSS px)로 프리렌더해 캔버스로 돌려준다. */
export function emojiSprite(char: string, sizeCss: number, dpr: number): HTMLCanvasElement {
  const key = `${char}@${sizeCss}@${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const px = Math.ceil(sizeCss * dpr);
  const cv = document.createElement('canvas');
  // 이모지는 글리프가 박스를 살짝 넘치므로 여유를 준다
  cv.width = px + 8;
  cv.height = px + 8;
  const c = cv.getContext('2d')!;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `${px}px "Apple Color Emoji","Noto Color Emoji",sans-serif`;
  c.fillText(char, cv.width / 2, cv.height / 2);
  cache.set(key, cv);
  return cv;
}

export function drawEmoji(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  sizeCss: number,
  dpr: number,
) {
  const sp = emojiSprite(char, sizeCss, dpr);
  const w = sp.width / dpr;
  const h = sp.height / dpr;
  ctx.drawImage(sp, x - w / 2, y - h / 2, w, h);
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stroke: string,
  width = 2,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * 무한 맵의 바닥 격자. 카메라 위치로 오프셋만 바꿔 그리므로 맵 크기에 제한이 없고
 * 이동감(어디로 얼마나 움직였는지)을 준다.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  scale: number,
  w: number,
  h: number,
  cell = 120,
) {
  const step = cell * scale;
  if (step < 8) return; // 너무 촘촘하면 그리지 않는다 (비용만 든다)

  const offX = (-camX * scale + w / 2) % step;
  const offY = (-camY * scale + h / 2) % step;

  ctx.beginPath();
  for (let x = offX - step; x <= w + step; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = offY - step; y <= h + step; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 플로팅 조이스틱 — 터치·마우스 공통으로 같은 모습을 그린다. */
export function drawJoystick(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  kx: number,
  ky: number,
  radius: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  circle(ctx, ox, oy, radius, 'rgba(255,255,255,0.12)');
  ring(ctx, ox, oy, radius, 'rgba(255,255,255,0.5)', 2);
  ctx.globalAlpha = 0.6;
  circle(ctx, kx, ky, radius * 0.42, 'rgba(255,255,255,0.85)');
  ctx.restore();
}
