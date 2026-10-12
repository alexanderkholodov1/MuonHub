/**
 * Virtual detector source (spec 0086) for tests and `muonhub-dev`. Its data is synthetic and the
 * session is labelled so; it is never mixed with real data.
 */
import {
  createVirtualDetector,
  preset,
  realTimePacing,
  PRESET_NAMES,
  type PresetName,
  type ScenarioConfig,
} from "@muonhub/simulator";
import type { AgentChunk, AgentLineSource, SourceFactory } from "./types.js";

export function createVirtualFactory(options: {
  preset?: string;
  seed?: number | undefined;
  speed?: number | undefined;
  scenario?: ScenarioConfig;
}): SourceFactory {
  const scenario = (): ScenarioConfig => {
    if (options.scenario !== undefined) return options.scenario;
    const name = options.preset ?? "disruptions";
    if (!(PRESET_NAMES as readonly string[]).includes(name)) {
      throw new Error(`unknown simulator preset "${name}" (${PRESET_NAMES.join(", ")})`);
    }
    return preset(name as PresetName, options.seed === undefined ? {} : { seed: options.seed });
  };
  return {
    description: "virtual detector (synthetic data)",
    baud: null,
    reconnect: false,
    open: () => {
      const detector = createVirtualDetector({
        scenario: scenario(),
        ...(options.speed === undefined ? {} : { pacing: realTimePacing(options.speed) }),
      });
      const source: AgentLineSource = {
        synthetic: true,
        [Symbol.asyncIterator]: () => detector[Symbol.asyncIterator]() as AsyncIterator<AgentChunk>,
        close: () => detector.close(),
      };
      return Promise.resolve(source);
    },
  };
}
