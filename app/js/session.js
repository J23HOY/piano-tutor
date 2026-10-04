// "Start session" on Today queues its items; each screen moves on with session.advance().

let queue = [];
let pos = 0;

export const session = {
  start(hashes) { queue = hashes; pos = 0; },
  get active() { return queue.length > 0; },
  peek() { return queue[pos + 1] || null; },   // the item after the current one
  advance() {
    pos++;
    const next = queue[pos];
    if (!next) { this.clear(); location.hash = '#/today?done=1'; return; }
    location.hash = next;
  },
  clear() { queue = []; pos = 0; },
};
