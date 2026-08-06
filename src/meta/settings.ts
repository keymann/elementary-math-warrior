/**
 * 접근성 · 표시 설정.
 *
 * 교실에서 쓰려면 "대부분에게 잘 보이는 화면"으로는 부족하다. 색각 이상 학생,
 * 화면 흔들림에 멀미를 느끼는 학생, 저사양 태블릿이 한 반에 섞여 있다.
 */
const KEY = 'emw.settings.v1';

export type Settings = {
  /** 색각 이상 대비 — 적을 색이 아니라 모양·테두리로도 구분한다 */
  colorSafe: boolean;
  /** 화면 흔들림 끄기 (멀미·집중 곤란 대응) */
  reduceShake: boolean;
  /** 저사양 모드 강제 (자동 전환과 별개) */
  forceLowPerf: boolean;
  /** 큰 글씨 — 퀴즈 지문·보기를 키운다 */
  bigText: boolean;
};

const DEFAULTS: Settings = {
  colorSafe: false,
  reduceShake: false,
  forceLowPerf: false,
  bigText: false,
};

let current: Settings = load();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const getSettings = (): Settings => current;

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* 저장 실패는 무시 — 이번 세션에는 그대로 적용된다 */
  }
  apply();
}

/** body 클래스로 CSS 에 전달한다 */
export function apply() {
  const c = document.body.classList;
  c.toggle('a11y-color-safe', current.colorSafe);
  c.toggle('a11y-big-text', current.bigText);
}

export const SETTING_LABELS: Record<keyof Settings, { label: string; desc: string }> = {
  colorSafe: { label: '🎨 색약 모드', desc: '적을 색 대신 테두리·모양으로 구분' },
  reduceShake: { label: '🌀 화면 흔들림 끄기', desc: '피격·폭발 시 화면이 흔들리지 않음' },
  bigText: { label: '🔠 큰 글씨', desc: '문제와 보기를 크게' },
  forceLowPerf: { label: '⚡ 가벼운 화면', desc: '효과를 줄여 느린 기기에서도 부드럽게' },
};
