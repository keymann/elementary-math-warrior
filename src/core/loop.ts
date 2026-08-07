/**
 * 고정 타임스텝 게임 루프.
 *
 * 물리·충돌은 프레임률과 무관하게 같은 결과가 나와야 한다(리플레이·점수 검증 전제).
 * 그래서 update는 항상 dt = 1/60 으로 돌리고, 남는 시간은 누적해 다음 프레임으로 넘긴다.
 * 렌더는 매 프레임 1회, 보간 계수 alpha 를 받아 위치를 부드럽게 그린다.
 */

export const FIXED_DT = 1 / 60;

/** 한 프레임에 밀어넣을 수 있는 최대 업데이트 수.
 *  탭이 백그라운드에 있다 돌아왔을 때 수천 스텝을 몰아 도는 "죽음의 나선"을 막는다. */
const MAX_STEPS = 5;

export type LoopCallbacks = {
  update: (dt: number) => void;
  /**
   * @param alpha  고정 스텝 사이의 보간 계수
   * @param frameDt 이 프레임의 실제 경과 시간(초).
   *   카메라처럼 **렌더 쪽에서만 시간에 따라 움직이는 것**은 이 값을 써야 한다.
   *   1/60 을 상수로 넘기면 120Hz 화면에서 두 배 빨리 움직인다.
   */
  render: (alpha: number, frameDt: number) => void;
  /** fps·스텝 수 등 계측값 보고 (1초 주기) */
  onStats?: (stats: LoopStats) => void;
};

export type LoopStats = {
  fps: number;
  /** 한 프레임의 update+render 소요 시간 평균 (ms) */
  frameMs: number;
  /** 직전 1초 동안 MAX_STEPS 에 걸려 버린 프레임 수 */
  droppedFrames: number;
};

export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private paused = false;

  private frames = 0;
  private frameMsSum = 0;
  private dropped = 0;
  private statsAt = 0;

  constructor(private cb: LoopCallbacks) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.statsAt = this.last;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 퀴즈·일시정지 중에는 시간이 흐르면 안 된다. 렌더는 계속한다. */
  setPaused(v: boolean) {
    if (this.paused === v) return;
    this.paused = v;
    // 재개 시 누적 시간을 버려야 멈춰 있던 만큼 한꺼번에 진행하지 않는다
    if (!v) {
      this.last = performance.now();
      this.acc = 0;
    }
  }

  get isPaused() {
    return this.paused;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const t0 = now;
    let elapsed = (now - this.last) / 1000;
    this.last = now;

    // 탭 전환·중단점 등으로 크게 튄 구간은 잘라낸다
    if (elapsed > 0.25) elapsed = 0.25;

    if (!this.paused) {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
        this.cb.update(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS && this.acc >= FIXED_DT) {
        // 따라잡기를 포기하고 남은 시간을 버린다 (느려질지언정 멈추지는 않는다)
        this.acc = 0;
        this.dropped++;
      }
    }

    this.cb.render(this.paused ? 1 : this.acc / FIXED_DT, elapsed);

    this.frames++;
    this.frameMsSum += performance.now() - t0;
    if (now - this.statsAt >= 1000) {
      const span = (now - this.statsAt) / 1000;
      this.cb.onStats?.({
        fps: this.frames / span,
        frameMs: this.frameMsSum / Math.max(1, this.frames),
        droppedFrames: this.dropped,
      });
      this.frames = 0;
      this.frameMsSum = 0;
      this.dropped = 0;
      this.statsAt = now;
    }
  };
}
