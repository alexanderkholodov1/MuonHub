# ADR-005 — Firebase-only architecture and free-tier budget

- **Status:** Accepted, except §6 (public live demo), which is **Proposed — pending maintainer
  approval and M1 measurements**
- **Date:** 2026-10-03
- **Supersedes:** D2, D3, D37. **Amends:** D4, D10, D18. **Retires:** D16. **Amends:** ADR-003.

## Context

The maintainer decided on 2026-10-02:

- v6 is deployed on a **new Firebase project, `muonhub`**.
- v5 stays on `munhub-1` (`munhub-lab.web.app`, branch `v5-production`) and is not modified.
- MuonHub stays on the **Firebase free (Spark) plan indefinitely**.
- No Red Clara in the foreseeable future, no Cloudflare, no paid services.

**State of `muonhub`** (read-only inspection, 2026-10-02):
- Realtime Database (RTDB): the default instance `muonhub-default-rtdb` is active in `us-central1`
  and empty.
- Hosting: the site `muonhub` exists.
- Not yet set up: no web app is registered, Firestore is not created, and Authentication is not
  initialised.

**What the Spark plan offers** (official docs, 2026):

| Status on Spark | Products |
|---|---|
| Available | RTDB, Firestore, Hosting, Authentication, App Check, Cloud Messaging (FCM), Remote Config, Analytics, AI Logic |
| Not available | **Cloud Storage** (Blaze required since 2026-02-03), **Cloud Functions**, App Hosting, Extensions |
| Trial only | Data Connect |
| Blaze only | **Automated RTDB backups** (<https://firebase.google.com/docs/database/backups>) |

## Decision

### 1. One project, one plan
All of v6 runs on project `muonhub`, on the Spark plan:

- **RTDB** (`us-central1`).
- **Firestore**, location **`nam5`** (confirmed by the maintainer; irreversible; not created yet).
- **Authentication.**
- **Hosting:** `muonhub.web.app`, serving the Next.js static export.
- **App Check, FCM, Remote Config.**
- **Analytics:** optional, and only with a privacy notice.

The maintainer configures these services himself in the Firebase console, to learn how they work.
The setup guide lives in `docs/operations/`.

### 2. Split between the two databases (high level; the detailed model is an M1 spec)

| Store | Holds |
|---|---|
| **RTDB** | High-rate data: per-minute series and live windows |
| **Firestore** | Metadata and documents queried by fields: stations, devices, device types, calibrations, summaries, notifications, audit log |

Per-minute records do not go to Firestore: at 1,440 writes per day per stream, 14 streams
(20,160 writes) would already exceed the 20,000 writes/day.

### 3. No server compute, no object storage
- **Periodic jobs** run as **GitHub Actions scheduled workflows** and in the agent. *(The job list
  below is the proposal presented on 2026-10-02; it is confirmed when M4 is planned.)*
  - backups;
  - device-silence alerts;
  - realtime pruning;
  - external data ingestion;
  - admin role assignment;
  - usage measurement.
- **Backups:** Spark has no automatic backups, so layer 3 of the redundancy design (D10) is a
  **private backup repository**. It holds encrypted backup files and accepts writes only from a
  token restricted to that repository. Approved; built in M4.
- **Raw data:** individual events and the full raw stream stay in the agent's local store
  (ADR-006).

### 4. The free-tier budget is a design constraint

| Resource (Spark) | Limit | Design rule |
|---|---|---|
| RTDB simultaneous connections | 100 for the whole database, one instance | Every browser with a live listener and every agent uses one. *(Proposed, §6:)* anonymous visitors do not hold live listeners; listeners close when the tab is hidden. |
| RTDB storage | 1 GB | About 50 MB per stream-year of per-minute records (estimate). Every materialised view costs about the same. Old data is archived (backups; Zenodo for publication). |
| RTDB download | 10 GB/month | Long ranges read hourly/daily rollups. Clients fetch only new data, never a full series again. |
| Firestore | 1 GiB stored; 50k reads, 20k writes, 20k deletes per day; 10 GiB/month egress | Public pages read one aggregated document per visit. |
| Hosting | 10 GB stored; about 360 MB/day transfer | Lean bundles (uPlot instead of Plotly by default), lazy loading, long cache lifetimes. |
| Authentication | 50k monthly active users; email verification 1,000/day; password reset 150/day; email-link sign-in 5/day | Email/password and Google sign-in; no email-link sign-in. |
| App Check (reCAPTCHA Enterprise) | 10k assessments/month | Protects both databases from abuse of the quotas. *(Proposed:)* a long token lifetime to save assessments. |

A **usage monitor** in the admin area shows daily consumption and the remaining runway.

### 5. No load balancing across projects (rejected)
Spreading load over other Firebase projects (e.g. `munra-1`, `munhub-1`) to gain connections or
quota is **not allowed**:

- Google Cloud Terms of Service §3.3 (Restrictions), item (iii), forbid using the services "in a manner intended to avoid
  incurring Fees (including creating multiple Customer Applications, Accounts, or Projects to
  simulate or act as a single Customer Application, Account, or Project (respectively)) or to
  circumvent Service-specific usage limits or quotas" (<https://cloud.google.com/terms>).
- Google APIs Terms of Service §2.d: "You agree to, and will not attempt to circumvent, such
  limitations" (<https://developers.google.com/terms>).
- The risk is suspension of the projects or the account, which would take down all of MuonHub.

**What remains legitimate:**
- Using a *different product* of the same project for what it suits best, e.g. Firestore next to
  RTDB.
- Using an old project for a *different purpose*. Example: a separate testing environment once v5
  is retired. That idea will be proposed when M1 is planned; it is not decided.

### 6. Public live demo — Proposed (pending maintainer approval and M1 measurements)

**Requirement (maintainer):** anonymous visitors can see live data from **public** streams, on the
landing page and on a dedicated live page. It may be limited in some way.

**Proposed approach:**
- **Showcase window:** for public streams only, the agent writes a compact window of the last
  ~10 minutes to a dedicated showcase location. It contains only fields that are safe to publish
  (time, amplitude). Security rules allow anonymous reads there and nowhere else.
- **Anonymous visitors:** while the page is visible, the browser asks every ~5 s, with a short
  request, only for what is new since its last request. It holds no live connection and stops when
  the tab is hidden. Received events are replayed smoothly, so the chart stays continuous.
  - Estimated cost: about 0.7 MB per visitor-hour (an estimate; to be measured).
- **Signed-in owners:** live listeners, closed when the tab is hidden.
- **App Check** protects both paths.

**Open question, measured in M1 before anything is built on it:** whether short REST requests
count toward the 100-connection limit. The documentation defines a connection as "one mobile
device, browser tab, or server app connected to the database" and does not say how short REST
requests are counted.

**Fallback:** a showcase window in Firestore. It has no connection limit, but every request costs
one of the 50k daily reads.

**Rejected:** serving the window as static files from Hosting. Hosting publishes files through
deploys and is unsuited to data that changes every few seconds.

## Consequences

- **Architecture:** no part of v6 may depend on Cloud Storage, Cloud Functions, Blaze-only
  features, or another vendor's storage.
- **First-attempt code:** the signal-blob storage of spec 0077 (Cloud Storage) is removed from the
  provider contract in M1.
- **Data model:** the M1 model separates RTDB paths from Firestore collections. The `DataProvider`
  boundary stays (D4); backend SDKs are used only inside the data-provider package.
- **Quota decisions:** every feature that reads or writes cloud data states its expected quota
  cost in its spec.
- **Backups:** depend on the M4 private repository; until then, the agent's local store is the
  only copy of raw data.

## Alternatives considered

- **Blaze plan with budget alerts:** rejected. The maintainer requires free services only, and a
  Blaze budget is an alert, not a hard cap.
- **Red Clara / self-hosted Supabase (Phase B):** retired.
- **Cloudflare R2/D1 or Turso federation:** rejected. No Cloudflare, and pooling free tiers across
  accounts conflicts with §5.
- **Firestore for all data:** rejected. The per-minute write rate exceeds the daily write quota.
