/**
 * Closed vocabularies shared across the MuonHub domain.
 *
 * Each is a Zod enum so it validates at runtime and yields a literal union type at compile time.
 * See `planning/02-DATA-MODEL.md` and `docs/research/THEORETICAL-FOUNDATION.md`.
 */
import { z } from "zod";

/** Station visibility (D22: an explicit choice with NO default at creation). */
export const VisibilitySchema = z.enum(["public", "institution", "private"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** Where the detector sits — affects shielding and the expected rate. */
export const StationPlacementSchema = z.enum([
  "ground",
  "indoor",
  "basement",
  "underground",
  "outdoor",
  "rooftop",
]);
export type StationPlacement = z.infer<typeof StationPlacementSchema>;

/** A single-detector station vs. a coincidence telescope (≥2 detectors). */
export const StationTypeSchema = z.enum(["single", "coincidence"]);
export type StationType = z.infer<typeof StationTypeSchema>;

/** Account role (read from the database, never hardcoded). */
export const RoleSchema = z.enum(["admin", "user", "guest"]);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Detector hardware generation — determines the dead-time constant τ_DT used by `@muonhub/physics`
 * (v2 ≈ 50 ms, v3X ≈ 400 µs). `unknown` allows ingest before the version is confirmed.
 */
export const HardwareVersionSchema = z.enum(["v2", "v3X", "unknown"]);
export type HardwareVersion = z.infer<typeof HardwareVersionSchema>;

/** Detector operational state. */
export const DetectorStatusSchema = z.enum(["active", "inactive"]);
export type DetectorStatus = z.infer<typeof DetectorStatusSchema>;

/** UI / data locales (D17). English is the source locale. */
export const LanguageSchema = z.enum(["en", "es", "pt-BR"]);
export type Language = z.infer<typeof LanguageSchema>;
