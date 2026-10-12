/**
 * Scenario configuration — validated with zod at the public boundary (spec 0086, non-functional).
 */
import { z } from "zod";

const Finite = z.number().refine(Number.isFinite, "must be finite");
const NonNegative = Finite.refine((v) => v >= 0, "must be ≥ 0");
const Positive = Finite.refine((v) => v > 0, "must be > 0");

export const BaseRateConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cos2"), areaCm2: Positive, ivPerCm2SSr: Positive }),
  z.strictObject({ kind: z.literal("cos2Star"), areaCm2: Positive, ivPerCm2SSr: Positive }),
  z.strictObject({ kind: z.literal("totalTriggerRate"), ratePerS: NonNegative }),
]);

export const PressureConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("constant"), hPa: Positive }),
  z.strictObject({
    kind: z.literal("tide"),
    meanHpa: Positive,
    semidiurnalAmplitudeHpa: NonNegative,
    phaseHours: Finite.optional(),
    synopticSigmaHpa: NonNegative.optional(),
    synopticCorrelationHours: Positive.optional(),
    seed: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("samples"),
    samples: z.array(z.strictObject({ tMs: Finite, hPa: Positive })).min(1),
  }),
]);

/** How the dead-time column is rendered (the MuNRa column semantics are unverified). */
export const DeadTimeColumnSchema = z.enum([
  "cumulativeUs",
  "cumulativeMs",
  "cumulativeS",
  "perEventUs",
]);
export type DeadTimeColumn = z.infer<typeof DeadTimeColumnSchema>;

export const MalformedKindSchema = z.enum([
  /** The line is cut in half (a partial record). */
  "truncated",
  /** The line and the next one arrive as one line (v5's `COSMIC`+digit case). */
  "concatenated",
  /** The line ends with the other terminator (LF instead of CRLF, or vice versa). */
  "otherTerminator",
  /** A byte that is not valid UTF-8 (0xFF) is inserted. */
  "invalidUtf8",
]);
export type MalformedKind = z.infer<typeof MalformedKindSchema>;

export const DeviceConfigSchema = z.strictObject({
  id: z.string().min(1).max(64),
  deviceType: z.enum(["cosmicwatch-v3x", "munra"]),
  rate: BaseRateConfigSchema,
  amplitude: z.strictObject({
    mpv: Positive,
    width: Positive,
    unit: z.literal("mV"),
    noiseSigma: NonNegative,
    saturation: z.strictObject({ value: Positive, unit: z.literal("mV") }),
  }),
  noiseTriggers: z.strictObject({ ratePerS: NonNegative, meanAmplitude: Positive }).optional(),
  deadTimeUs: NonNegative,
  clock: z
    .strictObject({
      offsetMs: NonNegative.optional(),
      driftPpm: Finite.optional(),
      jitterMs: NonNegative.optional(),
      rolloverBits: z.number().int().min(8).max(53).optional(),
    })
    .optional(),
  hostLatency: z.strictObject({ meanMs: NonNegative, jitterMs: NonNegative }).optional(),
  render: z
    .strictObject({
      deadTimeColumn: DeadTimeColumnSchema.optional(),
      terminator: z.enum(["LF", "CRLF"]).optional(),
      /** mV per ADC count for the ADC column (default 3300 mV / 4096). */
      adcMvPerCount: Positive.optional(),
      /** Split each line into fragments of this many bytes (serial ports deliver fragments). */
      fragmentBytes: z.number().int().positive().optional(),
    })
    .optional(),
  disruptions: z
    .strictObject({
      gaps: z
        .array(
          z.strictObject({
            startMs: Finite,
            endMs: Finite,
            /** `usb`: device keeps counting, lines are not delivered; `power`: device off, resets after. */
            kind: z.enum(["usb", "power"]),
          }),
        )
        .optional(),
      resets: z.array(Finite).optional(),
      malformed: z
        .array(z.strictObject({ lineIndex: z.number().int().nonnegative(), kind: MalformedKindSchema }))
        .optional(),
    })
    .optional(),
});
export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

export const ScenarioConfigSchema = z
  .strictObject({
    seed: z.number().int().nonnegative().max(4_294_967_295),
    startMs: Finite,
    durationMs: Positive,
    /** Step of the piecewise-constant rate (ms). */
    stepMs: Positive.optional(),
    pressure: PressureConfigSchema,
    /** Barometric coefficient (%/hPa, negative). */
    betaPercentPerHpa: Finite.optional(),
    /** Reference pressure P₀ (hPa); defaults to the pressure at the start. */
    p0Hpa: Positive.optional(),
    diurnal: z.strictObject({ amplitude: Finite, phaseHours: Finite }).optional(),
    forbush: z
      .array(z.strictObject({ onsetMs: Finite, depthPercent: NonNegative, recoveryHours: Positive }))
      .optional(),
    temperature: z
      .strictObject({
        meanC: Finite,
        diurnalAmplitudeC: NonNegative.optional(),
        phaseHours: Finite.optional(),
        noiseSigmaC: NonNegative.optional(),
        seed: z.number().int().nonnegative().optional(),
      })
      .optional(),
    devices: z.array(DeviceConfigSchema).min(1).max(16),
    coincidence: z
      .strictObject({
        /** Fraction of true events of device i that also cross device i+1 (acceptance × efficiency). */
        fractions: z.array(Finite.refine((v) => v >= 0 && v <= 1, "must be in [0, 1]")),
        /** Hardware coincidence half-window τ_c (µs): |Δt| ≤ τ_c counts. */
        halfWindowUs: NonNegative,
      })
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.coincidence && cfg.coincidence.fractions.length !== cfg.devices.length - 1) {
      ctx.addIssue({
        code: "custom",
        message: "coincidence.fractions needs one entry per adjacent device pair",
        path: ["coincidence", "fractions"],
      });
    }
  });
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;

export function parseScenario(input: unknown): ScenarioConfig {
  return ScenarioConfigSchema.parse(input);
}
