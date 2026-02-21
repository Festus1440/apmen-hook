/**
 * In-memory dedupe by message-id (and optional uid) so reconnects don't reprocess.
 * Keeps a bounded set of recent IDs to avoid unbounded growth.
 */

const DEFAULT_MAX_SIZE = 10_000;

export class SeenSet {
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    this.ids = new Set();
    this.order = [];
  }

  has(id) {
    return this.ids.has(id);
  }

  add(id) {
    if (this.ids.has(id)) return;
    if (this.order.length >= this.maxSize) {
      const oldest = this.order.shift();
      this.ids.delete(oldest);
    }
    this.ids.add(id);
    this.order.push(id);
  }

  get size() {
    return this.ids.size;
  }
}
