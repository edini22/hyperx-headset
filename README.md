# hyperx-headset

[![CI](https://github.com/edini22/hyperx-headset/actions/workflows/ci.yml/badge.svg)](https://github.com/edini22/hyperx-headset/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/edini22/hyperx-headset)](https://github.com/edini22/hyperx-headset/releases)

Battery level, sidetone, auto power-off and equalizer for the **HyperX Cloud III S Wireless**
on Linux, shown in GNOME's Quick Settings next to the other system indicators. No vendor
software; it talks to the 2.4 GHz USB dongle directly.

<p align="center">
  <img src="docs/demo.gif" alt="The top bar shows a headset icon, a battery bar and 79%. Hovering opens a menu with the battery level, sidetone, auto power-off and equalizer; Quick Settings has a HyperX toggle with the same controls." width="430">
</p>

- **Top bar:** headset icon, a battery level bar and the percentage. The bar turns orange
  at 20 % or less, the text turns yellow at 15 % or less, and ⚡ shows while charging.
  Hovering opens a small menu with the battery level and the settings.
- **Quick Settings:** a "HyperX" toggle with the battery level, a sidetone switch, auto
  power-off (never, 10, 20 or 30 min) and five equalizer presets.
- **Notification** when the battery drops to 15 %.
- **`hyperx-headset` command** for status and settings from a terminal.

Tested on Ubuntu 26.04 (kernel 7.0.0-44, GNOME Shell 50.1) with dongle `03f0:02cc`,
firmware 41.22. Dongle `03f0:06be` uses the same protocol but has not been tested here.

## How it works

```
headset ⇄ 2.4 GHz ⇄ USB dongle ─ /dev/hidrawN ─ hyperx-headset --service ─ session D-Bus ─ GNOME Shell extension
                                                (Python, speaks HID)        io.github.edini22.HyperXHeadset   (display only)
```

- The Python service is the only process that talks to the dongle. The extension only shows
  what the service publishes, so a misbehaving dongle can't affect GNOME Shell.
- The service is started by D-Bus on demand: the extension starts it at login and restarts
  it within 30 seconds if it stops.
- The `hyperx-headset` command without `--service` is a one-shot tool and can run alongside
  the service.
- The headset does not report its equalizer setting, so the last preset applied is saved in
  `~/.config/hyperx-headset/config.json` and sent again whenever the headset connects.

## Requirements

- GNOME Shell 50 (the extension's `metadata.json` declares this version).
- Python 3.10+ with PyGObject and libnotify: `sudo apt install python3-gi gir1.2-notify-0.7`.
- `sudo` once, for a udev rule and a kernel parameter (see below).

## The "deaf dongle" problem

Out of the box, Linux sees only part of what the dongle can do. Sound and the microphone work,
but battery level and settings never come back: the dongle only answers "is the headset
connected?" and ignores every other query.

The cause, found by the [HyperHeadset](https://github.com/LennardKittner/HyperHeadset/issues/36)
project: on the first enumeration after the dongle is powered, Linux asks for only 9 bytes of
its configuration descriptor, where Windows asks for 255. After a 9-byte request the dongle
stops forwarding replies from the headset until it loses power.

The kernel can be told to make the Windows-sized request for this device with the usbcore
quirk `r` (`USB_QUIRK_WINDOWS_CONFIG_REQ_SIZE`, in kernels ≥ 7.1.9 / 7.2, and backported to
Ubuntu's 7.0.0-44):

```
usbcore.quirks=03f0:02cc:r
```

`./install.sh --system` adds this to the kernel command line through
`/etc/default/grub.d/hyperx-quirk.cfg` and also sets it for the running kernel. The setting
only takes effect when the dongle is enumerated, so unplug it, wait about 5 seconds and plug
it back in (or reboot). It can't be fixed from the extension: it happens in the kernel before
any user program runs.

## Install

Download the latest [release](https://github.com/edini22/hyperx-headset/releases) or clone the
repository, then run from its folder:

```bash
git clone https://github.com/edini22/hyperx-headset.git
cd hyperx-headset
./install.sh --system
```

- Installs `~/.local/bin/hyperx-headset`, the D-Bus service file and the GNOME extension, and
  enables the extension.
- With `--system` (asks for your `sudo` password): installs the udev rule that gives your
  login session, and nobody else, access to the dongle, and the kernel parameter above.

Then:

1. Unplug the dongle, wait 5 seconds and plug it back in.
2. Log out and back in. GNOME Shell on Wayland only loads extension code at login, and
   turning an extension off and on again keeps the old code.

For later updates, run `./install.sh` without `--system`. Changes to the service apply
straight away; changes to the extension need another log out and in.

## Usage

```console
$ hyperx-headset
HyperX Cloud III S Wireless (/dev/hidraw8)
  Battery:         80%
  Microphone:      active
  Sidetone:        off
  Auto power-off:  20 min
  Equalizer:       Vocal
```

```bash
hyperx-headset --sidetone on
hyperx-headset --auto-off 30                          # 0 = never; 10, 20 or 30
hyperx-headset --eq bass                              # flat, bass, treble, v-shape, vocal
hyperx-headset --eq-custom 6,5,3,1,0,0,0,0,0,-1       # dB for 32 Hz … 16 kHz, -12 to 12
hyperx-headset --debug                                # also print the raw HID reports
```

Sidetone (hearing your own voice) only works while the headset's microphone is unmuted; the
headset ignores the request otherwise, and the switch is greyed out in the menu.

## D-Bus interface

Bus name and interface `io.github.edini22.HyperXHeadset`, object `/io/github/edini22/HyperXHeadset`,
on the session bus. Properties are read-only and announced with `PropertiesChanged`.

| Property         | Type  | Meaning                                                                           |
| ---------------- | ----- | --------------------------------------------------------------------------------- |
| `Status`         | s     | `no-dongle`, `no-access`, `connecting`, `disconnected`, `deaf`, `reading` or `ok` |
| `Message`        | s     | Short human-readable status, e.g. `80% (charging)`                                |
| `Battery`        | i     | 0–100, or -1 if unknown                                                           |
| `Charging`       | i     | 0 not charging, 1 charging, 2 fully charged, -1 unknown                           |
| `Muted`          | i     | Microphone muted: 1, 0, or -1 unknown                                             |
| `Sidetone`       | i     | 1, 0, or -1 unknown                                                               |
| `AutoOff`        | i     | Minutes (0 = never), or -1 unknown                                                |
| `Eq`             | s     | Preset key last applied by this tool, `custom`, or empty                          |
| `EqPresets`      | a(ss) | Preset keys and labels                                                            |
| `AutoOffChoices` | ai    | Allowed auto power-off values in minutes                                          |

Methods: `SetSidetone(b)`, `SetAutoOff(i)`, `SetEq(s)`, `Refresh()`. Invalid requests fail
with `io.github.edini22.HyperXHeadset.Error`.

```bash
gdbus call --session --dest io.github.edini22.HyperXHeadset --object-path /io/github/edini22/HyperXHeadset \
  --method org.freedesktop.DBus.Properties.GetAll io.github.edini22.HyperXHeadset
```

## Protocol

From [HyperHeadset PR #69](https://github.com/LennardKittner/HyperHeadset/pull/69). Commands are
64-byte HID Output reports with report ID `0x0c`, written to the dongle's hidraw node:

```
query:   0c 02 03 01 00 <cmd>
setting: 0c 02 03 00 00 <cmd> <value…>
reply:   0c 02 03 01 00 <cmd> <value> [<value>]      (value ff = no data)
event:   0d 00 00 00 <kind> <value>
```

| Command | Meaning              | Value                                               |
| ------- | -------------------- | --------------------------------------------------- |
| `02`    | headset connected    | `02` = connected                                    |
| `04`    | microphone muted     | `01` = muted                                        |
| `06`    | battery              | percentage                                          |
| `16`    | sidetone (query)     | `01` = on                                           |
| `0d`    | sidetone (set)       | `01` / `00`                                         |
| `48`    | charging             | `00` no, `01` charging, `02` full                   |
| `4b`    | auto power-off (get) | seconds, 16-bit big-endian                          |
| `4a`    | auto power-off (set) | seconds, 16-bit big-endian                          |
| `5f`    | equalizer band (set) | band 0–9, then dB × 100 as signed 16-bit big-endian |

Event kinds: `01` battery, `03` mute, `05` sidetone, `0a` charging, `0c` connected.

## Troubleshooting

- **"No replies from headset (usbcore.quirks missing)"**: the dongle is deaf. Check that
  `cat /sys/module/usbcore/parameters/quirks` includes `03f0:02cc:r`, then unplug and replug
  the dongle.
- **"No access to /dev/hidrawN"**: the udev rule is missing; run `./install.sh --system`, then
  replug the dongle.
- **"Headset off"**: the headset is off, out of range, or has not reconnected to the dongle
  yet after the dongle was replugged. Turning the headset off and on again helps.
- **Nothing in the top bar**: the percentage only shows while the headset is connected. Check
  `gnome-extensions info hyperx-headset@edini22.github.io` and the service log with
  `journalctl --user -t io.github.edini22.HyperXHeadset`.

## Development

```bash
python3 -m unittest discover -s tests    # protocol tests, using replies captured from a real dongle
tests/headless/run.sh                    # load the extension in a throwaway headless GNOME Shell
```

The same checks run in [CI](.github/workflows/ci.yml) on every push and pull request. To run the
linters locally (`uvx` comes with [uv](https://docs.astral.sh/uv/)):

```bash
uvx ruff check . && uvx ruff format --check .                                        # Python
uvx --from shellcheck-py shellcheck install.sh tests/headless/run.sh scripts/*.sh    # shell
npm ci && npm run lint && npm run format:check                                       # oxlint and oxfmt
scripts/check-version.sh                                                             # versions agree
```

[oxlint](https://oxc.rs/docs/guide/usage/linter) checks the extension's JavaScript and
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats the JavaScript, JSON, YAML, CSS and
Markdown files (`npm run format` to apply); ruff covers the Python.

`tests/headless/run.sh` starts GNOME Shell with `--headless` on its own session bus, with a
temporary settings database and the repository's copy of the extension, so you can check
extension changes without logging out. A small probe extension prints the indicator, the
Quick Settings menu and the hover menu, and opens and closes the hover menu, for example:

```
PROBE indicator visible=true children=St_Icon:true:audio-headset-symbolic:16x32 | BatteryBar:true::7x14 | St_Label:true:80%:29x18
PROBE toggle-menu PopupSubMenuMenuItem label="Auto power-off: 20 min" sensitive=true
PROBE hover open=true panelActive=true
```

`scripts/record-demo.sh` uses the same headless shell with a demo extension that opens each menu
and takes screenshots, and turns them into `docs/demo.gif`. It needs the headset connected (for a
real battery level) and Pillow (`python3-pil`).

To run the service in a terminal, stop the D-Bus-started one first:

```bash
pkill -f 'hyperx-headset --service'; hyperx-headset --service
```

## Branches and releases

- `main` holds released code only; every release is a `v*` tag on `main`.
- `dev` is where work comes together. Changes go in on a branch off `dev` (for example
  `fix/…`, `feat/…`, `docs/…`) through a pull request, and CI has to pass.
- Both branches are protected, and only the maintainer can push to them and create `v*` tags.

To release:

1. Move the `[Unreleased]` notes in [CHANGELOG.md](CHANGELOG.md) under a new version heading.
2. Set the same version in `VERSION` in `bin/hyperx-headset` and in `version-name` in the
   extension's `metadata.json`, and bump its integer `version`.
3. Merge `dev` into `main` through a pull request, then tag `main` and push the tag:
   `git tag -a v0.2.0 -m v0.2.0 && git push origin v0.2.0`.

The [release workflow](.github/workflows/release.yml) checks that the tag matches the version
and publishes a GitHub release with that version's CHANGELOG notes.

## Uninstall

```bash
./install.sh --uninstall           # CLI, D-Bus service and extension
./install.sh --uninstall --system  # also the udev rule and the kernel parameter
```

## Credits and license

The HID protocol and the analysis of the deaf-dongle problem come from
[HyperHeadset](https://github.com/LennardKittner/HyperHeadset) (MIT). This project is not
affiliated with HyperX or HP. MIT licensed; see [LICENSE](LICENSE).
