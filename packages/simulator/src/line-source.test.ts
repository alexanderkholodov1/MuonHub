import { describe, expect, it } from "vitest";
import {
  PRESET_NAMES,
  RENDERABLE_DEVICE_TYPES,
  SYNTHETIC_COMMENT,
  createVirtualDetector,
  preset,
  realTimePacing,
  renderDeviceLines,
  simulate,
  type SourceLine,
} from "./index.js";
import { fnv1a, testDevice, testScenario } from "./test-helpers.js";

const text = (l: SourceLine): string => new TextDecoder().decode(l.bytes);

async function collect(source: AsyncIterable<SourceLine>, max = Infinity): Promise<SourceLine[]> {
  const out: SourceLine[] = [];
  for await (const l of source) {
    out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

describe("createVirtualDetector", () => {
  const scenario = testScenario([testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 5 } })], {
    durationMs: 60_000,
  });

  it("fast mode yields identifying comment, header, then data lines; synthetic flag set", async () => {
    const det = createVirtualDetector({ scenario });
    expect(det.synthetic).toBe(true);
    const lines = await collect(det);
    expect(text(lines[0] as SourceLine)).toBe(`${SYNTHETIC_COMMENT}\n`);
    expect(text(lines[1] as SourceLine)).toContain("Event TimeStamp[ms]");
    expect(lines.length).toBeGreaterThan(200);
    expect(text(lines[2] as SourceLine)).toMatch(
      /^1\t\d+\t\d+\t\d+\t[\d.]+\t[\d.]+\t[\d.]+\t\d+\t[01]\tCOSMIC\n$/,
    );
    for (let i = 1; i < lines.length; i++) {
      expect((lines[i] as SourceLine).hostReceivedAtMs).toBeGreaterThanOrEqual(
        (lines[i - 1] as SourceLine).hostReceivedAtMs,
      );
    }
  });

  it("is byte-identical across runs and matches a stored hash (CA1)", async () => {
    const a = await collect(
      createVirtualDetector({
        scenario: preset("usfq-cosmicwatch-munra", { durationMs: 3_600_000 }),
      }),
    );
    const b = await collect(
      createVirtualDetector({
        scenario: preset("usfq-cosmicwatch-munra", { durationMs: 3_600_000 }),
      }),
    );
    expect(a).toEqual(b);
    expect(fnv1a(a.map((l) => l.bytes))).toBe(REFERENCE_HASH);
  });

  it("10⁵ lines are identical across two runs (CA1)", () => {
    const big = testScenario([testDevice({ rate: { kind: "totalTriggerRate", ratePerS: 100 } })], {
      durationMs: 1_100_000,
    });
    const a = renderDeviceLines(simulate(big));
    const b = renderDeviceLines(simulate(big));
    expect(a.length).toBeGreaterThan(100_000);
    expect(a).toEqual(b);
  });

  it("paced mode with an injected clock emits at the expected host times (CA10)", async () => {
    let now = 1_000_000;
    const sleeps: number[] = [];
    const det = createVirtualDetector({
      scenario,
      pacing: {
        speed: 10,
        nowMs: () => now,
        sleep: (ms) => {
          sleeps.push(ms);
          now += ms;
          return Promise.resolve();
        },
      },
    });
    const fast = await collect(createVirtualDetector({ scenario }));
    const paced = await collect(det);
    expect(paced).toHaveLength(fast.length);
    const t0 = (fast[0] as SourceLine).hostReceivedAtMs;
    for (let i = 0; i < fast.length; i++) {
      const expected = 1_000_000 + ((fast[i] as SourceLine).hostReceivedAtMs - t0) / 10;
      expect(Math.abs((paced[i] as SourceLine).hostReceivedAtMs - expected)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(now - (1_000_000 + 60_000 / 10))).toBeLessThan(10);
    expect(sleeps.every((s) => s > 0)).toBe(true);
  });

  it("stops cleanly on close(), also while paced", async () => {
    const det = createVirtualDetector({ scenario });
    const got: SourceLine[] = [];
    for await (const l of det) {
      got.push(l);
      if (got.length === 5) await det.close();
    }
    expect(got).toHaveLength(5);

    let now = 0;
    const paced = createVirtualDetector({
      scenario,
      pacing: {
        speed: 1,
        nowMs: () => now,
        sleep: async (ms) => {
          now += ms;
          await paced.close();
        },
      },
    });
    const lines = await collect(paced);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("selects a device by id and validates inputs", async () => {
    const two = testScenario(
      [testDevice({ id: "a" }), testDevice({ id: "b", deviceType: "cosmicwatch-v3x" })],
      {
        durationMs: 30_000,
        coincidence: { fractions: [0.5], halfWindowUs: 30 },
      },
    );
    const b = await collect(createVirtualDetector({ scenario: two, deviceId: "b" }));
    expect(text(b[1] as SourceLine)).toContain("Timestamp[s]");
    expect(() => createVirtualDetector({ scenario: two, deviceId: "zzz" })).toThrow(RangeError);
    expect(() => createVirtualDetector({ scenario: { ...two, durationMs: 0 } })).toThrow();
    expect(() =>
      createVirtualDetector({
        scenario,
        pacing: { speed: 0, nowMs: () => 0, sleep: () => Promise.resolve() },
      }),
    ).toThrow();
    expect(() => renderDeviceLines(simulate(scenario), 3)).toThrow(RangeError);
  });

  it("real-time pacing helper produces a working clock", async () => {
    const p = realTimePacing(1000);
    expect(p.speed).toBe(1000);
    const t = p.nowMs();
    await p.sleep(5);
    expect(p.nowMs()).toBeGreaterThanOrEqual(t);
    expect(realTimePacing().speed).toBe(1);
  });

  it("fragments lines when configured", async () => {
    const frag = testScenario([testDevice({ render: { fragmentBytes: 8 } })], {
      durationMs: 10_000,
    });
    const lines = await collect(createVirtualDetector({ scenario: frag }));
    expect(lines.every((l) => l.bytes.length <= 8)).toBe(true);
  });

  it("renderable device types come from the v2 built-ins", () => {
    expect([...RENDERABLE_DEVICE_TYPES].sort()).toEqual(["cosmicwatch-v3x", "munra"]);
  });
});

describe("presets and end-to-end disruptions", () => {
  it("every preset parses and simulates", async () => {
    for (const name of PRESET_NAMES) {
      const det = createVirtualDetector({ scenario: preset(name, { durationMs: 600_000 }) });
      const lines = await collect(det);
      expect(lines.length).toBeGreaterThan(10);
    }
  });

  it("usfq preset: ≈ 2.4 s⁻¹ total triggers, reference pressure, β = −0.12 %/hPa", () => {
    const cfg = preset("usfq-cosmicwatch-munra", { durationMs: 6 * 3_600_000 });
    expect(cfg.p0Hpa).toBe(768);
    expect(cfg.betaPercentPerHpa).toBe(-0.12);
    const dev = simulate(cfg).devices[0];
    const rate = (dev?.truth.length ?? 0) / (6 * 3600);
    expect(Math.abs(rate - 2.4)).toBeLessThan(0.15);
  });

  it("stacked-pair preset has coincidence flags on both devices", () => {
    const sim = simulate(preset("stacked-pair", { durationMs: 3_600_000 }));
    expect(sim.devices).toHaveLength(2);
    expect(sim.devices[0]?.recorded.filter((e) => e.coincidenceFlag === 1).length).toBeGreaterThan(
      500,
    );
    expect(sim.devices[1]?.recorded.filter((e) => e.coincidenceFlag === 1).length).toBeGreaterThan(
      500,
    );
  });

  it("forbush preset: rate drops by ≈ 3 % at onset and recovers", () => {
    const cfg = preset("forbush");
    const sim = simulate({
      ...cfg,
      durationMs: 3_600_000 * 7,
      pressure: { kind: "constant", hPa: 768 },
    });
    const iv = sim.devices[0]?.intervals ?? [];
    const before = iv[300]?.trueRatePerS ?? 0;
    const after = iv[6 * 60 + 1]?.trueRatePerS ?? 0;
    expect(Math.abs(after / before - 0.97)).toBeLessThan(0.002);
  });

  it("disruptions preset: gap, reset, new header, malformed lines appear", async () => {
    const lines = await collect(createVirtualDetector({ scenario: preset("disruptions") }));
    const headers = lines.filter((l) => text(l).startsWith("Event TimeStamp"));
    expect(headers).toHaveLength(3); // start, reset, power loss
    expect(lines.some((l) => l.bytes.includes(0xff))).toBe(true);
    expect(lines.some((l) => /COSMIC\d/.test(text(l)))).toBe(true);
    expect(
      lines.some((l) => l.bytes.at(-2) !== 13 && l.bytes.at(-1) === 10 && !text(l).startsWith("#")),
    ).toBe(true);
    // USB gap (host time inside [1 h, 1 h 10 min) has no data lines)
    const start = preset("disruptions").startMs;
    const inGap = lines.filter(
      (l) =>
        l.hostReceivedAtMs > start + 3_600_000 + 100 &&
        l.hostReceivedAtMs < start + 3_600_000 + 600_000,
    );
    expect(inGap).toHaveLength(0);
  });
});

const REFERENCE_HASH = 1426001814;
