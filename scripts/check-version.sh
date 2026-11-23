#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

script=$(sed -n 's/^VERSION = "\(.*\)"$/\1/p' bin/hyperx-headset)
metadata=$(python3 -c 'import glob, json; print(json.load(open(glob.glob("extension/*/metadata.json")[0]))["version-name"])')
project=$(python3 -c 'import tomllib; print(tomllib.load(open("pyproject.toml", "rb"))["project"]["version"])')

if [[ -z $script ]]; then
    echo "no VERSION in bin/hyperx-headset" >&2
    exit 1
fi
if [[ $script != "$project" ]]; then
    echo "bin/hyperx-headset says $script but pyproject.toml says $project" >&2
    exit 1
fi
if [[ $script != "$metadata" ]]; then
    echo "bin/hyperx-headset says $script but metadata.json says $metadata" >&2
    exit 1
fi
if ! grep -q "^## \[$script\]" CHANGELOG.md; then
    echo "CHANGELOG.md has no section for $script" >&2
    exit 1
fi
if [[ $# -gt 0 && $1 != "v$script" ]]; then
    echo "tag $1 does not match version $script" >&2
    exit 1
fi
echo "$script"
