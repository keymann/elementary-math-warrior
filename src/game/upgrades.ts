/**
 * 레벨업 보상 후보 생성.
 *
 * Phase 2 에서는 자동으로 하나를 고른다. Phase 3 에서 이 목록 앞에 퀴즈를 세우고
 * 3택 카드 UI 를 붙이면 된다 — 보상 풀 자체는 그대로 쓴다.
 */
import type { Rng } from '../core/rng';
import { PASSIVES, type PassiveId } from './stats';
import { WEAPONS, type WeaponId } from './weapons';
import { PARTNER_OF } from './evolution';

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
  // 최소 한 장씩 확보
  const w = pick(weapons);
  if (w) out.push(w);
  const p = pick(passives);
  if (p) out.push(p);

  const rest = [...weapons, ...passives];
  while (out.length < n) {
    const u = pick(rest);
    if (!u) break;
    out.push(u);
  }
  return out;
}
