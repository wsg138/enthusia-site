"""Apply the manually reviewed cinematic terrain repairs.

The established terrain mask is a frozen baseline. Manual add/subtract layers
are applied once, in that order, without thresholding, morphology, flood fill,
or blur. Foreground RGB is decontaminated independently of alpha by propagating
nearby fully opaque terrain colours into an eight-pixel edge band. The stable
neighbour order makes the result deterministic and preserves the saved alpha.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
WIDTH, HEIGHT = 1672, 941
BASE_MASK = ASSETS / "minecraft-terrain-mask-v1.png"
BASELINE_MASK = ASSETS / "minecraft-terrain-mask-baseline-v1.png"
REPAIR_ADD = ASSETS / "minecraft-occlusion-add-v2.png"
REPAIR_SUBTRACT = ASSETS / "minecraft-occlusion-subtract-v2.png"
REPAIR_METADATA = ASSETS / "minecraft-occlusion-repair-v2.json"
SKY_OUTPUT = ASSETS / "minecraft-sky-mask-v1.png"
PHASE_SOURCES = {
    "day": ASSETS / "minecraft-day-valley-v1.png",
    "sunset": ASSETS / "minecraft-sunset-right-v1.png",
    "night": ASSETS / "minecraft-night-valley-v3.png",
    "sunrise": ASSETS / "minecraft-sunrise-left-v1.png",
}
PHASE_OUTPUTS = {
    phase: ASSETS / f"minecraft-terrain-foreground-{phase}-v1.png"
    for phase in PHASE_SOURCES
}
REPAIR_PATHS = (REPAIR_ADD, REPAIR_SUBTRACT, REPAIR_METADATA)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        if image.size != (WIDTH, HEIGHT):
            raise ValueError(f"{path.name} must be {WIDTH}x{HEIGHT}; got {image.size[0]}x{image.size[1]}")
        return image.convert("RGBA").copy()


def validate_inputs() -> tuple[Image.Image, Image.Image, Image.Image, dict, dict[str, str]]:
    missing = [str(path) for path in (*REPAIR_PATHS, BASE_MASK, *PHASE_SOURCES.values()) if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required cinematic input(s): " + ", ".join(missing))

    repair_hashes = {path.name: sha256(path) for path in REPAIR_PATHS}
    metadata = json.loads(REPAIR_METADATA.read_text(encoding="utf-8"))
    baseline_path = BASELINE_MASK if BASELINE_MASK.exists() else BASE_MASK
    if metadata.get("baseMaskSha256") != sha256(baseline_path):
        raise ValueError(f"Saved base-mask hash does not match {baseline_path.name}")
    if metadata.get("addLayerSha256") != repair_hashes[REPAIR_ADD.name]:
        raise ValueError("Saved repair-add hash does not match repair metadata")
    if metadata.get("subtractLayerSha256") != repair_hashes[REPAIR_SUBTRACT.name]:
        raise ValueError("Saved repair-subtract hash does not match repair metadata")

    base = load_rgba(baseline_path).getchannel("A")
    add = load_rgba(REPAIR_ADD).getchannel("A")
    subtract = load_rgba(REPAIR_SUBTRACT).getchannel("A")
    strong_add = add.point(lambda value: 255 if value >= 200 else 0)
    strong_subtract = subtract.point(lambda value: 255 if value >= 200 else 0)
    strong_overlap = sum(ImageChops.multiply(strong_add, strong_subtract).histogram()[255:])
    if strong_overlap:
        raise ValueError(f"{strong_overlap} strongly conflicting repair pixels remain")
    return base, add, subtract, metadata, repair_hashes


def final_alpha(base: Image.Image, add: Image.Image, subtract: Image.Image) -> Image.Image:
    result = ImageChops.lighter(base, add)
    result = ImageChops.darker(result, ImageChops.invert(subtract))
    if len(result.histogram()) != 256:
        raise ValueError("Final alpha escaped the 0..255 range")
    return result


def shifted(image: Image.Image, dx: int, dy: int) -> Image.Image:
    result = Image.new(image.mode, image.size)
    source_box = (max(0, -dx), max(0, -dy), WIDTH - max(0, dx), HEIGHT - max(0, dy))
    result.paste(image.crop(source_box), (max(0, dx), max(0, dy)))
    return result


def propagate_terrain_rgb(rgb: Image.Image, alpha: Image.Image, radius: int = 8) -> Image.Image:
    """Extend solid terrain RGB into a narrow edge band without changing alpha.

    Propagation advances one pixel per pass from alpha=255 seeds. The fixed
    eight-neighbour order resolves equal-distance ties deterministically.
    Transparent RGB beyond the band is irrelevant to compositing and untouched.
    """
    output = rgb.copy()
    known = alpha.point(lambda value: 255 if value == 255 else 0)
    directions = ((-1, 0), (0, -1), (0, 1), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1))
    for _ in range(radius):
        previous_known = known.copy()
        previous_rgb = output.copy()
        for dy, dx in directions:
            candidate_known = shifted(previous_known, dx, dy)
            candidates = ImageChops.multiply(candidate_known, ImageChops.invert(known))
            if candidates.getbbox():
                output.paste(shifted(previous_rgb, dx, dy), mask=candidates)
                known = ImageChops.lighter(known, candidates)
    return output


def output_statistics(alpha: Image.Image, base: Image.Image) -> dict[str, int | bool | str | dict[str, str]]:
    phase_hashes = {path.name: sha256(path) for path in PHASE_OUTPUTS.values()}
    histogram = alpha.histogram()
    added = ImageChops.subtract(alpha, base).histogram()
    removed = ImageChops.subtract(base, alpha).histogram()
    return {
        "addedPixelCount": sum(added[1:]),
        "removedPixelCount": sum(removed[1:]),
        "partialAlphaPixelCount": sum(histogram[1:255]),
        "opaqueTerrainPixelCount": histogram[255],
        "transparentSkyPixelCount": histogram[0],
        "allPhaseAlphasMatch": True,
        "finalMaskSha256": sha256(BASE_MASK),
        "phaseForegroundSha256": phase_hashes,
    }


def validate_outputs(expected_alpha: Image.Image) -> None:
    outputs = (BASE_MASK, SKY_OUTPUT, *PHASE_OUTPUTS.values())
    for path in outputs:
        if not path.exists():
            raise FileNotFoundError(f"Missing generated output: {path}")
        actual = load_rgba(path).getchannel("A")
        expected = ImageChops.invert(expected_alpha) if path == SKY_OUTPUT else expected_alpha
        if ImageChops.difference(actual, expected).getbbox():
            raise ValueError(f"Unexpected alpha channel in {path.name}")
    alphas = [load_rgba(path).getchannel("A") for path in PHASE_OUTPUTS.values()]
    if not all(not ImageChops.difference(alphas[0], alpha).getbbox() for alpha in alphas[1:]):
        raise ValueError("Phase foreground alpha channels differ")


def generate() -> dict[str, object]:
    base, add, subtract, _, repair_hashes = validate_inputs()
    repair_hashes_before = {path: sha256(path) for path in REPAIR_PATHS}
    alpha = final_alpha(base, add, subtract)

    if not BASELINE_MASK.exists():
        BASELINE_MASK.write_bytes(BASE_MASK.read_bytes())

    mask = Image.new("RGBA", (WIDTH, HEIGHT), (255, 255, 255, 255))
    mask.putalpha(alpha)
    mask.save(BASE_MASK, optimize=True)

    sky = Image.new("RGBA", (WIDTH, HEIGHT), (255, 255, 255, 255))
    sky.putalpha(ImageChops.invert(alpha))
    sky.save(SKY_OUTPUT, optimize=True)

    for phase, source in PHASE_SOURCES.items():
        rgba = load_rgba(source)
        clean_rgb = propagate_terrain_rgb(rgba.convert("RGB"), alpha)
        foreground = clean_rgb.convert("RGBA")
        foreground.putalpha(alpha)
        foreground.save(PHASE_OUTPUTS[phase], optimize=True)

    for path, before in repair_hashes_before.items():
        if sha256(path) != before:
            raise RuntimeError(f"Generator attempted to overwrite authoritative repair file: {path.name}")
    validate_outputs(alpha)
    report = output_statistics(alpha, base)
    report["repairSha256"] = repair_hashes
    return report


def validate_only() -> dict[str, object]:
    base, add, subtract, _, repair_hashes = validate_inputs()
    alpha = final_alpha(base, add, subtract)
    if all(path.exists() for path in (SKY_OUTPUT, *PHASE_OUTPUTS.values())):
        validate_outputs(alpha)
    report = output_statistics(alpha, base)
    report["repairSha256"] = repair_hashes
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply or validate manually reviewed cinematic mask repairs.")
    parser.add_argument("--validate-only", action="store_true", help="Validate inputs and existing outputs without writing files.")
    args = parser.parse_args()
    report = validate_only() if args.validate_only else generate()
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
