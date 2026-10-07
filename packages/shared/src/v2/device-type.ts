/**
 * Device types — declarative definitions of a kind of hardware (spec 0083 FR4; Bring Your Own
 * Detector foundation). A device type says how its serial output is read and what each field means.
 */
import { z } from "zod";
import {
  AmplitudeUnitSchema,
  EpochMsSchema,
  IdSchema,
  SchemaVersionSchema,
  UidSchema,
} from "./primitives.js";

export const DeviceTypeStatusSchema = z.enum([
  "builtin",
  "draft",
  "community",
  "review",
  "verified",
]);

/** Canonical quantities a device field can map to. */
export const CanonicalQuantitySchema = z.enum([
  "eventId",
  "deviceTime",
  "adc",
  "amplitude",
  "temperature",
  "pressure",
  "deadTime",
  "coincidenceFlag",
  "ignored",
]);

export const QuantityUnitSchema = z.enum([
  "count",
  "ms",
  "s",
  "us",
  "mV",
  "V",
  "adc",
  "degC",
  "Pa",
  "hPa",
  "percent",
  "flag",
  "none",
]);

export const FieldMappingSchema = z.strictObject({
  /** Column index (columns parser) or key (json / keyValue parser). */
  source: z.union([z.number().int().nonnegative(), z.string().min(1).max(64)]),
  quantity: CanonicalQuantitySchema,
  unit: QuantityUnitSchema,
  channel: z.number().int().nonnegative().optional(),
  /** True when the meaning or unit has not been verified against real hardware output. */
  unverified: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

export const DeviceTypeSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  id: IdSchema,
  version: z.number().int().positive(),
  name: z.string().min(1).max(120),
  status: DeviceTypeStatusSchema,
  authorUid: UidSchema.optional(),
  channels: z.number().int().positive().max(256),
  transport: z.strictObject({
    baud: z.number().int().positive(),
    lineTerminator: z.enum(["LF", "CRLF", "CR"]),
    encoding: z.enum(["ascii", "utf8"]),
  }),
  parser: z.strictObject({
    kind: z.enum(["columns", "json", "keyValue"]),
    /** Column separator for the `columns` parser. */
    separator: z.enum(["whitespace", "tab", "comma", "semicolon"]).optional(),
    /** Regular expression (source) identifying header/comment lines to skip. */
    headerPattern: z.string().max(200).optional(),
    /** Marker that ends a record and splits concatenated records (e.g. "COSMIC"). */
    recordMarker: z.string().max(32).optional(),
    fields: z.array(FieldMappingSchema).min(1).max(256),
  }),
  timeSource: z.strictObject({
    kind: z.enum(["host", "deviceMs", "deviceS"]),
    /** Counter width in bits for rollover (e.g. 32 for Arduino millis()). */
    rolloverBits: z.number().int().positive().max(64).optional(),
  }),
  counterSemantics: z.enum(["linePerEvent", "eventId", "cumulativeCount"]),
  deadTimeSemantics: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("cumulative"),
      unit: z.enum(["us", "ms", "s"]),
      unverified: z.boolean().optional(),
    }),
    z.strictObject({ kind: z.literal("perEvent"), unit: z.enum(["us", "ms", "s"]) }),
    z.strictObject({ kind: z.literal("percent") }),
    z.strictObject({ kind: z.literal("none") }),
  ]),
  defaults: z.strictObject({
    saturation: z
      .strictObject({ value: z.number().positive(), unit: AmplitudeUnitSchema })
      .optional(),
    /** Declared dead time per event, used only when no counter exists (spec 0085). */
    tauUs: z.number().positive().optional(),
    geometry: z
      .strictObject({
        activeAreaCm2: z.number().positive(),
        thicknessCm: z.number().positive(),
        material: z.string().min(1).max(80),
      })
      .optional(),
    /** Fixed amplitude histogram bin edges for day summaries (ascending, device units). */
    histogramEdges: z.array(z.number()).min(2).max(1025).optional(),
  }),
  createdAt: EpochMsSchema,
});

export type DeviceTypeStatus = z.infer<typeof DeviceTypeStatusSchema>;
export type CanonicalQuantity = z.infer<typeof CanonicalQuantitySchema>;
export type FieldMapping = z.infer<typeof FieldMappingSchema>;
export type DeviceType = z.infer<typeof DeviceTypeSchema>;
