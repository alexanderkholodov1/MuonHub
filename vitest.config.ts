import { defineConfig } from "vitest/config";

// Workspace-level runs only; each package also runs its own vitest through Turborepo.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
  },
});
