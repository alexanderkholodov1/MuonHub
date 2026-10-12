import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // vitest 5 no longer excludes build output by default; compiled tests in dist/ must not run twice.
    exclude: [...configDefaults.exclude, "**/dist/**"],
    // Long known-answer runs (10⁶–10⁷ events) need more than the default 5 s.
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test-helpers.ts", "src/index.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
