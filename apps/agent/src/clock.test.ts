import { describe, expect, it } from "vitest";
import { measureClockOffset, type TimeSource } from "./clock.js";

class MockTimeSource implements TimeSource {
  constructor(
    private readonly machineTimes: readonly number[],
    private readonly trueTime: number,
  ) {}

  private index = 0;

  machineTimeMs(): number {
    const value = this.machineTimes[this.index];
    this.index += 1;
    if (value === undefined) {
      throw new Error("machine time exhausted");
    }

    return value;
  }

  trueTimeMs(): number {
    return this.trueTime;
  }
}

describe("measureClockOffset", () => {
  it("measures trueTime - machineTime using the local midpoint", async () => {
    const source = new MockTimeSource([1_000, 1_020], 1_310);

    await expect(measureClockOffset(source, { skewWarningThresholdMs: 500 })).resolves.toEqual({
      offsetMs: 300,
      clockSkewWarning: false,
      skewWarningThresholdMs: 500,
    });
  });

  it("raises a clock skew warning past the configured threshold", async () => {
    const source = new MockTimeSource([10_000, 10_000], 191_000);

    await expect(
      measureClockOffset(source, { skewWarningThresholdMs: 180_000 }),
    ).resolves.toMatchObject({
      offsetMs: 181_000,
      clockSkewWarning: true,
    });
  });
});
