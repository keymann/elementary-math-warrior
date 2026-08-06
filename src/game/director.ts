/**
 * 타임라인 디렉터 — 10분 한 판의 기승전결을 담당한다.
 *
 *   0:00  시작
 *   3:00  중간보스 1 (전투 중 타이머 정지)
 *   6:00  중간보스 2 (전투 중 타이머 정지)
 *   8:00  초월 수련 — 특별 문제 3개
 *   9:00  초월 — 파워스파이크 + 완전 회복
 *  10:00  최종보스 (방어막을 문제로 해제)
 *
 * **보스전 동안 타이머를 멈추는 것**은 원작 블랙박스 측정에서 확인한 규칙이다.
 * 보스를 잡는 데 걸린 시간이 생존 시간에서 깎이면, 보스를 피해 도망치는 것이
 * 최적 전략이 되어 버린다.
 */
import type { BossKindId } from './boss';

export type TimelineEvent =
  | { type: 'boss'; id: BossKindId }
  | { type: 'trial' } // 초월 수련 — 특별 문제 3개
  | { type: 'transcend' } // 초월 — 파워스파이크
  | { type: 'star' } // 별 몬스터
  | { type: 'cat' }; // 생선 도둑 고양이

type Cue = { at: number; event: TimelineEvent };

export const CUES: Cue[] = [
  { at: 180, event: { type: 'boss', id: 'mid1' } },
  { at: 360, event: { type: 'boss', id: 'mid2' } },
  { at: 480, event: { type: 'trial' } },
  { at: 540, event: { type: 'transcend' } },
  { at: 600, event: { type: 'boss', id: 'final' } },
];

/** 특별 몬스터 등장 주기(초). 원작은 별 몬스터가 13초에 처음 나왔다 — 초반 공백을 만들지 않는다. */
export const STAR_FIRST = 13;
export const STAR_EVERY = 38;
export const CAT_FIRST = 42;
export const CAT_EVERY = 55;

export class Director {
  private fired = new Set<number>();
  private nextStar = STAR_FIRST;
  private nextCat = CAT_FIRST;

  /** 이번 프레임에 발생한 이벤트들 */
  step(time: number): TimelineEvent[] {
    const out: TimelineEvent[] = [];

    for (let i = 0; i < CUES.length; i++) {
      const c = CUES[i];
      if (time >= c.at && !this.fired.has(i)) {
        this.fired.add(i);
        out.push(c.event);
      }
    }

    if (time >= this.nextStar) {
      this.nextStar = time + STAR_EVERY;
      out.push({ type: 'star' });
    }
    if (time >= this.nextCat) {
      this.nextCat = time + CAT_EVERY;
      out.push({ type: 'cat' });
    }

    return out;
  }

  /**
   * 테스트용 — 지정 시각까지의 큐를 "이미 지나간 것"으로 표시한다.
   * 이렇게 하지 않고 시각만 바꾸면 지나친 큐가 한 프레임에 몰려 발동한다
   * (3분·6분 보스가 동시에 소환되어 흐름이 엉켰다).
   */
  skipTo(time: number) {
    for (let i = 0; i < CUES.length; i++) if (CUES[i].at <= time) this.fired.add(i);
    this.nextStar = time + STAR_EVERY;
    this.nextCat = time + CAT_EVERY;
  }

  reset() {
    this.fired.clear();
    this.nextStar = STAR_FIRST;
    this.nextCat = CAT_FIRST;
  }
}
