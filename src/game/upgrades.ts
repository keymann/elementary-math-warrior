/**
 * 레벨업 보상 후보 생성.
 *
 * Phase 2 에서는 자동으로 하나를 고른다. Phase 3 에서 이 목록 앞에 퀴즈를 세우고
 * 3택 카드 UI 를 붙이면 된다 — 보상 풀 자체는 그대로 쓴다.
 */
import type { Rng } from '../core/rng';
import { PASSIVES, type PassiveId } from './stats';
import { WEAPONS, type WeaponId } from './weapons';
import { EVOLUTIONS, EVOLVE_AT_LEVEL, PARTNER_OF } from './evolution';

/** 무기·패시브 슬롯 상한. 원작 HUD 도 각 4칸이었다. */
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

export type Upgrade =
  | {
      type: 'weapon';
      id: WeaponId;
      emoji: string;
      level: number;
      isNew: boolean;
      text: string;
      /** 각성 짝꿍 패시브 — 카드에 상시 표기해 진화 조건을 추측하지 않게 한다 */
      partner?: PassiveId;
    }
  | { type: 'passive'; id: PassiveId; emoji: string; level: number; isNew: boolean; text: string };

export type OwnedState = {
  weapons: Map<WeaponId, number>;
  passives: Map<PassiveId, number>;
};

function weaponCandidates(owned: OwnedState): Upgrade[] {
  const out: Upgrade[] = [];
  for (const w of WEAPONS) {
    const lv = owned.weapons.get(w.id) ?? 0;
    const partner = PARTNER_OF.get(w.id);
    if (lv === 0) {
      if (owned.weapons.size >= MAX_WEAPONS) continue; // 슬롯 없음
      out.push({ type: 'weapon', id: w.id, emoji: w.emoji, level: 1, isNew: true, text: w.describe, partner });
    } else if (lv < w.maxLevel) {
      out.push({
        type: 'weapon',
        id: w.id,
        emoji: w.emoji,
        level: lv + 1,
        isNew: false,
        text: `Lv.${lv} → ${lv + 1}`,
        partner,
      });
    }
  }
  return out;
}

function passiveCandidates(owned: OwnedState): Upgrade[] {
  const out: Upgrade[] = [];
  for (const p of PASSIVES) {
    const lv = owned.passives.get(p.id) ?? 0;
    if (lv === 0) {
      if (owned.passives.size >= MAX_PASSIVES) continue;
      out.push({ type: 'passive', id: p.id, emoji: p.emoji, level: 1, isNew: true, text: p.describe });
    } else if (lv < p.maxLevel) {
      out.push({
        type: 'passive',
        id: p.id,
        emoji: p.emoji,
        level: lv + 1,
        isNew: false,
        text: `${p.describe} (Lv.${lv} → ${lv + 1})`,
      });
    }
  }
  return out;
}

/**
 * 보상 후보 n개.
 * 무기만 또는 패시브만 나오면 빌드가 한쪽으로 쏠리므로 가능하면 섞는다.
 */
export function rollUpgrades(owned: OwnedState, rng: Rng, n = 3): Upgrade[] {
  const weapons = weaponCandidates(owned);
  const passives = passiveCandidates(owned);
  const pick = <T>(arr: T[]): T | null => (arr.length ? arr.splice(Math.floor(rng() * arr.length), 1)[0] : null);

  const out: Upgrade[] = [];

  /**
   * 각성 직전이면 짝꿍 패시브를 **반드시 한 장 끼워 넣는다.**
   * 무기를 Lv.4 까지 올려 놓고도 짝꿍이 뽑히지 않아 각성을 못 보는 판이 많았다
   * (시뮬레이션 각성 도달률 39.6%, 목표 70%). 각성은 이 게임의 핵심 보상이라
   * 조건을 갖춘 플레이어에게는 길을 열어 준다 — 원작이 짝꿍을 카드에 상시 표기한 것과
   * 같은 취지다.
   */
  for (const e of EVOLUTIONS) {
    if ((owned.weapons.get(e.base) ?? 0) < EVOLVE_AT_LEVEL) continue;
    if ((owned.passives.get(e.partner) ?? 0) > 0) continue;
    if (owned.passives.size >= MAX_PASSIVES) continue;
    const idx = passives.findIndex((u) => u.id === e.partner);
    if (idx >= 0) {
      out.push(passives.splice(idx, 1)[0]);
      break;
    }
  }

  // 최소 한 장씩 확보
  const w = pick(weapons);
  if (w) out.push(w);
  if (out.length < 2 || !out.some((u) => u.type === 'passive')) {
    const p = pick(passives);
    if (p) out.push(p);
  }

  const rest = [...weapons, ...passives];
  while (out.length < n) {
    const u = pick(rest);
    if (!u) break;
    out.push(u);
  }
  return out;
}
