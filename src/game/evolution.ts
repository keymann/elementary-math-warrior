/**
 * 각성(진화) 판정.
 *
 * 조건: **기본 무기 Lv.5 + 짝꿍 패시브 보유** → 레벨업 문제를 맞히면 진화.
 * 원작 블랙박스 측정에서 확인한 좋은 결정 하나를 그대로 가져왔다 —
 * **각성 짝꿍을 카드에 상시 표기**해 초등학생이 진화 조건을 추측하지 않아도 되게 한다.
 */
import type { PassiveId } from './stats';
import type { BaseWeaponId, EvolvedWeaponId, WeaponId } from './weapons';

export type Evolution = {
  base: BaseWeaponId;
  partner: PassiveId;
  result: EvolvedWeaponId;
};

/** 파일럿 범위에서 성립하는 조합 (작업계획 2.5.3) */
export const EVOLUTIONS: Evolution[] = [
  { base: '연필', partner: '집중력', result: '황금연필' },
  { base: '샤프펜슬', partner: '계산력', result: '레이저샤프' },
  { base: '계산기', partner: '암산력', result: '슈퍼계산기' },
  { base: '컴퍼스', partner: '문제해결력', result: '회오리컴퍼스' },
  { base: '지우개', partner: '자신감', result: '블랙홀지우개' },
];

/** 무기 → 짝꿍 패시브 (카드 힌트 표기용) */
export const PARTNER_OF = new Map<WeaponId, PassiveId>(EVOLUTIONS.map((e) => [e.base, e.partner]));

/** 각성에 필요한 기본 무기 레벨 */
export const EVOLVE_AT_LEVEL = 5;

/**
 * 지금 각성 가능한 조합을 찾는다.
 * 여러 개가 동시에 성립할 수 있으므로 배열로 돌려주고, 호출부가 한 번에 하나씩 처리한다.
 */
export function findEvolutions(
  weapons: Map<WeaponId, number>,
  passives: Map<PassiveId, number>,
): Evolution[] {
  const out: Evolution[] = [];
  for (const e of EVOLUTIONS) {
    if (weapons.has(e.result)) continue; // 이미 각성함
    if ((weapons.get(e.base) ?? 0) < EVOLVE_AT_LEVEL) continue;
    if ((passives.get(e.partner) ?? 0) < 1) continue;
    out.push(e);
  }
  return out;
}
