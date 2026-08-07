/**
 * 단계별 맵 지형 — 5개 구간.
 *
 * 10분 내내 같은 배경이면 진행감이 없다. 2분마다 지형이 바뀌어
 * "얼마나 왔는지"를 배경만 보고도 알 수 있게 한다.
 *
 *   0:00~2:00  🌲 숲 지형
 *   2:00~4:00  🏜 사막 지형
 *   4:00~6:00  🪨 현무암 지대
 *   6:00~8:00  🌋 용암 지대
 *   8:00~      ☁️ 하늘 지대
 *
 * 타일을 매 프레임 수백 개 그리면 저사양 태블릿에서 그대로 프레임을 잡아먹는다.
 * **패턴 캔버스를 한 번 구워 반복**한다.
 */

export type BiomeId = 'forest' | 'desert' | 'basalt' | 'lava' | 'sky';

type Biome = {
  id: BiomeId;
  name: string;
  /** 바닥 기본색 */
  base: string;
  /** 격자선 색 */
  grid: string;
};

export const BIOMES: Record<BiomeId, Biome> = {
  forest: { id: 'forest', name: '숲 지형', base: '#1e2e19', grid: 'rgba(255,255,255,0.06)' },
  desert: { id: 'desert', name: '사막 지형', base: '#3d3524', grid: 'rgba(255,235,180,0.07)' },
  basalt: { id: 'basalt', name: '현무암 지대', base: '#22232a', grid: 'rgba(190,200,220,0.07)' },
  lava: { id: 'lava', name: '용암 지대', base: '#2a1610', grid: 'rgba(255,140,80,0.09)' },
  sky: { id: 'sky', name: '하늘 지대', base: '#243a55', grid: 'rgba(200,230,255,0.10)' },
};

/** 구간 경계(초) — 2분 간격 */
const BOUNDS = [120, 240, 360, 480];
const ORDER: BiomeId[] = ['forest', 'desert', 'basalt', 'lava', 'sky'];

export function biomeAt(time: number): BiomeId {
  return ORDER[roundAt(time)];
}

/**
 * 현재 라운드 번호(0~4). 지형 구간과 **같은 경계**를 쓴다.
 * 난이도 계단과 배경 전환이 어긋나면 학생이 "왜 갑자기 어려워졌는지" 알 수 없다.
 */
export function roundAt(time: number): number {
  for (let i = 0; i < BOUNDS.length; i++) if (time < BOUNDS[i]) return i;
  return ORDER.length - 1;
}

/** 경계 앞뒤 6초 동안 서서히 바뀐다 */
const FADE = 6;
export function biomeBlend(time: number): { from: BiomeId; to: BiomeId; t: number } {
  for (const b of BOUNDS) {
    if (time >= b - FADE && time < b) {
      return { from: biomeAt(b - FADE - 1), to: biomeAt(b), t: (time - (b - FADE)) / FADE };
    }
  }
  const cur = biomeAt(time);
  return { from: cur, to: cur, t: 1 };
}

const TILE = 384; // 반복 주기를 넓혀 타일 이음새를 덜 보이게 한다
const patterns = new Map<string, HTMLCanvasElement>();

/** 결정적 난수 — 프레임마다 무늬가 튀지 않게 한다 */
function makeRnd(seedStr: string) {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** 지형별 무늬. 색만 다른 게 아니라 **형태가 달라야** 한눈에 구분된다. */
function paintBiome(c: CanvasRenderingContext2D, b: Biome, size: number, dpr: number) {
  const rnd = makeRnd(b.id);
  c.fillStyle = b.base;
  c.fillRect(0, 0, size, size);

  const S = (v: number) => v * dpr;

  switch (b.id) {
    case 'forest': {
      // 덤불과 나무 — 둥근 잎 뭉치
      for (let i = 0; i < 26; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        const r = S(6 + rnd() * 12);
        c.fillStyle = rnd() < 0.5 ? '#2f4a26' : '#3b5c2e';
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.arc(x + r * 0.7, y - r * 0.4, r * 0.75, 0, Math.PI * 2);
        c.fill();
      }
      // 풀포기
      c.strokeStyle = '#4a7038';
      c.lineWidth = S(1.5);
      for (let i = 0; i < 40; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + S(2), y - S(5));
        c.stroke();
      }
      break;
    }
    case 'desert': {
      // 모래 언덕 — 가로로 흐르는 곡선
      c.strokeStyle = '#544728';
      c.lineWidth = S(3);
      for (let i = 0; i < 10; i++) {
        const y = rnd() * size;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(size * 0.3, y - S(10), size * 0.7, y + S(10), size, y);
        c.stroke();
      }
      // 자갈
      for (let i = 0; i < 60; i++) {
        c.fillStyle = rnd() < 0.5 ? '#5f5231' : '#6d5f3a';
        c.fillRect(rnd() * size, rnd() * size, S(2 + rnd() * 3), S(2));
      }
      break;
    }
    case 'basalt': {
      // 주상절리 — 육각 기둥
      const hex = S(26);
      for (let row = -1; row * hex * 0.86 < size + hex; row++) {
        for (let col = -1; col * hex * 1.5 < size + hex; col++) {
          const x = col * hex * 1.5;
          const y = row * hex * 1.72 + (col % 2 ? hex * 0.86 : 0);
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k;
            const px = x + Math.cos(a) * hex;
            const py = y + Math.sin(a) * hex;
            k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
          }
          c.closePath();
          c.fillStyle = rnd() < 0.5 ? '#2a2b33' : '#31333d';
          c.fill();
          c.strokeStyle = '#15161b';
          c.lineWidth = S(1.5);
          c.stroke();
        }
      }
      break;
    }
    case 'lava': {
      // 굳은 용암 바닥 + 갈라진 틈에서 새어나오는 빛
      for (let i = 0; i < 22; i++) {
        c.fillStyle = rnd() < 0.5 ? '#33201a' : '#3d2620';
        const x = rnd() * size;
        const y = rnd() * size;
        c.fillRect(x, y, S(14 + rnd() * 26), S(10 + rnd() * 18));
      }
      // 균열 — 타일 경계에서 잘리면 이음새가 그대로 보인다.
      // 안쪽 여백 안에서만 짧게 그린다.
      const margin = size * 0.18;
      for (let i = 0; i < 5; i++) {
        let x = margin + rnd() * (size - margin * 2);
        let y = margin + rnd() * (size - margin * 2);
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x = Math.max(margin, Math.min(size - margin, x + (rnd() - 0.5) * S(46)));
          y = Math.max(margin, Math.min(size - margin, y + (rnd() - 0.5) * S(46)));
          c.lineTo(x, y);
        }
        c.strokeStyle = 'rgba(255,120,40,0.55)';
        c.lineWidth = S(2.2);
        c.lineCap = 'round';
        c.stroke();
        c.strokeStyle = 'rgba(255,200,120,0.4)';
        c.lineWidth = S(0.9);
        c.stroke();
      }
      // 작은 용암 웅덩이
      for (let i = 0; i < 4; i++) {
        const px2 = margin + rnd() * (size - margin * 2);
        const py2 = margin + rnd() * (size - margin * 2);
        c.beginPath();
        c.ellipse(px2, py2, S(7 + rnd() * 6), S(4 + rnd() * 4), rnd() * 3, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,140,50,0.35)';
        c.fill();
      }
      break;
    }
    case 'sky': {
      // 구름 — 부드러운 흰 덩어리
      for (let i = 0; i < 16; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        const r = S(10 + rnd() * 16);
        c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(200,225,255,0.14)';
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.arc(x + r * 0.8, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
        c.arc(x - r * 0.8, y + r * 0.25, r * 0.65, 0, Math.PI * 2);
        c.fill();
      }
      // 반짝이는 별
      for (let i = 0; i < 30; i++) {
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(rnd() * size, rnd() * size, S(2), S(2));
      }
      break;
    }
  }
}

function patternFor(b: Biome, dpr: number): HTMLCanvasElement {
  const key = `${b.id}@${dpr}`;
  const hit = patterns.get(key);
  if (hit) return hit;

  const size = TILE * dpr;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  paintBiome(cv.getContext('2d')!, b, size, dpr);
  patterns.set(key, cv);
  return cv;
}

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

  /**
   * 패턴 한 장을 화면 전체에 반복해 깐다.
   *
   * **반복 주기와 감싸는 주기가 어긋나면 배경이 통째로 튄다.**
   * 패턴 원본은 `TILE * dpr` px 짜리다. 여기에 `dpr * scale` 변환을 걸면 한 타일이
   * 화면에서 `TILE * dpr * scale` CSS px 를 덮는데, 오프셋은 `TILE * scale` 마다
   * 감싸고 있었다. dpr 2 인 기기에서 카메라가 반 타일 지날 때마다 배경이 반 타일씩
   * 순간이동했고, 이것이 "지형이 플레이어와 따로 놀며 끊겨 보이는" 증상이었다.
   *
   * 원본 1px 이 화면 `scale` 배가 되도록 변환을 잡으면 실제 주기가 `TILE * scale`
   * CSS px 로 맞는다. 변환 단위가 원본 px 이므로 오프셋·크기는 기기 픽셀로 환산한다.
   */
  const layer = (b: Biome, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    const pat = ctx.createPattern(patternFor(b, dpr), 'repeat')!;
    const step = TILE * scale; // 화면상 실제 반복 주기 (CSS px)
    const ox = (((-camX * scale + w / 2) % step) + step) % step;
    const oy = (((-camY * scale + h / 2) % step) + step) % step;
    ctx.setTransform(scale, 0, 0, scale, (ox - step) * dpr, (oy - step) * dpr);
    ctx.fillStyle = pat;
    // 사용자 단위 = 패턴 원본 px. 화면을 덮고 앞뒤로 한 타일씩 여유를 둔다
    ctx.fillRect(0, 0, (w * dpr) / scale + TILE * dpr * 2, (h * dpr) / scale + TILE * dpr * 2);
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
    const offX = (((-camX * scale + w / 2) % cell) + cell) % cell;
    const offY = (((-camY * scale + h / 2) % cell) + cell) % cell;
    // 정수 픽셀로 반올림하면 선이 선명해지는 대신 카메라가 움직일 때
    // 격자가 1px 씩 계단으로 튄다. 캐릭터는 부드럽게 흐르는데 배경만 덜컹거려
    // 화면이 끊겨 보인다. **선명함보다 부드러움을 택한다.**
    ctx.beginPath();
    for (let x = offX - cell; x <= w + cell; x += cell) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = offY - cell; y <= h + cell; y += cell) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.strokeStyle = BIOMES[to].grid;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
