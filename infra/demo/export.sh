#!/usr/bin/env bash
# Periodic snapshot of the emulators' data, so a crash loses at most one interval. It asks the
# emulator hub directly (the CLI's `emulators:export` relies on a locator file that this setup does not
# leave behind), writes a new copy, and swaps it in only when the export succeeded.
set -euo pipefail
. "$(dirname "$0")/env.sh"
new="$DEMO_DIR/data-new"
rm -rf "$new" && mkdir -p "$new"
answer=$(curl -s -m 300 -X POST "http://127.0.0.1:4410/_admin/export" \
  -H 'Content-Type: application/json' -d "{\"path\":\"$new\",\"initiatedBy\":\"export\"}")
case "$answer" in *'"OK"'*) ;; *) echo "export failed: $answer" >&2; exit 1 ;; esac
[ -f "$new/firebase-export-metadata.json" ] || { echo "export left no metadata" >&2; exit 1; }
rm -rf "$DEMO_DIR/data-old"
[ -d "$DEMO_DIR/data" ] && mv "$DEMO_DIR/data" "$DEMO_DIR/data-old"
mv "$new" "$DEMO_DIR/data"
rm -rf "$DEMO_DIR/data-old"
echo "snapshot saved: $(du -sh "$DEMO_DIR/data" | cut -f1)"
