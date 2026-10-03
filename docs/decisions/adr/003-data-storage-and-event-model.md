# ADR-003 — Data storage tiers, event model, and dynamic capacity

- **Status:** accepted (2026-06-14)
- **Context owners:** Adjutant + maintainer (design dialogue 2026-06-14)
- **Supersedes/extends:** the minute-record model in `planning/02-DATA-MODEL.md`; informs the
  migration (`planning/16`), admin console (`planning/15`), notifications (`planning/12`),
  monetization (`planning/13`).

## Context

The legacy `munra-1` Realtime DB hit Firebase's 1 GB cap and broke. Measuring the cold dump showed
the cause precisely: **the science (per-minute records) is ~6.5 MB**; **~99 % was per-event
"realtime" data stored as individual DB nodes and never purged** (the v5 purge was browser-side and
only for the currently-open profile, so unattended detectors grew unbounded). The fix is not "store
less science" — it is a deliberate **storage model** that (a) never loses scientific quality,
(b) makes raw retention affordable, and (c) lets capacity grow across free providers/accounts.

The detector console emits one line per trigger:
`Event# TimeStamp[ms] ADC1 ADC2 SiPM[mV] Pressure[Pa] Temp[C] DeadTime[us] Coincident COSMIC`.
A single SiPM cannot classify particles (foundation §5); the **amplitude (SiPM mV) spectrum** is the
rich observable (§6); real **signals** are triggers above the per-detector **noise floor** (§6
sub-threshold cut).

## Decision

### 1. Retention is a set of independent, per-detector axes (not 4 fixed presets)
Configured per detector at creation (with a **"Recommended"** preset + info tooltips), changeable
later. Changing a retention setting **closes the current session and opens a new one** so every
session is homogeneous.

| Axis | States | Notes |
|---|---|---|
| **Minute summaries** | on (default) | count of signals + stats + coarse amplitude (sm/sx/sn) + corrections inputs. Always on unless realtime-only. |
| **Individual signals** | on / off | the **complete record of each above-noise signal** (ts, SiPM mV, ADC1/2, coincident, deadtime, T, P) — the real signal, never the noise. Stored as compressed **blobs per interval**, not per-event DB nodes. |
| **Realtime live** | none / local-only / cloud-volatile | local-only = the agent shows the live 1m/5m view on this machine, nothing uploaded. cloud-volatile = uploaded for worldwide live view, **server/agent-side expiry after 5 min** (never browser-side). |
| **Complete (raw)** | off / on + auto-stop | every console line **as received, including sub-threshold noise**. Heaviest. Ships with a recommended bounded recording window (e.g. auto-stop after 1 h), configurable. Stored as compressed blobs. |

**Recommended default:** minute summaries + realtime **local-only** + individual signals **on**,
complete **off**.

### 2. Science is always computed (EventSummary), independent of retention
Regardless of tier (except realtime-only), the agent computes — at the **edge** — and uploads an
**`EventSummary` per fixed configurable interval (default hourly)**, tagged with the session it falls
in: the **amplitude histogram (Landau)**, fitted **MPV**, signal count, above-threshold count,
high-amplitude **tail** count, and **coincidence** count. ~KB. So no tier loses the spectrum; a
month-long session yields many consistent hourly summaries (a per-session summary would be
meaningless given variable session length).

### 3. Signals are above the auto-calibrated noise floor (per detector, versioned)
The agent measures each detector's sub-threshold noise/dark-count distribution and sets the
**noise threshold automatically** (e.g. N·σ above the dark-count peak), **re-calibrating
periodically** (temperature/location drift). The threshold lives in the detector `Calibration`
(`triggerAdcMin`) and is **manually overridable**. Its **versioned history** (timestamped value +
method) is kept so any data window knows which threshold was active — scientific reproducibility.

### 4. Clock correctness (the legacy 3-minute-skew problem)
The machine clock can be wrong (legacy kept 8 not 5 min of realtime to mask a skewed clock). The
agent **syncs to NTP** on connect and periodically, measures `clockOffset = trueTime − machineTime`,
**stores the machine ts + the offset** in session provenance (auditable, reversible → true UTC
reconstructable), and **warns the user** if the offset exceeds a threshold. Correct timestamps are a
prerequisite for future multi-station coincidence science (§7/§14).

### 5. Provenance lives on the session, not per datum
Since a session cannot change type, the **tier, agent version, and a calibration snapshot ref** are
stored **once in the session metadata** — zero per-record overhead. The noise threshold keeps its
own versioned history (it can drift within a session). Per minute: gaps are missing keys; partial
minutes are discarded (v5 behavior).

### 6. Storage layout: hot DB + object-storage blobs + cold archive
- **Firebase RTDB (munhub-1):** metadata-adjacent live data + minute series (slim, ADR follows
  spec 0074) + cloud-volatile realtime.
- **Firestore:** queryable documents — metadata, `EventSummary` documents, calibration history.
- **Cloud Storage (5 GB free):** **compressed blobs** for individual signals and complete-raw,
  per interval/minute — the fix that makes raw affordable (the 1 GB → ~130 MB of blobs).
- **Cold archive (Cloudflare R2, 10 GB free):** complete-raw blobs aged out of their retention
  window are **archived compressed** (restorable), not deleted. **Volatile realtime is deleted**
  (the user accepted that when choosing volatile).

### 7. Dynamic, thin-provisioned capacity (admin-managed)
Per-detector quota is **chosen at creation within an admin-set min..max** (a simplified/volatile
station need not reserve 100 MB) and is a **promise, not a reservation** — the DB keeps using
unfilled promised space. Default cap 100 MB/detector + a per-account cap (sum); more via a **ticket**
request. The **admin console** shows **promised vs real free capacity** and runs **admit-control**:
when real headroom drops below a threshold it stops accepting new detectors/Complete and signals the
**federation** as the relief valve (avoids a "bank run"). A deterministic **placement controller**
(rules, not ML) assigns detectors to backends and predicts **runway** (free ÷ write-rate → days/
months); ML may later *advise* but never *decide*.

### 8. Federation is a future-scale layer, not an emergency
A `FederatedDataProvider` (same interface) holds a registry of backends (Firebase, Turso, Cloudflare
D1/R2, …) + a per-detector placement table; multiple providers AND accounts/orgs sum free tiers →
effectively unbounded. Firebase (RTDB + Firestore + Storage) suffices for the current stage; Turso
credentials are ready in `private/`.

### 9. Space management & monetization
Users can review sessions (tier, size per station), **convert complete→simplified** (recomputing
minutes from raw) with a before/after size and a **safety confirmation**; the original may
**optionally** be kept 30 days in a **trash that does not count against their quota** (restorable).
Monetization (extra storage; some future ML features) is **deferred, need-driven, non-invasive** —
everything free now.

## Consequences
- The agent (edge) computes minutes, EventSummary, above-noise signals, and clock offset locally,
  and is the source of truth (its SQLite backup can backfill the cloud). Tiers are pure cloud
  retention policy.
- No tier sacrifices science; raw is affordable via blobs; capacity scales by adding accounts.
- New contracts in `@munhub/shared` (this is spec 0075): `StorageTierConfig`, `SignalRecord`,
  `EventSummary`, noise `Calibration` + history, session provenance, `StorageQuota`.

## Roadmap (derived)
0075 schema contract (next) → agent EventSummary + noise auto-calibration + clock sync → blob
storage (signals/raw) in provider → admin storage console + placement/admit-control + runway →
capacity notifications → cold archive (R2) → migration (slim minutes + spectrum recovery from legacy
realtime + metadata-absence prompts) → federation backends (Turso/D1) as scale demands.
