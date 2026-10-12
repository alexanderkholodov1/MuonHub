import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Emulator suite: only `*.emulator.test.ts`, run inside `firebase emulators:exec --only
// auth,firestore,database` (see the `test:emulator` script) so the emulator host variables are set
// and nothing talks to the real muonhub project. The first-attempt emulator tests
// (`*.legacy-emulator.test.ts`) target the first-attempt RTDB rules that spec 0084 replaced; they
// are not run and are removed with the first-attempt provider in M1 step 7.
export default defineConfig({
  resolve: {
    alias: {
      "@muonhub/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.emulator.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**", "**/*.legacy-emulator.test.ts"],
    // Emulator state is shared, so keep these serial.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
