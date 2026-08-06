/**
 * 출제 정책.
 *
 *  - 학년 → 학기군 매핑 (4학년 → g41, g42)
 *  - 유형 균등 분배: 한 유형만 반복해서 나오지 않도록 섞은 순서로 돌아가며 출제
 *  - 미출제 우선: 이미 낸 문제는 `exclude` 로 넘겨 생성기가 피하게 한다
 *  - 오답 재출제 큐: 틀린 문제는 잠시 뒤 다시 낸다 (학습 도구로서 가장 중요한 부분)
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
  /** 다시 낼 오답 큐 */
  private retry: { quiz: GameQuiz; readyAt: number }[] = [];
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

  /** 다음 문제. 생성에 실패하면 다른 유형으로 넘어간다. */
  next(): GameQuiz | null {
    // 1) 재출제할 오답이 있으면 우선
    const due = this.retry.findIndex((r) => this.served >= r.readyAt);
    if (due >= 0) {
      const q = this.retry.splice(due, 1)[0].quiz;
      this.served++;
      return q;
    }

    // 2) 보완 영역(연산 외)을 일정 비율로 섞는다
    if (this.rng() < EXTRA_RATIO) {
      const keys = Object.keys(EXTRA_GENERATORS) as ExtraGenId[];
      const gen = EXTRA_GENERATORS[keys[Math.floor(this.rng() * keys.length)]];
      this.served++;
      return gen(this.grade, this.rng);
    }

    // 3) 연산 문제 — 유형을 돌아가며
    for (let tries = 0; tries < this.itemIds.length; tries++) {
      const id = this.itemIds[this.cursor % this.itemIds.length];
      this.cursor++;
      const { quizzes } = makeQuizzes(id, 1, this.rng);
      if (quizzes.length) {
        const q = quizzes[0];
        // 같은 지문을 또 내지 않도록 기록 (생성기 쪽 exclude 는 makeQuizzes 내부에서 처리)
        if (this.seen.has(q.promptHtml)) continue;
        this.seen.add(q.promptHtml);
        this.served++;
        return q;
      }
    }
    return null;
  }

  /** 채점 결과 기록. 틀리면 재출제 큐에 넣는다. */
  grade_(quiz: GameQuiz, correct: boolean) {
    this.total++;
    if (correct) {
      this.correct++;
    } else {
      this.retry.push({ quiz, readyAt: this.served + RETRY_GAP });
    }
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
