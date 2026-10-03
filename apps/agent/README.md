# MuonHub Agent

> **First-attempt code.** This package is rebuilt in milestone M1 as a headless Node.js daemon
> (ADR-007, [`docs/decisions/`](../../docs/decisions/)); the Tauri scaffold below is replaced. Known
> defects are listed in [`docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md`](../../docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md).

The agent is the standard ingestion path for physical detectors. Spec 0013 delivers the pure
TypeScript acquisition core:

- serial parser detection for CosmicWatch/MuNRa, JSON, key-value, and CSV lines;
- per-minute `MinuteRecord` aggregation with time-averaged fields and `MinuteRecordSchema`
  validation;
- local-first persistence through the `LocalStore` interface and tested in-memory store;
- idempotent offline queue flushing through `DataProvider.pushMinuteRecord`;
- a thin Tauri serial bridge scaffold under `src-tauri/`.

## CI scope

`pnpm --filter @muonhub/agent test`, `lint`, and `typecheck` validate the TypeScript core without
requiring Tauri, Rust, or a connected detector. The package build script remains a stub until the
packaging milestone.

## Manual hardware verification

The operator verifies the Tauri scaffold with the physical detector outside CI:

1. enumerate serial ports and select the detector port;
2. confirm live serial lines are emitted into the TypeScript parser path;
3. confirm malformed/partial lines are logged and skipped;
4. confirm minute records are saved locally before upload;
5. disconnect and reconnect the network, then confirm queued records flush once per
   `(detectorId, ts)`.
