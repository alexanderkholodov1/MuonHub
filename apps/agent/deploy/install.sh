#!/usr/bin/env bash
# MuonHub agent installer for Ubuntu x64 (spec 0087 FR1, B-M1-20).
#
# Installs, as root:
#   - the official Node.js runtime bundle, after verifying its SHA-256 checksum against the
#     SHASUMS256.txt published next to it (and its GPG signature when `gpg` is available);
#   - the agent bundle (a tarball made by `pnpm deploy`, see docs/operations/AGENT.md);
#   - the `muonhub` system user (group dialout), the directories, the hardened systemd unit.
#
# Usage:
#   sudo ./install.sh --bundle agent-bundle.tar.gz --serial /dev/serial/by-id/usb-... [--node-version 24.x.y]
#
# Nothing is started until a configuration with a real serial path exists.
set -euo pipefail

NODE_VERSION=""
BUNDLE=""
SERIAL=""
PREFIX=/opt/muonhub
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "install: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node-version) NODE_VERSION="${2:-}"; shift 2 ;;
    --bundle) BUNDLE="${2:-}"; shift 2 ;;
    --serial) SERIAL="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "run as root (sudo)"
[[ "$(uname -m)" == "x86_64" ]] || die "this installer is for x86_64 (Ubuntu x64); got $(uname -m)"
command -v systemctl >/dev/null || die "systemd is required"
command -v curl >/dev/null || die "curl is required (apt install curl)"
command -v sha256sum >/dev/null || die "sha256sum is required"
command -v xz >/dev/null || die "xz is required (apt install xz-utils)"
[[ -n "$BUNDLE" && -f "$BUNDLE" ]] || die "--bundle <agent tarball> is required (see docs/operations/AGENT.md)"
if [[ -r /etc/os-release ]] && ! grep -qi '^ID=ubuntu' /etc/os-release; then
  echo "install: warning: this is tested on Ubuntu only" >&2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Node.js runtime, checksum verified ---------------------------------------------------------
BASE="https://nodejs.org/dist"
if [[ -z "$NODE_VERSION" ]]; then
  curl -fsSL "$BASE/latest-v24.x/SHASUMS256.txt" -o "$TMP/latest.txt"
  NODE_VERSION="$(grep -o 'node-v24\.[0-9]*\.[0-9]*-linux-x64\.tar\.xz' "$TMP/latest.txt" | head -n1 | sed 's/node-v//; s/-linux-x64.tar.xz//')"
  [[ -n "$NODE_VERSION" ]] || die "could not determine the latest Node 24 version"
fi
[[ "$NODE_VERSION" =~ ^24\.[0-9]+\.[0-9]+$ ]] || die "node version must be 24.x.y, got '$NODE_VERSION'"
TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"
echo "install: downloading Node.js v${NODE_VERSION}"
curl -fsSL "$BASE/v${NODE_VERSION}/${TARBALL}" -o "$TMP/${TARBALL}"
curl -fsSL "$BASE/v${NODE_VERSION}/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
if command -v gpg >/dev/null && curl -fsSL "$BASE/v${NODE_VERSION}/SHASUMS256.txt.sig" -o "$TMP/SHASUMS256.txt.sig" 2>/dev/null; then
  if gpg --verify "$TMP/SHASUMS256.txt.sig" "$TMP/SHASUMS256.txt" >/dev/null 2>&1; then
    echo "install: SHASUMS256.txt signature verified"
  else
    echo "install: note: could not verify the SHASUMS256.txt signature (Node release keys not imported); continuing with the checksum only" >&2
  fi
fi
( cd "$TMP" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c - ) || die "SHA-256 checksum of ${TARBALL} does not match SHASUMS256.txt; refusing to install"
mkdir -p "$PREFIX"
tar -xJf "$TMP/${TARBALL}" -C "$PREFIX"
ln -sfn "$PREFIX/node-v${NODE_VERSION}-linux-x64" "$PREFIX/node"
"$PREFIX/node/bin/node" --version

# --- user, directories ---------------------------------------------------------------------------
if ! id -u muonhub >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/muonhub --no-create-home --shell /usr/sbin/nologin muonhub
fi
usermod -aG dialout muonhub
install -d -m 0755 "$PREFIX/agent"
install -d -o root -g muonhub -m 0750 /etc/muonhub

# --- agent bundle --------------------------------------------------------------------------------
rm -rf "$PREFIX/agent.new"
mkdir -p "$PREFIX/agent.new"
tar -xzf "$BUNDLE" -C "$PREFIX/agent.new" --strip-components=1
[[ -f "$PREFIX/agent.new/dist/cli.js" ]] || die "the bundle has no dist/cli.js"
rm -rf "$PREFIX/agent.old"
[[ -d "$PREFIX/agent" ]] && mv "$PREFIX/agent" "$PREFIX/agent.old"
mv "$PREFIX/agent.new" "$PREFIX/agent"
chown -R root:root "$PREFIX/agent"

# --- configuration -------------------------------------------------------------------------------
if [[ ! -f /etc/muonhub/agent.json ]]; then
  install -o root -g muonhub -m 0640 "$HERE/agent.example.json" /etc/muonhub/agent.json
  if [[ -n "$SERIAL" ]]; then
    sed -i "s#/dev/serial/by-id/REPLACE-WITH-YOUR-DEVICE#${SERIAL}#" /etc/muonhub/agent.json
  fi
  echo "install: wrote /etc/muonhub/agent.json - edit the serial path and the Firebase settings"
fi

# --- command and unit ----------------------------------------------------------------------------
cat >/usr/local/bin/muonhub-agent <<'WRAP'
#!/bin/sh
exec /opt/muonhub/node/bin/node /opt/muonhub/agent/dist/cli.js "$@"
WRAP
chmod 0755 /usr/local/bin/muonhub-agent
install -m 0644 "$HERE/muonhub-agent.service" /etc/systemd/system/muonhub-agent.service
systemctl daemon-reload
systemctl enable muonhub-agent.service

if grep -q REPLACE /etc/muonhub/agent.json; then
  echo "install: the configuration still has REPLACE placeholders; the service was enabled but NOT started."
  echo "         edit /etc/muonhub/agent.json, then: sudo systemctl start muonhub-agent"
else
  systemctl restart muonhub-agent.service
  echo "install: started. Check: systemctl status muonhub-agent; journalctl -u muonhub-agent -f"
fi
echo "install: panel address (run on this machine): sudo muonhub-agent panel-url"
