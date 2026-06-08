from fastapi.testclient import TestClient

from app.main import app


def test_openapi_record_request_has_full_schema_and_examples():
    with TestClient(app) as client:
        schema = client.get("/openapi.json").json()

    record = schema["paths"]["/api/record"]["post"]["requestBody"]["content"]["application/json"]
    record_schema = schema["components"]["schemas"]["RecordRequest"]

    assert record["schema"]["$ref"] == "#/components/schemas/RecordRequest"
    assert "minimal" in record["examples"]
    assert "custom_color_mp4" in record["examples"]
    assert "count" in record_schema["properties"]
    assert "customColor" in record_schema["properties"]
    assert "bgUrl" in record_schema["properties"]
    assert "format" in record_schema["properties"]


def test_openapi_thumbnail_request_has_schema_and_examples():
    with TestClient(app) as client:
        schema = client.get("/openapi.json").json()

    thumbnail = schema["paths"]["/api/generate-thumbnail"]["post"]["requestBody"]["content"]["application/json"]
    thumbnail_schema = schema["components"]["schemas"]["ThumbnailRequest"]

    assert thumbnail["schema"]["$ref"] == "#/components/schemas/ThumbnailRequest"
    assert "default" in thumbnail["examples"]
    assert "multi_color" in thumbnail["examples"]
    assert thumbnail_schema["required"] == ["r2_url", "text", "upload_url", "api_key"]
