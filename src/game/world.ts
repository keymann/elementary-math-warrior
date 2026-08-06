/**
 * 전투 코어 (Phase 2).
 *
 * 완료 기준: "퀴즈 없이 10분 생존 루프가 끝까지 돌아감"
 * 퀴즈·각성은 Phase 3 에서 레벨업 지점에 끼워 넣는다. 지금은 레벨업 시 자동으로
 * 보상 하나를 고른다(`upgrades.ts` 풀은 그대로 재사용).
 */
import { Pool } from '../core/pool';
import { SpatialGrid } from '../core/spatial';
import { makeRng, randRange, type Rng } from '../core/rng';
import type { Vec2 } from '../core/input';
import { BALANCE as B } from './balance';
import { ENEMY_KINDS, type EnemyKind } from './enemies';
import { hpScale, pickKind, spawnRate } from './waves';
import { makeProjectilePool, nextPid, stepProjectile, type Projectile } from './projectiles';
import { computeStats, type PassiveId, type Stats } from './stats';
import { STARTER_WEAPONS, WEAPON_BY_ID, type FireContext, type WeaponId } from './weapons';
import { rollUpgrades, type Upgrade } from './upgrades';
import { findEvolutions, type Evolution } from './evolution';

export type Enemy = {
  alive: boolean;
  kind: number; // ENEMY_KINDS 인덱스
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  /** 넉백 속도 — 매 프레임 감쇠 */
  kx: number;
  ky: number;
  /** 피격 연출용 잔여 시간 */
  flash: number;
  /** 중복 타격 방지 */
  lastPid: number;
  lastHitAt: number;
};

export type Gem = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  xp: number;
};

export type Player = {
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  invuln: number;
  level: number;
  xp: number;
  xpNext: number;
};

export type RunEvent =
  /** 레벨업 발생 — 여기서 게임을 멈추고 퀴즈 → 카드 순서로 진행한다 */
  | { type: 'levelup'; level: number }
  | { type: 'awaken'; evolution: Evolution }
  | { type: 'gameover'; reason: 'dead' | 'cleared' };

const maxEnemyRadius = Math.max(...ENEMY_KINDS.map((k) => k.radius));

export class World {
  readonly enemies: Pool<Enemy>;
  readonly projectiles: Pool<Projectile>;
  readonly gems: Pool<Gem>;
  readonly grid = new SpatialGrid(B.world.cellSize);
  readonly player: Player;

  /** 보유 무기/패시브 레벨 */
  readonly weapons = new Map<WeaponId, number>();
  readonly passives = new Map<PassiveId, number>();
  /** 무기별 남은 쿨다운 */
  private cooldowns = new Map<WeaponId, number>();
  stats: Stats;

  time = 0;
  kills = 0;
  over: null | 'dead' | 'cleared' = null;
  /** 화면 흔들림 요청량 (main 이 소비) */
  shakeRequest = 0;

  private spawnAcc = 0;
  private rng: Rng;
  private listeners: ((e: RunEvent) => void)[] = [];

  /** 성능 측정용 — 0이 아니면 이 수까지 즉시 채운다 */
  stressTarget = 0;
  /** 처리 대기 중인 레벨업 수. 대량 획득으로 한 번에 여러 레벨이 오를 수 있다. */
  pendingLevelUps = 0;

  constructor(seed = 1, starter: WeaponId = STARTER_WEAPONS[0]) {
    this.rng = makeRng(seed);
    this.enemies = new Pool<Enemy>(
      () => ({
        alive: false,
        kind: 0,
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        hp: 1,
        maxHp: 1,
        kx: 0,
        ky: 0,
        flash: 0,
        lastPid: 0,
        lastHitAt: -99,
      }),
      256,
    );
    this.projectiles = makeProjectilePool();
    this.gems = new Pool<Gem>(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, xp: 1 }), 256);

    this.weapons.set(starter, 1);
    this.cooldowns.set(starter, 0);
    this.stats = computeStats(this.passives);

    this.player = {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      hp: B.player.maxHp,
      maxHp: B.player.maxHp,
      invuln: 0,
      level: 1,
      xp: 0,
      xpNext: B.level.xpToNext(1),
    };
  }

  on(fn: (e: RunEvent) => void) {
    this.listeners.push(fn);
  }
  private emit(e: RunEvent) {
    for (const fn of this.listeners) fn(e);
  }

  /* ─────────────────────────── 메인 업데이트 ─────────────────────────── */

  update(dt: number, axis: Vec2) {
    if (this.over) return;

    this.time += dt;
    if (this.time >= B.world.runSeconds) {
      this.over = 'cleared';
      this.emit({ type: 'gameover', reason: 'cleared' });
      return;
    }

    this.movePlayer(dt, axis);
    this.spawn(dt);

    // 충돌 그리드는 적 위치 기준으로 매 프레임 다시 만든다
    this.grid.clear();
    this.enemies.forEach((e, i) => this.grid.insert(i, e.x, e.y));

    this.fireWeapons(dt);
    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepGems(dt);

    this.projectiles.compact();
    this.enemies.compact();
    this.gems.compact();
  }

  private movePlayer(dt: number, axis: Vec2) {
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    const sp = B.player.speed * this.stats.moveSpeed;
    p.x += axis.x * sp * dt;
    p.y += axis.y * sp * dt;
    if (p.invuln > 0) p.invuln -= dt;
  }

  /* ─────────────────────────── 스폰 ─────────────────────────── */

  private spawn(dt: number) {
    // 생존 상한은 시간에 따라 열린다 — 초반부터 화면이 가득 차면 피할 공간이 없다
    const cap = this.stressTarget || B.spawn.aliveCapAt(this.time);
    if (this.enemies.active >= cap) return;

    if (this.stressTarget) {
      const need = Math.min(this.stressTarget - this.enemies.active, 64);
      for (let i = 0; i < need; i++) this.spawnOne(pickKind(this.time, this.rng));
      return;
    }

    this.spawnAcc += spawnRate(this.time) * dt;
    while (this.spawnAcc >= 1 && this.enemies.active < cap) {
      this.spawnAcc -= 1;
      const kind = pickKind(this.time, this.rng);
      // 무리형은 뭉쳐서 등장
      const n = Math.min(kind.cluster, cap - this.enemies.active);
      const a = this.rng() * Math.PI * 2;
      const r = randRange(this.rng, B.spawn.ringMin, B.spawn.ringMax);
      for (let i = 0; i < n; i++) this.spawnOne(kind, a, r, i);
    }
  }

  private spawnOne(kind: EnemyKind, angle?: number, dist?: number, jitter = 0) {
    const e = this.enemies.spawn();
    const a = angle ?? this.rng() * Math.PI * 2;
    const r = dist ?? randRange(this.rng, B.spawn.ringMin, B.spawn.ringMax);
    const spread = jitter ? (jitter % 3) * 26 - 26 : 0;
    e.kind = ENEMY_KINDS.indexOf(kind);
    e.x = this.player.x + Math.cos(a) * r + spread;
    e.y = this.player.y + Math.sin(a) * r + (jitter ? Math.floor(jitter / 3) * 26 : 0);
    e.px = e.x;
    e.py = e.y;
    e.maxHp = kind.hp * hpScale(this.time, B.enemy.hpScaleSeconds);
    e.hp = e.maxHp;
    e.kx = 0;
    e.ky = 0;
    e.flash = 0;
    e.lastPid = 0;
    e.lastHitAt = -99;
  }

  /* ─────────────────────────── 무기 ─────────────────────────── */

  /** 가장 가까운 적 방향. 없으면 null */
  private aim(): number | null {
    const p = this.player;
    let best = -1;
    let bestD = Infinity;
    this.enemies.forEach((e, i) => {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return null;
    const e = this.enemies.at(best);
    return Math.atan2(e.y - p.y, e.x - p.x);
  }

  private fireWeapons(dt: number) {
    const aim = this.aim();
    const p = this.player;

    for (const [id, level] of this.weapons) {
      const def = WEAPON_BY_ID.get(id);
      if (!def) continue;
      const spec = def.spec(level);
      const cd = (this.cooldowns.get(id) ?? 0) - dt;
      if (cd > 0) {
        this.cooldowns.set(id, cd);
        continue;
      }
      this.cooldowns.set(id, spec.cooldown / this.stats.rate);

      const ctx: FireContext = {
        px: p.x,
        py: p.y,
        stats: this.stats,
        aim,
        spawn: (init) => {
          const pr = this.projectiles.spawn();
          pr.pid = nextPid();
          pr.kind = init.kind;
          pr.x = init.x ?? p.x;
          pr.y = init.y ?? p.y;
          pr.px = pr.x;
          pr.py = pr.y;
          pr.vx = init.vx ?? 0;
          pr.vy = init.vy ?? 0;
          pr.radius = init.radius ?? 8;
          pr.damage = (init.damage ?? 1) * this.stats.power;
          pr.pierce = init.pierce ?? 0;
          pr.life = init.life ?? 1;
          pr.knockback = init.knockback ?? 0;
          pr.angle = init.angle ?? 0;
          pr.orbitRadius = init.orbitRadius ?? 0;
          pr.orbitSpeed = init.orbitSpeed ?? 0;
          pr.splash = init.splash ?? 0;
          pr.rehit = init.rehit ?? 0;
        },
      };
      def.fire(ctx, spec);
    }
  }

  /* ─────────────────────────── 투사체 ─────────────────────────── */

  private stepProjectiles(dt: number) {
    const p = this.player;
    this.projectiles.forEach((pr) => {
      stepProjectile(pr, dt, p.x, p.y);
      if (!pr.alive) return;

      const reach = pr.radius + maxEnemyRadius;
      this.grid.query(pr.x, pr.y, reach, (i) => {
        if (!pr.alive) return;
        const e = this.enemies.at(i);
        if (!e.alive) return;

        const kind = ENEMY_KINDS[e.kind];
        const rr = pr.radius + kind.radius;
        if ((pr.x - e.x) ** 2 + (pr.y - e.y) ** 2 > rr * rr) return;

        // 같은 투사체가 같은 적을 연속으로 때리지 않게 한다
        if (e.lastPid === pr.pid) {
          if (pr.rehit <= 0) return;
          if (this.time - e.lastHitAt < pr.rehit) return;
        }
        e.lastPid = pr.pid;
        e.lastHitAt = this.time;

        this.damage(e, pr.damage);

        if (pr.knockback > 0) {
          const d = Math.hypot(e.x - pr.x, e.y - pr.y) || 1;
          e.kx += ((e.x - pr.x) / d) * pr.knockback;
          e.ky += ((e.y - pr.y) / d) * pr.knockback;
        }

        if (pr.splash > 0) {
          this.splash(pr.x, pr.y, pr.splash, pr.damage * 0.6, pr.pid);
          pr.alive = false;
          this.shakeRequest += 0.12;
          return;
        }

        if (pr.pierce > 0) pr.pierce--;
        else pr.alive = false;
      });
    });
  }

  private splash(x: number, y: number, radius: number, dmg: number, pid: number) {
    this.grid.query(x, y, radius + maxEnemyRadius, (i) => {
      const e = this.enemies.at(i);
      if (!e.alive || e.lastPid === pid) return;
      const kind = ENEMY_KINDS[e.kind];
      const rr = radius + kind.radius;
      if ((x - e.x) ** 2 + (y - e.y) ** 2 > rr * rr) return;
      e.lastPid = pid;
      e.lastHitAt = this.time;
      this.damage(e, dmg);
    });
  }

  private damage(e: Enemy, amount: number) {
    let dmg = amount;
    if (this.rng() < this.stats.crit) dmg *= this.stats.critMul;
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy) {
    e.alive = false;
    this.kills++;
    const kind = ENEMY_KINDS[e.kind];
    const g = this.gems.spawn();
    g.x = e.x;
    g.y = e.y;
    g.vx = 0;
    g.vy = 0;
    g.xp = kind.xp;
  }

  /* ─────────────────────────── 적 ─────────────────────────── */

  private stepEnemies(dt: number) {
    const p = this.player;
    const damp = Math.pow(B.enemy.knockbackDamp, dt);

    this.enemies.forEach((e) => {
      e.px = e.x;
      e.py = e.y;
      if (e.flash > 0) e.flash -= dt;

      const kind = ENEMY_KINDS[e.kind];
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      // 이웃과 밀어내기 — 전부 겹쳐 한 점이 되는 것을 막는다
      const sepR = kind.radius * 2;
      let sx = 0;
      let sy = 0;
      this.grid.query(e.x, e.y, sepR, (j) => {
        const o = this.enemies.at(j);
        if (o === e || !o.alive) return;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        if (d2 > sepR * sepR || d2 === 0) return;
        const d = Math.sqrt(d2);
        const w = (sepR - d) / sepR;
        sx += (ox / d) * w;
        sy += (oy / d) * w;
      });

      const vx = dx * kind.speed + sx * B.enemy.separation + e.kx;
      const vy = dy * kind.speed + sy * B.enemy.separation + e.ky;
      e.x += vx * dt;
      e.y += vy * dt;
      e.kx *= damp;
      e.ky *= damp;

      // 접촉 데미지
      if (p.invuln <= 0) {
        const hitR = kind.radius + B.player.radius;
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < hitR * hitR) {
          p.hp = Math.max(0, p.hp - kind.damage);
          p.invuln = B.player.invulnAfterHit;
          this.shakeRequest += 0.25;
          if (p.hp <= 0) {
            this.over = 'dead';
            this.emit({ type: 'gameover', reason: 'dead' });
          }
        }
      }

      if (
        Math.abs(p.x - e.x) > B.enemy.despawnDistance ||
        Math.abs(p.y - e.y) > B.enemy.despawnDistance
      ) {
        e.alive = false;
      }
    });
  }

  /* ─────────────────────────── 보석 · 레벨업 ─────────────────────────── */

  private stepGems(dt: number) {
    const p = this.player;
    const magnet = B.player.magnetRadius * this.stats.magnet;
    const pickR = B.player.radius + B.gem.radius;

    this.gems.forEach((g) => {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < magnet * magnet) {
        const d = Math.sqrt(d2) || 1;
        g.vx += (dx / d) * B.gem.pullAccel * dt;
        g.vy += (dy / d) * B.gem.pullAccel * dt;
        const sp = Math.hypot(g.vx, g.vy);
        if (sp > B.gem.maxSpeed) {
          g.vx = (g.vx / sp) * B.gem.maxSpeed;
          g.vy = (g.vy / sp) * B.gem.maxSpeed;
        }
      }

      g.x += g.vx * dt;
      g.y += g.vy * dt;

      if (d2 < pickR * pickR) {
        g.alive = false;
        this.addXp(g.xp);
        return;
      }
      if (Math.abs(dx) > B.gem.despawnDistance || Math.abs(dy) > B.gem.despawnDistance) g.alive = false;
    });
  }

  private addXp(amount: number) {
    const p = this.player;
    p.xp += amount;
    // 한 번에 여러 레벨이 오를 수 있다 (맵 전체 자석 같은 대량 획득)
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = B.level.xpToNext(p.level);
      this.levelUp();
    }
  }

  /**
   * 레벨업은 여기서 **적용하지 않는다.**
   * 바깥(main)이 게임을 멈추고 퀴즈를 띄운 뒤, 정답이면 카드 3택을 받아 적용한다.
   * 퀴즈가 열려 있는 동안 타이머가 멈추는 것이 이 게임의 핵심 규칙이다
   * (원작 블랙박스 측정 3장 — 문제 푸는 시간이 생존 시간을 깎지 않는다).
   */
  private levelUp() {
    this.pendingLevelUps++;
    this.emit({ type: 'levelup', level: this.player.level });
  }

  /** 보상 후보 3장 */
  rollChoices(n = 3): Upgrade[] {
    return rollUpgrades({ weapons: this.weapons, passives: this.passives }, this.rng, n);
  }

  /**
   * 각성 판정 — 레벨업 문제를 맞힌 뒤에만 호출한다.
   * 조건을 만족하는 조합이 있으면 하나 진화시키고 그 조합을 돌려준다.
   */
  tryEvolve(): Evolution | null {
    const found = findEvolutions(this.weapons, this.passives);
    if (!found.length) return null;
    const e = found[0];
    this.weapons.delete(e.base);
    this.cooldowns.delete(e.base);
    this.weapons.set(e.result, 1);
    this.cooldowns.set(e.result, 0);
    this.emit({ type: 'awaken', evolution: e });
    return e;
  }

  applyUpgrade(u: Upgrade) {
    if (u.type === 'weapon') {
      this.weapons.set(u.id, u.level);
      if (!this.cooldowns.has(u.id)) this.cooldowns.set(u.id, 0);
    } else {
      const before = this.stats.maxHp;
      this.passives.set(u.id, u.level);
      this.stats = computeStats(this.passives);
      // 최대 체력이 늘면 그만큼 즉시 회복한다 (원작 하트 배지와 같은 방식)
      const grew = this.stats.maxHp / before;
      if (grew > 1) {
        const newMax = B.player.maxHp * this.stats.maxHp;
        const delta = newMax - this.player.maxHp;
        this.player.maxHp = newMax;
        this.player.hp = Math.min(newMax, this.player.hp + delta);
      }
    }
    this.stats = computeStats(this.passives);
  }

  reset(seed = 1, starter: WeaponId = STARTER_WEAPONS[0]) {
    this.enemies.clear();
    this.projectiles.clear();
    this.gems.clear();
    this.weapons.clear();
    this.passives.clear();
    this.cooldowns.clear();
    this.weapons.set(starter, 1);
    this.cooldowns.set(starter, 0);
    this.stats = computeStats(this.passives);
    this.rng = makeRng(seed);

    const p = this.player;
    p.x = p.y = p.px = p.py = 0;
    p.maxHp = B.player.maxHp;
    p.hp = p.maxHp;
    p.invuln = 0;
    p.level = 1;
    p.xp = 0;
    p.xpNext = B.level.xpToNext(1);

    this.time = 0;
    this.kills = 0;
    this.over = null;
    this.spawnAcc = 0;
    this.shakeRequest = 0;
    this.pendingLevelUps = 0;
  }
}
