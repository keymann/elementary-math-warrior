/**
 * 시뮬레이터용 조작 봇.
 *
 * 지금까지 밸런스를 실시간 플레이로 재던 문제가 있었다. 90° 회전 봇은 40초에 죽고
 * 원형 카이팅 봇은 3분을 버텨, **밸런스가 아니라 봇의 조작 수준을 측정**하고 있었다.
 * 그래서 실력을 `skill` 하나로 조절할 수 있는 봇을 만든다.
 *
 *   skill 0.0 → 위협을 거의 못 읽음(초보)
 *   skill 1.0 → 항상 최선의 회피 방향(숙련)
 *
 * 사람의 반응 지연도 흉내 낸다. 매 프레임 최적 방향을 다시 계산하면 사람보다
 * 훨씬 정교해져 클리어율이 부풀려진다.
 */
import type { Rng } from '../core/rng';
import type { World } from '../game/world';
import { ENEMY_KINDS } from '../game/enemies';

export type BotConfig = {
  /** 0~1. 회피 정확도와 반응 속도를 함께 좌우한다 */
  skill: number;
  rng: Rng;
};

const THREAT_RADIUS = 320;
const GEM_RADIUS = 420;

export class Bot {
  private dirX = 1;
  private dirY = 0;
  private cooldown = 0;

  constructor(private cfg: BotConfig) {}

  /** 다음 이동 입력. dt 만큼 시간이 흘렀다고 보고 갱신 주기를 관리한다. */
  decide(world: World, dt: number): { x: number; y: number } {
    this.cooldown -= dt;
    if (this.cooldown > 0) return { x: this.dirX, y: this.dirY };

    // 숙련도가 높을수록 자주 판단한다 (0.30초 → 0.08초)
    this.cooldown = 0.3 - 0.22 * this.cfg.skill;

    const p = world.player;
    let tx = 0;
    let ty = 0;

    // ── 위협 회피: 가까운 적일수록 강하게 밀어낸다
    world.enemies.forEach((e) => {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > THREAT_RADIUS * THREAT_RADIUS || d2 === 0) return;
      const d = Math.sqrt(d2);
      const w = (1 - d / THREAT_RADIUS) ** 2 * ENEMY_KINDS[e.kind].damage;
      tx += (dx / d) * w;
      ty += (dy / d) * w;
    });
    // 보스는 접촉 피해가 커서 따로 크게 친다
    if (world.boss.active) {
      const dx = p.x - world.boss.x;
      const dy = p.y - world.boss.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < THREAT_RADIUS * 1.4) {
        const w = (1 - d / (THREAT_RADIUS * 1.4)) ** 2 * world.boss.def.damage * 2;
        tx += (dx / d) * w;
        ty += (dy / d) * w;
      }
    }

    const threat = Math.hypot(tx, ty);

    // ── 위협이 약하면 보석을 주우러 간다. 회수율이 성장 속도를 좌우한다
    if (threat < 6) {
      let gx = 0;
      let gy = 0;
      let n = 0;
      world.gems.forEach((g) => {
        const dx = g.x - p.x;
        const dy = g.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > GEM_RADIUS * GEM_RADIUS) return;
        const d = Math.sqrt(d2) || 1;
        gx += dx / d;
        gy += dy / d;
        n++;
      });
      // 아이템(생선·자석·폭탄)은 보석보다 우선
      world.pickups.forEach((it) => {
        const dx = it.x - p.x;
        const dy = it.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        gx += (dx / d) * 6;
        gy += (dy / d) * 6;
        n += 6;
      });
      if (n) {
        tx = gx;
        ty = gy;
      }
    }

    let len = Math.hypot(tx, ty);
    if (len < 1e-6) {
      // 아무 정보가 없으면 가던 방향 유지
      tx = this.dirX;
      ty = this.dirY;
      len = Math.hypot(tx, ty) || 1;
    }
    let nx = tx / len;
    let ny = ty / len;

    // ── 실력에 따른 오차: 초보일수록 엉뚱한 방향으로 간다
    const err = (1 - this.cfg.skill) * Math.PI * 0.9;
    const a = Math.atan2(ny, nx) + (this.cfg.rng() * 2 - 1) * err;
    nx = Math.cos(a);
    ny = Math.sin(a);

    this.dirX = nx;
    this.dirY = ny;
    return { x: nx, y: ny };
  }
}
