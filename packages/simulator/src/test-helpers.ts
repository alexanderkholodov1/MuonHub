/** Test helpers: KS test, FNV hash, and a minimal scenario builder. */
import type { DeviceConfig, ScenarioConfig } from "./config.js";

/** Kolmogorov–Smirnov statistic of sorted-in-place `sample` against a CDF. */
export function ksStatistic(sample: number[], cdf: (x: number) => number): number {
  sample.sort((a, b) => a - b);
  const n = sample.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(sample[i] ?? 0);
    d = Math.max(d, Math.abs((i + 1) / n - f), Math.abs(f - i / n));
  }
  return d;
}

/** Asymptotic KS p-value, Q(√n·D). */
export function ksPValue(d: number, n: number): number {
  const x = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * d;
  let sum = 0;
  for (let k = 1; k <= 100; k++) sum += 2 * (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * x * x);
  return Math.min(1, Math.max(0, sum));
}

export function fnv1a(bytes: readonly Uint8Array[]): number {
  let h = 0x811c9dc5;
  for (const b of bytes) for (const v of b) h = Math.imul(h ^ v, 0x01000193) >>> 0;
  return h >>> 0;
}

export function testDevice(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    id: "d1",
    deviceType: "munra",
    rate: { kind: "totalTriggerRate", ratePerS: 2 },
    amplitude: {
      mpv: 100,
      width: 10,
      unit: "mV",
      noiseSigma: 0,
      saturation: { value: 3300, unit: "mV" },
    },
    deadTimeUs: 0,
    ...overrides,
  };
}

export function testScenario(
  devices: DeviceConfig[],
  overrides: Partial<ScenarioConfig> = {},
): ScenarioConfig {
  return {
    seed: 7,
    startMs: 0,
    durationMs: 600_000,
    pressure: { kind: "constant", hPa: 768 },
    devices,
    ...overrides,
  };
}
