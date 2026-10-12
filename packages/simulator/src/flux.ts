/**
 * Base event rate of a flat horizontal device (spec 0086 FR2).
 *
 * The rate on a flat detector of area A is R = A · ∫ I(θ) cos θ dΩ over the upper hemisphere.
 * For I(θ) = I_v · cos²θ this has the closed form **R = A · I_v · π/2**.
 *
 * A muon-only flux gives only ≈ 0.3–0.4 s⁻¹ for a 25 cm² device, so presets may give the base rate
 * directly as a **total trigger rate** (MIP-type charged particles, gammas, and noise triggers) —
 * never labelled as a muon flux.
 */

export type BaseRateConfig =
  | {
      /** I(θ) = I_v cos²θ. */
      readonly kind: "cos2";
      readonly areaCm2: number;
      /** Vertical intensity I_v in cm⁻² s⁻¹ sr⁻¹. */
      readonly ivPerCm2SSr: number;
    }
  | {
      /**
       * Angular shape of Guan et al. (2015): cos²θ evaluated at Chirkin's effective angle θ*,
       * which corrects cos θ for Earth's curvature at large zenith angles. Tier-1 approximation:
       * only the angular shape is modified; the energy dependence of the Guan formula is not used.
       */
      readonly kind: "cos2Star";
      readonly areaCm2: number;
      readonly ivPerCm2SSr: number;
    }
  | {
      /** Rate of non-noise triggers given directly (MIP-type, gammas) — not a muon flux; noise triggers are added via noiseTriggers. */
      readonly kind: "totalTriggerRate";
      readonly ratePerS: number;
    };

/** Closed form for cos²θ on a flat detector: R = A · I_v · π/2 (s⁻¹). */
export function cos2BaseRate(areaCm2: number, ivPerCm2SSr: number): number {
  return (areaCm2 * ivPerCm2SSr * Math.PI) / 2;
}

/** Chirkin's effective cos θ* used by Guan et al. (2015). */
export function chirkinCosThetaStar(cosTheta: number): number {
  const p1 = 0.102573;
  const p2 = -0.068287;
  const p3 = 0.958633;
  const p4 = 0.0407253;
  const p5 = 0.817285;
  const c = Math.max(0, cosTheta);
  const numerator = c * c + p1 * p1 + p2 * Math.pow(c, p3) + p4 * Math.pow(c, p5);
  const denominator = 1 + p1 * p1 + p2 + p4;
  return Math.sqrt(Math.max(0, numerator / denominator));
}

/**
 * Rate on a flat detector for an arbitrary zenith-angle intensity I(θ) (cm⁻² s⁻¹ sr⁻¹), by
 * Simpson integration of 2π · ∫₀^{π/2} I(θ) cos θ sin θ dθ.
 */
export function flatDetectorRate(
  areaCm2: number,
  intensity: (thetaRad: number) => number,
  intervals = 2000,
): number {
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const h = Math.PI / 2 / n;
  const f = (theta: number): number => intensity(theta) * Math.cos(theta) * Math.sin(theta);
  let sum = f(0) + f(Math.PI / 2);
  for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * f(i * h);
  return areaCm2 * 2 * Math.PI * ((sum * h) / 3);
}

/** Base rate (s⁻¹) at the reference pressure for a device. */
export function baseRate(config: BaseRateConfig): number {
  switch (config.kind) {
    case "cos2":
      return cos2BaseRate(config.areaCm2, config.ivPerCm2SSr);
    case "cos2Star":
      return flatDetectorRate(config.areaCm2, (theta) => {
        const cs = chirkinCosThetaStar(Math.cos(theta));
        return config.ivPerCm2SSr * cs * cs;
      });
    case "totalTriggerRate":
      return config.ratePerS;
  }
}
