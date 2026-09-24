import createGlobe from "cobe";
import { useEffect, useMemo, useRef } from "react";
import { airportByIata, type Airport } from "../airports/search";

interface Props {
  origins: string[];
  destinations: string[];
  active: boolean;
}

type LatLon = [number, number];
const toAngles = (lat: number, lon: number): LatLon => [
  Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2),
  (lat * Math.PI) / 180,
];
const known = (codes: string[]) => codes.map(airportByIata).filter((a): a is Airport => a !== undefined);

export function Globe({ origins, destinations, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const originKey = origins.join(",");
  const destinationKey = destinations.join(",");
  const points = useMemo(
    () => ({ from: known(origins), to: known(destinations) }),
    [originKey, destinationKey],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = canvas.offsetWidth || 400;
    const focus = points.from[0] ?? points.to[0];
    let [phi, theta] = focus ? toAngles(focus.lat, focus.lon) : [0, 0.3];
    theta = Math.max(-0.6, Math.min(0.6, theta));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: size * 2,
      height: size * 2,
      phi,
      theta,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16_000,
      mapBrightness: 5,
      baseColor: [0.22, 0.28, 0.36],
      markerColor: [0.72, 0.84, 0.95],
      glowColor: [0.2, 0.27, 0.36],
      markers: [
        ...points.from.map((a) => ({ location: [a.lat, a.lon] as LatLon, size: 0.05 })),
        ...points.to.map((a) => ({ location: [a.lat, a.lon] as LatLon, size: 0.06, color: [1, 0.27, 0.27] as [number, number, number] })),
      ],
      arcs: points.from.flatMap((f) =>
        points.to.map((t) => ({ from: [f.lat, f.lon] as LatLon, to: [t.lat, t.lon] as LatLon })),
      ),
      arcColor: [0.56, 0.71, 0.85],
      arcWidth: 0.6,
      arcHeight: 0.25,
    });

    let frame = 0;
    const tick = () => {
      if (!reducedMotion) {
        phi += activeRef.current ? 0.006 : 0.0015;
        globe.update({ phi });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      globe.destroy();
    };
  }, [points]);

  return (
    <div className="globe-wrap">
      <canvas ref={canvasRef} className="globe" role="img" aria-label="Globe showing the selected airports" />
    </div>
  );
}
