/**
 * 스폰 웨이브 스케줄.
 *
 * 난이도는 **적 체력과 스폰 밀도로만** 올린다. 문제 난이도로 조절하지 않는다는
 * 원칙(작업계획 4장)을 지키기 위해서다.
 *
 * 원작 블랙박스 측정에서 첫 이벤트가 13초에 등장했다. 초반 공백을 만들지 않는다.
 */
import { ENEMY_KINDS, type EnemyKind } from './enemies';
import type { Rng } from '../core/rng';

/**
 * 초당 스폰 수 — 0분 3마리에서 10분 25마리까지.
 * 첫 측정에서 8/s 로 시작했더니 45초 만에 생존 상한(300)에 닿아
 * 플레이어가 피할 공간이 사라졌다. 처치 속도와 균형을 맞춘 값.
 */
export function spawnRate(t: number): number {
  const minutes = t / 60;
  return 3 + minutes * 2.2;
}

/** 시간에 따른 적 체력 배수 */
export function hpScale(t: number, scaleSeconds: number): number {
  return 1 + t / scaleSeconds;
}

/** 현재 시각에 등장 가능한 종류 중 가중치로 하나 고른다. */
export function pickKind(t: number, rng: Rng): EnemyKind {
  let total = 0;
  for (const k of ENEMY_KINDS) if (t >= k.from) total += k.weight;
  let r = rng() * total;
  for (const k of ENEMY_KINDS) {
    if (t < k.from) continue;
    r -= k.weight;
    if (r <= 0) return k;
  }
  return ENEMY_KINDS[0];
}
