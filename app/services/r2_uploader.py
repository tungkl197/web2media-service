from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import quote

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config

from app.core.config import SERVER_CONFIG


def normalize_endpoint(r2_config: dict[str, Any]) -> str | None:
    endpoint = r2_config.get("endpoint")
    if endpoint:
        return str(endpoint).rstrip("/")

    account_id = r2_config.get("accountId")
    if account_id:
        return f"https://{account_id}.r2.cloudflarestorage.com"

    return None


def normalize_key(key: str) -> str:
    normalized = key.replace("\\", "/").lstrip("/")
    while "//" in normalized:
        normalized = normalized.replace("//", "/")
    return normalized


def build_r2_key(r2_config: dict[str, Any], filename: str) -> str:
    if r2_config.get("key"):
        return normalize_key(str(r2_config["key"]))

    prefix = normalize_key(str(r2_config.get("keyPrefix") or ""))
    if prefix:
        prefix = prefix.rstrip("/") + "/"
    return f"{prefix}{filename}"


def build_public_url(r2_config: dict[str, Any], key: str) -> str | None:
    public_base_url = r2_config.get("publicBaseUrl")
    if not public_base_url:
        return None
    encoded_key = "/".join(quote(part) for part in key.split("/"))
    return f"{str(public_base_url).rstrip('/')}/{encoded_key}"


def get_content_type(file_path: Path, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(str(file_path))
    return guessed or fallback


def upload_file_to_r2(
    file_path: str | Path,
    r2_config: dict[str, Any],
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    path = Path(file_path)
    endpoint = normalize_endpoint(r2_config)
    if not endpoint:
        raise RuntimeError("Thieu endpoint hoac accountId trong cau hinh R2 runtime_configs")

    object_filename = filename or path.name
    key = build_r2_key(r2_config, object_filename)
    file_size = path.stat().st_size
    object_content_type = content_type or get_content_type(path)

    client = boto3.client(
        "s3",
        region_name=r2_config.get("region") or "auto",
        endpoint_url=endpoint,
        aws_access_key_id=r2_config.get("accessKeyId"),
        aws_secret_access_key=r2_config.get("secretAccessKey"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    part_size = int(r2_config.get("partSize") or SERVER_CONFIG.r2_upload_part_size)
    queue_size = int(r2_config.get("queueSize") or SERVER_CONFIG.r2_upload_queue_size)
    transfer_config = TransferConfig(
        multipart_threshold=part_size,
        multipart_chunksize=part_size,
        max_concurrency=queue_size,
        use_threads=True,
    )

    print(f"[R2] Uploading {path} -> {r2_config.get('bucket')}/{key}")
    client.upload_file(
        str(path),
        r2_config["bucket"],
        key,
        ExtraArgs={"ContentType": object_content_type},
        Config=transfer_config,
    )

    etag = None
    try:
        head = client.head_object(Bucket=r2_config["bucket"], Key=key)
        etag = head.get("ETag")
    except Exception:
        pass

    print(f"[R2] Upload complete: {r2_config.get('bucket')}/{key}")
    return {
        "bucket": r2_config["bucket"],
        "key": key,
        "size": file_size,
        "contentType": object_content_type,
        "etag": etag,
        "url": build_public_url(r2_config, key),
    }
