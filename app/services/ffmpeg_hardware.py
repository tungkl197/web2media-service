from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import SERVER_CONFIG


@dataclass(frozen=True)
class Mp4Encoder:
    name: str
    label: str
    hardware: bool
    aliases: tuple[str, ...] = ()


CPU_MP4_ENCODER = Mp4Encoder("libx264", "CPU libx264", False)
HARDWARE_MP4_ENCODERS = [
    Mp4Encoder("h264_nvenc", "NVIDIA NVENC", True, ("nvidia", "nvenc", "cuda")),
    Mp4Encoder("h264_qsv", "Intel Quick Sync", True, ("intel", "qsv", "quick-sync", "quicksync")),
    Mp4Encoder("h264_amf", "AMD AMF", True, ("amd", "amf")),
]

_available_encoders: set[str] | None = None
_selected_mp4_encoder: Mp4Encoder | None = None
_encoder_usability: dict[str, bool] = {}
_ffmpeg_path_logged = False


def find_ffmpeg_path() -> str:
    if SERVER_CONFIG.ffmpeg_path:
        return SERVER_CONFIG.ffmpeg_path

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg

    return "ffmpeg"


FFMPEG_PATH = find_ffmpeg_path()


def normalize_name(value: str | None) -> str:
    return (value or "").strip().lower()


def is_disabled(value: str | None) -> bool:
    return normalize_name(value) in {"0", "false", "off", "no", "none", "disabled", "cpu"}


def run_process(args: list[str], timeout: int = 30000) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout / 1000,
        check=False,
    )


def get_available_ffmpeg_encoders() -> set[str]:
    global _available_encoders
    if _available_encoders is not None:
        return _available_encoders

    result = run_process([FFMPEG_PATH, "-hide_banner", "-encoders"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "Could not inspect ffmpeg encoders")

    encoders: set[str] = set()
    for line in f"{result.stdout}\n{result.stderr}".splitlines():
        parts = line.strip().split()
        if len(parts) >= 2 and len(parts[0]) == 6:
            encoders.add(parts[1])

    _available_encoders = encoders
    return encoders


def get_requested_hardware_encoder(requested: str) -> Mp4Encoder | None:
    for encoder in HARDWARE_MP4_ENCODERS:
        if encoder.name == requested or requested in encoder.aliases:
            return encoder
    return None


def can_encode_with_encoder(encoder: Mp4Encoder) -> bool:
    if not encoder.hardware:
        return True

    if encoder.name in _encoder_usability:
        return _encoder_usability[encoder.name]

    output_path = Path(tempfile.gettempdir()) / f"web2media-{os.getpid()}-{encoder.name}-smoke.mp4"
    usable = False
    try:
        result = run_process(
            [
                FFMPEG_PATH,
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=0.2:size=320x240:rate=10",
                "-c:v",
                encoder.name,
                "-pix_fmt",
                "yuv420p",
                "-b:v",
                "1000k",
                "-y",
                str(output_path),
            ],
            timeout=30000,
        )
        usable = result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0
        if not usable:
            detail = (result.stderr or result.stdout).strip()
            print(f"[FFmpeg] {encoder.label} is listed but failed smoke test: {detail}")
    finally:
        try:
            output_path.unlink()
        except OSError:
            pass

    _encoder_usability[encoder.name] = usable
    return usable


def select_mp4_video_encoder() -> Mp4Encoder:
    global _selected_mp4_encoder, _ffmpeg_path_logged
    if _selected_mp4_encoder:
        return _selected_mp4_encoder

    if not _ffmpeg_path_logged:
        print(f"[FFmpeg] Binary: {FFMPEG_PATH}")
        _ffmpeg_path_logged = True

    requested = normalize_name(SERVER_CONFIG.ffmpeg_video_encoder or "auto")
    if is_disabled(requested) or requested == "libx264":
        print("[FFmpeg] MP4 encoder: CPU libx264")
        _selected_mp4_encoder = CPU_MP4_ENCODER
        return _selected_mp4_encoder

    try:
        encoders = get_available_ffmpeg_encoders()
    except Exception as err:
        print(f"[FFmpeg] Could not inspect encoders, using CPU libx264: {err}")
        _selected_mp4_encoder = CPU_MP4_ENCODER
        return _selected_mp4_encoder

    if requested and requested != "auto":
        configured = get_requested_hardware_encoder(requested) or Mp4Encoder(
            requested,
            requested,
            requested != "libx264",
        )
        if configured.name in encoders and can_encode_with_encoder(configured):
            print(f"[FFmpeg] MP4 encoder: {configured.label}")
            _selected_mp4_encoder = configured
            return _selected_mp4_encoder
        print(f"[FFmpeg] Requested encoder {requested} is not available/usable, using CPU libx264")
        _selected_mp4_encoder = CPU_MP4_ENCODER
        return _selected_mp4_encoder

    for encoder in HARDWARE_MP4_ENCODERS:
        if encoder.name in encoders and can_encode_with_encoder(encoder):
            print(f"[FFmpeg] MP4 encoder: {encoder.label}")
            _selected_mp4_encoder = encoder
            return _selected_mp4_encoder

    print("[FFmpeg] No usable hardware MP4 encoder found, using CPU libx264")
    _selected_mp4_encoder = CPU_MP4_ENCODER
    return _selected_mp4_encoder


def get_hardware_decode_input_options(disabled: bool = False) -> list[str]:
    if disabled or is_disabled(SERVER_CONFIG.ffmpeg_hwaccel):
        return []
    hwaccel = normalize_name(SERVER_CONFIG.ffmpeg_hwaccel or "auto") or "auto"
    return ["-hwaccel", hwaccel]


def get_mp4_encoder_output_options(encoder: Mp4Encoder) -> list[str]:
    base = ["-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if not encoder.hardware:
        return [*base, "-preset", "fast"]
    if encoder.name in {"h264_nvenc", "nvenc", "nvenc_h264"}:
        return [*base, "-preset", "fast"]
    if encoder.name == "h264_qsv":
        return [*base, "-preset", "fast"]
    if encoder.name == "h264_amf":
        return [*base, "-usage", "transcoding", "-quality", "speed"]
    return base


def should_fallback_to_cpu() -> bool:
    return SERVER_CONFIG.ffmpeg_hardware_fallback
