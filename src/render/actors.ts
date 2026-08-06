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

  // 피격 — 붉게 덮는다. 색약 모드에서는 흰 테두리를 함께 그려 색 없이도 보이게 한다
  if (st.hurt > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, st.hurt * 3);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(cx - size * 0.45, cy - size * 0.72, size * 0.9, size * 1.3);
    if (st.colorSafe) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, size * 0.09);
      ctx.strokeRect(cx - size * 0.45, cy - size * 0.72, size * 0.9, size * 1.3);
    }
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
) {
  const u = size / 8;
  // 걷기는 이동 거리에, 날갯짓은 그보다 빠르게 — 두 모션의 주기를 다르게 둔다
  const step = Math.sin(anim / 9);
  const flap = Math.sin(anim / 5.5);
  const bob = Math.abs(flap) * u * 0.35;

  ctx.save();
  ctx.translate(cx, cy - bob);
  if (facing < 0) ctx.scale(-1, 1);

  // 그림자
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(0, size * 0.52 + bob, size * 0.42, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── 날개 (몸통 뒤) — 위아래로 퍼덕인다
  const wingLift = flap * 1.6;
  const drawWing = (dir: number) => {
    ctx.beginPath();
    ctx.moveTo(dir * 1.4 * u, -1.6 * u);
    ctx.lineTo(dir * 5.6 * u, (-3.4 + wingLift) * u);
    ctx.lineTo(dir * 6.2 * u, (-0.4 + wingLift * 0.6) * u);
    ctx.lineTo(dir * 4.2 * u, (0.8 + wingLift * 0.3) * u);
    ctx.closePath();
    ctx.fillStyle = skin.wing;
    ctx.fill();
    ctx.strokeStyle = skin.wingEdge;
    ctx.lineWidth = Math.max(1, u * 0.28);
    ctx.stroke();
  };
  drawWing(-1);
  drawWing(1);

  // ── 꼬리
  ctx.beginPath();
  ctx.moveTo(-1.6 * u, 1.4 * u);
  ctx.quadraticCurveTo(-5 * u, (2.2 + step * 0.8) * u, -6.4 * u, (0.6 + step * 1.2) * u);
  ctx.lineWidth = u * 1.1;
  ctx.strokeStyle = skin.body;
  ctx.lineCap = 'round';
  ctx.stroke();

  // ── 다리 (걷기: 앞뒤 교차)
  const legs = step * u * 1.2;
  px(ctx, -1.9 * u + legs, 1.5 * u, 1.5 * u, 2.2 * u, skin.body);
  px(ctx, 0.5 * u - legs, 1.5 * u, 1.5 * u, 2.2 * u, skin.body);
  px(ctx, -2.1 * u + legs, 3.3 * u, 1.9 * u, 0.7 * u, skin.horn);
  px(ctx, 0.3 * u - legs, 3.3 * u, 1.9 * u, 0.7 * u, skin.horn);

  // ── 몸통
  px(ctx, -2.4 * u, -1.8 * u, 4.8 * u, 3.6 * u, skin.body);
  px(ctx, -1.4 * u, -0.6 * u, 2.8 * u, 2.4 * u, skin.belly);
  // 등 가시
  ctx.fillStyle = skin.horn;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo((-1.6 + i * 1.3) * u, -1.8 * u);
    ctx.lineTo((-1.1 + i * 1.3) * u, -2.9 * u);
    ctx.lineTo((-0.6 + i * 1.3) * u, -1.8 * u);
    ctx.closePath();
    ctx.fill();
  }

  // ── 목 + 머리
  px(ctx, 1.4 * u, -3.4 * u, 1.5 * u, 2.2 * u, skin.body);
  px(ctx, 2.2 * u, -5 * u, 3.4 * u, 2.2 * u, skin.body);
  px(ctx, 4.6 * u, -4.2 * u, 1.6 * u, 1.1 * u, skin.body); // 주둥이
  px(ctx, 4.4 * u, -3.3 * u, 1.4 * u, 0.4 * u, skin.belly); // 턱
  // 뿔
  ctx.fillStyle = skin.horn;
  ctx.beginPath();
  ctx.moveTo(2.6 * u, -5 * u);
  ctx.lineTo(2.0 * u, -6.6 * u);
  ctx.lineTo(3.3 * u, -5 * u);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(3.6 * u, -5 * u);
  ctx.lineTo(3.4 * u, -6.3 * u);
  ctx.lineTo(4.3 * u, -5 * u);
  ctx.closePath();
  ctx.fill();
  // 눈
  px(ctx, 3.9 * u, -4.4 * u, 0.9 * u, 0.8 * u, skin.eye);
  px(ctx, 4.2 * u, -4.2 * u, 0.4 * u, 0.5 * u, '#2b1a1a');

  ctx.restore();

  // ── 불 뿜기 (몸통과 별개로 월드 방향 기준으로 그린다)
  if (breath > 0) {
    const len = size * (1.6 + breath * 2.2);
    const spread = 0.42;
    ctx.save();
    ctx.translate(cx + Math.cos(breathAngle) * size * 0.5, cy - size * 0.42 + Math.sin(breathAngle) * size * 0.3);
    ctx.rotate(breathAngle);
    // 바깥 화염
    ctx.globalAlpha = 0.55 + Math.sin(anim) * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, len, -spread, spread);
    ctx.closePath();
    ctx.fillStyle = skin.fire[0];
    ctx.fill();
    // 안쪽 화염
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, len * 0.62, -spread * 0.6, spread * 0.6);
    ctx.closePath();
    ctx.fillStyle = skin.fire[1];
    ctx.fill();
    ctx.restore();
  }

  if (colorSafe) {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(2, u * 0.5);
    ctx.strokeRect(cx - size * 0.6, cy - size * 0.78, size * 1.2, size * 1.4);
  }
  if (flash) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - size * 0.65, cy - size * 0.8, size * 1.3, size * 1.5);
    ctx.restore();
  }
}
