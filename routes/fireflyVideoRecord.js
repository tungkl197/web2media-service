/**
 * Web2Media Service — Firefly Video Record Route Handlers
 */

const express = require('express');
const fs = require('fs');
const router = express.Router();

const { validateFireflyVideoRecordRequest } = require('../middleware/validator');
const { renderFireflyVideo, getActiveFireflyVideoRecordCount } = require('../services/renderer');
const { convertWithOptionalAudio, getMimeType } = require('../services/converter');
const { uploadFileToR2 } = require('../services/r2Uploader');
const { getRuntimeR2Config } = require('../services/runtimeConfig');
const { BG_PRESETS, COLOR_PRESETS, DIRECTIONS, GLOW_LEVELS } = require('../config');

/**
 * POST /api/firefly-video-record
 * Create a firefly animation video with given configuration.
 * 
 * Returns the video file as a download.
 */
router.post('/firefly-video-record', validateFireflyVideoRecordRequest, async (req, res) => {
  const params = req.body;
  const hasAudio = params.audioUrls.length > 0;
  let r2Config = null;
  let webmPath = null;
  let outputPath = null;

  try {
    if (hasAudio && params.format === 'gif') {
      return res.status(400).json({
        success: false,
        error: 'Không thể ghép audio với GIF. Vui lòng chọn format "mp4" hoặc "webm".',
      });
    }

    const startTime = Date.now();

    console.log(`\n[API] ═══ New firefly video record request ═══`);
    console.log(`[API] Config: ${params.count} fireflies, ${params.size} size, ${params.speed}x speed`);
    console.log(`[API] Color: ${params.colorMode === 'preset' ? COLOR_PRESETS[params.colorIndex]?.name : params.customColor}`);
    console.log(`[API] Background: ${params.bgUrl ? 'URL → ' + params.bgUrl : 'Preset #' + params.bgIndex}`);
    console.log(`[API] Video output: ${params.duration}s, ${params.width}x${params.height}, ${params.fps}fps, ${params.format}`);
    if (hasAudio) {
      console.log(`[API] Audio URLs: ${params.audioUrls.length}`);
    }
    console.log(`[API] Active firefly video records: ${getActiveFireflyVideoRecordCount()}`);

    console.log(`[API] Loading R2 runtime config...`);
    try {
      r2Config = await getRuntimeR2Config();
      console.log(`[API] R2 upload: ${r2Config.bucket}`);
    } catch (runtimeConfigErr) {
      runtimeConfigErr.statusCode = 502;
      throw runtimeConfigErr;
    }

    // Step 1: Render video with Puppeteer
    console.log(`[API] Step 1/2: Rendering video...`);
    webmPath = await renderFireflyVideo(params);

    // Step 2: Convert to requested format, optionally with audio
    console.log(`[API] Step 2/2: ${hasAudio ? 'Converting and merging audio' : `Converting to ${params.format}`}...`);
    outputPath = await convertWithOptionalAudio(webmPath, params.format, {
      bitrate: params.bitrate,
      fps: params.fps,
      width: params.width,
      audioUrls: params.audioUrls,
    });
    webmPath = null;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const fileSize = fs.statSync(outputPath).size;
    console.log(`[API] ✓ Done in ${elapsed}s — ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    const filename = `${params.filename}.${params.format}`;
    const mimeType = getMimeType(params.format);

    console.log(`[API] Step 3/3: Loading R2 runtime config and uploading...`);
    let uploadResult;
    try {
      uploadResult = await uploadFileToR2(outputPath, r2Config, {
        filename,
        contentType: mimeType,
      });
    } catch (uploadErr) {
      uploadErr.statusCode = 502;
      throw uploadErr;
    }

    try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
    outputPath = null;

    return res.json({
      success: true,
      url: uploadResult.url,
      data: {
        url: uploadResult.url,
        filename,
        format: params.format,
        mimeType,
        size: fileSize,
        duration: params.duration,
        hasAudio,
        r2: uploadResult,
      },
    });

  } catch (err) {
    const errMsg = err?.message || String(err) || 'Lỗi không xác định khi tạo video';
    console.error(`[API] ✗ Error:`, errMsg);

    // Cleanup on error
    if (outputPath) {
      try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
    }
    if (webmPath && webmPath !== outputPath) {
      try { fs.unlinkSync(webmPath); } catch (e) { /* ignore */ }
    }

    const statusCode = err.statusCode || (errMsg.includes('giới hạn') ? 429 : 500);
    res.status(statusCode).json({
      success: false,
      error: errMsg,
    });
  }
});

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
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
