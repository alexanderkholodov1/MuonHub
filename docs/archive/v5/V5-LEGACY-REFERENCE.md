# v5.0 legacy reference (`public/`)

> The v5.0 application (vanilla JS + Firebase) remains in `public/` as the **behavioral reference**
> for the v6 reconstruction. It is read-only: consult it to understand proven behavior; do not
> extend it. This page distills the v5 facts that migration and parity specs depend on
> (data migration, serial port handling, chart parity).

## Architecture

Vanilla JavaScript (ES6+), no build step; all modules are IIFEs exposing frozen APIs on the global
scope, loaded via `<script>` tags in `public/index.html`. **Load order in `index.html` is the
dependency graph.**

| Order | Module | Responsibility |
|---|---|---|
| 1 | `config.js` | Frozen constants (Firebase config, colors, chart types, field labels, limits) |
| 2 | `ui-manager.js` | Theme toggling, toasts, modal lifecycle |
| 3 | `firebase-manager.js` | Singleton Firebase app; runtime database-URL switching |
| 4 | `data-manager.js` | Data state, Firebase subscriptions, LTTB downsampling (max 500 chart points) |
| 5 | `chart-manager.js` | Chart.js rendering, time ranges, chart slots, 1000 ms throttle |
| 6 | `profile-manager.js` | Profile CRUD, sharing/visibility, profile tree UI |
| 7 | `session-manager.js` | Session lifecycle, upload deduplication, CSV download |
| 8 | `upload-manager.js` | Import/export utilities, ZIP backup/restore |
| 9 | `db-admin.js` | Admin-only storage stats, user management, roles |
| 10 | `auth.js` | Firebase Auth, role gating, EN/ES i18n |
| 11 | `serial-reader.js` | Web Serial API + WebSocket bridge fallback |
| 12 | `app-entry.js` | Orchestrator: wiring, DOM listeners, localStorage prefs |

## Data flow

```
[USB detector] → serial-reader.js → Firebase Realtime DB (munra-1)
                                          ↓ child_added/changed/removed
                                    data-manager.js  (LTTB downsampling)
                                          ↓ change notifications
                                    chart-manager.js (4-slot 2×2 grid)
```

`data-manager.js` uses `child_added/changed/removed` listeners (never `value`) so a minute-save
does not re-download the whole session — a v5.0 fix that v6's `FirebaseProvider` must preserve
(bandwidth regression otherwise).

## Database schema (v5 / `munra-1` — the migration source)

```
/users/{uid}               — role (admin|user|guest), displayName, email
/profiles/{profileId}
  ├─ sessions/{sid}/minutes/{ts}   — per-minute records (indefinite retention)
  ├─ realtime/{ts}                 — per-event records (8-minute sliding window)
  └─ latest                        — most recent data point
/organizations/{orgId}     — name, owner, members
```

Minute-record fields: `ec` (events/min), `cc` (coincidences/min), `sm`/`sx`/`sn`
(SiPM mV avg/max/min), `tp` (°C), `pr` (Pa), `d` (dead time %). Per-minute values are
**time-averages over the minute, never sums** — preserving rate semantics so records of
different completeness stay comparable (see `docs/research/THEORETICAL-FOUNDATION.md` §10 for
how uncertainties are then derived from counts). v6 renames `d` → `dt` and standardizes
pressure units (see `packages/shared`).

## Behavioral constraints worth porting deliberately

- **Realtime auto-expiry:** realtime data older than 8 min disables the 1 m/5 m ranges and falls
  back to 15 m silently (by design). Realtime node capped at 5000 records (`REALTIME_LIMIT`).
- **Chart gap detection:** a gap ≥ 2 min between points breaks the chart line (`GAP_THRESHOLD`).
  Do not lower it — minute-boundary saves can arrive late.
- **Serial support:** Web Serial API is Chromium-only; v5 falls back to a local Python bridge
  (`public/tools/serial_bridge.py`, `ws://localhost:8765`). v6 replaces both with the installable
  agent (D5/D31).
- **Serial formats:** four auto-detected input formats — see `docs/technical/SERIAL-FORMATS.md`.
- **Preferences** (theme, time range, chart sources) are per-browser `localStorage` only.
- **Theming** is CSS-variable swapping (no `<body>` class toggling).
- **Cache busting** via `?v=5.0` query strings on script/link tags.
- **`/terminal.html`** is a standalone diagnostics page outside the SPA rewrite.

## Operating the legacy app

```bash
firebase deploy --only hosting    # deploy public/ as-is
firebase deploy --only database   # deploy database.rules.json
python public/tools/serial_bridge.py   # serial bridge for non-Chromium browsers
```

The v5 database (`munra-1`) is saturated at the free-tier 1 GB limit and effectively read-only;
it is the **source** of the v5→v6 migration (see `planning/16-DEPLOYMENT-AND-CUTOVER.md`).
