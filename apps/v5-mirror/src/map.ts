/**
 * v5 → v6 minute mapping (docs/architecture/DATA-MODEL.md §7). A v5 minute is a canonical record
 * already; it is copied, never recomputed: `ec` → `n`, SiPM mean/min/max → `amplitude` (mV),
 * `tp` → `temperatureC`, `pr` (Pa) → `pressureHpa`. v5's dead-time average cannot become a live-time
 * counter, so every mirrored minute is labelled `liveSource: "nominal"` (uncorrected).
 */
import { z } from "zod";
import { v2 } from "@muonhub/shared";

const finite = z.number().finite();

export const V5MinuteSchema = z.looseObject({
  ec: z.number().int().nonnegative(),
  sm: finite.optional(),
  sn: finite.optional(),
  sx: finite.optional(),
  tp: finite.optional(),
  pr: finite.optional(),
});

export type MapResult =
  | { readonly ok: true; readonly record: v2.MinuteRecord }
  | { readonly ok: false; readonly reason: string };

/** `key` is the v5 minute key: epoch seconds of the minute start. */
export function mapMinute(key: string, raw: unknown, sessionId: string): MapResult {
  if (!/^\d{9,11}$/.test(key)) return { ok: false, reason: "key is not epoch seconds" };
  const ts = Number(key) * 1000;
  if (ts % 60_000 !== 0) return { ok: false, reason: "not a minute start" };
  const parsed = V5MinuteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "unreadable v5 minute" };
  const m = parsed.data;
  const amplitude =
    m.ec > 0 && m.sm !== undefined && m.sn !== undefined && m.sx !== undefined
      ? { mean: m.sm, min: m.sn, max: m.sx, unit: "mV" as const }
      : undefined;
  const candidate = {
    schemaVersion: 2 as const,
    ts,
    sessionId,
    n: m.ec,
    ...(amplitude === undefined ? {} : { amplitude }),
    liveSource: "nominal" as const,
    ...(m.tp === undefined || m.tp < -60 || m.tp > 100 ? {} : { temperatureC: m.tp }),
    ...(m.pr === undefined || m.pr <= 0 || m.pr > 110_000 ? {} : { pressureHpa: m.pr / 100 }),
    quality: { eventIdGaps: 0, clockAnomalies: 0 },
  };
  const result = v2.MinuteRecordSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, reason: result.error.issues[0]?.message ?? "invalid v6 minute" };
  }
  return { ok: true, record: result.data };
}

/** v5 session keys are `session_<epoch ms>`; v6 ids may not contain the underscore-free form. */
export function sessionStartMs(v5SessionKey: string): number | null {
  const match = /^session_(\d{13})$/.exec(v5SessionKey);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export function v6SessionId(v5SessionKey: string): string {
  return `v5-${v5SessionKey.replace(/[^A-Za-z0-9-]/g, "-")}`;
}
