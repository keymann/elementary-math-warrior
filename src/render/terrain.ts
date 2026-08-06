/**
 * 단계별 맵 지형.
 *
 * 10분 내내 같은 배경이면 진행감이 없다. 타임라인 구간마다 지형을 바꿔
 * "얼마나 왔는지"를 배경만 보고도 알 수 있게 한다.
 *
 *   0:00~3:00  🌿 햇살 초원
 *   3:00~6:00  🏜 마른 사막
 *   6:00~9:00  ❄️ 눈 덮인 들판
 *   9:00~      🌋 마왕의 땅
 *
 * 타일은 그리지 않고 **화면 크기의 패턴 캔버스를 한 번 만들어 반복**한다.
 * 매 프레임 수백 개 타일을 그리면 저사양 태블릿에서 그대로 프레임을 잡아먹는다.
 */

export type BiomeId = 'grass' | 'desert' | 'snow' | 'demon';

type Biome = {
  id: BiomeId;
  name: string;
  /** 바닥 기본색 */
  base: string;
  /** 격자선 색 */
  grid: string;
  /** 흩뿌리는 장식 색 2종 */
  speck: [string, string];
};

export const BIOMES: Record<BiomeId, Biome> = {
  grass: { id: 'grass', name: '햇살 초원', base: '#26331f', grid: 'rgba(255,255,255,0.06)', speck: ['#3c5a2c', '#4d7038'] },
  desert: { id: 'desert', name: '마른 사막', base: '#3a3323', grid: 'rgba(255,235,180,0.07)', speck: ['#5a4c2e', '#6b5c39'] },
  snow: { id: 'snow', name: '눈 덮인 들판', base: '#2b3540', grid: 'rgba(200,230,255,0.09)', speck: ['#42566a', '#57708a'] },
  demon: { id: 'demon', name: '마왕의 땅', base: '#2a1c2b', grid: 'rgba(255,120,120,0.08)', speck: ['#442540', '#5c2f4e'] },
};

/** 시각(초) → 지형. 타임라인(3·6·9분)과 맞춘다. */
export function biomeAt(time: number): BiomeId {
  if (time < 180) return 'grass';
  if (time < 360) return 'desert';
  if (time < 540) return 'snow';
  return 'demon';
}

/** 전환 진행도 0~1 (경계 앞뒤 6초 동안 서서히 바뀐다) */
const FADE = 6;
export function biomeBlend(time: number): { from: BiomeId; to: BiomeId; t: number } {
  const bounds = [180, 360, 540];
  for (const b of bounds) {
    if (time >= b - FADE && time < b) {
      return { from: biomeAt(b - FADE - 1), to: biomeAt(b), t: (time - (b - FADE)) / FADE };
    }
  }
  const cur = biomeAt(time);
  return { from: cur, to: cur, t: 1 };
}

const TILE = 256;
const patterns = new Map<string, HTMLCanvasElement>();

/** 지형 패턴을 한 번만 만들어 캐시한다 */
function patternFor(b: Biome, dpr: number): HTMLCanvasElement {
  const key = `${b.id}@${dpr}`;
  const hit = patterns.get(key);
  if (hit) return hit;

  const size = TILE * dpr;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;

  c.fillStyle = b.base;
  c.fillRect(0, 0, size, size);

  // 결정적 난수 — 프레임마다 무늬가 튀지 않게 한다
  let seed = b.id.charCodeAt(0) * 7919;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const s = (2 + rnd() * 5) * dpr;
    c.fillStyle = b.speck[rnd() < 0.5 ? 0 : 1];
    c.fillRect(x, y, s, s);
  }

  patterns.set(key, cv);
  return cv;
}

/**
 * 배경을 그린다. 전환 구간에서는 두 지형을 겹쳐 서서히 바꾼다.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  time: number,
  camX: number,
  camY: number,
  scale: number,
  w: number,
  h: number,
  dpr: number,
) {
  const { from, to, t } = biomeBlend(time);
  const layer = (b: Biome, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    const pat = ctx.createPattern(patternFor(b, dpr), 'repeat')!;
    const step = TILE * scale;
    // 카메라만큼 밀어서 무한 스크롤처럼 보이게 한다
    const ox = ((-camX * scale + w / 2) % step + step) % step;
    const oy = ((-camY * scale + h / 2) % step + step) % step;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (ox - step) * dpr, (oy - step) * dpr);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, (w + step * 2) / scale, (h + step * 2) / scale);
    ctx.restore();
  };

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BIOMES[from].base;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  layer(BIOMES[from], 1);
  if (from !== to) layer(BIOMES[to], t);

  // 격자 — 이동감을 준다
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 120 * scale;
  if (cell >= 8) {
    const offX = ((-camX * scale + w / 2) % cell + cell) % cell;
    const offY = ((-camY * scale + h / 2) % cell + cell) % cell;
    ctx.beginPath();
    for (let x = offX - cell; x <= w + cell; x += cell) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = offY - cell; y <= h + cell; y += cell) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.strokeStyle = from === to ? BIOMES[from].grid : BIOMES[to].grid;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
