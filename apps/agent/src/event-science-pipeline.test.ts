import {
  DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
  StorageTierConfigSchema,
  type NoiseCalibration,
  type StorageTierConfig,
} from "@muonhub/shared";
import { describe, expect, it } from "vitest";
import { AgentEventSciencePipeline } from "./event-science-pipeline.js";
import type { RawReading } from "./parsers/index.js";

const BASE_TS = 1_717_200_000_000;

function storageTier(overrides: Partial<StorageTierConfig> = {}): StorageTierConfig {
  return StorageTierConfigSchema.parse({
    minuteSummaries: true,
    individualSignals: true,
    realtimeMode: "local-only",
    completeRaw: {
      enabled: false,
      autoStopMinutes: null,
    },
    eventSummaryIntervalMs: DEFAULT_EVENT_SUMMARY_INTERVAL_MS,
    ...overrides,
  });
}

function calibration(thresholdMv: number, calibratedAt = BASE_TS): NoiseCalibration {
  return {
    thresholdMv,
    method: "auto-sigma",
    calibratedAt,
  };
}

function reading(offsetMs: number, sipmMv: number, overrides: Partial<RawReading> = {}): RawReading {
  return {
    timestamp: BASE_TS + offsetMs,
    eventCount: 1,
    sipmMv,
    coincident: 0,
    sourceFormat: "json",
    tempC: 20,
    pressurePa: 73_000,
    deadtimePercent: 0.04,
    ...overrides,
  };
}

describe("AgentEventSciencePipeline", () => {
  it("calibrates the initial threshold, classifies pending events, and appends periodic history", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        eventSummaryIntervalMs: 10_000,
      }),
      initialCalibrationSampleSize: 16,
      recalibrationSampleSize: 16,
      recalibrationIntervalMs: 1_000,
      noiseThresholdOptions: {
        noiseFraction: 0.5,
        minNoiseSamples: 8,
        sigmaMultiplier: 4,
      },
    });

    const initialAmplitudes = [3, 4, 4.5, 5, 5.5, 6, 7, 8, 35, 38, 41, 43, 46, 50, 56, 70];
    let lastOutput = initialAmplitudes
      .map((amplitude, index) => pipeline.processReading(reading(index * 10, amplitude)))
      .at(-1);

    expect(lastOutput?.noiseCalibrations).toHaveLength(1);
    expect(lastOutput?.noiseCalibrations[0]?.thresholdMv).toBeGreaterThan(8);
    expect(lastOutput?.noiseCalibrations[0]?.thresholdMv).toBeLessThan(35);
    expect(lastOutput?.signalRecords).toHaveLength(8);
    expect(pipeline.getNoiseCalibrationHistory()).toHaveLength(1);

    const recalibrationAmplitudes = [3, 4, 4, 5, 5, 6, 6, 7, 36, 39, 42, 44, 47, 51, 58, 72];
    lastOutput = recalibrationAmplitudes
      .map((amplitude, index) => pipeline.processReading(reading(2_000 + index * 10, amplitude)))
      .at(-1);

    expect(lastOutput?.noiseCalibrations).toHaveLength(1);
    expect(pipeline.getNoiseCalibrationHistory()).toHaveLength(2);
  });

  it("emits EventSummary records on the configured cadence with raw and above-threshold counts", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        eventSummaryIntervalMs: 1_000,
      }),
      initialNoiseCalibration: calibration(10, BASE_TS),
      summaryBinCount: 8,
    });

    pipeline.processReading(reading(100, 5));
    pipeline.processReading(reading(200, 30, { coincident: 1 }));
    const output = pipeline.processReading(reading(1_200, 40));

    expect(output.eventSummaries).toHaveLength(1);
    expect(output.eventSummaries[0]).toMatchObject({
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: BASE_TS,
      intervalEndTs: BASE_TS + 1_000,
      signalCount: 2,
      aboveThresholdCount: 1,
      coincidenceCount: 1,
      noiseThresholdMv: 10,
    });
    expect(output.signalRecords).toHaveLength(1);
  });

  it("gates individual SignalRecords while still computing local summaries", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        individualSignals: false,
        eventSummaryIntervalMs: 1_000,
      }),
      initialNoiseCalibration: calibration(10, BASE_TS),
    });

    const output = pipeline.processReading(reading(100, 30));
    const flush = pipeline.flushOpenInterval();

    expect(output.signalRecords).toEqual([]);
    expect(flush.eventSummaries[0]?.aboveThresholdCount).toBe(1);
  });

  it("does not emit summaries for realtime-only tiers", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        minuteSummaries: false,
        individualSignals: false,
        realtimeMode: "local-only",
        eventSummaryIntervalMs: 1_000,
      }),
      initialNoiseCalibration: calibration(10, BASE_TS),
    });

    pipeline.processReading(reading(100, 30));
    const output = pipeline.processReading(reading(1_200, 40));

    expect(output.eventSummaries).toEqual([]);
    expect(pipeline.flushOpenInterval().eventSummaries).toEqual([]);
  });

  it("honors completeRaw.autoStopMinutes for local raw capture", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        completeRaw: {
          enabled: true,
          autoStopMinutes: 1,
        },
      }),
      initialNoiseCalibration: calibration(10, BASE_TS),
      completeRawStartedAtTs: BASE_TS,
    });

    expect(pipeline.processReading(reading(30_000, 30)).completeRawReadings).toHaveLength(1);
    const output = pipeline.processReading(reading(60_000, 30));

    expect(output.completeRawReadings).toEqual([]);
    expect(output.completeRawStopped).toBe(true);
  });

  it("anchors completeRaw.autoStopMinutes to the first raw reading by default", () => {
    const pipeline = new AgentEventSciencePipeline({
      detectorId: "det_1",
      sessionId: "sess_1",
      storageTier: storageTier({
        completeRaw: {
          enabled: true,
          autoStopMinutes: 1,
        },
      }),
      initialNoiseCalibration: calibration(10, BASE_TS),
    });

    expect(pipeline.processReading(reading(10_000, 30)).completeRawReadings).toHaveLength(1);
    expect(pipeline.processReading(reading(69_999, 30)).completeRawReadings).toHaveLength(1);

    const stoppedOutput = pipeline.processReading(reading(70_000, 30));

    expect(stoppedOutput.completeRawReadings).toEqual([]);
    expect(stoppedOutput.completeRawStopped).toBe(true);

    const afterStoppedOutput = pipeline.processReading(reading(90_000, 30));

    expect(afterStoppedOutput.completeRawReadings).toEqual([]);
    expect(afterStoppedOutput.completeRawStopped).toBe(false);
  });
});
