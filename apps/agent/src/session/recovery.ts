/**
 * Crash recovery (spec 0087 FR7c). A session left open in SQLite is closed on startup:
 * `powerLoss` when its last raw line is older than the machine's boot time, `unknown` otherwise.
 * The minutes that were only in memory (the one in progress, and any held for the clock) are counted
 * in `discardedPartialMinutes`; their raw lines remain in layer 0. The hour summary is REBUILT from
 * the minutes stored locally, so a restart inside an hour can never overwrite it with partial data.
 */
import type { v2 } from "@muonhub/shared";
import { enqueueHourSummary, hourStartOf } from "../aggregation/summary.js";
import { MINUTE_MS } from "../aggregation/aggregator.js";
import type { LineParser } from "../parsing/parser.js";
import type { Reporter } from "../reporter.js";
import type { LocalStore, SessionRow } from "../store/types.js";
import { cloudCounters } from "./pipeline.js";

export interface RecoveryResult {
  closed: { id: string; reason: v2.EndReason; discardedMinutes: number }[];
}

export function recoverOpenSessions(options: {
  store: LocalStore;
  reporter: Reporter;
  parser: LineParser;
  deviceType: v2.DeviceType;
  bootTimeMs: number;
  now: () => number;
}): RecoveryResult {
  const { store, reporter, parser, deviceType } = options;
  const closed: RecoveryResult["closed"] = [];
  for (const session of store.openSessions()) {
    const own = store
      .minutesInRange(session.streamId, session.startedAt - MINUTE_MS, Number.MAX_SAFE_INTEGER)
      .filter((m) => m.sessionId === session.id);
    const lastMinuteEnd = own.reduce(
      (acc, m) => Math.max(acc, m.ts + MINUTE_MS),
      session.startedAt,
    );
    // Minutes that existed only in memory: distinct minutes holding an event line after the last
    // stored minute of this session.
    const lost = new Set<number>();
    const from = Math.floor(lastMinuteEnd / MINUTE_MS) * MINUTE_MS;
    for (const row of store.rawLinesBetween(from, Number.MAX_SAFE_INTEGER)) {
      if (row.sessionId !== session.id) continue;
      if (parser.parse(row.text).kind === "event") lost.add(Math.floor(row.hostTs / MINUTE_MS));
    }
    const reason: v2.EndReason =
      session.lastRawTs !== null && session.lastRawTs < options.bootTimeMs
        ? "powerLoss"
        : "unknown";
    const ended: SessionRow = {
      ...session,
      endedAt: Math.max(session.lastRawTs ?? session.startedAt, session.startedAt),
      endReason: reason,
      counters: {
        ...session.counters,
        discardedPartialMinutes: session.counters.discardedPartialMinutes + lost.size,
        completeMinutes: Math.max(session.counters.completeMinutes, own.length),
      },
    };
    store.transaction(() => {
      store.upsertSession(ended);
      store.enqueue({
        streamId: session.streamId,
        kind: "session-end",
        ts: session.startedAt,
        sessionId: session.id,
        payload: JSON.stringify({
          endedAt: ended.endedAt,
          endReason: reason,
          counters: cloudCounters(ended.counters),
        }),
      });
    });
    const last = own[own.length - 1];
    if (last !== undefined) {
      enqueueHourSummary(store, session.streamId, deviceType, hourStartOf(last.ts), ended);
    }
    reporter.report(
      "warn",
      "session-recovered",
      `closed a session left open by a crash (${reason})`,
      {
        sessionId: session.id,
        discardedMinutes: lost.size,
      },
    );
    closed.push({ id: session.id, reason, discardedMinutes: lost.size });
  }
  return { closed };
}
