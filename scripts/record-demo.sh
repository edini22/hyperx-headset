#!/usr/bin/env bash
# Records docs/demo.gif from screenshots of the extension in a headless GNOME Shell.
# Needs a connected headset (for a real battery level) and Pillow (python3-pil).
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
OUTPUT=${1:-$REPO/docs/demo.gif}
frames=$(mktemp -d)
trap 'rm -rf "$frames"' EXIT

HYPERX_DEMO_DIR="$frames" PROBE=demo@local "$REPO/tests/headless/run.sh" 40

python3 -I - "$frames" "$OUTPUT" <<'PY'
import sys
from pathlib import Path

from PIL import Image, ImageChops

frames_dir, output = Path(sys.argv[1]), Path(sys.argv[2])
paths = sorted(frames_dir.glob("*.png"))
if len(paths) < 2:
    sys.exit(f"expected several frames in {frames_dir}, found {len(paths)}")

images = [Image.open(path).convert("RGB") for path in paths]
width, height = images[0].size
panel_height = 40
below_panel = (0, panel_height, width, height)
left, bottom = width, panel_height
for image in images[1:]:
    box = ImageChops.difference(images[0].crop(below_panel), image.crop(below_panel)).getbbox()
    if box:
        left, bottom = min(left, box[0]), max(bottom, box[3] + panel_height)
margin = 16
crop = (max(0, left - margin), 0, width, min(height, bottom + margin))

cropped = [image.crop(crop) for image in images]
sheet = Image.new("RGB", (cropped[0].width, cropped[0].height * len(cropped)))
for index, image in enumerate(cropped):
    sheet.paste(image, (0, index * image.height))
# The battery bar is a handful of pixels, so its colours are reserved instead of left to quantization.
reserved = [(0x15, 0xC9, 0x31), (0xFF, 0x78, 0x00)]
shared = sheet.quantize(colors=256 - len(reserved), method=Image.Quantize.MEDIANCUT).getpalette()
palette = Image.new("P", (1, 1))
palette.putpalette(shared[: (256 - len(reserved)) * 3] + [channel for color in reserved for channel in color])

durations = [1500] + [2200] * (len(images) - 2) + [3000]
palette_frames = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in cropped]
output.parent.mkdir(parents=True, exist_ok=True)
palette_frames[0].save(
    output, save_all=True, append_images=palette_frames[1:], duration=durations, loop=0, optimize=True, disposal=2
)
print(f"wrote {output} ({output.stat().st_size // 1024} KiB, {len(paths)} frames, {crop[2] - crop[0]}x{crop[3]} px)")
PY
