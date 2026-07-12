from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "minecraft-day-valley-v1.png"
BASE_FOREGROUND = ROOT / "public" / "assets" / "minecraft-terrain-foreground-v1.png"
OUTPUT = ROOT / "public" / "assets" / "minecraft-terrain-mask-v1.png"
SKY_OUTPUT = ROOT / "public" / "assets" / "minecraft-sky-mask-v1.png"
PHASE_SOURCES = {
    "day": SOURCE,
    "sunset": ROOT / "public" / "assets" / "minecraft-sunset-right-v1.png",
    "night": ROOT / "public" / "assets" / "minecraft-night-valley-v3.png",
    "sunrise": ROOT / "public" / "assets" / "minecraft-sunrise-left-v1.png",
}

rgb = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.int16)
height, width, _ = rgb.shape
red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]

# The original base mask was produced with bottom-connected solid-pixel flood
# filling, then repaired around the mountain and tree. Keep that established
# silhouette as the base for this pass instead of broadly re-segmenting it.
sky = (blue > red * 1.04) & (blue > green * 0.88) & (blue - red > 12)
terrain_image = Image.open(BASE_FOREGROUND).convert("RGBA").getchannel("A")
source_alpha = np.asarray(terrain_image).copy()


def close_region(image, box, size):
    """Close classification pinholes only inside a known solid subject."""
    region = image.crop(box)
    region = region.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    image.paste(region, box[:2])


# The snowy northwest ridge contains pale blue shadow blocks that sit very close
# to the sky colour. A slightly stronger local close keeps its stepped outline
# intact without widening unrelated clouds or distant terrain.
close_region(terrain_image, (180, 220, 710, 690), 31)
# Blue-gray stone on the right hillside was mistaken for sky by the original
# segmentation. Close those local holes without extending the outer ridge.
close_region(terrain_image, (1070, 430, 1672, 941), 61)

alpha = np.asarray(terrain_image).copy()

# Re-open only gaps that were already transparent in the established foreground.
# Colour alone cannot determine alpha here: cyan leaf highlights are still solid
# foliage, especially when the moon makes small classification errors obvious.
for left, top, right, bottom in (
    (0, 330, 245, 650),
    (1180, 360, 1435, 570),
    (1400, 235, 1672, 505),
):
    region_sky = sky[top:bottom, left:right]
    alpha_region = alpha[top:bottom, left:right]
    source_region = source_alpha[top:bottom, left:right]
    alpha_region[region_sky & (source_region == 0)] = 0

rgba = np.full((height, width, 4), 255, dtype=np.uint8)
soft_alpha = np.asarray(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.65)))
rgba[..., 3] = soft_alpha
Image.fromarray(rgba, mode="RGBA").save(OUTPUT, optimize=True)

sky_rgba = np.full((height, width, 4), 255, dtype=np.uint8)
sky_rgba[..., 3] = 255 - soft_alpha
Image.fromarray(sky_rgba, mode="RGBA").save(SKY_OUTPUT, optimize=True)

for phase, source in PHASE_SOURCES.items():
    foreground = np.asarray(Image.open(source).convert("RGBA")).copy()
    foreground[..., 3] = soft_alpha
    phase_output = ROOT / "public" / "assets" / f"minecraft-terrain-foreground-{phase}-v1.png"
    Image.fromarray(foreground, mode="RGBA").save(phase_output, optimize=True)
    print(phase_output)

print(OUTPUT)
print(SKY_OUTPUT)
