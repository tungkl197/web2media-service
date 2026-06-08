from pydantic import ValidationError

from app.schemas import RecordRequest, ThumbnailRequest, format_record_errors, format_thumbnail_errors


def test_record_request_applies_defaults_and_ignores_unknown_fields():
    params = RecordRequest.model_validate({"duration": 5, "unknown": "ignored"})

    assert params.duration == 5
    assert params.count == 80
    assert params.format == "webm"


def test_record_request_formats_validation_errors_like_api_contract():
    try:
        RecordRequest.model_validate({"count": 301})
    except ValidationError as exc:
        details = format_record_errors(exc)
    else:
        raise AssertionError("Expected validation error")

    assert details == [{"field": "count", "message": "Số lượng đom đóm phải <= 300"}]


def test_thumbnail_request_requires_http_urls_and_text():
    try:
        ThumbnailRequest.model_validate({"r2_url": "ftp://example.com/a.png", "upload_url": "", "api_key": ""})
    except ValidationError as exc:
        details = format_thumbnail_errors(exc)
    else:
        raise AssertionError("Expected validation error")

    assert {"field": "r2_url", "message": "r2_url phải là URL hợp lệ (http/https)"} in details
    assert {"field": "text", "message": "text là bắt buộc"} in details
    assert {"field": "upload_url", "message": "upload_url phải là URL hợp lệ (http/https)"} in details
    assert {"field": "api_key", "message": "api_key không được để trống"} in details
