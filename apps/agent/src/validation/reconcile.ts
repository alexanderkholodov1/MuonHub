/**
 * Field-validation reconciliation (spec 0087, "Validation in practice"). It compares the minutes the
 * agent kept locally with the minutes read back from the cloud and, for the virtual detector, with
 * the planted ground truth. Pure: the caller reads the stores and passes plain arrays, so the same
 * checks serve the emulator rehearsal and the 72-hour run on the real detector.
 */

export const MINUTE_MS = 60_000;

export interface MinuteSample {
  readonly ts: number;
  readonly n: number;
  readonly sessionId: string;
}

/** A half-open interval [startMs, endMs). */
export interface TimeWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
}

export interface TruthComparison {
  /** Events delivered to the host, per minute start (virtual detector only). */
  readonly perMinute: ReadonlyMap<number, number>;
  /** Allowed |n − truth| in one minute: host latency moves events across minute edges. */
  readonly toleranceEvents: number;
  /** Minimum share of compared minutes that must be within that tolerance. */
  readonly minShare: number;
  /** Maximum relative difference between the summed counts and the summed truth. */
  readonly maxTotalRelError: number;
}

export interface ReconcileInput {
  /** Minutes the agent kept locally: the reference for what the cloud must hold. */
  readonly local: readonly MinuteSample[];
  /** Minutes read back from the cloud, every page. */
  readonly cloud: readonly MinuteSample[];
  /** Disruptions during which no minute may exist (unplugged, powered off, agent down). */
  readonly noDataWindows?: readonly TimeWindow[];
  /** Minute starts that must exist in the cloud (complete, away from every disruption). */
  readonly expectedMinutes?: readonly number[];
  readonly truth?: TruthComparison;
}

export interface Check {
  readonly id: string;
  readonly title: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ReconcileStats {
  readonly localMinutes: number;
  readonly cloudMinutes: number;
  readonly localEvents: number;
  readonly cloudEvents: number;
  readonly expectedMinutes: number | null;
  readonly truthEvents: number | null;
  readonly truthComparedMinutes: number | null;
  readonly truthShareWithinTolerance: number | null;
  readonly truthTotalRelError: number | null;
  readonly truthMaxAbsDiff: number | null;
}

export interface ReconcileReport {
  readonly pass: boolean;
  readonly checks: readonly Check[];
  readonly stats: ReconcileStats;
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + "Z";

function sample(list: readonly number[], max = 5): string {
  const shown = list.slice(0, max).map(iso).join(", ");
  return list.length > max ? `${shown} … (+${String(list.length - max)})` : shown;
}

/** True when the minute [ts, ts + 1 min) overlaps the window. */
export function minuteOverlaps(ts: number, w: TimeWindow): boolean {
  return ts < w.endMs && ts + MINUTE_MS > w.startMs;
}

function duplicates(list: readonly MinuteSample[]): number[] {
  const seen = new Set<number>();
  const dup: number[] = [];
  for (const m of list) {
    if (seen.has(m.ts)) dup.push(m.ts);
    seen.add(m.ts);
  }
  return dup;
}

export function reconcile(input: ReconcileInput): ReconcileReport {
  const checks: Check[] = [];
  const { local, cloud } = input;

  // 1. Only complete, aligned minutes with whole, non-negative counts.
  const misaligned = [...local, ...cloud]
    .filter((m) => m.ts % MINUTE_MS !== 0 || !Number.isInteger(m.n) || m.n < 0)
    .map((m) => m.ts);
  checks.push({
    id: "complete-minutes",
    title: "Aligned minutes with whole, non-negative counts",
    pass: misaligned.length === 0,
    detail:
      misaligned.length === 0
        ? "all aligned"
        : `${String(misaligned.length)} invalid: ${sample(misaligned)}`,
  });

  // 2. Each minute exactly once.
  const dupCloud = duplicates(cloud);
  const dupLocal = duplicates(local);
  checks.push({
    id: "no-duplicates",
    title: "Each minute exactly once (cloud and local)",
    pass: dupCloud.length === 0 && dupLocal.length === 0,
    detail: `cloud duplicates ${String(dupCloud.length)}, local duplicates ${String(dupLocal.length)}`,
  });

  // 3. The cloud holds exactly what the agent kept.
  const cloudByTs = new Map(cloud.map((m) => [m.ts, m]));
  const localTs = new Set(local.map((m) => m.ts));
  const missingInCloud: number[] = [];
  const mismatched: number[] = [];
  for (const m of local) {
    const c = cloudByTs.get(m.ts);
    if (c === undefined) missingInCloud.push(m.ts);
    else if (c.n !== m.n || c.sessionId !== m.sessionId) mismatched.push(m.ts);
  }
  const extraInCloud = cloud.filter((m) => !localTs.has(m.ts)).map((m) => m.ts);
  checks.push({
    id: "cloud-matches-local",
    title: "Cloud minutes equal the local minutes (same minutes, counts and sessions)",
    pass: missingInCloud.length === 0 && extraInCloud.length === 0 && mismatched.length === 0,
    detail:
      `missing in cloud ${String(missingInCloud.length)}, extra in cloud ${String(extraInCloud.length)}, ` +
      `different ${String(mismatched.length)}` +
      (missingInCloud.length > 0 ? `; missing: ${sample(missingInCloud)}` : "") +
      (extraInCloud.length > 0 ? `; extra: ${sample(extraInCloud)}` : "") +
      (mismatched.length > 0 ? `; different: ${sample(mismatched)}` : ""),
  });

  // 4. Nothing inside a disruption.
  if (input.noDataWindows !== undefined) {
    const inside: string[] = [];
    for (const w of input.noDataWindows) {
      const hits = [...local, ...cloud].filter((m) => minuteOverlaps(m.ts, w));
      if (hits.length > 0) inside.push(`${w.label}: ${String(hits.length)}`);
    }
    checks.push({
      id: "no-data-in-disruptions",
      title: "No minute inside a disruption window (gaps are gaps, never zeros)",
      pass: inside.length === 0,
      detail:
        inside.length === 0
          ? `${String(input.noDataWindows.length)} windows, none contains a minute`
          : inside.join("; "),
    });
  }

  // 5. Coverage: every minute that must exist does.
  if (input.expectedMinutes !== undefined) {
    const missing = input.expectedMinutes.filter((ts) => !cloudByTs.has(ts));
    checks.push({
      id: "coverage",
      title: "Every complete minute away from a disruption reached the cloud",
      pass: missing.length === 0,
      detail:
        `${String(input.expectedMinutes.length - missing.length)} of ${String(input.expectedMinutes.length)} present` +
        (missing.length > 0 ? `; missing: ${sample(missing)}` : ""),
    });
  }

  // 6. Counts against the planted truth.
  let truthEvents: number | null = null;
  let compared: number | null = null;
  let share: number | null = null;
  let relError: number | null = null;
  let maxAbs: number | null = null;
  if (input.truth !== undefined) {
    const t = input.truth;
    let within = 0;
    let sumN = 0;
    let sumTruth = 0;
    let worst = 0;
    for (const m of local) {
      const expected = t.perMinute.get(m.ts) ?? 0;
      const diff = Math.abs(m.n - expected);
      if (diff <= t.toleranceEvents) within += 1;
      worst = Math.max(worst, diff);
      sumN += m.n;
      sumTruth += expected;
    }
    compared = local.length;
    share = compared === 0 ? 0 : within / compared;
    relError = sumTruth === 0 ? (sumN === 0 ? 0 : 1) : Math.abs(sumN - sumTruth) / sumTruth;
    maxAbs = worst;
    truthEvents = sumTruth;
    checks.push({
      id: "truth",
      title: "Per-minute counts match the planted truth",
      pass: compared > 0 && share >= t.minShare && relError <= t.maxTotalRelError,
      detail:
        `${(share * 100).toFixed(2)} % of ${String(compared)} minutes within ±${String(t.toleranceEvents)} events ` +
        `(required ${(t.minShare * 100).toFixed(1)} %); total ${String(sumN)} vs truth ${String(sumTruth)}, ` +
        `relative difference ${(relError * 100).toFixed(4)} % (allowed ${(t.maxTotalRelError * 100).toFixed(2)} %); ` +
        `largest single-minute difference ${String(worst)}`,
    });
  }

  const sum = (list: readonly MinuteSample[]): number => list.reduce((a, m) => a + m.n, 0);
  return {
    pass: checks.every((c) => c.pass),
    checks,
    stats: {
      localMinutes: local.length,
      cloudMinutes: cloud.length,
      localEvents: sum(local),
      cloudEvents: sum(cloud),
      expectedMinutes: input.expectedMinutes?.length ?? null,
      truthEvents,
      truthComparedMinutes: compared,
      truthShareWithinTolerance: share,
      truthTotalRelError: relError,
      truthMaxAbsDiff: maxAbs,
    },
  };
}

/** The report as a Markdown table, for `docs/audit/`. */
export function reportMarkdown(report: ReconcileReport): string {
  const rows = report.checks.map(
    (c) => `| ${c.pass ? "✅" : "❌"} | ${c.title} | ${c.detail.replaceAll("|", "\\|")} |`,
  );
  return [
    `**Result: ${report.pass ? "PASS" : "FAIL"}** (${String(report.checks.filter((c) => c.pass).length)} of ${String(report.checks.length)} checks)`,
    "",
    "| | Check | Detail |",
    "|---|---|---|",
    ...rows,
  ].join("\n");
}
