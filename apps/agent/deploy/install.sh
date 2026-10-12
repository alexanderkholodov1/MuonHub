#!/usr/bin/env bash
# MuonHub agent installer for Ubuntu x64 (spec 0087 FR1, B-M1-20).
#
# Installs, as root:
#   - the official Node.js runtime bundle, after verifying its SHA-256 checksum against the
#     SHASUMS256.txt published next to it and, when `gpg` is installed, that file's GPG signature
#     (a failed verification stops the install; import the Node release keys first, see below);
#   - the agent bundle (a tarball made by `pnpm deploy`, see docs/operations/AGENT.md);
#   - the `muonhub` system user (group dialout), the directories, the hardened systemd unit.
#
# Usage:
#   sudo ./install.sh --bundle agent-bundle.tar.gz --serial /dev/serial/by-id/usb-... \
#        [--node-version 24.x.y] [--bundle-sha256 <hex>] [--skip-gpg]
#
# --bundle-sha256  refuse the agent bundle unless its SHA-256 matches (record it when you build it).
# --skip-gpg       explicit opt-out of the GPG check (the SHA-256 check always runs).
# Node release keys: https://github.com/nodejs/release-keys (import them with gpg before installing).
#
# Nothing is started until a configuration with a real serial path exists.
set -euo pipefail

NODE_VERSION=""
BUNDLE=""
SERIAL=""
BUNDLE_SHA256=""
SKIP_GPG=0
PREFIX=/opt/muonhub
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "install: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node-version) NODE_VERSION="${2:-}"; shift 2 ;;
    --bundle) BUNDLE="${2:-}"; shift 2 ;;
    --serial) SERIAL="${2:-}"; shift 2 ;;
    --bundle-sha256) BUNDLE_SHA256="${2:-}"; shift 2 ;;
    --skip-gpg) SKIP_GPG=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "run as root (sudo)"
[[ "$(uname -m)" == "x86_64" ]] || die "this installer is for x86_64 (Ubuntu x64); got $(uname -m)"
command -v systemctl >/dev/null || die "systemd is required"
command -v curl >/dev/null || die "curl is required (apt install curl)"
command -v sha256sum >/dev/null || die "sha256sum is required"
command -v xz >/dev/null || die "xz is required (apt install xz-utils)"
if [[ -n "$SERIAL" ]]; then
  [[ "$SERIAL" =~ ^/dev/serial/by-id/[A-Za-z0-9._:+-]+$ ]] || die "--serial must match ^/dev/serial/by-id/[A-Za-z0-9._:+-]+$ (got '$SERIAL')"
fi
if [[ -n "$BUNDLE_SHA256" ]]; then
  [[ "$BUNDLE_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || die "--bundle-sha256 must be 64 hex digits"
fi
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
if [[ $SKIP_GPG -eq 0 ]] && command -v gpg >/dev/null; then
  curl -fsSL "$BASE/v${NODE_VERSION}/SHASUMS256.txt.sig" -o "$TMP/SHASUMS256.txt.sig" \
    || die "could not download SHASUMS256.txt.sig (use --skip-gpg to rely on the checksum only)"
  gpg --verify "$TMP/SHASUMS256.txt.sig" "$TMP/SHASUMS256.txt" >/dev/null 2>&1 \
    || die "GPG verification of SHASUMS256.txt failed (are the Node release keys imported? https://github.com/nodejs/release-keys; or pass --skip-gpg)"
  echo "install: SHASUMS256.txt signature verified"
elif [[ $SKIP_GPG -eq 0 ]]; then
  echo "install: note: gpg is not installed; the Node.js download is verified by SHA-256 only" >&2
fi
( cd "$TMP" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c - ) || die "SHA-256 checksum of ${TARBALL} does not match SHASUMS256.txt; refusing to install"
mkdir -p "$PREFIX"
tar --no-same-owner -xJf "$TMP/${TARBALL}" -C "$PREFIX"
chown -R root:root "$PREFIX/node-v${NODE_VERSION}-linux-x64"
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
if [[ -n "$BUNDLE_SHA256" ]]; then
  echo "${BUNDLE_SHA256}  ${BUNDLE}" | sha256sum -c - >/dev/null || die "SHA-256 of the agent bundle does not match --bundle-sha256; refusing to install"
fi
rm -rf "$PREFIX/agent.new"
mkdir -p "$PREFIX/agent.new"
tar --no-same-owner -xzf "$BUNDLE" -C "$PREFIX/agent.new" --strip-components=1
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
install -m 0644 "$HERE/muonhub-agent-panel.socket" /etc/systemd/system/muonhub-agent-panel.socket
systemctl daemon-reload
systemctl enable muonhub-agent-panel.socket muonhub-agent.service
systemctl start muonhub-agent-panel.socket

if grep -q REPLACE /etc/muonhub/agent.json; then
  echo "install: the configuration still has REPLACE placeholders; the service was enabled but NOT started."
  echo "         edit /etc/muonhub/agent.json, then: sudo systemctl start muonhub-agent"
else
  systemctl restart muonhub-agent.service
  echo "install: started. Check: systemctl status muonhub-agent; journalctl -u muonhub-agent -f"
fi
echo "install: panel address (run on this machine): sudo muonhub-agent panel-url"
