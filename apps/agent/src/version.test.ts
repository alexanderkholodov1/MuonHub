import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MUONHUB_VERSION } from "@muonhub/shared";
import { AGENT_VERSION } from "./runtime.js";

const root = new URL("../../../", import.meta.url);
const versionOf = (path: string): string =>
  (JSON.parse(readFileSync(new URL(path, root), "utf8")) as { version: string }).version;

describe("version lockstep (ADR-008)", () => {
  it("the agent, the shared constant, the root and every workspace package carry one version", () => {
    const expected = versionOf("package.json");
    expect(MUONHUB_VERSION).toBe(expected);
    expect(AGENT_VERSION).toBe(expected);
    const workspaces = [
      "apps/agent/package.json",
      ...readdirSync(new URL("packages/", root)).map((p) => `packages/${p}/package.json`),
    ];
    for (const w of workspaces) expect({ w, v: versionOf(w) }).toEqual({ w, v: expected });
  });
});
