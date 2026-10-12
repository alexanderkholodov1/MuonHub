import { describe, expect, it } from "vitest";
import { suggestNoiseThreshold } from "./noise.js";
import { gaussian, mulberry32 } from "./test-helpers.js";

const edges = Array.from({ length: 101 }, (_, i) => i * 2);
const binning = { edges, unit: "mV" as const };

describe("suggestNoiseThreshold", () => {
  it("suggests the valley between a noise lobe and the main peak and removes nothing", () => {
    const rng = mulberry32(3);
    const data: number[] = [];
    for (let i = 0; i < 1000; i++) data.push(Math.abs(6 + 2 * gaussian(rng)));
    for (let i = 0; i < 20000; i++) data.push(80 + 12 * gaussian(rng));
    const s = suggestNoiseThreshold(data, binning);
    expect(s.status).toBe("ok");
    expect(s.suggestedThreshold as number).toBeGreaterThan(10);
    expect(s.suggestedThreshold as number).toBeLessThan(60);
    expect(s.inputCount).toBe(data.length);
    expect(s.provenance.fn).toBe("suggestNoiseThreshold");
  });

  it("noise suggestion: triggered stream without a noise lobe → no suggestion value, nothing removed", () => {
    const rng = mulberry32(4);
    const data: number[] = [];
    for (let i = 0; i < 20000; i++) data.push(80 + 12 * gaussian(rng));
    const s = suggestNoiseThreshold(data, binning);
    expect(s.status).toBe("not-computable");
    expect(s.suggestedThreshold).toBeUndefined();
    expect(s.inputCount).toBe(20000);
  });

  it("is not computable without a usable histogram", () => {
    expect(suggestNoiseThreshold([1], { edges: [0], unit: "mV" }).status).toBe("not-computable");
  });
});
