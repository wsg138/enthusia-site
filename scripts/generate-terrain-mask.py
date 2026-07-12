from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageFilter
from PIL import ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "minecraft-day-valley-v1.png"
BASE_FOREGROUND = ROOT / "public" / "assets" / "minecraft-terrain-foreground-v1.png"
OUTPUT = ROOT / "public" / "assets" / "minecraft-terrain-mask-v1.png"
SKY_OUTPUT = ROOT / "public" / "assets" / "minecraft-sky-mask-v1.png"
OCCLUSION_ADD_OUTPUT = ROOT / "public" / "assets" / "minecraft-occlusion-add-v1.png"
OCCLUSION_SUBTRACT_OUTPUT = ROOT / "public" / "assets" / "minecraft-occlusion-subtract-v1.png"
FOLIAGE_LIGHT_OUTPUT = ROOT / "public" / "assets" / "minecraft-foliage-light-mask-v1.png"
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

# Hand-traced physical-occlusion repairs. These additions are intentionally
# local: the stepped polygon follows the missing northwest mountain ridge, and
# the narrow rectangles restore only trunks/branches that the old segmentation
# dropped where the celestial path crosses the right-side trees.
occlusion_add = Image.new("L", (width, height), 0)
add_draw = ImageDraw.Draw(occlusion_add)
add_draw.polygon(
    [
        (240, 410),
        (260, 380),
        (280, 365),
        (300, 350),
        (320, 335),
        (340, 320),
        (360, 305),
        (380, 290),
        (400, 275),
        (420, 255),
        (420, 450),
        (240, 450),
    ],
    fill=255,
)
for box in (
    (1390, 408, 1398, 514),
    (1364, 437, 1422, 443),
    (1372, 465, 1412, 471),
    (1510, 330, 1519, 510),
    (1460, 384, 1580, 392),
    (1440, 430, 1600, 438),
):
    add_draw.rectangle(box, fill=255)

occlusion_subtract = Image.new("L", (width, height), 0)
add_alpha = np.asarray(occlusion_add)
subtract_alpha = np.asarray(occlusion_subtract)
alpha = np.maximum(alpha, add_alpha)
alpha = np.minimum(alpha, 255 - subtract_alpha)

rgba = np.full((height, width, 4), 255, dtype=np.uint8)
soft_alpha = np.asarray(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(0.65)))
rgba[..., 3] = soft_alpha
Image.fromarray(rgba, mode="RGBA").save(OUTPUT, optimize=True)

sky_rgba = np.full((height, width, 4), 255, dtype=np.uint8)
sky_rgba[..., 3] = 255 - soft_alpha
Image.fromarray(sky_rgba, mode="RGBA").save(SKY_OUTPUT, optimize=True)

for repair_alpha, output in (
    (add_alpha, OCCLUSION_ADD_OUTPUT),
    (subtract_alpha, OCCLUSION_SUBTRACT_OUTPUT),
):
    repair_rgba = np.full((height, width, 4), 255, dtype=np.uint8)
    repair_rgba[..., 3] = repair_alpha
    Image.fromarray(repair_rgba, mode="RGBA").save(output, optimize=True)

# This mask is for diffuse above-terrain sunlight only. It intersects the final
# shared terrain alpha with two hand-bounded canopy regions; the radial light
# still follows the sun and falls off before reaching unrelated stone.
foliage_region = Image.new("L", (width, height), 0)
foliage_draw = ImageDraw.Draw(foliage_region)
foliage_draw.polygon([(1310, 350), (1450, 350), (1450, 492), (1300, 520)], fill=255)
foliage_draw.polygon([(1410, 215), (1672, 215), (1672, 470), (1430, 485)], fill=255)
foliage_alpha = (soft_alpha.astype(np.uint16) * np.asarray(foliage_region, dtype=np.uint16) // 255).astype(np.uint8)
foliage_rgba = np.full((height, width, 4), 255, dtype=np.uint8)
foliage_rgba[..., 3] = foliage_alpha
Image.fromarray(foliage_rgba, mode="RGBA").save(FOLIAGE_LIGHT_OUTPUT, optimize=True)

for phase, source in PHASE_SOURCES.items():
    foreground = np.asarray(Image.open(source).convert("RGBA")).copy()
    foreground[..., 3] = soft_alpha
    phase_output = ROOT / "public" / "assets" / f"minecraft-terrain-foreground-{phase}-v1.png"
    Image.fromarray(foreground, mode="RGBA").save(phase_output, optimize=True)
    print(phase_output)

print(OUTPUT)
print(SKY_OUTPUT)
print(OCCLUSION_ADD_OUTPUT)
print(OCCLUSION_SUBTRACT_OUTPUT)
print(FOLIAGE_LIGHT_OUTPUT)
