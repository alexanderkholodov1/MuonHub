import { describe, expect, it } from "vitest";
import { mapMinute, sessionStartMs, v6SessionId } from "./map.js";

const real = { cc: 0, dt: 0.044, ec: 132, pr: 76719, sm: 2.4, sn: 0.3, sx: 199.3, tp: 30.3 };

describe("mapMinute", () => {
  it("copies a v5 minute into a v6 record, uncorrected, with pressure in hPa", () => {
    const r = mapMinute("1793931780", real, "v5-session-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record).toEqual({
      schemaVersion: 2,
      ts: 1793931780000,
      sessionId: "v5-session-1",
      n: 132,
      amplitude: { mean: 2.4, min: 0.3, max: 199.3, unit: "mV" },
      liveSource: "nominal",
      temperatureC: 30.3,
      pressureHpa: 767.19,
      quality: { eventIdGaps: 0, clockAnomalies: 0 },
    });
  });

  it("leaves absent quantities absent, never zero", () => {
    const r = mapMinute("1793931840", { ec: 0 }, "s");
    expect(r.ok && r.record).toMatchObject({ n: 0 });
    expect(r.ok && "pressureHpa" in r.record).toBe(false);
    expect(r.ok && "amplitude" in r.record).toBe(false);
  });

  it("refuses keys that are not minute starts and unreadable minutes", () => {
    expect(mapMinute("1793931781", real, "s")).toEqual({ ok: false, reason: "not a minute start" });
    expect(mapMinute("abc", real, "s").ok).toBe(false);
    expect(mapMinute("1793931780", { ec: -1 }, "s").ok).toBe(false);
    expect(mapMinute("1793931780", { ...real, sn: 5, sm: 2 }, "s").ok).toBe(false);
  });

  it("derives session ids and start times from v5 keys", () => {
    expect(sessionStartMs("session_1793377005775")).toBe(1793377005775);
    expect(sessionStartMs("other")).toBeNull();
    expect(v6SessionId("session_1793377005775")).toBe("v5-session-1793377005775");
  });
});
