/**
 * 적 종류 정의.
 *
 * 체력·속도만 다른 4종으로 시작한다. 행동 패턴(원거리·돌진 등)은 Phase 4 보스와 함께.
 * `from` 은 등장 시각(초) — 시간이 갈수록 종류가 늘어나 단조로움을 줄인다.
 */

export type EnemyKindId = 'basic' | 'swift' | 'tank' | 'swarm';

export type EnemyKind = {
  id: EnemyKindId;
  emoji: string;
  /** 저사양 모드에서 이모지 대신 쓰는 색 */
  color: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** 처치 시 주는 경험치 */
  xp: number;
  /** 등장 시작 시각(초) */
  from: number;
  /** 스폰 가중치 */
  weight: number;
  /** 한 번에 뭉쳐 나오는 수 */
  cluster: number;
};

export const ENEMY_KINDS: EnemyKind[] = [
  {
    id: 'basic',
    emoji: '👾',
    color: '#c2554a',
    hp: 8,
    speed: 78,
    damage: 6,
    radius: 14,
    xp: 1,
    from: 0,
    weight: 10,
    cluster: 1,
  },
  {
    id: 'swift',
    emoji: '🦇',
    color: '#8b6bd9',
    hp: 6,
    speed: 132,
    damage: 5,
    radius: 12,
    xp: 1,
    from: 60,
    weight: 6,
    cluster: 1,
  },
  {
    id: 'swarm',
    emoji: '🐜',
    color: '#7a8f3a',
    hp: 3,
    speed: 96,
    damage: 4,
    radius: 10,
    xp: 1,
    from: 120,
    weight: 5,
    cluster: 6,
  },
  {
    id: 'tank',
    emoji: '🪨',
    color: '#7b7b7b',
    hp: 45,
    speed: 46,
    damage: 12,
    radius: 22,
    xp: 5,
    from: 180,
    weight: 3,
    cluster: 1,
  },
];

export const ENEMY_BY_ID = new Map(ENEMY_KINDS.map((k) => [k.id, k]));
export const ENEMY_INDEX = new Map(ENEMY_KINDS.map((k, i) => [k.id, i]));
