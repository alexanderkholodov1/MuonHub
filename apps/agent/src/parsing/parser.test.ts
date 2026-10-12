import { describe, expect, it } from "vitest";
import { v2 } from "@muonhub/shared";
import { createParser } from "./parser.js";

const munra = createParser(v2.MUNRA);
const v3x = createParser(v2.COSMICWATCH_V3X);

describe("device-type parser", () => {
  it("parses a MuNRa line (v5 example) with unit conversions", () => {
    const r = munra.parse("270\t111753\t60\t1881\t0.9\t76501.6\t27.1\t46100\t0\tCOSMIC");
    expect(r.kind).toBe("event");
    if (r.kind !== "event") return;
    const { pressureHpa, ...rest } = r.event;
    expect(pressureHpa).toBeCloseTo(765.016, 9);
    expect(rest).toEqual({
      eventId: 270,
      deviceTimeMs: 111753,
      adc: 60,
      amplitude: { value: 0.9, unit: "mV" },
      temperatureC: 27.1,
      deadTimeUs: 46100,
      coincidence: false,
    });
  });

  it("treats header and comment lines as headers, not malformed", () => {
    expect(munra.parse("Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C]")).toEqual({
      kind: "header",
    });
    expect(munra.parse("# MuonHub virtual detector - synthetic data")).toEqual({ kind: "header" });
  });

  it("marks truncated or non-numeric lines malformed and never invents zeros", () => {
    expect(munra.parse("270 111753 60").kind).toBe("malformed");
    expect(munra.parse("270 111753 60 1881 abc 76501.6 27.1 46100 0 COSMIC").kind).toBe(
      "malformed",
    );
    expect(munra.parse("").kind).toBe("malformed");
  });

  it("converts seconds to milliseconds for v3X", () => {
    const r = v3x.parse("5 12.5 0 3000 95.5 0.002 24.1 100000 0 0 0 0 0 0");
    expect(r.kind).toBe("event");
    if (r.kind === "event") {
      expect(r.event.deviceTimeMs).toBe(12500);
      expect(r.event.deadTimeUs).toBe(2000);
      expect(r.event.pressureHpa).toBe(1000);
    }
  });
});
