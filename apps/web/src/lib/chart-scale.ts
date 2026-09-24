const round = (value: number) => Math.round(value * 1_000) / 1_000;

export function paddedDomain(min: number, max: number): [number, number] {
  if (min === max) return [round(min * 0.9), round(max * 1.1 || 1)];
  const pad = (max - min) * 0.08;
  return [round(Math.max(0, min - pad)), round(max + pad)];
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * power;
}

export function niceTicks(from: number, to: number, count: number): number[] {
  const step = niceStep((to - from) / count);
  const ticks: number[] = [];
  for (let value = Math.ceil(from / step) * step; value <= to; value += step) ticks.push(round(value));
  return ticks;
}
