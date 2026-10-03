# ADR-002 — Local agent framework (serial reading + offline)

- **Status:** accepted (D5, D31). Decision: **Tauri** as primary; Go as documented fallback.
- **Context:** the "agent" is our own software running on the detector's PC. It handles serial
  reading (Windows/macOS/Linux), parsing (see `SERIAL-FORMATS.md`), **local SQLite backup**,
  an idempotent offline sync queue, **signed auto-update**, and one-click installation for
  non-technical university users. The framework is only the packaging and hardware-access
  tooling; all logic (parser, buffer, sync) is ours in `apps/agent`.

## Clarification

"Can we build our own agent?" — **Yes, and we do.** Tauri/Go/Electron are packaging toolkits
for hardware access; all logic (parser, buffer, sync) is written by us in `apps/agent`. The
decision is **which toolkit** minimises friction and risk.

## Options evaluated

| Option | Footprint | Serial | UI | Auto-update | Verdict |
|--------|-----------|--------|----|-------------|---------|
| **Tauri** (Rust + web UI) | ~3–10 MB, low RAM | `serialport` crate (mature) | reuses React (consistent with web app) | **signed updater built-in** | ✅ **Primary** |
| **Go** (static binary) | ~5–15 MB, very low RAM | `go.bug.st/serial` (excellent) | system tray + local page, or headless | via library or custom | 🟢 **Strong alternative** (simplest as a headless daemon) |
| Electron (Node + Chromium) | 100+ MB, high RAM | `serialport` npm (mature) | React | `electron-updater` | 🟠 Too heavy for a background logger |
| Packaged Node (pkg/nexe) | medium | `serialport` (native modules, fragile to package) | local web/tray | custom | 🟠 Fragile native packaging |
| Python (PyInstaller) | large | `pyserial` (reference) | — | difficult | 🔴 Not rejected for the language — rejected for **distribution friction** |

> **Note on Python:** the goal is **one-click installation** — the user must not download
> source code, install a Python runtime, or run scripts manually (that fails in the field).
> Python is excellent for prototypes and server-side; it is only avoided as a **end-user
> agent** because packaging it into a clean, dependency-free installer is fragile. Any chosen
> option must ship as a one-click installer.

| PWA + Web Serial | zero (no install) | Web Serial (Chromium only) | the web app | automatic (it is a web page) | 🟡 **Complement** — zero-install path for demos, does not replace the agent (no background operation, no Firefox/Safari) |

## Decision

**Primary: Tauri.** Minimal footprint, built-in signed auto-updater, **UI consistent** with the
web app (same React/Tailwind), strong security model. Aligns with the web/TS team and with the
good-UX principle (D23). Chosen for the `apps/agent` implementation.

**Documented fallback: Go.** If Rust serial access or Tauri packaging prove problematic, or if
a headless daemon is preferred for lab PCs and data-acquisition servers, Go provides the same
architecture (parser/buffer/sync logic ported, not rewritten) with even lower overhead.

**Complement: PWA + Web Serial** for zero-install demos in Chromium. Not a replacement for the
agent (no offline robustness, browser-only).

## Consequences

- The **serial parser and sync logic are designed framework-agnostic** (clean modules) so that
  switching from Tauri to Go requires only replacing the shell, not rewriting the logic.
- The agent communicates with the cloud **only through the same `DataProvider` API** — never
  directly against a backend SDK.
- Risk R-serial (Rust): mitigated because the `serialport` Rust crate is mature and actively
  maintained; the Go fallback remains documented if this changes.
- The `apps/agent` spec references this ADR; scope and acceptance criteria there depend on
  the Tauri tech stack confirmed here.
