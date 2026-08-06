/** 재사용 생성기(`src/vendor/problems.js`)가 돌려주는 원본 문제 모델. */
export type RawProblem = {
  promptHtml: string;
  /** 빈칸 순번(data-bi)별 정답 문자열. */
  blanks: string[];
};

export type CurriculumItem = {
  id: string;
  group: string;
  name: string;
  std: string;
  gen: () => RawProblem;
};

export type CurriculumGroup = {
  id: string;
  label: string;
  items: CurriculumItem[];
};

export type CurriculumApi = {
  GROUPS: CurriculumGroup[];
  findGroup(gid: string): CurriculumGroup | undefined;
  findItem(itemId: string): { group: CurriculumGroup; item: CurriculumItem } | null;
  generateSet(itemId: string, count: number, exclude?: Set<string>): RawProblem[] | null;
  itemMeta(itemId: string): { groupLabel: string; name: string; title: string; std: string } | null;
};

declare global {
  interface Window {
    Curriculum: CurriculumApi;
  }
}

/** 정답이 어떤 꼴인지. distractor 규칙 선택에 쓰인다. */
export type AnswerForm =
  | { kind: 'int'; value: number }
  | { kind: 'decimal'; value: number; places: number }
  | { kind: 'fraction'; n: number; d: number }
  | { kind: 'mixed'; w: number; n: number; d: number }
  /** 통분 결과 — 분모가 같은 두 분수 */
  | { kind: 'fracPair'; an: number; bn: number; d: number }
  | { kind: 'quotRem'; q: number; r: number; rPlaces: number };

/** 게임에서 쓰는 4지선다 문항. */
export type GameQuiz = {
  itemId: string;
  /** 학기군 라벨 (예: "4학년 1학기") */
  groupLabel: string;
  /** 유형명 (예: "(세 자리 수) ÷ (두 자리 수)") */
  itemName: string;
  /** 성취기준 코드 */
  std: string;
  /** 빈칸이 "?"로 치환된 지문 HTML */
  promptHtml: string;
  /** 보기 4개 (HTML). 분수는 세로 분수로 렌더된다. */
  choices: string[];
  /** 보기 4개의 평문(로그·검증용) */
  choicesText: string[];
  answer: number;
  form: AnswerForm['kind'];
  /** 각 오답이 어떤 규칙으로 만들어졌는지 (PoC 검수용) */
  rules: string[];
};

export type AdaptFailure = { itemId: string; reason: string; promptHtml: string };
