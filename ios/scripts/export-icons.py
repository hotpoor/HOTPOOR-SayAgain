#!/usr/bin/env python3
"""Export the approved logo onto opaque white iOS AppIcon canvases."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
destination = root / 'ios/SayAgain/Assets.xcassets/AppIcon.appiconset'
with Image.open(root / 'renderer/assets/sayagain-icon.png') as source:
    logo = source.convert('RGBA')
    canvas = Image.new('RGBA', logo.size, 'white')
    canvas.alpha_composite(logo)
    opaque = canvas.convert('RGB')
    for size in (20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024):
        path = destination / f'icon-{size}.png'
        opaque.resize((size, size), Image.Resampling.LANCZOS).save(path)
        with Image.open(path) as exported:
            assert exported.mode == 'RGB' and exported.size == (size, size)
print('Exported 13 opaque AppIcons from the original logo.')
