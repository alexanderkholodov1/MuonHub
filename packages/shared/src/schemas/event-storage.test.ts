import { describe, expect, it } from "vitest";
import { DetectorSchema } from "./detector.js";
import {
  DEFAULT_DETECTOR_QUOTA_BYTES,
  DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
  RECOMMENDED_STORAGE_TIER,
  StorageQuotaSchema,
  StorageTierConfigSchema,
  estimateMonthlyBytes,
  isRecommendedTier,
} from "./storage.js";
import { SignalRecordSchema } from "./signal.js";
import { EventSummarySchema } from "./event-summary.js";
import { SessionSchema } from "./session.js";

const validStorageTier = {
  minuteSummaries: true,
  individualSignals: true,
  realtimeMode: "local-only",
  completeRaw: {
    enabled: false,
    autoStopMinutes: null,
  },
  eventSummaryIntervalMs: DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
} as const;

const validSignal = {
  ts: 1_717_200_000_000,
  sipmMv: 42.5,
  adc1: 120,
  adc2: 121,
  coincident: false,
  deadtimeUs: 400,
  tempC: 20.5,
  pressureHpa: 1013.2,
};

const validEventSummary = {
  detectorId: "det_1",
  sessionId: "sess_1",
  intervalStartTs: 1_717_200_000_000,
  intervalEndTs: 1_717_203_600_000,
  signalCount: 120,
  aboveThresholdCount: 118,
  tailCount: 8,
  coincidenceCount: 2,
  noiseThresholdMv: 12.5,
  mpvMv: 84.2,
  histogram: {
    binWidthMv: 5,
    minMv: 0,
    counts: [0, 3, 14, 9],
  },
};

describe("StorageTierConfigSchema", () => {
  it("accepts a valid storage tier and applies defaults", () => {
    const parsed = StorageTierConfigSchema.parse({
      individualSignals: false,
      realtimeMode: "cloud-volatile",
      completeRaw: {
        enabled: false,
        autoStopMinutes: null,
      },
    });

    expect(parsed.minuteSummaries).toBe(true);
    expect(parsed.eventSummaryIntervalMs).toBe(DEFAULT_EVENT_SUMMARY_INTERVAL_MS);
  });

  it("round-trips the recommended tier and marks it as recommended", () => {
    expect(StorageTierConfigSchema.parse(RECOMMENDED_STORAGE_TIER)).toEqual(validStorageTier);
    expect(isRecommendedTier(RECOMMENDED_STORAGE_TIER)).toBe(true);
  });

  it("rejects the all-off storage and realtime combination", () => {
    expect(
      StorageTierConfigSchema.safeParse({
        minuteSummaries: false,
        individualSignals: false,
        realtimeMode: "none",
        completeRaw: {
          enabled: false,
          autoStopMinutes: null,
        },
        eventSummaryIntervalMs: DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid realtime mode", () => {
    expect(StorageTierConfigSchema.safeParse({ ...validStorageTier, realtimeMode: "global" }).success).toBe(
      false,
    );
  });
});

describe("StorageQuotaSchema", () => {
  it("accepts positive detector and account byte quotas", () => {
    expect(
      StorageQuotaSchema.parse({
        detectorMaxBytes: DEFAULT_DETECTOR_QUOTA_BYTES,
        accountMaxBytes: DEFAULT_DETECTOR_QUOTA_BYTES * 10,
      }),
    ).toEqual({
      detectorMaxBytes: 104_857_600,
      accountMaxBytes: 1_048_576_000,
    });
  });

  it("rejects non-positive quotas", () => {
    expect(StorageQuotaSchema.safeParse({ detectorMaxBytes: 0, accountMaxBytes: 1 }).success).toBe(false);
    expect(StorageQuotaSchema.safeParse({ detectorMaxBytes: 1, accountMaxBytes: -1 }).success).toBe(false);
  });
});

describe("SignalRecordSchema", () => {
  it("accepts a complete above-noise signal record", () => {
    expect(SignalRecordSchema.parse(validSignal)).toEqual(validSignal);
  });

  it("accepts optional ADC, temperature, and pressure fields as absent", () => {
    const { adc1, adc2, tempC, pressureHpa, ...minimalSignal } = validSignal;
    void adc1;
    void adc2;
    void tempC;
    void pressureHpa;

    expect(SignalRecordSchema.parse(minimalSignal)).toEqual(minimalSignal);
  });

  it("rejects negative ADC and pressure values", () => {
    expect(SignalRecordSchema.safeParse({ ...validSignal, adc1: -1 }).success).toBe(false);
    expect(SignalRecordSchema.safeParse({ ...validSignal, pressureHpa: -1 }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(SignalRecordSchema.safeParse({ ...validSignal, rawLine: "ignored" }).success).toBe(false);
  });
});

describe("EventSummarySchema", () => {
  it("accepts a valid interval event summary", () => {
    expect(EventSummarySchema.parse(validEventSummary)).toEqual(validEventSummary);
  });

  it("accepts summaries without an MPV estimate", () => {
    const { mpvMv, ...withoutMpv } = validEventSummary;
    void mpvMv;

    expect(EventSummarySchema.parse(withoutMpv)).toEqual(withoutMpv);
  });

  it("rejects intervalEndTs at or before intervalStartTs", () => {
    expect(
      EventSummarySchema.safeParse({
        ...validEventSummary,
        intervalEndTs: validEventSummary.intervalStartTs,
      }).success,
    ).toBe(false);
  });

  it("rejects negative summary and histogram counts", () => {
    expect(EventSummarySchema.safeParse({ ...validEventSummary, tailCount: -1 }).success).toBe(false);
    expect(
      EventSummarySchema.safeParse({
        ...validEventSummary,
        histogram: {
          ...validEventSummary.histogram,
          counts: [1, -1],
        },
      }).success,
    ).toBe(false);
  });
});

describe("noise calibration fields", () => {
  it("accepts active noise calibration and ordered history in detector calibration", () => {
    const parsed = DetectorSchema.parse({
      id: "det_1",
      stationId: "st_1",
      deviceToken: "tok_abc",
      hardwareModel: "CosmicWatch v3X",
      firmwareVersion: "MuonHub Agent 0.1",
      hwVersion: "v3X",
      calibration: {
        triggerAdcMin: 120,
        noiseCalibration: {
          thresholdMv: 15,
          method: "auto-sigma",
          calibratedAt: 1_717_200_000_000,
        },
        noiseCalibrationHistory: [
          {
            thresholdMv: 14,
            method: "manual",
            calibratedAt: 1_717_100_000_000,
          },
          {
            thresholdMv: 15,
            method: "auto-sigma",
            calibratedAt: 1_717_200_000_000,
          },
        ],
      },
    });

    expect(parsed.calibration?.noiseCalibration?.thresholdMv).toBe(15);
  });

  it("rejects negative noise thresholds", () => {
    expect(
      DetectorSchema.safeParse({
        id: "det_1",
        stationId: "st_1",
        deviceToken: "tok_abc",
        hardwareModel: "CosmicWatch v3X",
        firmwareVersion: "MuonHub Agent 0.1",
        hwVersion: "v3X",
        calibration: {
          noiseCalibration: {
            thresholdMv: -1,
            method: "auto-sigma",
            calibratedAt: 1_717_200_000_000,
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("Session provenance fields", () => {
  it("accepts optional storage tier and provenance metadata", () => {
    const parsed = SessionSchema.parse({
      id: "sess_1",
      detectorId: "det_1",
      startedAt: 1_717_200_000_000,
      storageTier: RECOMMENDED_STORAGE_TIER,
      agentVersion: "0.1.0",
      clockOffsetMs: -125.5,
      calibrationRef: "cal_2026_06_15",
    });

    expect(parsed.storageTier).toEqual(RECOMMENDED_STORAGE_TIER);
    expect(parsed.endedAt).toBeNull();
  });
});

describe("backward compatibility", () => {
  it("validates an existing detector without noise calibration fields", () => {
    expect(
      DetectorSchema.safeParse({
        id: "det_legacy",
        stationId: "st_1",
        deviceToken: "tok_legacy",
        hardwareModel: "CosmicWatch v2",
        firmwareVersion: "MuNRa-1.0",
        hwVersion: "v2",
        calibration: {
          adcToMv: [4.8876, 0],
          saturationMv: 5000,
          triggerAdcMin: 50,
        },
      }).success,
    ).toBe(true);
  });

  it("validates an existing session without storage provenance fields", () => {
    expect(
      SessionSchema.safeParse({
        id: "sess_legacy",
        detectorId: "det_legacy",
        startedAt: 1_717_200_000_000,
        endedAt: null,
        sourceFileHash: "sha256:abc",
      }).success,
    ).toBe(true);
  });
});

describe("estimateMonthlyBytes", () => {
  it("returns hand-computed monthly bytes for the recommended tier", () => {
    const expectedMinuteBytes = 160 * 1_440 * 30;
    const expectedSignalBytes = 2 * 1_440 * 30 * 64;

    expect(estimateMonthlyBytes(RECOMMENDED_STORAGE_TIER, 2)).toBe(
      expectedMinuteBytes + expectedSignalBytes,
    );
  });

  it("adds bounded complete-raw bytes when enabled", () => {
    const tier = StorageTierConfigSchema.parse({
      minuteSummaries: true,
      individualSignals: false,
      realtimeMode: "none",
      completeRaw: {
        enabled: true,
        autoStopMinutes: 60,
      },
      eventSummaryIntervalMs: DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
    });
    const expectedMinuteBytes = 160 * 1_440 * 30;
    const expectedRawBytes = 5 * 60 * 128;

    expect(estimateMonthlyBytes(tier, 5)).toBe(expectedMinuteBytes + expectedRawBytes);
  });

  it("rejects negative signal rates", () => {
    expect(() => estimateMonthlyBytes(RECOMMENDED_STORAGE_TIER, -1)).toThrow(
      "signalsPerMinute must be a non-negative finite number",
    );
  });
});
