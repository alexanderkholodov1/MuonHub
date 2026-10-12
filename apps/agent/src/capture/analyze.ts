/**
 * Capture analysis (spec 0087 FR17): pure functions over captured bytes — baud scoring, hex dump,
 * per-column statistics, and a PROPOSED device type (never applied automatically: the user decides).
 */
import { v2 } from "@muonhub/shared";
import { createParser } from "../parsing/parser.js";
import { LineFramer } from "../framing/framer.js";

export const BAUD_CANDIDATES = [9600, 19200, 38400, 57600, 115200] as const;

/** Fraction of bytes that look like text (printable ASCII, tab, CR, LF). Wrong baud gives noise. */
export function textScore(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let ok = 0;
  for (const b of bytes)
    if ((b >= 0x20 && b < 0x7f) || b === 0x09 || b === 0x0a || b === 0x0d) ok++;
  return ok / bytes.length;
}

/** Score for a baud candidate: text-likeness weighted by whether complete lines were seen. */
export function baudScore(bytes: Uint8Array): number {
  const lines = new LineFramer().push(bytes, 0, "0").length;
  return textScore(bytes) * Math.min(1, lines / 3);
}

export function hexDump(bytes: Uint8Array, maxBytes = 512): string {
  const rows: string[] = [];
  const n = Math.min(bytes.length, maxBytes);
  for (let i = 0; i < n; i += 16) {
    const slice = bytes.subarray(i, Math.min(i + 16, n));
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(slice, (b) =>
      b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".",
    ).join("");
    rows.push(`${i.toString(16).padStart(6, "0")}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > n) rows.push(`... ${String(bytes.length - n)} more bytes`);
  return rows.join("\n");
}

export interface ColumnStat {
  index: number;
  numeric: boolean;
  min?: number;
  max?: number;
  mean?: number;
  /** Never decreases (a cumulative counter or a clock). */
  monotonic: boolean;
  constant: boolean;
  distinct: number;
}

export interface CaptureAnalysis {
  bytes: number;
  lines: string[];
  columnCount: number | null;
  columns: ColumnStat[];
  proposal: { deviceTypeId: string; parsedFraction: number } | null;
  /** All built-in types with the fraction of data lines they parse (evidence for the proposal). */
  candidates: { deviceTypeId: string; parsedFraction: number; expectedColumns: number }[];
}

export function analyzeCapture(
  bytes: Uint8Array,
  types: readonly v2.DeviceType[] = v2.BUILTIN_DEVICE_TYPES,
): CaptureAnalysis {
  const lines = new LineFramer({ recordMarker: "COSMIC" })
    .push(bytes, 0, "0")
    .map((l) => l.text.trim())
    .filter((t) => t.length > 0 && !t.startsWith("#"));
  const rows = lines.map((l) => l.split(/[\t ,;]+/).filter((t) => t.length > 0));
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let columnCount: number | null = null;
  let best = 0;
  for (const [k, v] of counts) {
    if (v > best) {
      best = v;
      columnCount = k;
    }
  }
  const data = rows.filter((r) => r.length === columnCount);
  const columns: ColumnStat[] = [];
  for (let i = 0; i < (columnCount ?? 0); i++) {
    const values = data.map((r) => Number(r[i]));
    const numeric = values.length > 0 && values.every((v) => Number.isFinite(v));
    const stat: ColumnStat = {
      index: i,
      numeric,
      monotonic: numeric && values.every((v, j) => j === 0 || v >= (values[j - 1] ?? v)),
      constant: new Set(data.map((r) => r[i])).size <= 1,
      distinct: new Set(data.map((r) => r[i])).size,
    };
    if (numeric) {
      stat.min = Math.min(...values);
      stat.max = Math.max(...values);
      stat.mean = values.reduce((a, b) => a + b, 0) / values.length;
    }
    columns.push(stat);
  }
  const candidates = types.map((t) => {
    const parser = createParser(t);
    const dataLines = lines.filter((l) => parser.parse(l).kind !== "header");
    const ok = dataLines.filter((l) => parser.parse(l).kind === "event").length;
    const expectedColumns =
      Math.max(...t.parser.fields.map((f) => (typeof f.source === "number" ? f.source + 1 : 0))) +
      (t.parser.recordMarker === undefined ? 0 : 1);
    return {
      deviceTypeId: t.id,
      parsedFraction: dataLines.length === 0 ? 0 : ok / dataLines.length,
      expectedColumns,
    };
  });
  // A type that parses the lines AND expects exactly the observed number of columns wins ties.
  const off = (c: { expectedColumns: number }): number =>
    columnCount === null ? 0 : Math.abs(c.expectedColumns - columnCount);
  candidates.sort((a, b) => b.parsedFraction - a.parsedFraction || off(a) - off(b));
  const top = candidates[0];
  return {
    bytes: bytes.length,
    lines,
    columnCount,
    columns,
    proposal:
      top !== undefined && top.parsedFraction >= 0.8
        ? { deviceTypeId: top.deviceTypeId, parsedFraction: top.parsedFraction }
        : null,
    candidates,
  };
}

export function formatAnalysis(a: CaptureAnalysis): string {
  const out: string[] = [];
  out.push(
    `bytes: ${String(a.bytes)}, lines: ${String(a.lines.length)}, columns (most common): ${String(a.columnCount ?? "n/a")}`,
  );
  for (const c of a.columns) {
    out.push(
      c.numeric
        ? `  col ${String(c.index)}: numeric min=${String(c.min)} max=${String(c.max)} mean=${(c.mean ?? 0).toFixed(3)}${c.monotonic ? " monotonic" : ""}${c.constant ? " constant" : ""}`
        : `  col ${String(c.index)}: text (${String(c.distinct)} distinct)`,
    );
  }
  out.push("device type candidates (fraction of data lines parsed):");
  for (const c of a.candidates)
    out.push(
      `  ${c.deviceTypeId}: ${(c.parsedFraction * 100).toFixed(1)}% (expects ${String(c.expectedColumns)} columns)`,
    );
  out.push(
    a.proposal === null
      ? "proposal: none of the built-in types fits; define a device type (Bring Your Own Detector)"
      : `proposal: ${a.proposal.deviceTypeId} (a suggestion only - confirm against the device documentation; units marked unverified stay unverified)`,
  );
  return out.join("\n");
}
