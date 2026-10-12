import { describe, expect, it } from "vitest";
import { LineFramer } from "./framer.js";
import { RAW_FLAG_LOSSY, RAW_FLAG_SPLIT, RAW_FLAG_TRUNCATED } from "../store/types.js";

const enc = new TextEncoder();
const feed = (f: LineFramer, s: string | Uint8Array, ts = 1): string[] =>
  f.push(typeof s === "string" ? enc.encode(s) : s, ts, "1").map((l) => l.text);

describe("LineFramer (CA1)", () => {
  it("splits CRLF and LF lines", () => {
    const f = new LineFramer();
    expect(feed(f, "a 1\r\nb 2\nc 3\r\n")).toEqual(["a 1", "b 2", "c 3"]);
  });

  it("treats a lone CR as a terminator and a CRLF split across reads as one", () => {
    const f = new LineFramer();
    expect(feed(f, "a\rb\r")).toEqual(["a", "b"]);
    expect(feed(f, "\nc\r")).toEqual(["c"]);
    expect(feed(f, "\nd\n")).toEqual(["d"]);
  });

  it("reassembles a line delivered one byte at a time", () => {
    const f = new LineFramer();
    const out: string[] = [];
    for (const b of enc.encode("12 3456 78\r\n99 1\r\n")) out.push(...feed(f, new Uint8Array([b])));
    expect(out).toEqual(["12 3456 78", "99 1"]);
    expect(f.pendingBytes).toBe(0);
  });

  it("splits concatenated COSMIC records into two lines, flagged as split", () => {
    const f = new LineFramer({ recordMarker: "COSMIC" });
    const lines = f.push(
      enc.encode("487 1059000 60 0.9 0 COSMIC488 1059953 61 0.8 0 COSMIC\r\n"),
      5,
      "9",
    );
    expect(lines.map((l) => l.text)).toEqual([
      "487 1059000 60 0.9 0 COSMIC",
      "488 1059953 61 0.8 0 COSMIC",
    ]);
    expect(lines.every((l) => (l.flags & RAW_FLAG_SPLIT) !== 0)).toBe(true);
    expect(lines[0]?.hostTs).toBe(5);
  });

  it("does not split when the device type has no marker", () => {
    const f = new LineFramer();
    expect(feed(f, "1 COSMIC488 2\n")).toEqual(["1 COSMIC488 2"]);
  });

  it("keeps invalid UTF-8 raw: lossy text plus the original bytes", () => {
    const f = new LineFramer();
    const bytes = new Uint8Array([0x31, 0x20, 0xff, 0xfe, 0x20, 0x32, 0x0a]);
    const [line] = f.push(bytes, 1, "1");
    expect(line?.flags ? line.flags & RAW_FLAG_LOSSY : 0).toBe(RAW_FLAG_LOSSY);
    expect(Array.from(line?.rawBytes ?? [])).toEqual([0x31, 0x20, 0xff, 0xfe, 0x20, 0x32]);
    expect(line?.byteLength).toBe(6);
  });

  it("truncates a line that never ends instead of growing without bound", () => {
    const f = new LineFramer();
    const lines = f.push(new Uint8Array(10_000).fill(0x41), 1, "1");
    expect(lines).toHaveLength(1);
    expect((lines[0]?.flags ?? 0) & RAW_FLAG_TRUNCATED).toBe(RAW_FLAG_TRUNCATED);
    expect(lines[0]?.text.length).toBe(4096);
    expect(f.pendingBytes).toBe(0);
  });

  it("skips empty lines and drops a lost fragment on request", () => {
    const f = new LineFramer();
    expect(feed(f, "\r\n\n\r\nx\n")).toEqual(["x"]);
    feed(f, "partial");
    expect(f.discardPending().length).toBe(7);
    expect(feed(f, "y\n")).toEqual(["y"]);
  });
});
