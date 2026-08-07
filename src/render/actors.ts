import type { DragonSkin } from '../game/boss';

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
  /** 피격 반동 진행도 0~1 (1 = 막 맞은 순간). 비틀거리는 자세에 쓴다 */
  hurtT: number;
  /** 밀려나는 방향 (화면 기준 x) — 반동이 기우는 쪽 */
  hurtDx: number;
  /** 레벨업 연출 잔여 시간(초) */
  levelUp: number;
  /** 색약 모드 — 색 외에 형태로도 상태를 알린다 */
  colorSafe: boolean;
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

  /**
   * 피격 반동 — 붉은 덮개만으로는 "맞았다"가 몸에 남지 않는다.
   * 맞은 반대쪽으로 밀리며 상체가 젖혀지고, 곧 제자리로 돌아온다.
   * 되돌아오는 구간에 살짝 반대로 넘어가게(overshoot) 해야 뻣뻣하지 않다.
   */
  const h = Math.max(0, Math.min(1, st.hurtT));
  // 1 → 0 으로 줄어드는 동안 한 번 크게 튀었다가 진동하며 잦아든다
  const recoil = h > 0 ? Math.sin(h * Math.PI * 1.7) * h : 0;
  const lean = recoil * 0.34 * (st.hurtDx >= 0 ? 1 : -1);
  const push = recoil * u * 1.5 * (st.hurtDx >= 0 ? 1 : -1);

  ctx.save();
  ctx.translate(cx + push, cy - bob + recoil * u * 0.5);
  // 기울기는 방향 반전 **전에** 걸어야 좌우 어느 쪽을 보든 맞은 쪽으로 젖혀진다
  if (recoil > 0.001) ctx.rotate(lean);
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

  // 피격 — 붉게 덮는다. 색약 모드에서는 흰 테두리를 함께 그려 색 없이도 보이게 한다.
  // 덮개도 비틀거리는 몸을 따라가야 한다. 제자리에 있으면 몸만 어긋나 보인다
  if (st.hurt > 0) {
    const ox = cx + push;
    const oy = cy + recoil * u * 0.5;
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, st.hurt * 3);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(ox - size * 0.45, oy - size * 0.72, size * 0.9, size * 1.3);
    if (st.colorSafe) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeRect(ox - size * 0.45, oy - size * 0.72, size * 0.9, size * 1.3);
    }
    ctx.restore();
  }

  // 충격파 — 맞은 지점에서 짧게 퍼졌다 사라진다
  if (recoil > 0.02) {
    ctx.save();
    ctx.globalAlpha = recoil * 0.55;
    ctx.strokeStyle = '#ffd0d0';
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.35 + (1 - recoil) * 0.5), 0, Math.PI * 2);
    ctx.stroke();
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

export type CreatureId = 'basic' | 'swift' | 'tank' | 'swarm' | 'mimic' | 'cat';

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

/**
 * 색약 모드에서 종류를 구분하는 표식.
 * 색만 다르면 적록색약 학생에게는 말랑이(빨강)와 꼬마 무리(연두)가 같은 색으로 보인다.
 * 테두리 굵기 + 머리 위 점 개수로 **색 없이도** 구분되게 한다.
 */
const CS_PIPS: Record<CreatureId, number> = { basic: 1, swift: 2, swarm: 3, tank: 4, mimic: 5, cat: 6 };

function creatureSprite(
  id: CreatureId,
  size: number,
  dpr: number,
  frame: number,
  colorSafe: boolean,
): HTMLCanvasElement {
  const key = `${id}@${size}@${dpr}@${frame}@${colorSafe ? 'cs' : 'n'}`;
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
  if (colorSafe) paintColorSafeMarks(c, id, size);
  creatureCache.set(key, cv);
  return cv;
}

/** 색약 모드 표식 — 흰 외곽선 + 머리 위 점 */
function paintColorSafeMarks(ctx: CanvasRenderingContext2D, id: CreatureId, size: number) {
  const u = size / 8;
  const pips = CS_PIPS[id];
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(1.2, u * (0.28 + (pips % 3) * 0.14));
  ctx.strokeRect(-size * 0.32, -size * 0.34, size * 0.64, size * 0.68);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < pips; i++) {
    const w = u * 0.5;
    ctx.fillRect((i - (pips - 1) / 2) * w * 1.7 - w / 2, -size * 0.48, w, w);
  }
  ctx.restore();
}

/** 애니메이션 한 프레임에 해당하는 이동 거리(월드 단위) */
const ANIM_STEP = 13;

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  id: CreatureId,
  cx: number,
  cy: number,
  size: number,
  /** 이동 거리 누적값 — 움직일 때만 모션이 돈다 */
  anim: number,
  flash: boolean,
  dpr = 1,
  colorSafe = false,
) {
  // 개체마다 위상을 어긋나게 해 무리가 한 몸처럼 움직이지 않게 한다
  const phase = Math.floor((anim / ANIM_STEP + cx * 0.017 + cy * 0.011) % FRAMES + FRAMES) % FRAMES;
  const sp = creatureSprite(id, size, dpr, phase, colorSafe);
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
    case 'mimic': {
      // 미믹 — 보물상자인 척한다. 움직일 때마다 뚜껑이 열렸다 닫힌다.
      // phase 0 → 닫힘, phase π → 활짝. sin 을 0~1 로 접어 여닫이를 만든다
      const open = (Math.sin(phase) + 1) / 2; // 0~1
      const lid = open * 1.5; // 뚜껑이 젖혀지는 정도

      // 상자 몸통
      px(ctx, -2.8 * u, -0.6 * u, 5.6 * u, 3.2 * u, '#8a5a2b');
      px(ctx, -2.8 * u, -0.6 * u, 5.6 * u, 0.5 * u, '#a56d34'); // 윗면 하이라이트
      px(ctx, -2.8 * u, 1.6 * u, 5.6 * u, 0.6 * u, '#6b4520'); // 아랫단
      // 금속 띠
      px(ctx, -2.8 * u, 0.3 * u, 5.6 * u, 0.45 * u, '#d9b25a');
      px(ctx, -0.35 * u, -0.6 * u, 0.7 * u, 3.2 * u, '#d9b25a');
      // 자물쇠
      px(ctx, -0.55 * u, 0.15 * u, 1.1 * u, 1 * u, '#f0d27a');
      px(ctx, -0.2 * u, 0.55 * u, 0.4 * u, 0.4 * u, '#6b4520');

      // 벌어진 입 (뚜껑이 열린 만큼 보인다)
      if (open > 0.12) {
        px(ctx, -2.5 * u, -0.6 * u - lid * 0.55 * u, 5 * u, lid * 0.6 * u, '#3a1c1c');
        // 이빨
        ctx.fillStyle = '#fff6e0';
        const teeth = 5;
        for (let i = 0; i < teeth; i++) {
          const tx = -2.2 * u + i * (4.4 / (teeth - 1)) * u;
          ctx.beginPath();
          ctx.moveTo(tx - 0.32 * u, -0.6 * u);
          ctx.lineTo(tx + 0.32 * u, -0.6 * u);
          ctx.lineTo(tx, -0.6 * u - Math.min(lid * 0.5, 0.7) * u);
          ctx.closePath();
          ctx.fill();
        }
      }

      // 뚜껑 — 뒤쪽 모서리를 축으로 젖혀진다
      ctx.save();
      ctx.translate(-2.8 * u, -0.6 * u);
      ctx.rotate(-lid * 0.5);
      px(ctx, 0, -1.5 * u, 5.6 * u, 1.5 * u, '#9c6631');
      px(ctx, 0, -1.5 * u, 5.6 * u, 0.45 * u, '#b87d3d');
      px(ctx, 2.45 * u, -1.5 * u, 0.7 * u, 1.5 * u, '#d9b25a');
      ctx.restore();

      // 눈 — 열렸을 때만 보인다
      if (open > 0.35) {
        px(ctx, -1.5 * u, 0.9 * u, 0.6 * u, 0.6 * u, '#ffea00');
        px(ctx, 0.9 * u, 0.9 * u, 0.6 * u, 0.6 * u, '#ffea00');
      }
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

/**
 * 드래곤 보스.
 *
 * 몬스터는 블록 조형으로 두되, 보스는 **곡선 기반의 유기적인 형태**로 그린다.
 * 화면에 한 마리뿐이라 드로우콜 여유가 있고, 다른 적과 확실히 구분돼야 한다.
 *
 * 구성: 꼬리(가시) → 뒷다리 → 날개(막·손가락뼈) → 몸통(비늘 배) → 굽은 목 → 머리(뿔·이빨)
 */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  skin: DragonSkin,
  cx: number,
  cy: number,
  size: number,
  /** 이동 거리 누적 — 걷기·날갯짓 위상 */
  anim: number,
  facing: number,
  /** 불 뿜는 중이면 0~1 진행도, 아니면 0 */
  breath: number,
  breathAngle: number,
  flash: boolean,
  colorSafe = false,
  /** 피격 반동 진행도 0~1 (1 = 막 맞은 순간) */
  hurtT = 0,
) {
  const u = size / 8;
  const step = Math.sin(anim / 9); // 걷기
  const flap = Math.sin(anim / 5.5); // 날갯짓
  /**
   * 피격 반동 — 흰 사각형만 덮으면 6000 체력짜리 보스가 맞는지 안 맞는지 모른다.
   * 목이 뒤로 젖혀지고 몸이 뒤로 밀리며 날개가 크게 펴진다. 큰 몸집일수록
   * 반응이 **느리고 크게** 와야 무게가 느껴지므로 회복 곡선을 완만하게 잡는다.
   */
  const h = Math.max(0, Math.min(1, hurtT));
  const jolt = h > 0 ? Math.sin(h * Math.PI * 1.35) * h : 0;
  const bob = flap * u * 0.3 - jolt * u * 0.4;

  const shade = (hex: string, amt: number) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  };
  const dark = shade(skin.body, -34);
  const light = shade(skin.body, 26);

  ctx.save();
  // 맞으면 진행 방향 반대로 밀린다
  ctx.translate(cx - facing * jolt * u * 1.3, cy - bob);
  if (facing < 0) ctx.scale(-1, 1);
  ctx.lineJoin = 'round';

  // 그림자
  ctx.globalAlpha = 0.32;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.54 + bob, size * 0.44, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── 꼬리 (몸통 뒤에서 길게 휘어 나온다)
  const tailWag = step * 1.1;
  ctx.beginPath();
  ctx.moveTo(-1.2 * u, 0.9 * u);
  ctx.bezierCurveTo(-4 * u, (1.9 + tailWag) * u, -6.6 * u, (0.6 + tailWag * 1.6) * u, -8 * u, (-1.2 + tailWag * 2) * u);
  ctx.lineWidth = u * 1.05;
  ctx.strokeStyle = dark;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineWidth = u * 0.5;
  ctx.strokeStyle = skin.body;
  ctx.stroke();
  // 꼬리 끝 가시
  ctx.beginPath();
  ctx.moveTo(-8.5 * u, (-1.2 + tailWag * 2) * u);
  ctx.lineTo(-7.5 * u, (-2.0 + tailWag * 2) * u);
  ctx.lineTo(-7.4 * u, (-0.5 + tailWag * 2) * u);
  ctx.closePath();
  ctx.fillStyle = skin.horn;
  ctx.fill();

  // ── 뒷다리 (걷기: 앞뒤 교차, 무릎이 꺾인다)
  const leg = (offX: number, phase: number, tone: string) => {
    const sw = Math.sin(anim / 9 + phase) * 0.9;
    ctx.beginPath();
    ctx.moveTo(offX * u, 0.6 * u);
    ctx.quadraticCurveTo((offX + 0.9 + sw) * u, 2.2 * u, (offX + 0.3 + sw * 1.4) * u, 3.5 * u);
    ctx.lineWidth = u * 1.15;
    ctx.strokeStyle = tone;
    ctx.stroke();
    // 발톱
    ctx.beginPath();
    ctx.moveTo((offX - 0.3 + sw * 1.4) * u, 3.8 * u);
    ctx.lineTo((offX + 1.5 + sw * 1.4) * u, 3.8 * u);
    ctx.lineWidth = u * 0.45;
    ctx.strokeStyle = skin.horn;
    ctx.stroke();
  };
  leg(-1.6, Math.PI, dark);
  leg(0.6, 0, skin.body);

  // ── 날개 (막 + 손가락뼈). 위아래로 퍼덕이며 막이 접혔다 펴진다
  const lift = flap * 1.7 + jolt * 1.5; // 맞으면 날개를 크게 펼쳐 균형을 잡는다
  const wing = (dir: number, back: boolean) => {
    const tipX = dir * (5.4 + (back ? 0.6 : 0)) * u;
    const tipY = (-3.6 + lift) * u;
    ctx.beginPath();
    ctx.moveTo(dir * 1.1 * u, -1.9 * u);
    ctx.quadraticCurveTo(dir * 3.6 * u, (-4.6 + lift) * u, tipX, tipY);
    // 막의 아랫단 — 손가락 사이가 파인 모양
    for (let i = 3; i >= 1; i--) {
      const fx = dir * (1.1 + (i / 3) * 4.3) * u;
      const fy = (-1.9 + (i / 3) * (lift + 1.4)) * u + 1.6 * u;
      ctx.quadraticCurveTo(fx + dir * 0.5 * u, fy + 0.9 * u, fx, fy);
    }
    ctx.closePath();
    ctx.fillStyle = back ? shade(skin.wing, -18) : skin.wing;
    ctx.fill();
    ctx.strokeStyle = skin.wingEdge;
    ctx.lineWidth = Math.max(1, u * 0.22);
    ctx.stroke();
    // 손가락뼈
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const fx = dir * (1.1 + (i / 3) * 4.3) * u;
      const fy = (-1.9 + (i / 3) * (lift + 1.4)) * u + 1.6 * u;
      ctx.moveTo(dir * 1.1 * u, -1.9 * u);
      ctx.lineTo(fx, fy);
    }
    ctx.strokeStyle = skin.wingEdge;
    ctx.lineWidth = Math.max(0.8, u * 0.16);
    ctx.stroke();
  };
  wing(-1, true); // 반대쪽 날개는 어둡게 — 깊이감
  wing(1, false);

  // ── 몸통 (달걀형)
  ctx.beginPath();
  ctx.ellipse(-0.2 * u, 0, 2.9 * u, 2.2 * u, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = skin.body;
  ctx.fill();
  // 배 비늘
  ctx.beginPath();
  ctx.ellipse(0.1 * u, 0.7 * u, 1.9 * u, 1.3 * u, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = skin.belly;
  ctx.fill();
  ctx.strokeStyle = shade(skin.belly, -30);
  ctx.lineWidth = Math.max(0.7, u * 0.13);
  for (let i = -1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-1.5 * u, (i * 0.62 + 0.3) * u);
    ctx.quadraticCurveTo(0.2 * u, (i * 0.62 + 0.62) * u, 1.8 * u, (i * 0.62 + 0.3) * u);
    ctx.stroke();
  }
  // 등 가시
  ctx.fillStyle = skin.horn;
  for (let i = 0; i < 4; i++) {
    const bx = (-2.2 + i * 1.15) * u;
    const by = -1.7 * u + Math.abs(i - 1.5) * 0.22 * u;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 0.42 * u, by - (1.15 - Math.abs(i - 1.5) * 0.22) * u);
    ctx.lineTo(bx + 0.85 * u, by);
    ctx.closePath();
    ctx.fill();
  }

  // ── 목 (S자로 굽는다)
  // 맞으면 목이 뒤로 젖혀진다 — 반동이 가장 크게 읽히는 부위다
  const neckSway = flap * 0.18 - jolt * 0.85;
  ctx.beginPath();
  ctx.moveTo(1.6 * u, -0.8 * u);
  ctx.bezierCurveTo(3.2 * u, (-1.6 + neckSway) * u, 3.0 * u, (-3.8 + neckSway) * u, 4.3 * u, (-4.4 + neckSway) * u);
  ctx.lineWidth = u * 1.5;
  ctx.strokeStyle = skin.body;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineWidth = u * 0.6;
  ctx.strokeStyle = light;
  ctx.stroke();

  // ── 머리
  ctx.save();
  ctx.translate(4.5 * u, (-4.6 + neckSway) * u);
  ctx.rotate(-0.12 + neckSway * 0.2 - jolt * 0.45);
  // 두개골
  ctx.beginPath();
  ctx.moveTo(-1.1 * u, 0.5 * u);
  ctx.quadraticCurveTo(-1.3 * u, -1.1 * u, 0.4 * u, -1.2 * u);
  ctx.quadraticCurveTo(2.4 * u, -1.2 * u, 3.0 * u, -0.1 * u); // 주둥이 위
  ctx.lineTo(2.9 * u, 0.55 * u); // 코끝
  ctx.quadraticCurveTo(1.6 * u, 0.95 * u, 0.2 * u, 1.0 * u);
  ctx.closePath();
  ctx.fillStyle = skin.body;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(0.8, u * 0.15);
  ctx.stroke();
  // 아래턱 — 불 뿜을 때 벌어진다
  const jaw = 0.25 + breath * 0.85;
  ctx.save();
  ctx.translate(0.3 * u, 0.8 * u);
  ctx.rotate(jaw * 0.5);
  ctx.beginPath();
  ctx.moveTo(0, -0.25 * u);
  ctx.lineTo(2.5 * u, -0.1 * u);
  ctx.lineTo(2.3 * u, 0.5 * u);
  ctx.quadraticCurveTo(1.1 * u, 0.7 * u, 0, 0.45 * u);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // 아랫니
  ctx.fillStyle = skin.horn;
  for (let i = 0; i < 3; i++) {
    const tx = (0.7 + i * 0.65) * u;
    ctx.beginPath();
    ctx.moveTo(tx, -0.15 * u);
    ctx.lineTo(tx + 0.24 * u, -0.75 * u);
    ctx.lineTo(tx + 0.46 * u, -0.15 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // 윗니
  ctx.fillStyle = skin.horn;
  for (let i = 0; i < 3; i++) {
    const tx = (0.9 + i * 0.65) * u;
    ctx.beginPath();
    ctx.moveTo(tx, 0.85 * u);
    ctx.lineTo(tx + 0.24 * u, 1.5 * u);
    ctx.lineTo(tx + 0.46 * u, 0.85 * u);
    ctx.closePath();
    ctx.fill();
  }
  // 뿔 — 뒤로 휘어진다
  ctx.strokeStyle = skin.horn;
  ctx.lineWidth = u * 0.5;
  ctx.lineCap = 'round';
  // 뒤로 낮게 뻗는다 — 위로 곧게 세우면 더듬이처럼 보인다
  for (const [ox, oy, dx, dy] of [
    [-0.5, -0.85, -1.5, -0.75],
    [0.2, -1.05, -1.0, -1.15],
  ]) {
    ctx.beginPath();
    ctx.moveTo(ox * u, oy * u);
    ctx.quadraticCurveTo((ox + dx * 0.5) * u, (oy + dy * 0.8) * u, (ox + dx) * u, (oy + dy) * u);
    ctx.stroke();
  }
  // 눈 — 세로 동공
  ctx.beginPath();
  ctx.ellipse(1.0 * u, -0.25 * u, 0.5 * u, 0.36 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin.eye;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1.05 * u, -0.25 * u, 0.12 * u, 0.3 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a0f0f';
  ctx.fill();
  // 콧구멍
  ctx.beginPath();
  ctx.ellipse(2.6 * u, 0.1 * u, 0.14 * u, 0.1 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // ── 불 뿜기 — 월드 방향 기준. 세 겹으로 겹쳐 깊이를 준다
  if (breath > 0) {
    const len = size * (1.4 + breath * 2.4);
    const mouth = { x: cx + facing * size * 0.62, y: cy - size * 0.55 - bob };
    ctx.save();
    ctx.translate(mouth.x, mouth.y);
    ctx.rotate(breathAngle);
    const cone = (r: number, spread: number, color: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -spread, spread);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    const flicker = 1 + Math.sin(anim * 0.9) * 0.06;
    cone(len * flicker, 0.44, skin.fire[0], 0.45);
    cone(len * 0.72 * flicker, 0.3, skin.fire[0], 0.7);
    cone(len * 0.42 * flicker, 0.18, skin.fire[1], 0.95);
    // 불똥
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = skin.fire[1];
    for (let i = 0; i < 6; i++) {
      const d = len * (0.3 + ((i * 137 + anim * 7) % 100) / 140);
      const a = (((i * 71 + anim * 3) % 100) / 100 - 0.5) * 0.7;
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, size * 0.05, size * 0.05);
    }
    ctx.restore();
  }

  if (colorSafe) {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(2, u * 0.5);
    ctx.strokeRect(cx - size * 0.7, cy - size * 0.9, size * 1.4, size * 1.6);
  }
  if (flash) {
    const ox = cx - facing * jolt * u * 1.3;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox - size * 0.75, cy - size * 0.95, size * 1.5, size * 1.7);
    ctx.restore();
  }

  // 충격 링 — 큰 몸집에 맞았다는 걸 멀리서도 알 수 있게 한다
  if (jolt > 0.03) {
    ctx.save();
    ctx.globalAlpha = jolt * 0.5;
    ctx.strokeStyle = '#fff2f2';
    ctx.lineWidth = Math.max(2, u * 0.4);
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.5 + (1 - jolt) * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
