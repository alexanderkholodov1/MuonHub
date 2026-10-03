/**
 * Time-series records — the scientific core (per detector).
 *
 * INVARIANTS (non-negotiable, D9 / data integrity):
 *  - Minute fields are **averages over the minute, never sums**.
 *  - No event filtering upstream of these records.
 *  - Raw fields use the canonical short keys (continuity with v5 storage).
 *  - Derived fields (`ecDt`, `ecCorr`, `flux`) are computed later by `@muonhub/physics`,
 *    so they are OPTIONAL here and never required on ingest.
 *
 * See `planning/02-DATA-MODEL.md` and `docs/research/THEORETICAL-FOUNDATION.md` §4, §8.
 */
import { z } from "zod";
import { EpochMsSchema } from "./primitives.js";

/** Non-negative finite number (rates, amplitudes, pressure). */
const NonNegative = z.number().nonnegative();

export const MinuteRecordSchema = z
  .object({
    /** Start of the minute (epoch ms, UTC). */
    ts: EpochMsSchema,
    /** Event rate — charged particles per minute (NOT "muons"; see scientific note). */
    ec: NonNegative,
    /** Coincidences per minute (meaningful only for coincidence stations). */
    cc: NonNegative,
    /** SiPM amplitude average / max / min (mV). */
    sm: NonNegative,
    sx: NonNegative,
    sn: NonNegative,
    /** Temperature average (°C) — may be negative. */
    tp: z.number(),
    /** Atmospheric pressure average (hPa). */
    pr: NonNegative,
    /** Dead-time average (percent). */
    dt: z.number().min(0).max(100),

    // ── Derived (optional; produced by @muonhub/physics) ───────────────────────
    /** Dead-time corrected rate: R / (1 − R·τ_DT). */
    ecDt: NonNegative.optional(),
    /** Barometric corrected rate (over ecDt), using a station-local β. */
    ecCorr: NonNegative.optional(),
    /** Flux (1/cm²/min) when an effective area is configured. */
    flux: NonNegative.optional(),
  })
  .strict()
  .refine((r) => r.sn <= r.sm && r.sm <= r.sx, {
    message: "SiPM amplitudes must satisfy sn ≤ sm ≤ sx",
    path: ["sm"],
  });

export type MinuteRecord = z.infer<typeof MinuteRecordSchema>;

/** RealtimeRecord — a single event in the short-lived realtime window (8 min, expires). */
export const RealtimeRecordSchema = z
  .object({
    ts: EpochMsSchema,
    sipmMv: NonNegative,
    temp: z.number().optional(),
    deadtime: NonNegative.optional(),
  })
  .strict();

export type RealtimeRecord = z.infer<typeof RealtimeRecordSchema>;
