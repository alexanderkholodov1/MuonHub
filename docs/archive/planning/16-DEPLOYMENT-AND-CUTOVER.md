# MunHub Lab v6.0 — Repository Deployment and Cutover (GATED — do not execute without approval)

> ⚠️ **None of this is executed until Alexander explicitly approves it.** This document records
> the actual deployment state and the safe sequence for: transitioning the deployment of `munra-1`
> (old) to `munhub-1` (new) from `main`, fixing the database bug, redirecting the old domain,
> and cleaning up branches. Alexander is not a Git expert — everything here is explained and
> reversible.

---

## 1. Current state (verified in the repo)

- **Branches:**
  - `main` — currently triggers the automatic deployment of **munra-1** (old config).
  - `feature-spec-driven-development` — deploys **munhub-1.web.app** (but uses the **munra-1
    database** — bug).
  - `architectural-redesign-v6` — current branch containing the entire v6 plan (this one).
- **`.firebaserc`** (on this branch): `default = munhub-1`, `munra = munra-1`, `munhub = munhub-1`.
- **Workflow `.github/workflows/firebase-deploy.yml`:** on push to `main`/`master` runs
  `firebase deploy --only hosting` and `--only database` to the **default project**, with
  `secrets.FIREBASE_TOKEN`. PRs deploy a preview to a channel.
- **`config.js`:** `databaseURL` → `munhub-1-default-rtdb`, **but `apiKey`/`senderId`/`appId`
  are placeholders** `REPLACE_WITH_MUNHUB1_*` → the app does not actually connect to munhub-1 yet.
- **Hosting site:** no `site` field in `firebase.json` → deploys to the default site of the
  project (`munhub-1.web.app`). To serve on **`munhub-lab.web.app`** a **site `munhub-lab` inside
  the munhub-1 project** is required + pointing the deploy to that site (target/`site`).

## 2. Target state

- `main` is the **only** deployment branch, and deploys to **munhub-1** (project + DB + hosting).
- The served app uses the **munhub-1 database** (not munra-1). Bug resolved.
- **`munra-1.web.app` redirects** automatically to **`munhub-lab.web.app`**.
- Branch `feature-spec-driven-development` **deleted** after the merge.
- Secrets (FIREBASE_TOKEN or, preferably, service account) with access to munhub-1.

## 3. Bug to fix: munhub-1 using the munra-1 database — ✅ FIXED (working tree)

Root cause: `config.js` had placeholder keys and an incorrect `storageBucket`. **Done:** the
**real web keys for munhub-1** have been set (obtained via the Firebase Management API with the
service account): `apiKey`, `messagingSenderId`, `appId`, and `storageBucket` corrected to
`munhub-1.firebasestorage.app`. `databaseURL` was already pointing to `munhub-1-default-rtdb`.
(The web apiKey is public.) **Pending:** Alexander commits this change; when munhub-1 is deployed
from `main`, the app will use its own database.

## 4. Cutover sequence (when approved; reversible)

> Pre-requisite: have the **real web keys for munhub-1** (pending A2/setup).

1. **Backup first (BLOCKED — Alexander's action):** `munra-1` is **disabled by quota** (R1
   confirmed) → first **temporarily enable Blaze with a low budget on munra-1**, export the v5
   historical data (Console *Export JSON*), save a cold dump, then revert to Spark.
   **Do not advance the data cutover without this backup.**
2. **Fix config**: ✅ DONE (real munhub-1 keys in `config.js`). Remaining: verify in a deploy
   preview (PR channel) that the app reads/writes the **munhub-1 database**.
3. **Hosting site `munhub-lab`**: create the `munhub-lab` site in the munhub-1 project and
   configure the target/`site` in `firebase.json` to deploy there (→ `munhub-lab.web.app`).
4. **Merge** `architectural-redesign-v6` → `main` (when the plan/work is ready). From this point,
   a push to `main` deploys to **munhub-1** (default), not munra-1. This **effectively pauses**
   the munra-1 deployment from main.
5. **Old domain redirect**: deploy to **munra-1** a minimal hosting config with a **catch-all
   redirect** to `https://munhub-lab.web.app` (`redirects` rule in its `firebase.json`, 301).
   One-time operation; munra-1 remains only as a redirector.
6. **Clean up branches**: delete `feature-spec-driven-development` (and confirm that no other
   automation deploys munra-1).
7. **CI secret**: confirm that the `FIREBASE_TOKEN`/service account has access to munhub-1;
   `firebase deploy` (token) is **being deprecated** → prefer **service account**
   (`FIREBASE_SERVICE_ACCOUNT`) + `w9jds/firebase-action` or `firebase deploy` with
   `GOOGLE_APPLICATION_CREDENTIALS`. (Improvement to be made in EPIC-0/S02.)

## 5. Rollback
- While `feature-spec-driven-development` has not been deleted and munra-1 has not been modified,
  everything is reversible: if something fails, revert the merge on `main` and re-deploy the
  previous branch.
- The cold dump from step 1 guarantees no data is lost.

## 6. Relationship to the plan
- This fits into **EPIC-0 (S02 CI/CD)** + **EPIC-2 (S07/S08 munra-1→munhub-1 migration)**.
- ⚠️ **GATE:** Alexander approves before touching branches, deployments, or domains. Setting up
  **GitHub Project/Issues/milestones** also awaits his approval (after the plan is closed).
