import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Emulator suite: only `*.emulator.test.ts`, run inside `firebase emulators:exec`
// (see the `test:emulator` script) so FIREBASE_DATABASE_EMULATOR_HOST / _AUTH_EMULATOR_HOST
// are set and the provider talks to the local emulator instead of muonhub.
export default defineConfig({
  resolve: {
    alias: {
      "@muonhub/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.emulator.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**"],
    // Emulator state is shared, so keep these serial.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
