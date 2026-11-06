#!/usr/bin/env bash
# Builds the web app for the demo: talks to the emulators on Beacon's Tailscale address.
set -euo pipefail
. "$(dirname "$0")/env.sh"
cd "$REPO/apps/web"
NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$DEMO_PROJECT.firebaseapp.com" \
NEXT_PUBLIC_FIREBASE_PROJECT_ID="$DEMO_PROJECT" \
NEXT_PUBLIC_FIREBASE_DATABASE_URL="https://$DEMO_PROJECT-default-rtdb.firebaseio.com" \
NEXT_PUBLIC_FIREBASE_APP_ID="1:0:web:demo" \
NEXT_PUBLIC_USE_EMULATORS=1 \
NEXT_PUBLIC_EMULATOR_HOST="$DEMO_HOST" \
pnpm build
