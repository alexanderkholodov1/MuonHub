/**
 * Geometry of the landing's hero (docs/design/LANDING-CONCEPT.md): real detections drawn as tracks
 * that cross a drawn detector, and the pointer acting as a gravitational lens on everything behind it.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Apparent position of a point seen past a point lens at `lens` with Einstein radius `radius`: the
 * brighter image lies on the same side, pushed out to (r + √(r² + 4R²)) / 2. Points far from the
 * lens barely move; a point behind the lens appears on the Einstein ring.
 */
export function lensed(p: Point, lens: Point, radius: number): Point {
  if (radius <= 0) return p;
  const dx = p.x - lens.x;
  const dy = p.y - lens.y;
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return { x: lens.x + radius, y: lens.y };
  const scale = (r + Math.sqrt(r * r + 4 * radius * radius)) / 2 / r;
  return { x: lens.x + dx * scale, y: lens.y + dy * scale };
}

/**
 * Zenith angle of a track crossing a horizontal detector, for an intensity I(θ) ∝ cos²θ
 * (THEORETICAL-FOUNDATION §2): the crossing rate goes as cos³θ·sinθ, so cos θ = (1 − u)^¼.
 */
export function sampleZenith(u: number): number {
  return Math.acos(Math.pow(1 - Math.min(Math.max(u, 0), 1 - 1e-12), 0.25));
}

/** On-screen direction (unit vector, y downward) of a track with zenith θ and azimuth φ. */
export function screenDirection(zenith: number, azimuth: number): Point {
  const x = Math.sin(zenith) * Math.cos(azimuth);
  const y = Math.cos(zenith);
  const n = Math.hypot(x, y);
  return { x: x / n, y: y / n };
}

export interface Track {
  start: Point;
  direction: Point;
  /** Distance from the start to the detector crossing, in px. */
  toCrossing: number;
}

/** A straight track that enters from above the top edge and crosses the detector at `crossing`. */
export function trackThrough(crossing: Point, direction: Point, margin = 24): Track {
  const toCrossing = (crossing.y + margin) / direction.y;
  return {
    start: { x: crossing.x - direction.x * toCrossing, y: -margin },
    direction,
    toCrossing,
  };
}

export interface Slab {
  /** Centre of the drawn detector. */
  center: Point;
  width: number;
  thickness: number;
}

/** Where the detector is drawn: right of the text on wide screens, above it on narrow ones. */
export function slabFor(width: number, height: number): Slab {
  if (width >= 900) {
    return {
      center: { x: Math.round(width * 0.74), y: Math.round(height * 0.6) },
      width: 280,
      thickness: 16,
    };
  }
  return {
    center: { x: Math.round(width / 2), y: Math.round(Math.min(height * 0.3, 260)) },
    width: Math.min(160, Math.round(width * 0.45)),
    thickness: 10,
  };
}

/** A small deterministic generator (mulberry32), so a size always draws the same sky. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
