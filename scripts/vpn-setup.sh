#!/bin/bash
# One-time setup for DevLaunch's VPN button. Lets your user start and stop the
# OpenVPN command-line client as root for DevLaunch's profile only, without a
# password prompt. Run with sudo:
#   sudo /bin/bash scripts/vpn-setup.sh <your username> <DevLaunch data folder>
set -euo pipefail
USER_NAME="${1:?username}"
DATA_DIR="${2:?data dir}"
VPN_DIR="$DATA_DIR/vpn"
BIN=""
for candidate in /opt/homebrew/sbin/openvpn /usr/local/sbin/openvpn; do
  [ -x "$candidate" ] && BIN="$candidate" && break
done
[ -n "$BIN" ] || { echo "openvpn not found; install it first: brew install openvpn"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "Run this with sudo"; exit 1; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME"; exit 1; }

RULES="/etc/sudoers.d/devlaunch-vpn"
TMP="$(mktemp)"
cat > "$TMP" <<RULE
# Written by DevLaunch (scripts/vpn-setup.sh). Exactly these two commands, nothing else.
$USER_NAME ALL=(root) NOPASSWD: $BIN --config $VPN_DIR/profile.ovpn --auth-user-pass $VPN_DIR/auth.txt --daemon --log $VPN_DIR/openvpn.log --writepid $VPN_DIR/openvpn.pid --auth-nocache --data-ciphers AES-128-CBC\\:AES-256-GCM\\:AES-128-GCM --data-ciphers-fallback AES-128-CBC --allow-compression asym
$USER_NAME ALL=(root) NOPASSWD: /usr/bin/pkill -F $VPN_DIR/openvpn.pid openvpn
RULE
visudo -c -f "$TMP" >/dev/null
install -m 0440 -o root -g wheel "$TMP" "$RULES"
rm -f "$TMP"
echo "Done. DevLaunch can now start and stop the VPN for $USER_NAME."
