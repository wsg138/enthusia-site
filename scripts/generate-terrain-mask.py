from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "minecraft-day-valley-v1.png"
OUTPUT = ROOT / "public" / "assets" / "minecraft-terrain-mask-v1.png"
FOREGROUND_OUTPUT = ROOT / "public" / "assets" / "minecraft-terrain-foreground-v1.png"

rgb = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.int16)
height, width, _ = rgb.shape
red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]

# The generated scene's sky is blue/cyan. Terrain, snow, trees, and stone are
# deliberately treated as solid; disconnected white clouds are removed later.
sky = (blue > red * 1.04) & (blue > green * 0.88) & (blue - red > 12)
solid = ~sky
connected = np.zeros((height, width), dtype=bool)
queue = deque()

for x in range(width):
    if solid[-1, x]:
        connected[-1, x] = True
        queue.append((height - 1, x))

while queue:
    y, x = queue.popleft()
    for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= next_y < height and 0 <= next_x < width and solid[next_y, next_x] and not connected[next_y, next_x]:
            connected[next_y, next_x] = True
            queue.append((next_y, next_x))

# Collapse the connected terrain to one exact skyline per source-image column.
# Filling below that skyline produces a stable occlusion matte even over water.
alpha = np.zeros((height, width), dtype=np.uint8)
for x in range(width):
    rows = np.flatnonzero(connected[:, x])
    if rows.size:
        alpha[rows[0]:, x] = 255

rgba = np.full((height, width, 4), 255, dtype=np.uint8)
soft_alpha = np.asarray(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.65)))
rgba[..., 3] = soft_alpha
Image.fromarray(rgba, mode="RGBA").save(OUTPUT, optimize=True)

foreground = np.asarray(Image.open(SOURCE).convert("RGBA")).copy()
foreground[..., 3] = soft_alpha
Image.fromarray(foreground, mode="RGBA").save(FOREGROUND_OUTPUT, optimize=True)
print(OUTPUT)
print(FOREGROUND_OUTPUT)
