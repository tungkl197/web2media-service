/**
 * Web2Media Service — FFmpeg Format Conversion Service
 * 
 * Handles conversion from .webm to .mp4 and .gif formats.
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { SERVER_CONFIG } = require('../config');

// Set ffmpeg path from installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const AUDIO_EXTENSIONS_BY_MIME = {
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/m4a': '.m4a',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-m4a': '.m4a',
  'audio/x-wav': '.wav',
};

function cleanupFiles(paths) {
  for (const filePath of paths.filter(Boolean)) {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  }
}

function getAudioExtension(url, contentType = '') {
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  if (AUDIO_EXTENSIONS_BY_MIME[mimeType]) {
    return AUDIO_EXTENSIONS_BY_MIME[mimeType];
  }

  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return /^[a-z0-9.]{2,8}$/.test(ext) ? ext : '.audio';
}

function downloadAudioFile(url, index, options = {}, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsRemaining < 0) {
      return reject(new Error(`Audio URL redirect quá nhiều: ${url}`));
    }

    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const timeout = options.audioDownloadTimeout || SERVER_CONFIG.audioDownloadTimeout;
    const maxBytes = options.maxAudioBytes || SERVER_CONFIG.maxAudioBytes;

    const req = protocol.get(parsedUrl, {
      headers: {
        'User-Agent': 'Web2Media-Service/1.0',
        'Accept': 'audio/*,*/*',
      },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const redirectUrl = new URL(res.headers.location, parsedUrl).href;
        return downloadAudioFile(redirectUrl, index, options, redirectsRemaining - 1).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Không tải được audio #${index + 1}: HTTP ${res.statusCode}`));
      }

      const contentLength = Number(res.headers['content-length'] || 0);
      if (contentLength > maxBytes) {
        res.resume();
        return reject(new Error(`Audio #${index + 1} vượt quá giới hạn ${(maxBytes / 1024 / 1024).toFixed(0)}MB`));
      }

      if (!fs.existsSync(SERVER_CONFIG.tempDir)) {
        fs.mkdirSync(SERVER_CONFIG.tempDir, { recursive: true });
      }

      const ext = getAudioExtension(parsedUrl.href, res.headers['content-type']);
      const outputPath = path.join(SERVER_CONFIG.tempDir, `${uuidv4()}_audio_${index}${ext}`);
      const output = fs.createWriteStream(outputPath);
      let downloadedBytes = 0;
      let settled = false;

      function fail(err) {
        if (settled) return;
        settled = true;
        try { output.destroy(); } catch (e) { /* ignore */ }
        cleanupFiles([outputPath]);
        reject(err);
      }

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maxBytes) {
          res.destroy();
          fail(new Error(`Audio #${index + 1} vượt quá giới hạn ${(maxBytes / 1024 / 1024).toFixed(0)}MB`));
        }
      });

      res.on('error', fail);
      output.on('error', fail);
      output.on('finish', () => {
        if (settled) return;
        settled = true;
        output.close(() => resolve(outputPath));
      });

      res.pipe(output);
    });

    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Tải audio #${index + 1} quá thời gian ${Math.round(timeout / 1000)}s`));
    });
    req.on('error', reject);
  });
}

async function downloadAudioFiles(audioUrls, options = {}) {
  const audioPaths = [];

  try {
    for (let i = 0; i < audioUrls.length; i++) {
      console.log(`[Converter] Downloading audio ${i + 1}/${audioUrls.length}: ${audioUrls[i]}`);
      audioPaths.push(await downloadAudioFile(audioUrls[i], i, options));
    }
  } catch (err) {
    cleanupFiles(audioPaths);
    throw err;
  }

  return audioPaths;
}

function getMediaDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegInstaller.path, ['-hide_banner', '-i', filePath], { timeout: 30000 }, (error, stdout, stderr) => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        return reject(new Error(`Không đọc được thời lượng audio: ${path.basename(filePath)}`));
      }

      const durationSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      resolve(durationSeconds);
    });
  });
}

async function getTotalAudioDurationSeconds(audioPaths) {
  let totalDuration = 0;

  for (const audioPath of audioPaths) {
    totalDuration += await getMediaDurationSeconds(audioPath);
  }

  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error('Tổng thời lượng audio không hợp lệ');
  }

  return totalDuration;
}

/**
 * Convert webm to mp4 (H.264 + AAC)
 * 
 * @param {string} inputPath - Path to input .webm file
 * @param {string} outputPath - Path to output .mp4 file
 * @param {Object} options
 * @param {number} options.bitrate - Video bitrate in bps
 * @param {number} options.fps - Frames per second
 * @returns {Promise<string>} Path to output file
 */
function convertToMp4(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const bitrate = Math.round((options.bitrate || 5000000) / 1000); // Convert to kbps

    console.log(`[Converter] Converting to MP4: ${inputPath} -> ${outputPath}`);

    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libx264')
      .videoBitrate(`${bitrate}k`)
      .outputOptions([
        '-pix_fmt yuv420p',    // Compatibility with most players
        '-movflags +faststart', // Enable streaming
        '-preset fast',         // Encoding speed
      ])
      .fps(options.fps || 60)
      .on('start', (cmd) => {
        console.log(`[Converter] FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[Converter] Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log(`[Converter] MP4 conversion complete: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Converter] MP4 conversion error:`, err.message);
        reject(new Error(`Lỗi chuyển đổi MP4: ${err.message}`));
      })
      .run();
  });
}

/**
 * Convert webm to GIF with palette optimization
 * 
 * @param {string} inputPath - Path to input .webm file
 * @param {string} outputPath - Path to output .gif file
 * @param {Object} options
 * @param {number} options.fps - Frames per second (capped at 15 for GIF)
 * @param {number} options.width - Width to scale to (height auto)
 * @returns {Promise<string>} Path to output file
 */
function convertToGif(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const fps = Math.min(options.fps || 15, 15); // Cap GIF fps at 15
    const width = Math.min(options.width || 640, 800); // Cap GIF width

    console.log(`[Converter] Converting to GIF: ${inputPath} -> ${outputPath} (${fps}fps, ${width}px wide)`);

    // Two-pass GIF encoding with palette generation for better quality
    const palettePath = inputPath.replace('.webm', '_palette.png');

    // Pass 1: Generate palette
    ffmpeg(inputPath)
      .outputOptions([
        `-vf fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      ])
      .output(palettePath)
      .on('end', () => {
        // Pass 2: Use palette to create GIF
        ffmpeg(inputPath)
          .input(palettePath)
          .complexFilter([
            `fps=${fps},scale=${width}:-1:flags=lanczos[x]`,
            `[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
          ])
          .output(outputPath)
          .on('end', () => {
            // Cleanup palette file
            try { fs.unlinkSync(palettePath); } catch (e) { /* ignore */ }
            console.log(`[Converter] GIF conversion complete: ${outputPath}`);
            resolve(outputPath);
          })
          .on('error', (err) => {
            try { fs.unlinkSync(palettePath); } catch (e) { /* ignore */ }
            console.error(`[Converter] GIF conversion (pass 2) error:`, err.message);
            reject(new Error(`Lỗi chuyển đổi GIF: ${err.message}`));
          })
          .run();
      })
      .on('error', (err) => {
        console.error(`[Converter] GIF palette generation error:`, err.message);
        reject(new Error(`Lỗi tạo palette GIF: ${err.message}`));
      })
      .run();
  });
}

/**
 * Merge one or more audio files into a looped firefly video.
 *
 * Audio files are concatenated in request order. The video stream is looped
 * until the concatenated audio ends.
 */
function mergeLoopedVideoWithAudio(videoPath, audioPaths, outputPath, format, options = {}) {
  return new Promise((resolve, reject) => {
    if (!audioPaths.length) {
      return reject(new Error('audioUrls không được rỗng khi ghép audio'));
    }

    const bitrate = Math.round((options.bitrate || 5000000) / 1000);
    const command = ffmpeg()
      .input(videoPath)
      .inputOptions(['-stream_loop -1']);

    for (const audioPath of audioPaths) {
      command.input(audioPath);
    }

    const durationOption = options.audioDurationSeconds
      ? [`-t ${options.audioDurationSeconds.toFixed(3)}`]
      : [];

    if (audioPaths.length === 1) {
      command.outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-shortest',
        ...durationOption,
      ]);
    } else {
      const normalizedAudioFilters = audioPaths.map((_, index) =>
        `[${index + 1}:a:0]aformat=sample_rates=48000:channel_layouts=stereo[a${index}]`
      );
      const audioInputs = audioPaths.map((_, index) => `[a${index}]`).join('');
      command
        .complexFilter([
          ...normalizedAudioFilters,
          `${audioInputs}concat=n=${audioPaths.length}:v=0:a=1[aout]`,
        ])
        .outputOptions([
          '-map 0:v:0',
          '-map [aout]',
          '-shortest',
          ...durationOption,
        ]);
    }

    if (format === 'mp4') {
      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(`${bitrate}k`)
        .audioBitrate('192k')
        .fps(options.fps || 60)
        .outputOptions([
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-preset fast',
        ]);
    } else if (format === 'webm') {
      command
        .videoCodec('copy')
        .audioCodec('libopus')
        .audioBitrate('192k');
    } else {
      return reject(new Error(`Không thể ghép audio với format ${format}`));
    }

    console.log(`[Converter] Merging audio into looped ${format.toUpperCase()}: ${videoPath} -> ${outputPath}`);

    command
      .output(outputPath)
      .on('start', (cmd) => {
        console.log(`[Converter] FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.timemark) {
          console.log(`[Converter] Merge progress: ${progress.timemark}`);
        }
      })
      .on('end', () => {
        console.log(`[Converter] Audio merge complete: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`[Converter] Audio merge error:`, err.message);
        cleanupFiles([outputPath]);
        reject(new Error(`Lỗi ghép audio: ${err.message}`));
      })
      .run();
  });
}

/**
 * Convert video to the requested format
 * 
 * @param {string} webmPath - Path to source .webm file
 * @param {string} format - Target format ('webm', 'mp4', 'gif')
 * @param {Object} options - Conversion options
 * @returns {Promise<string>} Path to the output file
 */
async function convert(webmPath, format, options = {}) {
  if (format === 'webm') {
    // No conversion needed
    return webmPath;
  }

  const outputPath = webmPath.replace('.webm', `.${format}`);

  if (format === 'mp4') {
    await convertToMp4(webmPath, outputPath, options);
  } else if (format === 'gif') {
    await convertToGif(webmPath, outputPath, options);
  } else {
    throw new Error(`Format không được hỗ trợ: ${format}`);
  }

  // Cleanup source webm after conversion
  try { fs.unlinkSync(webmPath); } catch (e) { /* ignore */ }

  return outputPath;
}

/**
 * Convert a rendered firefly video and optionally merge audio URLs.
 *
 * @param {string} webmPath - Path to source .webm file
 * @param {string} format - Target format ('webm', 'mp4', 'gif')
 * @param {Object} options - Conversion and audio options
 * @param {string[]} [options.audioUrls] - Audio URLs to concatenate and merge
 * @returns {Promise<string>} Path to the output file
 */
async function convertWithOptionalAudio(webmPath, format, options = {}) {
  const audioUrls = options.audioUrls || [];

  if (!audioUrls.length) {
    return convert(webmPath, format, options);
  }

  if (format === 'gif') {
    throw new Error('Không thể ghép audio với GIF. Vui lòng chọn format "mp4" hoặc "webm".');
  }

  const audioPaths = await downloadAudioFiles(audioUrls, options);
  const audioDurationSeconds = await getTotalAudioDurationSeconds(audioPaths);
  const outputPath = webmPath.replace(/\.webm$/i, `_audio.${format}`);

  try {
    console.log(`[Converter] Total audio duration: ${audioDurationSeconds.toFixed(2)}s`);
    await mergeLoopedVideoWithAudio(webmPath, audioPaths, outputPath, format, {
      ...options,
      audioDurationSeconds,
    });
    cleanupFiles([webmPath]);
    return outputPath;
  } finally {
    cleanupFiles(audioPaths);
  }
}

/**
 * Get MIME type for format
 */
function getMimeType(format) {
  const mimeTypes = {
    'webm': 'video/webm',
    'mp4': 'video/mp4',
    'gif': 'image/gif',
  };
  return mimeTypes[format] || 'application/octet-stream';
}

module.exports = {
  convert,
  convertWithOptionalAudio,
  convertToMp4,
  convertToGif,
  mergeLoopedVideoWithAudio,
  getMimeType,
};
