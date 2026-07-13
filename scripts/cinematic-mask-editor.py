#!/usr/bin/env python3
"""Local-only guided editor for Enthusia's cinematic terrain repair layers."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import threading
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TOOL_ROOT = ROOT / "tools" / "cinematic-mask-editor"
ASSET_ROOT = ROOT / "public" / "assets"
DEBUG_ROOT = ROOT / "docs" / "cinematic-review" / "debug"
WIDTH, HEIGHT = 1672, 941
BASE_MASK = ASSET_ROOT / "minecraft-terrain-mask-v1.png"
ADD_PATH = ASSET_ROOT / "minecraft-occlusion-add-v2.png"
SUBTRACT_PATH = ASSET_ROOT / "minecraft-occlusion-subtract-v2.png"
METADATA_PATH = ASSET_ROOT / "minecraft-occlusion-repair-v2.json"
MAX_REQUEST_BYTES = 32 * 1024 * 1024

REQUIRED_ASSETS = [
    "minecraft-day-valley-v1.png",
    "minecraft-sunset-right-v1.png",
    "minecraft-night-valley-v3.png",
    "minecraft-sunrise-left-v1.png",
    "minecraft-terrain-mask-v1.png",
    "minecraft-terrain-foreground-v1.png",
    "minecraft-terrain-foreground-day-v1.png",
    "minecraft-terrain-foreground-sunset-v1.png",
    "minecraft-terrain-foreground-night-v1.png",
    "minecraft-terrain-foreground-sunrise-v1.png",
]

CHECKPOINTS = [
    {"id": "sun-right-trees", "label": "Sun behind right trees", "progress": 0.28, "x": 1415, "y": 430, "zoom": 5},
    {"id": "sun-small-tree", "label": "Sun behind smaller tree", "progress": 0.32, "x": 1435, "y": 500, "zoom": 6},
    {"id": "moon-left-tree", "label": "Moon behind left tree", "progress": 0.36, "x": 250, "y": 390, "zoom": 5},
    {"id": "moon-upper-left-mountain", "label": "Moon at upper-left mountain", "progress": 0.42, "x": 330, "y": 315, "zoom": 5},
    {"id": "mountain-ridge-with-moon", "label": "Mountain ridge with moon", "progress": 0.45, "x": 410, "y": 320, "zoom": 5},
    {"id": "moon-right-trees", "label": "Moon behind right trees", "progress": 0.68, "x": 1460, "y": 420, "zoom": 5},
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_child(root: Path, relative: str) -> Path | None:
    candidate = (root / unquote(relative).lstrip("/")).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def decode_png(data_url: str) -> Image.Image:
    prefix = "data:image/png;base64,"
    if not isinstance(data_url, str) or not data_url.startswith(prefix):
        raise ValueError("Repair layers must be PNG data URLs.")
    try:
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as exc:
        raise ValueError("A repair layer is not a valid PNG.") from exc
    if image.size != (WIDTH, HEIGHT):
        raise ValueError(f"Repair layers must be exactly {WIDTH}×{HEIGHT} pixels.")
    if image.mode not in {"L", "LA", "RGBA"}:
        raise ValueError("Repair layers must be grayscale or RGBA PNGs.")
    return image


def alpha_channel(image: Image.Image) -> Image.Image:
    if image.mode == "L":
        return image
    if image.mode == "LA":
        return image.getchannel("A")
    return image.getchannel("A")


def normalized_overlay(image: Image.Image) -> Image.Image:
    alpha = alpha_channel(image)
    result = Image.new("RGBA", image.size, (255, 255, 255, 0))
    result.putalpha(alpha)
    return result


def atomic_save_png(image: Image.Image, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    image.save(temporary, format="PNG", optimize=True)
    temporary.replace(destination)


class EditorHandler(SimpleHTTPRequestHandler):
    server_version = "EnthusiaMaskEditor/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[mask-editor] {self.address_string()} - {fmt % args}")

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        suffix = path.suffix.lower()
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
        }.get(suffix, "application/octet-stream")
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/session":
            missing = [name for name in REQUIRED_ASSETS if not (ASSET_ROOT / name).is_file()]
            self.send_json({
                "editorVersion": "1.0.0",
                "width": WIDTH,
                "height": HEIGHT,
                "baseMaskSha256": sha256(BASE_MASK),
                "checkpoints": CHECKPOINTS,
                "missingAssets": missing,
                "savedRepairs": {
                    "add": ADD_PATH.is_file(),
                    "subtract": SUBTRACT_PATH.is_file(),
                    "metadata": METADATA_PATH.is_file(),
                },
            })
            return
        if parsed.path.startswith("/assets/"):
            path = safe_child(ASSET_ROOT, parsed.path.removeprefix("/assets/"))
            if path is None:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self.serve_file(path)
            return
        if parsed.path.startswith("/review-debug/"):
            path = safe_child(DEBUG_ROOT, parsed.path.removeprefix("/review-debug/"))
            if path is None:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self.serve_file(path)
            return
        relative = "index.html" if parsed.path in {"", "/"} else parsed.path.lstrip("/")
        path = safe_child(TOOL_ROOT, relative)
        if path is None:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        self.serve_file(path)

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/save":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                raise ValueError("Save request is empty or too large.")
            payload = json.loads(self.rfile.read(length))
            expected_hash = payload.get("baseMaskSha256")
            actual_hash = sha256(BASE_MASK)
            if expected_hash != actual_hash:
                raise ValueError("The base terrain mask changed after this editor session started. Reload before saving.")

            add_image = decode_png(payload.get("addPng", ""))
            subtract_image = decode_png(payload.get("subtractPng", ""))
            add_alpha = alpha_channel(add_image)
            subtract_alpha = alpha_channel(subtract_image)
            strong_overlap = sum(
                1 for add, subtract in zip(add_alpha.getdata(), subtract_alpha.getdata())
                if add >= 200 and subtract >= 200
            )
            if strong_overlap:
                raise ValueError(f"{strong_overlap} pixels are strongly marked as both Terrain and Sky. Resolve them before saving.")

            normalized_add = normalized_overlay(add_image)
            normalized_subtract = normalized_overlay(subtract_image)
            atomic_save_png(normalized_add, ADD_PATH)
            atomic_save_png(normalized_subtract, SUBTRACT_PATH)

            metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
            metadata.update({
                "editorVersion": "1.0.0",
                "sourceDimensions": {"width": WIDTH, "height": HEIGHT},
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "baseMaskSha256": actual_hash,
                "addLayerSha256": sha256(ADD_PATH),
                "subtractLayerSha256": sha256(SUBTRACT_PATH),
            })
            temporary = METADATA_PATH.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            temporary.replace(METADATA_PATH)
            self.send_json({
                "ok": True,
                "message": "Repairs saved successfully",
                "files": [str(ADD_PATH.relative_to(ROOT)), str(SUBTRACT_PATH.relative_to(ROOT)), str(METADATA_PATH.relative_to(ROOT))],
                "hashes": {"add": metadata["addLayerSha256"], "subtract": metadata["subtractLayerSha256"]},
            })
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.send_json({"ok": False, "error": f"Save failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the local cinematic terrain-mask editor.")
    parser.add_argument("--port", type=int, default=8765, help="localhost port (default: 8765)")
    parser.add_argument("--no-open", action="store_true", help="do not open the browser automatically")
    args = parser.parse_args()

    missing = [name for name in REQUIRED_ASSETS if not (ASSET_ROOT / name).is_file()]
    if missing:
        raise SystemExit("Missing required assets:\n- " + "\n- ".join(missing))
    if not TOOL_ROOT.is_dir():
        raise SystemExit(f"Editor frontend not found: {TOOL_ROOT}")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), EditorHandler)
    url = f"http://127.0.0.1:{args.port}/"
    print("\nEnthusia cinematic mask editor")
    print(f"Open: {url}")
    print("Localhost only. Press Ctrl+C to stop.\n")
    if not args.no_open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping mask editor.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
