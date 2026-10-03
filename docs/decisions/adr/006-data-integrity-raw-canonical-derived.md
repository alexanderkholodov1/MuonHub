# ADR-006 — Data integrity: raw, canonical, derived

- **Status:** Accepted
- **Date:** 2026-10-03 (principle stated by the maintainer on 2026-10-02)
- **Amends:** ADR-003 §3 (auto-calibrated noise floor) and the data-integrity guardrail in `AGENTS.md`

## Context

The first v6 attempt classified events against an automatically calibrated noise threshold *at
the source*. Events under the threshold were never stored as individual signals. Run on realistic
inputs, it classified almost all real events as noise. Discarded at ingest, those events are lost
for good.

The old guardrail ("no event filtering") was also too blunt. It reads as if filtering itself were
forbidden, when filtering, calibration, and classification are central to the science.

The maintainer's principle, in his words (translated from Spanish):

> "It is not forbidden to filter, calibrate, discern, classify — all of this is important — BUT IT
> IS FORBIDDEN TO OVERWRITE THE DATA AND STORE IT IN AN ALTERED FORM AFTER THE FILTERING. You can
> apply filtering on data that is already stored — there you can do whatever you want — but you
> cannot alter it and store it as if it were pure (or at least that must be a special setting,
> which would be even better, so that there is an option to apply a filter BUT ONLY IF YOU WANT IT
> AND ARE AWARE OF THE ALTERATIONS, AND YOU YOURSELF CAN DEFINE THE CALIBRATION YOU NEED). In
> fact, that leads to a good option to have: duplicating the same data coming from ONE detector
> across multiple profiles, where one profile could be pure and another altered and filtered, and
> you can compare them."

On cloud storage of raw data, he decided:

- Realtime (individual events for the live view) is ephemeral and not stored.
- The stored cloud data is the per-minute record.
- **Uploading the complete raw stream** must exist as an option, **gated by admin authorisation**,
  because it uses a lot of space.
- **Bring Your Own DataBase** — users connecting their own storage accounts for raw data — is an
  idea for a later PoC. It may later be granted on request or as a paid feature. Its motivation:
  otherwise scientific raw data is lost.

## Decision

### Three layers

| Layer | Content | Mutability |
|---|---|---|
| **0 — Raw** | Exactly what the device emitted: the line or bytes, plus the host's reception time | **Never modified.** Always kept by the agent locally. Cloud upload of the full raw stream is optional and admin-gated. |
| **1 — Canonical** | Raw data parsed into standard quantities with units. Deterministic and reproducible from layer 0, and tagged with the device type and parser version that produced it | Only regenerated from layer 0, never edited |
| **2 — Derived** | The result of a **recipe** (calibration + filters + corrections) applied to a stream, forming a **view** (ADR-004) | Computed on read by default. **Materialised only on an explicit user request**, with provenance (source stream, recipe version, calibration version) and a visible **"derived"** label |

### Rules

1. **Nothing is discarded at ingest.** Layer 0 is stored before any processing. No threshold,
   classifier, or quality check decides what gets kept.
2. **Processing applies on top of stored data.** Filtering, calibrating, discriminating, and
   classifying are allowed and encouraged, as layer-2 views.
3. **Altered data is never stored as if it were pure.** A materialised filtered dataset is a
   special, explicit setting, chosen knowingly by the user. The user defines its recipe and
   calibration, and it is always labelled derived.
4. **One stream, many views.** The raw view always exists. Pure and filtered views of the same
   stream can be compared side by side.
5. **Automatic routines only propose.** Examples are noise-floor estimation, calibration fits, and
   format detection. A user accepts or edits the result, which then becomes a new calibration or
   recipe version.
6. **Event-level recipes run where the raw data lives**, i.e. in the agent:
   - the web app defines the recipe;
   - the agent applies it to its local history;
   - the agent uploads the resulting series, labelled as derived.

   This allows retroactive recalibration without touching layer 0.
7. **Missing is not zero:**
   - an absent quantity (e.g. no barometer) is recorded as absent, never as 0;
   - a gap in recording is a gap, never a run of zero counts;
   - a partial minute is marked partial.
   _(Wording proposed by the Adjutant on 2026-10-03 — pending maintainer confirmation.)_
8. **Per-minute canonical records keep the earlier rule:** they are **time averages, never sums**,
   and statistical uncertainties are derived from raw counts (√N).
9. **Time is data too:** raw timestamps are kept; corrected timestamps are derived, with a record
   of time quality (source, offset, drift).
   _(Wording proposed by the Adjutant on 2026-10-03 — pending maintainer confirmation.)_
10. **Realtime is ephemeral** in the cloud: a short live window, pruned by time.

## Consequences

- **`AGENTS.md`:** the data-integrity guardrail is rewritten with this formulation.
- **First-attempt code:** its ingest-time noise filter is replaced in M1 by stored raw data plus
  proposed thresholds.
- **M1 data model:** it carries provenance on views and sessions (device type version, parser
  version, calibration version, recipe version, time quality).
- **Quota cost:** materialised views and admin-approved raw uploads count against the free-tier
  budget (ADR-005); their specs state the expected cost.
- **The agent's local store is the master copy of raw data**, which makes local durability and
  backups (M4) critical.
- **Bring Your Own DataBase** needs its own proposal before implementation. If it ever involved
  payment, it would amend D26.

## Alternatives considered

- **Filter at ingest to save space:** rejected. It destroys data irreversibly, and a wrong
  threshold (as observed) loses almost everything.
- **Always store every derived result:** rejected. It multiplies storage against a 1 GB budget,
  and on-read computation suffices for most views.
- **Raw data always uploaded to the cloud:** rejected for the free plan's capacity. It stays an
  admin-gated option.
