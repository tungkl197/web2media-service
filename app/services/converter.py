from __future__ import annotations

import asyncio
import shutil
from pathlib import Path


MIME_TYPES = {
    "webm": "video/webm",
    "mp4": "video/mp4",
    "gif": "image/gif",
}


def get_mime_type(format_name: str) -> str:
    return MIME_TYPES.get(format_name, "application/octet-stream")


def _ffmpeg_bin() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("Không tìm thấy ffmpeg trong PATH")
    return ffmpeg


async def _run_ffmpeg(args: list[str], error_prefix: str) -> None:
    process = await asyncio.create_subprocess_exec(
        _ffmpeg_bin(),
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()

    if process.returncode != 0:
        message = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"{error_prefix}: {message}")


async def convert_to_mp4(input_path: Path, output_path: Path, bitrate: int = 5_000_000, fps: int = 60) -> Path:
    bitrate_kbps = round(bitrate / 1000)
    await _run_ffmpeg(
        [
            "-y",
            "-i",
            str(input_path),
            "-c:v",
            "libx264",
            "-b:v",
            f"{bitrate_kbps}k",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-preset",
            "fast",
            "-r",
            str(fps),
            str(output_path),
        ],
        "Lỗi chuyển đổi MP4",
    )
    return output_path


async def convert_to_gif(input_path: Path, output_path: Path, fps: int = 15, width: int = 640) -> Path:
    gif_fps = min(fps, 15)
    gif_width = min(width, 800)
    palette_path = input_path.with_name(f"{input_path.stem}_palette.png")

    try:
        await _run_ffmpeg(
            [
                "-y",
                "-i",
                str(input_path),
                "-vf",
                f"fps={gif_fps},scale={gif_width}:-1:flags=lanczos,palettegen=stats_mode=diff",
                str(palette_path),
            ],
            "Lỗi tạo palette GIF",
        )
        await _run_ffmpeg(
            [
                "-y",
                "-i",
                str(input_path),
                "-i",
                str(palette_path),
                "-filter_complex",
                f"fps={gif_fps},scale={gif_width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5",
                str(output_path),
            ],
            "Lỗi chuyển đổi GIF",
        )
    finally:
        palette_path.unlink(missing_ok=True)

    return output_path


async def convert(webm_path: Path, format_name: str, *, bitrate: int, fps: int, width: int) -> Path:
    if format_name == "webm":
        return webm_path

    output_path = webm_path.with_suffix(f".{format_name}")

    if format_name == "mp4":
        await convert_to_mp4(webm_path, output_path, bitrate=bitrate, fps=fps)
    elif format_name == "gif":
        await convert_to_gif(webm_path, output_path, fps=fps, width=width)
    else:
        raise RuntimeError(f"Format không được hỗ trợ: {format_name}")

    webm_path.unlink(missing_ok=True)
    return output_path
