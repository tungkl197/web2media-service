from pydantic import ValidationError

from app.schemas import RecordRequest, format_record_errors


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

