/** CSS cubic-bezier() as a function, for motion driven from requestAnimationFrame (canvas). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton's method, then bisection if the slope is too flat to trust.
    let s = t;
    for (let i = 0; i < 8; i++) {
      const error = x(s) - t;
      if (Math.abs(error) < 1e-6) return y(s);
      const slope = dx(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      if (x(s) < t) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return y(s);
  };
}

/** Strong ease-out for things entering. */
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
/** Strong ease-in-out for things moving on screen. */
export const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);
