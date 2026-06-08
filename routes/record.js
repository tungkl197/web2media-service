/**
 * Web2Media Service — Route Handlers
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { validateRecordRequest } = require('../middleware/validator');
const { renderVideo, getActiveCount } = require('../services/renderer');
const { convert, getMimeType } = require('../services/converter');
const { BG_PRESETS, COLOR_PRESETS, DIRECTIONS, GLOW_LEVELS } = require('../config');

/**
 * POST /api/record
 * Record a firefly animation video with given configuration.
 * 
 * Returns the video file as a download.
 */
router.post('/record', validateRecordRequest, async (req, res) => {
  const params = req.body;
  let outputPath = null;

  try {
    console.log(`\n[API] ═══ New recording request ═══`);
    console.log(`[API] Config: ${params.count} fireflies, ${params.size} size, ${params.speed}x speed`);
    console.log(`[API] Color: ${params.colorMode === 'preset' ? COLOR_PRESETS[params.colorIndex]?.name : params.customColor}`);
    console.log(`[API] Background: ${params.bgUrl ? 'URL → ' + params.bgUrl : 'Preset #' + params.bgIndex}`);
    console.log(`[API] Recording: ${params.duration}s, ${params.width}x${params.height}, ${params.fps}fps, ${params.format}`);
    console.log(`[API] Active recordings: ${getActiveCount()}`);

    const startTime = Date.now();

    // Step 1: Render video with Puppeteer
    console.log(`[API] Step 1/2: Rendering video...`);
    const webmPath = await renderVideo(params);

    // Step 2: Convert to requested format
    console.log(`[API] Step 2/2: Converting to ${params.format}...`);
    outputPath = await convert(webmPath, params.format, {
      bitrate: params.bitrate,
      fps: params.fps,
      width: params.width,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const fileSize = fs.statSync(outputPath).size;
    console.log(`[API] ✓ Done in ${elapsed}s — ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Stream the file as download
    const filename = `${params.filename}.${params.format}`;
    const mimeType = getMimeType(params.format);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileSize);

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);

    // Cleanup temp file after streaming
    readStream.on('end', () => {
      setTimeout(() => {
        try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
      }, 1000);
    });

    readStream.on('error', (err) => {
      console.error(`[API] Stream error:`, err.message);
      // Cleanup
      try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Lỗi đọc file video',
        });
      }
    });

  } catch (err) {
    const errMsg = err?.message || String(err) || 'Lỗi không xác định khi tạo video';
    console.error(`[API] ✗ Error:`, errMsg);

    // Cleanup on error
    if (outputPath) {
      try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
    }

    const statusCode = errMsg.includes('giới hạn') ? 429 : 500;
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
    activeRecordings: getActiveCount(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
