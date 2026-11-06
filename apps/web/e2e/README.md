# Web end-to-end tests

M2 step 7 / B-M2-14, covering specs 0088–0091. The suite runs the static export against
Auth, Firestore and Realtime Database emulators for `demo-muonhub`. It never uses production
credentials or data. All fixture names identify TEST data.

From the repository root, with Node 24, pnpm, Java 21 and Chromium installed:

```sh
pnpm turbo run build --filter='./packages/*' --concurrency=1
pnpm --filter @muonhub/web exec playwright install --with-deps chromium
pnpm --filter @muonhub/web e2e
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable.
The suite uses the agent package's existing Firebase CLI, without adding dependencies or changing
the lockfile. Firebase CLI configuration is isolated under ignored `e2e/.state/config` through
`XDG_CONFIG_HOME`, so it can exit cleanly without writing to the workstation's configuration; update
notifications are disabled for this test command. On a small machine,
`JAVA_TOOL_OPTIONS=-Xmx256m` limits each emulator JVM's heap.
Run only one build or test command at a time.

`e2e` starts the emulators on `127.0.0.1` (9099, 8080, 9000), builds the web with explicit emulator
configuration, then invokes Playwright. Its static server binds to `127.0.0.1:4173`, serves clean
URLs and module workers, and is stopped by Playwright. Existing servers are never reused.

Global setup creates two accounts with profiles, a public station with exact public precision,
a private station, a device, a stream, a labelled fixture session, and 180 complete minutes ending
at the current minute boundary. Fixture data uses `@muonhub/data-provider` except the emulator-only
REST write that backdates `streamStation/{id}/since` to permit historical fixture minutes, matching
the agent rehearsal. Setup also enables the Auth emulator's email enumeration protection through
its local configuration endpoint. The emulator defaults to legacy HTTP 400 responses for unknown
reset addresses; the supported privacy setting gives uniform success responses, as documented in
[Google's email enumeration protection guide](https://docs.cloud.google.com/identity-platform/docs/admin/email-enumeration-protection).
This changes only the disposable emulator; no live project configuration is read or changed.
Providers close even if setup fails. Randomized fixture IDs allow repeated
runs without deleting other data. Test account credentials and IDs live only in ignored
`.state/seed.json` (mode 0600).

Each of the six flows runs in a fresh browser context in both Chromium projects: desktop
(1366×900) and phone (390×844, touch enabled), with one worker and no retries. Assertions use
accessible roles and the application's `t()` strings. Every test fails on any `console.error`
or uncaught page exception, including errors during sign-in and navigation.

| Flow | Evidence |
| --- | --- |
| Protected home | Exact signed-out redirect, return after sign-in, station and Owner role |
| Station | Device label, stream link using that label, members loaded without errors |
| Stream | Three visible chart canvases, 60.0 ± 0.6 counts/min, 180/1440 minutes (12.5%) coverage, fresh status, uncorrected notice |
| Public network | Signed-out station list, private station absent, visible map canvas and module worker |
| Private access | Second account gets the access error; private name, location and details absent |
| Password reset | Known and unknown addresses show the same confirmation |

The dashboard test fixes browser `Date` at 30 seconds after the fixture boundary so freshness does
not depend on runner speed; timers still run. The network test supplies a minimal, tile-free style
for OpenFreeMap's style request. It exercises the real MapLibre renderer and worker without an
internet dependency; it does not validate external tiles or their availability. Firebase requests
and responses are never mocked.

Failure screenshots and traces go to ignored `test-results/`; the HTML report goes to ignored
`playwright-report/`. CI uploads the report on failure. These artifacts can contain emulator-only
test credentials. Unit tests exclude `e2e/**`; lint and typecheck include its TypeScript files.

The work package limits changes to `apps/web` and CI, so milestone status, specs and the shared
changelog remain for integration on the M2 milestone branch.

## Browser finding: reset form hydration

The first run found that loading `/reset` directly left its submit button disabled. The static
export rendered with a null data provider, but the first browser render already had a provider;
React did not repair the mismatched disabled attribute. `DataProviderRoot` now starts with the same
null state and creates its browser provider after hydration. A ref prevents duplicate initialization
during StrictMode effect replay. The reset E2E flow and a server-render/hydration unit regression
cover this fix (spec 0088 FR3 and FR7).

## Validation record — 2026-11-06

- **[verified by running]** Node 24.22.2; local headless Chromium supplied through
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; `JAVA_TOOL_OPTIONS=-Xmx256m`.
- **[verified by running]** `cd apps/web && pnpm e2e`: exit 0, desktop **6 passed / 0 failed**,
  phone **6 passed / 0 failed** (12 total, no retries). The static build also succeeded and
  the test emulators shut down.
- **[verified by running]** `pnpm --filter @muonhub/web test`: **71 passed**, 10 files.
- **[verified by running]** `pnpm turbo run typecheck lint --concurrency=1`: **21 successful tasks**;
  warnings about the external shared cache being read-only did not affect the checks.
- **[verified by running]** `pnpm exec prettier --check .`: passed after archiving generated test
  state and reports under `apps/web/out/e2e-validation-artifacts/`. The root formatter reads only
  the root ignore files, so nested web Git ignores do not exclude generated JSON/HTML from its
  scan. After local E2E runs, archive or remove `.state/`, `test-results/` and `playwright-report/`
  before the repository-wide format check. Source files required no formatting corrections.
- **[reported]** Independent code/security review approved the suite, local emulator configuration
  and hydration fix; its lint finding was corrected and verified by the lint command above.
- **[verified by running]** Requested commits were attempted but blocked by the filesystem:
  `/home/alexamaze/MuonHub/.git/worktrees/muonhub-wp-e2e/index.lock` is outside the writable workspace
  on a read-only mount. All changes remain uncommitted on `wip/m2-e2e`; no push or merge was attempted.
- CI is configured but has not been run remotely; the work package prohibits pushing this branch.
