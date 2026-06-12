from __future__ import annotations

import base64
from pathlib import Path
from uuid import uuid4

import httpx
from playwright.async_api import Browser, async_playwright

from app.core.config import SERVER_CONFIG


_playwright = None
_browser: Browser | None = None
_active_firefly_video_records = 0


def get_browser_gpu_args(enabled: bool) -> list[str]:
    if not enabled:
        return ["--disable-gpu"]

    args = [
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
    ]

    import sys

    if sys.platform.startswith("win"):
        args.append("--use-angle=d3d11")
    elif sys.platform.startswith("linux"):
        args.extend(["--use-gl=egl", "--enable-features=VaapiVideoDecoder,VaapiVideoEncoder"])

    return args


def build_browser_launch_args(gpu_enabled: bool | None = None) -> list[str]:
    if gpu_enabled is None:
        gpu_enabled = SERVER_CONFIG.browser_gpu_enabled

    return [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        *get_browser_gpu_args(gpu_enabled),
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--autoplay-policy=no-user-gesture-required",
        *SERVER_CONFIG.browser_gpu_extra_args,
    ]


async def download_image_as_data_url(url: str, max_redirects: int = 5) -> str:
    async with httpx.AsyncClient(
        timeout=15,
        follow_redirects=True,
        max_redirects=max_redirects,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept": "image/*,*/*",
            "Referer": str(httpx.URL(url).copy_with(path="/")),
        },
    ) as client:
        response = await client.get(url)

    if response.status_code != 200:
        raise RuntimeError(f"HTTP {response.status_code} from {url}")

    content = response.content
    if len(content) < 100:
        raise RuntimeError("Downloaded file too small - likely not an image")

    mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


async def get_browser() -> Browser:
    global _playwright, _browser

    if _browser and _browser.is_connected():
        return _browser

    if _playwright is None:
        _playwright = await async_playwright().start()

    try:
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=build_browser_launch_args(),
        )
        print(f"[Renderer] Browser GPU acceleration: {'enabled' if SERVER_CONFIG.browser_gpu_enabled else 'disabled'}")
    except Exception as err:
        if not SERVER_CONFIG.browser_gpu_enabled or not SERVER_CONFIG.browser_gpu_fallback:
            raise
        print(f"[Renderer] Browser GPU launch failed ({err}). Retrying with GPU disabled.")
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=build_browser_launch_args(False),
        )
        print("[Renderer] Browser GPU acceleration: disabled after fallback")

    return _browser


async def render_firefly_video(params: dict) -> str:
    global _active_firefly_video_records

    if _active_firefly_video_records >= SERVER_CONFIG.max_concurrent:
        raise RuntimeError(
            f"Da dat gioi han {SERVER_CONFIG.max_concurrent} video dong thoi. Vui long thu lai sau."
        )

    _active_firefly_video_records += 1
    page = None
    try:
        browser = await get_browser()
        page = await browser.new_page(
            viewport={
                "width": int(params["width"]),
                "height": int(params["height"]),
                "deviceScaleFactor": 1,
            }
        )

        render_page_path = SERVER_CONFIG.public_dir / "firefly-render.html"
        await page.goto(render_page_path.resolve().as_uri(), wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_function("window.__PAGE_READY === true", timeout=10000)

        firefly_config = {
            "bgIndex": params["bgIndex"],
            "bgCustom": params.get("bgUrl") or None,
            "count": params["count"],
            "size": params["size"],
            "speed": params["speed"],
            "colorMode": params["colorMode"],
            "colorIndex": params["colorIndex"],
            "customColor": params["customColor"],
            "glowLevel": params["glowLevel"],
            "direction": params["direction"],
            "spread": params["spread"],
        }

        if params.get("bgUrl"):
            print(f"[Renderer] Downloading background: {params['bgUrl']}")
            try:
                data_url = await download_image_as_data_url(params["bgUrl"])
                firefly_config["bgCustom"] = data_url
                print(f"[Renderer] Background loaded ({len(data_url) // 1024} KB data URL)")
            except Exception as err:
                print(f"[Renderer] Background download failed: {err}. Using preset instead.")
                firefly_config["bgCustom"] = None

        await page.evaluate("(cfg) => window.__applyConfig(cfg)", firefly_config)
        await page.wait_for_timeout(1500)

        print(
            "[Renderer] Starting recording: "
            f"{params['width']}x{params['height']}, {params['duration']}s, "
            f"{params['fps']}fps, {params['bitrate']}bps"
        )

        base64_data = await page.evaluate(
            """(args) => window.__startRecording(args.duration, args.fps, args.bitrate)""",
            {
                "duration": params["duration"],
                "fps": params["fps"],
                "bitrate": params["bitrate"],
            },
        )

        SERVER_CONFIG.temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = SERVER_CONFIG.temp_dir / f"{uuid4()}.webm"
        video_bytes = base64.b64decode(base64_data)
        temp_path.write_bytes(video_bytes)

        print(f"[Renderer] Recording saved: {temp_path} ({len(video_bytes) / 1024 / 1024:.2f} MB)")
        return str(temp_path)
    finally:
        if page:
            try:
                await page.close()
            except Exception:
                pass
        _active_firefly_video_records -= 1


def get_active_firefly_video_record_count() -> int:
    return _active_firefly_video_records


async def close_browser() -> None:
    global _playwright, _browser
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _playwright:
        try:
            await _playwright.stop()
        except Exception:
            pass
        _playwright = None
