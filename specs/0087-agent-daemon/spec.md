# 0087 — Agent daemon (headless, Node 24)

- **Status:** draft
- **Milestone:** M1 — Core + Agent (version range `6.0.0-alpha.1.x`)
- **Owner:** Adjutant (spec and implementation of `apps/agent`); reviewers: code-reviewer,
  silent-failure-hunter (serial, sync, listeners), security-reviewer (sign-in, session storage,
  local panel, bridge), physicist (aggregation semantics).
- **Depends on:** spec 0083 (contracts, storage paths, raw-line contract), spec 0085 (dead fraction
  from the cumulative counter, reset detection), spec 0086 (`LineSource`, virtual detector), spec
  0084 (rules the agent's writes must pass); ADR-005, ADR-006, ADR-007, ADR-009; M1 plan decisions
  A–H; backlog B-M1-20…29.

## Context

The agent is the only ingestion path for physical devices (ADR-007). It runs 24/7 as a Linux service
next to the device, starts without anyone logging in, keeps **every raw line** locally, builds
complete-minute records, and syncs to Firebase when it can. The first-attempt agent was a tested
TypeScript core with no wiring, no SQLite, no sign-in, and a silent serial stop on unplug; it is
replaced by this daemon.

**Established behavior kept (WORKFLOW §4):** v5 splits concatenated `COSMIC` records before parsing
(`public/js/serial-reader.js`, branch `v5-production`); v5 discards the partial first and last minute
of a recording; v5 counts one event per parsed line; v5 reads at 9600 baud; v5's Python bridge serves
`ws://localhost:8765` (`public/tools/serial_bridge.py`: `{"type":"serial_data","line","ts"}` per
line, `{"type":"bridge_info", …}` on connect, `ping` → `pong`, `status` → `status`). All are kept.

**Changes from established behavior (labelled):** dead time from the increment of the cumulative
counter (ADR-006 rule 8, spec 0085) instead of averaging the raw column; a counter or device-clock
decrease ends the session (reset) instead of being averaged through; the raw stream is kept locally
forever instead of being discarded after parsing.

It is **not**: a web dashboard (M2), the Bring Your Own Detector editor (M4), a Raspberry Pi/offline
bundle packager (M4), or a cloud raw uploader (admin-gated, M4).

## Functional requirements

- **FR1 — Service:** a Node 24 TypeScript daemon (`muonhub-agent run`) under systemd: starts at boot
  with no login, `Restart=always` with `RestartSec=5` and **`StartLimitIntervalSec=0`** (systemd never
  gives up after repeated quick failures); every start increments a restart counter recorded in
  `events_log` and shown in status. Runs as a dedicated `muonhub` user in group `dialout`, state in
  `StateDirectory=muonhub` (`/var/lib/muonhub`, **`StateDirectoryMode=0700`**), runtime files in
  `RuntimeDirectory=muonhub` (**`RuntimeDirectoryMode=0750`**). **Hardening:** `NoNewPrivileges=yes`,
  `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, empty `CapabilityBoundingSet=`,
  `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6`, `DevicePolicy=closed` with `DeviceAllow=` limited
  to the configured serial device (`char-ttyUSB`/`char-ttyACM` rw). An install script for Ubuntu x64
  installs the Node 24 runtime bundle (**verifying its SHA-256 checksum** against the published
  `SHASUMS256.txt` before use), the unit, and the user (B-M1-20).
- **FR2 — Input sources:** every input is a `LineSource` (spec 0086 FR11). Implementations: `SerialLineSource`
  (`serialport`, configured by stable path `/dev/serial/by-id/...`, baud from the device type,
  default 9600) and the virtual detector (`createVirtualDetector`) for tests and `muonhub-dev`.
- **FR3 — Robust framing:** bytes → lines tolerant to CRLF/LF, fragments split across reads,
  invalid UTF-8 (lossy decode with the raw bytes kept), and concatenated records split as v5 does
  (`COSMIC` + digit boundary). Malformed lines are kept raw, counted (`quarantinedLines`), never
  turned into events (B-M1-22).
- **FR4 — Reconnect, never silent:** on serial error/close the source reports the loss, the session
  ends with `endReason: usbLoss`, the daemon retries with backoff (1 s → 30 s), reopens the same
  by-id path when it reappears, and starts a new session. Status shows "device disconnected" within
  10 s of the loss.
- **FR4b — Serial-silence watchdog:** if the port stays open but no byte arrives for longer than the
  device type's expected silence window (default 120 s *(Proposed)*, derived from the expected rate),
  status shows **"device silent"** — distinct from "disconnected" and from a measured low rate — the
  condition is logged at error level to the journal and `events_log`, and after a second window the
  port is closed and reopened (ending the session with `endReason: usbLoss`). A silent device never
  produces minutes that look like zero counts: minutes with no lines are not complete minutes.
- **FR5 — Device-type parsing:** lines are parsed by the configured device type (spec 0083 FR4);
  auto-detection only **proposes** a type (capture tool). One event per parsed event line; event IDs
  are tracked for gaps (`eventIdGaps`), never summed.
- **FR6 — Session controller:** owns source → framer → parser → aggregator → summaries → outbox.
  `start()`/`stop()` are idempotent. A new session starts on: daemon start, reconnect, configuration
  change, device reset (event counter or device clock decreases — spec 0085), clock-provenance
  change. Live status: rate (last complete minute), queue depth per kind, last successful sync, last
  rejected write, clock offset, active device type and calibration versions.
- **FR7 — Complete-minute aggregation:** minute boundaries on the host UTC clock; the first partial
  minute after a session start and the last partial minute before an end are **discarded** (counted
  in the session as `discardedPartialMinutes`); each complete minute yields one `MinuteRecord`
  (spec 0083 FR10): `n`; `liveMs` and `liveSource` exactly as defined in spec 0083 FR10
  (`counter` from the cumulative dead-time increment, `tau`, or `nominal` with `liveMs` omitted —
  never a fabricated 60 000); amplitude mean/min/max (absent when `n = 0`); temperature and pressure
  time averages only if reported. Minutes are built **only from committed raw lines** (FR9).
- **FR7b — Clock steps and unsynchronized boot:** every raw line stores wall time and monotonic time;
  the aggregator compares their deltas line by line. A divergence above 2 s *(Proposed threshold)*
  is a clock step: the session ends with **`endReason: clockStep`** (added to the 0083 FR8 enum),
  `clockAnomalies` is incremented, the minute in progress is discarded and counted, and a new
  session starts. Minute output is **held** after boot until `timedatectl` reports
  `NTPSynchronized=yes`; if it is not synchronized within 10 min *(Proposed)*, minutes are produced
  with `timeProvenance.source: "none"` (never silently labelled `ntp`). Clock provenance is polled
  every 10 min *(Proposed)* and at session start.
- **FR7c — Crash recovery:** on startup, any session left open in SQLite is closed with
  `endReason: powerLoss` (if the last raw line is older than the boot time) or `unknown`, and the
  minute that was in progress in memory is counted in `discardedPartialMinutes`; its raw lines remain
  in layer 0.
- **FR8 — Hourly/day summaries:** per hour, an entry of the stream-day summary (spec 0083 FR11) with
  the amplitude histogram in the device type's fixed bins, **rebuilt from the local `minutes` table
  and committed raw lines — never from in-memory state** — so a restart inside the hour cannot
  overwrite the entry with partial data. Hours with no complete minute produce no entry. The outbox
  key for summaries is **per hour** `(streamId, "hour", hourStart)`; the uploader merges that one
  hour entry into the day document (field-level update), so 24 updates a day never conflict with the
  write-once rule for the same key. A recomputed hour (e.g. after late-committed minutes) is a new
  outbox item with a revision number, not a silent overwrite.
- **FR9 — Local store (SQLite):** `node:sqlite` behind a `LocalStore` interface (`better-sqlite3`
  fallback). Tables: `raw_lines` (every line, keep-all — decision F), `minutes`, `summaries`,
  `sessions`, `outbox` keyed `(streamId, kind, ts)` (unique), `quarantine`, `events_log`. WAL mode;
  every derived record is committed locally **before** any upload attempt (B-M1-24).
  - **Atomicity:** a minute record and its outbox item are written in **one transaction**; raw lines
    are committed in batches (every 1 s or 500 lines, whichever first *(Proposed)*) and the
    aggregator only consumes committed lines, so a crash can never leave a stored minute without its
    outbox item or a minute built from uncommitted raw data.
  - **Storage errors and disk space:** a free-space threshold (default 2 GB *(Proposed)*) shows
    **"disk low"** in status and logs at error level before writes can fail; below a hard floor
    (default 200 MB *(Proposed)*) or on any SQLite write error, the session ends with
    **`endReason: storageError`** (added to the 0083 FR8 enum), the error is written to the journal
    and `events_log`, and the daemon stops acquisition cleanly instead of crash-looping; it resumes
    only when space is available again.
- **FR10 — Durable outbox and sync:** per-kind ordered flush with **at most one write in flight per
  kind**. Error classification:
  - **transient** (network, 5xx, quota/backoff) → exponential backoff with jitter, max 5 min;
  - **unknown** (timeout or lost acknowledgement) → the item stays pending; before any retry the
    uploader **reads the record back** and compares it: identical → mark uploaded; absent → retry;
    different → park as a conflict. An item is marked uploaded only on an SDK confirmation or a
    matching read-back. The Firebase SDK's own offline write queue is not relied on (writes use
    explicit timeouts; the outbox is the only queue);
  - **`PERMISSION_DENIED` → check the auth state first:** if the session is signed out or its token
    is invalid, the outbox is **paused** (items stay pending, nothing is parked), status shows
    "signed out — data stored locally", and the condition is logged at error level; only when the
    session is valid is the denial treated as permanent;
  - **permanent** (denied with a valid session, validation) → item parked, counted, shown in status
    and panel, logged at error level to the journal and `events_log`; never retried blindly, never
    dropped. A parked item **does not block** later items of its kind (it is set aside and
    raises an alarm). Parked items carry an age; an item parked for
    more than 1 h *(Proposed)* raises an alarm in status. The panel and `muonhub-agent outbox` offer
    **retry** and **export** (JSON lines) of parked items.
  - **Pre-send validation:** a record that fails zod validation before sending is moved to the
    `quarantine` table and counted (`quarantinedRecords`); it never throws inside the flush loop.
  Re-enqueueing an existing key is a no-op; an uploaded key is never uploaded again with different
  content (ADR-006 — recomputed minutes go to a new session).
- **FR11 — Sign-in and session persistence:** the Firebase client SDK signs in with a MuonHub
  account; **no service-account or admin keys on the machine** (ADR-009).
  - **Agent identity *(Proposed — decision for the maintainer)*:** a **dedicated per-machine account**
    (e.g. `agent-usfq-lab@…`) that the station owner adds as an **editor** of the station; the owner
    revokes the machine at any time by removing that membership. Alternative: the owner's own
    account (simpler, but a compromised machine would control the whole account — transfers,
    deletion, visibility).
  - Only the **refresh token** is stored — never the password (the password is typed once in the
    setup wizard and discarded). The credential file is **created with mode `0600`** in the open call
    (no later `chmod`) under `/var/lib/muonhub` (`StateDirectoryMode=0700`), owned by `muonhub`.
  - **Revocation (documented in the operations guide):** remove the agent account's membership (or
    disable the account / change its password in Firebase Authentication), then delete the
    credential file on the machine.
  - After a reboot the daemon restores the session before syncing; if it cannot, it keeps recording
    locally and shows "signed out — data stored locally" (status-pill lesson) (B-M1-21).
  - **Mid-run expiry:** the daemon subscribes to auth-state changes and checks the session before
    each flush cycle; an expired or revoked session during operation pauses the outbox exactly as in
    FR10 and is logged at error level.
- **FR12 — Rejected-write detection:** every write result is checked; a rejection increments a
  counter, records the error code and the item, and is shown in the status document (when writable),
  the local panel, **and always in the journal at error level** (so problems are visible even when
  the panel is unreachable and the status document cannot be written). A dead realtime listener or a
  failed write is never treated as "no data".
- **FR13 — Live window and status:** live events are batched and written every 5 s *(Proposed
  interval)* to `live/{streamId}/events`; entries older than 10 minutes are pruned by time with
  bounded queries (no full-window downloads); `status/{streamId}` heartbeat every 60 s *(Proposed)*;
  the public subset of status goes to the separate `statusPublic/{streamId}` node (spec 0083/0084).
  Live batches and heartbeats are **best-effort and kept out of the durable outbox**: a failed batch
  is dropped and counted (`droppedLiveBatches`, `droppedHeartbeats`) and logged at warn level, never
  retried into the past. The `.info/connected` listener and every prune query register error
  handlers; their failures are counted and shown in status.
  *(Public showcase writes: only after the step-10 measurement decides ADR-005 §6.)* (B-M1-29)
- **FR14 — Clock provenance:** read-only queries of `timedatectl show` and `chronyc tracking` when
  available, run with `execFile` (never through a shell); the offset and source are stored in the
  session's `timeProvenance`; host timestamps are taken at read time in the agent process (B-M1-27).
  Polling and synchronization handling as in FR7b.
- **FR15 — Local web panel:** HTTP on `127.0.0.1` only (default port 8787 *(Proposed)*), reachable
  remotely with `ssh -L 8787:localhost:8787`. Pages: status (device, session, rate, queue, sync,
  errors, clock); first-time setup wizard (decision E): sign in, create or select station (required
  visibility, no default; public precision), device (device type, geometry), stream. The panel never
  displays secrets. **Access control:**
  - a local access token stored in a `0600` file under `/var/lib/muonhub`, shown only with
    `sudo muonhub-agent panel-url` (never printed to the journal, which `adm`/`systemd-journal`
    members can read);
  - the token is exchanged once for a session cookie (`HttpOnly`, `SameSite=Strict`); it never
    appears in URLs after that exchange or in logs;
  - every request validates the `Host` header (`127.0.0.1:<port>` / `localhost:<port>` only — blocks
    DNS rebinding) and, for state-changing requests, the `Origin`; state-changing requests (including
    the sign-in POST) carry a CSRF token.
  The panel runs isolated from acquisition: a panel crash or an `EADDRINUSE` on its port is logged,
  shown in status, and retried; it never stops recording.
- **FR16 — Raw mirror:** every raw line is teed to a rotating text log (`/var/lib/muonhub/raw/*.log`,
  daily files) and to a Unix socket (`/run/muonhub/raw.sock`, mode `0660`, group `muonhub`, inside
  `RuntimeDirectoryMode=0750`) so the port can be watched with `tail -f` or `socat` without stopping
  acquisition (B-M1-26). The socket ignores incoming data; each client has a bounded buffer (64 KB
  *(Proposed)*) and a slow reader is **dropped** (counted), so acquisition never stalls. Mirror
  failures are logged and counted, never fatal.
- **FR17 — Capture tool:** `muonhub-agent capture --port <by-id> [--baud auto|N] [--minutes N]`:
  baud scan (9600, 19200, 38400, 57600, 115200), hex dump, per-column statistics (type, range,
  monotonic, constant), proposed device type, and a fixture file for tests. Refuses to run while the
  daemon holds the same port (it reads the raw socket instead with `--from-socket`).
- **FR18 — Fully offline:** recording, local storage, and the panel work with no network and before
  any sign-in; data syncs when connectivity and a session exist (B-M1-28).
- **FR19 — v5 compatibility bridge (decision B):** an optional WebSocket server on
  `ws://localhost:8765` speaking exactly the v5 bridge protocol: `bridge_info` on connect
  (`version`, `serial_port`, `baud_rate`, `os`, `message`), one `serial_data` message per raw line
  (`line`, `ts` in ms), `ping` → `pong` (`ts`), `status` → `status` (`serial_connected` — the **real**
  port state, `clients`, `serial_port`). Bound to `127.0.0.1` only. Enabled by configuration until
  the M5 cutover. **Safety and isolation:**
  - binding to localhost does not stop browser pages (WebSockets ignore CORS), so the `Origin` header
    is checked against an allowlist (the v5 site origin(s) and `null`/local file *(Proposed list)*);
  - only `ping` and `status` messages are accepted; anything else is ignored; frame size capped
    (4 KB *(Proposed)*), at most 4 clients *(Proposed)*, per-client send buffer capped — a slow
    client is disconnected and counted, never allowed to grow memory;
  - `EADDRINUSE` on 8765 (e.g. the old Python bridge still running) is logged at error level, shown
    in status ("v5 bridge port busy"), and retried periodically; it never crashes the daemon or
    stops acquisition.

## Non-functional requirements

- **Strict typing:** TypeScript strict, zod validation of configuration and of every record before it
  is stored or sent; no `any`. Pure logic (framer, parser, aggregator, session controller, outbox
  policy) has no I/O and is unit-tested without hardware.
- **Reliability:** no unhandled rejections (process-level handler logs and exits so systemd restarts
  it); every I/O call has a timeout; memory bounded (raw lines streamed to SQLite).
- **Free-tier budget (ADR-005), per stream-day (estimates, measured in step 10):** RTDB writes ≈
  1 440 minute records + ≈ 17 280 live batches (5 s) + ≈ 1 440 status heartbeats; RTDB storage ≈
  50–80 MB per stream-year of minutes (live window bounded at 10 min); Firestore ≈ 24 day-summary
  updates + a few session writes; one persistent RTDB connection per agent.
- **Security (ADR-009):** no admin keys; refresh token only, file created `0600`; panel and bridge
  bound to `127.0.0.1` with Host/Origin validation; panel requires a local token and CSRF tokens;
  bridge Origin allowlist and caps; raw socket `0660` group `muonhub`; hardened systemd unit (FR1);
  external commands via `execFile`; installer verifies the Node bundle checksum; the agent writes
  only paths its account's rules allow (spec 0084).
- **Disk:** raw keep-all ≈ 10–20 MB/day at ≈ 2.4 events/s (estimate, measured during the 72 h run);
  free-space thresholds and the `storageError` path in FR9.
- **Observability:** every error-level condition (signed out, parked items, disk low, device silent,
  clock step, storage error, bridge/panel port busy, restart) is written to the journal and
  `events_log` and shown in status; the counters `discardedPartialMinutes`, `quarantinedLines`,
  `quarantinedRecords`, `eventIdGaps`, `clockAnomalies`, `droppedLiveBatches`, `droppedHeartbeats`,
  `parkedItems`, `restarts` are kept per session.
- **Session counters upload point:** a session's counters are uploaded through the outbox when the
  session ends and, for the active session, at each hourly summary; on crash recovery (FR7c) the
  closed session's final counters are enqueued at startup.

## Data integrity (ADR-006)

Layer 0 (raw lines with host time and monotonic time) is written to SQLite as received, before
parsing, and never modified or deleted (decision F). Layer 1 (minute records, summaries, sessions) is
deterministic from layer 0 for a given agent version and device-type version, recorded in the session.
Nothing is filtered at ingest: malformed lines stay raw and are counted; noise thresholds are not
applied. Partial minutes are discarded from layer 1 only (as in v5); their raw lines remain in layer 0.

## Design / approach

```
apps/agent/
  src/
    cli.ts                 muonhub-agent run | capture | setup | status
    config.ts              zod config (device type, by-id path, baud, stream, bridge on/off)
    sources/serial.ts      SerialLineSource (serialport) — implements LineSource
    framing/               bytes → lines (CRLF, fragments, COSMIC split, lossy decode)
    parsing/               device-type-driven parser (uses @muonhub/shared device types)
    session/controller.ts  pipeline owner, resets, status
    aggregation/           complete-minute aggregator, hourly/day summaries (uses @muonhub/physics)
    store/                 LocalStore interface; node-sqlite and better-sqlite3 implementations
    sync/                  outbox, error classification, backoff, uploader (via @muonhub/data-provider)
    live/                  live batching, time pruning, status heartbeat
    clock/                 timedatectl/chronyc readers (read-only)
    panel/                 localhost HTTP server, setup wizard, token file, CSRF, Host/Origin checks
    mirror/                rotating raw log, unix socket
    bridge-v5/             ws://localhost:8765 compatibility server
    capture/               baud scan, hex dump, column stats, fixture writer
  deploy/
    muonhub-agent.service  systemd unit
    install.sh             Ubuntu x64 installer (verifies the Node bundle checksum; user, group
                           dialout, dirs, hardened unit)
```

Backend access only through `@muonhub/data-provider` (ADR guardrail 6). The first-attempt agent core
is deleted when this lands (its parsers' test fixtures are kept and reused).

## Acceptance criteria (verifiable)

- [ ] CA1: framing tests — CRLF, LF, 1-byte fragments, concatenated `…0 COSMIC488 …` lines (two
  records out), invalid UTF-8 kept raw.
- [ ] CA2: with the virtual detector (`disruptions` preset): only complete minutes are produced;
  partial first/last minutes counted as discarded; resets create a new session; event-ID gaps counted.
- [ ] CA3: outbox tests — offline for a simulated hour then online: every minute uploaded exactly
  once in order; a permanent rejection parks the item and appears in status; re-enqueue is a no-op.
- [ ] CA4: serial-loss test (fake source closing mid-stream): status shows disconnected ≤ 10 s; a
  new session starts on reconnect; no unhandled rejection.
- [ ] CA5: sign-in persistence test: a restarted process restores the session from the `0600` file;
  with a revoked credential it keeps recording locally and reports "signed out".
- [ ] CA6: v5 bridge test: a WebSocket client receives `bridge_info`, then one `serial_data` per raw
  line with the exact v5 field names; `ping`/`status` answered.
- [ ] CA7: emulator test: minutes, day summaries, live batches, and status written by the agent pass
  the spec 0084 rules as the owner and are rejected for another user.
- [ ] CA8: `grep` finds no Firebase SDK import outside `@muonhub/data-provider` usage and no service
  account handling in `apps/agent`.
- [ ] CA11: **token revoked mid-run** (virtual detector, emulator): the outbox pauses, nothing is
  parked, status and journal show "signed out"; after re-sign-in every pending item uploads exactly
  once.
- [ ] CA12: **lost acknowledgement**: a fake uploader that times out after the write succeeded —
  the read-back marks the item uploaded; no duplicate and no wrongful park.
- [ ] CA13: **disk full / SQLite error** (fault-injected store): status shows "disk low" above the
  floor; below it the session ends with `endReason: storageError`, acquisition stops cleanly, no
  restart loop, the journal has the error.
- [ ] CA14: **clock step** (virtual detector with a wall-clock jump of ±5 min): the session ends with
  `clockStep`, `clockAnomalies` incremented, no duplicate or short minute uploaded; minute output is
  held until NTP sync is reported.
- [ ] CA15: **crash recovery** (process killed mid-minute): on restart the open session is closed
  with `powerLoss`/`unknown`, the in-progress minute is counted in `discardedPartialMinutes`, and the
  hour summary is rebuilt from local minutes (no partial overwrite).
- [ ] CA16: **bridge port in use**: with port 8765 occupied, the daemon keeps recording, status
  shows "v5 bridge port busy", and the bridge starts once the port is freed.
- [ ] CA17: **device silent**: a fake source that stays open but sends nothing → "device silent"
  within the window, no minutes produced, reopen attempted.
- [ ] CA18: **local surface**: panel rejects a wrong `Host`, a cross-origin POST, and a missing CSRF
  token; the bridge rejects a disallowed `Origin` and ignores non-`ping`/`status` messages; a slow
  socket reader is dropped without stalling acquisition.
- [ ] CA9: typecheck · lint · build · test · format:check green; emulator tests green.
- [ ] CA10: only `apps/agent` (and its docs) is touched.

## Validation in practice

72 hours of the real CosmicWatch at USFQ writing to `muonhub` (decision H, sudo on the PC):
1. USB unplug/replug — remote `echo <port> > /sys/bus/usb/drivers/usb/unbind` then `bind`, and once
   physically if someone is on site;
2. a 1-hour network cut — a temporary firewall rule blocking only Firebase hosts (Tailscale kept),
   removed automatically by a timer;
3. an agent restart (`systemctl restart`) and a machine reboot.

Checks: only complete minutes; gaps exactly at the disruption windows; zero duplicates; cloud minute
counts equal the local raw log's counts per minute; nothing lost across the offline hour; rejected
writes (if any) reported; session restored after the reboot without manual action; v5 kept
recording through the bridge; measured writes/bytes per stream-day recorded in `docs/audit/`. In
parallel, 72 h of the virtual detector on `muonhub-dev` with ground truth compared automatically.

## Out of scope

Web dashboards and the public live page (M2); public showcase writes until ADR-005 §6 is decided
(step 10); Raspberry Pi/arm64 packaging, GPS/RTC timing, sealed offline bundles (M4); cloud raw
upload (admin-gated, M4); Windows/macOS services (M4); multichannel and sampled devices beyond
contracts (6.x); auto-update (Proposed for M4).

## Tasks

- [ ] T1: framing, parsing, aggregation, session controller (pure, tests with fixtures and the
  virtual detector).
- [ ] T2: SQLite store and outbox; sync with error classification.
- [ ] T3: sign-in persistence, rejected-write detection, live batching, status.
- [ ] T4: serial source with reconnect; clock provenance.
- [ ] T5: panel and setup wizard; raw mirror; capture tool; v5 bridge.
- [ ] T6: systemd unit and installer; installation guide in `docs/operations/`.
- [ ] T7: remove the first-attempt agent core; update `apps/agent/README.md`.
- [ ] T8: changelog fragment in `changelog.d/`.
