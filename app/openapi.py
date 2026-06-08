from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


RECORD_REQUEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": "Tham số cấu hình để tạo video. Tất cả field đều có giá trị mặc định.",
    "properties": {
        "count": {
            "type": "integer",
            "minimum": 10,
            "maximum": 300,
            "default": 80,
            "example": 80,
            "description": "Số lượng đom đóm.",
        },
        "size": {
            "type": "number",
            "minimum": 1,
            "maximum": 6,
            "default": 2.5,
            "example": 2.5,
            "description": "Kích thước mỗi đom đóm.",
        },
        "speed": {
            "type": "number",
            "minimum": 0.2,
            "maximum": 3,
            "default": 1.0,
            "example": 1.0,
            "description": "Tốc độ bay.",
        },
        "colorMode": {
            "type": "string",
            "enum": ["preset", "custom"],
            "default": "preset",
            "example": "preset",
            "description": "Dùng màu preset hoặc màu hex tùy chỉnh.",
        },
        "colorIndex": {
            "type": "integer",
            "minimum": 0,
            "maximum": 5,
            "default": 0,
            "example": 1,
            "description": "Index màu preset: 0 xanh lá, 1 vàng, 2 xanh lam, 3 cam, 4 trắng, 5 hồng.",
        },
        "customColor": {
            "type": "string",
            "pattern": "^#[0-9a-fA-F]{6}$",
            "default": "#7fff9a",
            "example": "#ff6b9d",
            "description": "Màu hex khi colorMode là custom.",
        },
        "glowLevel": {
            "type": "string",
            "enum": ["low", "mid", "high"],
            "default": "mid",
            "example": "high",
            "description": "Cường độ phát sáng.",
        },
        "direction": {
            "type": "string",
            "enum": ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right", "random"],
            "default": "up",
            "example": "random",
            "description": "Hướng bay của đom đóm.",
        },
        "spread": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "default": 0.4,
            "example": 0.7,
            "description": "Độ tản mạn, 0 là bay thẳng, 1 là tản rộng.",
        },
        "bgIndex": {
            "type": "integer",
            "minimum": 0,
            "maximum": 7,
            "default": 1,
            "example": 3,
            "description": "Index background preset.",
        },
        "bgUrl": {
            "type": "string",
            "nullable": True,
            "format": "uri",
            "default": None,
            "example": "https://example.com/background.jpg",
            "description": "URL ảnh nền tùy chỉnh. Nếu có, giá trị này override bgIndex.",
        },
        "duration": {
            "type": "integer",
            "minimum": 3,
            "maximum": 120,
            "default": 10,
            "example": 10,
            "description": "Thời lượng video tính bằng giây.",
        },
        "fps": {
            "type": "integer",
            "enum": [24, 30, 60],
            "default": 60,
            "example": 30,
            "description": "Số frame mỗi giây.",
        },
        "width": {
            "type": "integer",
            "minimum": 320,
            "maximum": 3840,
            "default": 1920,
            "example": 1280,
            "description": "Chiều rộng video.",
        },
        "height": {
            "type": "integer",
            "minimum": 240,
            "maximum": 2160,
            "default": 1080,
            "example": 720,
            "description": "Chiều cao video.",
        },
        "bitrate": {
            "type": "integer",
            "minimum": 1_000_000,
            "maximum": 20_000_000,
            "default": 5_000_000,
            "example": 5_000_000,
            "description": "Video bitrate theo bps.",
        },
        "format": {
            "type": "string",
            "enum": ["webm", "mp4", "gif"],
            "default": "webm",
            "example": "mp4",
            "description": "Định dạng output.",
        },
        "filename": {
            "type": "string",
            "pattern": "^[a-zA-Z0-9_-]+$",
            "maxLength": 100,
            "default": "firefly",
            "example": "pink-fireflies",
            "description": "Tên file download, không bao gồm extension.",
        },
    },
}

THUMBNAIL_REQUEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["r2_url", "text", "upload_url", "api_key"],
    "properties": {
        "r2_url": {
            "type": "string",
            "format": "uri",
            "example": "https://example.com/girl.jpg",
            "description": "Public URL của ảnh nhân vật.",
        },
        "text": {
            "type": "string",
            "example": "Tôi đòi <green>nghỉ việc</green>",
            "description": "Text thumbnail. Hỗ trợ tag màu: green, red, blue, yellow, white.",
        },
        "upload_url": {
            "type": "string",
            "format": "uri",
            "example": "https://api.example.com",
            "description": "Base URL của dịch vụ upload. API sẽ gọi /api/public/v1/upload.",
        },
        "api_key": {
            "type": "string",
            "example": "my-api-key",
            "description": "API key gửi qua header Authorization khi upload.",
        },
    },
}

RECORD_EXAMPLES: dict[str, Any] = {
    "minimal": {
        "summary": "Tối giản",
        "description": "Chỉ đổi thời lượng, các tham số còn lại dùng mặc định.",
        "value": {"duration": 5},
    },
    "preset_color": {
        "summary": "Đom đóm vàng, nền rừng",
        "value": {
            "count": 120,
            "size": 3,
            "speed": 1.5,
            "colorMode": "preset",
            "colorIndex": 1,
            "glowLevel": "high",
            "bgIndex": 0,
            "direction": "up",
            "duration": 10,
            "format": "webm",
        },
    },
    "custom_color_mp4": {
        "summary": "Màu tùy chỉnh + MP4",
        "value": {
            "count": 200,
            "size": 2,
            "speed": 0.8,
            "colorMode": "custom",
            "customColor": "#ff6b9d",
            "glowLevel": "mid",
            "direction": "random",
            "spread": 0.7,
            "bgIndex": 7,
            "duration": 15,
            "width": 1280,
            "height": 720,
            "fps": 30,
            "format": "mp4",
            "filename": "pink-fireflies",
        },
    },
    "gif_output": {
        "summary": "Export GIF nhẹ",
        "value": {
            "count": 60,
            "size": 3.5,
            "glowLevel": "high",
            "colorIndex": 2,
            "direction": "up-right",
            "bgIndex": 3,
            "duration": 5,
            "width": 640,
            "height": 360,
            "fps": 24,
            "format": "gif",
            "filename": "firefly-preview",
        },
    },
    "custom_background": {
        "summary": "Ảnh nền tùy chỉnh",
        "value": {
            "count": 100,
            "speed": 0.9,
            "colorMode": "preset",
            "colorIndex": 4,
            "bgUrl": "https://example.com/background.jpg",
            "direction": "random",
            "duration": 10,
            "format": "mp4",
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "filename": "stars-fireflies",
        },
    },
}

THUMBNAIL_EXAMPLES: dict[str, Any] = {
    "default": {
        "summary": "Thumbnail chuẩn",
        "value": {
            "r2_url": "https://example.com/girl.jpg",
            "text": "Tôi đòi <green>nghỉ việc</green>",
            "upload_url": "https://api.example.com",
            "api_key": "my-api-key",
        },
    },
    "multi_color": {
        "summary": "Text nhiều màu",
        "value": {
            "r2_url": "https://example.com/person.png",
            "text": "<red>Sếp tổng</red> nghe xong <blue>phát điên</blue>",
            "upload_url": "https://upload.example.com",
            "api_key": "Bearer your-token",
        },
    },
}


def build_custom_openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    components = openapi_schema.setdefault("components", {}).setdefault("schemas", {})
    components["RecordRequest"] = RECORD_REQUEST_SCHEMA
    components["ThumbnailRequest"] = THUMBNAIL_REQUEST_SCHEMA

    record = openapi_schema["paths"]["/api/record"]["post"]
    record.update(
        {
            "tags": ["Recording"],
            "summary": "Tạo video đom đóm",
            "description": "Render animation đom đóm với cấu hình tùy chỉnh và trả về file video.",
            "requestBody": {
                "required": False,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/RecordRequest"},
                        "examples": RECORD_EXAMPLES,
                    }
                },
            },
            "responses": {
                "200": {
                    "description": "Video file được tạo thành công",
                    "content": {
                        "video/webm": {"schema": {"type": "string", "format": "binary"}},
                        "video/mp4": {"schema": {"type": "string", "format": "binary"}},
                        "image/gif": {"schema": {"type": "string", "format": "binary"}},
                    },
                },
                "400": {"description": "Tham số không hợp lệ"},
                "429": {"description": "Quá nhiều tiến trình đồng thời"},
                "500": {"description": "Lỗi server"},
            },
        }
    )

    thumbnail = openapi_schema["paths"]["/api/generate-thumbnail"]["post"]
    thumbnail.update(
        {
            "tags": ["Thumbnail"],
            "summary": "Tạo thumbnail PNG và upload",
            "description": "Download ảnh, render thumbnail PNG bằng template, sau đó upload tới dịch vụ bên ngoài.",
            "requestBody": {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/ThumbnailRequest"},
                        "examples": THUMBNAIL_EXAMPLES,
                    }
                },
            },
            "responses": {
                "200": {"description": "Upload API response"},
                "400": {"description": "Không tải được ảnh hoặc request network lỗi"},
                "422": {"description": "Validation error"},
                "429": {"description": "Quá nhiều tiến trình đồng thời"},
                "500": {"description": "Lỗi server"},
                "502": {"description": "Upload API trả lỗi"},
            },
        }
    )

    openapi_schema["paths"]["/api/presets"]["get"].update(
        {"tags": ["Presets"], "summary": "Danh sách preset có sẵn"}
    )
    openapi_schema["paths"]["/api/health"]["get"].update(
        {"tags": ["System"], "summary": "Kiểm tra trạng thái server"}
    )

    app.openapi_schema = openapi_schema
    return app.openapi_schema
