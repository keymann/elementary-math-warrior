/**
 * 헤드리스 단일 런.
 *
 * 렌더 없이 고정 타임스텝만 돌린다. 실시간 10분짜리 판을 수 초에 끝내므로
 * 밸런스를 반복 튜닝할 수 있다.
 *
 * 퀴즈는 실제로 출제하지 않는다. 시뮬레이터가 재는 것은 **게임 밸런스**이고
 * 문제 정답 여부는 입력 변수(`accuracy`)로 두는 편이 해석하기 쉽다.
 * (문제 자체의 품질은 어댑터 PoC 가 따로 검증한다)
 */
import { FIXED_DT } from '../core/loop';
import { makeRng } from '../core/rng';
import { World } from '../game/world';
import type { Upgrade } from '../game/upgrades';
import { EVOLUTIONS } from '../game/evolution';
import { EVOLVE_AT_LEVEL } from '../game/evolution';
import type { WeaponId } from '../game/weapons';
import { Bot } from './bot';

export type RunConfig = {
  seed: number;
  starter: WeaponId;
  /** 문제 정답률 0~1 */
  accuracy: number;
  /** 조작 실력 0~1 */
  skill: number;
  /** 최대 진행 시간(초). 기본 15분 — 최종보스전은 타이머가 멈추므로 여유를 둔다 */
  maxSeconds?: number;
};

export type RunResult = {
  cleared: boolean;
  /** 게임 내 생존 시간(초) */
  time: number;
  kills: number;
  level: number;
  levelUps: number;
  /** 정답을 맞혀 실제로 받은 강화 수 */
  upgrades: number;
  evolved: string[];
  weapons: [string, number][];
  passives: [string, number][];
  /** 3·6·10분 보스를 잡았는지 */
  bossesKilled: string[];
  /** 실제로 돌린 스텝 수 (성능 확인용) */
  steps: number;
};

/**
 * 강화 선택 정책.
 * 각성 경로를 우선 완성한다 — 사람도 도감을 보고 그렇게 고른다.
 */
function pickUpgrade(world: World, choices: Upgrade[], rng: () => number): Upgrade {
  const weapons = world.weapons;
  const passives = world.passives;

  const score = (u: Upgrade) => {
    let s = 0;
    if (u.type === 'weapon') {
      const evo = EVOLUTIONS.find((e) => e.base === u.id);
      // 각성 직전 무기를 최우선
      if (evo && u.level >= EVOLVE_AT_LEVEL) s += 100;
      else if (evo && passives.has(evo.partner)) s += 40;
      s += u.level * 5;
      if (u.isNew && weapons.size < 3) s += 12; // 초반 무기 다양화
    } else {
      // 보유 무기의 짝꿍 패시브를 우대
      const pair = EVOLUTIONS.find((e) => e.partner === u.id && weapons.has(e.base));
      if (pair) s += 45;
      s += u.level * 4;
    }
    return s + rng() * 6; // 동점 흔들기
  };

  return choices.reduce((a, b) => (score(b) > score(a) ? b : a));
}

export function runOnce(cfg: RunConfig): RunResult {
  const maxSeconds = cfg.maxSeconds ?? 900;
  const rng = makeRng(cfg.seed ^ 0x9e3779b9);
  const world = new World(cfg.seed, cfg.starter);
  const bot = new Bot({ skill: cfg.skill, rng });

  let levelUps = 0;
  let upgrades = 0;
  const evolved: string[] = [];
  const bossesKilled: string[] = [];

  world.on((e) => {
    if (e.type === 'awaken') evolved.push(e.evolution.result);
    else if (e.type === 'bossdown') bossesKilled.push(e.id);
    else if (e.type === 'bonus') {
      // 보너스 문제 — 맞히면 아이템이 떨어진다
      if (rng() < cfg.accuracy) {
        const kind = rng() < 0.5 ? 'magnet' : 'bomb';
        const a = rng() * Math.PI * 2;
        world.dropPickup(kind, world.player.x + Math.cos(a) * 140, world.player.y + Math.sin(a) * 140);
      }
    } else if (e.type === 'trial') {
      // 초월 수련 3문제
      let ok = 0;
      for (let i = 0; i < 3; i++) if (rng() < cfg.accuracy) ok++;
      world.addTranscendBonus(ok);
    } else if (e.type === 'shield') {
      // 방어막은 맞힐 때까지 낸다 — 실제 게임과 같다
      world.breakShield();
    }
  });

  let steps = 0;
  const maxSteps = Math.ceil(maxSeconds / FIXED_DT);

  while (!world.over && steps < maxSteps) {
    const axis = bot.decide(world, FIXED_DT);
    world.update(FIXED_DT, axis);
    steps++;

    // 레벨업 처리 — 정답이면 강화, 오답이면 못 받는다
    while (world.pendingLevelUps > 0) {
      world.pendingLevelUps--;
      levelUps++;
      if (rng() >= cfg.accuracy) continue;
      const choices = world.rollChoices(3);
      if (choices.length) {
        world.applyUpgrade(pickUpgrade(world, choices, rng));
        upgrades++;
      }
      world.tryEvolve();
    }
  }

  return {
    cleared: world.over === 'cleared',
    time: world.time,
    kills: world.kills,
    level: world.player.level,
    levelUps,
    upgrades,
    evolved,
    weapons: [...world.weapons],
    passives: [...world.passives],
    bossesKilled,
    steps,
  };
}
