from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import SERVER_CONFIG
from app.services.converter import convert_with_optional_audio, get_mime_type
from app.services.r2_uploader import upload_file_to_r2
from app.services.renderer import render_firefly_video
from app.services.runtime_config import get_runtime_r2_config


class JobStatus:
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass
class FireflyVideoJob:
    id: str
    status: str
    params: dict[str, Any]
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    created_at: str = field(default_factory=lambda: now_iso())
    updated_at: str = field(default_factory=lambda: now_iso())
    started_at: str | None = None
    completed_at: str | None = None
    progress: dict[str, Any] = field(default_factory=lambda: {"step": "queued", "message": "Waiting in queue", "percent": 0})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def cleanup_files(paths: list[str | Path | None]) -> None:
    for file_path in paths:
        if not file_path:
            continue
        try:
            Path(file_path).unlink()
        except OSError:
            pass


def serialize_job(job: FireflyVideoJob) -> dict[str, Any]:
    response = {
        "jobId": job.id,
        "status": job.status,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "startedAt": job.started_at,
        "completedAt": job.completed_at,
        "progress": job.progress,
    }

    if job.status == JobStatus.DONE and job.result:
        response["url"] = job.result.get("url")
        response["data"] = job.result

    if job.status == JobStatus.FAILED and job.error:
        response["error"] = job.error.get("message")

    return response


class FireflyVideoJobQueue:
    def __init__(self) -> None:
        self.jobs: dict[str, FireflyVideoJob] = {}
        self.pending_queue: list[str] = []
        self.running_count = 0
        self.lock = asyncio.Lock()

    def get_queue_concurrency(self) -> int:
        return max(1, min(SERVER_CONFIG.job_queue_concurrency, SERVER_CONFIG.max_concurrent))

    def set_job_progress(self, job: FireflyVideoJob, step: str, message: str, percent: int) -> None:
        job.progress = {"step": step, "message": message, "percent": percent}
        job.updated_at = now_iso()

    def cleanup_finished_jobs(self) -> None:
        cutoff_ms = time.time() * 1000 - SERVER_CONFIG.job_retention_ms
        for job_id, job in list(self.jobs.items()):
            if job.status not in {JobStatus.DONE, JobStatus.FAILED} or not job.completed_at:
                continue
            completed_ts = datetime.fromisoformat(job.completed_at.replace("Z", "+00:00")).timestamp() * 1000
            if completed_ts < cutoff_ms:
                self.jobs.pop(job_id, None)

    async def create_job(self, params: dict[str, Any]) -> dict[str, Any]:
        async with self.lock:
            self.cleanup_finished_jobs()
            job = FireflyVideoJob(id=str(uuid4()), status=JobStatus.QUEUED, params=params)
            self.jobs[job.id] = job
            self.pending_queue.append(job.id)
            await self.pump_queue_locked()
            return serialize_job(job)

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        async with self.lock:
            job = self.jobs.get(job_id)
            return serialize_job(job) if job else None

    async def get_stats(self) -> dict[str, Any]:
        async with self.lock:
            return {
                "queued": len(self.pending_queue),
                "running": self.running_count,
                "total": len(self.jobs),
                "concurrency": self.get_queue_concurrency(),
            }

    async def pump_queue_locked(self) -> None:
        while self.running_count < self.get_queue_concurrency() and self.pending_queue:
            job_id = self.pending_queue.pop(0)
            job = self.jobs.get(job_id)
            if not job or job.status != JobStatus.QUEUED:
                continue
            self.running_count += 1
            asyncio.create_task(self.run_job(job))

    async def run_job(self, job: FireflyVideoJob) -> None:
        try:
            await self.process_job(job)
        finally:
            async with self.lock:
                self.running_count -= 1
                await self.pump_queue_locked()

    async def process_job(self, job: FireflyVideoJob) -> None:
        params = job.params
        has_audio = bool(params.get("audioUrls"))
        webm_path: str | None = None
        output_path: str | None = None

        job.status = JobStatus.RUNNING
        job.started_at = now_iso()
        self.set_job_progress(job, "runtime-config", "Loading R2 runtime config", 5)
        start_time = time.time()

        try:
            if has_audio and params.get("format") == "gif":
                raise RuntimeError('Khong the ghep audio voi GIF. Vui long chon format "mp4" hoac "webm".')

            print(f"\n[Job {job.id}] Starting firefly video record")
            print(
                f"[Job {job.id}] Video output: {params['duration']}s, "
                f"{params['width']}x{params['height']}, {params['fps']}fps, {params['format']}"
            )
            if has_audio:
                print(f"[Job {job.id}] Audio URLs: {len(params['audioUrls'])}")

            r2_config = await get_runtime_r2_config()

            self.set_job_progress(job, "rendering", "Rendering firefly video", 20)
            webm_path = await render_firefly_video(params)

            self.set_job_progress(
                job,
                "converting",
                "Converting and merging audio" if has_audio else f"Converting to {params['format']}",
                55,
            )
            output_path = await asyncio.to_thread(
                convert_with_optional_audio,
                webm_path,
                params["format"],
                {
                    "bitrate": params["bitrate"],
                    "fps": params["fps"],
                    "width": params["width"],
                    "audioUrls": params["audioUrls"],
                },
            )
            webm_path = None

            file_size = Path(output_path).stat().st_size
            filename = f"{params['filename']}.{params['format']}"
            mime_type = get_mime_type(params["format"])

            self.set_job_progress(job, "uploading", "Uploading video to R2", 85)
            upload_result = await asyncio.to_thread(
                upload_file_to_r2,
                output_path,
                r2_config,
                filename,
                mime_type,
            )

            cleanup_files([output_path])
            output_path = None

            elapsed_seconds = round(time.time() - start_time, 1)
            job.status = JobStatus.DONE
            job.result = {
                "url": upload_result.get("url"),
                "filename": filename,
                "format": params["format"],
                "mimeType": mime_type,
                "size": file_size,
                "duration": params["duration"],
                "hasAudio": has_audio,
                "elapsedSeconds": elapsed_seconds,
                "r2": upload_result,
            }
            job.completed_at = now_iso()
            self.set_job_progress(job, "done", "Video is ready", 100)
            print(f"[Job {job.id}] Done in {elapsed_seconds}s: {upload_result.get('url')}")
        except Exception as err:
            cleanup_files([output_path, webm_path if webm_path != output_path else None])
            message = str(err) or "Unknown error while creating video"
            job.status = JobStatus.FAILED
            job.error = {"message": message}
            job.completed_at = now_iso()
            self.set_job_progress(job, "failed", message, 100)
            print(f"[Job {job.id}] Failed: {message}")


job_queue = FireflyVideoJobQueue()
