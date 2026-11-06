#!/usr/bin/env node
/**
 * v5 mirror (M2 demo): every minute, copies the new minutes of one public v5 profile into a v6
 * stream on the Firebase emulators. Read-only on v5; write-once on v6 (re-sent minutes are reported
 * as existing, never overwritten), so restarts are harmless.
 */
import { MUONHUB_VERSION } from "@muonhub/shared";
import { emulatorProvider, env, loadState } from "./env.js";
import { mapMinute, sessionStartMs, v6SessionId } from "./map.js";
import { listSessionKeys, readMinutes } from "./v5.js";

const log = (line: string): void => {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
};

async function main(): Promise<void> {
  const state = loadState();
  const provider = emulatorProvider("v5-mirror");
  await provider.signInWithEmail(state.mirrorEmail, state.mirrorPassword);
  log(`mirroring v5 profile "${env.v5Profile}" into stream ${state.streamId} (read-only on v5)`);
  const ensured = new Set<string>();
  let cursorSec = Math.floor((Date.now() - env.backfillHours * 3_600_000) / 60_000) * 60;
  let lastMinuteTs: number | null = null;

  for (;;) {
    const started = Date.now();
    try {
      const keys = await listSessionKeys();
      // Sessions that can hold minutes at or after the cursor: the last one, and any that began
      // before the next session's start passed the cursor.
      const relevant = keys.filter((k, i) => {
        const next = keys[i + 1];
        const nextStart = next === undefined ? null : sessionStartMs(next);
        return sessionStartMs(k) !== null && (nextStart === null || nextStart > cursorSec * 1000);
      });
      let written = 0;
      let existing = 0;
      let refused = 0;
      for (const key of relevant) {
        const sessionId = v6SessionId(key);
        const startMs = sessionStartMs(key) ?? started;
        if (!ensured.has(sessionId)) {
          if ((await provider.getSession(state.streamId, sessionId)) === null) {
            await provider.startSession({
              schemaVersion: 2,
              id: sessionId,
              streamId: state.streamId,
              startedAt: startMs,
              agentVersion: `v5-mirror ${MUONHUB_VERSION}`,
              deviceTypeVersion: 1,
              timeProvenance: { source: "none", offsetMs: 0, measuredAt: started },
              counters: {
                completeMinutes: 0,
                discardedPartialMinutes: 0,
                quarantinedLines: 0,
                eventIdGaps: 0,
              },
            });
          }
          ensured.add(sessionId);
        }
        for (;;) {
          const rows = await readMinutes(key, cursorSec);
          const records = [];
          for (const [k, raw] of rows) {
            const r = mapMinute(k, raw, sessionId);
            if (r.ok) records.push(r.record);
            else refused += 1;
          }
          for (let i = 0; i < records.length; i += 120) {
            const res = await provider.writeMinutes(state.streamId, records.slice(i, i + 120));
            written += res.written;
            existing += res.alreadyExisted.length;
          }
          const lastKey = rows.at(-1)?.[0];
          if (lastKey !== undefined) {
            cursorSec = Math.max(cursorSec, Number(lastKey) + 60);
            lastMinuteTs = Math.max(lastMinuteTs ?? 0, Number(lastKey) * 1000);
          }
          if (rows.length < 2000) break;
        }
      }
      if (lastMinuteTs !== null) {
        const fresh = Date.now() - lastMinuteTs < 5 * 60_000;
        await provider.setStatus(
          state.streamId,
          { lastSeenAt: Date.now(), agentOnline: fresh, lastMinuteTs },
          { publish: true },
        );
      }
      log(
        `cycle: ${String(written)} written, ${String(existing)} already there, ${String(refused)} refused`,
      );
    } catch (error) {
      log(`cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const wait = env.intervalS * 1000 - (Date.now() - started);
    await new Promise((r) => setTimeout(r, Math.max(5_000, wait)));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
