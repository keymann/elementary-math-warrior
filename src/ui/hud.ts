/**
 * HUD + 디버그 오버레이 (DOM).
 *
 * 캔버스에 그리지 않고 DOM으로 두는 이유: 텍스트는 DOM이 훨씬 선명하고,
 * 값이 바뀔 때만 갱신하면 되므로 60fps 렌더 루프와 분리된다.
 * safe-area 안쪽에만 배치해 노치·홈 인디케이터에 가리지 않게 한다.
 */
import type { SafeArea } from '../render/viewport';

export type SlotView = { emoji: string; id: string; level: number };

export type HudModel = {
  hp: number;
  maxHp: number;
  time: number;
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  enemies: number;
  fps: number;
  frameMs: number;
  dpr: number;
  lowPerf: boolean;
  /** 정답률 0~1. 아직 푼 문제가 없으면 null */
  accuracy: number | null;
  weapons: SlotView[];
  passives: SlotView[];
};

export class Hud {
  private root: HTMLElement;
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private xpFill: HTMLElement;
  private timeEl: HTMLElement;
  private lvEl: HTMLElement;
  private killEl: HTMLElement;
  private accEl: HTMLElement;
  private debugEl: HTMLElement;
  private slotsEl: HTMLElement;

  private lastHp = -1;
  private lastSec = -1;
  private lastXp = -1;
  private lastLv = -1;
  private lastKills = -1;
  private lastAcc = -2;
  private lastFps = -1;
  private lastSlots = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="xp"><div class="xp-fill"></div></div>
        <div class="hud-row">
          <div class="pill lv"></div>
          <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
          <div class="timer"></div>
          <div class="pill kills"></div>
          <div class="pill acc"></div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="slots"></div>
        <div class="debug"></div>
      </div>
    `;
    parent.appendChild(this.root);
    this.hpFill = this.root.querySelector('.hp-fill')!;
    this.hpText = this.root.querySelector('.hp-text')!;
    this.xpFill = this.root.querySelector('.xp-fill')!;
    this.timeEl = this.root.querySelector('.timer')!;
    this.lvEl = this.root.querySelector('.lv')!;
    this.killEl = this.root.querySelector('.kills')!;
    this.accEl = this.root.querySelector('.acc')!;
    this.debugEl = this.root.querySelector('.debug')!;
    this.slotsEl = this.root.querySelector('.slots')!;
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? 'flex' : 'none';
  }

  applySafeArea(s: SafeArea) {
    this.root.style.paddingTop = `${s.top + 8}px`;
    this.root.style.paddingRight = `${s.right + 12}px`;
    this.root.style.paddingBottom = `${s.bottom + 10}px`;
    this.root.style.paddingLeft = `${s.left + 12}px`;
  }

  update(m: HudModel) {
    if (m.hp !== this.lastHp) {
      this.hpFill.style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
      this.hpText.textContent = `${Math.ceil(m.hp)} / ${Math.round(m.maxHp)}`;
      this.lastHp = m.hp;
    }

    const xpPct = Math.min(100, (m.xp / m.xpNext) * 100);
    if (Math.abs(xpPct - this.lastXp) > 0.4) {
      this.xpFill.style.width = `${xpPct}%`;
      this.lastXp = xpPct;
    }

    const sec = Math.floor(m.time);
    if (sec !== this.lastSec) {
      this.timeEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      this.lastSec = sec;
    }

    if (m.level !== this.lastLv) {
      this.lvEl.textContent = `Lv.${m.level}`;
      this.lastLv = m.level;
    }

    if (m.kills !== this.lastKills) {
      this.killEl.textContent = `⚔️ ${m.kills}`;
      this.lastKills = m.kills;
    }

    const sig =
      m.weapons.map((w) => `${w.id}${w.level}`).join(',') +
      '|' +
      m.passives.map((p) => `${p.id}${p.level}`).join(',');
    if (sig !== this.lastSlots) {
      const cell = (s: SlotView, cls: string) =>
        `<span class="slot ${cls}" title="${s.id}">${s.emoji}<b>${s.level}</b></span>`;
      this.slotsEl.innerHTML =
        m.weapons.map((w) => cell(w, 'w')).join('') + m.passives.map((p) => cell(p, 'p')).join('');
      this.lastSlots = sig;
    }

    const acc = m.accuracy ?? -1;
    if (acc !== this.lastAcc) {
      this.accEl.textContent = m.accuracy === null ? '📝 -' : `📝 ${Math.round(m.accuracy * 100)}%`;
      this.lastAcc = acc;
    }

    if (m.fps !== this.lastFps) {
      this.debugEl.innerHTML =
        `<b class="${m.fps < 50 ? 'warn' : 'ok'}">${m.fps.toFixed(0)} fps</b>` +
        ` · ${m.frameMs.toFixed(1)} ms` +
        ` · 적 <b>${m.enemies}</b>` +
        ` · DPR ${m.dpr}` +
        (m.lowPerf ? ' · <b class="warn">저사양</b>' : '');
      this.lastFps = m.fps;
    }
  }
}
