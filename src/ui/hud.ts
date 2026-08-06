/**
 * HUD + 디버그 오버레이 (DOM).
 *
 * 캔버스에 그리지 않고 DOM으로 두는 이유: 텍스트는 DOM이 훨씬 선명하고,
 * 값이 바뀔 때만 갱신하면 되므로 60fps 렌더 루프와 분리된다.
 * safe-area 안쪽에만 배치해 노치·홈 인디케이터에 가리지 않게 한다.
 */
import type { SafeArea } from '../render/viewport';

export type HudModel = {
  hp: number;
  maxHp: number;
  time: number;
  enemies: number;
  fps: number;
  frameMs: number;
  dpr: number;
  lowPerf: boolean;
};

export class Hud {
  private root: HTMLElement;
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private timeEl: HTMLElement;
  private debugEl: HTMLElement;
  private last: Partial<HudModel> = {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hp"><div class="hp-fill"></div><span class="hp-text"></span></div>
        <div class="timer"></div>
      </div>
      <div class="debug"></div>
    `;
    parent.appendChild(this.root);
    this.hpFill = this.root.querySelector('.hp-fill')!;
    this.hpText = this.root.querySelector('.hp-text')!;
    this.timeEl = this.root.querySelector('.timer')!;
    this.debugEl = this.root.querySelector('.debug')!;
  }

  applySafeArea(s: SafeArea) {
    this.root.style.paddingTop = `${s.top + 10}px`;
    this.root.style.paddingRight = `${s.right + 12}px`;
    this.root.style.paddingBottom = `${s.bottom + 10}px`;
    this.root.style.paddingLeft = `${s.left + 12}px`;
  }

  update(m: HudModel) {
    if (m.hp !== this.last.hp) {
      this.hpFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
      this.hpText.textContent = `${Math.ceil(m.hp)} / ${m.maxHp}`;
    }
    const t = Math.floor(m.time);
    if (t !== Math.floor(this.last.time ?? -1)) {
      this.timeEl.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    // 디버그는 1초 주기로만 바뀌므로 fps 변화 시에만 갱신
    if (m.fps !== this.last.fps || m.enemies !== this.last.enemies) {
      this.debugEl.innerHTML =
        `<b class="${m.fps < 50 ? 'warn' : 'ok'}">${m.fps.toFixed(0)} fps</b>` +
        ` · ${m.frameMs.toFixed(1)} ms` +
        ` · 적 <b>${m.enemies}</b>` +
        ` · DPR ${m.dpr}` +
        (m.lowPerf ? ' · <b class="warn">저사양 모드</b>' : '');
    }
    this.last = m;
  }
}
