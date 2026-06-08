from __future__ import annotations

import asyncio
import base64
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from playwright.async_api import Browser, Page, Playwright, async_playwright

from app.config import SERVER_CONFIG
from app.schemas import RecordRequest


_playwright: Playwright | None = None
_browser: Browser | None = None
_browser_lock = asyncio.Lock()
_active_lock = asyncio.Lock()
_active_recordings = 0


def get_active_count() -> int:
    return _active_recordings


async def _on_browser_disconnected() -> None:
    global _browser
    _browser = None


async def get_browser() -> Browser:
    global _browser, _playwright

    async with _browser_lock:
        if _browser and _browser.is_connected():
            return _browser

        if _playwright is None:
            _playwright = await async_playwright().start()

        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-zygote",
                "--disable-extensions",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )
        _browser.on("disconnected", lambda *_: asyncio.create_task(_on_browser_disconnected()))
        return _browser


async def download_image_as_data_url(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*",
        "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers=headers) as client:
        response = await client.get(url)
        response.raise_for_status()
        content = response.content

    if len(content) < 100:
        raise RuntimeError("Downloaded file too small - likely not an image")

    mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


async def _increment_recordings() -> None:
    global _active_recordings
    async with _active_lock:
        if _active_recordings >= SERVER_CONFIG.max_concurrent:
            raise RuntimeError(
                f"Đã đạt giới hạn {SERVER_CONFIG.max_concurrent} video đồng thời. Vui lòng thử lại sau."
            )
        _active_recordings += 1


async def _decrement_recordings() -> None:
    global _active_recordings
    async with _active_lock:
        _active_recordings = max(0, _active_recordings - 1)


async def render_video(params: RecordRequest) -> Path:
    await _increment_recordings()
    page: Page | None = None

    try:
        browser = await get_browser()
        page = await browser.new_page()
        await page.set_viewport_size({"width": params.width, "height": params.height})

        render_page_path = SERVER_CONFIG.public_dir / "firefly-render.html"
        await page.goto(render_page_path.as_uri(), wait_until="domcontentloaded", timeout=15_000)
        await page.wait_for_function("window.__PAGE_READY === true", timeout=10_000)

        firefly_config = {
            "bgIndex": params.bg_index,
            "bgCustom": params.bg_url,
            "count": params.count,
            "size": params.size,
            "speed": params.speed,
            "colorMode": params.color_mode,
            "colorIndex": params.color_index,
            "customColor": params.custom_color,
            "glowLevel": params.glow_level,
            "direction": params.direction,
            "spread": params.spread,
        }

        if params.bg_url:
            if params.bg_url.startswith("data:"):
                firefly_config["bgCustom"] = params.bg_url
            elif urlparse(params.bg_url).scheme in {"http", "https"}:
                try:
                    firefly_config["bgCustom"] = await download_image_as_data_url(params.bg_url)
                except Exception as exc:
                    print(f"[Renderer] Background download failed: {exc}. Using preset instead.")
                    firefly_config["bgCustom"] = None
            else:
                firefly_config["bgCustom"] = None

        await page.evaluate("(cfg) => window.__applyConfig(cfg)", firefly_config)
        await asyncio.sleep(1.5)

        base64_data = await page.evaluate(
            """({ duration, fps, bitrate }) => window.__startRecording(duration, fps, bitrate)""",
            {"duration": params.duration, "fps": params.fps, "bitrate": params.bitrate},
        )

        SERVER_CONFIG.temp_dir.mkdir(parents=True, exist_ok=True)
        temp_path = SERVER_CONFIG.temp_dir / f"{uuid.uuid4()}.webm"
        temp_path.write_bytes(base64.b64decode(base64_data))
        return temp_path
    finally:
        if page:
            await page.close()
        await _decrement_recordings()


async def render_thumbnail(html_content: str) -> bytes:
    page: Page | None = None

    try:
        browser = await get_browser()
        page = await browser.new_page()
        await page.set_viewport_size(
            {
                "width": SERVER_CONFIG.thumbnail_viewport["width"],
                "height": SERVER_CONFIG.thumbnail_viewport["height"],
            }
        )
        await page.set_content(html_content, wait_until="networkidle")
        await asyncio.sleep(SERVER_CONFIG.font_load_wait / 1000)

        thumbnail = await page.query_selector("#thumbnail")
        if thumbnail:
            return await thumbnail.screenshot(type="png")

        return await page.screenshot(
            type="png",
            clip={
                "x": 0,
                "y": 0,
                "width": SERVER_CONFIG.thumbnail_viewport["width"],
                "height": SERVER_CONFIG.thumbnail_viewport["height"],
            },
        )
    finally:
        if page:
            await page.close()


async def close_browser() -> None:
    global _browser, _playwright

    if _browser:
        try:
            await _browser.close()
        finally:
            _browser = None

    if _playwright:
        try:
            await _playwright.stop()
        finally:
            _playwright = None
