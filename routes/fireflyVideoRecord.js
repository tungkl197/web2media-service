/**
 * Web2Media Service - Firefly Video Record Route Handlers
 */

const express = require('express');
const router = express.Router();

const { validateFireflyVideoRecordRequest } = require('../middleware/validator');
const { getActiveFireflyVideoRecordCount } = require('../services/renderer');
const {
  createFireflyVideoJob,
  getFireflyVideoJob,
  getFireflyVideoJobStats,
} = require('../services/fireflyVideoJobs');
const { BG_PRESETS, COLOR_PRESETS, DIRECTIONS, GLOW_LEVELS } = require('../config');

/**
 * POST /api/firefly-video-record
 * Create an async firefly video job.
 */
router.post('/firefly-video-record', validateFireflyVideoRecordRequest, (req, res) => {
  const params = req.body;
  const hasAudio = params.audioUrls.length > 0;

  if (hasAudio && params.format === 'gif') {
    return res.status(400).json({
      success: false,
      error: 'Khong the ghep audio voi GIF. Vui long chon format "mp4" hoac "webm".',
    });
  }

  const job = createFireflyVideoJob(params);
  const statusUrl = `/api/firefly-video-record/status/${job.jobId}`;

  console.log(`[API] Firefly video job queued: ${job.jobId}`);

  return res.status(202).json({
    success: true,
    jobId: job.jobId,
    status: job.status,
    statusUrl,
    data: {
      ...job,
      statusUrl,
    },
  });
});

function sendFireflyVideoJobStatus(req, res) {
  const job = getFireflyVideoJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Khong tim thay job',
      jobId: req.params.jobId,
    });
  }

  return res.json({
    success: job.status !== 'failed',
    ...job,
  });
}

/**
 * GET /api/firefly-video-record/status/:jobId
 * Return async firefly video job status. When status is done, `url` is the R2 URL.
 */
router.get('/firefly-video-record/status/:jobId', sendFireflyVideoJobStatus);
router.get('/firefly-video-record/:jobId/status', sendFireflyVideoJobStatus);
router.get('/firefly-video-record/:jobId', sendFireflyVideoJobStatus);

/**
 * GET /api/presets
 * Return available presets for backgrounds, colors, directions, and glow levels.
 */
router.get('/presets', (req, res) => {
  res.json({
    success: true,
    data: {
      backgrounds: BG_PRESETS.map(({ index, label }) => ({ index, label })),
      colors: COLOR_PRESETS.map(({ index, name, hex }) => ({ index, name, hex })),
      directions: DIRECTIONS,
      glowLevels: GLOW_LEVELS,
      fpsOptions: [24, 30, 60],
      formatOptions: ['webm', 'mp4', 'gif'],
    },
  });
});

/**
 * GET /api/health
 * Health check endpoint.
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    version: '1.0.0',
    activeFireflyVideoRecords: getActiveFireflyVideoRecordCount(),
    fireflyVideoJobs: getFireflyVideoJobStats(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
