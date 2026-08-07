/**
 * 보스 — 드래곤 3종.
 *
 * 한 번에 한 마리만 존재하므로 풀을 쓰지 않고 단일 객체로 둔다.
 *
 * 최종·히든 보스는 **방어막**을 갖는다. 체력이 일정 구간에 닿을 때마다 방어막이 올라오고,
 * 문제를 맞혀야 깨진다. 마지막에 한 번 더 학습을 끼워 넣으면서도 "문제를 못 풀면 죽는다"가
 * 아니라 "문제를 풀면 진행한다"가 되게 한다.
 */

export type BossKindId = 'mid1' | 'mid2' | 'final' | 'hidden';

/** 드래곤 색 팔레트 */
export type DragonSkin = {
  body: string;
  belly: string;
  wing: string;
  wingEdge: string;
  horn: string;
  eye: string;
  fire: [string, string];
};

export type BossDef = {
  id: BossKindId;
  name: string;
  skin: DragonSkin;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  /** 방어막이 올라오는 체력 비율 (내림차순). 비어 있으면 방어막 없음 */
  shieldAt: number[];
  /** 불 뿜기 주기(초) */
  breathEvery: number;
  /** 불 뿜기 지속(초) */
  breathTime: number;
  /** 화염 사거리 · 초당 피해 */
  breathRange: number;
  breathDps: number;
};

const RED: DragonSkin = {
  body: '#b5342a', belly: '#e6a15c', wing: '#8c2620', wingEdge: '#d9603f',
  horn: '#f0dcc0', eye: '#ffd54a', fire: ['#ff8a3d', '#ffd54a'],
};
const GOLD: DragonSkin = {
  body: '#d9a521', belly: '#f6e3a1', wing: '#b8860b', wingEdge: '#ffe98a',
  horn: '#fffbe8', eye: '#fff3b0', fire: ['#ffd54a', '#fff6c9'],
};
const BLACK: DragonSkin = {
  body: '#2f2b3a', belly: '#5a5170', wing: '#1f1c29', wingEdge: '#8f6bd9',
  horn: '#cbbde8', eye: '#c46bff', fire: ['#9b5cff', '#e0c3ff'],
};

export const BOSSES: Record<BossKindId, BossDef> = {
  mid1: {
    id: 'mid1',
    name: '3분 중간보스 · 붉은 새끼용',
    skin: RED,
    hp: 900,
    speed: 66,
    damage: 18,
    radius: 46,
    xp: 60,
    shieldAt: [],
    breathEvery: 6.5,
    breathTime: 1.4,
    breathRange: 230,
    breathDps: 14,
  },
  mid2: {
    id: 'mid2',
    name: '6분 중간보스 · 붉은 드래곤',
    skin: RED,
    hp: 2400,
    speed: 76,
    damage: 24,
    radius: 54,
    xp: 140,
    shieldAt: [],
    breathEvery: 5.5,
    breathTime: 1.7,
    breathRange: 300,
    breathDps: 20,
  },
  final: {
    id: 'final',
    name: '최종보스 · 황금 드래곤',
    skin: GOLD,
    hp: 6000,
    speed: 70,
    damage: 30,
    radius: 66,
    xp: 400,
    shieldAt: [1, 0.66, 0.33],
    breathEvery: 5,
    breathTime: 2,
    breathRange: 360,
    breathDps: 26,
  },
  hidden: {
    // 정답률이 아주 높은 학생에게만 열리는 진짜 마지막 상대.
    // "문제를 잘 푼 사람에게 더 큰 무대를 준다"는 이 게임의 방향과 맞다.
    id: 'hidden',
    name: '히든보스 · 칠흑의 드래곤',
    skin: BLACK,
    hp: 9000,
    speed: 82,
    damage: 34,
    radius: 72,
    xp: 800,
    shieldAt: [1, 0.75, 0.5, 0.25],
    breathEvery: 4.2,
    breathTime: 2.2,
    breathRange: 420,
    breathDps: 30,
  },
};

/** 히든 보스가 열리는 정답률 */
export const HIDDEN_ACCURACY = 0.9;

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
  /** 피격 반동 잔여 시간(초). flash 보다 길게 남아 몸이 움찔하는 게 보인다 */
  hurtT: number;
  shielded: boolean;
  pendingShields: number[];
  lastPid: number;
  lastHitAt: number;
  /** 이동 거리 누적 — 걷기·날갯짓 모션 위상 */
  anim: number;
  /** 바라보는 방향 */
  facing: number;
  /** 다음 불 뿜기까지 남은 시간 */
  breathCd: number;
  /** 불 뿜는 중 남은 시간 (0보다 크면 화염 판정) */
  breathing: number;
  /** 불을 뿜는 방향(라디안) — 시작할 때 고정된다 */
  breathAngle: number;
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
    hurtT: 0,
    shielded: false,
    pendingShields: [],
    lastPid: 0,
    lastHitAt: -99,
    anim: 0,
    facing: 1,
    breathCd: 0,
    breathing: 0,
    breathAngle: 0,
  };
}
