# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Demo GIF in the README, recorded by `scripts/record-demo.sh` in a headless GNOME Shell.

### Changed

- The extension's JavaScript is checked with oxlint and formatted with oxfmt instead of ESLint;
  oxfmt also formats the JSON, YAML, CSS and Markdown files.
- CI also runs on pushes to `dev`.

### Fixed

- The battery level bar in the hover menu and in the HyperX Quick Settings menu was invisible,
  because the theme gives no height to level bars outside the on-screen display.

## [0.1.0] - 2026-11-23

First release.

### Added

- `hyperx-headset` command: shows battery, charging state, microphone mute, sidetone, auto
  power-off and equalizer, and sets sidetone (`--sidetone`), auto power-off (`--auto-off`),
  an equalizer preset (`--eq`) or custom gains (`--eq-custom`).
- `hyperx-headset --service`: session D-Bus service `io.github.edini22.HyperXHeadset`, started
  on demand, that keeps the headset state up to date from the dongle's replies and events,
  re-applies the saved equalizer preset when the headset connects, and notifies at 15 % battery.
- GNOME Shell 50 extension `hyperx-headset@edini22.github.io`: headset icon, battery level bar
  and percentage in the Quick Settings indicator area, a menu that opens on hover, and a
  "HyperX" toggle in Quick Settings with sidetone, auto power-off and equalizer controls.
- `install.sh` with `--system` (udev rule and the `usbcore.quirks=03f0:02cc:r` kernel parameter)
  and `--uninstall`.
- Protocol unit tests based on replies captured from a real dongle, and
  `tests/headless/run.sh` to check the extension in a headless GNOME Shell.

[Unreleased]: https://github.com/edini22/hyperx-headset/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/edini22/hyperx-headset/releases/tag/v0.1.0
