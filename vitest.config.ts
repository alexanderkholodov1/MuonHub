import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each package runs its own vitest; this root config is for workspace-level runs
    workspace: [
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
    ],
  },
});
