# MuonHub agent

The agent is MuonHub's software next to the detector. It is a **headless Node.js 24 daemon**
(ADR-007, spec [`0087`](../../specs/0087-agent-daemon/spec.md)) that runs under systemd, starts with
the machine without anyone logging in, keeps **every raw line** locally, builds records for **complete
minutes only**, and syncs them to Firebase when a connection and a session exist. Operations guide:
[`docs/operations/AGENT.md`](../../docs/operations/AGENT.md).

## What it guarantees

- **Raw data is immutable.** Every line (with host wall time and monotonic time) is committed to
  SQLite (`raw_lines`, append-only: the schema refuses UPDATE and DELETE) before anything is derived
  from it. Malformed lines stay raw and are counted; nothing is filtered at ingest.
- **Only complete minutes** are recorded. The partial first and last minute of a session (and of a
  silence) are discarded and counted (`discardedPartialMinutes`); a minute with no data is never
  turned into zero counts. A quantity a device does not report is absent, never 0.
- **Dead time from the device counter**, via `@muonhub/physics`; `liveSource` says how it was
  obtained (`counter`, `tau`, `nominal`).
- **Nothing is lost offline.** Minutes, hour summaries and session records go through a durable
  outbox (one transaction with the minute); uploads are ordered, one write in flight per kind,
  classified as transient / unknown / permanent. A denial with a signed-out session pauses the outbox
  instead of parking data. Unknown outcomes are read back before any retry.
- **Failures are loud.** Every error-level condition goes to the journal, to `events_log`, and to the
  status shown in the panel.

## Layout

```
src/
  cli.ts            muonhub-agent run | capture | panel-url | status | outbox | version
  runtime.ts        builds the real daemon from /etc/muonhub/agent.json
  daemon.ts         agent + raw mirror + v5 bridge + panel (isolated surfaces)
  agent.ts          source -> framer -> classifier -> pipeline -> store -> outbox, clock, disk
  config.ts         zod configuration
  sources/          SerialLineSource (serialport), virtual detector, supervisor (reconnect, watchdog)
  framing/          bytes -> lines (CRLF/LF/CR, fragments, COSMIC split, lossy UTF-8)
  parsing/          device-type-driven parser (built-in device types of @muonhub/shared)
  session/          classifier (resets, clock steps), pipeline (batched raw commits), crash recovery
  aggregation/      complete-minute aggregator, hour summaries
  store/            LocalStore interface; node:sqlite (default) and better-sqlite3 (optional fallback)
  sync/             sign-in persistence, durable outbox uploader
  live/             live-window batching, pruning, status heartbeat (best effort)
  clock/            timedatectl / chronyc readers (execFile), boot hold until NTP is synchronized
  panel/            localhost web panel, setup wizard, token file
  mirror/           rotating raw log and Unix socket
  bridge-v5/        ws://localhost:8765 compatibility server for the v5 website
  capture/          baud scan, hex dump, column statistics, proposed device type, fixture
deploy/             hardened systemd unit, Ubuntu x64 installer, example configuration
```

## Develop

```bash
pnpm --filter @muonhub/agent test        # unit + integration tests (virtual detector, in-memory provider)
pnpm --filter @muonhub/agent typecheck
pnpm --filter @muonhub/agent build       # tsc -p tsconfig.build.json -> dist/
node dist/cli.js run --config deploy/agent.example.json
```

To run without hardware, set `"source": {"kind": "virtual", "preset": "disruptions"}` in the
configuration: the agent reads the simulator's virtual detector (synthetic data, sessions labelled
`synthetic`).

## Tests

The integration tests drive the real `Agent` with the virtual detector (`@muonhub/simulator`), scripted
sources, an in-memory SQLite store, and the in-memory data provider with fault injection. They cover
acceptance criteria CA1–CA6 and CA11–CA18 of spec 0087: framing, complete-minute aggregation against
ground truth, offline hour and exactly-once ordered upload, permanent rejection, serial loss and
reconnect, device silence, credential persistence and revocation, token revoked mid-run, lost
acknowledgement, disk low and SQLite errors, clock step and NTP hold, crash recovery, bridge port in
use, and the panel / bridge / mirror access controls. CA7 (rules, emulator) belongs to the
data-provider emulator suite; CA8 is a `grep` (no Firebase SDK import in this package).

## Known limits (M1)

- Restoring a session after a restart needs refresh-token support in `@muonhub/data-provider`
  (`RefreshTokenSupport` in `src/sync/auth.ts`); until the provider offers it the agent records
  locally and reports "signed out - data stored locally".
- Dead-time units of the built-in device types flagged `unverified` stay unverified until the step-9
  capture on real hardware.
