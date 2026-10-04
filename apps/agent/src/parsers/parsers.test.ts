import { describe, expect, it } from "vitest";
import {
  detectSerialFormat,
  parseSerialLine,
  splitSerialBufferLines,
  type ParserLogger,
} from "./index.js";

const NOW = 1_717_200_000_000;

function testLogger(messages: string[]): ParserLogger {
  return {
    warn(message) {
      messages.push(message);
    },
  };
}

describe("serial parser format detection", () => {
  it("detects the four documented wire formats", () => {
    expect(detectSerialFormat("270  111753  60  1881  0.9  76501.6  27.1  46100  0  COSMIC")).toBe(
      "cosmicwatch",
    );
    expect(detectSerialFormat('{"trg":1,"sipm":122.5,"temp":22.5}')).toBe("json");
    expect(detectSerialFormat("TRG 1 CH 1 ADC 245 TEMP 22.5 PRES 101320 DT 0.15")).toBe("keyValue");
    expect(detectSerialFormat("1,122.5,22.5,101320,0.15,1,1717200000000")).toBe("csv");
  });

  it("skips headers and non-data lines", () => {
    expect(detectSerialFormat("Event TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C]")).toBe(
      "unknown",
    );
  });
});

describe("serial parser normalization", () => {
  it("parses the CosmicWatch/MuNRa standard sample line", () => {
    const reading = parseSerialLine("270  111753  60  1881  0.9  76501.6  27.1  46100  0  COSMIC", {
      now: () => NOW,
    });

    expect(reading).toMatchObject({
      timestamp: NOW,
      eventCount: 1,
      eventId: 270,
      detectorTimestampMs: 111_753,
      adc1: 60,
      adc2: 1_881,
      sipmMv: 0.9,
      pressurePa: 76_501.6,
      tempC: 27.1,
      deadtimePercent: 4.61,
      coincident: 0,
      sourceFormat: "cosmicwatch",
    });
  });

  it("parses JSON object lines with documented field names", () => {
    const reading = parseSerialLine(
      '{"trg":2,"sipm":122.5,"temp":22.5,"pressure":101320,"deadtime":0.15,"coincident":1,"timestamp":1717200000000}',
    );

    expect(reading).toMatchObject({
      timestamp: 1_717_200_000_000,
      eventCount: 2,
      sipmMv: 122.5,
      tempC: 22.5,
      pressurePa: 101_320,
      deadtimePercent: 0.15,
      coincident: 1,
      sourceFormat: "json",
    });
  });

  it("parses key-value lines and preserves the v5 ADC to mV conversion", () => {
    const reading = parseSerialLine("TRG 1 CH 1 ADC 245 TEMP 22.5 PRES 101320 DT 0.15", {
      now: () => NOW,
    });

    expect(reading).toMatchObject({
      timestamp: NOW,
      eventCount: 1,
      sipmMv: 122.5,
      tempC: 22.5,
      pressurePa: 101_320,
      deadtimePercent: 0.15,
      coincident: 0,
      sourceFormat: "keyValue",
    });
  });

  it("parses CSV lines in the documented column order", () => {
    const reading = parseSerialLine("1,122.5,22.5,101320,0.15,1,1717200000000");

    expect(reading).toMatchObject({
      timestamp: 1_717_200_000_000,
      eventCount: 1,
      sipmMv: 122.5,
      tempC: 22.5,
      pressurePa: 101_320,
      deadtimePercent: 0.15,
      coincident: 1,
      sourceFormat: "csv",
    });
  });
});

describe("serial parser robustness", () => {
  it("splits concatenated CosmicWatch records at the COSMIC boundary", () => {
    expect(
      splitSerialBufferLines(
        "270 111753 60 1881 0.9 76501.6 27.1 46100 0 COSMIC488 1059953 61 1882 1.1 76502.6 27.2 46110 1 COSMIC\n",
      ),
    ).toEqual([
      "270 111753 60 1881 0.9 76501.6 27.1 46100 0 COSMIC",
      "488 1059953 61 1882 1.1 76502.6 27.2 46110 1 COSMIC",
    ]);
  });

  it("logs and skips malformed lines without throwing", () => {
    const warnings: string[] = [];

    expect(
      parseSerialLine("270 111753 60 not-a-number 0.9 76501.6 27.1 46100 0 COSMIC", {
        logger: testLogger(warnings),
      }),
    ).toBeNull();

    expect(warnings).toEqual(["Skipped malformed CosmicWatch line."]);
  });
});
