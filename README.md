# Web2Media Service

Service Node.js/Express để render video firefly, ghép audio từ URL, upload file đầu ra lên Cloudflare R2 và trả về R2 URL qua hệ thống job queue.

## Tính năng

- Render animation firefly bằng Puppeteer/Chromium.
- Nhận cấu hình video qua `config`.
- Nhận danh sách audio qua `audioUrls`.
- Ghép nhiều audio theo đúng thứ tự truyền vào.
- Nếu audio dài hơn video, video sẽ tự lặp cho đến hết audio.
- Upload video cuối cùng lên Cloudflare R2.
- Lấy cấu hình R2 từ bảng `runtime_configs` trong Supabase.
- API chạy bất đồng bộ bằng job queue.
- Hỗ trợ GPU cho Chromium và FFmpeg khi môi trường có GPU/encoder phù hợp.

## Yêu cầu

- Node.js 20+
- FFmpeg
- Chromium dependencies cho Puppeteer
- Supabase project có bảng `runtime_configs`
- Cloudflare R2 bucket và public domain/base URL

Trên Windows, nên cài FFmpeg riêng và trỏ `FFMPEG_PATH` tới binary đó, ví dụ:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

Nếu không cấu hình `FFMPEG_PATH`, service sẽ thử dùng `ffmpeg` trong PATH trước, sau đó mới fallback về FFmpeg bundled từ `@ffmpeg-installer/ffmpeg`.

## Cài đặt

```bash
npm install
```

Tạo file `.env` theo `.env.example`:

```env
PORT=4526
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
RUNTIME_CONFIGS_TABLE=runtime_configs
RUNTIME_CONFIG_CACHE_TTL_MS=60000

R2_UPLOAD_PART_SIZE=16777216
R2_UPLOAD_QUEUE_SIZE=3

JOB_QUEUE_CONCURRENCY=3
JOB_RETENTION_MS=86400000

BROWSER_GPU_ENABLED=true
BROWSER_GPU_FALLBACK=true
BROWSER_GPU_EXTRA_ARGS=

FFMPEG_PATH=
FFMPEG_VIDEO_ENCODER=auto
FFMPEG_HWACCEL=auto
FFMPEG_HARDWARE_FALLBACK=true
```

## Chạy server

```bash
npm start
```

Dev mode:

```bash
npm run dev
```

Mặc định server chạy ở:

```text
http://localhost:4526
```

Swagger UI:

```text
http://localhost:4526/docs
```

## Cấu hình R2 trong Supabase

API không nhận cấu hình R2 trong request body. Service đọc từ bảng `runtime_configs`.

Các field cần có:

- `accountId` hoặc `endpoint`
- `accessKeyId`
- `secretAccessKey`
- `bucket`
- `publicBaseUrl`
- `keyPrefix` optional
- `region` optional, mặc định là `auto`

Ví dụ 1 row dạng object:

```json
{
  "key": "r2",
  "value": {
    "accountId": "your-cloudflare-account-id",
    "accessKeyId": "your-r2-access-key-id",
    "secretAccessKey": "your-r2-secret-access-key",
    "bucket": "your-bucket",
    "publicBaseUrl": "https://cdn.example.com",
    "keyPrefix": "data-sources"
  }
}
```

Hoặc có thể lưu dạng key/value rời:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_DOMAIN
R2_KEY_PREFIX
```

## API Flow

### 1. Tạo job video

```bash
curl -X POST "http://localhost:4526/api/firefly-video-record" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "duration": 10,
      "format": "mp4",
      "width": 1280,
      "height": 720,
      "fps": 30,
      "filename": "firefly-with-audio"
    },
    "audioUrls": [
      "https://example.com/audio/intro.mp3",
      "https://example.com/audio/main.mp3"
    ]
  }'
```

Response:

```json
{
  "success": true,
  "jobId": "2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0",
  "status": "queued",
  "statusUrl": "/api/firefly-video-record/status/2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0"
}
```

### 2. Check status

```bash
curl "http://localhost:4526/api/firefly-video-record/status/2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0"
```

Khi đang chạy:

```json
{
  "success": true,
  "jobId": "2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0",
  "status": "running",
  "progress": {
    "step": "uploading",
    "message": "Uploading video to R2",
    "percent": 85
  }
}
```

Khi hoàn tất:

```json
{
  "success": true,
  "jobId": "2c617f18-7f8f-4e4f-9245-cbd3e7e35aa0",
  "status": "done",
  "url": "https://cdn.example.com/data-sources/firefly-with-audio.mp4",
  "data": {
    "url": "https://cdn.example.com/data-sources/firefly-with-audio.mp4",
    "filename": "firefly-with-audio.mp4",
    "format": "mp4",
    "mimeType": "video/mp4",
    "duration": 10,
    "hasAudio": true
  }
}
```

Status có thể là:

- `queued`
- `running`
- `done`
- `failed`

Lưu ý: job queue hiện là in-memory. Nếu restart server, danh sách job trong memory sẽ mất. File đã upload thành công lên R2 vẫn còn trên R2.

## Endpoint khác

```text
GET /api/health
GET /api/presets
GET /docs
```

`GET /api/health` trả thêm thống kê queue:

```json
{
  "fireflyVideoJobs": {
    "queued": 0,
    "running": 1,
    "total": 4,
    "concurrency": 3
  }
}
```

## GPU và FFmpeg

Service cố gắng dùng GPU nhiều nhất có thể:

- Chromium render bật GPU mặc định.
- FFmpeg chọn encoder phần cứng theo thứ tự:
  - `h264_nvenc` cho NVIDIA
  - `h264_qsv` cho Intel Quick Sync
  - `h264_amf` cho AMD
  - fallback `libx264` CPU

Trước khi chọn encoder GPU, service chạy smoke test nhỏ. Nếu encoder có trong FFmpeg nhưng không encode được thật, service sẽ bỏ qua encoder đó.

Log nên có dạng:

```text
[FFmpeg] Binary: C:\ffmpeg\bin\ffmpeg.exe
[FFmpeg] MP4 encoder: NVIDIA NVENC
```

Ép encoder cụ thể:

```env
FFMPEG_VIDEO_ENCODER=h264_nvenc
```

Tắt GPU FFmpeg:

```env
FFMPEG_VIDEO_ENCODER=cpu
FFMPEG_HWACCEL=off
```

Tắt GPU Chromium:

```env
BROWSER_GPU_ENABLED=false
```

## Docker

Chạy CPU/default:

```bash
docker compose up -d --build
```

Chạy với GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Container GPU cần NVIDIA driver và NVIDIA Container Toolkit trên host.

## Lỗi thường gặp

### `NetworkError when attempting to fetch resource`

Thường do gọi sai port. Docker compose hiện map port `4526`, nên dùng:

```text
http://localhost:4526/api/firefly-video-record
```

### `write ECONNRESET` khi upload R2

Upload R2 đã dùng multipart upload. Có thể giảm tải upload bằng:

```env
R2_UPLOAD_QUEUE_SIZE=1
R2_UPLOAD_PART_SIZE=8388608
```

### FFmpeg báo chọn NVENC nhưng fail

Kiểm tra log `FFmpeg Binary`. Nếu đang dùng FFmpeg bundled, cài FFmpeg system mới hơn và cấu hình:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

## Scripts

```bash
npm start
npm run dev
```
