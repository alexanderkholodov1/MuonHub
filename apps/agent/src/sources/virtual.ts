/**
 * Virtual detector source (spec 0086) for tests and `muonhub-dev`. Its data is synthetic and the
 * session is labelled so; it is never mixed with real data.
 */
import type { PresetName, ScenarioConfig } from "@muonhub/simulator";
import type { AgentChunk, AgentLineSource, SourceFactory } from "./types.js";

export function createVirtualFactory(options: {
  preset?: string;
  seed?: number | undefined;
  speed?: number | undefined;
  scenario?: ScenarioConfig;
}): SourceFactory {
  return {
    description: "virtual detector (synthetic data)",
    baud: null,
    reconnect: false,
    open: async () => {
      // Loaded on demand: the simulator is a development dependency, absent from production bundles.
      const sim = await import("@muonhub/simulator");
      const name = options.preset ?? "disruptions";
      if (
        options.scenario === undefined &&
        !(sim.PRESET_NAMES as readonly string[]).includes(name)
      ) {
        throw new Error(`unknown simulator preset "${name}" (${sim.PRESET_NAMES.join(", ")})`);
      }
      const scenario =
        options.scenario ??
        sim.preset(name as PresetName, options.seed === undefined ? {} : { seed: options.seed });
      const detector = sim.createVirtualDetector({
        scenario,
        ...(options.speed === undefined ? {} : { pacing: sim.realTimePacing(options.speed) }),
      });
      const source: AgentLineSource = {
        synthetic: true,
        [Symbol.asyncIterator]: () => detector[Symbol.asyncIterator]() as AsyncIterator<AgentChunk>,
        close: () => detector.close(),
      };
      return source;
    },
  };
}
