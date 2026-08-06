/**
 * 오브젝트 풀.
 *
 * 서바이버형은 적·탄환·파티클이 초당 수백 개 생성/소멸한다. 매번 새 객체를 만들면
 * GC가 주기적으로 프레임을 잡아먹어 저사양 태블릿에서 눈에 띄게 끊긴다.
 * 그래서 배열을 미리 잡아두고 `alive` 개수만 옮기는 방식으로 재사용한다.
 */

export type Poolable = { alive: boolean };

export class Pool<T extends Poolable> {
  private items: T[] = [];
  /** items[0 .. count-1] 이 살아있는 구간 */
  private count = 0;

  constructor(
    private factory: () => T,
    initial = 0,
  ) {
    for (let i = 0; i < initial; i++) this.items.push(factory());
  }

  get active() {
    return this.count;
  }

  get capacity() {
    return this.items.length;
  }

  /** 살아있는 원소를 순회한다. 콜백 안에서 kill() 해도 안전하다. */
  forEach(fn: (item: T, index: number) => void) {
    for (let i = 0; i < this.count; i++) fn(this.items[i], i);
  }

  at(i: number): T {
    return this.items[i];
  }

  spawn(): T {
    if (this.count === this.items.length) this.items.push(this.factory());
    const item = this.items[this.count++];
    item.alive = true;
    return item;
  }

  /**
   * 죽은 원소를 뒤쪽으로 밀어내 살아있는 구간을 압축한다.
   * 매 프레임 1회 호출. (순회 중 즉시 제거하면 인덱스가 꼬인다)
   */
  compact() {
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      if (w !== i) {
        const tmp = this.items[w];
        this.items[w] = it;
        this.items[i] = tmp;
      }
      w++;
    }
    this.count = w;
  }

  clear() {
    for (let i = 0; i < this.count; i++) this.items[i].alive = false;
    this.count = 0;
  }
}
