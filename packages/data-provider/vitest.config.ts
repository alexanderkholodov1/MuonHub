import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Default suite: unit/contract tests only. Emulator-backed tests (`*.emulator.test.ts`)
// are excluded here and run via `pnpm test:emulator`, which starts the Firebase Emulator
// Suite first — so CI's plain `pnpm test` needs no emulator, no Java, and no secrets.
export default defineConfig({
  resolve: {
    alias: {
      "@muonhub/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/dist/**", "**/*.emulator.test.ts"],
  },
});
