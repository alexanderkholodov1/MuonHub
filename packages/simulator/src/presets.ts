/**
 * Named scenario presets (spec 0086 FR12). All rates are **total trigger rates** (MIP-type charged
 * particles, gammas, noise) — never a muon flux. The β value (−0.12 %/hPa), the noise rate, the
 * dead time, and the coincidence window are tunable assumptions, not measurements.
 */
import type { DeviceConfig, ScenarioConfig } from "./config.js";

export const PRESET_NAMES = [
  "usfq-cosmicwatch-munra",
  "stacked-pair",
  "disruptions",
  "forbush",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export interface PresetOptions {
  readonly seed?: number;
  readonly startMs?: number;
  readonly durationMs?: number;
}

const HOUR = 3_600_000;
/** 2026-01-01T00:00:00Z — a fixed epoch keeps presets deterministic. */
const DEFAULT_START_MS = Date.UTC(2026, 0, 1);

/** USFQ station reference pressure and the assumed barometric coefficient. */
export const USFQ_P0_HPA = 768;
export const USFQ_BETA_PERCENT_PER_HPA = -0.12;

function munraDevice(id: string, overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    id,
    deviceType: "munra",
    // 2.3 s⁻¹ of triggers plus 0.1 s⁻¹ of noise triggers ≈ 2.4 s⁻¹ total trigger rate.
    rate: { kind: "totalTriggerRate", ratePerS: 2.3 },
    amplitude: { mpv: 180, width: 25, unit: "mV", noiseSigma: 5, saturation: { value: 3300, unit: "mV" } },
    noiseTriggers: { ratePerS: 0.1, meanAmplitude: 40 },
    deadTimeUs: 200,
    clock: { offsetMs: 0, driftPpm: 20, jitterMs: 0.5 },
    hostLatency: { meanMs: 3, jitterMs: 2 },
    ...overrides,
  };
}

function base(options: PresetOptions, devices: DeviceConfig[]): ScenarioConfig {
  return {
    seed: options.seed ?? 1,
    startMs: options.startMs ?? DEFAULT_START_MS,
    durationMs: options.durationMs ?? 24 * HOUR,
    pressure: {
      kind: "tide",
      meanHpa: USFQ_P0_HPA,
      semidiurnalAmplitudeHpa: 1.5,
      synopticSigmaHpa: 1,
      seed: (options.seed ?? 1) + 1,
    },
    betaPercentPerHpa: USFQ_BETA_PERCENT_PER_HPA,
    p0Hpa: USFQ_P0_HPA,
    temperature: { meanC: 24, diurnalAmplitudeC: 2, noiseSigmaC: 0.1, seed: 5 },
    devices,
  };
}

export function preset(name: PresetName, options: PresetOptions = {}): ScenarioConfig {
  const start = options.startMs ?? DEFAULT_START_MS;
  switch (name) {
    case "usfq-cosmicwatch-munra":
      return base(options, [munraDevice("munra-1")]);
    case "stacked-pair":
      return {
        ...base(options, [
          munraDevice("upper", { noiseTriggers: { ratePerS: 0.05, meanAmplitude: 40 } }),
          munraDevice("lower", {
            deviceType: "cosmicwatch-v3x",
            noiseTriggers: { ratePerS: 0.05, meanAmplitude: 40 },
          }),
        ]),
        coincidence: { fractions: [0.5], halfWindowUs: 30 },
      };
    case "disruptions": {
      const d = munraDevice("munra-1", {
        render: { terminator: "CRLF" },
        disruptions: {
          gaps: [
            { startMs: start + 1 * HOUR, endMs: start + 1 * HOUR + 600_000, kind: "usb" },
            { startMs: start + 4 * HOUR, endMs: start + 4 * HOUR + 300_000, kind: "power" },
          ],
          resets: [start + 3 * HOUR],
          malformed: [
            { lineIndex: 100, kind: "truncated" },
            { lineIndex: 200, kind: "concatenated" },
            { lineIndex: 300, kind: "otherTerminator" },
            { lineIndex: 400, kind: "invalidUtf8" },
          ],
        },
      });
      return base({ ...options, durationMs: options.durationMs ?? 6 * HOUR }, [d]);
    }
    case "forbush":
      return {
        ...base({ ...options, durationMs: options.durationMs ?? 72 * HOUR }, [munraDevice("munra-1")]),
        forbush: [{ onsetMs: start + 6 * HOUR, depthPercent: 3, recoveryHours: 24 }],
      };
  }
}
