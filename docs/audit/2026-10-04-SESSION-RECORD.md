# Session record — 2026-10-04

> Continues [`2026-10-03-SESSION-RECORD.md`](2026-10-03-SESSION-RECORD.md). Closes milestone M0.

## 1. Maintainer decisions

| # | Decision |
|---|---|
| 1 | **Partial minutes are not recorded.** As MuonHub has always worked: data is discarded until a minute starts, and if recording is cut before a minute completes, that last minute is discarded. Only complete minutes become per-minute records (ADR-006 rule 7; ADR-003 §5; `docs/science/SERIAL-FORMATS.md` §4). The proposal to "mark partial minutes as partial" is withdrawn. |
| 2 | **Ownership can be transferred and shared by its owner.** Rights must not change without authorization, but the owner of a station/device can share or transfer ownership to another account easily from the web, and the receiving user is notified by email (ADR-009 rule 3, backlog B-M2-05). |
| 3 | The remaining wording proposed on 2026-10-03 is confirmed: ADR-004 rule 1, ADR-006 rules 8–9 (per-minute semantics, time provenance), and the ADR-008 pre-scheme note. |
| 4 | Finish M0 and open the pull request. |
| 5 | Delete the downloaded `gh.deb` installer from the working copy (done; it was never committed). |

## 2. Lesson recorded

The partial-minute proposal contradicted behavior that was already documented in the repository. A
reviewer suggested it and it was adopted without checking the existing sources. `docs/process/WORKFLOW.md`
§4 now requires every proposal that changes an established behavior to quote the current behavior and
its source, to be labelled as a change, and requires reviewer suggestions to be checked against the
same sources before adoption.

## 3. Raw data and partial minutes

Discarding partial minutes applies to the **per-minute records**. The raw lines received during those
minutes still remain in the agent's local raw store (layer 0, ADR-006), like every other raw line.
