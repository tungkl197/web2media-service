/**
 * Web2Media Service — Express Server Entry Point
 * 
 * Usage:
 *   npm start          → Start server on port 3000
 *   PORT=8080 npm start → Start on custom port
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

const { SERVER_CONFIG } = require('./config');
const fireflyVideoRecordRoutes = require('./routes/fireflyVideoRecord');
const { closeBrowser } = require('./services/renderer');
const swaggerDocument = require('./swagger');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));  // Allow large bgUrl data URLs
app.use(express.urlencoded({ extended: true }));

// ── Request logging ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const icon = res.statusCode < 400 ? '→' : '✗';
    console.log(`${icon} ${req.method} ${req.path} — ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ── Static files ──
app.use('/public', express.static(SERVER_CONFIG.publicDir));

// ── Swagger UI ──
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { background: #0a0f1e; border-bottom: 1px solid rgba(100, 200, 120, 0.2); }
    .swagger-ui .topbar .download-url-wrapper input { border-color: rgba(100, 200, 120, 0.3); }
    body { background: #0d1220; }
    .swagger-ui { color: #d4e8d4; }
    .swagger-ui .info .title { color: #7fff9a; }
    .swagger-ui .info .description p { color: #b8d4b8; }
    .swagger-ui .scheme-container { background: #0a0f1e; border-bottom: 1px solid rgba(100, 200, 120, 0.15); }
    .swagger-ui .opblock.opblock-post { border-color: rgba(127, 255, 154, 0.3); background: rgba(127, 255, 154, 0.03); }
    .swagger-ui .opblock.opblock-post .opblock-summary { border-color: rgba(127, 255, 154, 0.2); }
    .swagger-ui .opblock.opblock-get { border-color: rgba(100, 180, 255, 0.3); background: rgba(100, 180, 255, 0.03); }
    .swagger-ui .opblock.opblock-get .opblock-summary { border-color: rgba(100, 180, 255, 0.2); }
    .swagger-ui .btn { border-radius: 8px; }
    .swagger-ui select { border-radius: 8px; }
  `,
  customSiteTitle: '🌟 Web2Media Service Docs',
  customfavIcon: '',
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));

// ── API Routes ──
app.use('/api', fireflyVideoRecordRoutes);

// ── Root endpoint ──
app.get('/', (req, res) => {
  res.json({
    name: 'Web2Media Service',
    version: '1.0.0',
    description: 'Server-side API để tạo video animation',
    documentation: `http://localhost:${SERVER_CONFIG.port}/docs`,
    endpoints: {
      'POST /api/firefly-video-record': 'Tạo video đom đóm với cấu hình tùy chỉnh',
      'GET /api/presets': 'Danh sách preset có sẵn',
      'GET /api/health': 'Kiểm tra trạng thái server',
      'GET /docs': 'Swagger UI — Interactive API documentation',
    },
  });
});

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Không tìm thấy: ${req.method} ${req.path}`,
  });
});

// ── Error handler ──
app.use((err, req, res, next) => {
  // Handle malformed JSON body
  if (err.type === 'entity.parse.failed') {
    console.error(`[Server] JSON parse error: ${err.message}`);
    return res.status(400).json({
      success: false,
      error: 'JSON không hợp lệ. Kiểm tra lại cú pháp (dấu phẩy thừa, thiếu ngoặc kép...).',
    });
  }

  console.error('[Server] Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Lỗi server nội bộ',
  });
});

// ── Ensure temp directory exists ──
if (!fs.existsSync(SERVER_CONFIG.tempDir)) {
  fs.mkdirSync(SERVER_CONFIG.tempDir, { recursive: true });
}

// ── Start server ──
const server = app.listen(SERVER_CONFIG.port, () => {
  console.log('');
  console.log('  ✦ ═══════════════════════════════════════ ✦');
  console.log('  ║   Web2Media Service                     ║');
  console.log(`  ║   http://localhost:${SERVER_CONFIG.port}                  ║`);
  console.log(`  ║   Max concurrent: ${SERVER_CONFIG.maxConcurrent}                     ║`);
  console.log('  ✦ ═══════════════════════════════════════ ✦');
  console.log('');
  console.log('  Endpoints:');
  console.log('    POST /api/firefly-video-record → Tạo video đom đóm');
  console.log('    GET  /api/presets            → Danh sách presets');
  console.log('    GET  /api/health             → Health check');
  console.log(`    GET  /docs                   → Swagger UI`);
  console.log('');
});

// ── Graceful shutdown ──
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down...`);
  
  // Close browser
  await closeBrowser();

  // Cleanup temp files
  try {
    const tempFiles = fs.readdirSync(SERVER_CONFIG.tempDir);
    for (const file of tempFiles) {
      fs.unlinkSync(path.join(SERVER_CONFIG.tempDir, file));
    }
    console.log(`[Server] Cleaned up ${tempFiles.length} temp files.`);
  } catch (e) { /* ignore */ }

  server.close(() => {
    console.log('[Server] Goodbye! 🌟');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
