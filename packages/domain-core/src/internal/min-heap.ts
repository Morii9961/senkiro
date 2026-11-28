/**
 * Minimal binary min-heap keyed by a numeric priority. Ties pop in insertion order, which
 * keeps every shortest-path search deterministic across runtimes.
 */
export class MinHeap<T> {
  private readonly items: { priority: number; order: number; value: T }[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  push(priority: number, value: T): void {
    this.items.push({ priority, order: this.counter++, value });
    this.siftUp(this.items.length - 1);
  }

  pop(): { priority: number; value: T } | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined) {
      return undefined;
    }
    if (this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return { priority: top.priority, value: top.value };
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    if (x === undefined || y === undefined) {
      return false;
    }
    return x.priority < y.priority || (x.priority === y.priority && x.order < y.order);
  }

  private swap(a: number, b: number): void {
    const x = this.items[a];
    const y = this.items[b];
    if (x !== undefined && y !== undefined) {
      this.items[a] = y;
      this.items[b] = x;
    }
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) {
        return;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(left, smallest)) {
        smallest = left;
      }
      if (right < n && this.less(right, smallest)) {
        smallest = right;
      }
      if (smallest === i) {
        return;
      }
      this.swap(i, smallest);
      i = smallest;
    }
  }
}
