from __future__ import annotations

import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.core.config import SERVER_CONFIG
from app.services.ffmpeg_hardware import (
    CPU_MP4_ENCODER,
    FFMPEG_PATH,
    Mp4Encoder,
    get_hardware_decode_input_options,
    get_mp4_encoder_output_options,
    select_mp4_video_encoder,
    should_fallback_to_cpu,
)


AUDIO_EXTENSIONS_BY_MIME = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-m4a": ".m4a",
    "audio/x-wav": ".wav",
}


def cleanup_files(paths: list[str | Path | None]) -> None:
    for file_path in paths:
        if not file_path:
            continue
        try:
            Path(file_path).unlink()
        except OSError:
            pass


def run_ffmpeg(args: list[str], label: str) -> None:
    print(f"[Converter] FFmpeg command: {' '.join(args)}")
    result = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"{label}: {detail}")


def get_audio_extension(url: str, content_type: str = "") -> str:
    mime_type = content_type.split(";")[0].strip().lower()
    if mime_type in AUDIO_EXTENSIONS_BY_MIME:
        return AUDIO_EXTENSIONS_BY_MIME[mime_type]

    ext = Path(urlparse(url).path).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{1,7}", ext):
        return ext
    return ".audio"


def download_audio_file(url: str, index: int) -> Path:
    timeout = SERVER_CONFIG.audio_download_timeout / 1000
    max_bytes = SERVER_CONFIG.max_audio_bytes
    SERVER_CONFIG.temp_dir.mkdir(parents=True, exist_ok=True)

    with httpx.stream(
        "GET",
        url,
        follow_redirects=True,
        timeout=timeout,
        headers={"User-Agent": "Web2Media-Service/1.0", "Accept": "audio/*,*/*"},
    ) as response:
        if response.status_code != 200:
            raise RuntimeError(f"Khong tai duoc audio #{index + 1}: HTTP {response.status_code}")

        content_length = int(response.headers.get("content-length") or 0)
        if content_length > max_bytes:
            raise RuntimeError(f"Audio #{index + 1} vuot qua gioi han {max_bytes // 1024 // 1024}MB")

        ext = get_audio_extension(str(response.url), response.headers.get("content-type", ""))
        output_path = SERVER_CONFIG.temp_dir / f"{uuid4()}_audio_{index}{ext}"
        downloaded = 0

        try:
            with output_path.open("wb") as output:
                for chunk in response.iter_bytes():
                    downloaded += len(chunk)
                    if downloaded > max_bytes:
                        raise RuntimeError(f"Audio #{index + 1} vuot qua gioi han {max_bytes // 1024 // 1024}MB")
                    output.write(chunk)
        except Exception:
            cleanup_files([output_path])
            raise

    return output_path


def download_audio_files(audio_urls: list[str]) -> list[Path]:
    audio_paths: list[Path] = []
    try:
        for index, url in enumerate(audio_urls):
            print(f"[Converter] Downloading audio {index + 1}/{len(audio_urls)}: {url}")
            audio_paths.append(download_audio_file(url, index))
        return audio_paths
    except Exception:
        cleanup_files(audio_paths)
        raise


def get_media_duration_seconds(file_path: str | Path) -> float:
    result = subprocess.run(
        [FFMPEG_PATH, "-hide_banner", "-i", str(file_path)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
    if not match:
        raise RuntimeError(f"Khong doc duoc thoi luong audio: {Path(file_path).name}")
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def get_total_audio_duration_seconds(audio_paths: list[Path]) -> float:
    total = sum(get_media_duration_seconds(path) for path in audio_paths)
    if not total or total <= 0:
        raise RuntimeError("Tong thoi luong audio khong hop le")
    return total


def convert_to_mp4_cpu(input_path: str | Path, output_path: str | Path, bitrate: int, fps: int) -> str:
    args = [
        FFMPEG_PATH,
        "-i",
        str(input_path),
        "-y",
        "-vcodec",
        "libx264",
        "-b:v",
        f"{bitrate}k",
        "-r",
        str(fps),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-preset",
        "fast",
        str(output_path),
    ]
    print(f"[Converter] Converting to MP4 with CPU libx264: {input_path} -> {output_path}")
    run_ffmpeg(args, "Loi chuyen doi MP4")
    print(f"[Converter] MP4 conversion complete: {output_path}")
    return str(output_path)


def convert_to_mp4(input_path: str | Path, output_path: str | Path, options: dict) -> str:
    bitrate = round(int(options.get("bitrate") or 5000000) / 1000)
    fps = int(options.get("fps") or 60)
    encoder = select_mp4_video_encoder()
    hardware_decode_enabled = bool(get_hardware_decode_input_options())

    def run_with_encoder(selected: Mp4Encoder, disable_hw_decode: bool = False) -> str:
        args = [
            FFMPEG_PATH,
            *get_hardware_decode_input_options(disabled=disable_hw_decode),
            "-i",
            str(input_path),
            "-y",
            "-vcodec",
            selected.name,
            "-b:v",
            f"{bitrate}k",
            "-r",
            str(fps),
            *get_mp4_encoder_output_options(selected),
            str(output_path),
        ]
        print(f"[Converter] Converting to MP4 with {selected.label}: {input_path} -> {output_path}")
        run_ffmpeg(args, "Loi chuyen doi MP4")
        print(f"[Converter] MP4 conversion complete: {output_path}")
        return str(output_path)

    try:
        return run_with_encoder(encoder)
    except Exception as err:
        if (encoder.hardware or hardware_decode_enabled) and should_fallback_to_cpu():
            cleanup_files([output_path])
            print(f"[Converter] Hardware MP4 path failed ({err}). Retrying with CPU libx264.")
            return convert_to_mp4_cpu(input_path, output_path, bitrate, fps)
        raise


def convert_to_gif(input_path: str | Path, output_path: str | Path, options: dict) -> str:
    fps = min(int(options.get("fps") or 15), 15)
    width = min(int(options.get("width") or 640), 800)
    palette_path = str(input_path).replace(".webm", "_palette.png")

    print(f"[Converter] Converting to GIF: {input_path} -> {output_path} ({fps}fps, {width}px wide)")
    try:
        run_ffmpeg(
            [
                FFMPEG_PATH,
                "-i",
                str(input_path),
                "-y",
                "-vf",
                f"fps={fps},scale={width}:-1:flags=lanczos,palettegen=stats_mode=diff",
                palette_path,
            ],
            "Loi tao palette GIF",
        )
        run_ffmpeg(
            [
                FFMPEG_PATH,
                "-i",
                str(input_path),
                "-i",
                palette_path,
                "-y",
                "-filter_complex",
                f"fps={fps},scale={width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5",
                str(output_path),
            ],
            "Loi chuyen doi GIF",
        )
        print(f"[Converter] GIF conversion complete: {output_path}")
        return str(output_path)
    finally:
        cleanup_files([palette_path])


def convert(webm_path: str | Path, format_name: str, options: dict | None = None) -> str:
    options = options or {}
    webm_path = Path(webm_path)
    if format_name == "webm":
        return str(webm_path)

    output_path = webm_path.with_suffix(f".{format_name}")
    if format_name == "mp4":
        result = convert_to_mp4(webm_path, output_path, options)
    elif format_name == "gif":
        result = convert_to_gif(webm_path, output_path, options)
    else:
        raise RuntimeError(f"Format khong duoc ho tro: {format_name}")

    cleanup_files([webm_path])
    return result


def build_audio_map_args(audio_paths: list[Path], duration_seconds: float | None) -> tuple[list[str], list[str]]:
    duration_args = ["-t", f"{duration_seconds:.3f}"] if duration_seconds else []
    if len(audio_paths) == 1:
        return ["-map", "0:v:0", "-map", "1:a:0", "-shortest", *duration_args], []

    normalized = [
        f"[{index + 1}:a:0]aformat=sample_rates=48000:channel_layouts=stereo[a{index}]"
        for index in range(len(audio_paths))
    ]
    audio_inputs = "".join(f"[a{index}]" for index in range(len(audio_paths)))
    filter_complex = ";".join([*normalized, f"{audio_inputs}concat=n={len(audio_paths)}:v=0:a=1[aout]"])
    return ["-filter_complex", filter_complex, "-map", "0:v:0", "-map", "[aout]", "-shortest", *duration_args], []


def merge_looped_video_with_audio_cpu(
    video_path: str | Path,
    audio_paths: list[Path],
    output_path: str | Path,
    format_name: str,
    options: dict,
) -> str:
    if not audio_paths:
        raise RuntimeError("audioUrls khong duoc rong khi ghep audio")

    bitrate = round(int(options.get("bitrate") or 5000000) / 1000)
    fps = int(options.get("fps") or 60)
    duration_seconds = options.get("audioDurationSeconds")
    map_args, _ = build_audio_map_args(audio_paths, duration_seconds)

    args = [FFMPEG_PATH, "-stream_loop", "-1", "-i", str(video_path)]
    for audio_path in audio_paths:
        args.extend(["-i", str(audio_path)])
    args.extend(["-y", *map_args])

    if format_name == "mp4":
        args.extend(
            [
                "-vcodec",
                "libx264",
                "-b:v",
                f"{bitrate}k",
                "-r",
                str(fps),
                "-acodec",
                "aac",
                "-b:a",
                "192k",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-preset",
                "fast",
            ]
        )
    elif format_name == "webm":
        args.extend(["-vcodec", "copy", "-acodec", "libopus", "-b:a", "192k"])
    else:
        raise RuntimeError(f"Khong the ghep audio voi format {format_name}")

    args.append(str(output_path))
    print(f"[Converter] Merging audio into looped {format_name.upper()}: {video_path} -> {output_path}")
    run_ffmpeg(args, "Loi ghep audio")
    print(f"[Converter] Audio merge complete: {output_path}")
    return str(output_path)


def merge_looped_video_with_audio(
    video_path: str | Path,
    audio_paths: list[Path],
    output_path: str | Path,
    format_name: str,
    options: dict,
) -> str:
    if format_name != "mp4":
        return merge_looped_video_with_audio_cpu(video_path, audio_paths, output_path, format_name, options)

    if not audio_paths:
        raise RuntimeError("audioUrls khong duoc rong khi ghep audio")

    bitrate = round(int(options.get("bitrate") or 5000000) / 1000)
    fps = int(options.get("fps") or 60)
    duration_seconds = options.get("audioDurationSeconds")
    encoder = select_mp4_video_encoder()
    hardware_decode_enabled = bool(get_hardware_decode_input_options())

    def run_with_encoder(selected: Mp4Encoder, disable_hw_decode: bool = False) -> str:
        args = [
            FFMPEG_PATH,
            *get_hardware_decode_input_options(disabled=disable_hw_decode),
            "-stream_loop",
            "-1",
            "-i",
            str(video_path),
        ]
        for audio_path in audio_paths:
            args.extend(["-i", str(audio_path)])

        map_args, _ = build_audio_map_args(audio_paths, duration_seconds)
        args.extend(
            [
                "-y",
                *map_args,
                "-vcodec",
                selected.name,
                "-b:v",
                f"{bitrate}k",
                "-r",
                str(fps),
                "-acodec",
                "aac",
                "-b:a",
                "192k",
                *get_mp4_encoder_output_options(selected),
                str(output_path),
            ]
        )

        print(f"[Converter] Merging audio into looped MP4 with {selected.label}: {video_path} -> {output_path}")
        run_ffmpeg(args, "Loi ghep audio")
        print(f"[Converter] Audio merge complete: {output_path}")
        return str(output_path)

    try:
        return run_with_encoder(encoder)
    except Exception as err:
        if (encoder.hardware or hardware_decode_enabled) and should_fallback_to_cpu():
            cleanup_files([output_path])
            print(f"[Converter] Hardware MP4 audio merge path failed ({err}). Retrying with CPU libx264.")
            return merge_looped_video_with_audio_cpu(video_path, audio_paths, output_path, format_name, options)
        raise


def convert_with_optional_audio(webm_path: str | Path, format_name: str, options: dict | None = None) -> str:
    options = options or {}
    audio_urls = options.get("audioUrls") or []
    if not audio_urls:
        return convert(webm_path, format_name, options)

    if format_name == "gif":
        raise RuntimeError('Khong the ghep audio voi GIF. Vui long chon format "mp4" hoac "webm".')

    audio_paths = download_audio_files(audio_urls)
    audio_duration_seconds = get_total_audio_duration_seconds(audio_paths)
    output_path = str(webm_path).replace(".webm", f"_audio.{format_name}")

    try:
        print(f"[Converter] Total audio duration: {audio_duration_seconds:.2f}s")
        result = merge_looped_video_with_audio(
            webm_path,
            audio_paths,
            output_path,
            format_name,
            {**options, "audioDurationSeconds": audio_duration_seconds},
        )
        cleanup_files([webm_path])
        return result
    finally:
        cleanup_files(audio_paths)


def get_mime_type(format_name: str) -> str:
    return {
        "webm": "video/webm",
        "mp4": "video/mp4",
        "gif": "image/gif",
    }.get(format_name, "application/octet-stream")
