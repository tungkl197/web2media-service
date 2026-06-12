from __future__ import annotations

import json
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import SERVER_CONFIG


_cached_runtime_config: dict[str, Any] | None = None
_cache_expires_at = 0.0


def parse_maybe_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed or trimmed[0] not in "{[":
        return value
    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        return value


def pick_first(row: dict[str, Any], fields: list[str]) -> Any:
    for field in fields:
        value = row.get(field)
        if value not in (None, ""):
            return parse_maybe_json(value)
    return None


def normalize_flat_config(config: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "endpoint": ["endpoint", "r2_endpoint", "R2_ENDPOINT"],
        "accountId": ["accountId", "account_id", "r2_account_id", "R2_ACCOUNT_ID"],
        "accessKeyId": ["accessKeyId", "access_key_id", "r2_access_key_id", "R2_ACCESS_KEY_ID"],
        "secretAccessKey": [
            "secretAccessKey",
            "secret_access_key",
            "r2_secret_access_key",
            "R2_SECRET_ACCESS_KEY",
        ],
        "bucket": ["bucket", "r2_bucket", "bucket_name", "R2_BUCKET", "R2_BUCKET_NAME"],
        "key": ["key", "r2_key", "object_key", "R2_KEY"],
        "keyPrefix": ["keyPrefix", "key_prefix", "r2_key_prefix", "R2_KEY_PREFIX"],
        "publicBaseUrl": [
            "publicBaseUrl",
            "public_base_url",
            "public_domain",
            "r2_public_base_url",
            "r2_public_domain",
            "R2_PUBLIC_BASE_URL",
            "R2_PUBLIC_DOMAIN",
        ],
        "region": ["region", "r2_region", "R2_REGION"],
    }

    normalized: dict[str, Any] = {}
    for target, keys in aliases.items():
        value = pick_first(config, keys)
        if value is not None:
            normalized[target] = value
    return normalized


def get_row_name(row: dict[str, Any]) -> str:
    value = pick_first(
        row,
        ["key", "name", "config_key", "config_name", "setting_key", "setting_name", "slug"],
    )
    return value if isinstance(value, str) else ""


def get_row_value(row: dict[str, Any]) -> Any:
    return pick_first(row, ["value", "config", "config_value", "json_value", "settings", "data", "metadata"])


def build_config_from_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}

    for row in rows:
        row_name = get_row_name(row)
        row_value = get_row_value(row)

        if row_name and row_value is not None:
            lower_name = row_name.lower()
            if lower_name in {"r2", "r2_config", "r2_upload", "cloudflare_r2"} and isinstance(row_value, dict):
                merged.update(row_value)
                continue
            merged[row_name] = row_value
            continue

        merged.update(row)

    if isinstance(merged.get("r2"), dict):
        merged.update(merged["r2"])

    return normalize_flat_config(merged)


def validate_r2_runtime_config(r2_config: dict[str, Any]) -> dict[str, Any]:
    missing = []
    if not r2_config.get("endpoint") and not r2_config.get("accountId"):
        missing.append("endpoint/accountId")

    for field in ["accessKeyId", "secretAccessKey", "bucket", "publicBaseUrl"]:
        if not r2_config.get(field):
            missing.append(field)

    if missing:
        raise RuntimeError(f"Thieu cau hinh R2 trong runtime_configs: {', '.join(missing)}")

    return {"region": "auto", **r2_config}


async def fetch_runtime_config_rows() -> list[dict[str, Any]]:
    if not SERVER_CONFIG.supabase_url or not SERVER_CONFIG.supabase_service_role_key:
        raise RuntimeError("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY")

    base_url = SERVER_CONFIG.supabase_url.rstrip("/")
    table = quote(SERVER_CONFIG.runtime_configs_table, safe="")
    url = f"{base_url}/rest/v1/{table}?select=*"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            url,
            headers={
                "apikey": SERVER_CONFIG.supabase_service_role_key,
                "Authorization": f"Bearer {SERVER_CONFIG.supabase_service_role_key}",
                "Accept": "application/json",
            },
        )

    if response.status_code >= 400:
        raise RuntimeError(f"Khong doc duoc runtime_configs tu Supabase: HTTP {response.status_code} {response.text}")

    data = response.json()
    if not isinstance(data, list):
        raise RuntimeError("runtime_configs tra ve du lieu khong hop le")
    return data


async def get_runtime_r2_config(force_refresh: bool = False) -> dict[str, Any]:
    global _cached_runtime_config, _cache_expires_at

    now = time.time() * 1000
    if not force_refresh and _cached_runtime_config and now < _cache_expires_at:
        return _cached_runtime_config["r2"]

    rows = await fetch_runtime_config_rows()
    r2 = validate_r2_runtime_config(build_config_from_rows(rows))
    _cached_runtime_config = {"r2": r2}
    _cache_expires_at = now + SERVER_CONFIG.runtime_config_cache_ttl_ms
    return r2


def clear_runtime_config_cache() -> None:
    global _cached_runtime_config, _cache_expires_at
    _cached_runtime_config = None
    _cache_expires_at = 0
