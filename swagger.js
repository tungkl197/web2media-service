/**
 * Web2Media Service - Swagger/OpenAPI Configuration
 */

const { DEFAULT_CONFIG } = require('./config');

const fireflyJobStatusResponse = {
  description: 'Firefly video job status. When status is done, `url` is the R2 URL.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/FireflyVideoJobStatusResponse' },
      examples: {
        running: {
          summary: 'Job is still running',
          value: {
            success: true,
            jobId: '2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0',
            status: 'running',
            progress: {
              step: 'uploading',
              message: 'Uploading video to R2',
              percent: 85,
            },
          },
        },
        done: {
          summary: 'Job is done',
          value: {
            success: true,
            jobId: '2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0',
            status: 'done',
            url: 'https://cdn.example.com/firefly/firefly-with-audio.mp4',
            data: {
              url: 'https://cdn.example.com/firefly/firefly-with-audio.mp4',
              filename: 'firefly-with-audio.mp4',
              format: 'mp4',
              mimeType: 'video/mp4',
              size: 1234567,
              duration: 10,
              hasAudio: true,
              elapsedSeconds: 42.1,
            },
          },
        },
      },
    },
  },
};

const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Web2Media Service',
    version: '1.0.0',
    description: `
Server-side API to create firefly animation videos.

The firefly video API is asynchronous:
1. Call POST /api/firefly-video-record to create a job.
2. Poll GET /api/firefly-video-record/status/{jobId}.
3. When status is "done", the response includes the R2 URL in top-level "url".

R2 configuration is read from Supabase runtime_configs. Do not send R2 config in the request body.
    `,
  },
  servers: [
    {
      url: '/',
      description: 'Web2Media Service',
    },
  ],
  tags: [
    {
      name: 'Firefly Video Record',
      description: 'Create firefly animation videos',
    },
    {
      name: 'Presets',
      description: 'Available video presets',
    },
    {
      name: 'System',
      description: 'Service status',
    },
  ],
  paths: {
    '/api/firefly-video-record': {
      post: {
        tags: ['Firefly Video Record'],
        summary: 'Create an async firefly video job',
        description: `Creates a queued job and returns immediately with jobId.

The render, optional audio merge, and R2 upload run in the background. Use the status API to get the final R2 URL.

If audioUrls is provided, the server downloads the audio files in order, concatenates them, and loops the video until the audio ends. GIF does not support audio.`,
        operationId: 'createFireflyVideoRecordJob',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FireflyVideoRecordRequest' },
              examples: {
                minimal: {
                  summary: 'Minimal request',
                  value: {
                    config: {
                      duration: 5,
                    },
                  },
                },
                with_audio: {
                  summary: 'Video with multiple audio URLs',
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
          202: {
            description: 'Job accepted and queued',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FireflyVideoJobCreateResponse' },
                example: {
                  success: true,
                  jobId: '2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0',
                  status: 'queued',
                  statusUrl: '/api/firefly-video-record/status/2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0',
                },
              },
            },
          },
          400: {
            description: 'Invalid request parameters',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/firefly-video-record/status/{jobId}': {
      get: {
        tags: ['Firefly Video Record'],
        summary: 'Check firefly video job status',
        operationId: 'getFireflyVideoRecordJobStatus',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: fireflyJobStatusResponse,
          404: {
            description: 'Job not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/firefly-video-record/{jobId}': {
      get: {
        tags: ['Firefly Video Record'],
        summary: 'Check firefly video job status (short alias)',
        operationId: 'getFireflyVideoRecordJobStatusAlias',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: fireflyJobStatusResponse,
          404: {
            description: 'Job not found',
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
        summary: 'Get available presets',
        operationId: 'getPresets',
        responses: {
          200: {
            description: 'Preset list',
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
        summary: 'Health check',
        operationId: 'healthCheck',
        responses: {
          200: {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
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
        properties: {
          config: {
            $ref: '#/components/schemas/FireflyVideoConfig',
          },
          audioUrls: {
            type: 'array',
            maxItems: 20,
            default: [],
            description: 'Audio URLs. The server concatenates them in order and loops video until audio ends.',
            items: {
              type: 'string',
              format: 'uri',
            },
          },
          audio_urls: {
            type: 'array',
            maxItems: 20,
            default: [],
            description: 'Alias for audioUrls.',
            items: {
              type: 'string',
              format: 'uri',
            },
          },
        },
      },
      FireflyVideoConfig: {
        type: 'object',
        properties: {
          count: { type: 'integer', minimum: 10, maximum: 300, default: DEFAULT_CONFIG.count, example: 80 },
          size: { type: 'number', minimum: 1, maximum: 6, default: DEFAULT_CONFIG.size, example: 2.5 },
          speed: { type: 'number', minimum: 0.2, maximum: 3, default: DEFAULT_CONFIG.speed, example: 1 },
          colorMode: { type: 'string', enum: ['preset', 'custom'], default: DEFAULT_CONFIG.colorMode },
          colorIndex: { type: 'integer', minimum: 0, maximum: 5, default: DEFAULT_CONFIG.colorIndex },
          customColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', default: DEFAULT_CONFIG.customColor },
          glowLevel: { type: 'string', enum: ['low', 'mid', 'high'], default: DEFAULT_CONFIG.glowLevel },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'random'],
            default: DEFAULT_CONFIG.direction,
          },
          spread: { type: 'number', minimum: 0, maximum: 1, default: DEFAULT_CONFIG.spread },
          bgIndex: { type: 'integer', minimum: 0, maximum: 7, default: DEFAULT_CONFIG.bgIndex },
          bgUrl: { type: 'string', format: 'uri', nullable: true, default: null },
          duration: { type: 'integer', minimum: 3, maximum: 120, default: DEFAULT_CONFIG.duration },
          fps: { type: 'integer', enum: [24, 30, 60], default: DEFAULT_CONFIG.fps },
          width: { type: 'integer', minimum: 320, maximum: 3840, default: DEFAULT_CONFIG.width },
          height: { type: 'integer', minimum: 240, maximum: 2160, default: DEFAULT_CONFIG.height },
          bitrate: { type: 'integer', minimum: 1000000, maximum: 20000000, default: DEFAULT_CONFIG.bitrate },
          format: { type: 'string', enum: ['webm', 'mp4', 'gif'], default: DEFAULT_CONFIG.format },
          filename: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', maxLength: 100, default: DEFAULT_CONFIG.filename },
        },
      },
      FireflyVideoJobCreateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          jobId: { type: 'string', example: '2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0' },
          status: { type: 'string', enum: ['queued', 'running', 'done', 'failed'], example: 'queued' },
          statusUrl: { type: 'string', example: '/api/firefly-video-record/status/2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0' },
          data: { $ref: '#/components/schemas/FireflyVideoJobStatus' },
        },
      },
      FireflyVideoJobStatusResponse: {
        allOf: [
          {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
            },
          },
          { $ref: '#/components/schemas/FireflyVideoJobStatus' },
        ],
      },
      FireflyVideoJobStatus: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          status: { type: 'string', enum: ['queued', 'running', 'done', 'failed'] },
          createdAt: { type: 'string', format: 'date-time', nullable: true },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          progress: { $ref: '#/components/schemas/JobProgress' },
          url: {
            type: 'string',
            nullable: true,
            description: 'R2 URL. Present when status is done.',
          },
          data: {
            $ref: '#/components/schemas/FireflyVideoResult',
          },
          error: {
            type: 'string',
            nullable: true,
          },
        },
      },
      JobProgress: {
        type: 'object',
        properties: {
          step: { type: 'string', example: 'uploading' },
          message: { type: 'string', example: 'Uploading video to R2' },
          percent: { type: 'number', example: 85 },
        },
      },
      FireflyVideoResult: {
        type: 'object',
        properties: {
          url: { type: 'string', example: 'https://cdn.example.com/firefly/firefly-with-audio.mp4' },
          filename: { type: 'string', example: 'firefly-with-audio.mp4' },
          format: { type: 'string', example: 'mp4' },
          mimeType: { type: 'string', example: 'video/mp4' },
          size: { type: 'integer', example: 1234567 },
          duration: { type: 'integer', example: 10 },
          hasAudio: { type: 'boolean', example: true },
          elapsedSeconds: { type: 'number', example: 42.1 },
          r2: { $ref: '#/components/schemas/R2UploadResult' },
        },
      },
      R2UploadResult: {
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
      PresetsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              backgrounds: { type: 'array', items: { type: 'object' } },
              colors: { type: 'array', items: { type: 'object' } },
              directions: { type: 'array', items: { type: 'string' } },
              glowLevels: { type: 'array', items: { type: 'string' } },
              fpsOptions: { type: 'array', items: { type: 'integer' } },
              formatOptions: { type: 'array', items: { type: 'string' } },
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
          fireflyVideoJobs: {
            type: 'object',
            properties: {
              queued: { type: 'integer', example: 0 },
              running: { type: 'integer', example: 1 },
              total: { type: 'integer', example: 4 },
              concurrency: { type: 'integer', example: 3 },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Invalid request' },
          jobId: { type: 'string', nullable: true },
          details: {
            type: 'array',
            nullable: true,
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'config.count' },
                message: { type: 'string', example: 'count must be less than or equal to 300' },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerDefinition;
