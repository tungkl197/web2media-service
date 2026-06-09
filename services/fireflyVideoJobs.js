/**
 * Web2Media Service - Firefly video job queue.
 *
 * This is an in-memory queue for the current Node process. It keeps the API
 * responsive while the heavy render/convert/upload pipeline runs in the
 * background.
 */

const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { SERVER_CONFIG } = require('../config');
const { renderFireflyVideo } = require('./renderer');
const { convertWithOptionalAudio, getMimeType } = require('./converter');
const { uploadFileToR2 } = require('./r2Uploader');
const { getRuntimeR2Config } = require('./runtimeConfig');

const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
};

const jobs = new Map();
const pendingQueue = [];
let runningCount = 0;

function getQueueConcurrency() {
  return Math.max(1, Math.min(SERVER_CONFIG.jobQueueConcurrency, SERVER_CONFIG.maxConcurrent));
}

function nowIso() {
  return new Date().toISOString();
}

function setJobProgress(job, step, message, percent) {
  job.progress = { step, message, percent };
  job.updatedAt = nowIso();
}

function cleanupFiles(paths) {
  for (const filePath of paths.filter(Boolean)) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }
}

function serializeJob(job) {
  const response = {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    progress: job.progress,
  };

  if (job.status === JOB_STATUS.DONE && job.result) {
    response.url = job.result.url;
    response.data = job.result;
  }

  if (job.status === JOB_STATUS.FAILED && job.error) {
    response.error = job.error.message;
  }

  return response;
}

function getFireflyVideoJob(jobId) {
  const job = jobs.get(jobId);
  return job ? serializeJob(job) : null;
}

function getFireflyVideoJobStats() {
  return {
    queued: pendingQueue.length,
    running: runningCount,
    total: jobs.size,
    concurrency: getQueueConcurrency(),
  };
}

function cleanupFinishedJobs() {
  const cutoff = Date.now() - SERVER_CONFIG.jobRetentionMs;

  for (const [jobId, job] of jobs.entries()) {
    if (![JOB_STATUS.DONE, JOB_STATUS.FAILED].includes(job.status)) {
      continue;
    }

    const completedAt = job.completedAt ? Date.parse(job.completedAt) : 0;
    if (completedAt && completedAt < cutoff) {
      jobs.delete(jobId);
    }
  }
}

const cleanupTimer = setInterval(cleanupFinishedJobs, Math.min(SERVER_CONFIG.jobRetentionMs, 5 * 60 * 1000));
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

async function processFireflyVideoJob(job) {
  const params = job.params;
  const hasAudio = params.audioUrls.length > 0;
  let webmPath = null;
  let outputPath = null;

  job.status = JOB_STATUS.RUNNING;
  job.startedAt = nowIso();
  setJobProgress(job, 'runtime-config', 'Loading R2 runtime config', 5);

  const startTime = Date.now();

  try {
    if (hasAudio && params.format === 'gif') {
      throw new Error('Khong the ghep audio voi GIF. Vui long chon format "mp4" hoac "webm".');
    }

    console.log(`\n[Job ${job.id}] Starting firefly video record`);
    console.log(`[Job ${job.id}] Video output: ${params.duration}s, ${params.width}x${params.height}, ${params.fps}fps, ${params.format}`);
    if (hasAudio) {
      console.log(`[Job ${job.id}] Audio URLs: ${params.audioUrls.length}`);
    }

    const r2Config = await getRuntimeR2Config();

    setJobProgress(job, 'rendering', 'Rendering firefly video', 20);
    webmPath = await renderFireflyVideo(params);

    setJobProgress(job, 'converting', hasAudio ? 'Converting and merging audio' : `Converting to ${params.format}`, 55);
    outputPath = await convertWithOptionalAudio(webmPath, params.format, {
      bitrate: params.bitrate,
      fps: params.fps,
      width: params.width,
      audioUrls: params.audioUrls,
    });
    webmPath = null;

    const fileSize = fs.statSync(outputPath).size;
    const filename = `${params.filename}.${params.format}`;
    const mimeType = getMimeType(params.format);

    setJobProgress(job, 'uploading', 'Uploading video to R2', 85);
    const uploadResult = await uploadFileToR2(outputPath, r2Config, {
      filename,
      contentType: mimeType,
    });

    cleanupFiles([outputPath]);
    outputPath = null;

    const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
    job.status = JOB_STATUS.DONE;
    job.result = {
      url: uploadResult.url,
      filename,
      format: params.format,
      mimeType,
      size: fileSize,
      duration: params.duration,
      hasAudio,
      elapsedSeconds,
      r2: uploadResult,
    };
    job.completedAt = nowIso();
    setJobProgress(job, 'done', 'Video is ready', 100);

    console.log(`[Job ${job.id}] Done in ${elapsedSeconds}s: ${uploadResult.url}`);
  } catch (err) {
    cleanupFiles([outputPath, webmPath && webmPath !== outputPath ? webmPath : null]);

    const message = err?.message || String(err) || 'Unknown error while creating video';
    job.status = JOB_STATUS.FAILED;
    job.error = { message };
    job.completedAt = nowIso();
    setJobProgress(job, 'failed', message, 100);

    console.error(`[Job ${job.id}] Failed: ${message}`);
  }
}

function pumpQueue() {
  while (runningCount < getQueueConcurrency() && pendingQueue.length > 0) {
    const jobId = pendingQueue.shift();
    const job = jobs.get(jobId);

    if (!job || job.status !== JOB_STATUS.QUEUED) {
      continue;
    }

    runningCount++;
    setImmediate(async () => {
      try {
        await processFireflyVideoJob(job);
      } finally {
        runningCount--;
        pumpQueue();
      }
    });
  }
}

function createFireflyVideoJob(params) {
  cleanupFinishedJobs();

  const now = nowIso();
  const job = {
    id: uuidv4(),
    status: JOB_STATUS.QUEUED,
    params,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    progress: {
      step: 'queued',
      message: 'Waiting in queue',
      percent: 0,
    },
  };

  jobs.set(job.id, job);
  pendingQueue.push(job.id);
  pumpQueue();

  return serializeJob(job);
}

module.exports = {
  JOB_STATUS,
  createFireflyVideoJob,
  getFireflyVideoJob,
  getFireflyVideoJobStats,
};
