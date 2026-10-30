/** Values closer than this many cents count as a tie. */
export const TIE_EPSILON = 1e-6;

export interface EnvelopeFlip {
  /** x where the leader changes. */
  at: number;
  from: number;
  to: number;
}

/**
 * Exact leader changes for series that are linear between consecutive nodes.
 * xs: strictly increasing node positions (at least two). ys[node][series]: series values at each node.
 * Returns the leader just after xs[0] and every x in [xs[0], last node) where the leader changes.
 */
export function envelopeFlips(
  xs: readonly number[],
  ys: readonly (readonly number[])[],
): { first: number; flips: EnvelopeFlip[] } {
  const flips: EnvelopeFlip[] = [];
  let first = 0;
  let leader = -1;
  for (let s = 0; s + 1 < xs.length; s++) {
    const x0 = xs[s] ?? 0;
    const x1 = xs[s + 1] ?? 0;
    const y0 = ys[s] ?? [];
    const y1 = ys[s + 1] ?? [];
    const slope = y0.map((v, i) => ((y1[i] ?? 0) - v) / (x1 - x0));
    const k = (i: number) => slope[i] ?? 0;
    const at = (i: number, x: number) => (y0[i] ?? 0) + k(i) * (x - x0);
    // Leader at the node: highest value, ties broken by who rises faster (who leads just after the node).
    let cur = 0;
    for (let i = 1; i < y0.length; i++) {
      const d = at(i, x0) - at(cur, x0);
      if (d > TIE_EPSILON || (d >= -TIE_EPSILON && k(i) > k(cur))) cur = i;
    }
    if (s === 0) first = cur;
    else if (cur !== leader) flips.push({ at: x0, from: leader, to: cur });
    // Walk the line intersections strictly inside (x0, x1): the next faster-rising series to overtake.
    let x = x0;
    for (;;) {
      let next = -1;
      let nextX = x1;
      for (let i = 0; i < y0.length; i++) {
        const dk = k(i) - k(cur);
        if (i === cur || dk <= 0) continue;
        const t = x + (at(cur, x) - at(i, x)) / dk;
        if (t > x && (t < nextX || (t === nextX && next >= 0 && k(i) > k(next)))) {
          next = i;
          nextX = t;
        }
      }
      if (next < 0 || nextX >= x1) break;
      flips.push({ at: nextX, from: cur, to: next });
      cur = next;
      x = nextX;
    }
    leader = cur;
  }
  return { first, flips };
}
