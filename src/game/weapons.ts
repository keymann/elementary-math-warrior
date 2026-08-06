/**
 * 무기 정의 — 파일럿 6종 (작업계획 2.5.6).
 *
 * 무기는 두 가지만 갖는다.
 *   1) `spec(level)` — 레벨별 **기본 수치**
 *   2) `fire(ctx, spec)` — 발사 패턴
 *
 * 최종 수치는 항상 스탯(패시브)을 곱해서 얻는다. 무기가 패시브를 직접 참조하면
 * 조합이 늘 때마다 무기마다 분기가 생겨 손댈 수 없게 된다.
 */
import type { ProjKind, Projectile } from './projectiles';
import type { Stats } from './stats';

export type WeaponId = '연필' | '샤프펜슬' | '컴퍼스' | '각도기' | '계산기' | '지우개';

export type WeaponSpec = {
  /** 발사 간격(초). 실제 간격 = cooldown / stats.rate */
  cooldown: number;
  damage: number;
  /** 한 번에 나가는 개수 */
  count: number;
  speed: number;
  radius: number;
  pierce: number;
  life: number;
  knockback: number;
  splash: number;
};

export type FireContext = {
  px: number;
  py: number;
  stats: Stats;
  /** 가장 가까운 적의 방향(라디안). 적이 없으면 null */
  aim: number | null;
  spawn: (init: Partial<Projectile> & { kind: ProjKind }) => void;
};

export type WeaponDef = {
  id: WeaponId;
  emoji: string;
  describe: string;
  maxLevel: number;
  spec: (level: number) => WeaponSpec;
  fire: (ctx: FireContext, spec: WeaponSpec) => void;
};

const base = (o: Partial<WeaponSpec>): WeaponSpec => ({
  cooldown: 1,
  damage: 5,
  count: 1,
  speed: 500,
  radius: 8,
  pierce: 0,
  life: 1.4,
  knockback: 0,
  splash: 0,
  ...o,
});

/** 적이 없을 때의 기본 조준 방향 — 가만히 있어도 무기가 놀지 않게 한다. */
let idleAim = 0;
function aimOf(ctx: FireContext) {
  if (ctx.aim !== null) return ctx.aim;
  idleAim += 0.7;
  return idleAim;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: '연필',
    emoji: '✏️',
    describe: '가장 가까운 적을 자동 조준해 직진',
    maxLevel: 5,
    spec: (lv) =>
      base({
        cooldown: 0.75 - 0.06 * (lv - 1),
        damage: 14 + 5 * (lv - 1),
        count: 1 + Math.floor((lv - 1) / 2),
        speed: 560,
        radius: 7,
        life: 1.6,
      }),
    fire: (ctx, s) => {
      const a = aimOf(ctx);
      for (let i = 0; i < s.count; i++) {
        // 여러 발일 때 살짝 벌려 쏜다 (완전히 겹치면 한 발처럼 보인다)
        const off = (i - (s.count - 1) / 2) * 0.12;
        ctx.spawn({
          kind: 'straight',
          vx: Math.cos(a + off) * s.speed,
          vy: Math.sin(a + off) * s.speed,
          damage: s.damage,
          radius: s.radius * ctx.stats.area,
          life: s.life,
        });
      }
    },
  },

  {
    id: '샤프펜슬',
    emoji: '🖊️',
    describe: '적을 꿰뚫고 지나가는 관통탄',
    maxLevel: 5,
    spec: (lv) =>
      base({
        cooldown: 1.0 - 0.07 * (lv - 1),
        damage: 11 + 4 * (lv - 1),
        count: 1,
        speed: 680,
        radius: 6,
        pierce: 2 + Math.floor(lv / 2),
        life: 1.8,
      }),
    fire: (ctx, s) => {
      const a = aimOf(ctx);
      ctx.spawn({
        kind: 'pierce',
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        damage: s.damage,
        radius: s.radius * ctx.stats.area,
        pierce: s.pierce,
        life: s.life,
        rehit: 0, // 같은 적은 한 번만
      });
    },
  },

  {
    id: '컴퍼스',
    emoji: '📐',
    describe: '주변을 도는 컴퍼스 날',
    maxLevel: 5,
    spec: (lv) =>
      base({
        // 지속형이라 cooldown = 재생성 주기. 끊김 없이 이어지도록 life 와 맞춘다.
        cooldown: 2.2,
        damage: 8 + 3 * (lv - 1),
        count: 2 + Math.floor((lv - 1) / 2),
        speed: 3.1, // 각속도(rad/s)
        radius: 12,
        life: 2.2,
      }),
    fire: (ctx, s) => {
      for (let i = 0; i < s.count; i++) {
        ctx.spawn({
          kind: 'orbit',
          angle: (Math.PI * 2 * i) / s.count,
          orbitRadius: 78 * ctx.stats.area,
          orbitSpeed: s.speed,
          damage: s.damage,
          radius: s.radius * ctx.stats.area,
          pierce: 999,
          life: s.life,
          rehit: 0.4, // 회전하며 다시 스칠 수 있어야 한다
        });
      }
    },
  },

  {
    id: '각도기',
    emoji: '🔺',
    describe: '앞쪽으로 부채꼴로 퍼지는 조각',
    maxLevel: 5,
    spec: (lv) =>
      base({
        cooldown: 1.3 - 0.09 * (lv - 1),
        damage: 7 + 2.5 * (lv - 1),
        count: 5 + lv - 1,
        speed: 430,
        radius: 7,
        life: 0.5,
      }),
    fire: (ctx, s) => {
      const a = aimOf(ctx);
      const spread = 1.15 * ctx.stats.area; // 범위 스탯이 각도를 넓힌다
      for (let i = 0; i < s.count; i++) {
        const t = s.count === 1 ? 0 : i / (s.count - 1) - 0.5;
        const ang = a + t * spread;
        ctx.spawn({
          kind: 'cone',
          vx: Math.cos(ang) * s.speed,
          vy: Math.sin(ang) * s.speed,
          damage: s.damage,
          radius: s.radius * ctx.stats.area,
          life: s.life,
        });
      }
    },
  },

  {
    id: '계산기',
    emoji: '🧮',
    describe: '느리지만 터지면서 광역 피해',
    maxLevel: 5,
    spec: (lv) =>
      base({
        cooldown: 1.7 - 0.11 * (lv - 1),
        damage: 20 + 7 * (lv - 1),
        count: 1,
        speed: 260,
        radius: 13,
        life: 2.4,
        splash: 74 + 8 * (lv - 1),
      }),
    fire: (ctx, s) => {
      const a = aimOf(ctx);
      ctx.spawn({
        kind: 'bolt',
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        damage: s.damage,
        radius: s.radius * ctx.stats.area,
        life: s.life,
        splash: s.splash * ctx.stats.area,
      });
    },
  },

  {
    id: '지우개',
    emoji: '🧽',
    describe: '주변 적을 밀어내는 파동',
    maxLevel: 5,
    spec: (lv) =>
      base({
        cooldown: 2.1 - 0.14 * (lv - 1),
        damage: 6 + 2.5 * (lv - 1),
        count: 1,
        speed: 300, // 파동이 퍼지는 속도
        radius: 24,
        life: 0.55,
        knockback: 380 + 40 * (lv - 1),
      }),
    fire: (ctx, s) => {
      ctx.spawn({
        kind: 'aura',
        angle: 0,
        orbitSpeed: s.speed * ctx.stats.area,
        damage: s.damage,
        radius: s.radius * ctx.stats.area,
        pierce: 999,
        life: s.life,
        knockback: s.knockback,
        rehit: 0, // 한 파동에 한 번만
      });
    },
  },
];

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

/** 파일럿에서 시작 무기로 고를 수 있는 4종 (나머지는 레벨업 보상으로 등장) */
export const STARTER_WEAPONS: WeaponId[] = ['연필', '샤프펜슬', '각도기', '계산기'];
