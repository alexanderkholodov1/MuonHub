import { configDefaults, defineConfig } from "vitest/config";

// Emulator suite: only `*.emulator.test.ts`, run inside `firebase emulators:exec --only
// auth,firestore,database` (see the `test:emulator` script) so the emulator host variables are set
// and nothing talks to the real muonhub project.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.emulator.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
