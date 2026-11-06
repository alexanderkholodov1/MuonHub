#!/usr/bin/env bash
# Firebase emulators (Auth, Firestore, Realtime Database) with the v2 rules; data kept across restarts.
set -euo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$DEMO_DIR/data"
import=()
[ -f "$DEMO_DIR/data/firebase-export-metadata.json" ] && import=(--import "$DEMO_DIR/data")
exec "$FIREBASE_BIN" emulators:start --only auth,firestore,database --project "$DEMO_PROJECT" \
  --config "$REPO/infra/firebase/firebase.demo.json" "${import[@]}" --export-on-exit "$DEMO_DIR/data"
