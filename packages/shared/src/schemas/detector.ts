/**
 * Detector — the physical CosmicWatch device inside a station (D21). Data belongs to the detector
 * because calibration is per-device.
 */
import { z } from "zod";
import { IdSchema, EpochMsSchema } from "./primitives.js";
import { HardwareVersionSchema, DetectorStatusSchema } from "./enums.js";

const NonNegative = z.number().nonnegative();

export const NoiseCalibrationMethodSchema = z.enum(["auto-sigma", "manual"]);
export type NoiseCalibrationMethod = z.infer<typeof NoiseCalibrationMethodSchema>;

export const NoiseCalibrationSchema = z
  .object({
    thresholdMv: NonNegative,
    method: NoiseCalibrationMethodSchema,
    calibratedAt: EpochMsSchema,
  })
  .strict();
export type NoiseCalibration = z.infer<typeof NoiseCalibrationSchema>;

export const NoiseCalibrationHistorySchema = z
  .array(NoiseCalibrationSchema)
  .refine(
    (history) =>
      history.every(
        (entry, index) => index === 0 || entry.calibratedAt >= history[index - 1]!.calibratedAt,
      ),
    {
      message: "noise calibration history must be ordered by calibratedAt",
    },
  );
export type NoiseCalibrationHistory = z.infer<typeof NoiseCalibrationHistorySchema>;

/**
 * Calibration — sensible defaults by hardware, with optional advanced overrides (D23).
 * `adcToMv` is the linear ADC→millivolt mapping `[slope, intercept]`.
 */
export const CalibrationSchema = z
  .object({
    adcToMv: z.tuple([z.number(), z.number()]).optional(),
    saturationMv: z.number().positive().optional(),
    triggerAdcMin: z.number().int().nonnegative().optional(),
    noiseCalibration: NoiseCalibrationSchema.optional(),
    noiseCalibrationHistory: NoiseCalibrationHistorySchema.optional(),
  })
  .strict();
export type Calibration = z.infer<typeof CalibrationSchema>;

export const DetectorSchema = z
  .object({
    id: IdSchema,
    stationId: IdSchema,
    label: z.string().optional(),
    /** Auto-generated device identity; enables the "different device" consistency warning. */
    deviceToken: IdSchema,
    hardwareModel: z.string().min(1),
    firmwareVersion: z.string().min(1),
    hwVersion: HardwareVersionSchema,
    sipmCount: z.number().int().positive().default(1),
    calibration: CalibrationSchema.optional(),
    status: DetectorStatusSchema.default("active"),
    addedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type Detector = z.infer<typeof DetectorSchema>;
