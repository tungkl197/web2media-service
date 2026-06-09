/**
 * Web2Media Service — Swagger/OpenAPI Configuration
 */

const { DEFAULT_CONFIG } = require('./config');

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: '🌟 Web2Media Service',
    version: '1.0.0',
    description: `
Server-side API để tạo video animation đom đóm (firefly).

## Tính năng
- 🎬 **Render video** với đầy đủ tham số cấu hình (đom đóm, nền, màu sắc, hướng bay...)
- 🎨 **8 background presets** + hỗ trợ ảnh nền tùy chỉnh qua URL
- 🌈 **6 color presets** + chọn màu hex tùy ý
- 🎧 **Ghép audio từ URL** và tự lặp video đến hết audio
- ☁️ **Upload video lên Cloudflare R2** sau khi render xong
- 📦 **3 output formats**: WebM, MP4, GIF
- 🖥️ **Tuỳ chỉnh resolution** từ 320×240 đến 3840×2160

## Cách sử dụng
1. Gọi \`GET /api/presets\` để xem danh sách presets có sẵn
2. Gọi \`POST /api/firefly-video-record\` để tạo video animation
    `,
    contact: {
      name: 'Web2Media Service',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: `/`,
      description: 'Web2Media Service',
    },
  ],
  tags: [
    {
      name: 'Firefly Video Record',
      description: 'Tạo video animation đom đóm',
    },
    {
      name: 'Presets',
      description: 'Danh sách cấu hình có sẵn',
    },
    {
      name: 'System',
      description: 'Kiểm tra trạng thái hệ thống',
    },
  ],
  paths: {
    '/api/firefly-video-record': {
      post: {
        tags: ['Firefly Video Record'],
        summary: 'Tạo video đom đóm',
        description: `Render animation đom đóm với cấu hình tuỳ chỉnh, upload file video cuối cùng lên Cloudflare R2, và trả JSON metadata.

Thời gian xử lý phụ thuộc vào duration và resolution (VD: 10s video 1080p khoảng 15-25 giây).

Nếu gửi \`audioUrls\`, server sẽ tải audio theo thứ tự, nối chúng lại, và lặp video đom đóm cho đến khi audio kết thúc. GIF không hỗ trợ audio.

Cấu hình R2 được đọc từ bảng \`runtime_configs\` trong Supabase. Không truyền cấu hình R2 trong request body.

Tất cả tham số đều có giá trị mặc định, bạn chỉ cần gửi những tham số muốn thay đổi.`,
        operationId: 'fireflyVideoRecord',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FireflyVideoRecordRequest' },
              examples: {
                minimal: {
                  summary: 'Tối giản — chỉ đổi thời lượng',
                  value: {
                    config: {
                      duration: 5,
                    },
                  },
                },
                preset_color: {
                  summary: 'Đom đóm vàng, nền rừng',
                  value: {
                    config: {
                      count: 120,
                      size: 3,
                      speed: 1.5,
                      colorMode: 'preset',
                      colorIndex: 1,
                      glowLevel: 'high',
                      bgIndex: 0,
                      direction: 'up',
                      duration: 10,
                      format: 'webm',
                    },
                  },
                },
                custom_color: {
                  summary: 'Màu tuỳ chỉnh + MP4',
                  value: {
                    config: {
                      count: 200,
                      size: 2,
                      speed: 0.8,
                      colorMode: 'custom',
                      customColor: '#ff6b9d',
                      glowLevel: 'mid',
                      direction: 'random',
                      spread: 0.7,
                      bgIndex: 7,
                      duration: 15,
                      width: 1280,
                      height: 720,
                      fps: 30,
                      format: 'mp4',
                      filename: 'pink-fireflies',
                    },
                  },
                },
                gif_output: {
                  summary: 'Export GIF nhẹ',
                  value: {
                    config: {
                      count: 60,
                      size: 3.5,
                      glowLevel: 'high',
                      colorIndex: 2,
                      direction: 'up-right',
                      bgIndex: 3,
                      duration: 5,
                      width: 640,
                      height: 360,
                      fps: 24,
                      format: 'gif',
                      filename: 'firefly-preview',
                    },
                  },
                },
                custom_background: {
                  summary: 'Ảnh nền tùy chỉnh (bgUrl)',
                  value: {
                    config: {
                      count: 100,
                      speed: 0.9,
                      colorMode: 'preset',
                      colorIndex: 4,
                      bgUrl: 'https://img.freepik.com/free-photo/stars-universe-night-sky_1048-2434.jpg',
                      direction: 'random',
                      duration: 10,
                      format: 'mp4',
                      width: 1920,
                      height: 1080,
                      fps: 30,
                      filename: 'stars-fireflies',
                    },
                  },
                },
                with_audio: {
                  summary: 'Ghép nhiều audio URL',
                  value: {
                    config: {
                      duration: 10,
                      format: 'mp4',
                      width: 1280,
                      height: 720,
                      fps: 30,
                      filename: 'firefly-with-audio',
                    },
                    audioUrls: [
                      'https://example.com/audio/intro.mp3',
                      'https://example.com/audio/main.mp3',
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Video file được tạo và upload lên R2 thành công',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/R2UploadResponse' },
              },
            },
          },
          400: {
            description: 'Tham số không hợp lệ hoặc yêu cầu ghép audio với GIF',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  error: 'Tham số không hợp lệ',
                  details: [
                    { field: 'config.count', message: 'Số lượng đom đóm phải <= 300' },
                  ],
                },
              },
            },
          },
          429: {
            description: 'Quá nhiều firefly video record đồng thời',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  success: false,
                  error: 'Đã đạt giới hạn 3 video đồng thời. Vui lòng thử lại sau.',
                },
              },
            },
          },
          500: {
            description: 'Lỗi server',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          502: {
            description: 'Không đọc được runtime_configs hoặc upload R2 thất bại',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/presets': {
      get: {
        tags: ['Presets'],
        summary: 'Danh sách presets có sẵn',
        description: 'Trả về danh sách tất cả background, color presets, hướng bay, và các tuỳ chọn khác.',
        operationId: 'getPresets',
        responses: {
          200: {
            description: 'Danh sách presets',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PresetsResponse' },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Kiểm tra trạng thái server',
        description: 'Trả về trạng thái server, version, và số firefly video record đang chạy.',
        operationId: 'healthCheck',
        responses: {
          200: {
            description: 'Server hoạt động bình thường',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                example: {
                  success: true,
                  status: 'ok',
                  version: '1.0.0',
                  activeFireflyVideoRecords: 0,
                  timestamp: '2026-06-06T09:00:00.000Z',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      FireflyVideoRecordRequest: {
        type: 'object',
        description: 'Payload tạo video. Cấu hình firefly/video nằm trong config, audio URLs nằm riêng ở top-level.',
        properties: {
          config: {
            $ref: '#/components/schemas/FireflyVideoConfig',
          },
          audioUrls: {
            type: 'array',
            maxItems: 20,
            default: [],
            description: '🎧 Danh sách URL audio http/https. Server sẽ nối audio theo thứ tự và lặp video cho đến khi audio kết thúc. Chỉ hỗ trợ với format webm hoặc mp4.',
            items: {
              type: 'string',
              format: 'uri',
            },
            example: [
              'https://example.com/audio/intro.mp3',
              'https://example.com/audio/main.mp3',
            ],
          },
        },
      },
      R2UploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          url: { type: 'string', example: 'https://cdn.example.com/firefly/firefly-with-audio.mp4' },
          data: {
            type: 'object',
            properties: {
              url: { type: 'string', example: 'https://cdn.example.com/firefly/firefly-with-audio.mp4' },
              filename: { type: 'string', example: 'firefly-with-audio.mp4' },
              format: { type: 'string', example: 'mp4' },
              mimeType: { type: 'string', example: 'video/mp4' },
              size: { type: 'integer', example: 1234567 },
              duration: { type: 'integer', example: 10 },
              hasAudio: { type: 'boolean', example: true },
              r2: {
                type: 'object',
                properties: {
                  bucket: { type: 'string', example: 'videos' },
                  key: { type: 'string', example: 'firefly/firefly-with-audio.mp4' },
                  size: { type: 'integer', example: 1234567 },
                  contentType: { type: 'string', example: 'video/mp4' },
                  etag: { type: 'string', example: '"abc123"' },
                  url: { type: 'string', nullable: true, example: 'https://cdn.example.com/firefly/firefly-with-audio.mp4' },
                },
              },
            },
          },
        },
      },
      FireflyVideoConfig: {
        type: 'object',
        description: 'Tham số cấu hình để tạo video. Tất cả đều có giá trị mặc định.',
        properties: {
          // ── Firefly Config ──
          count: {
            type: 'integer',
            minimum: 10,
            maximum: 300,
            default: DEFAULT_CONFIG.count,
            description: '✦ Số lượng đom đóm',
            example: 80,
          },
          size: {
            type: 'number',
            minimum: 1,
            maximum: 6,
            default: DEFAULT_CONFIG.size,
            description: '⬤ Kích thước đom đóm',
            example: 2.5,
          },
          speed: {
            type: 'number',
            minimum: 0.2,
            maximum: 3.0,
            default: DEFAULT_CONFIG.speed,
            description: '⚡ Tốc độ bay',
            example: 1.0,
          },
          colorMode: {
            type: 'string',
            enum: ['preset', 'custom'],
            default: DEFAULT_CONFIG.colorMode,
            description: '🎨 Chế độ màu — `preset` dùng colorIndex, `custom` dùng customColor',
          },
          colorIndex: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            default: DEFAULT_CONFIG.colorIndex,
            description: '🎨 Index preset màu (0=Xanh lá, 1=Vàng, 2=Xanh lam, 3=Cam, 4=Trắng, 5=Hồng). Chỉ dùng khi colorMode="preset"',
          },
          customColor: {
            type: 'string',
            pattern: '^#[0-9a-fA-F]{6}$',
            default: DEFAULT_CONFIG.customColor,
            description: '🎨 Mã màu hex tuỳ chỉnh. Chỉ dùng khi colorMode="custom"',
            example: '#7fff9a',
          },
          glowLevel: {
            type: 'string',
            enum: ['low', 'mid', 'high'],
            default: DEFAULT_CONFIG.glowLevel,
            description: '💫 Cường độ phát sáng (low=nhẹ, mid=vừa, high=mạnh)',
          },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'random'],
            default: DEFAULT_CONFIG.direction,
            description: '🧭 Hướng bay của đom đóm',
          },
          spread: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: DEFAULT_CONFIG.spread,
            description: '〰 Độ tản mạn — 0 = bay thẳng, 1 = bay tản rộng',
            example: 0.4,
          },
          // ── Background ──
          bgIndex: {
            type: 'integer',
            minimum: 0,
            maximum: 7,
            default: DEFAULT_CONFIG.bgIndex,
            description: '🖼 Index preset nền (0=Rừng, 1=Đêm, 2=Hoàng hôn, 3=Ao hồ, 4=Núi, 5=Lúa, 6=Biển, 7=Tím)',
          },
          bgUrl: {
            type: 'string',
            format: 'uri',
            nullable: true,
            default: null,
            description: '🖼 URL ảnh nền tuỳ chỉnh. Khi có giá trị sẽ override bgIndex',
            example: 'https://example.com/forest.jpg',
          },
          // ── Video Output ──
          duration: {
            type: 'integer',
            minimum: 3,
            maximum: 120,
            default: DEFAULT_CONFIG.duration,
            description: '⏱ Thời lượng video (giây)',
            example: 10,
          },
          fps: {
            type: 'integer',
            enum: [24, 30, 60],
            default: DEFAULT_CONFIG.fps,
            description: '🎞 Số frame trên giây',
          },
          width: {
            type: 'integer',
            minimum: 320,
            maximum: 3840,
            default: DEFAULT_CONFIG.width,
            description: '🖥 Chiều rộng video (px)',
            example: 1920,
          },
          height: {
            type: 'integer',
            minimum: 240,
            maximum: 2160,
            default: DEFAULT_CONFIG.height,
            description: '🖥 Chiều cao video (px)',
            example: 1080,
          },
          bitrate: {
            type: 'integer',
            minimum: 1000000,
            maximum: 20000000,
            default: DEFAULT_CONFIG.bitrate,
            description: '📊 Bitrate video (bps). 2500000=720p, 5000000=1080p, 10000000=4K',
            example: 5000000,
          },
          format: {
            type: 'string',
            enum: ['webm', 'mp4', 'gif'],
            default: DEFAULT_CONFIG.format,
            description: '📦 Định dạng output video',
          },
          filename: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]+$',
            maxLength: 100,
            default: DEFAULT_CONFIG.filename,
            description: '📁 Tên file download (không cần extension)',
            example: 'firefly',
          },
        },
      },
      PresetsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              backgrounds: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer', example: 0 },
                    label: { type: 'string', example: 'Rừng' },
                  },
                },
              },
              colors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer', example: 0 },
                    name: { type: 'string', example: 'Xanh lá' },
                    hex: { type: 'string', example: '#5fdf47' },
                  },
                },
              },
              directions: {
                type: 'array',
                items: { type: 'string' },
                example: ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'random'],
              },
              glowLevels: {
                type: 'array',
                items: { type: 'string' },
                example: ['low', 'mid', 'high'],
              },
              fpsOptions: {
                type: 'array',
                items: { type: 'integer' },
                example: [24, 30, 60],
              },
              formatOptions: {
                type: 'array',
                items: { type: 'string' },
                example: ['webm', 'mp4', 'gif'],
              },
            },
          },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          status: { type: 'string', example: 'ok' },
          version: { type: 'string', example: '1.0.0' },
          activeFireflyVideoRecords: { type: 'integer', example: 0 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Tham số không hợp lệ' },
          details: {
            type: 'array',
            nullable: true,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'count' },
                message: { type: 'string', example: 'Số lượng đom đóm phải <= 300' },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerDefinition;
