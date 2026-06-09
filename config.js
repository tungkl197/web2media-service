/**
 * Web2Media Service — Configuration & Constants
 */

const path = require('path');

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return !['0', 'false', 'off', 'no', 'disabled'].includes(String(value).toLowerCase());
}

function parseListEnv(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

// ── Background presets (mirrored from firefly.html) ──
const BG_PRESETS = [
  { index: 0, label: 'Rừng', gradient: 'radial-gradient(ellipse at 30% 60%, #0d2b14 0%, #050e08 60%, #020608 100%)' },
  { index: 1, label: 'Đêm', gradient: 'radial-gradient(ellipse at 50% 100%, #0d1535 0%, #040810 60%, #010205 100%)' },
  { index: 2, label: 'Hoàng hôn', gradient: 'linear-gradient(170deg, #0d0510 0%, #2a0e20 40%, #0a0508 100%)' },
  { index: 3, label: 'Ao hồ', gradient: 'radial-gradient(ellipse at 50% 80%, #071e2e 0%, #030c14 50%, #010408 100%)' },
  { index: 4, label: 'Núi', gradient: 'linear-gradient(160deg, #070a14 0%, #111828 40%, #050710 100%)' },
  { index: 5, label: 'Lúa', gradient: 'radial-gradient(ellipse at 50% 90%, #1a2208 0%, #0a0e04 60%, #040602 100%)' },
  { index: 6, label: 'Biển', gradient: 'linear-gradient(180deg, #03060e 0%, #061224 40%, #040d1a 100%)' },
  { index: 7, label: 'Tím', gradient: 'radial-gradient(ellipse at 50% 100%, #1e0f35 0%, #08051a 60%, #03020c 100%)' },
];

// ── Color presets (mirrored from firefly.html) ──
const COLOR_PRESETS = [
  { index: 0, name: 'Xanh lá', h: 105, s: 85, l: 65, hex: '#5fdf47' },
  { index: 1, name: 'Vàng', h: 55, s: 95, l: 68, hex: '#f5e94a' },
  { index: 2, name: 'Xanh lam', h: 195, s: 90, l: 65, hex: '#4dc8f0' },
  { index: 3, name: 'Cam', h: 35, s: 95, l: 65, hex: '#f5b44a' },
  { index: 4, name: 'Trắng', h: 0, s: 0, l: 90, hex: '#e6e6e6' },
  { index: 5, name: 'Hồng', h: 320, s: 80, l: 75, hex: '#ef8ad6' },
];

// ── Directions ──
const DIRECTIONS = ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'random'];

// ── Glow levels ──
const GLOW_LEVELS = ['low', 'mid', 'high'];

// ── Default firefly config ──
const DEFAULT_CONFIG = {
  // Firefly
  count: 80,
  size: 2.5,
  speed: 1.0,
  colorMode: 'preset',
  colorIndex: 0,
  customColor: '#7fff9a',
  glowLevel: 'mid',
  direction: 'up',
  spread: 0.4,
  // Background
  bgIndex: 1,
  bgUrl: null,
  // Video output
  duration: 10,
  fps: 60,
  width: 1920,
  height: 1080,
  bitrate: 5000000,
  format: 'webm',
  filename: 'firefly',
};

// ── Server config ──
const SERVER_CONFIG = {
  port: parseInt(process.env.PORT) || 3000,
  tempDir: path.join(__dirname, 'temp'),
  publicDir: path.join(__dirname, 'public'),
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 3,
  maxDuration: 120,  // seconds
  audioDownloadTimeout: parseInt(process.env.AUDIO_DOWNLOAD_TIMEOUT) || 30000,
  maxAudioBytes: parseInt(process.env.MAX_AUDIO_BYTES) || 100 * 1024 * 1024,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  runtimeConfigsTable: process.env.RUNTIME_CONFIGS_TABLE || 'runtime_configs',
  runtimeConfigCacheTtlMs: parseInt(process.env.RUNTIME_CONFIG_CACHE_TTL_MS) || 60000,
  r2UploadPartSize: parseInt(process.env.R2_UPLOAD_PART_SIZE) || 16 * 1024 * 1024,
  r2UploadQueueSize: parseInt(process.env.R2_UPLOAD_QUEUE_SIZE) || 3,
  jobQueueConcurrency: parseInt(process.env.JOB_QUEUE_CONCURRENCY) || parseInt(process.env.MAX_CONCURRENT) || 3,
  jobRetentionMs: parseInt(process.env.JOB_RETENTION_MS) || 24 * 60 * 60 * 1000,
  browserGpuEnabled: parseBooleanEnv(process.env.BROWSER_GPU_ENABLED, true),
  browserGpuFallback: parseBooleanEnv(process.env.BROWSER_GPU_FALLBACK, true),
  browserGpuExtraArgs: parseListEnv(process.env.BROWSER_GPU_EXTRA_ARGS),
  ffmpegPath: process.env.FFMPEG_PATH || '',
  ffmpegVideoEncoder: process.env.FFMPEG_VIDEO_ENCODER || 'auto',
  ffmpegHwAccel: process.env.FFMPEG_HWACCEL || 'auto',
  ffmpegHardwareFallback: parseBooleanEnv(process.env.FFMPEG_HARDWARE_FALLBACK, true),
};

module.exports = {
  BG_PRESETS,
  COLOR_PRESETS,
  DIRECTIONS,
  GLOW_LEVELS,
  DEFAULT_CONFIG,
  SERVER_CONFIG,
};
