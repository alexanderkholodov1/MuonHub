/**
 * Devices, assemblies, calibrations (spec 0083 FR5, FR6, FR9).
 */
import { z } from "zod";
import {
  AmplitudeUnitSchema,
  EpochMsSchema,
  IdSchema,
  SchemaVersionSchema,
  UidSchema,
} from "./primitives.js";

export const GeometrySchema = z.strictObject({
  activeAreaCm2: z.number().positive(),
  thicknessCm: z.number().positive(),
  material: z.string().min(1).max(80),
  orientation: z.enum(["horizontal", "vertical", "tilted"]),
  tiltDeg: z.number().min(0).max(90).optional(),
});

export const DeviceSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: IdSchema,
  ownerUid: UidSchema,
  /** The station the device is installed in; security rules authorize by it. */
  stationId: IdSchema,
  deviceType: z.strictObject({ id: IdSchema, version: z.number().int().positive() }),
  label: z.string().min(1).max(120),
  serial: z.string().max(120).optional(),
  geometry: GeometrySchema,
  saturation: z
    .strictObject({ value: z.number().positive(), unit: AmplitudeUnitSchema })
    .optional(),
  status: z.enum(["active", "inactive", "retired"]),
  createdAt: EpochMsSchema,
});

export const AssemblySchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  stationId: IdSchema,
  members: z
    .array(
      z.strictObject({
        deviceId: IdSchema,
        position: z.strictObject({ x: z.number(), y: z.number(), z: z.number() }),
        tiltDeg: z.number().min(0).max(90),
      }),
    )
    .max(64),
  updatedAt: EpochMsSchema,
});

export const ParameterOriginSchema = z.enum(["default", "suggested", "manual", "imported"]);

export const CalibrationParameterSchema = z.strictObject({
  value: z.number(),
  unit: z.string().min(1).max(16),
  origin: ParameterOriginSchema,
  uncertainty: z.number().nonnegative().optional(),
  locked: z.boolean(),
});

/** `devices/{deviceId}/calibrations/{version}` — append-only. */
export const CalibrationSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  deviceId: IdSchema,
  version: z.number().int().positive(),
  validFrom: EpochMsSchema,
  parameters: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/), CalibrationParameterSchema),
  authorUid: UidSchema,
  note: z.string().max(1000).optional(),
  createdAt: EpochMsSchema,
});

export type Geometry = z.infer<typeof GeometrySchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type Assembly = z.infer<typeof AssemblySchema>;
export type ParameterOrigin = z.infer<typeof ParameterOriginSchema>;
export type CalibrationParameter = z.infer<typeof CalibrationParameterSchema>;
export type Calibration = z.infer<typeof CalibrationSchema>;
