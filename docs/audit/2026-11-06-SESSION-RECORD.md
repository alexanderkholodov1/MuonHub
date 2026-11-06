# Session record — 2026-11-06

> Continues [`2026-10-04-SESSION-RECORD.md`](2026-10-04-SESSION-RECORD.md). Session held on the agent
> node Beacon by the agent dedicated to MuonHub, on the evening of 2026-11-05 in Ecuador
> (2026-11-06 UTC). No code changed; documentation and planning only.

## 1. The maintainer's words

| # | Words (verbatim) | Meaning |
|---|---|---|
| 1 | "quisiera que lo probemos integrar EN la v6, antes de sacar el release oficial" | Integrate the seismic channel and muography into v6, before the official `6.0.0` release, instead of 6.x. |
| 2 | "De todo lo que me dijiste, has todo lo que mas puedes tu solo. Si necesitas las llaves de acceso, estan en la laptop, no se como movertelas a Beacon sin una interfaz grafica." | Do everything possible without him; access keys are on his laptop if needed. |
| 3 | "1. Me gusta." | Approves the placement: M5 Seismic channel, M6 Muography, M7 Migration + launch. |
| 4 | "2. Existen, pero no sabremos esos datos a menos de tener acceso directo a la maquina del laboratorio - que crees, deberia conectarla a Tailscale con mi cuenta? Es posible que la conexion sea solo unidireccional, para que nadie obtenga acceso a mi computadora? Que pasa si uso otro correo, podre usar Tailscale PARA UNA RED y simultaneamente PARA LA OTRA?" | Both instruments exist; their details need access to the lab PC. Asks how to connect it to Tailscale safely (§6). |
| 5 | "3. Si, perfecto, e idealmente los datos deben comprobarse y no tener un error demasiado grande." | Accepts a software-only M6 on simulated data if the muograph is not ready, provided the results are verified within a bounded error. |
| 6 | "Configura Firebase tu mismo, crea el repo tu mismo." | The agent sets up Firebase (M1 step 8) and creates the test project `muonhub-dev` itself, instead of the maintainer following `FIREBASE-SETUP.md` by hand. |
| 7 | "Continua, ya estas en tmux y puedes trabajar tranquilo. "El ensayo de 72 horas simuladas dura unos 40 minutos reales" - no creo que es algo urgente que debes hacer, no entiendo tus prioridades, hay muchisimas otras cosas pendientes que constuir, todavia ni tenemos sistemas robustos para verificar la simiilutd con simulaciones. Avanza la construcicon de MuonHub por favor, lo que mas puedes. Dejo un capitan que te puede ayudar en cualquier cosa y mantenerte activo y trabajando lo que mas alcances" | Stop the simulated rehearsal; build MuonHub as far as possible overnight, with the Beacon captain's help. |
| 8 | "EL DETECTOR YA ESTA CORRIENDO EN https://munhub-lab.web.app/, mira y lee todo lo que necesitas, no tienes que simular nada para eso!!!!!!!! NO ALUCINES!!!!!!!! Y PARA QUE NECESITAS SUS DATOS!?!?!" | Use the detector that is already running (read what munhub-lab publishes) instead of simulating it. |

## 2. Decisions

| # | Decision | Where |
|---|---|---|
| 1 | **Seismic channel and muography before `6.0.0`** (maintainer), placed as **M5 Seismic channel** and **M6 Muography**; Migration + launch becomes **M7** (approved, words 3). The renumbering was applied in one pass across the roadmap, backlog (B-M5-xx → B-M7-xx), ADR-008, vision, specs 0083/0086/0087, the M1 plan and the operations documents. | [`ROADMAP.md`](../product/ROADMAP.md), [`BACKLOG.md`](../product/BACKLOG.md) (B-SE-01…07, B-MU-01…07), ADR-008, [`STATUS.md`](../STATUS.md) |
| 2 | **No AI attribution in commits or pull requests.** The maintainer's standing rule for all of his repositories (restated on 2026-11-05) replaces this repository's earlier rule that agent commits end with a `Co-Authored-By:` trailer. Existing history stays as it is. | `AGENTS.md` guardrails 1 and 10, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/process/WORKFLOW.md` §2 |
| 3 | **M6 software-only fallback:** if the muograph is not ready, M6 closes on simulated data whose planted values are recovered within an error declared before the run; the physical validation stays explicitly outstanding (words 5). | ROADMAP M6, BACKLOG M6 validation |
| 4 | **Firebase is set up by the agent** (words 6), through the maintainer's own Firebase CLI session on his laptop — the CLI login stays there and is never copied. The `FIREBASE-SETUP.md` steps that only the console can do are listed for him. | §7 |

## 3. State verified

- **M0** merged on 2026-10-04 (PR #57); `main` is at `99da243` **[verified]**. `docs/STATUS.md` on
  `main` still shows M0 as awaiting merge; the branch copy is current.
- **M1** (`feat/m1-core-agent`): last commit `68d93bc` on 2026-10-12 (step 7, `6.0.0-alpha.1.7`);
  its CI run is green in all three jobs — build/test/lint/typecheck, emulator tests, gitleaks
  **[verified]**. Steps 8–12 have not started; no work happened between 2026-10-12 and this session.
- **Local verification was not re-run on Beacon:** its system disk is 97 % full (≈ 1.4 GB free)
  **[verified by running]**, and a full install with the Firebase emulator could fill it and stop
  other work on the node. CI remains the referee for the branch head.
- **Keys:** the maintainer's laptop (reachable over SSH through Tailscale, so files can be moved
  without a graphical interface) holds service-account keys only for the v5 projects (`munhub-1`,
  `munra-1`) — none for `muonhub` **[verified, file names only]**. Steps 8 and 9 are console and
  on-site work and need no key file, so nothing was copied between machines. The `munra-1` cold dump
  needed for the v5 migration was located there (backlog open question 6; `ENVIRONMENTS.md`).
- **Security:** the follow-up on credentials exposed in the repository's history is tracked in a
  git-ignored note under `private/`, as required for security-sensitive details.

## 4. Review

**Physicist** — the repository's physicist persona, run independently on another vendor's model
(Codex, `gpt-6-astra`) over the roadmap and backlog additions. Verdict **WARNING**: seven MEDIUM
findings, none critical; no wrong formula or false claim. Each finding was checked against the
sources it cites and all seven were applied:

| # | Finding | Applied in |
|---|---|---|
| 1 | The expected open-sky distribution must be folded through the telescope's acceptance; cos²θ is the incident intensity, not the expected count histogram. | B-MU-04, ROADMAP |
| 2 | Transmission needs live-time and acceptance normalization, uncertainty from both exposures, sparse-count intervals; opacity is X = ∫ρ ds. | B-MU-05, ROADMAP |
| 3 | The muography validation needs quantitative criteria fixed in advance, an independently characterized target, and an honest software-only fallback. | Muography validation, ROADMAP |
| 4 | The seismic validation tests acquisition: features recomputed from samples by a versioned recipe, complete-minute coverage; no positive correlation is required. | Seismic validation, ROADMAP |
| 5 | The honesty protocol needs a defined null that breaks the tested association, calibrated false-positive rate, and nuisance terms treated as covariates with uncertainty. | B-SE-05 |
| 6 | Track building defines accepted hit patterns and verifies event-time accuracy; the pairwise accidental estimate does not cover all track backgrounds. | B-MU-03, earlier-milestone notes |
| 7 | "A volcano needs m² and months" is target- and geometry-dependent and must be calculated. | B-MU-01 |

## 5. Next

- **Maintainer:** Authentication in the console (§7); a yes or no on `muonhub-dev` (§8); Tailscale on
  the lab PC (§6); the private security follow-up.
- **Agent, without the maintainer:** `muonhub-dev` once confirmed (database created explicitly
  first); the step-11 validation
  tooling of spec 0087 ("Validation in practice": disruption scripts and the cloud-versus-local
  reconciliation check), which needs a machine with enough free disk for the install and the
  emulator (the laptop's WSL has it; Beacon does not).

## 6. Remote access to the lab PC — proposal (2026-11-06)

**Change to established behavior:** [`REMOTE-ACCESS.md`](../operations/REMOTE-ACCESS.md) §1 says to
sign in on the lab PC "with **the same account you will use on the laptop**", and §3 says "Do not
share the detector PC with other accounts." The proposal below replaces both; the document changes
once the maintainer agrees.

**Proposal:** a second, separate tailnet for the lab, created with another account (for example
the lab address), containing only the lab PC; the lab PC is then **shared** with the maintainer's
personal account.
- **One-way by default [verified, Tailscale docs kb/1084 "Sharing"]:** "Tailscale quarantines shared
  machines by default. A shared machine can receive incoming connections (from the other user's
  tailnet) but cannot start connections." The lab PC can never open a connection to his laptop,
  Beacon or any other of his devices, with no access-policy editing.
- **No need for two networks at once:** a device has only one active tailnet at a time and "is not
  able to transmit packets on multiple tailnets simultaneously" [verified, kb/1225 "Fast user
  switching"]. With sharing, his devices stay in his own tailnet and see the lab PC as one of their
  machines; only the lab PC lives in the lab tailnet.
- **All of his devices can reach it:** all of them (Beacon, the laptop and two others) are signed
  in as his user and untagged [verified by running `tailscale status` on Beacon], and a share is
  visible to the recipient user's devices; tagged machines could not use it [verified, kb/1084].
- **Others at the lab cannot join the lab tailnet unnoticed:** tailnets created since 2025-05-22
  require an administrator to approve each new user [verified, kb/1239 "User approval"].
- **SSH:** Tailscale SSH on the lab PC (no SSH port opened on the university network); the lab
  tailnet's policy needs one rule letting his personal user in, which reaches external invited users
  when the destination is shared with them [verified, kb/1193]. Key expiry disabled for the lab PC.
- **Alternative considered:** the lab PC in his own tailnet with a tag and an access policy that
  lets his devices reach it but gives it no outgoing rule. It works with one network, but it
  requires replacing the default allow-all policy that his fleet relies on today, and a mistake in
  that policy would expose his machines. Not recommended.
- **Cost:** sharing is available on all plans, including the free one [verified, kb/1084].
- University IT rules for remote-access software remain unknown (REMOTE-ACCESS.md §3).

## 7. Firebase set-up by the agent

- The Firebase CLI in the laptop's WSL Ubuntu (`firebase-tools` 15.4.0) still returns HTTP 401
  after the maintainer signed in again; the Windows CLI (`firebase-tools` 15.11.0, his account) works
  and sees `muonhub` **[verified by running]**. All work went through the Windows CLI over SSH; the
  login never left the laptop.
- **Done on `muonhub`** (state and evidence in [`ENVIRONMENTS.md`](../operations/ENVIRONMENTS.md)):
  web app `MuonHub web` registered; the v2 Firestore rules deployed, which enabled the Firestore API
  and **created the `(default)` database by itself** — it came out Standard, Native, `nam5`, the
  decided location, verified right after; delete protection then enabled; indexes and the RTDB rules
  deployed. All from a fresh clone of `25d7a84`, removed afterwards. Anonymous reads of both
  databases are denied **[verified by running]**.
- **Lesson:** a deploy must never be what creates a database — its location is permanent. For any
  new project the database is created explicitly first (recorded in `ENVIRONMENTS.md`).
- **Remaining:** Authentication (Email/Password for the agent's account in M1; Google for the web
  in M2) has no Firebase CLI command and is enabled in the console. `muonhub-dev` was not created:
  the maintainer asked what it is for (§8).

## 8. Why a test project (`muonhub-dev`)

M1 decision A (approved 2026-10-04) created it "so `muonhub` only ever receives real data". The
maintainer asked on 2026-11-06 what it is for; the answer given:
- **Real data only in `muonhub`:** step 10 and the 72-hour virtual detector of step 11 write
  synthetic data; in `muonhub` it would mix with the real detector's streams (ADR-006).
- **Free quotas are per project:** the step-10 test deliberately opens many simultaneous
  connections against the 100-connection limit, and the virtual detector writes for 72 hours; in
  `muonhub` that consumes the real project's monthly download and storage quota and distorts the
  measurement of the real detector's own usage.
- **What the emulator cannot do:** it does not enforce the 100-connection limit or report real
  bytes, so those measurements need a real project.
- **Later milestones:** rules and web deploys are tried there before `muonhub` (staging).
- **Cost:** none (another free Spark project; a different purpose, not load splitting).
- **Alternative:** use `muonhub` for the tests now and delete the synthetic data before launch —
  simpler today, but every later milestone would test against the production project.

## 9. The night's construction (M2 first increment, `6.0.0-alpha.2.1`)

- **What was built** (branch `feat/m2-web-platform`): the M2 plan (Proposed) and specs 0088–0090;
  `apps/web` with accounts, stations, devices, streams and sharing, and the stream dashboard;
  `apps/v5-mirror` and `infra/demo` — the demo on Beacon over Tailscale, fed every minute with the
  real minutes of the detector that is running (public v5 profile `leopard_test`, read-only).
- **How:** Codex (accounts, until its quota ran out) and Cursor (stations) built bounded pieces on
  their own worktrees from written briefs; the brigadista wrote the specs, the mirror, the demo and
  the dashboard, and verified and integrated every piece.
- **Evidence:** CI green on `1235f2c` (build, tests, lint, typecheck; emulator tests; gitleaks);
  web 65 tests; a headless-Chromium visit at 1366 px and 390 px — sign-in, home, station, stream —
  with no console errors; the emulator snapshot survives a restart (4 349 minutes before and after).
- **Found by using it, not by the tests:** another member's private profile made the members and
  transfer sections fail for the owner under the real rules (the in-memory provider does not apply
  them). Fixed in the UI with a regression test; the proper fix (a public profile projection) is an
  open question in `STATUS.md`.
- **Lessons:**
  - the agent corrupted a worker's worktree (`.git` file) while preparing it, so the worker could
    not commit — logged as an incident in the fleet records;
  - a script that hid its own error output (`>/dev/null`) delayed the diagnosis of the snapshot
    failure;
  - the simulated 72-hour rehearsal was the wrong priority for the night; it remains as opt-in
    tooling with its known gaps listed.

## 10. Close of the night (06:40Z)

- **Delivered on `feat/m2-web-platform`:** `6.0.0-alpha.2.3` — M2 steps 1–5 (foundation, accounts,
  stations and sharing, stream dashboard, network map) and the end-to-end part of step 7, with the
  physicist review of the dashboard applied. CI green on all four jobs (`9f34d97`, run
  42175147430), including the new `web · end-to-end` job (12 Playwright tests, desktop and phone).
- **Demo:** <http://100.120.140.56:8085/> serves build 2.4 (kept: 2.1, 2.2, 2.3); every build was
  promoted only after CI and a 1366/390 browser check. Guide and presentation script:
  [`DEMO.md`](../operations/DEMO.md).
- **Found by using the product, not by unit tests:** private profiles under the real rules (members),
  the MapLibre worker missing from the bundle and served with the wrong type, a time formatter that
  threw in browsers, and a hydration mismatch in the reset form (found by the new end-to-end suite).
  All fixed before reaching the demo.
- **Remaining M2 work waits on the maintainer:** plan approval; Authentication in the console;
  `muonhub-dev`; the public-profile and map-tile decisions; a design session for the public site
  (step 6); App Check (console); deployment (step 8, his go-ahead); validation with the real
  detector through the v6 agent (needs the lab PC, M1 step 9).

## 11. Morning (08:30–09:20Z): the captain's three items

The captain of Beacon reopened the night at 08:30Z with the maintainer's words for it ("asegúrate
de que haga todo lo que pueda") and three items that need no decision from him.

- **Presentation fallback.** `apps/web/scripts/record-demo.mjs` walks the five-minute script of
  [`DEMO.md`](../operations/DEMO.md) against the served demo (it only opens pages and clicks):
  screenshots of each stop at 1366 and 390 px, a walk-through video and an `index.html` that opens
  offline. Recorded from build 2.4 at 08:28Z, and again from build 2.5 at 09:07Z
  (`~/.cache/muonhub-demo/presentation/`, with a tarball to copy; no console errors; the real
  detector's last minute shown).
- **Accessibility pass (M2 step 7), `6.0.0-alpha.2.4`.** axe (WCAG 2.2 A/AA plus best practices)
  now runs in the end-to-end suite on every page, in both themes and both viewports, with keyboard,
  reduced-motion and theme-before-hydration tests (27 end-to-end tests). Fixed: contrast of the
  light accent and of muted text in both themes, utility transitions under reduced motion, a skip
  link, an h1 in loading and error states, text alternatives for the charts, a dark flash for
  light-theme visitors, and coverage that rounded 1439 of 1440 minutes up to 100.0 %.
- **A real bug found by the pass:** the new-device page answered "You do not have access to this"
  to the station owner, on the demo too. The device-type list was an unconstrained query, which the
  rules deny to every non-admin (rules are not filters). Fixed in the data provider; an emulator
  test fails without the fix (`permission-denied`) and passes with it, and an end-to-end test opens
  the form.
- **CI and demo.** CI green on all four jobs at `b50a6ad` (run 42190789928). The new build was
  checked in a browser at 1366 and 390 px against the demo emulators on a side port (no console
  errors; the device form lists the three built-in types), then promoted as **build 2.5**; 2.1–2.4
  are kept.
- **A ready answer for the member-name question.** Branch `feat/m2-public-profile` (from the M2
  branch; not merged into it, not served, rules not deployed) adds `publicProfiles/{uid}` — display
  name and username, never the email — with rules tests including negatives. An independent security
  review (agy, WARNING, no critical or high finding) reported four findings; each was checked
  against the code: three applied (a rename could leave a stale projection advertising a released
  username; the memory provider lacked the ownership check; missing negatives), one not needed. If
  the maintainer says yes, the branch is merged; otherwise it is deleted.
- **Not done, on purpose:** no `muonhub-dev`, no Firebase or console change, no deployment, no
  Codex. App Check stays for the console.
