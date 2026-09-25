import createGlobe, { type Marker } from "cobe";
import { useEffect, useMemo, useRef } from "react";
import { airportByIata, type Airport } from "../airports/search";
import { EASE_IN_OUT, EASE_OUT } from "../lib/easing";

interface Props {
  origins: string[];
  destinations: string[];
  active: boolean;
  /** CSS px; the canvas is square. */
  size: number;
}

type LatLon = [number, number];
type Rgb = [number, number, number];

const SIGNAL: Rgb = [0.56, 0.71, 0.85]; // --accent
const SIGNAL_BRIGHT: Rgb = [0.86, 0.93, 1];
const ALERT: Rgb = [1, 0.27, 0.27]; // --trap: arrivals
const CAMERA_MS = 700; // the view glides to a new route
const ARC_MS = 600; // arcs rise from the ground
const ARC_HEIGHT = 0.28;
const BREATH_MS = 1_400; // one breath while a scan runs
const IDLE_SPIN = 0.0012; // radians per frame, only when no route is shown
const MAX_TILT = 1; // radians of camera tilt: enough to centre routes up to ~57° of latitude

const known = (codes: string[]) => codes.map(airportByIata).filter((a): a is Airport => a !== undefined);
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** cobe's camera angles that put this point in the middle of the sphere. */
const anglesFor = (lat: number, lon: number): LatLon => [
  Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2),
  Math.max(-MAX_TILT, Math.min(MAX_TILT, (lat * Math.PI) / 180)),
];

/** Middle of all airports (circular mean for longitudes, so the dateline does not break it). */
function centerOf(airports: Airport[]): LatLon | null {
  if (airports.length === 0) return null;
  const lat = airports.reduce((sum, a) => sum + a.lat, 0) / airports.length;
  const x = airports.reduce((sum, a) => sum + Math.cos((a.lon * Math.PI) / 180), 0);
  const y = airports.reduce((sum, a) => sum + Math.sin((a.lon * Math.PI) / 180), 0);
  return [lat, (Math.atan2(y, x) * 180) / Math.PI];
}

/** Shortest signed turn from one angle to another. */
const turn = (from: number, to: number) => {
  const delta = (to - from) % (2 * Math.PI);
  return delta > Math.PI ? delta - 2 * Math.PI : delta < -Math.PI ? delta + 2 * Math.PI : delta;
};

export function Globe({ origins, destinations, active, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const originKey = origins.join(",");
  const destinationKey = destinations.join(",");
  const route = useMemo(
    () => ({ from: known(origins), to: known(destinations) }),
    // Codes, not array identities, decide when the route changed.
    [originKey, destinationKey],
  );
  // Read by the animation loop; a new route restarts the camera move and the arcs.
  const routeRef = useRef({ route, changedAt: 0 });

  useEffect(() => {
    routeRef.current = { route, changedAt: performance.now() };
  }, [route]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let [phi, theta] = [0.4, 0.25];
    let move: { from: LatLon; delta: LatLon; start: number } | null = null;
    let shown: typeof route | null = null;
    let settled = false; // the last frame drawn was still: nothing to redraw until something moves
    const host = canvas.parentElement; // cobe wraps the canvas in a div of its own

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi,
      theta,
      dark: 1,
      diffuse: 3,
      mapSamples: 20_000,
      mapBrightness: 7,
      mapBaseBrightness: 0.06,
      baseColor: [0.32, 0.4, 0.52],
      markerColor: SIGNAL_BRIGHT,
      glowColor: [0.28, 0.36, 0.48],
      markers: [],
      arcs: [],
      arcColor: SIGNAL,
      arcWidth: 0.7,
      arcHeight: 0,
      markerElevation: 0.01,
    });

    let frame = 0;
    const tick = (now: number) => {
      const { route: current, changedAt } = routeRef.current;
      const hasRoute = current.from.length > 0 || current.to.length > 0;

      if (current !== shown) {
        shown = current;
        settled = false; // a new route must be drawn at least once, even when it settles in this frame (reduced motion)
        const center = centerOf([...current.from, ...current.to]);
        if (center) {
          const [targetPhi, targetTheta] = anglesFor(center[0], center[1]);
          move = { from: [phi, theta], delta: [turn(phi, targetPhi), targetTheta - theta], start: now };
        }
      }
      const spinning = !move && !hasRoute && !reducedMotion;
      if (move) {
        const k = reducedMotion ? 1 : Math.min(1, (now - move.start) / CAMERA_MS);
        const eased = EASE_IN_OUT(k);
        phi = move.from[0] + move.delta[0] * eased;
        theta = move.from[1] + move.delta[1] * eased;
        if (k >= 1) move = null;
      } else if (spinning) {
        phi += IDLE_SPIN;
      }

      const rise = reducedMotion ? 1 : EASE_OUT(Math.min(1, (now - changedAt) / ARC_MS));
      const breathing = activeRef.current && !reducedMotion;
      // Each update re-uploads the buffers and restyles the page (cobe): skip it once nothing moves.
      const still = !move && !spinning && !breathing && rise >= 1;
      if (still && settled) {
        frame = requestAnimationFrame(tick);
        return;
      }
      settled = still;
      const breath = breathing ? 0.5 - 0.5 * Math.cos((2 * Math.PI * now) / BREATH_MS) : 0;
      const markers: Marker[] = [
        ...current.from.map((a) => ({ location: [a.lat, a.lon] as LatLon, size: 0.045 + 0.015 * breath })),
        ...current.to.map((a) => ({ location: [a.lat, a.lon] as LatLon, size: 0.055 + 0.02 * breath, color: ALERT })),
      ];
      globe.update({
        phi,
        theta,
        markers,
        arcs: current.from.flatMap((f) =>
          current.to.map((t) => ({ from: [f.lat, f.lon] as LatLon, to: [t.lat, t.lon] as LatLon })),
        ),
        arcHeight: ARC_HEIGHT * rise,
        arcColor: mix(SIGNAL, SIGNAL_BRIGHT, breath),
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      globe.destroy();
      // destroy() leaves cobe's wrapper: unwrap, or each new size would nest one more.
      const wrapper = canvas.parentElement;
      if (wrapper && wrapper !== host) wrapper.replaceWith(canvas);
    };
  }, [size]);

  return (
    <div className="globe-wrap">
      <canvas
        ref={canvasRef}
        className="globe"
        style={{ width: size, height: size }}
        role="img"
        aria-label={
          origins.length && destinations.length
            ? `Globe showing routes from ${origins.join(", ")} to ${destinations.join(", ")}`
            : "Globe"
        }
      />
    </div>
  );
}
