import { describe, it, expect } from "vitest";
import type { EventSummary, SignalRecord } from "@muonhub/shared";
import { EventSummarySchema, SignalRecordSchema } from "@muonhub/shared";
import type { DataProvider } from "./provider.js";
import type { DataChunk, SignalBlobRef } from "./types.js";
import { AuthProviderError } from "./types.js";

/**
 * A trivial in-memory mock typed as `DataProvider`. If the interface is internally inconsistent or
 * misaligned with `@muonhub/shared`, this file fails to compile — that is the point of the test.
 */
function createMockProvider(): DataProvider {
  const summaries = new Map<string, EventSummary>();
  const signalBlobs = new Map<string, SignalRecord[]>();
  const summaryKey = (summary: EventSummary) =>
    `${summary.detectorId}/${summary.intervalStartTs}`;
  const blobKey = (ref: SignalBlobRef) =>
    `${ref.detectorId}/${ref.sessionId}/${ref.intervalStartTs}`;

  return {
    getCurrentUser: async () => null,
    register: async (email, _password, profile) => ({
      uid: "mock-user",
      email,
      username: "mock-user",
      displayName: profile.displayName,
      role: "user",
      institutionId: null,
      language: profile.language,
      emailVerified: false,
      mlTrainingOptOut: false,
      directoryOptIn: false,
    }),
    signIn: async () => {
      throw new AuthProviderError("auth/invalid-credential", "Invalid credentials.");
    },
    signOut: async () => undefined,
    sendPasswordReset: async () => undefined,
    onAuthStateChanged: (cb) => {
      cb(null);
      return () => undefined;
    },
    upsertInstitution: async () => undefined,
    getInstitution: async () => null,
    listStations: async () => [],
    getStation: async () => null,
    upsertStation: async () => undefined,
    deleteStation: async () => undefined,
    listDetectors: async () => [],
    getDetector: async () => null,
    upsertDetector: async () => undefined,
    listSessions: async () => [],
    upsertSession: async () => undefined,
    getMinuteRecords: async () => [],
    pushMinuteRecord: async () => undefined,
    getLatest: async () => null,
    putEventSummary: async (summary) => {
      const parsed = EventSummarySchema.parse(summary);
      summaries.set(summaryKey(parsed), parsed);
    },
    getEventSummaries: async (detectorId, range) =>
      [...summaries.values()]
        .filter(
          (summary) =>
            summary.detectorId === detectorId &&
            summary.intervalStartTs >= range.fromTs &&
            summary.intervalStartTs <= range.toTs,
        )
        .sort((a, b) => a.intervalStartTs - b.intervalStartTs),
    putSignalBlob: async (ref, signals) => {
      signalBlobs.set(
        blobKey(ref),
        signals.map((signal) => SignalRecordSchema.parse(signal)),
      );
    },
    listSignalBlobs: async (detectorId, range) =>
      [...signalBlobs.keys()]
        .map((key): SignalBlobRef => {
          const [keyDetectorId, sessionId, intervalStartTs] = key.split("/");
          return {
            detectorId: keyDetectorId ?? "",
            sessionId: sessionId ?? "",
            intervalStartTs: Number(intervalStartTs),
          };
        })
        .filter(
          (ref) =>
            ref.detectorId === detectorId &&
            ref.intervalStartTs >= range.fromTs &&
            ref.intervalStartTs <= range.toTs,
        )
        .sort((a, b) => a.intervalStartTs - b.intervalStartTs),
    getSignalBlob: async (ref) => signalBlobs.get(blobKey(ref)) ?? [],
    subscribeRealtime: () => () => undefined,
    pushRealtimeRecord: async () => undefined,
    exportAll: async function* () {
      /* no chunks in the mock */
    },
    importAll: async (chunks: AsyncIterable<DataChunk>) => {
      let imported = 0;
      for await (const chunk of chunks) {
        if (chunk) imported += 1;
      }
      return { imported, quarantined: 0, stationsWithoutMetadata: 0, errors: [] };
    },
  };
}

describe("DataProvider contract", () => {
  it("is implementable by a conforming object", async () => {
    const provider = createMockProvider();
    expect(await provider.getCurrentUser()).toBeNull();
    expect(await provider.listStations()).toEqual([]);
  });

  it("exposes auth methods with stable provider errors", async () => {
    const provider = createMockProvider();
    const user = await provider.register("test@example.org", "password", {
      displayName: "Test User",
      language: "en",
    });
    expect(user.role).toBe("user");

    await expect(provider.signIn("test@example.org", "bad-password")).rejects.toMatchObject({
      code: "auth/invalid-credential",
    });
  });

  it("supports the streaming export/import round trip shape", async () => {
    const provider = createMockProvider();
    async function* empty(): AsyncIterable<DataChunk> {
      /* no chunks */
    }
    const report = await provider.importAll(empty());
    expect(report.imported).toBe(0);

    const out: DataChunk[] = [];
    for await (const chunk of provider.exportAll()) out.push(chunk);
    expect(out).toEqual([]);
  });

  it("supports EventSummary and signal blob storage shapes", async () => {
    const provider = createMockProvider();
    const summary: EventSummary = {
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: 1_700_000_000_000,
      intervalEndTs: 1_700_003_600_000,
      signalCount: 2,
      aboveThresholdCount: 2,
      tailCount: 1,
      coincidenceCount: 0,
      noiseThresholdMv: 12,
      mpvMv: 42,
      histogram: {
        binWidthMv: 5,
        minMv: 0,
        counts: [0, 2],
      },
    };
    await provider.putEventSummary(summary);
    expect(
      await provider.getEventSummaries("det_1", {
        fromTs: summary.intervalStartTs,
        toTs: summary.intervalStartTs,
      }),
    ).toEqual([summary]);

    const signal: SignalRecord = {
      ts: summary.intervalStartTs + 1_000,
      sipmMv: 42,
      adc1: 120,
      adc2: 121,
      coincident: false,
      deadtimeUs: 400,
      tempC: 20,
      pressureHpa: 1013,
    };
    const ref: SignalBlobRef = {
      detectorId: "det_1",
      sessionId: "sess_1",
      intervalStartTs: summary.intervalStartTs,
    };
    await provider.putSignalBlob(ref, [signal]);
    expect(
      await provider.listSignalBlobs("det_1", {
        fromTs: summary.intervalStartTs,
        toTs: summary.intervalStartTs,
      }),
    ).toEqual([ref]);
    expect(await provider.getSignalBlob(ref)).toEqual([signal]);
  });

  it("returns an idempotent unsubscribe from a realtime subscription", () => {
    const provider = createMockProvider();
    const unsub = provider.subscribeRealtime("d_1", () => undefined);
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });
});
