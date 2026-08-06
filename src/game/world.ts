/**
 * Phase 1 월드 — 엔진 골격 검증용 최소 게임플레이.
 *
 * 목표(작업계획 Phase 1 완료 기준):
 *   "캐릭터가 무한 맵을 돌아다니고 더미 적 300체가 60fps로 추적해 온다"
 *
 * 전투·무기·퀴즈는 Phase 2~3에서 붙인다. 여기서는 루프·입력·풀·충돌 그리드가
 * 목표 부하에서 실제로 버티는지만 확인한다.
 */
import { Pool } from '../core/pool';
import { SpatialGrid } from '../core/spatial';
import { makeRng, randRange, type Rng } from '../core/rng';
import type { Vec2 } from '../core/input';
import { BALANCE as B } from './balance';

export type Enemy = {
  alive: boolean;
  x: number;
  y: number;
  /** 보간용 직전 위치 */
  px: number;
  py: number;
  vx: number;
  vy: number;
  hp: number;
};

export type Player = {
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  invuln: number;
};

export class World {
  readonly enemies: Pool<Enemy>;
  readonly grid = new SpatialGrid(B.world.cellSize);
  readonly player: Player;

  time = 0;
  kills = 0;
  private spawnAcc = 0;
  private rng: Rng;

  /** 성능 측정을 위해 스폰을 강제로 채우는 모드 */
  stressTarget = 0;

  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.enemies = new Pool<Enemy>(
      () => ({ alive: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, hp: B.enemy.hp }),
      256,
    );
    this.player = {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      hp: B.player.maxHp,
      maxHp: B.player.maxHp,
      invuln: 0,
    };
  }

  update(dt: number, axis: Vec2) {
    this.time += dt;

    // ── 플레이어
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    p.x += axis.x * B.player.speed * dt;
    p.y += axis.y * B.player.speed * dt;
    if (p.invuln > 0) p.invuln -= dt;

    // ── 스폰
    this.spawn(dt);

    // ── 충돌 그리드 재구축 (매 프레임)
    this.grid.clear();
    this.enemies.forEach((e, i) => this.grid.insert(i, e.x, e.y));

    // ── 적 이동: 플레이어 추적 + 상호 분리
    const sepRadius = B.enemy.radius * 2;
    this.enemies.forEach((e) => {
      e.px = e.x;
      e.py = e.y;

      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      // 이웃과 밀어내기 — 전부 겹쳐 한 점이 되는 것을 막는다
      let sx = 0;
      let sy = 0;
      this.grid.query(e.x, e.y, sepRadius, (j) => {
        const o = this.enemies.at(j);
        if (o === e || !o.alive) return;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        if (d2 > sepRadius * sepRadius || d2 === 0) return;
        const d = Math.sqrt(d2);
        const w = (sepRadius - d) / sepRadius;
        sx += (ox / d) * w;
        sy += (oy / d) * w;
      });

      e.vx = dx * B.enemy.speed + sx * B.enemy.separation;
      e.vy = dy * B.enemy.speed + sy * B.enemy.separation;
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // 접촉 데미지
      if (p.invuln <= 0) {
        const hitR = B.enemy.radius + B.player.radius;
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < hitR * hitR) {
          p.hp = Math.max(0, p.hp - B.enemy.damage);
          p.invuln = B.player.invulnAfterHit;
        }
      }

      // 너무 멀어진 적은 정리 (무한 맵에서 메모리·연산 낭비 방지)
      if (Math.abs(p.x - e.x) > B.enemy.despawnDistance || Math.abs(p.y - e.y) > B.enemy.despawnDistance) {
        e.alive = false;
      }
    });

    this.enemies.compact();
  }

  private spawn(dt: number) {
    const target = this.stressTarget || B.spawn.maxAlive;
    if (this.enemies.active >= target) return;

    // 스트레스 모드에서는 목표치까지 즉시 채워 성능을 바로 측정한다
    if (this.stressTarget && this.enemies.active < this.stressTarget) {
      const need = Math.min(this.stressTarget - this.enemies.active, 64);
      for (let i = 0; i < need; i++) this.spawnOne();
      return;
    }

    this.spawnAcc += B.spawn.perSecond * dt;
    while (this.spawnAcc >= 1 && this.enemies.active < target) {
      this.spawnAcc -= 1;
      this.spawnOne();
    }
  }

  private spawnOne() {
    const e = this.enemies.spawn();
    const angle = this.rng() * Math.PI * 2;
    const r = randRange(this.rng, B.spawn.ringMin, B.spawn.ringMax);
    e.x = this.player.x + Math.cos(angle) * r;
    e.y = this.player.y + Math.sin(angle) * r;
    e.px = e.x;
    e.py = e.y;
    e.vx = 0;
    e.vy = 0;
    e.hp = B.enemy.hp;
  }

  reset() {
    this.enemies.clear();
    this.player.x = 0;
    this.player.y = 0;
    this.player.hp = this.player.maxHp;
    this.player.invuln = 0;
    this.time = 0;
    this.kills = 0;
    this.spawnAcc = 0;
  }
}
