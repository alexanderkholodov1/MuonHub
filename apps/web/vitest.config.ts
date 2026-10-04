import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // vitest 5 no longer excludes build output by default; compiled tests in dist/ must not run twice.
    exclude: [...configDefaults.exclude, "**/dist/**"],
    environment: "jsdom",
    passWithNoTests: true,
  },
});
