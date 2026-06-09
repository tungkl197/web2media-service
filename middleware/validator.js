/**
 * Web2Media Service — Request Validation Middleware
 * Uses Joi for schema validation with Vietnamese error messages.
 */

const Joi = require('joi');

const audioUrlsSchema = Joi.array().items(
  Joi.string().uri({ scheme: ['http', 'https'] })
    .messages({ 'string.uri': 'audioUrls chỉ chấp nhận URL http/https hợp lệ' })
).max(20).default([])
  .messages({ 'array.max': 'audioUrls tối đa 20 URL' });

// ── Firefly video config schema ──
const fireflyVideoConfigSchema = Joi.object({
  // Firefly config
  count: Joi.number().integer().min(10).max(300).default(80)
    .messages({
      'number.min': 'Số lượng đom đóm phải >= 10',
      'number.max': 'Số lượng đom đóm phải <= 300',
    }),
  size: Joi.number().min(1).max(6).default(2.5)
    .messages({
      'number.min': 'Kích thước phải >= 1',
      'number.max': 'Kích thước phải <= 6',
    }),
  speed: Joi.number().min(0.2).max(3).default(1.0)
    .messages({
      'number.min': 'Tốc độ phải >= 0.2',
      'number.max': 'Tốc độ phải <= 3.0',
    }),
  colorMode: Joi.string().valid('preset', 'custom').default('preset')
    .messages({ 'any.only': 'colorMode phải là "preset" hoặc "custom"' }),
  colorIndex: Joi.number().integer().min(0).max(5).default(0)
    .messages({ 'number.max': 'colorIndex phải từ 0 đến 5' }),
  customColor: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).default('#7fff9a')
    .messages({ 'string.pattern.base': 'customColor phải là mã hex hợp lệ (VD: #7fff9a)' }),
  glowLevel: Joi.string().valid('low', 'mid', 'high').default('mid')
    .messages({ 'any.only': 'glowLevel phải là "low", "mid" hoặc "high"' }),
  direction: Joi.string().valid(
    'up', 'down', 'left', 'right',
    'up-left', 'up-right', 'down-left', 'down-right', 'random'
  ).default('up')
    .messages({ 'any.only': 'direction không hợp lệ' }),
  spread: Joi.number().min(0).max(1).default(0.4)
    .messages({
      'number.min': 'Độ tản mạn phải >= 0',
      'number.max': 'Độ tản mạn phải <= 1',
    }),

  // Background
  bgIndex: Joi.number().integer().min(0).max(7).default(1)
    .messages({ 'number.max': 'bgIndex phải từ 0 đến 7' }),
  bgUrl: Joi.string().uri().allow(null, '').default(null)
    .messages({ 'string.uri': 'bgUrl phải là URL hợp lệ' }),

  // Video output
  duration: Joi.number().integer().min(3).max(120).default(10)
    .messages({
      'number.min': 'Thời lượng phải >= 3 giây',
      'number.max': 'Thời lượng phải <= 120 giây',
    }),
  fps: Joi.number().integer().valid(24, 30, 60).default(60)
    .messages({ 'any.only': 'FPS phải là 24, 30 hoặc 60' }),
  width: Joi.number().integer().min(320).max(3840).default(1920)
    .messages({
      'number.min': 'Chiều rộng phải >= 320px',
      'number.max': 'Chiều rộng phải <= 3840px',
    }),
  height: Joi.number().integer().min(240).max(2160).default(1080)
    .messages({
      'number.min': 'Chiều cao phải >= 240px',
      'number.max': 'Chiều cao phải <= 2160px',
    }),
  bitrate: Joi.number().integer().min(1000000).max(20000000).default(5000000)
    .messages({
      'number.min': 'Bitrate phải >= 1,000,000 bps',
      'number.max': 'Bitrate phải <= 20,000,000 bps',
    }),
  format: Joi.string().valid('webm', 'mp4', 'gif').default('webm')
    .messages({ 'any.only': 'Format phải là "webm", "mp4" hoặc "gif"' }),
  filename: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).max(100).default('firefly')
    .messages({
      'string.pattern.base': 'Tên file chỉ được chứa chữ cái, số, dấu gạch ngang và gạch dưới',
      'string.max': 'Tên file tối đa 100 ký tự',
    }),
}).options({ stripUnknown: true }).default();

// ── Firefly video record request schema ──
const fireflyVideoRecordSchema = Joi.object({
  config: fireflyVideoConfigSchema,
  audioUrls: audioUrlsSchema,
  audio_urls: audioUrlsSchema,
  r2: Joi.forbidden()
    .messages({ 'any.unknown': 'r2 không được truyền vào API. Cấu hình R2 được lấy từ runtime_configs.' }),
}).options({ stripUnknown: true });

/**
 * Express middleware to validate firefly video record request body
 */
function validateFireflyVideoRecordRequest(req, res, next) {
  const { error, value } = fireflyVideoRecordSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message,
    }));
    return res.status(400).json({
      success: false,
      error: 'Tham số không hợp lệ',
      details: errors,
    });
  }

  const audioUrls = [
    ...(value.audioUrls || []),
    ...(value.audio_urls || []),
  ];

  // Normalize the public payload shape for the rendering pipeline.
  req.body = {
    ...value.config,
    audioUrls,
  };
  next();
}

module.exports = {
  validateFireflyVideoRecordRequest,
  fireflyVideoConfigSchema,
  fireflyVideoRecordSchema,
};
