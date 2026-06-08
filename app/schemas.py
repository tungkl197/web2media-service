from __future__ import annotations

import re
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class RecordRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    count: int = Field(80, ge=10, le=300)
    size: float = Field(2.5, ge=1, le=6)
    speed: float = Field(1.0, ge=0.2, le=3)
    color_mode: Literal["preset", "custom"] = Field("preset", alias="colorMode")
    color_index: int = Field(0, ge=0, le=5, alias="colorIndex")
    custom_color: str = Field("#7fff9a", alias="customColor")
    glow_level: Literal["low", "mid", "high"] = Field("mid", alias="glowLevel")
    direction: Literal["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right", "random"] = "up"
    spread: float = Field(0.4, ge=0, le=1)
    bg_index: int = Field(1, ge=0, le=7, alias="bgIndex")
    bg_url: str | None = Field(None, alias="bgUrl")
    duration: int = Field(10, ge=3, le=120)
    fps: Literal[24, 30, 60] = 60
    width: int = Field(1920, ge=320, le=3840)
    height: int = Field(1080, ge=240, le=2160)
    bitrate: int = Field(5_000_000, ge=1_000_000, le=20_000_000)
    format: Literal["webm", "mp4", "gif"] = "webm"
    filename: str = Field("firefly", max_length=100)

    @field_validator("custom_color")
    @classmethod
    def validate_custom_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("custom_color_pattern")
        return value

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", value):
            raise ValueError("filename_pattern")
        return value

    @field_validator("bg_url", mode="before")
    @classmethod
    def validate_bg_url(cls, value: Any) -> str | None:
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            raise ValueError("bg_url_uri")
        parsed = urlparse(value)
        if not parsed.scheme:
            raise ValueError("bg_url_uri")
        return value


class ThumbnailRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    r2_url: str
    text: str
    upload_url: str
    api_key: str

    @field_validator("r2_url", "upload_url")
    @classmethod
    def validate_http_url(cls, value: str, info: Any) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{info.field_name}_uri")
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(f"{info.field_name}_uri")
        return value

    @field_validator("text", "api_key")
    @classmethod
    def validate_required_text(cls, value: str, info: Any) -> str:
        if not isinstance(value, str):
            raise ValueError(f"{info.field_name}_required")
        trimmed = value.strip()
        if not trimmed:
            raise ValueError(f"{info.field_name}_empty")
        return trimmed


RECORD_MESSAGES = {
    "count": {
        "greater_than_equal": "Số lượng đom đóm phải >= 10",
        "less_than_equal": "Số lượng đom đóm phải <= 300",
    },
    "size": {
        "greater_than_equal": "Kích thước phải >= 1",
        "less_than_equal": "Kích thước phải <= 6",
    },
    "speed": {
        "greater_than_equal": "Tốc độ phải >= 0.2",
        "less_than_equal": "Tốc độ phải <= 3.0",
    },
    "colorMode": {"literal_error": 'colorMode phải là "preset" hoặc "custom"'},
    "colorIndex": {"less_than_equal": "colorIndex phải từ 0 đến 5"},
    "customColor": {"value_error": "customColor phải là mã hex hợp lệ (VD: #7fff9a)"},
    "glowLevel": {"literal_error": 'glowLevel phải là "low", "mid" hoặc "high"'},
    "direction": {"literal_error": "direction không hợp lệ"},
    "spread": {
        "greater_than_equal": "Độ tản mạn phải >= 0",
        "less_than_equal": "Độ tản mạn phải <= 1",
    },
    "bgIndex": {"less_than_equal": "bgIndex phải từ 0 đến 7"},
    "bgUrl": {"value_error": "bgUrl phải là URL hợp lệ"},
    "duration": {
        "greater_than_equal": "Thời lượng phải >= 3 giây",
        "less_than_equal": "Thời lượng phải <= 120 giây",
    },
    "fps": {"literal_error": "FPS phải là 24, 30 hoặc 60"},
    "width": {
        "greater_than_equal": "Chiều rộng phải >= 320px",
        "less_than_equal": "Chiều rộng phải <= 3840px",
    },
    "height": {
        "greater_than_equal": "Chiều cao phải >= 240px",
        "less_than_equal": "Chiều cao phải <= 2160px",
    },
    "bitrate": {
        "greater_than_equal": "Bitrate phải >= 1,000,000 bps",
        "less_than_equal": "Bitrate phải <= 20,000,000 bps",
    },
    "format": {"literal_error": 'Format phải là "webm", "mp4" hoặc "gif"'},
    "filename": {
        "value_error": "Tên file chỉ được chứa chữ cái, số, dấu gạch ngang và gạch dưới",
        "string_too_long": "Tên file tối đa 100 ký tự",
    },
}

THUMBNAIL_MESSAGES = {
    "r2_url": {
        "missing": "r2_url là bắt buộc",
        "value_error": "r2_url phải là URL hợp lệ (http/https)",
    },
    "text": {
        "missing": "text là bắt buộc",
        "value_error": "text không được để trống",
    },
    "upload_url": {
        "missing": "upload_url là bắt buộc",
        "value_error": "upload_url phải là URL hợp lệ (http/https)",
    },
    "api_key": {
        "missing": "api_key là bắt buộc",
        "value_error": "api_key không được để trống",
    },
}


def _field_from_error(error: dict[str, Any]) -> str:
    loc = [str(part) for part in error.get("loc", []) if part != "body"]
    return loc[-1] if loc else ""


def format_record_errors(exc: ValidationError) -> list[dict[str, str]]:
    details = []
    for error in exc.errors():
        field = _field_from_error(error)
        error_type = error.get("type", "")
        message = RECORD_MESSAGES.get(field, {}).get(error_type, error.get("msg", "Invalid value"))
        details.append({"field": field, "message": message})
    return details


def format_thumbnail_errors(exc: ValidationError) -> list[dict[str, str]]:
    details = []
    for error in exc.errors():
        field = _field_from_error(error)
        error_type = error.get("type", "")
        message = THUMBNAIL_MESSAGES.get(field, {}).get(error_type, error.get("msg", "Invalid value"))
        details.append({"field": field, "message": message})
    return details
