/**
 * Web2Media Service — FFmpeg Format Conversion Service
 * 
 * Handles conversion from .webm to .mp4 and .gif formats.
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

// Set ffmpeg path from installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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
  convertToMp4,
  convertToGif,
  getMimeType,
};
