/**
 * 모든 밸런스 수치는 이 파일 하나에만 둔다.
 *
 * 튜닝은 수십 번 반복되는 작업이라 값이 로직 사이에 흩어지면 조정이 불가능해진다.
 * (작업계획 4장의 목표 지표를 이 상수들로 맞춰 나간다)
 */

export const BALANCE = {
  world: {
    /** 충돌 그리드 셀 크기 — 최대 히트박스의 약 2배 */
    cellSize: 64,
  },

  player: {
    maxHp: 100,
    speed: 210, // 월드 단위/초
    radius: 16,
    /** 피격 후 무적 시간(초) — 없으면 적 무리에 닿는 순간 즉사한다 */
    invulnAfterHit: 0.6,
  },

  enemy: {
    radius: 14,
    speed: 78,
    hp: 10,
    /** 접촉 데미지 */
    damage: 6,
    /** 서로 밀어내는 힘 — 겹쳐서 한 덩어리로 보이는 것을 막는다 */
    separation: 260,
    /** 플레이어에서 이 거리 밖으로 벗어나면 반대편으로 재배치(무한 맵 유지) */
    despawnDistance: 1400,
  },

  spawn: {
    /** 스폰 링 반경 — 화면 밖에서 등장해야 갑자기 튀어나오지 않는다 */
    ringMin: 620,
    ringMax: 760,
    /** 초당 스폰 수 (Phase 1은 고정, Phase 2에서 시간 곡선으로 교체) */
    perSecond: 12,
    /** 동시 생존 상한 — 성능 목표(300체 60fps)의 기준값 */
    maxAlive: 300,
  },

  perf: {
    /** 이 fps 아래가 lowFpsSeconds 이상 지속되면 저사양 모드로 자동 전환 */
    lowFpsThreshold: 45,
    lowFpsSeconds: 3,
  },
} as const;
