import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // vitest 5 no longer excludes build output by default; compiled tests in dist/ must not run twice.
    exclude: [...configDefaults.exclude, "**/dist/**"],
    // Coverage hard-gate (≥80%) — activated with spec 0005 (docs/STATUS.md quality gates).
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The barrel is pure re-exports; counting it would only dilute the signal.
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
