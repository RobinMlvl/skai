/** Items that no other item beats on both price and duration, sorted by ascending price. */
export function paretoFrontier<T>(items: readonly T[], price: (t: T) => number, duration: (t: T) => number): T[] {
  const sorted = [...items].sort((a, b) => price(a) - price(b) || duration(a) - duration(b));
  const frontier: T[] = [];
  let bestDuration = Infinity;
  for (const item of sorted) {
    if (duration(item) < bestDuration) {
      frontier.push(item);
      bestDuration = duration(item);
    }
  }
  return frontier;
}
