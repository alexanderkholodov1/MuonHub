# ADR-007 — Agent runtime: headless daemon

- **Status:** Accepted
- **Date:** 2026-10-03
- **Supersedes:** ADR-002 (Tauri), D5. **Amends:** D31.

## Context

- **Where the agent runs.** The agent reads devices over serial and keeps raw data in a local store
  (ADR-006). It syncs to Firebase when online and must work fully offline. The real deployments
  are:
  - a lab PC running **Ubuntu at the university**, unattended and administered remotely
    (Tailscale + SSH);
  - **Raspberry Pi** units collecting offline;
  - later, Windows and macOS machines of users who bring their own detector.
- **A lesson from v5:** after a reboot, the uploader's session was not restored, and writes were
  rejected silently.
- **What the old ADR assumed.** ADR-002 chose Tauri (Rust + webview) for a desktop GUI with a
  signed updater, an assumption that predates these deployments.

## Decision

The agent is a **headless Node.js 24 LTS daemon written in TypeScript**.

**How it runs:**
- It runs as a **systemd service** on Linux: it starts with the machine without anyone logging in,
  and restarts on failure.
- It shares parsers, physics, and zod schemas with the monorepo.

**What it uses:**
- Serial port access: `serialport`, whose 13.x prebuilt binaries cover Linux x64/arm64, Windows,
  and macOS, so no compiler is needed.
- Local storage: `node:sqlite`, with `better-sqlite3` as the fallback.
- Interface: a **local web panel** on `localhost`. From the maintainer's laptop it is reached
  through an SSH tunnel.
- Identity: the agent signs in with the user's MuonHub account. **No admin keys live on device
  machines** (ADR-009).

**What it provides:**
- A **raw tee:** every raw line also goes to a log and a socket. The port can then be observed
  remotely without stopping acquisition, and only one process ever opens the port.
- A `capture` command for **format discovery**: baud scan, hex dump, column statistics, a proposed
  device type, and the capture saved as a test fixture.

### Comparison that led to the decision

| Criterion | Daemon (Node/TypeScript) | Tauri (Rust + webview) |
|---|---|---|
| Remote, unattended Ubuntu PC | Starts at boot without a login | A desktop app; starts when someone logs into the desktop |
| After a power cut | Comes back and restarts by itself | Does not record until someone logs into the desktop |
| Remote administration (Tailscale) | SSH plus the web panel through a tunnel | Needs remote desktop to see the window |
| Headless Raspberry Pi | Natural | Forced (needs a desktop and a webview) |
| Code | One language, shared parsers/physics/schemas | Serial access in Rust, logic in TypeScript: two codebases to keep in sync |
| Toolchain and distribution | Node | Rust, per-platform builds, mandatory updater signing keys, macOS notarisation (paid Apple developer program) |
| **Where Tauri is better** | — | Double-click installer and tray icon for non-technical users on Windows/macOS |

**Mitigation for Tauri's advantage:**
- the daemon's panel opens in a normal browser, so the experience is the same;
- a friendlier Windows/macOS installer is planned for M4 (Bring Your Own Detector), when it is
  actually needed.

## Risks

| Risk | Mitigation |
|---|---|
| `serialport` is maintained, but its last release was in December 2024 | The PoC exercises it; plan C exists |
| `node:sqlite` is a release candidate (Node 24.15) | `better-sqlite3` behind the same `LocalStore` interface |
| Installing a service on Windows is less trivial than on Linux | Deferred to M4; Linux first |
| Bun cannot be used for single-binary builds | Ruled out: serial callbacks never fire (open N-API event-loop issue oven-sh/bun#23192). Packaging uses the official Node binary; the exact format is decided in the M1 spec |

## Validation (M1)

**72-hour soak test** on the Ubuntu lab PC and on a Raspberry Pi. It must show:

- USB unplug/replug survived;
- network loss survived;
- a forced restart survived;
- no gaps and no duplicates in the stored data.

**Plan C**, if the PoC fails: a Go agent (`go.bug.st/serial`, a cgo-free SQLite driver). It
cross-compiles cleanly, but loses TypeScript code sharing and needs the contracts kept in sync.

## Consequences

- The Rust/Tauri shell is removed from the agent in M1; ADR-002 is superseded.
- The agent's local panel reuses the design system (`packages/ui`).
- Remote access setup (Tailscale SSH on Linux) is documented under `docs/operations/`.
- Packaging and auto-update are specified in M1. Expected approach: a per-platform bundle with
  the official Node binary, plus a checksummed update channel.

## Alternatives considered

- **Tauri:** rejected for the reasons in the table.
- **Electron:** rejected. It is heavier than Tauri and has the same desktop-session problem.
- **Python:** rejected. Packaging is the weakest option, and no code is shared with TypeScript.
- **Go:** kept as plan C.

## Sources

- `serialport` registry: <https://registry.npmjs.org/serialport>
- `node:sqlite`: <https://nodejs.org/docs/latest-v24.x/api/sqlite.html>
- Bun issue: <https://github.com/oven-sh/bun/issues/23192>
- Tailscale SSH: <https://tailscale.com/kb/1193/tailscale-ssh>
- Tauri updater: <https://v2.tauri.app/plugin/updater/>
