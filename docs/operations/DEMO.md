# M2 demo on Beacon

The v6 web app, running against the Firebase **emulators** on the agent node Beacon, with the
detector that is running now at the LEOPARD lab. No Firebase project is touched: the emulators hold
the demo's accounts and data, and the v5 project (`munhub-1`) is only **read**.

## Open it

- **URL:** <http://100.120.140.56:8085/> — reachable from the maintainer's devices on the Tailscale
  network (phone or laptop with Tailscale on). It is not on the public internet.
- **Account:** `demo@muonhub.test`; its password is in `~/.cache/muonhub-demo/demo.json` on Beacon
  (`ownerPassword`, file mode 600). These accounts exist only inside the emulators. To read it:
  `ssh akbase 'jq -r .ownerPassword ~/.cache/muonhub-demo/demo.json'`.
- **Pages:** `/signin` → `/app` (my stations) → the station → its stream (`/app/stream?id=…`).
- The browser shows Firebase's "running in emulator mode" notice; that is expected.

## What runs

| Service (systemd user unit) | What it does |
|---|---|
| `muonhub-demo-emulators` | Auth, Firestore and Realtime Database emulators with the v2 security rules, on Beacon's Tailscale address; data restored from the last snapshot on start |
| `muonhub-demo-mirror` | Seeds the demo account, station, device and stream (once), then every minute copies the new minutes of the public v5 profile `leopard_test` into the stream (`apps/v5-mirror`; read-only on v5, write-once on v6) |
| `muonhub-demo-web` | Serves the web app's static export (`apps/web/out`) with clean URLs on port 8085 |
| `muonhub-demo-export.timer` | Every 10 minutes, snapshots the emulators' data to `~/.cache/muonhub-demo/data` (atomic swap) |

All restart on failure and keep running after logout (lingering is on for the user).

## Commands

```bash
# status
systemctl --user status muonhub-demo-emulators muonhub-demo-mirror muonhub-demo-web
journalctl --user -u muonhub-demo-mirror -n 20 -o cat

# restart everything (data is kept: it is snapshotted first)
systemctl --user start muonhub-demo-export && \
systemctl --user restart muonhub-demo-emulators muonhub-demo-mirror muonhub-demo-web

# rebuild the web app after a change, then reload the page
bash ~/MuonHub/infra/demo/build-web.sh

# first install on a machine
bash ~/MuonHub/infra/demo/install.sh
```

## Limits

- Memory: the emulators use about 0.7 GB of Beacon's 3.3 GB.
- The mirror copies minutes as v5 recorded them: counts are uncorrected (`liveSource: "nominal"`),
  and the dashboard says so.
- Accounts created in the demo live only in the emulators; they are not MuonHub accounts.
