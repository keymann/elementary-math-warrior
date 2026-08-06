/**
 * 특수 아이템 — 보석과 달리 걸어가서 주워야 발동한다.
 *
 * 원작 측정에서 "🧲 자석 아이템 드랍!" 과 "🧲 맵 전체 자석!!" 이 별개 이벤트였다.
 * 즉 드랍 → 획득 순서를 거친다. 즉시 발동보다 한 박자 느리지만, 주우러 가는
 * 동선이 생겨 플레이가 단조로워지지 않는다.
 */
import { Pool } from '../core/pool';

export type PickupKind = 'fish' | 'magnet' | 'bomb';

export type Pickup = {
  alive: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  /** 등장 연출용 */
  age: number;
};

export const PICKUP_EMOJI: Record<PickupKind, string> = {
  fish: '🐟',
  magnet: '🧲',
  bomb: '💣',
};

export const PICKUP_LABEL: Record<PickupKind, string> = {
  fish: '🐟 생선을 먹었다! 체력 회복',
  magnet: '🧲 맵 전체 자석!!',
  bomb: '💣 맵 전체 폭탄!!',
};

export function makePickupPool() {
  return new Pool<Pickup>(() => ({ alive: false, kind: 'fish', x: 0, y: 0, age: 0 }), 16);
}
