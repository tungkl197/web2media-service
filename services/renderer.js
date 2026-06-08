/**
 * Web2Media Service — Puppeteer Rendering Service
 * 
 * Uses a singleton browser instance for performance.
 * Each recording request gets a new page (tab).
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { SERVER_CONFIG } = require('../config');

let browserInstance = null;
let activeRecordings = 0;

/**
 * Download an image from URL and convert to base64 data URL (server-side).
 * Handles redirects, timeouts, and sends a browser-like User-Agent.
 * 
 * @param {string} url - Image URL to download
 * @param {number} maxRedirects - Max redirect hops
 * @returns {Promise<string>} Base64 data URL
 */
function downloadImageAsDataUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

    const protocol = url.startsWith('https') ? require('https') : require('http');
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*',
        'Referer': new URL(url).origin,
      },
      timeout: 15000,
    };

    const req = protocol.get(url, options, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        return downloadImageAsDataUrl(redirectUrl, maxRedirects - 1).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      const contentType = res.headers['content-type'] || 'image/jpeg';
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 100) {
          return reject(new Error('Downloaded file too small — likely not an image'));
        }
        const base64 = buffer.toString('base64');
        const mimeType = contentType.split(';')[0].trim();
        resolve(`data:${mimeType};base64,${base64}`);
      });
      res.on('error', reject);
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout (15s)')); });
    req.on('error', reject);
  });
}

/**
 * Get or launch the singleton browser instance
 */
async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    // Handle unexpected browser close
    browserInstance.on('disconnected', () => {
      browserInstance = null;
    });
  }
  return browserInstance;
}

/**
 * Render a firefly animation video
 * 
 * @param {Object} params - Recording parameters
 * @param {number} params.count - Number of fireflies
 * @param {number} params.size - Firefly size
 * @param {number} params.speed - Firefly speed
 * @param {string} params.colorMode - 'preset' or 'custom'
 * @param {number} params.colorIndex - Color preset index
 * @param {string} params.customColor - Custom hex color
 * @param {string} params.glowLevel - Glow intensity
 * @param {string} params.direction - Movement direction
 * @param {number} params.spread - Spread factor
 * @param {number} params.bgIndex - Background preset index
 * @param {string|null} params.bgUrl - Custom background URL
 * @param {number} params.duration - Recording duration in seconds
 * @param {number} params.fps - Frames per second
 * @param {number} params.width - Video width
 * @param {number} params.height - Video height
 * @param {number} params.bitrate - Video bitrate in bps
 * @returns {Promise<string>} Path to the recorded .webm file
 */
async function renderVideo(params) {
  // Check concurrent limit
  if (activeRecordings >= SERVER_CONFIG.maxConcurrent) {
    throw new Error(`Đã đạt giới hạn ${SERVER_CONFIG.maxConcurrent} video đồng thời. Vui lòng thử lại sau.`);
  }

  activeRecordings++;
  let page = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set viewport to requested resolution
    await page.setViewport({
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1,
    });

    // Navigate to the render page
    const renderPagePath = path.join(SERVER_CONFIG.publicDir, 'firefly-render.html');
    await page.goto(`file://${renderPagePath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for page to be ready
    await page.waitForFunction('window.__PAGE_READY === true', { timeout: 10000 });

    // Build config for the firefly engine
    const fireflyConfig = {
      bgIndex: params.bgIndex,
      bgCustom: params.bgUrl || null,
      count: params.count,
      size: params.size,
      speed: params.speed,
      colorMode: params.colorMode,
      colorIndex: params.colorIndex,
      customColor: params.customColor,
      glowLevel: params.glowLevel,
      direction: params.direction,
      spread: params.spread,
    };

    // If bgUrl is provided, download image server-side (bypasses CORS/bot detection)
    if (params.bgUrl) {
      console.log(`[Renderer] Downloading background: ${params.bgUrl}`);
      try {
        const dataUrl = await downloadImageAsDataUrl(params.bgUrl);
        fireflyConfig.bgCustom = dataUrl;
        console.log(`[Renderer] Background loaded (${(dataUrl.length / 1024).toFixed(0)} KB data URL)`);
      } catch (dlErr) {
        console.warn(`[Renderer] Background download failed: ${dlErr.message}. Using preset instead.`);
        // Fallback to preset background — don't fail the whole recording
        fireflyConfig.bgCustom = null;
      }
    }

    // Apply config
    await page.evaluate((cfg) => {
      window.__applyConfig(cfg);
    }, fireflyConfig);

    // Wait a bit for fireflies to initialize and spread
    await new Promise(r => setTimeout(r, 1500));

    // Start recording
    console.log(`[Renderer] Starting recording: ${params.width}x${params.height}, ${params.duration}s, ${params.fps}fps, ${params.bitrate}bps`);

    const base64Data = await page.evaluate(
      (duration, fps, bitrate) => window.__startRecording(duration, fps, bitrate),
      params.duration,
      params.fps,
      params.bitrate
    );

    // Save to temp file
    const tempId = uuidv4();
    const tempPath = path.join(SERVER_CONFIG.tempDir, `${tempId}.webm`);

    // Ensure temp dir exists
    if (!fs.existsSync(SERVER_CONFIG.tempDir)) {
      fs.mkdirSync(SERVER_CONFIG.tempDir, { recursive: true });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tempPath, buffer);

    console.log(`[Renderer] Recording saved: ${tempPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    return tempPath;

  } finally {
    // Close the page
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
    activeRecordings--;
  }
}

/**
 * Render HTML content to a PNG buffer using Puppeteer.
 *
 * @param {string} htmlContent - Full HTML string to render
 * @returns {Promise<Buffer>} PNG image as a Buffer
 */
async function renderThumbnail(htmlContent) {
  let page = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setViewport({
      width: SERVER_CONFIG.thumbnailViewport.width,
      height: SERVER_CONFIG.thumbnailViewport.height,
      deviceScaleFactor: 1,
    });

    // Load HTML content directly
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Extra wait to ensure font rendering is complete
    await new Promise(r => setTimeout(r, SERVER_CONFIG.fontLoadWait));

    // Screenshot only the #thumbnail element
    const thumbnailElement = await page.$('#thumbnail');

    let buffer;
    if (thumbnailElement) {
      buffer = await thumbnailElement.screenshot({ type: 'png' });
    } else {
      // Fallback: screenshot with clip
      buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, ...SERVER_CONFIG.thumbnailViewport },
      });
    }

    // Puppeteer returns a Uint8Array (Buffer in Node.js)
    return buffer;
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Get current active recording count
 */
function getActiveCount() {
  return activeRecordings;
}

/**
 * Cleanup: close browser instance
 */
async function closeBrowser() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch (e) { /* ignore */ }
    browserInstance = null;
  }
}

module.exports = {
  renderVideo,
  renderThumbnail,
  getActiveCount,
  closeBrowser,
};
