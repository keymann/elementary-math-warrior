/**
 * 로컬 저장 — 최고 기록과 이어하기.
 *
 * 계정을 만들지 않는다. 학교 태블릿은 여러 학생이 돌려 쓰므로 브라우저에 남는
 * 개인정보를 최소화한다(작업계획 5장 아동 개인정보). 별명·학급 코드조차
 * 이 단계에서는 저장하지 않는다.
 *
 * 이어하기는 적·투사체까지 복원하지 않는다. 진행도(시각·성장·기록)만 되살리고
 * 전투 상황은 새로 시작한다 — 저장 용량과 복잡도에 비해 얻는 게 없다.
 */
import type { Grade } from '../quiz/selector';

const KEY_BEST = 'emw.best.v1';
const KEY_RUN = 'emw.run.v1';

export type BestScores = Partial<Record<Grade, number>>;

export type SavedRun = {
  grade: Grade;
  starter: string;
  seed: number;
  time: number;
  kills: number;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  weapons: [string, number][];
  passives: [string, number][];
  quizTotal: number;
  quizCorrect: number;
  savedAt: number;
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // 사생활 보호 모드 등에서 localStorage 가 막힐 수 있다
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 조용히 무시 — 게임 진행을 막을 이유가 없다 */
  }
}

export const loadBest = (): BestScores => read<BestScores>(KEY_BEST) ?? {};

export function saveBest(grade: Grade, score: number): boolean {
  const best = loadBest();
  if ((best[grade] ?? 0) >= score) return false;
  best[grade] = score;
  write(KEY_BEST, best);
  return true; // 신기록
}

export const loadRun = (): SavedRun | null => read<SavedRun>(KEY_RUN);
export const saveRun = (run: SavedRun) => write(KEY_RUN, run);
export function clearRun() {
  try {
    localStorage.removeItem(KEY_RUN);
  } catch {
    /* ignore */
  }
}

/**
 * 점수 = 생존 시간(초) × 10 + 처치 수 + 레벨 × 50 + 정답률 보너스.
 * 생존을 가장 크게 치되, 문제를 맞히는 쪽도 확실히 이득이 되게 한다.
 */
export function computeScore(time: number, kills: number, level: number, accuracy: number | null) {
  return Math.round(time * 10 + kills + level * 50 + (accuracy ?? 0) * 500);
}

/** 별점 — 생존 시간 기준. 클리어하면 3개 */
export function starsFor(time: number, cleared: boolean): number {
  if (cleared) return 3;
  if (time >= 480) return 2;
  if (time >= 240) return 1;
  return 0;
}

/** 칭호 — 정답률 기준. 원작도 정답률에 연동돼 있었다 */
export function titleFor(accuracy: number | null): string {
  if (accuracy === null) return '🌱 새싹 용사';
  if (accuracy >= 0.95) return '📚 지혜로운 현자';
  if (accuracy >= 0.8) return '🔎 척척박사';
  if (accuracy >= 0.6) return '✏️ 성실한 학생';
  return '🌱 새싹 용사';
}
