/**
 * 전투 루프 + 타임라인 (Phase 2~4).
 *
 * 시간이 멈추는 두 경우를 구분한다.
 *  - `loop.setPaused()` : 퀴즈·카드 오버레이가 떠 있을 때. 시뮬레이션 자체가 멈춘다.
 *  - `timeFrozen`       : 보스전. 적도 움직이고 전투도 계속되지만 **타이머만** 멈춘다.
 *
 * 보스를 잡는 데 걸린 시간이 생존 시간에서 깎이면 "보스를 피해 도망치기"가
 * 최적 전략이 되어 버린다. 원작 블랙박스 측정에서 확인한 규칙이다.
 */
import { Pool } from '../core/pool';
import { SpatialGrid } from '../core/spatial';
import { makeRng, randRange, type Rng } from '../core/rng';
import type { Vec2 } from '../core/input';
import { BALANCE as B } from './balance';
import { ENEMY_KINDS, type EnemyKind, type EnemyKindId } from './enemies';
import { hpScale, pickKind, spawnRate } from './waves';
import { makeProjectilePool, nextPid, stepProjectile, type Projectile } from './projectiles';
import { computeStats, type PassiveId, type Stats } from './stats';
import { STARTER_WEAPONS, WEAPON_BY_ID, type FireContext, type WeaponId } from './weapons';
import { rollUpgrades, type Upgrade } from './upgrades';
import { findEvolutions, type Evolution } from './evolution';
import { Director, type TimelineEvent } from './director';
import { BOSSES, HIDDEN_ACCURACY, makeBoss, type Boss, type BossKindId } from './boss';
import { makePickupPool, type Pickup, type PickupKind } from './pickups';
import { biomeAt } from '../render/terrain';

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
  flash: number;
  /** 이동 거리 누적 — 애니메이션 위상. 걸을 때만 모션이 돈다 */
  anim: number;
  lastPid: number;
  lastHitAt: number;
};

export type Gem = { alive: boolean; x: number; y: number; vx: number; vy: number; xp: number };

export type Player = {
  x: number;
  y: number;
  px: number;
  py: number;
  /** 실제 속도 — 지형에 따라 관성이 붙는다(눈밭은 미끄럽다) */
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  invuln: number;
  level: number;
  xp: number;
  xpNext: number;
};

export type RunEvent =
  | { type: 'levelup'; level: number }
  | { type: 'awaken'; evolution: Evolution }
  /** 미믹 처치 → 보너스 문제 */
  | { type: 'bonus' }
  /** 초월 수련 — 특별 문제 3개 */
  | { type: 'trial' }
  | { type: 'transcend' }
  | { type: 'boss'; id: BossKindId; name: string }
  | { type: 'bossdown'; id: BossKindId }
  /** 중간보스를 제한 시간 안에 못 잡아 물러남 */
  | { type: 'bossflee'; id: BossKindId }
  /** 최종보스 방어막 — 문제를 맞혀야 깨진다 */
  | { type: 'shield' }
  /** 히든 보스 등장 */
  | { type: 'hidden' }
  | { type: 'pickup'; kind: PickupKind }
  | { type: 'gameover'; reason: 'dead' | 'cleared' };

const kindIndex = (id: EnemyKindId) => ENEMY_KINDS.findIndex((k) => k.id === id);
const maxEnemyRadius = Math.max(...ENEMY_KINDS.map((k) => k.radius));

export class World {
  readonly enemies: Pool<Enemy>;
  readonly projectiles: Pool<Projectile>;
  readonly gems: Pool<Gem>;
  readonly pickups: Pool<Pickup>;
  readonly grid = new SpatialGrid(B.world.cellSize);
  readonly player: Player;
  readonly boss: Boss = makeBoss();

  readonly weapons = new Map<WeaponId, number>();
  readonly passives = new Map<PassiveId, number>();
  private cooldowns = new Map<WeaponId, number>();
  stats: Stats;

  time = 0;
  kills = 0;
  over: null | 'dead' | 'cleared' = null;
  shakeRequest = 0;
  pendingLevelUps = 0;
  /** 보스전 중에는 타이머만 멈춘다 (전투는 계속) */
  timeFrozen = false;
  /** 보스전 경과 시간 — 교착 방지용 */
  private bossElapsed = 0;
  /**
   * 히든 보스 개방 조건 — 바깥(main)이 정답률을 넘겨준다.
   * 문제를 잘 푼 학생에게 더 큰 무대를 주는 것이 이 게임의 방향이다.
   */
  accuracyProvider: (() => number | null) | null = null;
  transcended = false;

  private director = new Director();
  private spawnAcc = 0;
  private rng: Rng;
  private listeners: ((e: RunEvent) => void)[] = [];
  private transcendBonus = { power: 1, rate: 1 };
  private trialBonus = 0;

  stressTarget = 0;

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
        anim: 0,
        lastPid: 0,
        lastHitAt: -99,
      }),
      256,
    );
    this.projectiles = makeProjectilePool();
    this.gems = new Pool<Gem>(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, xp: 1 }), 256);
    this.pickups = makePickupPool();

    this.weapons.set(starter, 1);
    this.cooldowns.set(starter, 0);
    this.stats = this.recomputeStats();

    this.player = {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
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

  private recomputeStats(): Stats {
    const s = computeStats(this.passives);
    s.power *= this.transcendBonus.power;
    s.rate *= this.transcendBonus.rate;
    return s;
  }

  /* ─────────────────────────── 메인 업데이트 ─────────────────────────── */

  update(dt: number, axis: Vec2) {
    if (this.over) return;

    // 보스전 동안에는 타이머만 멈춘다
    if (!this.timeFrozen) {
      this.time += dt;
      for (const e of this.director.step(this.time)) this.handleCue(e);
    }

    this.movePlayer(dt, axis);
    this.spawn(dt);

    this.grid.clear();
    this.enemies.forEach((e, i) => this.grid.insert(i, e.x, e.y));

    this.fireWeapons(dt);
    this.stepProjectiles(dt);
    this.stepEnemies(dt);
    this.stepBoss(dt);
    this.checkBossStall(dt);
    this.stepGems(dt);
    this.stepPickups(dt);

    this.projectiles.compact();
    this.enemies.compact();
    this.gems.compact();
    this.pickups.compact();
  }

  private handleCue(e: TimelineEvent) {
    switch (e.type) {
      case 'boss':
        this.spawnBoss(e.id);
        break;
      case 'trial':
        this.emit({ type: 'trial' });
        break;
      case 'transcend':
        this.transcend();
        break;
      case 'star':
        this.spawnSpecial('mimic');
        break;
      case 'cat':
        this.spawnSpecial('cat');
        break;
    }
  }

  /** 현재 지형의 효과 */
  get biomeMod() {
    return B.biome[biomeAt(this.time)] ?? B.biome.grass;
  }

  private movePlayer(dt: number, axis: Vec2) {
    const p = this.player;
    p.px = p.x;
    p.py = p.y;

    const mod = this.biomeMod;
    const sp = B.player.speed * this.stats.moveSpeed * mod.player;
    // 목표 속도로 서서히 붙는다. accel 이 크면 즉각 반응(기본), 작으면 미끄러진다(눈밭)
    const k = 1 - Math.exp(-mod.accel * dt);
    p.vx += (axis.x * sp - p.vx) * k;
    p.vy += (axis.y * sp - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.invuln > 0) p.invuln -= dt;
  }

  /* ─────────────────────────── 스폰 ─────────────────────────── */

  private spawn(dt: number) {
    const cap = this.stressTarget || B.spawn.aliveCapAt(this.time);
    if (this.enemies.active >= cap) return;

    if (this.stressTarget) {
      const need = Math.min(this.stressTarget - this.enemies.active, 64);
      for (let i = 0; i < need; i++) this.spawnOne(pickKind(this.time, this.rng));
      return;
    }

    // 보스전 중에는 일반 적을 줄인다 — 보스에 집중할 여지를 준다
    const scale = this.boss.active ? B.boss.spawnScaleDuringBoss : 1;
    this.spawnAcc += spawnRate(this.time) * scale * dt;
    while (this.spawnAcc >= 1 && this.enemies.active < cap) {
      this.spawnAcc -= 1;
      const kind = pickKind(this.time, this.rng);
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
    e.anim = 0;
    e.lastPid = 0;
    e.lastHitAt = -99;
    return e;
  }

  private spawnSpecial(id: 'mimic' | 'cat') {
    const kind = ENEMY_KINDS[kindIndex(id)];
    // 화면 밖에서 등장하되 너무 멀지 않게 — 놓치면 아깝다는 느낌이 있어야 한다
    this.spawnOne(kind, this.rng() * Math.PI * 2, B.spawn.ringMin * 0.85);
  }

  spawnBoss(id: BossKindId) {
    const def = BOSSES[id];
    const b = this.boss;
    const a = this.rng() * Math.PI * 2;
    b.active = true;
    b.def = def;
    b.x = this.player.x + Math.cos(a) * B.boss.spawnDistance;
    b.y = this.player.y + Math.sin(a) * B.boss.spawnDistance;
    b.px = b.x;
    b.py = b.y;
    b.maxHp = def.hp;
    b.hp = def.hp;
    b.flash = 0;
    b.pendingShields = [...def.shieldAt];
    b.shielded = false;
    b.lastPid = 0;
    b.lastHitAt = -99;
    b.anim = 0;
    b.facing = 1;
    b.breathCd = def.breathEvery * 0.6; // 등장 직후 바로 뿜지는 않는다
    b.breathing = 0;
    b.breathAngle = 0;

    this.timeFrozen = true; // 보스전 동안 타이머 정지
    this.emit({ type: 'boss', id, name: def.name });

    // 최종보스는 등장과 동시에 방어막을 올린다
    this.checkShield();
  }

  /* ─────────────────────────── 무기 ─────────────────────────── */

  private aim(): number | null {
    const p = this.player;
    let bestX = 0;
    let bestY = 0;
    let bestD = Infinity;
    this.enemies.forEach((e) => {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestX = e.x;
        bestY = e.y;
      }
    });
    // 보스가 있으면 **보스를 우선 조준한다.**
    // 가장 가까운 적만 노리게 두면 잡몹이 항상 더 가까워 보스에 피해가 거의 안 들어가고,
    // 타이머가 멈춘 채 보스전이 끝나지 않는다(시뮬레이터에서 실제로 720초 교착 발생).
    if (this.boss.active) {
      bestD = 0;
      bestX = this.boss.x;
      bestY = this.boss.y;
    }
    if (bestD === Infinity) return null;
    return Math.atan2(bestY - p.y, bestX - p.x);
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
          pr.owner = id;
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

      // 보스 피격
      if (pr.alive && this.boss.active) {
        const b = this.boss;
        const rr = pr.radius + b.def.radius;
        if ((pr.x - b.x) ** 2 + (pr.y - b.y) ** 2 <= rr * rr) {
          const fresh = b.lastPid !== pr.pid || (pr.rehit > 0 && this.time - b.lastHitAt >= pr.rehit);
          if (fresh) {
            b.lastPid = pr.pid;
            b.lastHitAt = this.time;
            this.damageBoss(pr.damage);
          }
          if (pr.splash > 0) {
            this.splash(pr.x, pr.y, pr.splash, pr.damage * 0.6, pr.pid);
            pr.alive = false;
          } else if (pr.pierce > 0) pr.pierce--;
          else pr.alive = false;
        }
      }
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

  private rollDamage(amount: number) {
    return this.rng() < this.stats.crit ? amount * this.stats.critMul : amount;
  }

  private damage(e: Enemy, amount: number) {
    e.hp -= this.rollDamage(amount);
    e.flash = 0.12;
    if (e.hp <= 0) this.kill(e);
  }

  private damageBoss(amount: number) {
    const b = this.boss;
    if (b.shielded) return; // 방어막 — 문제를 맞혀야 깨진다
    b.hp -= this.rollDamage(amount);
    b.flash = 0.1;
    if (b.hp <= 0) this.killBoss();
    else this.checkShield();
  }

  private checkShield() {
    const b = this.boss;
    if (!b.pendingShields.length || b.shielded) return;
    const ratio = b.hp / b.maxHp;
    if (ratio <= b.pendingShields[0]) {
      b.pendingShields.shift();
      b.shielded = true;
      this.emit({ type: 'shield' });
    }
  }

  /** 테스트용 — 보스를 즉시 처치한다 */
  defeatBoss() {
    if (this.boss.active) {
      this.boss.hp = 0;
      this.boss.shielded = false;
      this.killBoss();
    }
  }

  /** 방어막 해제 — 문제를 맞혔을 때 바깥에서 호출 */
  breakShield() {
    this.boss.shielded = false;
    this.shakeRequest += 0.4;
  }

  private killBoss() {
    const b = this.boss;
    b.active = false;
    this.timeFrozen = false;
    this.kills++;
    this.addXp(b.def.xp);
    this.shakeRequest += 0.6;
    this.emit({ type: 'bossdown', id: b.def.id });

    if (b.def.id === 'final') {
      const acc = this.accuracyProvider?.() ?? 0;
      if ((acc ?? 0) >= HIDDEN_ACCURACY) {
        this.emit({ type: 'hidden' });
        this.spawnBoss('hidden');
        return;
      }
      this.over = 'cleared';
      this.emit({ type: 'gameover', reason: 'cleared' });
    } else if (b.def.id === 'hidden') {
      this.over = 'cleared';
      this.emit({ type: 'gameover', reason: 'cleared' });
    }
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

    if (kind.id === 'mimic') this.emit({ type: 'bonus' });
    else if (kind.id === 'cat') this.dropPickup('fish', e.x, e.y);
  }

  dropPickup(kind: PickupKind, x: number, y: number) {
    const p = this.pickups.spawn();
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.age = 0;
  }

  /* ─────────────────────────── 적 · 보스 ─────────────────────────── */

  private stepEnemies(dt: number) {
    const p = this.player;
    const damp = Math.pow(B.enemy.knockbackDamp, dt);
    const enemyMod = this.biomeMod.enemy;

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
      // 도망치는 적(고양이)은 가까울 때만 반대로 달린다
      if (kind.flee && dist < B.special.cat.fleeRadius) {
        dx = -dx;
        dy = -dy;
      }

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

      e.x += (dx * kind.speed * enemyMod + sx * B.enemy.separation + e.kx) * dt;
      e.y += (dy * kind.speed * enemyMod + sy * B.enemy.separation + e.ky) * dt;
      // 이동한 거리만큼 애니메이션을 돌린다 — 미믹 뚜껑은 움직일 때만 여닫힌다
      e.anim += Math.hypot(e.x - e.px, e.y - e.py);
      e.kx *= damp;
      e.ky *= damp;

      if (p.invuln <= 0) {
        const hitR = kind.radius + B.player.radius;
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < hitR * hitR) this.hurtPlayer(kind.damage);
      }

      if (
        Math.abs(p.x - e.x) > B.enemy.despawnDistance ||
        Math.abs(p.y - e.y) > B.enemy.despawnDistance
      ) {
        e.alive = false;
      }
    });
  }

  private stepBoss(dt: number) {
    const b = this.boss;
    if (!b.active) return;
    b.px = b.x;
    b.py = b.y;
    if (b.flash > 0) b.flash -= dt;

    const p = this.player;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy) || 1;

    // 불 뿜는 동안에는 제자리에 선다 — 예고 동작이 있어야 피할 수 있다
    if (b.breathing <= 0) {
      b.x += (dx / d) * b.def.speed * dt;
      b.y += (dy / d) * b.def.speed * dt;
      if (Math.abs(dx) > 1) b.facing = dx > 0 ? 1 : -1;
    }
    b.anim += Math.hypot(b.x - b.px, b.y - b.py) + dt * 12; // 멈춰 있어도 날개는 친다

    // ── 불 뿜기
    if (b.breathing > 0) {
      b.breathing -= dt;
      // 화염 원뿔 안에 있으면 지속 피해
      const ang = Math.atan2(dy, dx);
      let diff = Math.abs(((ang - b.breathAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (d < b.def.breathRange && diff < 0.42) {
        p.hp = Math.max(0, p.hp - b.def.breathDps * dt);
        if (p.hp <= 0) {
          this.over = 'dead';
          this.emit({ type: 'gameover', reason: 'dead' });
        }
      }
    } else {
      b.breathCd -= dt;
      if (b.breathCd <= 0) {
        b.breathCd = b.def.breathEvery;
        b.breathing = b.def.breathTime;
        b.breathAngle = Math.atan2(dy, dx); // 시작 시점 방향으로 고정 — 옆으로 피할 수 있다
      }
    }

    if (p.invuln <= 0 && d < b.def.radius + B.player.radius) this.hurtPlayer(b.def.damage);
  }

  /**
   * 중간보스 교착 방지.
   * 타이머가 멈춘 상태에서 보스를 못 잡으면 판이 영원히 끝나지 않는다.
   * 일정 시간이 지나면 보스가 물러나고 타이머를 다시 흐르게 한다.
   * (최종보스는 예외 — 그건 엔딩이라 물러나면 안 된다)
   */
  private checkBossStall(dt: number) {
    if (!this.boss.active) {
      this.bossElapsed = 0;
      return;
    }
    this.bossElapsed += dt;
    if (this.boss.def.id === 'final') return;
    if (this.bossElapsed < B.boss.stallSeconds) return;

    this.boss.active = false;
    this.timeFrozen = false;
    this.bossElapsed = 0;
    this.emit({ type: 'bossflee', id: this.boss.def.id });
  }

  private hurtPlayer(amount: number) {
    const p = this.player;
    p.hp = Math.max(0, p.hp - amount * B.enemy.damageScaleAt(this.time));
    p.invuln = B.player.invulnAfterHit;
    this.shakeRequest += 0.25;
    if (p.hp <= 0) {
      this.over = 'dead';
      this.emit({ type: 'gameover', reason: 'dead' });
    }
  }

  /* ─────────────────────────── 보석 · 아이템 ─────────────────────────── */

  private stepGems(dt: number) {
    const p = this.player;
    const magnet = B.player.magnetRadius * this.stats.magnet * this.biomeMod.gem;
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

  private stepPickups(dt: number) {
    const p = this.player;
    const r = B.special.pickupRadius + B.player.radius;
    this.pickups.forEach((it) => {
      it.age += dt;
      if ((p.x - it.x) ** 2 + (p.y - it.y) ** 2 < r * r) {
        it.alive = false;
        this.applyPickup(it.kind);
      }
    });
  }

  private applyPickup(kind: PickupKind) {
    if (kind === 'fish') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + B.special.fishHeal);
    } else if (kind === 'magnet') {
      // 맵 전체 자석 — 흩어진 보석을 한꺼번에 회수한다.
      // 원작 측정에서 이 한 방에 레벨이 1~2 올랐다. 밸런싱 시 상한 검증 대상.
      let xp = 0;
      this.gems.forEach((g) => {
        xp += g.xp;
        g.alive = false;
      });
      this.gems.compact();
      if (xp) this.addXp(xp);
    } else {
      // 맵 전체 폭탄
      this.enemies.forEach((e) => this.damage(e, B.special.bombDamage));
      if (this.boss.active) this.damageBoss(B.special.bombDamage * 0.5);
      this.shakeRequest += 0.5;
    }
    this.emit({ type: 'pickup', kind });
  }

  /* ─────────────────────────── 성장 ─────────────────────────── */

  private addXp(amount: number) {
    const p = this.player;
    p.xp += amount;
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
   */
  private levelUp() {
    this.pendingLevelUps++;
    this.emit({ type: 'levelup', level: this.player.level });
  }

  /** 테스트용 — 특정 시각으로 건너뛴다. 지나친 타임라인 큐는 발동하지 않는다. */
  skipTo(t: number) {
    this.time = t;
    this.director.skipTo(t);
  }

  rollChoices(n = 3): Upgrade[] {
    return rollUpgrades({ weapons: this.weapons, passives: this.passives }, this.rng, n);
  }

  /** 각성 판정 — 레벨업 문제를 맞힌 뒤에만 호출한다. */
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

  /**
   * 초월 수련 결과 반영 — 맞힌 문제 수만큼 초월이 강해진다.
   * 문제를 푸는 것이 곧 힘이 되는 구조를 마지막 구간에서 한 번 더 보여 준다.
   */
  addTranscendBonus(correct: number) {
    this.trialBonus = correct;
  }

  /** 초월 — 9분 파워스파이크. 최종보스를 상대할 수 있게 해 준다. */
  private transcend() {
    this.transcended = true;
    // 초월 수련에서 맞힌 문제 1개당 +10%
    this.transcendBonus = {
      power: B.transcend.power + this.trialBonus * 0.1,
      rate: B.transcend.rate,
    };
    this.stats = this.recomputeStats();
    this.player.hp = this.player.maxHp;
    this.emit({ type: 'transcend' });
  }

  applyUpgrade(u: Upgrade) {
    if (u.type === 'weapon') {
      this.weapons.set(u.id, u.level);
      if (!this.cooldowns.has(u.id)) this.cooldowns.set(u.id, 0);
    } else {
      const before = this.stats.maxHp;
      this.passives.set(u.id, u.level);
      this.stats = this.recomputeStats();
      // 최대 체력이 늘면 그만큼 즉시 회복한다
      if (this.stats.maxHp / before > 1) {
        const newMax = B.player.maxHp * this.stats.maxHp;
        const delta = newMax - this.player.maxHp;
        this.player.maxHp = newMax;
        this.player.hp = Math.min(newMax, this.player.hp + delta);
      }
    }
    this.stats = this.recomputeStats();
  }

  reset(seed = 1, starter: WeaponId = STARTER_WEAPONS[0]) {
    this.enemies.clear();
    this.projectiles.clear();
    this.gems.clear();
    this.pickups.clear();
    this.weapons.clear();
    this.passives.clear();
    this.cooldowns.clear();
    this.weapons.set(starter, 1);
    this.cooldowns.set(starter, 0);
    this.transcendBonus = { power: 1, rate: 1 };
    this.trialBonus = 0;
    this.transcended = false;
    this.stats = this.recomputeStats();
    this.rng = makeRng(seed);
    this.director.reset();
    this.boss.active = false;
    this.timeFrozen = false;
    this.bossElapsed = 0;

    const p = this.player;
    p.x = p.y = p.px = p.py = 0;
    p.vx = p.vy = 0;
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
