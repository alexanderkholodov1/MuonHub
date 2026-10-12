import { describe, expect, it } from "vitest";
import { encodeLines, fragment, terminatorBytes } from "./disruptions.js";
import { MUNRA_HEADER, renderMunraLine } from "./render/munra.js";
import { renderV3xLine, v3xHeader } from "./render/cosmicwatch-v3x.js";
import { deadTimeValue } from "./render/common.js";
import type { RecordedEvent } from "./scenario.js";
import { testDevice } from "./test-helpers.js";

const ev: RecordedEvent = {
  trueMs: 1000,
  amplitude: 123.456,
  saturated: false,
  noise: false,
  groupId: 1,
  sessionIndex: 0,
  eventId: 270,
  deviceMs: 111_753,
  cumulativeDeadMs: 46.1,
  pressureHpa: 765.016,
  temperatureC: 27.14,
  coincidenceFlag: 1,
  delivered: true,
};

/** Reference parser for the MuNRa line (SERIAL-FORMATS §2): tab or multiple spaces. */
function parseMunra(line: string): Record<string, number | string> {
  const c = line.trim().split(/\t|\s{2,}| /);
  expect(c).toHaveLength(10);
  return {
    event: Number(c[0]),
    timestampMs: Number(c[1]),
    adc1: Number(c[2]),
    adc2: Number(c[3]),
    sipmMv: Number(c[4]),
    pressurePa: Number(c[5]),
    tempC: Number(c[6]),
    deadTime: Number(c[7]),
    coincident: Number(c[8]),
    marker: c[9] ?? "",
  };
}

describe("renderers (CA9)", () => {
  it("MuNRa line round-trips field by field, header equals SERIAL-FORMATS §2", () => {
    expect(MUNRA_HEADER).toBe(
      "Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC",
    );
    const p = parseMunra(renderMunraLine(ev, testDevice()));
    expect(p).toEqual({
      event: 270,
      timestampMs: 111_753,
      adc1: 153,
      adc2: 153,
      sipmMv: 123.46,
      pressurePa: 76501.6,
      tempC: 27.1,
      deadTime: 46100,
      coincident: 1,
      marker: "COSMIC",
    });
  });

  it("MuNRa dead-time column semantics are configurable", () => {
    const d = (deadTimeColumn: "cumulativeUs" | "cumulativeMs" | "cumulativeS" | "perEventUs") =>
      deadTimeValue(ev, testDevice({ deadTimeUs: 171 }), deadTimeColumn);
    expect(d("cumulativeUs")).toBe(46100);
    expect(d("cumulativeMs")).toBe(46.1);
    expect(d("cumulativeS")).toBe(0.0461);
    expect(d("perEventUs")).toBe(171);
    const line = renderMunraLine(ev, testDevice({ render: { deadTimeColumn: "cumulativeS" } }));
    expect(parseMunra(line)["deadTime"]).toBe(0.0461);
  });

  it("v3X line follows the official order and round-trips", () => {
    expect(v3xHeader()).toBe(
      "Event\tTimestamp[s]\tFlag\tADC[12b]\tSiPM[mV]\tDeadtime[s]\tTemp[C]\tPress[Pa]",
    );
    const c = renderV3xLine(ev, testDevice({ deviceType: "cosmicwatch-v3x" })).split("\t");
    expect(c).toEqual(["270", "111.753", "1", "153", "123.46", "0.046100", "27.1", "76501.60"]);
    const withImu = renderV3xLine(ev, testDevice(), { imuZeros: true }).split("\t");
    expect(withImu).toHaveLength(14);
    expect(withImu.slice(8)).toEqual(["0", "0", "0", "0", "0", "0"]);
    expect(v3xHeader({ imuZeros: true }).split("\t")).toHaveLength(14);
  });

  it("clips ADC to 12 bits and wraps the counter", () => {
    const big = { ...ev, amplitude: 1e6, deviceMs: 4_294_967_296 + 5 };
    const p = parseMunra(renderMunraLine(big, testDevice()));
    expect(p["adc1"]).toBe(4095);
    expect(p["timestampMs"]).toBe(5);
  });
});

describe("malformed lines (CA8)", () => {
  const text = (b: Uint8Array): string => new TextDecoder().decode(b);
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ text: `${i + 1}\t100\tCOSMIC`, hostMs: i, data: true }));

  it("applies each case exactly as configured", () => {
    const lines = [{ text: "# header", hostMs: 0, data: false }, ...mk(6)];
    const out = encodeLines(
      lines,
      "CRLF",
      new Map([
        [1, "truncated"],
        [2, "concatenated"],
        [4, "otherTerminator"],
        [5, "invalidUtf8"],
      ] as const),
    );
    expect(text(out[0]?.bytes ?? new Uint8Array())).toBe("# header\r\n");
    expect(text(out[1]?.bytes ?? new Uint8Array())).toBe("1\t100\tCOSMIC\r\n");
    expect(text(out[2]?.bytes ?? new Uint8Array())).toBe("2\t100\t\r\n");
    // concatenated: line 3 and line 4 glued together, host time of the second
    expect(text(out[3]?.bytes ?? new Uint8Array())).toBe("3\t100\tCOSMIC4\t100\tCOSMIC\r\n");
    expect(out[3]?.hostMs).toBe(3);
    // line 5 (index 4) ends with LF instead of CRLF
    expect(text(out[4]?.bytes ?? new Uint8Array())).toBe("5\t100\tCOSMIC\n");
    // line 6 (index 5) contains an invalid UTF-8 byte
    const bad = out[5]?.bytes ?? new Uint8Array();
    expect(bad).toContain(0xff);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bad)).toThrow();
    expect(out).toHaveLength(6);
  });

  it("concatenation of the last line and terminators, fragments", () => {
    const out = encodeLines(mk(1), "LF", new Map([[0, "concatenated"]] as const));
    expect(text(out[0]?.bytes ?? new Uint8Array())).toBe("1\t100\tCOSMIC\n");
    expect(terminatorBytes("LF")).toEqual(Uint8Array.of(10));
    const parts = fragment(new TextEncoder().encode("abcdefg"), 3);
    expect(parts.map(text)).toEqual(["abc", "def", "g"]);
    expect(fragment(new TextEncoder().encode("ab"), undefined)).toHaveLength(1);
  });
});
