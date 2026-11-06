import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { v2 as dp } from "@muonhub/data-provider";
import type { v2 } from "@muonhub/shared";
import { DataProviderRoot } from "@/lib/data/DataProviderContext";
import { t } from "@/i18n/t";
import { StreamDashboard } from "./StreamDashboard";

vi.mock("./TimeChart", () => ({
  TimeChart: ({ label }: { label: string }) => <div data-testid="chart">{label}</div>,
}));

const MINUTE = 60_000;
const nowMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const minute = (ts: number, n: number): v2.MinuteRecord => ({
  schemaVersion: 2,
  ts,
  sessionId: "v5-session-1",
  n,
  ...(n > 0 ? { amplitude: { mean: 2, min: 1, max: 30, unit: "mV" as const } } : {}),
  liveSource: "nominal",
  pressureHpa: 765.5,
  temperatureC: 30,
  quality: { eventIdGaps: 0, clockAnomalies: 0 },
});

function fakeProvider(options: {
  stream?: "ok" | "missing" | "denied";
  minutes?: v2.MinuteRecord[];
  agentVersion?: string;
}): dp.DataProviderV2 {
  const stream = { id: "stream1", stationId: "station1", deviceId: "device1" };
  const fake = {
    getStream: () =>
      options.stream === "denied"
        ? Promise.reject(new dp.DataProviderError("permission-denied"))
        : Promise.resolve(options.stream === "missing" ? null : stream),
    getStation: () => Promise.resolve({ id: "station1", name: "Test station" }),
    getDevice: () => Promise.resolve({ id: "device1", label: "Test detector" }),
    listSessions: () =>
      Promise.resolve({
        items: [
          {
            id: "s1",
            startedAt: Date.now() - 3_600_000,
            agentVersion: options.agentVersion ?? "6.0.0",
          },
        ],
      }),
    readMinutes: (_id: string, q: { fromTs: number; toTs: number }) =>
      Promise.resolve({
        items: (options.minutes ?? []).filter((m) => m.ts >= q.fromTs && m.ts <= q.toTs),
        nextCursor: null,
      }),
  };
  return fake as unknown as dp.DataProviderV2;
}

const show = (provider: dp.DataProviderV2) =>
  render(
    <DataProviderRoot provider={provider}>
      <StreamDashboard streamId="stream1" />
    </DataProviderRoot>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StreamDashboard (spec 0090 CA4)", () => {
  it("shows the stream with its statistics, charts and labels when data is current", async () => {
    const recent = Array.from({ length: 30 }, (_, i) =>
      minute(nowMinute() - (i + 1) * MINUTE, 100),
    );
    show(fakeProvider({ minutes: recent, agentVersion: "v5-mirror 6.0.0" }));
    expect(await screen.findByRole("heading", { name: "Test detector" })).toBeTruthy();
    expect(await screen.findByText(t("dashboard.freshness.fresh"))).toBeTruthy();
    expect(await screen.findByText("100.0 ± 1.8")).toBeTruthy();
    expect(screen.getAllByTestId("chart")).toHaveLength(3);
    expect(screen.getByText(t("dashboard.uncorrected"))).toBeTruthy();
    expect(screen.getByText(t("dashboard.source.v5Mirror"))).toBeTruthy();
  });

  it("says when no new minute arrived recently", async () => {
    show(fakeProvider({ minutes: [minute(nowMinute() - 20 * MINUTE, 90)] }));
    expect(await screen.findByText(t("dashboard.freshness.stale"))).toBeTruthy();
    expect(screen.queryByText(t("dashboard.source.v5Mirror"))).toBeNull();
  });

  it("shows the empty state without charts", async () => {
    show(fakeProvider({ minutes: [] }));
    expect(await screen.findByText(t("dashboard.empty"))).toBeTruthy();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
    expect(screen.getByText(t("dashboard.freshness.none"))).toBeTruthy();
  });

  it("shows a safe error when access is denied, and not-found for an unknown stream", async () => {
    const denied = show(fakeProvider({ stream: "denied" }));
    expect(await screen.findByText(t("error.permissionDenied"))).toBeTruthy();
    denied.unmount();
    show(fakeProvider({ stream: "missing" }));
    expect(await screen.findByText(t("error.notFound"))).toBeTruthy();
  });
});
