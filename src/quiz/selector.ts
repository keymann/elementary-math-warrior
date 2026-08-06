/**
 * 출제 정책.
 *
 *  - 학년 → 학기군 매핑 (4학년 → g41, g42)
 *  - 유형 균등 분배: 한 유형만 반복해서 나오지 않도록 섞은 순서로 돌아가며 출제
 *  - 미출제 우선: 이미 낸 문제는 `exclude` 로 넘겨 생성기가 피하게 한다
 *  - **한 판에 같은 문제는 두 번 나오지 않는다.** 출제한 지문을 전부 기억해 걸러낸다
 *  - 오답 재출제: 틀린 **유형**을 잠시 뒤 다시 낸다. 똑같은 문항을 다시 내면 답을 외워
 *    맞히게 되므로, 같은 유형의 **새 문항**을 낸다 — 개념을 다시 묻되 중복은 아니다
 *  - 연산 외 영역(규칙 찾기·그래프·도형 이동)을 일정 비율 섞는다
 */
import type { Rng } from '../core/rng';
import { makeQuizzes } from './adapter';
import { EXTRA_GENERATORS, EXTRA_RATIO, type ExtraGenId } from './extra';
import type { GameQuiz } from './types';

export type Grade = 3 | 4 | 5 | 6;

/** 학년 → 학기군 ID. `problems.js` 의 GROUPS 와 같은 규칙이다. */
export function groupsForGrade(grade: Grade): string[] {
  return [`g${grade}1`, `g${grade}2`];
}

/** 오답을 다시 낼 때까지 사이에 끼울 문제 수 */
const RETRY_GAP = 3;

export class QuizSelector {
  private itemIds: string[] = [];
  private cursor = 0;
  /** 이미 출제한 지문 — 생성기에 넘겨 중복을 피한다 */
  private seen = new Set<string>();
  /** 다시 낼 오답 큐 — 문항이 아니라 **유형**을 기억한다 */
  private retry: { source: string; readyAt: number }[] = [];
  private served = 0;

  total = 0;
  correct = 0;

  constructor(
    private grade: Grade,
    private rng: Rng,
  ) {
    this.rebuild();
  }

  setGrade(grade: Grade) {
    this.grade = grade;
    this.seen.clear();
    this.retry = [];
    this.cursor = 0;
    this.rebuild();
  }

  private rebuild() {
    const ids: string[] = [];
    for (const gid of groupsForGrade(this.grade)) {
      const group = window.Curriculum?.findGroup(gid);
      if (!group) continue;
      for (const item of group.items) ids.push(item.id);
    }
    // 섞어 두고 순서대로 돌면 유형이 고르게 나온다 (무작위 추출은 편중된다)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.itemIds = ids;
  }

  get accuracy(): number | null {
    return this.total ? this.correct / this.total : null;
  }

  /** 보완 영역 문항을 중복 없이 뽑는다. 실패하면 null */
  private nextExtra(key?: ExtraGenId): GameQuiz | null {
    const keys = Object.keys(EXTRA_GENERATORS) as ExtraGenId[];
    const id = key ?? keys[Math.floor(this.rng() * keys.length)];
    // 도형의 이동처럼 변형이 적은 유형은 금방 소진된다. 몇 번 시도하고 포기한다
    for (let i = 0; i < 12; i++) {
      const q = EXTRA_GENERATORS[id](this.grade, this.rng);
      if (this.seen.has(q.promptHtml)) continue;
      this.seen.add(q.promptHtml);
      return q;
    }
    return null;
  }

  /** 연산 문항을 중복 없이 뽑는다. 유형을 돌아가며 시도한다 */
  private nextOperator(preferId?: string): GameQuiz | null {
    const order = preferId ? [preferId, ...this.itemIds] : this.itemIds;
    for (let tries = 0; tries < order.length; tries++) {
      const id = preferId && tries === 0 ? preferId : this.itemIds[this.cursor++ % this.itemIds.length];
      // 이미 낸 지문은 생성 단계에서 제외한다
      const { quizzes } = makeQuizzes(id, 1, this.rng, this.seen);
      const q = quizzes[0];
      if (!q || this.seen.has(q.promptHtml)) continue;
      this.seen.add(q.promptHtml);
      return q;
    }
    return null;
  }

  /**
   * 다음 문제.
   * 같은 판에서 이미 낸 지문은 절대 다시 나오지 않는다.
   */
  next(): GameQuiz | null {
    // 1) 다시 물어볼 유형이 있으면 그 유형의 **새 문항**을 낸다
    const due = this.retry.findIndex((r) => this.served >= r.readyAt);
    if (due >= 0) {
      const { source } = this.retry.splice(due, 1)[0];
      const q = source.startsWith('x-')
        ? this.nextExtra(source as ExtraGenId)
        : this.nextOperator(source);
      if (q) {
        this.served++;
        return q;
      }
      // 그 유형이 소진됐으면 아래 일반 경로로 흘려보낸다
    }

    // 2) 보완 영역(연산 외)을 일정 비율로 섞는다
    if (this.rng() < EXTRA_RATIO) {
      const q = this.nextExtra();
      if (q) {
        this.served++;
        return q;
      }
    }

    // 3) 연산 문제
    const q = this.nextOperator();
    if (q) {
      this.served++;
      return q;
    }
    return null;
  }

  /** 채점 결과 기록. 틀리면 **같은 유형**을 재출제 큐에 넣는다(같은 문항이 아니라). */
  grade_(quiz: GameQuiz, correct: boolean) {
    this.total++;
    if (correct) {
      this.correct++;
    } else {
      this.retry.push({ source: quiz.itemId, readyAt: this.served + RETRY_GAP });
    }
  }

  /** 이번 판에 출제한 문항 수 (검증용) */
  get servedCount() {
    return this.served;
  }

  reset() {
    this.seen.clear();
    this.retry = [];
    this.served = 0;
    this.total = 0;
    this.correct = 0;
    this.cursor = 0;
  }
}
