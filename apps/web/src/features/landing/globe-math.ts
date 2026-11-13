/**
 * Geometry of the landing's globe: a unit sphere with y toward the north pole and longitude 0 toward
 * +z (the camera looks from +z). Pure functions, so they are tested without WebGL.
 */

export type Vec3 = [number, number, number];

const RAD = Math.PI / 180;

/** Unit vector of a latitude and longitude in degrees. */
export function latLonToVector(lat: number, lon: number): Vec3 {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)];
}

/** Local east and north unit vectors at a latitude and longitude (tangent to the sphere). */
export function localAxes(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return {
    east: [Math.cos(lam), 0, -Math.sin(lam)],
    north: [-Math.sin(phi) * Math.sin(lam), Math.cos(phi), -Math.sin(phi) * Math.cos(lam)],
    up: latLonToVector(lat, lon),
  };
}

/**
 * Rotations that bring a place to the front of the globe: the inner group turns by `y` about the
 * polar axis, the outer one by `x` about the horizontal axis; `tilt` (rad) shows a little more of
 * the north, leaving the place slightly below the centre.
 */
export function facing(lat: number, lon: number, tilt = 0): { x: number; y: number } {
  return { x: lat * RAD + tilt, y: -lon * RAD };
}

/** Applies the inner (about y) then outer (about x) rotations to a vector. */
export function rotate(v: Vec3, rotation: { x: number; y: number }): Vec3 {
  const [x, y, z] = v;
  const cy = Math.cos(rotation.y);
  const sy = Math.sin(rotation.y);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rotation.x);
  const sx = Math.sin(rotation.x);
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
}

/**
 * Zenith angle of a track crossing a horizontal detector, for an intensity I(θ) ∝ cos²θ
 * (THEORETICAL-FOUNDATION §2): the crossing rate goes as cos³θ·sinθ, so cos θ = (1 − u)^¼.
 */
export function sampleZenith(u: number): number {
  return Math.acos(Math.pow(1 - Math.min(Math.max(u, 0), 1 - 1e-12), 0.25));
}

/** Direction a particle came from, as a unit vector, for zenith θ and azimuth phi at a place. */
export function arrivalDirection(
  axes: { east: Vec3; north: Vec3; up: Vec3 },
  zenith: number,
  azimuth: number,
): Vec3 {
  const s = Math.sin(zenith);
  const c = Math.cos(zenith);
  const a = Math.cos(azimuth);
  const b = Math.sin(azimuth);
  const [ux, uy, uz] = axes.up;
  const [ex, ey, ez] = axes.east;
  const [nx, ny, nz] = axes.north;
  return [
    ux * c + (ex * a + nx * b) * s,
    uy * c + (ey * a + ny * b) * s,
    uz * c + (ez * a + nz * b) * s,
  ];
}

/** Points around a place, about `radiusDeg` away, for a small cluster of markers. */
export function clusterAround(
  lat: number,
  lon: number,
  count: number,
  radiusDeg: number,
): Array<[number, number]> {
  if (count <= 1) return [[lat, lon]];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return [
      lat + radiusDeg * Math.sin(angle),
      lon + (radiusDeg * Math.cos(angle)) / Math.cos(lat * RAD),
    ];
  });
}
