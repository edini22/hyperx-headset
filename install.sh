#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "$0")" && pwd)
UUID=hyperx-headset@edini22.github.io
BIN_DIR="$HOME/.local/bin"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
EXT_DIR="$DATA_DIR/gnome-shell/extensions/$UUID"
DBUS_SERVICE="$DATA_DIR/dbus-1/services/io.github.edini22.HyperXHeadset.service"
UDEV_RULE=/etc/udev/rules.d/70-hyperx-cloud-iii-s.rules
GRUB_DROPIN=/etc/default/grub.d/hyperx-quirk.cfg
QUIRK=03f0:02cc:r
QUIRKS_PARAM=/sys/module/usbcore/parameters/quirks

usage() {
    cat <<EOF
Usage: $0 [--system] [--uninstall]

  (no options)  install the CLI, the D-Bus service and the GNOME extension for this user
  --system      also install the udev rule and the usbcore kernel parameter (uses sudo)
  --uninstall   remove what the install put in place (combine with --system for the system parts)
EOF
}

system=false
uninstall=false
for arg in "$@"; do
    case "$arg" in
        --system) system=true ;;
        --uninstall) uninstall=true ;;
        -h | --help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done

set_extension_enabled() {
    python3 -I - "$1" "$UUID" <<'PY'
import ast
import subprocess
import sys

enable, uuid = sys.argv[1] == "yes", sys.argv[2]
raw = subprocess.run(
    ["gsettings", "get", "org.gnome.shell", "enabled-extensions"], capture_output=True, text=True, check=True
).stdout.strip()
enabled = ast.literal_eval(raw.removeprefix("@as "))
if enable and uuid not in enabled:
    enabled.append(uuid)
elif not enable and uuid in enabled:
    enabled.remove(uuid)
else:
    sys.exit(0)
subprocess.run(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(enabled)], check=True)
PY
}

stop_service() {
    pkill -TERM -f '^python3 .*hyperx-headset --service' || true
}

reload_dbus() {
    busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus ReloadConfig >/dev/null 2>&1 || true
}

install_user() {
    install -Dm755 "$REPO/bin/hyperx-headset" "$BIN_DIR/hyperx-headset"
    rm -rf "$EXT_DIR"
    install -d "$EXT_DIR"
    install -m644 "$REPO/extension/$UUID/"* "$EXT_DIR/"
    install -d "$(dirname "$DBUS_SERVICE")"
    sed "s|@BINDIR@|$BIN_DIR|" "$REPO/data/io.github.edini22.HyperXHeadset.service.in" > "$DBUS_SERVICE"
    reload_dbus
    set_extension_enabled yes
    stop_service
    echo "Installed $BIN_DIR/hyperx-headset, the D-Bus service and the extension $UUID."
}

uninstall_user() {
    set_extension_enabled no
    stop_service
    rm -f "$BIN_DIR/hyperx-headset" "$DBUS_SERVICE"
    rm -rf "$EXT_DIR"
    reload_dbus
    echo "Removed the CLI, the D-Bus service and the extension (settings in ~/.config/hyperx-headset are kept)."
}

install_system() {
    sudo install -Dm644 "$REPO/data/70-hyperx-cloud-iii-s.rules" "$UDEV_RULE"
    sudo udevadm control --reload-rules
    sudo udevadm trigger --action=change --subsystem-match=hidraw
    echo "Installed $UDEV_RULE."

    if command -v update-grub >/dev/null; then
        sudo install -Dm644 "$REPO/data/hyperx-quirk.cfg" "$GRUB_DROPIN"
        sudo update-grub
        echo "Installed $GRUB_DROPIN (kernel parameter usbcore.quirks=$QUIRK from the next boot)."
    else
        echo "update-grub not found: add usbcore.quirks=$QUIRK to your kernel command line yourself." >&2
    fi

    local current
    current=$(cat "$QUIRKS_PARAM")
    if [[ $current != *"${QUIRK%:*}"* ]]; then
        echo "${current:+$current,}$QUIRK" | sudo tee "$QUIRKS_PARAM" >/dev/null
        echo "Set the quirk for this boot. Unplug the dongle, wait 5 seconds and plug it back in."
    fi
}

uninstall_system() {
    sudo rm -f "$UDEV_RULE"
    sudo udevadm control --reload-rules
    if [[ -e $GRUB_DROPIN ]]; then
        sudo rm -f "$GRUB_DROPIN"
        command -v update-grub >/dev/null && sudo update-grub
    fi
    echo "Removed $UDEV_RULE and $GRUB_DROPIN."
}

if $uninstall; then
    uninstall_user
    if $system; then uninstall_system; fi
else
    install_user
    if $system; then install_system; fi
    echo "Log out and back in to load extension changes (GNOME Shell on Wayland only loads extension code at login)."
fi
