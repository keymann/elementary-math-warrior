/**
 * 통합 입력 — 키보드 / 터치 / 마우스를 **하나의 정규화 벡터**로 합류시킨다.
 *
 * 게임 로직은 `axis()` 하나만 본다. 기기별 분기가 로직에 스며들면
 * "모바일에서만 미묘하게 다른" 조작감이 반드시 생긴다.
 *
 * 터치와 마우스는 **같은 플로팅 조이스틱**을 공유한다(Pointer Events 단일 경로).
 * 화면 아무 곳이나 누른 지점이 원점이 되고, 끌어낸 방향·거리가 입력이 된다.
 * 고정 위치 스틱은 작은 화면에서 손 위치를 강제해 불리하다.
 */

export type Vec2 = { x: number; y: number };

export type JoystickView = {
  active: boolean;
  /** 원점 (CSS 픽셀, 화면 좌표) */
  ox: number;
  oy: number;
  /** 노브 위치 (CSS 픽셀, 화면 좌표) */
  kx: number;
  ky: number;
  radius: number;
};

const KEY_VECTORS: Record<string, Vec2> = {
  arrowup: { x: 0, y: -1 },
  keyw: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  keys: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  keya: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  keyd: { x: 1, y: 0 },
};

/** 노브 최대 반경(CSS px). 이 거리에서 속도 100%. */
const RADIUS = 64;
/** 데드존 — 손가락 미세 흔들림으로 캐릭터가 떠는 것을 막는다. */
const DEADZONE = 0.08;

export class Input {
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private origin: Vec2 = { x: 0, y: 0 };
  private knob: Vec2 = { x: 0, y: 0 };
  private vec: Vec2 = { x: 0, y: 0 };

  /** ESC 등 단발 키 구독 */
  private tapHandlers = new Map<string, () => void>();

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);

    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
    // 길게 눌러 컨텍스트 메뉴가 뜨면 조작이 끊긴다
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
  }

  onTap(code: string, fn: () => void) {
    this.tapHandlers.set(code.toLowerCase(), fn);
  }

  /** 이동 입력. 크기는 0~1, 대각선도 1을 넘지 않는다. */
  axis(): Vec2 {
    // 포인터가 눌려 있으면 포인터 우선 (터치 중 키보드가 끼어들 일은 없다)
    if (this.pointerId !== null) return this.vec;

    let x = 0;
    let y = 0;
    for (const k of this.keys) {
      const v = KEY_VECTORS[k];
      if (v) {
        x += v.x;
        y += v.y;
      }
    }
    const len = Math.hypot(x, y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len }; // 대각선 속도 이득 제거
  }

  /** 조이스틱 렌더용 상태. 터치·마우스 모두 동일하게 그려 조작감을 맞춘다. */
  joystick(): JoystickView {
    return {
      active: this.pointerId !== null,
      ox: this.origin.x,
      oy: this.origin.y,
      kx: this.knob.x,
      ky: this.knob.y,
      radius: RADIUS,
    };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code.toLowerCase();
    const tap = this.tapHandlers.get(code);
    if (tap) {
      e.preventDefault();
      tap();
      return;
    }
    if (KEY_VECTORS[code]) {
      e.preventDefault(); // 방향키 스크롤 차단
      this.keys.add(code);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code.toLowerCase());
  };

  private releaseAll = () => {
    this.keys.clear();
    this.pointerId = null;
    this.vec = { x: 0, y: 0 };
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return; // 멀티터치 중 첫 손가락만 조작에 쓴다
    this.pointerId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.knob = { x: e.clientX, y: e.clientY };
    this.vec = { x: 0, y: 0 };
    // 손가락이 요소 밖으로 나가도 이벤트를 계속 받는다
    this.target.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= RADIUS) {
      this.knob = { x: e.clientX, y: e.clientY };
    } else {
      // 노브는 반경 안에 묶고, 원점을 손가락 쪽으로 끌어당긴다.
      // (원점 고정 방식은 손가락이 멀어질수록 방향 전환이 둔해진다)
      const nx = dx / dist;
      const ny = dy / dist;
      this.origin = { x: e.clientX - nx * RADIUS, y: e.clientY - ny * RADIUS };
      this.knob = { x: e.clientX, y: e.clientY };
    }

    const mag = Math.min(1, dist / RADIUS);
    if (mag < DEADZONE) {
      this.vec = { x: 0, y: 0 };
      return;
    }
    // 데드존 바깥을 0~1로 다시 펴서 급출발을 없앤다
    const scaled = (mag - DEADZONE) / (1 - DEADZONE);
    this.vec = { x: (dx / dist) * scaled, y: (dy / dist) * scaled };
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.vec = { x: 0, y: 0 };
  };
}
