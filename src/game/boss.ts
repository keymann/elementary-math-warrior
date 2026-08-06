/**
 * 보스.
 *
 * 일반 적과 달리 한 번에 한 마리만 존재하므로 풀을 쓰지 않고 단일 객체로 둔다.
 *
 * 최종보스는 **방어막**을 갖는다. 체력이 일정 구간에 닿을 때마다 방어막이 올라오고,
 * 문제를 맞혀야 깨진다. 원작에서 확인한 구조로, 마지막에 한 번 더 학습을 끼워 넣으면서도
 * "문제를 못 풀면 죽는다"가 아니라 "문제를 풀면 진행한다"가 되게 한다.
 */

export type BossKindId = 'mid1' | 'mid2' | 'final';

export type BossDef = {
  id: BossKindId;
  name: string;
  emoji: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** 처치 시 주는 경험치 */
  xp: number;
  /** 방어막이 올라오는 체력 비율 (내림차순). 비어 있으면 방어막 없음 */
  shieldAt: number[];
};

export const BOSSES: Record<BossKindId, BossDef> = {
  mid1: {
    id: 'mid1',
    name: '3분 중간보스 · 곱셈 골렘',
    emoji: '🗿',
    hp: 900,
    speed: 62,
    damage: 18,
    radius: 46,
    xp: 60,
    shieldAt: [],
  },
  mid2: {
    id: 'mid2',
    name: '6분 중간보스 · 나눗셈 마녀',
    emoji: '🧙',
    hp: 2400,
    speed: 74,
    damage: 24,
    radius: 50,
    xp: 140,
    shieldAt: [],
  },
  final: {
    id: 'final',
    name: '최종보스 · 유령 마왕',
    emoji: '👹',
    hp: 6000,
    speed: 68,
    damage: 30,
    radius: 62,
    xp: 400,
    // 100% / 66% / 33% 지점에서 방어막. 문제를 맞혀야 깨진다.
    shieldAt: [1, 0.66, 0.33],
  },
};

export type Boss = {
  active: boolean;
  def: BossDef;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  flash: number;
  /** 방어막이 올라와 있으면 피해를 받지 않는다 */
  shielded: boolean;
  /** 아직 사용하지 않은 방어막 임계값 */
  pendingShields: number[];
  lastPid: number;
  lastHitAt: number;
};

export function makeBoss(): Boss {
  return {
    active: false,
    def: BOSSES.mid1,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    hp: 1,
    maxHp: 1,
    flash: 0,
    shielded: false,
    pendingShields: [],
    lastPid: 0,
    lastHitAt: -99,
  };
}
