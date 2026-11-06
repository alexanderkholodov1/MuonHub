#!/usr/bin/env bash
# Seeds the demo accounts and stream (idempotent), then mirrors the running v5 detector read-only.
set -euo pipefail
. "$(dirname "$0")/env.sh"
for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://$EMULATOR_HOST:9000/.json?ns=$DEMO_PROJECT-default-rtdb" && break
  sleep 5
done
cd "$REPO/apps/v5-mirror"
node dist/seed-demo.js
exec node dist/main.js
