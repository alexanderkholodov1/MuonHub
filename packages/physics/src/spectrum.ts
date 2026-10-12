/**
 * Amplitude spectrum and most probable value (THEORETICAL-FOUNDATION §6; spec 0085 FR6).
 *
 * Built only from event-level amplitudes (or event-level histograms of hourly summaries) — never from
 * per-minute min/avg/max. Binning is fixed and declared by the device type; events at or above the
 * device type's saturation level go to an explicit saturation count, never also into the last
 * regular bin. The MPV comes from a Moyal fit around the peak (the Moyal function approximates the
 * Landau distribution), with an uncertainty. Large inputs are processed with loops only.
 */
import { invert } from "./math.js";
import { provenance, type Provenance, type ResultStatus } from "./provenance.js";

export type AmplitudeUnit = "mV" | "adc";

export interface Binning {
  /** Ascending bin edges; n + 1 edges define n bins [edges[i], edges[i+1]). */
  readonly edges: readonly number[];
  readonly unit: AmplitudeUnit;
}

export interface Saturation {
  readonly value: number;
  readonly unit: AmplitudeUnit;
}

export interface AmplitudeHistogram {
  readonly status: ResultStatus;
  readonly edges: readonly number[];
  readonly unit: AmplitudeUnit;
  readonly counts: readonly number[];
  /** Below the first edge. */
  readonly underflow: number;
  /** At or above the last edge but below saturation. */
  readonly overflow: number;
  /** At or above the saturation level. */
  readonly saturated: number;
  /** Non-finite values (counted, never silently dropped). */
  readonly nonFinite: number;
  /** Every input value, whatever its category. */
  readonly total: number;
  readonly provenance: Provenance;
}

function validEdges(edges: readonly number[]): boolean {
  if (edges.length < 2) return false;
  for (let i = 1; i < edges.length; i++) {
    if (!((edges[i] as number) > (edges[i - 1] as number))) return false;
  }
  return edges.every(Number.isFinite);
}

function binIndex(edges: readonly number[], x: number): number {
  let lo = 0;
  let hi = edges.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (x >= (edges[mid] as number)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function buildAmplitudeHistogram(
  amplitudes: Iterable<number>,
  binning: Binning,
  saturation: Saturation,
): AmplitudeHistogram {
  const prov = provenance("buildAmplitudeHistogram", {
    edges: binning.edges.length,
    unit: binning.unit,
    saturation,
  });
  const empty = (status: ResultStatus): AmplitudeHistogram => ({
    status,
    edges: binning.edges,
    unit: binning.unit,
    counts: [],
    underflow: 0,
    overflow: 0,
    saturated: 0,
    nonFinite: 0,
    total: 0,
    provenance: prov,
  });
  if (
    !validEdges(binning.edges) ||
    saturation.unit !== binning.unit ||
    !Number.isFinite(saturation.value)
  ) {
    return empty("invalid");
  }
  const edges = binning.edges;
  const counts = new Array<number>(edges.length - 1).fill(0);
  const last = edges[edges.length - 1] as number;
  const first = edges[0] as number;
  let underflow = 0;
  let overflow = 0;
  let saturated = 0;
  let nonFinite = 0;
  let total = 0;
  for (const a of amplitudes) {
    total++;
    if (!Number.isFinite(a)) nonFinite++;
    else if (a >= saturation.value) saturated++;
    else if (a < first) underflow++;
    else if (a >= last) overflow++;
    else {
      const i = binIndex(edges, a);
      counts[i] = (counts[i] as number) + 1;
    }
  }
  return {
    status: "ok",
    edges,
    unit: binning.unit,
    counts,
    underflow,
    overflow,
    saturated,
    nonFinite,
    total,
    provenance: prov,
  };
}

export function mergeHistograms(hs: readonly AmplitudeHistogram[]): AmplitudeHistogram {
  const prov = provenance("mergeHistograms", { count: hs.length });
  const firstH = hs[0];
  if (firstH === undefined) {
    return {
      status: "not-computable",
      edges: [],
      unit: "mV",
      counts: [],
      underflow: 0,
      overflow: 0,
      saturated: 0,
      nonFinite: 0,
      total: 0,
      provenance: prov,
    };
  }
  const sameEdges = (e: readonly number[]): boolean =>
    e.length === firstH.edges.length && e.every((v, i) => v === firstH.edges[i]);
  if (!hs.every((h) => h.status === "ok" && h.unit === firstH.unit && sameEdges(h.edges))) {
    return { ...firstH, status: "invalid", counts: [], provenance: prov };
  }
  const counts = new Array<number>(firstH.counts.length).fill(0);
  let underflow = 0;
  let overflow = 0;
  let saturated = 0;
  let nonFinite = 0;
  let total = 0;
  for (const h of hs) {
    for (let i = 0; i < counts.length; i++)
      counts[i] = (counts[i] as number) + (h.counts[i] as number);
    underflow += h.underflow;
    overflow += h.overflow;
    saturated += h.saturated;
    nonFinite += h.nonFinite;
    total += h.total;
  }
  return {
    status: "ok",
    edges: firstH.edges,
    unit: firstH.unit,
    counts,
    underflow,
    overflow,
    saturated,
    nonFinite,
    total,
    provenance: prov,
  };
}

/** Moyal density with location μ (its mode = MPV) and scale σ. */
export function moyalPdf(x: number, mu: number, sigma: number): number {
  const l = (x - mu) / sigma;
  return Math.exp(-(l + Math.exp(-l)) / 2) / (sigma * Math.sqrt(2 * Math.PI));
}

export interface MpvFit {
  readonly status: ResultStatus;
  readonly mpv?: number;
  readonly sigmaMpv?: number;
  /** Moyal scale parameter. */
  readonly width?: number;
  readonly unit: AmplitudeUnit;
  readonly binsUsed: number;
  readonly provenance: Provenance;
}

function nelderMead(
  f: (p: number[]) => number,
  start: number[],
  step: number[],
  iterations = 400,
): number[] {
  const n = start.length;
  let simplex: number[][] = [start];
  for (let i = 0; i < n; i++) {
    const p = [...start];
    p[i] = (p[i] as number) + (step[i] as number);
    simplex.push(p);
  }
  let values = simplex.map(f);
  for (let it = 0; it < iterations; it++) {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i] as number[]);
    values = order.map(([v]) => v);
    const best = values[0] as number;
    const worst = values[n] as number;
    if (Math.abs(worst - best) < 1e-10 * (1 + Math.abs(best))) break;
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let d = 0; d < n; d++)
        centroid[d] = (centroid[d] as number) + ((simplex[i] as number[])[d] as number) / n;
    const w = simplex[n] as number[];
    const at = (t: number): number[] => centroid.map((c, d) => c + t * (c - (w[d] as number)));
    const r = at(1);
    const fr = f(r);
    if (fr < best) {
      const e = at(2);
      const fe = f(e);
      if (fe < fr) {
        simplex[n] = e;
        values[n] = fe;
      } else {
        simplex[n] = r;
        values[n] = fr;
      }
    } else if (fr < (values[n - 1] as number)) {
      simplex[n] = r;
      values[n] = fr;
    } else {
      const c = at(-0.5);
      const fc = f(c);
      if (fc < worst) {
        simplex[n] = c;
        values[n] = fc;
      } else {
        const b = simplex[0] as number[];
        for (let i = 1; i <= n; i++) {
          simplex[i] = (simplex[i] as number[]).map(
            (v, d) => (b[d] as number) + 0.5 * (v - (b[d] as number)),
          );
          values[i] = f(simplex[i] as number[]);
        }
      }
    }
  }
  let bi = 0;
  for (let i = 1; i < values.length; i++)
    if ((values[i] as number) < (values[bi] as number)) bi = i;
  return simplex[bi] as number[];
}

/**
 * MPV from a binned Poisson-likelihood Moyal fit over the peak region (bins with at least
 * `regionFraction` of the peak count, contiguous around the peak). Uncertainty from the curvature of
 * the likelihood. Proposed: Moyal shape; regionFraction 0.25.
 */
export function fitMpv(h: AmplitudeHistogram, regionFraction = 0.25): MpvFit {
  const prov = provenance("fitMpv", { regionFraction, unit: h.unit, bins: h.counts.length });
  const fail = (status: ResultStatus, binsUsed = 0): MpvFit => ({
    status,
    unit: h.unit,
    binsUsed,
    provenance: prov,
  });
  if (h.status !== "ok" || h.counts.length < 4) return fail("not-computable");
  let peak = 0;
  for (let i = 1; i < h.counts.length; i++)
    if ((h.counts[i] as number) > (h.counts[peak] as number)) peak = i;
  const peakCount = h.counts[peak] as number;
  if (peakCount < 10) return fail("not-computable");
  let lo = peak;
  while (lo > 0 && (h.counts[lo - 1] as number) >= regionFraction * peakCount) lo--;
  let hi = peak;
  while (hi < h.counts.length - 1 && (h.counts[hi + 1] as number) >= regionFraction * peakCount)
    hi++;
  if (hi - lo + 1 < 4) return fail("not-computable", hi - lo + 1);

  const centers: number[] = [];
  const widths: number[] = [];
  const k: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const a = h.edges[i] as number;
    const b = h.edges[i + 1] as number;
    centers.push((a + b) / 2);
    widths.push(b - a);
    k.push(h.counts[i] as number);
  }
  const kSum = k.reduce((s, v) => s + v, 0);
  const nll = (p: number[]): number => {
    const mu = p[0] as number;
    const sigma = Math.exp(p[1] as number);
    let gSum = 0;
    const g = centers.map((c, i) => {
      const v = moyalPdf(c, mu, sigma) * (widths[i] as number);
      gSum += v;
      return v;
    });
    if (!(gSum > 0)) return 1e300;
    const amp = kSum / gSum;
    let s = 0;
    for (let i = 0; i < g.length; i++) {
      const m = Math.max(amp * (g[i] as number), 1e-300);
      s += m - (k[i] as number) * Math.log(m);
    }
    return s;
  };
  const span = (h.edges[hi + 1] as number) - (h.edges[lo] as number);
  const start = [centers[peak - lo] as number, Math.log(Math.max(span / 3.6, 1e-9))];
  const best = nelderMead(nll, start, [span / 10, 0.2]);
  const mu = best[0] as number;
  const logS = best[1] as number;
  // Numerical Hessian (central differences) of the NLL in (μ, ln σ).
  const hMu = Math.max(1e-6, Math.abs(span) * 1e-3);
  const hS = 1e-3;
  const f0 = nll(best);
  const fpp = nll([mu + hMu, logS]);
  const fmm = nll([mu - hMu, logS]);
  const fss = nll([mu, logS + hS]);
  const fs0 = nll([mu, logS - hS]);
  const fps = nll([mu + hMu, logS + hS]);
  const fpm = nll([mu + hMu, logS - hS]);
  const fmp = nll([mu - hMu, logS + hS]);
  const fms = nll([mu - hMu, logS - hS]);
  const hmm = (fpp - 2 * f0 + fmm) / (hMu * hMu);
  const hss = (fss - 2 * f0 + fs0) / (hS * hS);
  const hms = (fps - fpm - fmp + fms) / (4 * hMu * hS);
  const cov = invert([
    [hmm, hms],
    [hms, hss],
  ]);
  const varMu = cov === undefined ? NaN : ((cov[0] as number[])[0] as number);
  if (!Number.isFinite(mu) || !(varMu > 0)) return fail("not-computable", k.length);
  return {
    status: "ok",
    mpv: mu,
    sigmaMpv: Math.sqrt(varMu),
    width: Math.exp(logS),
    unit: h.unit,
    binsUsed: k.length,
    provenance: prov,
  };
}
