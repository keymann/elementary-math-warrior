/**
 * 캔버스 뷰포트 + 카메라.
 *
 * 모바일·태블릿 대응의 핵심이 여기 모여 있다.
 *  - DPR 상한 2: 태블릿의 DPR 3을 그대로 쓰면 픽셀 수가 2.25배가 되어 프레임이 무너진다
 *  - safe-area: 노치·홈 인디케이터 영역을 HUD 배치에서 제외
 *  - 시야 보정: 세로/가로 회전 시 **월드 기준 시야 넓이를 유지**해
 *    가로 화면이 정보량에서 유리해지지 않게 한다
 */

const MAX_DPR = 2;
/** 화면의 짧은 변이 담아야 할 월드 단위. 이 값을 고정해 기기별 시야 차이를 없앤다. */
const VIEW_MIN_SIDE = 720;

export type SafeArea = { top: number; right: number; bottom: number; left: number };

export class Viewport {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS 픽셀 기준 크기 */
  width = 0;
  height = 0;
  dpr = 1;
  /** 월드 → 화면 배율 */
  scale = 1;
  safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

  /** 카메라 중심(월드 좌표) */
  camX = 0;
  camY = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다');
    this.ctx = ctx;
    this.resize();

    window.addEventListener('resize', this.resize);
    // iOS는 회전 직후 크기가 아직 갱신되지 않아 한 박자 늦게 다시 잰다
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 150));
    window.visualViewport?.addEventListener('resize', this.resize);
  }

  resize = () => {
    const cssW = Math.round(this.canvas.clientWidth || window.innerWidth);
    const cssH = Math.round(this.canvas.clientHeight || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    const w = Math.round(cssW * this.dpr);
    const h = Math.round(cssH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = cssW;
    this.height = cssH;

    // 짧은 변 기준으로 배율을 잡는다 → 가로/세로 어느 쪽이든 보이는 월드 폭이 같다
    this.scale = Math.min(cssW, cssH) / VIEW_MIN_SIDE;

    this.safe = readSafeArea();
  };

  /** 카메라를 목표 지점으로 부드럽게 따라가게 한다. dt 기반이라 프레임률에 무관. */
  follow(x: number, y: number, dt: number, smooth = 12) {
    const t = 1 - Math.exp(-smooth * dt);
    this.camX += (x - this.camX) * t;
    this.camY += (y - this.camY) * t;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      const m = this.shake * 12;
      this.shakeX = (Math.random() * 2 - 1) * m;
      this.shakeY = (Math.random() * 2 - 1) * m;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** 월드 좌표 → 화면 CSS 픽셀 */
  toScreenX(wx: number) {
    return (wx - this.camX) * this.scale + this.width / 2 + this.shakeX;
  }
  toScreenY(wy: number) {
    return (wy - this.camY) * this.scale + this.height / 2 + this.shakeY;
  }

  /** 화면 밖 컬링 판정에 쓰는 월드 반경 */
  get viewRadiusWorld() {
    return Math.hypot(this.width, this.height) / 2 / this.scale;
  }

  /** 렌더 시작 — 변환을 (CSS 픽셀 기준 + 카메라 적용) 상태로 세팅한다. */
  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
}

function readSafeArea(): SafeArea {
  // env() 값은 JS에서 직접 못 읽으므로 프로브 요소의 계산된 padding으로 우회한다
  let probe = document.getElementById('safe-area-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-area-probe';
    probe.style.cssText = [
      'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:0',
      'padding-top:env(safe-area-inset-top)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'padding-left:env(safe-area-inset-left)',
    ].join(';');
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}
