/**
 * 지면 파손 자국 — 플레이어가 지나간 자리가 부서진다.
 *
 * 배경이 완전히 정적이면 빠르게 움직여도 **제자리걸음처럼** 느껴진다. 격자만으로는
 * 부족하고, 내가 지나온 흔적이 남아야 "내가 이 땅을 밟고 있다"가 된다.
 *
 * 자연스러움의 핵심은 세 가지다.
 *  1. **즉시 최대 진하기로 나타나지 않는다.** 짧게 번져 들어온다(fadeIn).
 *  2. **한꺼번에 사라지지 않는다.** 자국마다 수명이 조금씩 다르다.
 *  3. **지형마다 부서지는 방식이 다르다.** 풀은 눕고, 모래는 파이고,
 *     현무암은 금이 가고, 용암은 갈라진 틈에서 빛이 새고, 구름은 흩어진다.
 *
 * 성능: 자국 하나를 매번 도형으로 그리면 150개 × 5스트로크 = 750 드로우콜이다.
 * 저사양 태블릿에서 그대로 프레임을 먹으므로 **미리 구운 스프라이트**를 복사한다.
 */
import { BALANCE as B } from '../game/balance';
import type { BiomeId } from './terrain';

type Decal = {
  x: number;
  y: number;
  /** 0~1 진행도. 1 이면 수명 종료 */
  t: number;
  /** 수명(초) — 개체마다 흔들어 한꺼번에 사라지지 않게 한다 */
  life: number;
  biome: BiomeId;
  variant: number;
  /** 지나간 방향 — 자국이 진행 방향으로 늘어난다 */
  angle: number;
  scale: number;
};

const VARIANTS = 4;

/** 결정적 난수 — 같은 variant 는 항상 같은 모양이어야 캐시가 의미를 갖는다 */
function makeRnd(seed: number) {
  let s = (seed * 2654435761) & 0x7fffffff;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const cache = new Map<string, HTMLCanvasElement>();

/** 지형별 파손 형태. size 는 스프라이트의 지름(px) */
function paintDecal(c: CanvasRenderingContext2D, biome: BiomeId, variant: number, size: number) {
  const rnd = makeRnd(variant * 977 + biome.length * 31 + biome.charCodeAt(0));
  const r = size / 2;

  switch (biome) {
    case 'forest': {
      // 풀이 눕고 흙이 드러난다
      c.beginPath();
      c.ellipse(0, 0, r * 0.72, r * 0.5, rnd() * 3, 0, Math.PI * 2);
      c.fillStyle = 'rgba(38,28,16,0.34)';
      c.fill();
      c.strokeStyle = 'rgba(120,150,80,0.34)';
      c.lineWidth = Math.max(1, r * 0.1);
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.2);
        c.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.6);
        c.stroke();
      }
      break;
    }
    case 'desert': {
      // 모래가 파이고 테두리에 둔덕이 생긴다
      c.beginPath();
      c.ellipse(0, 0, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(30,22,10,0.42)';
      c.fill();
      c.beginPath();
      c.ellipse(0, r * 0.12, r * 0.78, r * 0.5, 0, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(210,185,130,0.35)';
      c.lineWidth = Math.max(1, r * 0.14);
      c.stroke();
      for (let i = 0; i < 6; i++) {
        c.fillStyle = 'rgba(225,200,145,0.4)';
        c.fillRect((rnd() - 0.5) * size, (rnd() - 0.5) * size * 0.7, r * 0.12, r * 0.09);
      }
      break;
    }
    case 'basalt': {
      // 각진 방사형 균열 — 돌은 곡선으로 깨지지 않는다
      c.strokeStyle = 'rgba(10,10,14,0.75)';
      c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd() * 0.9;
        let x = 0;
        let y = 0;
        c.beginPath();
        c.moveTo(0, 0);
        for (let k = 0; k < 3; k++) {
          x += Math.cos(a + (rnd() - 0.5) * 1.1) * r * 0.34;
          y += Math.sin(a + (rnd() - 0.5) * 1.1) * r * 0.34;
          c.lineTo(x, y);
        }
        c.lineWidth = Math.max(1, r * (0.16 - i * 0.02));
        c.stroke();
      }
      // 떨어져 나온 파편
      c.fillStyle = 'rgba(70,72,84,0.6)';
      for (let i = 0; i < 3; i++) {
        c.fillRect((rnd() - 0.5) * size * 0.8, (rnd() - 0.5) * size * 0.8, r * 0.2, r * 0.16);
      }
      break;
    }
    case 'lava': {
      // 굳은 껍질이 깨져 아래의 용암 빛이 새어 나온다
      c.strokeStyle = 'rgba(255,120,40,0.85)';
      c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd() * 1.2;
        let x = 0;
        let y = 0;
        c.beginPath();
        c.moveTo(0, 0);
        for (let k = 0; k < 3; k++) {
          x += Math.cos(a + (rnd() - 0.5) * 1.0) * r * 0.32;
          y += Math.sin(a + (rnd() - 0.5) * 1.0) * r * 0.32;
          c.lineTo(x, y);
        }
        c.lineWidth = Math.max(1.2, r * 0.2);
        c.stroke();
        c.strokeStyle = 'rgba(255,225,150,0.9)';
        c.lineWidth = Math.max(0.8, r * 0.08);
        c.stroke();
        c.strokeStyle = 'rgba(255,120,40,0.85)';
      }
      c.beginPath();
      c.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,180,80,0.55)';
      c.fill();
      break;
    }
    case 'sky': {
      // 구름이 발밑에서 흩어진다 — 깨지는 게 아니라 뚫린다
      c.beginPath();
      c.ellipse(0, 0, r * 0.6, r * 0.4, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(20,34,54,0.45)';
      c.fill();
      c.fillStyle = 'rgba(230,244,255,0.4)';
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        const d = r * (0.6 + rnd() * 0.4);
        c.beginPath();
        c.arc(Math.cos(a) * d, Math.sin(a) * d * 0.7, r * (0.1 + rnd() * 0.14), 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
  }
}

function spriteFor(biome: BiomeId, variant: number, size: number, dpr: number): HTMLCanvasElement {
  const key = `${biome}@${variant}@${size}@${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(size * dpr);
  cv.height = Math.ceil(size * dpr);
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.translate(size / 2, size / 2);
  paintDecal(c, biome, variant, size);
  cache.set(key, cv);
  return cv;
}

/**
 * 스프라이트를 굽는 기준 크기(월드 단위). 화면 배율은 그릴 때 곱한다.
 * 46 이었을 때 자국 하나가 주인공(≈51)만 해서 흙길처럼 뭉쳐 보였다.
 */
const BASE_SIZE = 34;

export class DecalField {
  private items: Decal[] = [];
  private head = 0;
  /** 마지막으로 자국을 남긴 위치 */
  private lastX = 0;
  private lastY = 0;
  private primed = false;

  /**
   * 플레이어 위치를 넘기면 필요한 만큼 자국을 남긴다.
   * 프레임률과 무관하게 **이동 거리 기준**이라 빠르게 달려도 간격이 일정하다.
   */
  trail(x: number, y: number, biome: BiomeId, rnd: () => number) {
    if (!this.primed) {
      this.lastX = x;
      this.lastY = y;
      this.primed = true;
      return;
    }
    let dx = x - this.lastX;
    let dy = y - this.lastY;
    let d = Math.hypot(dx, dy);
    const step = B.decal.everyDistance;
    if (d < step) return;

    // 한 프레임에 여러 걸음을 건너뛰었으면 그 사이를 채운다 (순간이동처럼 보이지 않게)
    const angle = Math.atan2(dy, dx);
    let guard = 0;
    while (d >= step && guard++ < 8) {
      const k = step / d;
      this.lastX += dx * k;
      this.lastY += dy * k;
      this.push(this.lastX, this.lastY, biome, angle, rnd);
      dx = x - this.lastX;
      dy = y - this.lastY;
      d = Math.hypot(dx, dy);
    }
  }

  private push(x: number, y: number, biome: BiomeId, angle: number, rnd: () => number) {
    const total = B.decal.fadeIn + B.decal.hold + B.decal.fadeOut;
    const d: Decal = {
      x: x + (rnd() - 0.5) * 8,
      y: y + (rnd() - 0.5) * 8,
      t: 0,
      // 수명을 ±25% 흔든다 — 같은 속도로 사라지면 줄지어 깜빡인다
      life: total * (0.75 + rnd() * 0.5),
      biome,
      variant: Math.floor(rnd() * VARIANTS),
      angle: angle + (rnd() - 0.5) * 0.5,
      scale: 0.8 + rnd() * 0.45,
    };
    if (this.items.length < B.decal.max) {
      this.items.push(d);
    } else {
      // 링 버퍼 — 가장 오래된 자국을 덮어쓴다. 배열이 커지지 않는다
      this.items[this.head] = d;
      this.head = (this.head + 1) % B.decal.max;
    }
  }

  step(dt: number) {
    for (const d of this.items) if (d.t < 1) d.t += dt / d.life;
  }

  /** 진행도 → 불투명도. 들어올 땐 빠르게, 나갈 땐 길게 */
  private alphaOf(d: Decal) {
    const total = B.decal.fadeIn + B.decal.hold + B.decal.fadeOut;
    const s = d.t * total;
    if (s < B.decal.fadeIn) return s / B.decal.fadeIn;
    if (s < B.decal.fadeIn + B.decal.hold) return 1;
    return Math.max(0, 1 - (s - B.decal.fadeIn - B.decal.hold) / B.decal.fadeOut);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    toScreenX: (x: number) => number,
    toScreenY: (y: number) => number,
    scale: number,
    dpr: number,
    camX: number,
    camY: number,
    cull: number,
  ) {
    const size = BASE_SIZE;
    ctx.save();
    for (const d of this.items) {
      if (d.t >= 1) continue;
      if (Math.abs(d.x - camX) > cull || Math.abs(d.y - camY) > cull) continue;
      const a = this.alphaOf(d);
      if (a <= 0.01) continue;
      const sp = spriteFor(d.biome, d.variant, size, dpr);
      const w = (size * d.scale * scale);
      ctx.globalAlpha = a * 0.62;
      ctx.save();
      ctx.translate(toScreenX(d.x), toScreenY(d.y));
      ctx.rotate(d.angle);
      // 진행 방향으로 살짝 늘여 "지나간 자국"으로 읽히게 한다
      ctx.drawImage(sp, -w * 0.6, -w / 2, w * 1.2, w);
      ctx.restore();
    }
    ctx.restore();
  }

  clear() {
    this.items = [];
    this.head = 0;
    this.primed = false;
  }
}
