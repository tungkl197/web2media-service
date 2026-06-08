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

