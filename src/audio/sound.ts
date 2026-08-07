/**
 * 사운드 — Web Audio 로 **합성**한다. 오디오 파일을 쓰지 않는다.
 *
 * 에셋 제로 전략을 소리까지 밀고 간다. mp3 몇 개만 넣어도 수백 KB가 되는데,
 * 교실 와이파이에서 그 로딩이 곧 "안 켜지는 게임"이 된다. 합성음은 0바이트다.
 *
 * 브라우저 정책상 **사용자 입력 전에는 소리를 낼 수 없다.** 첫 탭/클릭에서 깨운다.
 */

export type SfxId =
  | 'shoot'      // 발사
  | 'hit'        // 타격
  | 'playerHurt' // 피격
  | 'levelUp'
  | 'correct'
  | 'wrong'
  | 'pickup'
  | 'bossAppear'
  | 'bossDown'
  | 'awaken'
  | 'gameOver';

type BgmLayer = { osc: OscillatorNode; gain: GainNode };

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private bgmLayers: BgmLayer[] = [];
  private bgmTimer: number | null = null;
  private step = 0;
  /** 라운드 0~4 — 높을수록 빠르고 조인다 */
  private round = 0;
  private enabled = true;
  private started = false;
  /** 같은 소리가 한꺼번에 쏟아지는 것을 막는다 */
  private lastAt = new Map<SfxId, number>();

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    }
    if (!on) this.stopBgm();
  }

  get isEnabled() {
    return this.enabled;
  }

  /** 사용자 입력 시점에 호출해야 한다 */
  unlock() {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.5;
    this.sfxBus.connect(this.master);

    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = 0.16; // 배경음은 효과음보다 확실히 낮게
    this.bgmBus.connect(this.master);

    this.started = true;
  }

  /* ─────────────── 효과음 ─────────────── */

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 노이즈 버스트 — 타격·폭발에 쓴다 */
  private noise(dur: number, vol: number, hp = 800) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.enabled) return;
    const t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  play(id: SfxId) {
    if (!this.enabled || !this.ctx) return;
    // 초당 수십 발이 나가는 소리는 솎아낸다
    const now = performance.now();
    const gap = id === 'shoot' ? 110 : id === 'hit' ? 60 : 0;
    if (gap) {
      const last = this.lastAt.get(id) ?? 0;
      if (now - last < gap) return;
      this.lastAt.set(id, now);
    }

    switch (id) {
      case 'shoot':
        this.blip(660, 0.07, 'square', 0.1, 420);
        break;
      case 'hit':
        this.noise(0.05, 0.16, 1400);
        break;
      case 'playerHurt':
        this.blip(220, 0.22, 'sawtooth', 0.3, 90);
        this.noise(0.12, 0.2, 300);
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.16, 'triangle', 0.26), i * 70),
        );
        break;
      case 'correct':
        [784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.14, 'triangle', 0.3), i * 90));
        break;
      case 'wrong':
        this.blip(330, 0.3, 'sawtooth', 0.22, 160);
        break;
      case 'pickup':
        this.blip(880, 0.1, 'sine', 0.24, 1320);
        break;
      case 'bossAppear':
        this.blip(110, 0.9, 'sawtooth', 0.32, 55);
        this.noise(0.6, 0.18, 200);
        break;
      case 'bossDown':
        [660, 523, 392, 262].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.3, 'triangle', 0.3), i * 120),
        );
        this.noise(0.5, 0.22, 300);
        break;
      case 'awaken':
        [523, 784, 1047, 1319].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.35, 'sine', 0.3), i * 100),
        );
        break;
      case 'gameOver':
        [392, 330, 262, 196].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.4, 'triangle', 0.28), i * 180),
        );
        break;
    }
  }

  /* ─────────────── 배경음 ─────────────── */

  /**
   * 라운드가 오를수록 조여드는 배경음.
   *   템포가 빨라지고, 저음이 굵어지고, 4라운드부터는 불안한 반음이 섞인다.
   */
  private readonly ROUNDS = [
    { bpm: 96, root: 55, pattern: [0, 7, 5, 7], wave: 'triangle' as OscillatorType, lead: 0.0 },
    { bpm: 108, root: 55, pattern: [0, 7, 3, 10], wave: 'triangle' as OscillatorType, lead: 0.15 },
    { bpm: 120, root: 49, pattern: [0, 5, 3, 8], wave: 'sawtooth' as OscillatorType, lead: 0.2 },
    { bpm: 134, root: 49, pattern: [0, 3, 7, 3], wave: 'sawtooth' as OscillatorType, lead: 0.3 },
    { bpm: 150, root: 44, pattern: [0, 1, 5, 6], wave: 'sawtooth' as OscillatorType, lead: 0.4 },
  ];

  setRound(round: number) {
    const r = Math.max(0, Math.min(this.ROUNDS.length - 1, Math.floor(round)));
    if (r === this.round && this.bgmTimer !== null) return;
    this.round = r;
    if (this.bgmTimer !== null) this.startBgm(); // 재시작해 템포 반영
  }

  startBgm() {
    if (!this.ctx || !this.enabled) return;
    this.stopBgm();
    const cfg = this.ROUNDS[this.round];
    const beat = 60000 / cfg.bpm / 2;
    this.step = 0;
    this.bgmTimer = window.setInterval(() => {
      const ctx = this.ctx;
      if (!ctx || !this.bgmBus) return;
      const t = ctx.currentTime;
      const semi = cfg.pattern[this.step % cfg.pattern.length];
      const freq = cfg.root * Math.pow(2, semi / 12);

      // 베이스
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = cfg.wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat / 1000);
      osc.connect(g).connect(this.bgmBus);
      osc.start(t);
      osc.stop(t + beat / 1000 + 0.02);

      // 리드 — 라운드가 오를수록 자주 끼어든다
      if (cfg.lead > 0 && this.step % 4 === 2 && Math.random() < cfg.lead + 0.3) {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.type = 'square';
        o2.frequency.value = freq * 4;
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(0.14, t + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.001, t + beat / 1400);
        o2.connect(g2).connect(this.bgmBus);
        o2.start(t);
        o2.stop(t + beat / 1000);
      }
      this.step++;
    }, beat);
  }

  stopBgm() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmLayers.forEach((l) => {
      try {
        l.osc.stop();
      } catch {
        /* 이미 멈춘 경우 */
      }
    });
    this.bgmLayers = [];
  }
}

export const sound = new Sound();
