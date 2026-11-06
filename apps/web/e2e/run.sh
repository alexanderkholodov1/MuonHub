#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Always build for this isolated emulator project, never for the demo or production.
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-muonhub.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-muonhub
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-muonhub-default-rtdb.firebaseio.com
export NEXT_PUBLIC_FIREBASE_APP_ID=1:0:web:demo
export NEXT_PUBLIC_USE_EMULATORS=1
export NEXT_PUBLIC_EMULATOR_HOST=127.0.0.1
export NEXT_PUBLIC_AUTH_GOOGLE=0

pnpm build
pnpm exec playwright test --config e2e/playwright.config.ts
