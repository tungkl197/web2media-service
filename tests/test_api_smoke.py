from fastapi.testclient import TestClient

from app.main import app


def test_health_and_presets_endpoints():
    with TestClient(app) as client:
        health = client.get("/api/health")
        presets = client.get("/api/presets")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert presets.status_code == 200
    assert len(presets.json()["data"]["backgrounds"]) == 8


def test_root_and_404_contract():
    with TestClient(app) as client:
        root = client.get("/")
        missing = client.get("/missing")

    assert root.status_code == 200
    assert root.json()["name"] == "Web2Media Service"
    assert missing.status_code == 404
    assert missing.json()["success"] is False


def test_record_validation_contract():
    with TestClient(app) as client:
        response = client.post("/api/record", json={"count": 301})

    assert response.status_code == 400
    assert response.json() == {
        "success": False,
        "error": "Tham số không hợp lệ",
        "details": [{"field": "count", "message": "Số lượng đom đóm phải <= 300"}],
    }


def test_thumbnail_validation_contract():
    with TestClient(app) as client:
        response = client.post("/api/generate-thumbnail", json={})

    assert response.status_code == 422
    assert response.json()["error"] == "Validation failed"
