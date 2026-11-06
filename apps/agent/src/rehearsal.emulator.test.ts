/**
 * M1 dress rehearsal (spec 0087, "Validation in practice"): the whole agent, the Firebase Emulator
 * Suite with the v2 security rules, and the virtual detector for a simulated 72 hours with every
 * kind of disruption the field run will see — USB unplugs, a power cut, device resets, damaged
 * lines, network cuts, and agent restarts — then the reconciliation of local, cloud and planted
 * truth (`validation/reconcile.ts`).
 *
 * It runs only when MUONHUB_REHEARSAL=1 (`pnpm rehearsal`), never in CI: it takes about
 * hours × 60 / speed minutes of wall time. Synthetic timestamps are kept (the run sits in the past,
 * so the rules' "not in the future" bounds hold); pacing only spreads the run over wall time so
 * the uploader, its retries and the network cuts behave as they do in the field.
 *
 * Known gaps (independent review, 2026-11-06), to close before it is used as M1 step-11 evidence:
 * - boundary minutes (start, end, resets) are excused from coverage but not explicitly rejected;
 * - a network cut can pass without any upload having been blocked during it;
 * - restarts reuse the signed-in provider, so credential restoration after a reboot is not exercised;
 * - call counts at accelerated speed are instrumentation, not an estimate of field traffic.
 *
 * Environment: MUONHUB_REHEARSAL_HOURS (72), MUONHUB_REHEARSAL_SPEED (120 = one simulated hour per
 * 30 s), MUONHUB_REHEARSAL_SEED, MUONHUB_REHEARSAL_DIR (local database and report).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import { v2 } from "@muonhub/shared";
import {
  createVirtualDetector,
  groundTruthOf,
  preset,
  simulate,
  type ScenarioConfig,
  type SourceLine,
} from "@muonhub/simulator";
import type { AgentChunk, AgentLineSource, SourceFactory } from "./sources/types.js";
import { openLocalStore } from "./store/sqlite.js";
import type { LocalStore } from "./store/types.js";
import { makeHarness, type Harness } from "./testing/harness.js";
import {
  MINUTE_MS,
  minuteOverlaps,
  reconcile,
  reportMarkdown,
  type Check,
  type MinuteSample,
  type TimeWindow,
} from "./validation/reconcile.js";

const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"];
const databaseHost = process.env["FIREBASE_DATABASE_EMULATOR_HOST"];
const enabled =
  process.env["MUONHUB_REHEARSAL"] === "1" && Boolean(authHost && firestoreHost && databaseHost);
const describeRehearsal = enabled ? describe : describe.skip;

const HOUR = 3_600_000;
const HOURS = Number(process.env["MUONHUB_REHEARSAL_HOURS"] ?? "72");
const SPEED = Number(process.env["MUONHUB_REHEARSAL_SPEED"] ?? "120");
const SEED = Number(process.env["MUONHUB_REHEARSAL_SEED"] ?? "20261106");
const DIR = process.env["MUONHUB_REHEARSAL_DIR"] ?? join(homedir(), ".cache", "muonhub-rehearsal");

const PROJECT = "demo-muonhub";
const DB_NS = `${PROJECT}-default-rtdb`;
const hostPort = (value: string | undefined): { host: string; port: number } => {
  const [host, port] = (value ?? "127.0.0.1:0").split(":");
  return { host: host ?? "127.0.0.1", port: Number(port) };
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function seedRtdb(path: string, value: unknown): Promise<void> {
  const res = await fetch(`http://${databaseHost ?? ""}/${path}.json?ns=${DB_NS}`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`seed failed: ${String(res.status)}`);
}

let seq = 0;
function connect(): dp.DataProviderV2 {
  seq += 1;
  return dp.createFirebaseProviderV2({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    databaseURL: `https://${DB_NS}.firebaseio.com`,
    appName: `rehearsal-${String(seq)}-${String(Date.now())}`,
    emulators: {
      auth: `http://${authHost ?? ""}`,
      firestore: hostPort(firestoreHost),
      database: hostPort(databaseHost),
    },
  });
}

async function actor(label: string): Promise<{ provider: dp.DataProviderV2; uid: string }> {
  const provider = connect();
  const email = `${label}-${String(Date.now())}-${String(seq)}@example.org`;
  const user = await provider.createAccount(email, "CorrectHorse123!");
  await provider.createUserProfile({
    schemaVersion: 2,
    uid: user.uid,
    displayName: label,
    username: `${label}${Date.now().toString(36)}`.slice(0, 30),
    email,
    createdAt: Date.now(),
  });
  return { provider, uid: user.uid };
}

/** The disruption plan, in synthetic hours from the start (only those inside the run are used). */
const PLAN = {
  // The "disruptions" preset already has: USB unplug +1 h (10 min), reset +3 h, power cut +4 h (5 min),
  // and four damaged lines. Added for the 72-hour run:
  usb: [{ atH: 20, minutes: 15 }],
  power: [{ atH: 50, minutes: 5 }],
  resets: [36],
  /** Firebase unreachable (the field run's firewall rule); data must arrive afterwards. */
  networkCuts: [
    { atH: 12, minutes: 60 },
    { atH: 45, minutes: 60 },
  ],
  /** The agent stopped (as `systemctl restart`) and the port unread meanwhile. */
  agentRestarts: [
    { atH: 30, minutes: 20 },
    { atH: 60, minutes: 5 },
  ],
};

function buildScenario(startMs: number): ScenarioConfig {
  const base = preset("disruptions", { startMs, durationMs: HOURS * HOUR, seed: SEED });
  const d0 = base.devices[0];
  if (d0 === undefined) throw new Error("preset without a device");
  const inRun = (h: number): boolean => h > 0 && h < HOURS;
  const gaps = [
    ...(d0.disruptions?.gaps ?? []),
    ...PLAN.usb
      .filter((g) => inRun(g.atH))
      .map((g) => ({
        startMs: startMs + g.atH * HOUR,
        endMs: startMs + g.atH * HOUR + g.minutes * MINUTE_MS,
        kind: "usb" as const,
      })),
    ...PLAN.power
      .filter((g) => inRun(g.atH))
      .map((g) => ({
        startMs: startMs + g.atH * HOUR,
        endMs: startMs + g.atH * HOUR + g.minutes * MINUTE_MS,
        kind: "power" as const,
      })),
  ];
  const resets = [
    ...(d0.disruptions?.resets ?? []),
    ...PLAN.resets.filter(inRun).map((h) => startMs + h * HOUR),
  ];
  return { ...base, devices: [{ ...d0, disruptions: { ...d0.disruptions, gaps, resets } }] };
}

/**
 * Feeds the virtual detector to successive agent instances. Timestamps stay synthetic; pacing
 * spends wall time in proportion. Lines read while no agent runs are dropped, as an unread port.
 */
class RehearsalRelay implements SourceFactory {
  readonly description = "virtual detector (rehearsal relay)";
  readonly baud = null;
  readonly reconnect = false;
  /** The current agent's source ends at this synthetic time (the next restart). */
  stopAt = Number.POSITIVE_INFINITY;
  delivered = 0;
  dropped = 0;
  private readonly iterator: AsyncIterator<SourceLine>;
  private pending: SourceLine | null = null;
  private ended = false;
  private readonly wallStart = Date.now();

  constructor(
    detector: AsyncIterable<SourceLine>,
    private readonly simStart: number,
    private readonly onTime: (syntheticMs: number) => void,
  ) {
    this.iterator = detector[Symbol.asyncIterator]();
  }

  get exhausted(): boolean {
    return this.ended && this.pending === null;
  }

  private async next(): Promise<SourceLine | null> {
    if (this.pending !== null) {
      const p = this.pending;
      this.pending = null;
      return p;
    }
    if (this.ended) return null;
    const r = await this.iterator.next();
    if (r.done === true) {
      this.ended = true;
      return null;
    }
    const due = this.wallStart + (r.value.hostReceivedAtMs - this.simStart) / SPEED;
    const wait = due - Date.now();
    if (wait > 20) await sleep(wait);
    this.onTime(r.value.hostReceivedAtMs);
    return r.value;
  }

  /** Nobody reads the port: discard lines up to `t`. */
  async skipUntil(t: number): Promise<void> {
    for (;;) {
      const line = await this.next();
      if (line === null) return;
      if (line.hostReceivedAtMs >= t) {
        this.pending = line;
        return;
      }
      this.dropped += 1;
    }
  }

  open(): Promise<AgentLineSource> {
    let closed = false;
    const lines = async function* (relay: RehearsalRelay): AsyncGenerator<AgentChunk> {
      while (!closed) {
        const line = await relay.next();
        if (line === null) return;
        if (closed || line.hostReceivedAtMs >= relay.stopAt) {
          relay.pending = line;
          return;
        }
        relay.delivered += 1;
        yield line;
      }
    };
    return Promise.resolve({
      synthetic: true,
      [Symbol.asyncIterator]: () => lines(this),
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });
  }
}

/** Methods that reach Firebase; during a network cut they fail as an unreachable server. */
const NETWORK_METHODS = new Set([
  "writeMinutes",
  "setStatus",
  "putDaySummary",
  "getDaySummary",
  "pushLiveEvents",
  "pruneLive",
  "startSession",
  "endSession",
  "updateSessionCounters",
  "getSession",
  "readMinutes",
  "getStation",
  "getStream",
  "getStatus",
  "listSessions",
]);

interface CallStat {
  calls: number;
  failedByCut: number;
  approxBytes: number;
}

function withNetworkCut(
  provider: dp.DataProviderV2,
  state: { down: boolean },
  stats: Map<string, CallStat>,
): dp.DataProviderV2 {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string" || !NETWORK_METHODS.has(prop)) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      const fn = value as (...a: unknown[]) => Promise<unknown>;
      return (...args: unknown[]): Promise<unknown> => {
        const s = stats.get(prop) ?? { calls: 0, failedByCut: 0, approxBytes: 0 };
        stats.set(prop, s);
        s.calls += 1;
        if (state.down) {
          s.failedByCut += 1;
          return Promise.reject(new dp.DataProviderError("unavailable"));
        }
        try {
          s.approxBytes += JSON.stringify(args).length;
        } catch {
          // non-serializable arguments are not counted
        }
        return fn.apply(target, args);
      };
    },
  });
}

describeRehearsal("M1 dress rehearsal: agent + emulators + virtual detector", () => {
  const harnesses: Harness[] = [];
  afterAll(async () => {
    for (const h of harnesses) await h.agent.stop().catch(() => undefined);
  });

  it(
    `runs ${String(HOURS)} simulated hours with disruptions and reconciles local, cloud and truth`,
    async () => {
      const wallBegin = Date.now();
      rmSync(DIR, { recursive: true, force: true });
      mkdirSync(DIR, { recursive: true });

      // The run sits in the past so that every minute is before "now" for the rules.
      const startMs = Math.floor((Date.now() - (HOURS + 2) * HOUR) / HOUR) * HOUR;
      const scenario = buildScenario(startMs);
      const endMs = startMs + HOURS * HOUR;
      const at = (h: number, minutes = 0): number => startMs + h * HOUR + minutes * MINUTE_MS;

      // Station, device and stream owned by a person; the agent signs in as a machine account
      // the owner added as an editor (spec 0087 FR11).
      const owner = await actor("owner");
      const machine = await actor("machine");
      const stationId = dp.newStationId();
      const streamId = dp.newStreamId();
      const now = Date.now();
      await owner.provider.createStation(
        v2.StationSchema.parse({
          schemaVersion: 2,
          id: stationId,
          ownerUid: owner.uid,
          name: "Rehearsal station",
          location: { lat: -0.19, lon: -78.43, altitudeM: 2400, city: "Quito", countryCode: "EC" },
          publicPrecision: "city",
          visibility: "private",
          timezone: "America/Guayaquil",
          createdAt: now,
          updatedAt: now,
        }),
      );
      await owner.provider.createDevice(
        v2.DeviceSchema.parse({
          schemaVersion: 2,
          id: "device-rehearsal-1",
          ownerUid: owner.uid,
          stationId,
          deviceType: { id: "munra", version: 1 },
          label: "Virtual MuNRa",
          geometry: {
            activeAreaCm2: 25,
            thicknessCm: 1,
            material: "EJ-200",
            orientation: "horizontal",
          },
          status: "active",
          createdAt: now,
        }),
      );
      await owner.provider.createStream(
        v2.StreamSchema.parse({
          schemaVersion: 2,
          id: streamId,
          ownerUid: owner.uid,
          stationId,
          deviceId: "device-rehearsal-1",
          status: "active",
          createdAt: now,
        }),
      );
      await owner.provider.addMember(stationId, machine.uid, "editor");
      // The rules refuse minutes older than the stream; the admin REST API moves `since` back.
      await seedRtdb(`streamStation/${streamId}`, { stationId, since: startMs - HOUR });

      // Disruption windows (synthetic time).
      const gapsOf = (kind: string): TimeWindow[] =>
        (scenario.devices[0]?.disruptions?.gaps ?? [])
          .filter((g) => g.kind === kind)
          .map((g) => ({
            startMs: g.startMs,
            endMs: g.endMs,
            label: `${kind} ${new Date(g.startMs).toISOString()}`,
          }));
      const usbWindows = gapsOf("usb");
      const powerWindows = gapsOf("power");
      const resets = scenario.devices[0]?.disruptions?.resets ?? [];
      const cutWindows: TimeWindow[] = PLAN.networkCuts
        .filter((c) => c.atH < HOURS)
        .map((c) => ({
          startMs: at(c.atH),
          endMs: at(c.atH, c.minutes),
          label: `network cut +${String(c.atH)} h`,
        }));
      const downWindows: TimeWindow[] = PLAN.agentRestarts
        .filter((r) => r.atH < HOURS)
        .map((r) => ({
          startMs: at(r.atH),
          endMs: at(r.atH, r.minutes),
          label: `agent down +${String(r.atH)} h`,
        }));

      const net = { down: false };
      const callStats = new Map<string, CallStat>();
      const timeline: string[] = [];
      let lastCutState = false;
      const onTime = (t: number): void => {
        const down = cutWindows.some((w) => t >= w.startMs && t < w.endMs);
        if (down !== lastCutState) {
          timeline.push(
            `${new Date().toISOString()} network ${down ? "cut" : "restored"} at synthetic ${new Date(t).toISOString()}`,
          );
          lastCutState = down;
        }
        net.down = down;
      };
      const detector = createVirtualDetector({ scenario });
      const relay = new RehearsalRelay(detector, startMs, onTime);

      const storePath = join(DIR, "agent.db");
      let store: LocalStore = await openLocalStore({ path: storePath });
      const startAgent = async (): Promise<Harness> => {
        const h = await makeHarness({
          factory: relay,
          store,
          synthetic: true,
          externalProvider: machine.provider,
          wrapProvider: (p) => withNetworkCut(p, net, callStats),
          streamId,
        });
        harnesses.push(h);
        await h.agent.start();
        return h;
      };

      // Run: one agent per stretch between restarts.
      let h = await startAgent();
      timeline.push(`${new Date().toISOString()} agent 1 started`);
      for (const [i, w] of downWindows.entries()) {
        relay.stopAt = w.startMs;
        await h.agent.finished;
        await h.agent.stop();
        store.close();
        timeline.push(
          `${new Date().toISOString()} agent ${String(i + 1)} stopped at synthetic ${new Date(w.startMs).toISOString()}`,
        );
        await relay.skipUntil(w.endMs);
        store = await openLocalStore({ path: storePath });
        relay.stopAt = Number.POSITIVE_INFINITY;
        h = await startAgent();
        timeline.push(
          `${new Date().toISOString()} agent ${String(i + 2)} started (same local database)`,
        );
      }
      await h.agent.finished;
      // Let the outbox empty: the last network cut may have left a backlog.
      net.down = false;
      const pendingTotal = (): number =>
        Object.values(h.store.outboxCounts().pending).reduce((a, n) => a + n, 0);
      for (let i = 0; i < 60 && pendingTotal() > 0; i += 1) {
        await h.agent.drain();
        await sleep(1000);
      }
      await h.agent.drain();
      await h.agent.stop();
      timeline.push(`${new Date().toISOString()} source exhausted, outbox drained, agent stopped`);

      // Read back: local, cloud, truth.
      const localRows = store.minutesInRange(streamId, 0, Number.MAX_SAFE_INTEGER);
      const local: MinuteSample[] = localRows.map((r) => ({
        ts: r.ts,
        n: r.record.n,
        sessionId: r.sessionId,
      }));
      const cloud: MinuteSample[] = [];
      let cursor: string | null = null;
      do {
        const page: dp.Page<v2.MinuteRecord> = await owner.provider.readMinutes(streamId, {
          fromTs: 0,
          toTs: Number.MAX_SAFE_INTEGER - 1,
          limit: 5000,
          cursor,
        });
        cloud.push(...page.items.map((m) => ({ ts: m.ts, n: m.n, sessionId: m.sessionId })));
        cursor = page.nextCursor;
      } while (cursor !== null);

      const device = simulate(scenario).devices[0];
      if (device === undefined) throw new Error("no simulated device");
      const truth = groundTruthOf(device);
      const perMinute = new Map<number, number>();
      for (const e of truth.events) {
        if (e.lost || e.off || e.undelivered) continue;
        const k = Math.floor(e.trueMs / MINUTE_MS) * MINUTE_MS;
        perMinute.set(k, (perMinute.get(k) ?? 0) + 1);
      }
      // Minutes that must exist: complete in truth and at least one minute away from every
      // disruption, the start and the end (boundary minutes are discarded by design, B-M1-36).
      const margins: TimeWindow[] = [
        ...usbWindows,
        ...powerWindows,
        ...downWindows,
        ...resets.map((t) => ({ startMs: t, endMs: t, label: "reset" })),
        { startMs: startMs, endMs: startMs, label: "start" },
        { startMs: endMs, endMs: endMs, label: "end" },
      ].map((w) => ({ ...w, startMs: w.startMs - MINUTE_MS, endMs: w.endMs + MINUTE_MS }));
      const expectedMinutes = truth.intervals
        .filter((i) => i.complete && !margins.some((w) => minuteOverlaps(i.minuteStartMs, w)))
        .map((i) => i.minuteStartMs);

      const report = reconcile({
        local,
        cloud,
        noDataWindows: [...usbWindows, ...powerWindows, ...downWindows],
        expectedMinutes,
        truth: { perMinute, toleranceEvents: 4, minShare: 0.98, maxTotalRelError: 0.001 },
      });

      // Checks the reconciliation does not cover: sessions and rejected writes.
      const localSessions = store.listSessions(streamId, 1000);
      const cloudSessions = await owner.provider.listSessions(streamId);
      const outbox = store.outboxCounts();
      const extra: Check[] = [
        {
          id: "sessions",
          title: "Every local session reached the cloud",
          pass: cloudSessions.items.length === localSessions.length,
          detail: `local ${String(localSessions.length)}, cloud ${String(cloudSessions.items.length)}; end reasons: ${localSessions.map((s) => s.endReason ?? "open").join(", ")}`,
        },
        {
          id: "nothing-rejected",
          title: "No write rejected or left behind (outbox empty, nothing parked)",
          pass: outbox.parked === 0 && Object.values(outbox.pending).every((n) => n === 0),
          detail: `parked ${String(outbox.parked)}, pending ${JSON.stringify(outbox.pending)}`,
        },
      ];
      const checks = [...report.checks, ...extra];
      const pass = checks.every((c) => c.pass);
      const wallMinutes = (Date.now() - wallBegin) / 60_000;
      const days = HOURS / 24;
      const perDay = [...callStats.entries()]
        .map(
          ([name, s]) =>
            `| \`${name}\` | ${String(s.calls)} | ${String(s.failedByCut)} | ${(s.calls / days).toFixed(0)} | ${(s.approxBytes / days / 1024).toFixed(0)} |`,
        )
        .join("\n");

      const md = [
        `# M1 dress rehearsal — ${new Date().toISOString().slice(0, 10)}`,
        "",
        `Simulated ${String(HOURS)} h (synthetic ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}), speed ${String(SPEED)}×, seed ${String(SEED)}, wall time ${wallMinutes.toFixed(1)} min. Firebase Emulator Suite with the v2 rules; the agent signed in as an editor machine account; synthetic session labels.`,
        "",
        `**Result: ${pass ? "PASS" : "FAIL"}** (${String(checks.filter((c) => c.pass).length)} of ${String(checks.length)} checks)`,
        "",
        reportMarkdown({ ...report, checks, pass })
          .split("\n")
          .slice(2)
          .join("\n"),
        "",
        "## Disruptions",
        "",
        ...[...usbWindows, ...powerWindows, ...cutWindows, ...downWindows].map(
          (w) => `- ${w.label}: ${String((w.endMs - w.startMs) / MINUTE_MS)} min`,
        ),
        ...resets.map((t) => `- device reset ${new Date(t).toISOString()}`),
        "- four damaged lines (truncated, concatenated, other terminator, invalid UTF-8)",
        "",
        "## Numbers",
        "",
        `- Lines delivered to the agent ${String(relay.delivered)}, dropped while it was down ${String(relay.dropped)}.`,
        `- Minutes: local ${String(report.stats.localMinutes)}, cloud ${String(report.stats.cloudMinutes)}, expected ${String(report.stats.expectedMinutes)}.`,
        `- Events: local ${String(report.stats.localEvents)}, cloud ${String(report.stats.cloudEvents)}, truth on the same minutes ${String(report.stats.truthEvents)}.`,
        `- Sessions: ${String(localSessions.length)}.`,
        "",
        "## Calls to Firebase (accelerated-run instrumentation: not a field traffic estimate)",
        "",
        "| Method | Calls | Failed during cuts | Calls/day | ≈ KiB/day |",
        "|---|---|---|---|---|",
        perDay,
        "",
        "## Timeline (wall clock)",
        "",
        ...timeline.map((t) => `- ${t}`),
        "",
      ].join("\n");
      writeFileSync(join(DIR, "REPORT.md"), md);
      writeFileSync(
        join(DIR, "report.json"),
        JSON.stringify(
          { pass, checks, stats: report.stats, calls: Object.fromEntries(callStats), timeline },
          null,
          2,
        ),
      );
      store.close();
      process.stdout.write(`\n${md}\n`);
      expect(checks.filter((c) => !c.pass)).toEqual([]);
    },
    (HOURS * HOUR) / SPEED + 30 * MINUTE_MS,
  );
});
