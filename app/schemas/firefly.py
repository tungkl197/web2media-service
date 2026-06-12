from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


class FireflyVideoConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    count: int = Field(default=80, ge=10, le=300)
    size: float = Field(default=2.5, ge=1, le=6)
    speed: float = Field(default=1.0, ge=0.2, le=3)
    colorMode: Literal["preset", "custom"] = "preset"
    colorIndex: int = Field(default=0, ge=0, le=5)
    customColor: str = Field(default="#7fff9a", pattern=r"^#[0-9a-fA-F]{6}$")
    glowLevel: Literal["low", "mid", "high"] = "mid"
    direction: Literal[
        "up",
        "down",
        "left",
        "right",
        "up-left",
        "up-right",
        "down-left",
        "down-right",
        "random",
    ] = "up"
    spread: float = Field(default=0.4, ge=0, le=1)
    bgIndex: int = Field(default=1, ge=0, le=7)
    bgUrl: str | None = None
    duration: int = Field(default=10, ge=3, le=120)
    fps: Literal[24, 30, 60] = 60
    width: int = Field(default=1920, ge=320, le=3840)
    height: int = Field(default=1080, ge=240, le=2160)
    bitrate: int = Field(default=5000000, ge=1000000, le=20000000)
    format: Literal["webm", "mp4", "gif"] = "webm"
    filename: str = Field(default="firefly", max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")

    @field_validator("bgUrl", mode="before")
    @classmethod
    def empty_bg_url_to_none(cls, value: Any) -> Any:
        if value == "":
            return None
        if value is not None and not str(value).startswith(("http://", "https://")):
            raise ValueError("bgUrl phai la URL http/https hop le")
        return value


class FireflyVideoRecordRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    config: FireflyVideoConfig = Field(default_factory=FireflyVideoConfig)
    audioUrls: list[str] = Field(default_factory=list, max_length=20)
    audio_urls: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def reject_r2(cls, value: Any) -> Any:
        if isinstance(value, dict) and "r2" in value:
            raise ValueError("r2 khong duoc truyen vao API. Cau hinh R2 duoc lay tu runtime_configs.")
        return value or {}

    @field_validator("audioUrls", "audio_urls")
    @classmethod
    def validate_audio_urls(cls, urls: list[str]) -> list[str]:
        for url in urls:
            if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                raise ValueError("audioUrls chi chap nhan URL http/https hop le")
        return urls


def validation_error_response(error: ValidationError) -> dict[str, Any]:
    details = []
    for item in error.errors():
        loc = ".".join(str(part) for part in item.get("loc", ()))
        details.append(
            {
                "field": loc,
                "message": item.get("msg", "Invalid value"),
            }
        )

    return {
        "success": False,
        "error": "Tham so khong hop le",
        "details": details,
    }


def normalize_firefly_request(payload: dict[str, Any] | None) -> dict[str, Any]:
    request_model = FireflyVideoRecordRequest.model_validate(payload or {})
    config = request_model.config.model_dump()
    return {
        **config,
        "audioUrls": [*request_model.audioUrls, *request_model.audio_urls],
    }
