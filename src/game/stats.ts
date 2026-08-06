/**
 * 패시브 → 파생 스탯 파이프라인.
 *
 * 무기는 "기본 수치"만 알고, 최종 수치는 항상 이 스탯을 곱해서 얻는다.
 * 무기 코드가 패시브를 직접 참조하기 시작하면 조합이 늘어날 때마다 무기마다
 * 분기가 생겨 손댈 수 없게 된다.
 */

export type PassiveId = '집중력' | '암산력' | '계산력' | '자신감' | '문제해결력';

export type PassiveDef = {
  id: PassiveId;
  emoji: string;
  /** 카드에 보여줄 한 줄 설명 (레벨당) */
  describe: string;
  maxLevel: number;
  apply: (s: Stats, level: number) => void;
};

export type Stats = {
  /** 공격력 배수 */
  power: number;
  /** 공격속도 배수 — 쿨다운 = 기본 / rate */
  rate: number;
  /** 치명타 확률 (0~1) */
  crit: number;
  /** 치명타 배수 */
  critMul: number;
  /** 공격 범위·투사체 크기 배수 */
  area: number;
  /** 이동속도 배수 */
  moveSpeed: number;
  /** 최대 체력 배수 */
  maxHp: number;
  /** 보석 흡수 범위 배수 */
  magnet: number;
};

export function baseStats(): Stats {
  return { power: 1, rate: 1, crit: 0.05, critMul: 1.8, area: 1, moveSpeed: 1, maxHp: 1, magnet: 1 };
}

/** 파일럿 범위 패시브 5종 (작업계획 2.5.6) */
export const PASSIVES: PassiveDef[] = [
  {
    id: '집중력',
    emoji: '🎯',
    describe: '공격력 +12%',
    maxLevel: 5,
    apply: (s, lv) => {
      s.power *= 1 + 0.12 * lv;
    },
  },
  {
    id: '암산력',
    emoji: '⚡',
    describe: '공격속도 +10%',
    maxLevel: 5,
    apply: (s, lv) => {
      s.rate *= 1 + 0.1 * lv;
    },
  },
  {
    id: '계산력',
    emoji: '💥',
    describe: '치명타 확률 +6%p',
    maxLevel: 5,
    apply: (s, lv) => {
      s.crit += 0.06 * lv;
    },
  },
  {
    id: '자신감',
    emoji: '💪',
    describe: '최대 체력 +15% (즉시 회복)',
    maxLevel: 5,
    apply: (s, lv) => {
      s.maxHp *= 1 + 0.15 * lv;
    },
  },
  {
    id: '문제해결력',
    emoji: '🧠',
    describe: '공격 범위 +12%',
    maxLevel: 5,
    apply: (s, lv) => {
      s.area *= 1 + 0.12 * lv;
    },
  },
];

export const PASSIVE_BY_ID = new Map(PASSIVES.map((p) => [p.id, p]));

/** 보유 패시브 레벨을 모아 최종 스탯을 만든다. 매 프레임이 아니라 변경 시에만 호출. */
export function computeStats(owned: Map<PassiveId, number>): Stats {
  const s = baseStats();
  for (const [id, lv] of owned) {
    if (lv > 0) PASSIVE_BY_ID.get(id)?.apply(s, lv);
  }
  s.crit = Math.min(1, s.crit);
  return s;
}
