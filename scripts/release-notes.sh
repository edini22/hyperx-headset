#!/usr/bin/env bash
# Prints the CHANGELOG.md section for the given version (without its heading and link references).
set -euo pipefail
cd "$(dirname "$0")/.."

version=${1#v}
notes=$(awk -v v="$version" '
    /^## \[/ { p = index($0, "[" v "]") > 0; next }
    /^\[[^]]+\]: / { p = 0 }
    p
' CHANGELOG.md)

if [[ -z ${notes//[[:space:]]/} ]]; then
    echo "CHANGELOG.md has no notes for $version" >&2
    exit 1
fi
printf '%s\n' "$notes"
