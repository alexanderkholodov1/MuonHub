#!/usr/bin/env bash
# Deploys the web app to a Firebase Hosting **preview channel** of `muonhub`: a temporary URL
# (https://muonhub--<channel>-<hash>.web.app) that expires by itself. The live site, the databases
# and their rules are not touched.
#
#   bash infra/firebase/deploy-web-preview.sh [channel] [expires]     # defaults: landing 30d
#
# Builds from the committed tree only (a dirty tree is refused), with the project's public web
# configuration read from Firebase. Needs the Firebase CLI signed in on this machine with an account
# that can deploy `muonhub` (`firebase login --no-localhost`).
set -euo pipefail
CHANNEL="${1:-landing}"
EXPIRES="${2:-30d}"
PROJECT=muonhub
APP_ID="1:1062287112089:web:2a3b6cdc5f3ca300c84508"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FB="$REPO/apps/agent/node_modules/.bin/firebase"
cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree has changes: commit them first (a preview is built from a commit)." >&2
  exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"

# Public by design (the security rules protect the data); read, never stored in the repository.
API_KEY="$("$FB" apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" --json |
  jq -r '.result.sdkConfig.apiKey // (.result.fileContents | capture("\"apiKey\": *\"(?<k>[^\"]+)\"").k)')"
if [ -z "$API_KEY" ] || [ "$API_KEY" = "null" ]; then
  echo "Could not read the web app's configuration from $PROJECT." >&2
  exit 1
fi

pnpm exec turbo run build --filter=@muonhub/web^... --concurrency=1 --output-logs=errors-only
rm -rf apps/web/.next apps/web/out
(
  cd apps/web
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_FIREBASE_API_KEY="$API_KEY" \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$PROJECT.firebaseapp.com" \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PROJECT" \
  NEXT_PUBLIC_FIREBASE_DATABASE_URL="https://$PROJECT-default-rtdb.firebaseio.com" \
  NEXT_PUBLIC_FIREBASE_APP_ID="$APP_ID" \
  NEXT_PUBLIC_USE_EMULATORS=0 \
  pnpm build
)

"$FB" hosting:channel:deploy "$CHANNEL" --project "$PROJECT" --expires "$EXPIRES" \
  --config infra/firebase/firebase.json --json |
  jq -r --arg c "$COMMIT" '.result | to_entries[] | "\(.value.url)  (commit \($c), expires \(.value.expireTime))"'
