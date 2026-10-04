import { buildEventSummary, calibrateNoiseThreshold, type NoiseThresholdCalibrationOptions } from "@muonhub/physics";
import {
  NoiseCalibrationSchema,
  SignalRecordSchema,
  StorageTierConfigSchema,
  type EventSummary,
  type NoiseCalibration,
  type SignalRecord,
  type StorageTierConfig,
} from "@muonhub/shared";
import type { RawReading } from "./parsers/index.js";

const DEFAULT_INITIAL_CALIBRATION_SAMPLE_SIZE = 64;
const DEFAULT_RECALIBRATION_SAMPLE_SIZE = 64;
const DEFAULT_RECALIBRATION_INTERVAL_MS = 3_600_000;

export interface EventSciencePipelineOptions {
  readonly detectorId: string;
  readonly sessionId: string;
  readonly storageTier: StorageTierConfig;
  readonly initialNoiseCalibration?: NoiseCalibration;
  readonly noiseCalibrationHistory?: readonly NoiseCalibration[];
  readonly initialCalibrationSampleSize?: number;
  readonly recalibrationSampleSize?: number;
  readonly recalibrationIntervalMs?: number;
  readonly noiseThresholdOptions?: NoiseThresholdCalibrationOptions;
  readonly summaryBinCount?: number;
  readonly completeRawStartedAtTs?: number;
}

export interface EventSciencePipelineOutput {
  readonly noiseCalibrations: ReadonlyArray<NoiseCalibration>;
  readonly signalRecords: ReadonlyArray<SignalRecord>;
  readonly eventSummaries: ReadonlyArray<EventSummary>;
  readonly completeRawReadings: ReadonlyArray<RawReading>;
  readonly completeRawStopped: boolean;
}

function emptyOutput(): EventSciencePipelineOutput {
  return {
    noiseCalibrations: [],
    signalRecords: [],
    eventSummaries: [],
    completeRawReadings: [],
    completeRawStopped: false,
  };
}

function mergeOutput(
  left: EventSciencePipelineOutput,
  right: EventSciencePipelineOutput,
): EventSciencePipelineOutput {
  return {
    noiseCalibrations: [...left.noiseCalibrations, ...right.noiseCalibrations],
    signalRecords: [...left.signalRecords, ...right.signalRecords],
    eventSummaries: [...left.eventSummaries, ...right.eventSummaries],
    completeRawReadings: [...left.completeRawReadings, ...right.completeRawReadings],
    completeRawStopped: left.completeRawStopped || right.completeRawStopped,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

function readingEventContribution(reading: RawReading): number {
  if (!Number.isFinite(reading.eventCount) || reading.eventCount < 0) {
    throw new RangeError(`eventCount must be finite and non-negative, got ${reading.eventCount}`);
  }

  return Math.trunc(reading.eventCount);
}

function cloneReading(reading: RawReading): RawReading {
  return { ...reading };
}

function shouldComputeSummaries(tier: StorageTierConfig): boolean {
  return tier.minuteSummaries || tier.individualSignals || tier.completeRaw.enabled;
}

function toSignalRecord(reading: RawReading): SignalRecord {
  const signalBase = {
    ts: reading.timestamp,
    sipmMv: reading.sipmMv,
    coincident: reading.coincident > 0,
    deadtimeUs: reading.deadtimePercent === undefined ? 0 : (reading.deadtimePercent / 100) * 1_000_000,
  };
  const signal: SignalRecord = { ...signalBase };

  if (reading.adc1 !== undefined) {
    signal.adc1 = Math.trunc(reading.adc1);
  }
  if (reading.adc2 !== undefined) {
    signal.adc2 = Math.trunc(reading.adc2);
  }
  if (reading.tempC !== undefined) {
    signal.tempC = reading.tempC;
  }
  if (reading.pressurePa !== undefined) {
    signal.pressureHpa = reading.pressurePa / 100;
  }

  return SignalRecordSchema.parse(signal);
}

export class AgentEventSciencePipeline {
  private readonly detectorId: string;
  private readonly sessionId: string;
  private readonly storageTier: StorageTierConfig;
  private readonly initialCalibrationSampleSize: number;
  private readonly recalibrationSampleSize: number;
  private readonly recalibrationIntervalMs: number;
  private readonly noiseThresholdOptions: NoiseThresholdCalibrationOptions;
  private readonly summaryBinCount: number | undefined;
  private readonly summaryEnabled: boolean;
  private readonly rawAutoStopMs: number | null;
  private completeRawStartedAtTs: number | null;

  private noiseCalibration: NoiseCalibration | null;
  private readonly noiseCalibrationHistory: NoiseCalibration[];
  private readonly pendingReadings: RawReading[] = [];
  private calibrationAmplitudes: number[] = [];
  private intervalStartTs: number | null = null;
  private intervalSignals: SignalRecord[] = [];
  private intervalSignalCount = 0;
  private intervalAboveThresholdCount = 0;
  private completeRawStopped = false;

  constructor(options: EventSciencePipelineOptions) {
    this.detectorId = options.detectorId;
    this.sessionId = options.sessionId;
    this.storageTier = StorageTierConfigSchema.parse(options.storageTier);
    this.initialCalibrationSampleSize =
      options.initialCalibrationSampleSize ?? DEFAULT_INITIAL_CALIBRATION_SAMPLE_SIZE;
    this.recalibrationSampleSize = options.recalibrationSampleSize ?? DEFAULT_RECALIBRATION_SAMPLE_SIZE;
    this.recalibrationIntervalMs = options.recalibrationIntervalMs ?? DEFAULT_RECALIBRATION_INTERVAL_MS;
    this.noiseThresholdOptions = options.noiseThresholdOptions ?? {};
    this.summaryBinCount = options.summaryBinCount;
    this.summaryEnabled = shouldComputeSummaries(this.storageTier);
    this.rawAutoStopMs =
      this.storageTier.completeRaw.enabled && this.storageTier.completeRaw.autoStopMinutes !== null
        ? this.storageTier.completeRaw.autoStopMinutes * 60_000
        : null;
    this.completeRawStartedAtTs = options.completeRawStartedAtTs ?? null;

    assertPositiveInteger(this.initialCalibrationSampleSize, "initialCalibrationSampleSize");
    assertPositiveInteger(this.recalibrationSampleSize, "recalibrationSampleSize");
    assertPositiveInteger(this.recalibrationIntervalMs, "recalibrationIntervalMs");
    if (this.summaryBinCount !== undefined) {
      assertPositiveInteger(this.summaryBinCount, "summaryBinCount");
    }

    this.noiseCalibration =
      options.initialNoiseCalibration === undefined ? null : NoiseCalibrationSchema.parse(options.initialNoiseCalibration);
    this.noiseCalibrationHistory = [...(options.noiseCalibrationHistory ?? [])].map((entry) =>
      NoiseCalibrationSchema.parse(entry),
    );
    if (this.noiseCalibration !== null && this.noiseCalibrationHistory.length === 0) {
      this.noiseCalibrationHistory.push(this.noiseCalibration);
    }
  }

  getActiveNoiseCalibration(): NoiseCalibration | null {
    return this.noiseCalibration;
  }

  getNoiseCalibrationHistory(): readonly NoiseCalibration[] {
    return [...this.noiseCalibrationHistory];
  }

  processReading(reading: RawReading): EventSciencePipelineOutput {
    let output = this.captureCompleteRaw(reading);
    this.calibrationAmplitudes.push(reading.sipmMv);

    if (this.noiseCalibration === null) {
      this.pendingReadings.push(cloneReading(reading));
      if (this.calibrationAmplitudes.length >= this.initialCalibrationSampleSize) {
        output = mergeOutput(output, this.appendCalibration(reading.timestamp));
        const pending = this.pendingReadings.splice(0);
        for (const pendingReading of pending) {
          output = mergeOutput(output, this.processClassifiedReading(pendingReading));
        }
      }

      return output;
    }

    output = mergeOutput(output, this.maybeRecalibrate(reading.timestamp));
    output = mergeOutput(output, this.processClassifiedReading(reading));
    return output;
  }

  flushOpenInterval(): EventSciencePipelineOutput {
    if (this.intervalStartTs === null || this.noiseCalibration === null || !this.summaryEnabled) {
      return emptyOutput();
    }

    const summary = this.buildCurrentSummary(this.intervalStartTs + this.storageTier.eventSummaryIntervalMs);
    this.resetInterval(this.intervalStartTs + this.storageTier.eventSummaryIntervalMs);
    return {
      ...emptyOutput(),
      eventSummaries: [summary],
    };
  }

  private captureCompleteRaw(reading: RawReading): EventSciencePipelineOutput {
    if (!this.storageTier.completeRaw.enabled || this.completeRawStopped) {
      return emptyOutput();
    }

    this.completeRawStartedAtTs ??= reading.timestamp;
    if (this.rawAutoStopMs !== null && reading.timestamp - this.completeRawStartedAtTs >= this.rawAutoStopMs) {
      this.completeRawStopped = true;
      this.completeRawStartedAtTs = null;
      return {
        ...emptyOutput(),
        completeRawStopped: true,
      };
    }

    return {
      ...emptyOutput(),
      completeRawReadings: [cloneReading(reading)],
    };
  }

  private appendCalibration(calibratedAt: number): EventSciencePipelineOutput {
    const calibration = calibrateNoiseThreshold(this.calibrationAmplitudes, this.noiseThresholdOptions);
    const noiseCalibration = NoiseCalibrationSchema.parse({
      thresholdMv: calibration.thresholdMv,
      method: calibration.method,
      calibratedAt,
    });

    this.noiseCalibration = noiseCalibration;
    this.noiseCalibrationHistory.push(noiseCalibration);
    this.calibrationAmplitudes = [];

    return {
      ...emptyOutput(),
      noiseCalibrations: [noiseCalibration],
    };
  }

  private maybeRecalibrate(timestamp: number): EventSciencePipelineOutput {
    if (this.noiseCalibration === null) {
      return emptyOutput();
    }

    if (timestamp - this.noiseCalibration.calibratedAt < this.recalibrationIntervalMs) {
      return emptyOutput();
    }

    if (this.calibrationAmplitudes.length < this.recalibrationSampleSize) {
      return emptyOutput();
    }

    return this.appendCalibration(timestamp);
  }

  private processClassifiedReading(reading: RawReading): EventSciencePipelineOutput {
    if (this.noiseCalibration === null) {
      throw new Error("cannot classify readings before noise calibration");
    }

    let output = this.advanceSummaryInterval(reading.timestamp);
    const eventContribution = readingEventContribution(reading);
    this.intervalSignalCount += eventContribution;

    if (reading.sipmMv >= this.noiseCalibration.thresholdMv) {
      this.intervalAboveThresholdCount += eventContribution;
      const signal = toSignalRecord(reading);
      this.intervalSignals.push(signal);
      if (this.storageTier.individualSignals) {
        output = mergeOutput(output, {
          ...emptyOutput(),
          signalRecords: [signal],
        });
      }
    }

    return output;
  }

  private advanceSummaryInterval(timestamp: number): EventSciencePipelineOutput {
    if (this.intervalStartTs === null) {
      this.resetInterval(Math.floor(timestamp / this.storageTier.eventSummaryIntervalMs) * this.storageTier.eventSummaryIntervalMs);
    }

    let output = emptyOutput();
    while (
      this.intervalStartTs !== null &&
      timestamp >= this.intervalStartTs + this.storageTier.eventSummaryIntervalMs
    ) {
      const intervalEndTs = this.intervalStartTs + this.storageTier.eventSummaryIntervalMs;
      if (this.summaryEnabled) {
        output = mergeOutput(output, {
          ...emptyOutput(),
          eventSummaries: [this.buildCurrentSummary(intervalEndTs)],
        });
      }
      this.resetInterval(intervalEndTs);
    }

    return output;
  }

  private buildCurrentSummary(intervalEndTs: number): EventSummary {
    if (this.intervalStartTs === null || this.noiseCalibration === null) {
      throw new Error("cannot build an event summary without an open calibrated interval");
    }

    const params = {
      detectorId: this.detectorId,
      sessionId: this.sessionId,
      intervalStartTs: this.intervalStartTs,
      intervalEndTs,
      noiseThresholdMv: this.noiseCalibration.thresholdMv,
      signalCount: this.intervalSignalCount,
      aboveThresholdCount: this.intervalAboveThresholdCount,
    };

    return buildEventSummary(
      this.intervalSignals,
      this.summaryBinCount === undefined
        ? params
        : {
            ...params,
            binCount: this.summaryBinCount,
          },
    );
  }

  private resetInterval(intervalStartTs: number): void {
    this.intervalStartTs = intervalStartTs;
    this.intervalSignals = [];
    this.intervalSignalCount = 0;
    this.intervalAboveThresholdCount = 0;
  }
}
