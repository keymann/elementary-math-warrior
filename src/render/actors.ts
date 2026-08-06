/**
 * 캐릭터 렌더 — 복셀(블록) 스타일의 **자체 디자인**.
 *
 * 마인크래프트·포켓몬 캐릭터는 각각 Microsoft/Mojang, 닌텐도·포켓몬컴퍼니의
 * 상표·저작물이라 쓸 수 없다. 대신 같은 계열의 각진 블록 조형을 자체 비율로 만든다.
 * 라이선스 에셋이 생기면 이 파일의 draw 함수만 스프라이트 시트로 갈아끼우면 된다.
 *
 * 이미지 파일을 쓰지 않고 도형으로 그린다. 에셋 제로 전략을 유지하면 학교 와이파이에서
 * 로딩이 없고, 크기를 바꿔도 흐려지지 않는다.
 */

export type ActorState = {
  /** 걷기 위상 0~1. 이동 거리에 비례해 증가시킨다 */
  walk: number;
  /** 바라보는 방향 (-1 왼쪽, 1 오른쪽) */
  facing: number;
  /** 피격 잔여 시간(초). 0보다 크면 붉게 번쩍 */
  hurt: number;
  /** 레벨업 연출 잔여 시간(초) */
  levelUp: number;
};

const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) => {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
};

/* ─────────────────────────── 주인공 ─────────────────────────── */

const HERO = {
  skin: '#f0c08a',
  skinDark: '#d9a76c',
  hair: '#4a3325',
  shirt: '#3aa657',
  shirtDark: '#2c7f43',
  pants: '#3b5fa8',
  boot: '#3a2f27',
  eye: '#243447',
};

/**
 * 블록 용사. 8칸 폭 기준으로 그리고 size 로 배율을 잡는다.
 * 팔다리를 걷기 위상에 따라 흔들어 걷는 느낌을 준다.
 */
export function drawHero(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  st: ActorState,
) {
  const u = size / 8; // 한 블록 크기
  const swing = Math.sin(st.walk * Math.PI * 2);
  const bob = Math.abs(Math.cos(st.walk * Math.PI * 2)) * u * 0.35;

  ctx.save();
  ctx.translate(cx, cy - bob);
  if (st.facing < 0) ctx.scale(-1, 1);

  // 그림자
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52 + bob, size * 0.32, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalAlpha = 1;

  // 다리 (걷기: 앞뒤로 교차)
  const legSwing = swing * u * 1.1;
  px(ctx, -1.9 * u + legSwing, 1.6 * u, 1.7 * u, 2.2 * u, HERO.pants);
  px(ctx, 0.2 * u - legSwing, 1.6 * u, 1.7 * u, 2.2 * u, HERO.pants);
  px(ctx, -1.9 * u + legSwing, 3.3 * u, 1.7 * u, 0.7 * u, HERO.boot);
  px(ctx, 0.2 * u - legSwing, 3.3 * u, 1.7 * u, 0.7 * u, HERO.boot);

  // 몸통
  px(ctx, -2 * u, -0.6 * u, 4 * u, 2.4 * u, HERO.shirt);
  px(ctx, -2 * u, 1.2 * u, 4 * u, 0.5 * u, HERO.shirtDark);

  // 팔 (다리와 반대로 흔든다)
  px(ctx, -3.1 * u, -0.5 * u - legSwing * 0.5, 1.1 * u, 2.2 * u, HERO.shirt);
  px(ctx, 2 * u, -0.5 * u + legSwing * 0.5, 1.1 * u, 2.2 * u, HERO.shirt);
  px(ctx, -3.1 * u, 1.4 * u - legSwing * 0.5, 1.1 * u, 0.7 * u, HERO.skin);
  px(ctx, 2 * u, 1.4 * u + legSwing * 0.5, 1.1 * u, 0.7 * u, HERO.skin);

  // 머리
  px(ctx, -2.2 * u, -4.2 * u, 4.4 * u, 3.7 * u, HERO.skin);
  px(ctx, -2.2 * u, -4.2 * u, 4.4 * u, 1.1 * u, HERO.hair); // 앞머리
  px(ctx, -2.2 * u, -4.2 * u, 0.6 * u, 3.2 * u, HERO.hair); // 옆머리
  px(ctx, 1.6 * u, -4.2 * u, 0.6 * u, 3.2 * u, HERO.hair);
  px(ctx, -1.2 * u, -2.6 * u, 0.7 * u, 0.8 * u, HERO.eye);
  px(ctx, 0.5 * u, -2.6 * u, 0.7 * u, 0.8 * u, HERO.eye);
  px(ctx, -0.5 * u, -1.4 * u, 1 * u, 0.35 * u, HERO.skinDark); // 입

  ctx.restore();

  // 피격 — 붉게 덮는다
  if (st.hurt > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, st.hurt * 3);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(cx - size * 0.45, cy - size * 0.72, size * 0.9, size * 1.3);
    ctx.restore();
  }

  // 레벨업 — 금빛 고리가 위로 퍼진다
  if (st.levelUp > 0) {
    const t = 1 - st.levelUp; // 0 → 1
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t) * 0.9;
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.5 - t * size * 1.6, size * (0.4 + t * 0.5), size * (0.14 + t * 0.18), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/* ─────────────────────────── 적 ─────────────────────────── */

export type CreatureId = 'basic' | 'swift' | 'tank' | 'swarm' | 'star' | 'cat';

/**
 * 자체 디자인 몬스터 6종.
 * 포켓몬 캐릭터 대신, 우리 세계관(수학 유령 마왕의 하수인)에 맞는 형태를 쓴다.
 */
/**
 * 적 300체를 매 프레임 도형으로 그리면 드로우콜이 수천 건이 된다.
 * 애니메이션 프레임을 미리 오프스크린에 구워 두고 `drawImage` 로 복사한다.
 */
const FRAMES = 6;
const creatureCache = new Map<string, HTMLCanvasElement>();

function creatureSprite(id: CreatureId, size: number, dpr: number, frame: number): HTMLCanvasElement {
  const key = `${id}@${size}@${dpr}@${frame}`;
  const hit = creatureCache.get(key);
  if (hit) return hit;

  const pad = size * 0.9;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(pad * 2 * dpr);
  cv.height = Math.ceil(pad * 2 * dpr);
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.translate(pad, pad);
  paintCreature(c, id, size, (frame / FRAMES) * Math.PI * 2);
  creatureCache.set(key, cv);
  return cv;
}

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  id: CreatureId,
  cx: number,
  cy: number,
  size: number,
  t: number,
  flash: boolean,
  dpr = 1,
) {
  // 개체마다 위상을 어긋나게 해 무리가 한 몸처럼 움직이지 않게 한다
  const phase = Math.floor((t * 4 + cx * 0.02 + cy * 0.013) % FRAMES + FRAMES) % FRAMES;
  const sp = creatureSprite(id, size, dpr, phase);
  const w = sp.width / dpr;
  const h = sp.height / dpr;
  ctx.drawImage(sp, cx - w / 2, cy - h / 2, w, h);

  if (flash) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - size * 0.5, cy - size * 0.5, size, size);
    ctx.restore();
  }
}

/** 실제 형태를 그리는 부분 — 캐시 생성에만 쓴다 */
function paintCreature(ctx: CanvasRenderingContext2D, id: CreatureId, size: number, phase: number) {
  const u = size / 8;
  const b = Math.sin(phase);
  ctx.save();

  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.46, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalAlpha = 1;

  switch (id) {
    case 'basic': {
      // 말랑이 — 위아래로 눌렸다 펴진다
      const sq = 1 + b * 0.12;
      px(ctx, -2.4 * u, (-2.2 / sq) * u, 4.8 * u, 4.4 * sq * u, '#c2554a');
      px(ctx, -2.4 * u, (0.9 / sq) * u, 4.8 * u, 1.3 * sq * u, '#a1443b');
      px(ctx, -1.3 * u, -0.9 * u, 0.9 * u, 1 * u, '#fff');
      px(ctx, 0.4 * u, -0.9 * u, 0.9 * u, 1 * u, '#fff');
      px(ctx, -1.05 * u, -0.65 * u, 0.45 * u, 0.55 * u, '#1a1a1a');
      px(ctx, 0.65 * u, -0.65 * u, 0.45 * u, 0.55 * u, '#1a1a1a');
      break;
    }
    case 'swift': {
      // 날개 요정 — 날개를 퍼덕인다
      const w = 1.6 + b * 0.9;
      px(ctx, -1.4 * u, -1.4 * u, 2.8 * u, 2.8 * u, '#8b6bd9');
      px(ctx, -1.4 * u - w * u, -1 * u, w * u, 1.6 * u, '#b39ae8');
      px(ctx, 1.4 * u, -1 * u, w * u, 1.6 * u, '#b39ae8');
      px(ctx, -0.9 * u, -0.6 * u, 0.6 * u, 0.7 * u, '#fff');
      px(ctx, 0.3 * u, -0.6 * u, 0.6 * u, 0.7 * u, '#fff');
      break;
    }
    case 'swarm': {
      // 꼬마 무리 — 다리를 종종거린다
      const l = b * 0.5;
      px(ctx, -1.5 * u, -1.2 * u, 3 * u, 2.4 * u, '#7a8f3a');
      px(ctx, -1.9 * u, 0.4 * u + l * u, 0.6 * u, 0.9 * u, '#5c6d2c');
      px(ctx, 1.3 * u, 0.4 * u - l * u, 0.6 * u, 0.9 * u, '#5c6d2c');
      px(ctx, -0.9 * u, -0.6 * u, 0.5 * u, 0.6 * u, '#fff');
      px(ctx, 0.4 * u, -0.6 * u, 0.5 * u, 0.6 * u, '#fff');
      break;
    }
    case 'tank': {
      // 바위 골렘 — 무겁게 흔들린다
      const s = b * 0.25;
      px(ctx, -3 * u, -2.8 * u + s * u, 6 * u, 5.4 * u, '#7b7b7b');
      px(ctx, -3 * u, -2.8 * u + s * u, 6 * u, 1.1 * u, '#9a9a9a');
      px(ctx, -2.2 * u, -1.2 * u + s * u, 1.2 * u, 1.2 * u, '#ffd54a');
      px(ctx, 1 * u, -1.2 * u + s * u, 1.2 * u, 1.2 * u, '#ffd54a');
      px(ctx, -1.6 * u, 0.9 * u + s * u, 3.2 * u, 0.6 * u, '#4f4f4f');
      break;
    }
    case 'star': {
      // 별 정령 — 회전하며 반짝인다
      ctx.rotate(phase);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? size * 0.5 : size * 0.22;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const fx = Math.cos(a) * r;
        const fy = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(fx, fy) : ctx.lineTo(fx, fy);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffd54a';
      ctx.fill();
      ctx.strokeStyle = '#fff3b0';
      ctx.lineWidth = Math.max(1, u * 0.4);
      ctx.stroke();
      break;
    }
    case 'cat': {
      // 생선 도둑 — 꼬리가 살랑인다
      px(ctx, -1.8 * u, -1.2 * u, 3.6 * u, 2.6 * u, '#e0a86b');
      px(ctx, -1.8 * u, -2.2 * u, 0.9 * u, 1.1 * u, '#e0a86b'); // 귀
      px(ctx, 0.9 * u, -2.2 * u, 0.9 * u, 1.1 * u, '#e0a86b');
      px(ctx, 1.7 * u, -0.4 * u + b * 0.5 * u, 1.4 * u, 0.5 * u, '#c98f52'); // 꼬리
      px(ctx, -1.1 * u, -0.5 * u, 0.6 * u, 0.6 * u, '#2b2b2b');
      px(ctx, 0.5 * u, -0.5 * u, 0.6 * u, 0.6 * u, '#2b2b2b');
      break;
    }
  }

  ctx.restore();
}

/* ─────────────────────────── 보스 ─────────────────────────── */

export function drawBoss(
  ctx: CanvasRenderingContext2D,
  id: 'mid1' | 'mid2' | 'final',
  cx: number,
  cy: number,
  size: number,
  t: number,
  flash: boolean,
) {
  const u = size / 8;
  const b = Math.sin(t * 3);
  ctx.save();
  ctx.translate(cx, cy);

  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.5, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalAlpha = 1;

  if (id === 'mid1') {
    // 곱셈 골렘 — 커다란 돌덩이, 가슴에 × 표식
    px(ctx, -3.6 * u, -3.6 * u + b * 0.2 * u, 7.2 * u, 7 * u, '#6f6f6f');
    px(ctx, -3.6 * u, -3.6 * u + b * 0.2 * u, 7.2 * u, 1.4 * u, '#8e8e8e');
    px(ctx, -2.4 * u, -2 * u, 1.4 * u, 1.4 * u, '#ff8a5c');
    px(ctx, 1 * u, -2 * u, 1.4 * u, 1.4 * u, '#ff8a5c');
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = u * 0.7;
    ctx.beginPath();
    ctx.moveTo(-1.4 * u, 0.6 * u);
    ctx.lineTo(1.4 * u, 2.6 * u);
    ctx.moveTo(1.4 * u, 0.6 * u);
    ctx.lineTo(-1.4 * u, 2.6 * u);
    ctx.stroke();
  } else if (id === 'mid2') {
    // 나눗셈 마녀 — 뾰족 모자, 가슴에 ÷ 표식
    px(ctx, -2.6 * u, -2.2 * u, 5.2 * u, 5.4 * u, '#5b4b8a');
    ctx.beginPath();
    ctx.moveTo(-3 * u, -2.2 * u);
    ctx.lineTo(0, -6 * u + b * 0.3 * u);
    ctx.lineTo(3 * u, -2.2 * u);
    ctx.closePath();
    ctx.fillStyle = '#3d3260';
    ctx.fill();
    px(ctx, -1.5 * u, -1.2 * u, 0.9 * u, 0.9 * u, '#ffe08a');
    px(ctx, 0.6 * u, -1.2 * u, 0.9 * u, 0.9 * u, '#ffe08a');
    px(ctx, -0.35 * u, 1 * u, 0.7 * u, 0.7 * u, '#fff');
    px(ctx, -1.6 * u, 2 * u, 3.2 * u, 0.6 * u, '#fff');
    px(ctx, -0.35 * u, 2.9 * u, 0.7 * u, 0.7 * u, '#fff');
  } else {
    // 유령 마왕 — 아래가 흩어지는 유령 형태 + 뿔
    ctx.beginPath();
    ctx.moveTo(-4 * u, 2.6 * u);
    ctx.lineTo(-4 * u, -1.6 * u);
    ctx.quadraticCurveTo(0, -6.4 * u, 4 * u, -1.6 * u);
    ctx.lineTo(4 * u, 2.6 * u);
    for (let i = 0; i < 4; i++) {
      const x0 = 4 * u - i * 2 * u;
      ctx.quadraticCurveTo(x0 - u, 3.6 * u + b * 0.3 * u, x0 - 2 * u, 2.6 * u);
    }
    ctx.closePath();
    ctx.fillStyle = '#6b4a9e';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.4 * u, -3 * u);
    ctx.lineTo(-4.6 * u, -5.4 * u);
    ctx.lineTo(-2.2 * u, -4.2 * u);
    ctx.moveTo(3.4 * u, -3 * u);
    ctx.lineTo(4.6 * u, -5.4 * u);
    ctx.lineTo(2.2 * u, -4.2 * u);
    ctx.fillStyle = '#4a3270';
    ctx.fill();
    px(ctx, -2.2 * u, -2 * u, 1.5 * u, 1.5 * u, '#ff5c5c');
    px(ctx, 0.7 * u, -2 * u, 1.5 * u, 1.5 * u, '#ff5c5c');
  }

  if (flash) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-size * 0.6, -size * 0.7, size * 1.2, size * 1.4);
  }
  ctx.restore();
}
