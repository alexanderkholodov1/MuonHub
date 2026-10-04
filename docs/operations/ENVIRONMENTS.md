# Environments and projects

> Where MuonHub runs, what each Firebase project is for, and the rules for touching it.
> State as of the read-only inspection of **2026-10-02** (authorised by the maintainer) unless a
> line says otherwise. Labels: **[verified]** = checked first-hand; **[reported]** = from earlier
> planning documents, not re-checked.

## Firebase projects

| Project | Role | Status |
|---|---|---|
| `muonhub` | **All of v6** — databases, authentication, hosting | Clean slate, being prepared |
| `munhub-1` | **v5 production** (`munhub-lab.web.app`) | Live, **frozen** |
| `munra-1` | Legacy v5 project (the original database) | Retired |

MuonHub runs on the **Firebase free tier (Spark) only**, indefinitely: no billing account, no paid
services, no other cloud providers. If any console screen asks for a billing account or an upgrade to
the Blaze plan, stop and tell the Adjutant.

### `muonhub` — v6

| Resource | State (2026-10-02) |
|---|---|
| Realtime Database | Default instance `muonhub-default-rtdb`, region `us-central1`, URL `https://muonhub-default-rtdb.firebaseio.com/`, **empty** **[verified]** |
| Hosting | Default site `muonhub` → `https://muonhub.web.app` **[verified]**; nothing deployed by v6 yet |
| Cloud Firestore | **Not created** (API not enabled) **[verified]**. Location decided: **`nam5`** (United States, multi-region) — permanent once created |
| Authentication | **Not initialised** **[verified]** |
| Web app registration | **None registered** **[verified]** |
| App Check, Cloud Messaging, Remote Config, Analytics | Not configured |

Setting these up is done by the maintainer in the Firebase console at the start of M1 — see
[`FIREBASE-SETUP.md`](FIREBASE-SETUP.md). Cloud Storage, Cloud Functions, App Hosting, and
Extensions require the Blaze plan and are **not** part of the architecture.

### `munhub-1` — v5 production (frozen)

- Serves `munhub-lab.web.app`, deployed from the **`v5-production`** branch **[verified]**.
- A real detector is writing to it. **v5 is not modified** — not its code, rules, data, or
  deployment — while the detector runs (maintainer decision, 2026-10-02).
- Access from v6 work is **read-only** and only with the maintainer's explicit authorisation.
  Structure at inspection time: root nodes `profiles` (10) and `users` (5); 7 Auth accounts
  **[verified]**. Session/minute volume has not been measured yet.
- Known v5 issues found during the audit are recorded in a private, git-ignored note under
  `private/`. They are addressed by v6, not by patching v5.
- v5 → v6 data migration belongs to milestone M5.

### `munra-1` — legacy v5 project

- The original v5 database, which filled the free-tier limit **[reported]**.
- Its cold JSON dump is **not** on the development machine, and its service account is not in
  `private/` **[verified]**. Both are needed only for the M5 migration.

## Local emulator (tests)

- Configuration lives in `infra/firebase/`: `firebase.json` (Realtime Database, Auth, and Storage
  emulators on ports 9000 / 9099 / 9199, single-project mode), the database and storage rules, and
  `.firebaserc` (default project `muonhub`).
- Tests run against the demo project **`demo-muonhub`**: the `demo-` prefix guarantees no real
  project is contacted.
- The emulator is a Java application and needs **Java 21**. CI provides it (job
  "data-provider · emulator tests"); locally, a portable JDK 21 works.
- Command: `pnpm --filter @muonhub/data-provider test:emulator`.
- **Known issue [verified]:** the test "keeps realtime storage capped to the newest records" takes
  ~12 s in CI and exceeds its 20 s timeout on slower machines. The cause is the realtime-pruning
  design recorded in the 2026-10-02 audit; that code is replaced in M1.
- The Storage emulator and rules are first-attempt leftovers: Cloud Storage is not available on
  Spark, and the M1 rebuild removes blob storage.

## Keys and secrets

- Service-account keys for `muonhub` and `munhub-1` live in **`private/`**, which is git-ignored.
  Never commit them, print them, or paste them into a chat.
- Sensitive operational notes also live in `private/` (never in the public repository).
- Web configuration values (API key, project ID, app ID) are **public by design** — they ship to the
  browser and are protected by security rules and App Check. They go into `NEXT_PUBLIC_FIREBASE_*`
  environment variables (see `.env.example`), never into code.
- CI secrets (for example a least-privilege service account for deploys or scheduled jobs) are added
  later, when a milestone needs them, with the maintainer.
- gitleaks scans every pull request.

## Deployment

- **No deploy workflow exists yet.** The previous automatic deploy from `main` was removed; v6
  deployment is designed in the M1/M2 plans.
- **Do not run `firebase deploy` until the M1 rules exist.** `infra/firebase/.firebaserc` defaults to
  the live `muonhub` project, and the rules currently in `infra/firebase/` are the first-attempt set
  with known security holes (no field validation, editor takeover, self-assigned roles — see the
  audit record). A deploy from `infra/firebase/` would publish them. The root-level v5 Firebase files
  were removed in M0, so a deploy from the repository root no longer targets anything.

## Staging — open question

How v6 is tested before production is decided in the **M1 plan**. Options: a dedicated Firebase
project, or Hosting preview channels plus the emulator. Note that an extra Hosting site inside
`muonhub` would still use the **production databases**, so it is not a real staging environment.

## Machines

| Machine | Facts |
|---|---|
| Development laptop | Windows + WSL2 (Ubuntu). Node **24 LTS** (`.nvmrc`, `engines`) with pnpm 11.28 pinned in `packageManager`; shared tool versions come from the pnpm catalog in `pnpm-workspace.yaml`. GitHub CLI 2.102 from the official repository, authenticated; git uses SSH and the `origin` remote has the SSH URL. No PowerShell or Rust; Java only for the emulator. |
| University detector PC | Ubuntu. Currently runs the v5 reader for the CosmicWatch (whether Chrome Web Serial or the Python bridge is unknown). No Tailscale yet — the maintainer installs it on site; see [`REMOTE-ACCESS.md`](REMOTE-ACCESS.md). |
