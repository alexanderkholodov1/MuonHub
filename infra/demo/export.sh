#!/usr/bin/env bash
# Periodic snapshot of the emulators' data, so a crash loses at most one interval.
set -euo pipefail
. "$(dirname "$0")/env.sh"
"$FIREBASE_BIN" emulators:export "$DEMO_DIR/data" --project "$DEMO_PROJECT" --force \
  --config "$REPO/infra/firebase/firebase.demo.json" >/dev/null
