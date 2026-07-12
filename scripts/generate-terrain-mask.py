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
    for next_y, next_x in (
        (y - 1, x - 1), (y - 1, x), (y - 1, x + 1),
        (y, x - 1), (y, x + 1),
        (y + 1, x - 1), (y + 1, x), (y + 1, x + 1),
    ):
        if 0 <= next_y < height and 0 <= next_x < width and solid[next_y, next_x] and not connected[next_y, next_x]:
            connected[next_y, next_x] = True
            queue.append((next_y, next_x))

# Preserve blue-toned pixels enclosed inside terrain while leaving real sky gaps
# connected to the top edge transparent. This avoids holes in snowy/shadowed
# mountain faces without filling the open spaces around tree branches.
exterior_sky = np.zeros((height, width), dtype=bool)
queue.clear()
for x in range(width):
    if sky[0, x]:
        exterior_sky[0, x] = True
        queue.append((0, x))

while queue:
    y, x = queue.popleft()
    for next_y, next_x in (
        (y - 1, x - 1), (y - 1, x), (y - 1, x + 1),
        (y, x - 1), (y, x + 1),
        (y + 1, x - 1), (y + 1, x), (y + 1, x + 1),
    ):
        if 0 <= next_y < height and 0 <= next_x < width and sky[next_y, next_x] and not exterior_sky[next_y, next_x]:
            exterior_sky[next_y, next_x] = True
            queue.append((next_y, next_x))

terrain = connected | (sky & ~exterior_sky)
terrain_image = Image.fromarray(terrain.astype(np.uint8) * 255, mode="L")
# Close small classification holes in stone, snow, and shadowed terrain while
# preserving the much larger true sky openings around tree trunks and branches.
terrain_image = terrain_image.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.MinFilter(15))


def close_region(image, box, size):
    """Close classification pinholes only inside a known solid subject."""
    region = image.crop(box)
    region = region.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    image.paste(region, box[:2])


# The snowy northwest ridge contains pale blue shadow blocks that sit very close
# to the sky colour. A slightly stronger local close keeps its stepped outline
# intact without widening unrelated clouds or distant terrain.
close_region(terrain_image, (190, 230, 690, 670), 25)

# Retain the real sunset visible between the large branch tiers, while closing
# tiny false-transparent flecks inside the dense leaves of the foreground pine.
close_region(terrain_image, (1410, 245, 1605, 545), 23)
alpha = np.asarray(terrain_image)

rgba = np.full((height, width, 4), 255, dtype=np.uint8)
soft_alpha = np.asarray(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.65)))
rgba[..., 3] = soft_alpha
Image.fromarray(rgba, mode="RGBA").save(OUTPUT, optimize=True)

foreground = np.asarray(Image.open(SOURCE).convert("RGBA")).copy()
foreground[..., 3] = soft_alpha
Image.fromarray(foreground, mode="RGBA").save(FOREGROUND_OUTPUT, optimize=True)
print(OUTPUT)
print(FOREGROUND_OUTPUT)
