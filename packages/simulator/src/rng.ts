/**
 * Seeded pseudo-random numbers and distributions (spec 0086 FR1).
 *
 * Algorithm: **xoshiro128\*\*** (Blackman & Vigna) on 32-bit unsigned integers, seeded through
 * SplitMix32. Only 32-bit integer operations (`Math.imul`, `>>> 0`) are used, so the same seed
 * produces byte-identical sequences on every platform and JavaScript engine.
 */

const TWO_POW_32 = 4_294_967_296;

/** SplitMix32 step — expands one seed word into well-mixed state words. */
function splitMix32(state: number): [number, number] {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return [next, (z ^ (z >>> 16)) >>> 0];
}

/** FNV-1a hash of a string, used to derive independent sub-streams from labels. */
export function hashLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private spareNormal: number | null = null;
  readonly seed: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_POW_32) {
      throw new RangeError(`seed must be an unsigned 32-bit integer, got ${seed}`);
    }
    this.seed = seed;
    let st = seed;
    let w: number;
    [st, w] = splitMix32(st);
    this.s0 = w;
    [st, w] = splitMix32(st);
    this.s1 = w;
    [st, w] = splitMix32(st);
    this.s2 = w;
    [, w] = splitMix32(st);
    this.s3 = w;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** An independent stream derived from this stream's seed and a label (does not consume state). */
  fork(label: string): Rng {
    return new Rng(
      ((Math.imul(this.seed ^ hashLabel(label), 0x9e3779b1) >>> 0) ^ hashLabel(label)) >>> 0,
    );
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform on the open interval (0, 1) — never exactly 0 or 1. */
  uniform(): number {
    return (this.nextUint32() + 0.5) / TWO_POW_32;
  }

  /** Exponential variate with the given rate (mean 1/rate). */
  exponential(rate: number): number {
    return -Math.log(this.uniform()) / rate;
  }

  /** Standard normal variate (Box–Muller, both values used). */
  normal(): number {
    if (this.spareNormal !== null) {
      const v = this.spareNormal;
      this.spareNormal = null;
      return v;
    }
    const u1 = this.uniform();
    const u2 = this.uniform();
    const r = Math.sqrt(-2 * Math.log(u1));
    this.spareNormal = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Standard Moyal variate λ with density exp(−(λ + e^(−λ))/2)/√(2π), sampled **exactly**:
   * if Z ~ N(0, 1) then e^(−λ) = Z² follows χ²₁, so λ = −ln(Z²). No table, no rejection.
   */
  moyal(): number {
    const z = this.normal();
    return -Math.log(z * z);
  }

  /** Bernoulli trial with probability p. */
  chance(p: number): boolean {
    return this.uniform() < p;
  }
}

/** Complementary error function (W. J. Cody-style rational approximation, |error| < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Cumulative distribution of the standard Moyal distribution: F(λ) = erfc(e^(−λ/2) / √2). */
export function moyalCdf(lambda: number): number {
  return erfc(Math.exp(-lambda / 2) / Math.SQRT2);
}

/** Cumulative distribution of the standard normal distribution. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}
