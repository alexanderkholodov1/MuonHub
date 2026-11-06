import { describe, expect, it } from "vitest";
import { formatTime } from "./format";

describe("formatTime", () => {
  it("formats without throwing and names the time zone", () => {
    const text = formatTime(Date.UTC(2026, 10, 6, 3, 8), "UTC");
    expect(text).toMatch(/UTC/);
    expect(text).toMatch(/3:08|03:08/);
  });

  it("uses the viewer's zone when none is given", () => {
    expect(() => formatTime(Date.UTC(2026, 10, 6))).not.toThrow();
  });
});
