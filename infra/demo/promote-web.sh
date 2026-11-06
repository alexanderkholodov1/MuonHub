#!/usr/bin/env bash
# Promotes the current build (apps/web/out) to the served demo under a name, keeping earlier builds:
#   promote-web.sh 2.2        serve apps/web/out as "2.2"
#   promote-web.sh --back 2.1 serve the kept build "2.1" again
set -euo pipefail
. "$(dirname "$0")/env.sh"
dir="$DEMO_DIR/web"
mkdir -p "$dir"
if [ "${1:-}" = "--back" ]; then
  [ -d "$dir/$2" ] || { echo "no kept build $2" >&2; exit 1; }
  ln -sfn "$dir/$2" "$dir/current"
else
  name="${1:?usage: promote-web.sh <name> | --back <name>}"
  rm -rf "$dir/$name.tmp" && cp -a "$REPO/apps/web/out" "$dir/$name.tmp"
  rm -rf "$dir/$name" && mv "$dir/$name.tmp" "$dir/$name"
  ln -sfn "$dir/$name" "$dir/current"
fi
echo "serving $(readlink "$dir/current")"
