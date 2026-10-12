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

- Configuration lives in `infra/firebase/`: `firebase.json` (Auth, Cloud Firestore, and Realtime
  Database emulators on ports 9099 / 8080 / 9000, single-project mode), the security rules
  (`firestore.rules`, `database.rules.json`), the Firestore indexes (`firestore.indexes.json`), and
  `.firebaserc` (default project `muonhub`).
- Tests run against the demo project **`demo-muonhub`**: the `demo-` prefix guarantees no real
  project is contacted.
- The emulators are Java applications and need **Java 21**. CI provides it (job
  "data-provider · emulator tests"); locally, a portable JDK 21 works.
- Command: `pnpm --filter @muonhub/data-provider test:emulator` (starts
  `--only auth,firestore,database`). It runs the security-rules v2 matrix
  (`packages/data-provider/src/rules-v2/`, spec 0084) and the v2 data-layer tests.
- Cloud Storage is not part of the architecture (ADR-005): its
  emulator and rules were removed.

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
- **Nothing has been deployed to `muonhub` yet.** The security rules v2 (spec 0084) exist in
  `infra/firebase/` and are tested in the emulator; their first deploy is M1 plan step 8.
- **Deploy procedure (rules and indexes)** — only with the maintainer's explicit go-ahead, and only
  after the emulator matrix is green on the exact commit being deployed:
  1. `pnpm --filter @muonhub/data-provider test:emulator` passes (and CI is green).
  2. From `infra/firebase/` (never from the repository root):
     `firebase deploy --only firestore:rules,firestore:indexes,database --project muonhub`.
     Cloud Firestore must exist first (location `nam5`, see [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md)).
  3. Record the commit hash and date in the session record under `docs/audit/`.
  4. Probe the denials from a second account and an anonymous client (spec 0084, "Validation in
     practice").
- **First admin (trusted script):** admins are documents `admins/{uid}` = `{uid, addedBy, addedAt}`
  that only existing admins can write. The first one is created once with the Firebase Admin SDK
  (which bypasses the rules), run by the maintainer on the development machine with the
  `muonhub` service-account key from `private/` — never on an agent machine and never committed:

  ```js
  // node first-admin.mjs <uid>   (GOOGLE_APPLICATION_CREDENTIALS=private/<muonhub key>.json)
  import { initializeApp, applicationDefault } from "firebase-admin/app";
  import { getFirestore } from "firebase-admin/firestore";
  const uid = process.argv[2];
  initializeApp({ credential: applicationDefault(), projectId: "muonhub" });
  await getFirestore().doc(`admins/${uid}`).create({ uid, addedBy: uid, addedAt: Date.now() });
  ```

  `create()` fails if the entry already exists. Further admins are added by admins from the admin
  area; the rules never trust a role field a user can write (ADR-009 rule 4).

## Staging — open question

How v6 is tested before production is decided in the **M1 plan**. Options: a dedicated Firebase
project, or Hosting preview channels plus the emulator. Note that an extra Hosting site inside
`muonhub` would still use the **production databases**, so it is not a real staging environment.

## Machines

| Machine | Facts |
|---|---|
| Development laptop | Windows + WSL2 (Ubuntu). Node **24 LTS** (`.nvmrc`, `engines`) with pnpm 11.28 pinned in `packageManager`; shared tool versions come from the pnpm catalog in `pnpm-workspace.yaml`. GitHub CLI 2.102 from the official repository, authenticated; git uses SSH and the `origin` remote has the SSH URL. No PowerShell or Rust; Java only for the emulator. |
| University detector PC | Ubuntu. Currently runs the v5 reader for the CosmicWatch (whether Chrome Web Serial or the Python bridge is unknown). No Tailscale yet — the maintainer installs it on site; see [`REMOTE-ACCESS.md`](REMOTE-ACCESS.md). |
