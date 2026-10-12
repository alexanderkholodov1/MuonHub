# Agent operations guide

How to install, run, observe, and recover the MuonHub agent on a Linux machine (Ubuntu x64 first).
Spec: [`specs/0087-agent-daemon/spec.md`](../../specs/0087-agent-daemon/spec.md); decision:
[ADR-007](../decisions/adr/007-agent-runtime-headless-daemon.md). Code: [`apps/agent`](../../apps/agent).

## What runs where

| Item | Location |
|---|---|
| Service | `muonhub-agent.service`, user `muonhub`, groups `muonhub` + `dialout` |
| Node runtime | `/opt/muonhub/node` (official bundle, checksum verified by the installer) |
| Agent code | `/opt/muonhub/agent` |
| Configuration | `/etc/muonhub/agent.json` (root:muonhub, 0640) |
| State (private, 0700) | `/var/lib/muonhub`: `agent.db` (SQLite, all raw lines), `credentials` (refresh token, 0600), `panel-token` (0600), `binding.json`, `raw/*.log` |
| Runtime | `/run/muonhub/raw.sock` (raw mirror, 0660, group `muonhub`) |
| Command | `/usr/local/bin/muonhub-agent` |

## Install (Ubuntu x64)

On a build machine (or the target, if it has Node 24 and pnpm 11):

```bash
pnpm install && pnpm build
pnpm --filter @muonhub/agent deploy --prod /tmp/agent-bundle     # self-contained, production deps only
tar -czf agent-bundle.tar.gz -C /tmp agent-bundle
```

Copy `agent-bundle.tar.gz` and `apps/agent/deploy/` to the target and run:

```bash
sudo ./deploy/install.sh --bundle agent-bundle.tar.gz \
     --serial /dev/serial/by-id/usb-...      # stable path of the detector
```

The installer downloads the Node.js 24 bundle and **refuses to continue unless its SHA-256 matches the
published `SHASUMS256.txt`** (it also checks the GPG signature when the Node release keys are
present), creates the `muonhub` user (group `dialout`), installs the hardened unit, and starts the
service once `/etc/muonhub/agent.json` has no `REPLACE` placeholders left. Find the serial path with
`ls -l /dev/serial/by-id/`. Never configure `/dev/ttyACM0`: the number changes on replug.

Configuration reference: `deploy/agent.example.json` and `apps/agent/src/config.ts` (validated at
start; unknown keys are rejected). The device type is one of the built-in ones (`munra`,
`cosmicwatch-v3x`, `cosmicwatch-v2`). Baud rate comes from the device type (9600) unless `source.baud`
is set.

## First-time setup (sign in, station, device, stream)

```bash
sudo muonhub-agent panel-url        # prints http://127.0.0.1:8787/auth?token=...
ssh -L 8787:localhost:8787 <host>   # from your laptop, then open the printed address
```

The token is exchanged once for a session cookie and disappears from the address bar. It is never
written to the journal; do not share the URL. In **Setup**: sign in, pick or create a station
(**visibility has no default; choose it**, and the public location precision), then the device (type,
geometry) and stream. The password is used once and discarded; only a refresh token is kept in
`/var/lib/muonhub/credentials` (mode 0600). The agent restarts itself to bind the new stream.

**Which account.** The recommended identity is a **dedicated per-machine account** (for example
`agent-usfq-lab@...`) that the station owner adds as an **editor**. The owner revokes the machine at
any time by removing that membership. Using the owner's own account works but a compromised machine
would then control the whole account. No service-account or admin keys exist on the machine.

## Observe

```bash
systemctl status muonhub-agent
journalctl -u muonhub-agent -f            # errors: journalctl -u muonhub-agent -p err
sudo muonhub-agent status                 # JSON status of the running daemon
tail -f /var/lib/muonhub/raw/$(date -u +%F).log        # every raw line, daily files (needs access to the state dir)
sudo -u muonhub socat - UNIX-CONNECT:/run/muonhub/raw.sock   # live raw mirror, no need to stop the agent
```

Status labels you must not confuse: **device disconnected** (port gone, retrying 1 s to 30 s),
**device silent** (port open, no bytes for the silence window, default 120 s; after a second window the
port is reopened), and a **measured low rate** (data flowing). A silent device never produces
"zero-count" minutes. Other alarms shown in the panel and written to the journal at error level:
signed out, parked items, disk low, storage stopped, clock not synchronized, port busy (panel,
v5 bridge), restarts.

## Recovery runbook

| Symptom | What it means | Action |
|---|---|---|
| "signed out - data stored locally" | No valid session (reboot without restore, token revoked, password changed). Recording continues; the outbox is **paused**, nothing is parked or lost. | Panel > Setup > sign in again. Pending items upload once, in order. |
| Parked items (panel > Outbox, alarm after 1 h) | The backend rejected a write with a valid session (permission, validation, conflict). Never retried blindly, never dropped, does not block later items. | Read the reason; fix rights/data; **Retry** in the panel or `sudo -u muonhub muonhub-agent outbox retry`. **Export** as JSON lines with `outbox export file.jsonl`. |
| "disk low" | Free space under 2 GB (configurable). | Free space. At 200 MB the session ends with `storageError` and acquisition stops cleanly (no restart loop); it resumes when space is available again. Raw data is never deleted by the agent. |
| "device silent" | Port open, nothing arriving. | Check the detector power and cable; the agent reopens the port by itself. |
| "v5 bridge port busy" / panel port busy | Another process holds 8765 / 8787 (for example the old Python bridge). Recording is unaffected. | Stop the other process; the agent retries every 10 s. |
| Machine rebooted, clock not yet synchronized | Minutes are **held** until `timedatectl` reports `NTPSynchronized=yes` (up to 10 min); after that they are produced with `timeProvenance.source: "none"`, never labelled `ntp`. | Check NTP (`timedatectl`, `chronyc tracking`). |
| Process killed or power cut | On start the open session is closed (`powerLoss` if the last raw line predates the boot, otherwise `unknown`), the minute that was only in memory is counted as discarded, and the hour summary is rebuilt from the minutes stored locally. Raw lines remain. | None. |

## Revoke a machine

1. Remove the agent account's membership of the station (or disable the account, or change its
   password, in Firebase Authentication). Its writes are denied from then on.
2. On the machine: `sudo systemctl stop muonhub-agent && sudo rm /var/lib/muonhub/credentials`.
   The stored refresh token is useless once the account is removed or disabled.

## Capture a new device format

```bash
sudo systemctl stop muonhub-agent     # only one process may hold the port
muonhub-agent capture --port /dev/serial/by-id/usb-... --baud auto --minutes 2 --out capture.raw
# while the daemon runs, read its raw mirror instead:
muonhub-agent capture --from-socket /run/muonhub/raw.sock --minutes 2 --out capture.raw
```

It scans 9600, 19200, 38400, 57600 and 115200 baud, prints a hex dump and per-column statistics
(numeric range, monotonic, constant), **proposes** a device type (a suggestion only), and writes the
raw bytes as a test fixture. It refuses to run while the daemon holds the same port.

## v5 compatibility bridge

For the period until the M5 cutover the agent can serve the v5 website: set
`"bridge": {"enabled": true, "port": 8765}`. It speaks exactly the v5 protocol
(`bridge_info`, one `serial_data` per raw line, `ping`/`pong`, `status`), listens on `127.0.0.1` only,
checks `Host` and `Origin` (allowlist `bridge.allowedOrigins`), accepts only `ping` and `status`, caps
frames at 4 KB and clients at 4, and disconnects slow clients. Stop the old Python bridge first: both
cannot hold port 8765.

## 72-hour validation (spec 0087)

On the lab PC, with the real CosmicWatch: USB unplug/replug (remote `unbind`/`bind`, and once
physically), a one-hour network cut (a temporary firewall rule blocking only Firebase hosts), an agent
restart and a machine reboot. Pass criteria: only complete minutes; gaps exactly at the disruption
windows; zero duplicates; cloud minute counts equal the local raw log counts per minute; nothing lost
across the offline hour; session restored after the reboot without manual action; v5 kept recording
through the bridge; measured writes and bytes per stream-day recorded in `docs/audit/`.

## Free-tier budget (ADR-005), per stream-day (estimates; measured in step 10)

About 1 440 minute records, 17 280 live batches (5 s), 1 440 status heartbeats on the Realtime
Database; about 24 day-summary updates and a few session writes on Firestore; one persistent
connection per agent. The live window is bounded at 10 minutes. Live batches and heartbeats are best
effort and are not queued: a failed one is dropped and counted (`droppedLiveBatches`,
`droppedHeartbeats`).
