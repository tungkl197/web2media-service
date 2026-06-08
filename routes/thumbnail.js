const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const nunjucks = require('nunjucks');
const fs = require('fs');

const { SERVER_CONFIG } = require('../config');
const { parseColoredText } = require('../utils/textParser');
const { fileToBase64Uri, bufferToBase64Uri } = require('../utils/fileHelper');
const { renderThumbnail, getActiveCount } = require('../services/renderer');
const { validateThumbnailRequest } = require('../middleware/validator');

const router = express.Router();

// ===== Nunjucks template setup =====
const nunjucksEnv = nunjucks.configure(SERVER_CONFIG.thumbnailTemplateDir, {
  autoescape: false, // We handle escaping in textParser
});

// Cache for background image to avoid reading from disk on every request
let cachedBackgroundBase64 = null;

function getBackgroundBase64() {
  if (!cachedBackgroundBase64) {
    if (fs.existsSync(SERVER_CONFIG.backgroundPath)) {
      cachedBackgroundBase64 = fileToBase64Uri(SERVER_CONFIG.backgroundPath);
    } else {
      console.warn(`[Thumbnail] Background image not found at ${SERVER_CONFIG.backgroundPath}`);
      return '';
    }
  }
  return cachedBackgroundBase64;
}

/**
 * Download an image from a URL and convert it to a base64 data URI.
 */
async function downloadImageAsBase64(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: SERVER_CONFIG.downloadTimeout,
  });

  const buffer = Buffer.from(response.data);
  const mimeType = response.headers['content-type'] || 'image/jpeg';
  return bufferToBase64Uri(buffer, mimeType);
}

/**
 * POST /api/generate-thumbnail
 * Generate a thumbnail PNG image and upload it
 */
router.post('/generate-thumbnail', validateThumbnailRequest, async (req, res) => {
  try {
    const { r2_url, text, upload_url, api_key } = req.body;

    // Check concurrent limit for puppeteer
    if (getActiveCount() >= SERVER_CONFIG.maxConcurrent) {
      return res.status(429).json({
        success: false,
        error: `Đã đạt giới hạn ${SERVER_CONFIG.maxConcurrent} tiến trình đồng thời. Vui lòng thử lại sau.`,
      });
    }

    console.log(`\n[Thumbnail] ═══ New generation request ═══`);
    const startTime = Date.now();

    // 1. Download girl image from URL → base64 data URI
    console.log(`[Thumbnail] Step 1/4: Downloading image from ${r2_url}...`);
    const girlBase64 = await downloadImageAsBase64(r2_url);

    // 2. Parse colored text
    console.log(`[Thumbnail] Step 2/4: Parsing text...`);
    const textHtml = parseColoredText(text);

    // 3. Render HTML template with Nunjucks
    console.log(`[Thumbnail] Step 3/4: Rendering thumbnail...`);
    const htmlContent = nunjucksEnv.render('thumbnail.html', {
      girl_image: girlBase64,
      background_image: getBackgroundBase64(),
      text_html: textHtml,
    });

    // 4. Screenshot with Puppeteer → PNG Buffer
    const pngBuffer = await renderThumbnail(htmlContent);

    // 5. Upload thumbnail to external API
    console.log(`[Thumbnail] Step 4/4: Uploading to ${upload_url}...`);
    const uploadEndpoint = `${upload_url.replace(/\/+$/, '')}/api/public/v1/upload`;
    const form = new FormData();
    const { v4: uuidv4 } = require('uuid');
    
    // Puppeteer v23+ returns Uint8Array, we must convert it to Buffer for form-data
    const fileBuffer = Buffer.from(pngBuffer);

    form.append('file', fileBuffer, {
      filename: `${uuidv4()}.png`,
      contentType: 'image/png',
    });

    const uploadResponse = await axios.post(uploadEndpoint, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: api_key,
      },
      timeout: SERVER_CONFIG.uploadTimeout,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Thumbnail] ✓ Done in ${elapsed}s`);

    // 6. Return upload API response
    return res.status(uploadResponse.status).json(uploadResponse.data);

  } catch (err) {
    // Distinguish between download errors, upload errors, and others
    if (axios.isAxiosError(err) && err.response) {
      const requestUrl = err.config?.url || '';

      if (requestUrl.includes('/api/public/v1/upload')) {
        console.error(`[Thumbnail] Upload API error:`, err.response.data);
        return res.status(502).json({
          error: `Upload API returned error: ${err.response.status}`,
          detail: err.response.data,
        });
      }

      console.error(`[Thumbnail] Download error:`, err.message);
      return res.status(400).json({
        error: `Failed to download image from R2: ${err.response.status}`,
      });
    }

    if (axios.isAxiosError(err)) {
      console.error(`[Thumbnail] Network request failed:`, err.message);
      return res.status(400).json({
        error: `Request failed: ${err.message}`,
      });
    }

    console.error('[Thumbnail] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
