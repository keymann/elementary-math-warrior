/**
 * 투사체 — 무기의 "결과물"만 다룬다. 발사 규칙은 weapons.ts 가 갖는다.
 *
 * 관통 무기가 같은 적을 매 프레임 때리는 것을 막기 위해, 투사체마다 고유 pid 를 주고
 * 적은 마지막으로 맞은 pid 와 시각을 기억한다. Set 을 만들지 않아 할당이 없다.
 */
import { Pool } from '../core/pool';

export type ProjKind =
  | 'straight' // 직진 (연필)
  | 'pierce' // 관통 (샤프펜슬)
  | 'orbit' // 플레이어 주변 회전 (컴퍼스)
  | 'cone' // 부채꼴 (각도기)
  | 'bolt' // 느린 대형 에너지탄, 착탄 시 광역 (계산기)
  | 'aura'; // 플레이어 주변 파동, 넉백 (지우개)

export type Projectile = {
  alive: boolean;
  kind: ProjKind;
  /** 고유 식별자 — 중복 타격 방지용 */
  pid: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  /** 남은 관통 횟수. 0 이면 첫 타격에 소멸 */
  pierce: number;
  life: number;
  /** 넉백 세기 (0 이면 없음) */
  knockback: number;
  /** orbit / aura 용 */
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  /** bolt 착탄 시 광역 반경 (0 이면 단일 타격) */
  splash: number;
  /** 같은 적을 다시 때릴 수 있게 되는 간격(초). 0 이면 재타격 없음 */
  rehit: number;
};

let pidSeq = 1;

export function makeProjectilePool() {
  return new Pool<Projectile>(
    () => ({
      alive: false,
      kind: 'straight',
      pid: 0,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      radius: 6,
      damage: 1,
      pierce: 0,
      life: 1,
      knockback: 0,
      angle: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      splash: 0,
      rehit: 0,
    }),
    256,
  );
}

export function nextPid() {
  return pidSeq++;
}

/** 위치 갱신. orbit/aura 는 플레이어를 기준으로 다시 계산한다. */
export function stepProjectile(p: Projectile, dt: number, playerX: number, playerY: number) {
  p.px = p.x;
  p.py = p.y;
  p.life -= dt;

  switch (p.kind) {
    case 'orbit':
      p.angle += p.orbitSpeed * dt;
      p.x = playerX + Math.cos(p.angle) * p.orbitRadius;
      p.y = playerY + Math.sin(p.angle) * p.orbitRadius;
      break;
    case 'aura':
      // 파동이 퍼져나간다
      p.x = playerX;
      p.y = playerY;
      p.radius += p.orbitSpeed * dt;
      break;
    default:
      p.x += p.vx * dt;
      p.y += p.vy * dt;
  }

  if (p.life <= 0) p.alive = false;
}
