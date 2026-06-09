/**
 * Web2Media Service — Cloudflare R2 Upload Service
 */

const fs = require('fs');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { SERVER_CONFIG } = require('../config');

function normalizeEndpoint(r2Config) {
  if (r2Config.endpoint) {
    return r2Config.endpoint.replace(/\/+$/, '');
  }

  if (r2Config.accountId) {
    return `https://${r2Config.accountId}.r2.cloudflarestorage.com`;
  }

  return null;
}

function normalizeKey(key) {
  return key
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function buildR2Key(r2Config, filename) {
  if (r2Config.key) {
    return normalizeKey(r2Config.key);
  }

  const normalizedPrefix = r2Config.keyPrefix ? normalizeKey(r2Config.keyPrefix) : '';
  const prefix = normalizedPrefix ? `${normalizedPrefix.replace(/\/?$/, '/')}` : '';

  return `${prefix}${filename}`;
}

function buildPublicUrl(r2Config, key) {
  if (!r2Config.publicBaseUrl) {
    return null;
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${r2Config.publicBaseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}

async function uploadFileToR2(filePath, r2Config, options = {}) {
  const endpoint = normalizeEndpoint(r2Config);
  if (!endpoint) {
    throw new Error('Thiếu endpoint hoặc accountId trong cấu hình R2 runtime_configs');
  }

  const filename = options.filename || path.basename(filePath);
  const key = buildR2Key(r2Config, filename);
  const contentType = options.contentType || 'application/octet-stream';
  const fileSize = fs.statSync(filePath).size;

  const client = new S3Client({
    region: r2Config.region || 'auto',
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });

  console.log(`[R2] Uploading ${filePath} -> ${r2Config.bucket}/${key}`);

  const partSize = r2Config.partSize || SERVER_CONFIG.r2UploadPartSize;
  const queueSize = r2Config.queueSize || SERVER_CONFIG.r2UploadQueueSize;

  const upload = new Upload({
    client,
    queueSize,
    partSize,
    leavePartsOnError: false,
    params: {
      Bucket: r2Config.bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: fileSize,
      ContentType: contentType,
    },
  });

  upload.on('httpUploadProgress', (progress) => {
    if (!progress.loaded || !progress.total) {
      return;
    }

    const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
    console.log(`[R2] Upload progress: ${percent}% (${progress.loaded}/${progress.total} bytes)`);
  });

  const response = await upload.done();

  console.log(`[R2] Upload complete: ${r2Config.bucket}/${key}`);

  return {
    bucket: r2Config.bucket,
    key,
    size: fileSize,
    contentType,
    etag: response.ETag,
    url: buildPublicUrl(r2Config, key),
  };
}

module.exports = {
  uploadFileToR2,
};
