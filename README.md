# Web2Media Service

Python/FastAPI service de render video firefly, ghep audio tu URL, upload video dau ra len Cloudflare R2 va tra ve R2 URL qua job queue.

## Tinh nang

- Render animation firefly bang Playwright/Chromium.
- Nhan cau hinh video trong object `config`.
- Nhan danh sach audio trong `audioUrls`.
- Ghep nhieu audio theo dung thu tu request.
- Neu audio dai hon video, video tu lap den het audio.
- Upload file cuoi cung len Cloudflare R2.
- Lay cau hinh R2 tu bang `runtime_configs` trong Supabase.
- API bat dong bo bang in-memory job queue.
- Ho tro GPU cho Chromium va FFmpeg: NVENC, QSV, AMF, fallback CPU.

## Yeu cau

- Python 3.12+
- FFmpeg
- Playwright Chromium
- Supabase project co bang `runtime_configs`
- Cloudflare R2 bucket va public base URL

## Cai dat local

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

Tao file `.env` theo `.env.example`:

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

Tren Windows, nen cai FFmpeg rieng va tro ro path:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

## Chay server

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 4526
```

Docs:

```text
http://localhost:4526/docs
```

Health:

```text
http://localhost:4526/api/health
```

## Cau hinh R2 trong Supabase

API khong nhan cau hinh R2 trong request body. Service doc tu bang `runtime_configs`.

Can co cac field:

- `accountId` hoac `endpoint`
- `accessKeyId`
- `secretAccessKey`
- `bucket`
- `publicBaseUrl`
- `keyPrefix` optional
- `region` optional, mac dinh `auto`

Vi du 1 row:

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

Hoac co the luu key/value roi:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_DOMAIN
R2_KEY_PREFIX
```

## API flow

### Tao job video

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

### Check status

```bash
curl "http://localhost:4526/api/firefly-video-record/status/<jobId>"
```

Khi xong:

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

Status co the la:

- `queued`
- `running`
- `done`
- `failed`

Luu y: job queue hien la in-memory. Restart server se mat danh sach job trong memory. File da upload thanh cong len R2 van con tren R2.

## GPU va FFmpeg

Service tu chon encoder MP4 theo thu tu:

1. `h264_nvenc` cho NVIDIA
2. `h264_qsv` cho Intel Quick Sync
3. `h264_amf` cho AMD
4. `libx264` CPU fallback

Truoc khi chon encoder GPU, service chay smoke test nho. Encoder nao co trong FFmpeg nhung khong encode duoc se bi bo qua.

Log mong doi:

```text
[FFmpeg] Binary: C:\ffmpeg\bin\ffmpeg.exe
[FFmpeg] MP4 encoder: NVIDIA NVENC
```

Tat GPU FFmpeg:

```env
FFMPEG_VIDEO_ENCODER=cpu
FFMPEG_HWACCEL=off
```

Tat GPU Chromium:

```env
BROWSER_GPU_ENABLED=false
```

## Docker

Chay default:

```bash
docker compose up -d --build
```

Chay voi GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Container GPU can NVIDIA driver va NVIDIA Container Toolkit tren host.

## Endpoint khac

```text
GET /api/health
GET /api/presets
GET /docs
```

## Loi thuong gap

### Goi sai port

Docker compose map port `4526`, nen dung:

```text
http://localhost:4526/api/firefly-video-record
```

### R2 upload bi reset

Upload R2 dung multipart. Co the giam concurrency:

```env
R2_UPLOAD_QUEUE_SIZE=1
R2_UPLOAD_PART_SIZE=8388608
```

### FFmpeg co NVENC nhung fail

Dung FFmpeg system moi hon va tro ro:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```
