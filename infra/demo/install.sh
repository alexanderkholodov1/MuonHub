#!/usr/bin/env bash
# Installs and starts the demo as user services that restart on failure and survive logout.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p "$HOME/.config/systemd/user"
cp systemd/*.service systemd/*.timer "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now muonhub-demo-emulators.service muonhub-demo-mirror.service \
  muonhub-demo-web.service muonhub-demo-export.timer
