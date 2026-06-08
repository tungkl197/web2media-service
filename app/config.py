from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


BG_PRESETS = [
    {"index": 0, "label": "Rừng", "gradient": "radial-gradient(ellipse at 30% 60%, #0d2b14 0%, #050e08 60%, #020608 100%)"},
    {"index": 1, "label": "Đêm", "gradient": "radial-gradient(ellipse at 50% 100%, #0d1535 0%, #040810 60%, #010205 100%)"},
    {"index": 2, "label": "Hoàng hôn", "gradient": "linear-gradient(170deg, #0d0510 0%, #2a0e20 40%, #0a0508 100%)"},
    {"index": 3, "label": "Ao hồ", "gradient": "radial-gradient(ellipse at 50% 80%, #071e2e 0%, #030c14 50%, #010408 100%)"},
    {"index": 4, "label": "Núi", "gradient": "linear-gradient(160deg, #070a14 0%, #111828 40%, #050710 100%)"},
    {"index": 5, "label": "Lúa", "gradient": "radial-gradient(ellipse at 50% 90%, #1a2208 0%, #0a0e04 60%, #040602 100%)"},
    {"index": 6, "label": "Biển", "gradient": "linear-gradient(180deg, #03060e 0%, #061224 40%, #040d1a 100%)"},
    {"index": 7, "label": "Tím", "gradient": "radial-gradient(ellipse at 50% 100%, #1e0f35 0%, #08051a 60%, #03020c 100%)"},
]

COLOR_PRESETS = [
    {"index": 0, "name": "Xanh lá", "h": 105, "s": 85, "l": 65, "hex": "#5fdf47"},
    {"index": 1, "name": "Vàng", "h": 55, "s": 95, "l": 68, "hex": "#f5e94a"},
    {"index": 2, "name": "Xanh lam", "h": 195, "s": 90, "l": 65, "hex": "#4dc8f0"},
    {"index": 3, "name": "Cam", "h": 35, "s": 95, "l": 65, "hex": "#f5b44a"},
    {"index": 4, "name": "Trắng", "h": 0, "s": 0, "l": 90, "hex": "#e6e6e6"},
    {"index": 5, "name": "Hồng", "h": 320, "s": 80, "l": 75, "hex": "#ef8ad6"},
]

DIRECTIONS = ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right", "random"]
GLOW_LEVELS = ["low", "mid", "high"]

DEFAULT_CONFIG = {
    "count": 80,
    "size": 2.5,
    "speed": 1.0,
    "colorMode": "preset",
    "colorIndex": 0,
    "customColor": "#7fff9a",
    "glowLevel": "mid",
    "direction": "up",
    "spread": 0.4,
    "bgIndex": 1,
    "bgUrl": None,
    "duration": 10,
    "fps": 60,
    "width": 1920,
    "height": 1080,
    "bitrate": 5_000_000,
    "format": "webm",
    "filename": "firefly",
}


@dataclass(frozen=True)
class ServerConfig:
    port: int = _env_int("PORT", 3000)
    temp_dir: Path = BASE_DIR / "temp"
    public_dir: Path = BASE_DIR / "public"
    max_concurrent: int = _env_int("MAX_CONCURRENT", 3)
    max_duration: int = 120


SERVER_CONFIG = ServerConfig()
