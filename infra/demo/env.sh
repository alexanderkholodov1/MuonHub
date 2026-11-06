# Shared settings of the M2 demo on Beacon (see docs/operations/DEMO.md).
export DEMO_HOST="${DEMO_HOST:-100.120.140.56}"
export EMULATOR_HOST="$DEMO_HOST"
export DEMO_PROJECT="demo-muonhub"
export DEMO_DIR="${DEMO_DIR:-$HOME/.cache/muonhub-demo}"
export REPO="${REPO:-$HOME/MuonHub}"
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
export JAVA_TOOL_OPTIONS="-Xmx384m"
export FIREBASE_BIN="$REPO/apps/agent/node_modules/.bin/firebase"
