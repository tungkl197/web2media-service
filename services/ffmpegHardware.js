/**
 * Web2Media Service - FFmpeg hardware acceleration helpers.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { SERVER_CONFIG } = require('../config');

function findSystemFfmpegPath() {
  if (SERVER_CONFIG.ffmpegPath) {
    return SERVER_CONFIG.ffmpegPath;
  }

  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const output = execFileSync(command, ['ffmpeg'], { encoding: 'utf8', timeout: 5000 });
    const candidate = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean);

    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  } catch (e) {
    // Fall back to the bundled ffmpeg binary.
  }

  return ffmpegInstaller.path;
}

const FFMPEG_PATH = findSystemFfmpegPath();

const CPU_MP4_ENCODER = {
  name: 'libx264',
  label: 'CPU libx264',
  hardware: false,
};

const HARDWARE_MP4_ENCODERS = [
  {
    name: 'h264_nvenc',
    label: 'NVIDIA NVENC',
    hardware: true,
    aliases: ['nvidia', 'nvenc', 'cuda'],
  },
  {
    name: 'h264_qsv',
    label: 'Intel Quick Sync',
    hardware: true,
    aliases: ['intel', 'qsv', 'quick-sync', 'quicksync'],
  },
  {
    name: 'h264_amf',
    label: 'AMD AMF',
    hardware: true,
    aliases: ['amd', 'amf'],
  },
];

let availableEncodersPromise = null;
let selectedMp4EncoderPromise = null;
let ffmpegPathLogged = false;
const encoderUsabilityCache = new Map();

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function isDisabled(value) {
  return ['0', 'false', 'off', 'no', 'none', 'disabled', 'cpu'].includes(normalizeName(value));
}

function getAvailableFfmpegEncoders() {
  if (!availableEncodersPromise) {
    availableEncodersPromise = new Promise((resolve, reject) => {
      execFile(FFMPEG_PATH, ['-hide_banner', '-encoders'], { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        const encoders = new Set();
        const output = `${stdout}\n${stderr}`;
        for (const line of output.split(/\r?\n/)) {
          const match = line.match(/^\s*[A-Z.]{6}\s+(\S+)/);
          if (match) {
            encoders.add(match[1]);
          }
        }

        resolve(encoders);
      });
    });
  }

  return availableEncodersPromise;
}

function getCpuMp4Encoder() {
  return CPU_MP4_ENCODER;
}

function getRequestedHardwareEncoder(requested) {
  return HARDWARE_MP4_ENCODERS.find(candidate =>
    candidate.name === requested || candidate.aliases.includes(requested)
  );
}

function getSmokeTestOutputPath(encoderName) {
  return path.join(os.tmpdir(), `web2media-${process.pid}-${encoderName}-smoke.mp4`);
}

async function canEncodeWithEncoder(encoder) {
  if (!encoder.hardware) {
    return true;
  }

  if (encoderUsabilityCache.has(encoder.name)) {
    return encoderUsabilityCache.get(encoder.name);
  }

  const outputPath = getSmokeTestOutputPath(encoder.name);

  const usable = await new Promise((resolve) => {
    execFile(FFMPEG_PATH, [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=0.2:size=320x240:rate=10',
      '-c:v', encoder.name,
      '-pix_fmt', 'yuv420p',
      '-b:v', '1000k',
      '-y',
      outputPath,
    ], { timeout: 30000 }, (error) => {
      if (error) {
        console.warn(`[FFmpeg] ${encoder.label} is listed but failed smoke test: ${error.message}`);
        resolve(false);
        return;
      }

      try {
        const stats = fs.statSync(outputPath);
        resolve(stats.size > 0);
      } catch (e) {
        resolve(false);
      }
    });
  });

  try { fs.unlinkSync(outputPath); } catch (e) { /* ignore */ }
  encoderUsabilityCache.set(encoder.name, usable);

  return usable;
}

async function selectMp4VideoEncoder() {
  if (selectedMp4EncoderPromise) {
    return selectedMp4EncoderPromise;
  }

  selectedMp4EncoderPromise = (async () => {
    if (!ffmpegPathLogged) {
      console.log(`[FFmpeg] Binary: ${FFMPEG_PATH}`);
      ffmpegPathLogged = true;
    }

    const requested = normalizeName(SERVER_CONFIG.ffmpegVideoEncoder || 'auto');

    if (isDisabled(requested) || requested === 'libx264') {
      console.log('[FFmpeg] MP4 encoder: CPU libx264');
      return CPU_MP4_ENCODER;
    }

    let encoders;
    try {
      encoders = await getAvailableFfmpegEncoders();
    } catch (err) {
      console.warn(`[FFmpeg] Could not inspect encoders, using CPU libx264: ${err.message}`);
      return CPU_MP4_ENCODER;
    }

    if (requested && requested !== 'auto') {
      const configuredEncoder = getRequestedHardwareEncoder(requested) || {
        name: requested,
        label: requested,
        hardware: requested !== 'libx264',
        aliases: [],
      };

      if (encoders.has(configuredEncoder.name) && await canEncodeWithEncoder(configuredEncoder)) {
        console.log(`[FFmpeg] MP4 encoder: ${configuredEncoder.label}`);
        return configuredEncoder;
      }

      console.warn(`[FFmpeg] Requested encoder "${requested}" is not available/usable, using CPU libx264`);
      return CPU_MP4_ENCODER;
    }

    for (const hardwareEncoder of HARDWARE_MP4_ENCODERS) {
      if (!encoders.has(hardwareEncoder.name)) {
        continue;
      }

      if (await canEncodeWithEncoder(hardwareEncoder)) {
        console.log(`[FFmpeg] MP4 encoder: ${hardwareEncoder.label}`);
        return hardwareEncoder;
      }
    }

    console.log('[FFmpeg] No usable hardware MP4 encoder found, using CPU libx264');
    return CPU_MP4_ENCODER;
  })();

  return selectedMp4EncoderPromise;
}

function getHardwareDecodeInputOptions(options = {}) {
  if (options.disabled || isDisabled(SERVER_CONFIG.ffmpegHwAccel)) {
    return [];
  }

  const hwAccel = normalizeName(SERVER_CONFIG.ffmpegHwAccel || 'auto');
  return [`-hwaccel ${hwAccel || 'auto'}`];
}

function getMp4EncoderOutputOptions(encoder) {
  const baseOptions = [
    '-pix_fmt yuv420p',
    '-movflags +faststart',
  ];

  if (!encoder.hardware) {
    return [
      ...baseOptions,
      '-preset fast',
    ];
  }

  if (['h264_nvenc', 'nvenc', 'nvenc_h264'].includes(encoder.name)) {
    return [
      ...baseOptions,
      '-preset fast',
    ];
  }

  if (encoder.name === 'h264_qsv') {
    return [
      ...baseOptions,
      '-preset fast',
    ];
  }

  if (encoder.name === 'h264_amf') {
    return [
      ...baseOptions,
      '-usage transcoding',
      '-quality speed',
    ];
  }

  return baseOptions;
}

function shouldFallbackToCpu() {
  return SERVER_CONFIG.ffmpegHardwareFallback;
}

module.exports = {
  FFMPEG_PATH,
  getCpuMp4Encoder,
  getHardwareDecodeInputOptions,
  getMp4EncoderOutputOptions,
  selectMp4VideoEncoder,
  shouldFallbackToCpu,
};
