// first-attempt contract, removed in M1 step 7.
import { z } from "zod/v3";

const MONTH_DAYS = 30;
const MINUTES_PER_DAY = 1_440;
const MINUTES_PER_MONTH = MONTH_DAYS * MINUTES_PER_DAY;
const MINUTE_SUMMARY_ESTIMATED_BYTES = 160;
const SIGNAL_RECORD_ESTIMATED_BYTES = 64;
const COMPLETE_RAW_LINE_ESTIMATED_BYTES = 128;

export const DEFAULT_EVENT_SUMMARY_INTERVAL_MS = 3_600_000;
export const DEFAULT_DETECTOR_QUOTA_BYTES = 100 * 1024 * 1024;

export const RealtimeModeSchema = z.enum(["none", "local-only", "cloud-volatile"]);
export type RealtimeMode = z.infer<typeof RealtimeModeSchema>;

export const CompleteRawStorageSchema = z
  .object({
    enabled: z.boolean(),
    autoStopMinutes: z.number().int().positive().nullable(),
  })
  .strict();
export type CompleteRawStorage = z.infer<typeof CompleteRawStorageSchema>;

export const StorageTierConfigSchema = z
  .object({
    minuteSummaries: z.boolean().default(true),
    individualSignals: z.boolean(),
    realtimeMode: RealtimeModeSchema,
    completeRaw: CompleteRawStorageSchema,
    eventSummaryIntervalMs: z.number().int().positive().default(DEFAULT_EVENT_SUMMARY_INTERVAL_MS),
  })
  .strict()
  .refine(
    (tier) =>
      tier.minuteSummaries ||
      tier.individualSignals ||
      tier.realtimeMode !== "none" ||
      tier.completeRaw.enabled,
    {
      message: "at least one storage or realtime retention axis must be enabled",
      path: ["minuteSummaries"],
    },
  );
export type StorageTierConfig = z.infer<typeof StorageTierConfigSchema>;

export const RECOMMENDED_STORAGE_TIER = StorageTierConfigSchema.parse({
  minuteSummaries: true,
  individualSignals: true,
  realtimeMode: "local-only",
  completeRaw: {
    enabled: false,
    autoStopMinutes: null,
  },
  eventSummaryIntervalMs: DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
});

export const StorageQuotaSchema = z
  .object({
    detectorMaxBytes: z.number().int().positive(),
    accountMaxBytes: z.number().int().positive(),
  })
  .strict();
export type StorageQuota = z.infer<typeof StorageQuotaSchema>;

export function isRecommendedTier(config: z.input<typeof StorageTierConfigSchema>): boolean {
  const parsed = StorageTierConfigSchema.safeParse(config);

  if (!parsed.success) {
    return false;
  }

  const tier = parsed.data;
  return (
    tier.minuteSummaries === RECOMMENDED_STORAGE_TIER.minuteSummaries &&
    tier.individualSignals === RECOMMENDED_STORAGE_TIER.individualSignals &&
    tier.realtimeMode === RECOMMENDED_STORAGE_TIER.realtimeMode &&
    tier.completeRaw.enabled === RECOMMENDED_STORAGE_TIER.completeRaw.enabled &&
    tier.completeRaw.autoStopMinutes === RECOMMENDED_STORAGE_TIER.completeRaw.autoStopMinutes &&
    tier.eventSummaryIntervalMs === RECOMMENDED_STORAGE_TIER.eventSummaryIntervalMs
  );
}

export function estimateMonthlyBytes(
  config: z.input<typeof StorageTierConfigSchema>,
  signalsPerMinute: number,
): number {
  if (!Number.isFinite(signalsPerMinute) || signalsPerMinute < 0) {
    throw new Error("signalsPerMinute must be a non-negative finite number");
  }

  const tier = StorageTierConfigSchema.parse(config);
  let bytes = 0;

  if (tier.minuteSummaries) {
    bytes += MINUTE_SUMMARY_ESTIMATED_BYTES * MINUTES_PER_MONTH;
  }

  if (tier.individualSignals) {
    bytes += Math.ceil(signalsPerMinute * MINUTES_PER_MONTH * SIGNAL_RECORD_ESTIMATED_BYTES);
  }

  if (tier.completeRaw.enabled) {
    const rawMinutes = Math.min(
      tier.completeRaw.autoStopMinutes ?? MINUTES_PER_MONTH,
      MINUTES_PER_MONTH,
    );
    bytes += Math.ceil(signalsPerMinute * rawMinutes * COMPLETE_RAW_LINE_ESTIMATED_BYTES);
  }

  return bytes;
}
