#!/usr/bin/env bash
# Loads the repo's extension in a throwaway headless GNOME Shell (own session bus and settings)
# and prints what the probe extension reports, so changes can be checked without logging out.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
RUN_SECONDS=${1:-24}
work=$(mktemp -d)
runtime=/run/user/$(id -u)/hx-test-$$

cleanup() {
    sleep 1
    rm -rf "$work" "$runtime" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$work/data/gnome-shell/extensions" "$work/data/dbus-1/services" "$work/config" "$runtime"
chmod 700 "$runtime"
ln -s "$REPO/extension/hyperx-headset@edini22.github.io" "$REPO/tests/headless/probe@local" "$work/data/gnome-shell/extensions/"
sed "s|@BINDIR@|$REPO/bin|" "$REPO/data/io.github.edini22.HyperXHeadset.service.in" \
    > "$work/data/dbus-1/services/io.github.edini22.HyperXHeadset.service"

# shellcheck disable=SC2016  # $0 is expanded by the inner bash, not here
env -u WAYLAND_DISPLAY -u DISPLAY -u DBUS_SESSION_BUS_ADDRESS \
    XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_RUNTIME_DIR="$runtime" \
    dbus-run-session -- bash -c '
        gsettings set org.gnome.shell enabled-extensions "[\"hyperx-headset@edini22.github.io\", \"probe@local\"]"
        timeout "$0" gnome-shell --headless --no-x11 --virtual-monitor 1280x800 --wayland-display hx 2>&1
    ' "$RUN_SECONDS" 2>/dev/null \
    | grep -E 'PROBE|JS ERROR|had error|TypeError|ReferenceError' \
    | sed 's/^GNOME Shell-Message: [0-9:.]*: //' || true
