/** Public surface of the agent package (the daemon is started through `muonhub-agent run`). */
export { Agent, type AgentDeps } from "./agent.js";
export { Daemon } from "./daemon.js";
export { parseConfig, loadConfig, AgentConfigSchema, type AgentConfig } from "./config.js";
export { LineFramer } from "./framing/framer.js";
export { createParser } from "./parsing/parser.js";
export { MinuteAggregator } from "./aggregation/aggregator.js";
export { openLocalStore } from "./store/sqlite.js";
export type { LocalStore } from "./store/types.js";
export { AGENT_VERSION } from "./runtime.js";
