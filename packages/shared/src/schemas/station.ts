// first-attempt contract, removed in M1 step 7.
/**
 * Station — the registered profile/site (D21). What appears on the map; has an owner and a
 * visibility. The physical device is the Detector, not the Station.
 */
import { z } from "zod/v3";
import {
  IdSchema,
  LatitudeSchema,
  LongitudeSchema,
  CountryCodeSchema,
  TimezoneSchema,
} from "./primitives.js";
import { VisibilitySchema, StationPlacementSchema, StationTypeSchema } from "./enums.js";

/** Per-station sharing grant. */
export const StationShareSchema = z
  .object({
    uid: IdSchema,
    permission: z.enum(["viewer", "editor"]),
  })
  .strict();
export type StationShare = z.infer<typeof StationShareSchema>;

export const StationSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    ownerUid: IdSchema,
    /** null = independent station (no institution). */
    institutionId: IdSchema.nullable().default(null),
    /** D22: required, NO default — the user must choose explicitly. */
    visibility: VisibilitySchema,
    /** Optional embargo: private until this date, then public. */
    embargoUntil: z.number().int().nonnegative().nullable().default(null),
    mlTrainingOptOut: z.boolean().optional(),

    // Location — entered manually (not geolocated).
    latitude: LatitudeSchema,
    longitude: LongitudeSchema,
    altitudeM: z.number(),
    city: z.string().min(1),
    country: CountryCodeSchema,

    placement: StationPlacementSchema,
    type: StationTypeSchema,
    timezone: TimezoneSchema,

    // Optional metadata — the more, the better (D23).
    floor: z.string().optional(),
    shielding: z.string().optional(),
    orientation: z.string().optional(),
    notes: z.string().optional(),

    shares: z.array(StationShareSchema).default([]),
    createdAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type Station = z.infer<typeof StationSchema>;
