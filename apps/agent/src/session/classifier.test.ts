import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { createParser } from "../parsing/parser.js";
import { LineFramer } from "../framing/framer.js";
import { LineClassifier } from "./classifier.js";
import { munraLine } from "../testing/harness.js";
import type { PipelineOp } from "./ops.js";

function make(type: v2.DeviceType = v2.MUNRA) {
  let n = 0;
  const c = new LineClassifier({
    deviceId: "d",
    parser: createParser(type),
    deviceType: type,
    newSessionId: () => `s${String(++n)}`,
    provenance: () => ({ source: "ntp", offsetMs: 0, measuredAt: 0 }),
    synthetic: false,
    gapMs: 120_000,
  });
  const framer = new LineFramer({ recordMarker: type.parser.recordMarker });
  const feed = (text: string, host: number, monoMs: number): PipelineOp[] =>
    framer
      .push(new TextEncoder().encode(text), host, String(BigInt(monoMs) * 1_000_000n))
      .flatMap((l) => c.classify(l));
  return { c, feed };
}

const kinds = (ops: PipelineOp[]): string[] =>
  ops.map((o) => (o.t === "sessionEnd" ? `end:${o.reason}` : o.t));

describe("LineClassifier", () => {
  it("opens a session at the first line and not before", () => {
    const { c, feed } = make();
    c.connected(500);
    expect(c.currentSessionId).toBeNull();
    expect(kinds(feed(munraLine(1, 1000), 1000, 0))).toEqual(["sessionStart", "line"]);
    expect(c.currentSessionId).toBe("s1");
  });

  it("an event counter that decreases is a reset: the old session ends, the line belongs to the new one", () => {
    const { feed } = make();
    feed(munraLine(1, 1000), 1000, 0);
    feed(munraLine(2, 2000), 2000, 1000);
    const ops = feed(munraLine(1, 500), 3000, 2000);
    expect(kinds(ops)).toEqual(["end:reset", "sessionStart", "line"]);
    const line = ops.find((o) => o.t === "line");
    expect(line?.t === "line" && line.row.sessionId).toBe("s2");
  });

  it("a dead-time counter or device clock that decreases is a reset too", () => {
    const a = make();
    a.feed(munraLine(1, 1000, { deadUs: 500 }), 1000, 0);
    expect(kinds(a.feed(munraLine(2, 2000, { deadUs: 100 }), 2000, 1000))).toContain("end:reset");
    const b = make();
    b.feed(munraLine(1, 5000), 1000, 0);
    expect(kinds(b.feed(munraLine(2, 4000), 2000, 1000))).toContain("end:reset");
  });

  it("a 32-bit device clock rollover is not a reset", () => {
    const { feed } = make();
    feed(munraLine(1, 4_294_960_000), 1000, 0);
    const ops = feed(munraLine(2, 1000), 2000, 1000);
    expect(kinds(ops)).toEqual(["line"]);
    const line = ops[0];
    expect(
      line?.t === "line" && line.parsed.kind === "event" && line.parsed.event.deviceTimeMs,
    ).toBeGreaterThan(4_294_960_000);
  });

  it("a wall-clock step (wall and monotonic deltas differ by more than 2 s) ends the session with clockStep", () => {
    const { feed } = make();
    feed(munraLine(1, 1000), 1000, 0);
    const ops = feed(munraLine(2, 2000), 301_000, 1000);
    expect(kinds(ops)).toEqual(["end:clockStep", "sessionStart", "line"]);
    // a small divergence (jitter) is not a step
    const { feed: f2 } = make();
    f2(munraLine(1, 1000), 1000, 0);
    expect(kinds(f2(munraLine(2, 2000), 2900, 1000))).toEqual(["line"]);
  });

  it("a silence longer than the window inside a session is marked as a gap", () => {
    const { feed } = make();
    feed(munraLine(1, 1000), 1000, 0);
    expect(kinds(feed(munraLine(2, 2000), 201_000, 200_000))).toEqual(["gap", "line"]);
  });

  it("malformed lines stay in the stream as lines (kept raw) and never open anything by themselves twice", () => {
    const { feed } = make();
    const ops = feed("12 34\r\n", 1000, 0);
    expect(kinds(ops)).toEqual(["sessionStart", "line"]);
    const line = ops[1];
    expect(line?.t === "line" && line.parsed.kind).toBe("malformed");
  });
});
