from __future__ import annotations

import base64
from pathlib import Path


MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


def file_to_base64_uri(file_path: Path) -> str:
    mime_type = MIME_TYPES.get(file_path.suffix.lower(), "image/png")
    encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def buffer_to_base64_uri(buffer: bytes, mime_type: str = "image/jpeg") -> str:
    encoded = base64.b64encode(buffer).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"
