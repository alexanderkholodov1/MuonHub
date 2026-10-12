# Operations

How MuonHub is run: projects, environments, setup, and access.

| Document | What it covers |
|---|---|
| [`ENVIRONMENTS.md`](ENVIRONMENTS.md) | Firebase projects (`muonhub`, frozen v5 `munhub-1`, legacy `munra-1`), the local emulator, keys and secrets, deployment status, machines |
| [`FIREBASE-SETUP.md`](FIREBASE-SETUP.md) | Step-by-step console guide for the maintainer to set up Authentication, Firestore, the web app, App Check, Cloud Messaging, Remote Config, and Analytics (start of M1) |
| [`REMOTE-ACCESS.md`](REMOTE-ACCESS.md) | Tailscale SSH to the university detector PC, finding which program holds a serial port, and capturing data-format samples safely |
| [`AGENT.md`](AGENT.md) | The agent daemon: install on Ubuntu x64, first-time setup, observation, recovery runbook, revoking a machine, capturing a device format, the v5 bridge, the 72 h validation |

Sensitive operational notes never go here: they live in the git-ignored `private/` folder.
