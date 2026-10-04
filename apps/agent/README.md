# MuonHub Agent

> **First-attempt code, being replaced.** This package becomes a headless Node.js daemon in milestone
> M1 (ADR-007, [`docs/decisions/`](../../docs/decisions/); plan:
> [`docs/product/plans/M1-core-agent.md`](../../docs/product/plans/M1-core-agent.md)). The Tauri/Rust
> shell was removed in M1 step 1. Known defects of the remaining first-attempt core are listed in
> [`docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md`](../../docs/audit/2026-10-02-V6-RESET-SESSION-RECORD.md).

What remains here until the daemon replaces it is the first-attempt TypeScript core (spec 0013):

- serial line parsers for CosmicWatch/MuNRa, JSON, key-value, and CSV lines;
- per-minute aggregation validated with the first-attempt `MinuteRecordSchema`;
- the `LocalStore` interface with an in-memory store;
- an offline queue flushing through `DataProvider.pushMinuteRecord`.

## CI scope

`pnpm --filter @muonhub/agent test`, `lint`, and `typecheck` validate this TypeScript core. The
package has no build output until the daemon exists.
