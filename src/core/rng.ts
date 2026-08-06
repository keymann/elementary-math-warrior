/**
 * 시드 난수 (mulberry32).
 *
 * `Math.random()` 을 쓰면 같은 판을 재현할 수 없어 밸런스 시뮬레이션과
 * 점수 서버 검증이 불가능해진다. 런 시작 시 시드를 정하고 그 시드로만 뽑는다.
 */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export const randInt = (rng: Rng, min: number, max: number) => Math.floor(randRange(rng, min, max + 1));
