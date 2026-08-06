/**
 * 균일 그리드 브로드페이즈.
 *
 * 적 300체를 전수 비교하면 프레임당 45,000회다. 셀 크기를 최대 히트박스의 2배로 잡고
 * 주변 9칸만 훑으면 실사용에서 수백 회로 줄어든다.
 *
 * 매 프레임 `clear() → insert() … → query()` 순으로 쓴다. 할당을 피하려고
 * 셀은 숫자 배열(인덱스 저장)로 유지하고, 배열은 비우기만 하고 버리지 않는다.
 */

export class SpatialGrid {
  private cells = new Map<number, number[]>();
  /** 재사용을 위해 비운 배열을 보관 */
  private freeLists: number[][] = [];

  constructor(public cellSize: number) {}

  private key(cx: number, cy: number) {
    // 좌표는 음수도 나온다. 32비트 범위에서 충돌하지 않도록 오프셋을 준다.
    return ((cx + 0x8000) << 16) | ((cy + 0x8000) & 0xffff);
  }

  clear() {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.freeLists.push(list);
    }
    this.cells.clear();
  }

  insert(index: number, x: number, y: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const k = this.key(cx, cy);
    let list = this.cells.get(k);
    if (!list) {
      list = this.freeLists.pop() ?? [];
      this.cells.set(k, list);
    }
    list.push(index);
  }

  /**
   * (x, y) 반경 r 안에 있을 **가능성이 있는** 인덱스를 콜백으로 넘긴다.
   * 정확한 거리 판정은 호출부에서 한다(브로드페이즈이므로 여유분이 포함된다).
   */
  query(x: number, y: number, r: number, fn: (index: number) => void) {
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minY = Math.floor((y - r) / this.cellSize);
    const maxY = Math.floor((y + r) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) fn(list[i]);
      }
    }
  }

  get cellCount() {
    return this.cells.size;
  }
}
