/**
 * Web2Media Service — Runtime Config Loader
 *
 * Reads deployment/runtime settings from Supabase `runtime_configs`.
 */

const { SERVER_CONFIG } = require('../config');

let cachedRuntimeConfig = null;
let cacheExpiresAt = 0;

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (!['{', '['].includes(trimmed[0])) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return value;
  }
}

function pickFirst(row, fields) {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
      return parseMaybeJson(row[field]);
    }
  }

  return undefined;
}

function normalizeFlatConfig(config) {
  const aliases = {
    endpoint: ['endpoint', 'r2_endpoint', 'R2_ENDPOINT'],
    accountId: ['accountId', 'account_id', 'r2_account_id', 'R2_ACCOUNT_ID'],
    accessKeyId: ['accessKeyId', 'access_key_id', 'r2_access_key_id', 'R2_ACCESS_KEY_ID'],
    secretAccessKey: ['secretAccessKey', 'secret_access_key', 'r2_secret_access_key', 'R2_SECRET_ACCESS_KEY'],
    bucket: ['bucket', 'r2_bucket', 'bucket_name', 'R2_BUCKET', 'R2_BUCKET_NAME'],
    key: ['key', 'r2_key', 'object_key', 'R2_KEY'],
    keyPrefix: ['keyPrefix', 'key_prefix', 'r2_key_prefix', 'R2_KEY_PREFIX'],
    publicBaseUrl: ['publicBaseUrl', 'public_base_url', 'public_domain', 'r2_public_base_url', 'r2_public_domain', 'R2_PUBLIC_BASE_URL', 'R2_PUBLIC_DOMAIN'],
    region: ['region', 'r2_region', 'R2_REGION'],
  };

  const normalized = {};
  for (const [target, keys] of Object.entries(aliases)) {
    const value = pickFirst(config, keys);
    if (value !== undefined) {
      normalized[target] = value;
    }
  }

  return normalized;
}

function getRowName(row) {
  const value = pickFirst(row, [
    'key',
    'name',
    'config_key',
    'config_name',
    'setting_key',
    'setting_name',
    'slug',
  ]);

  return typeof value === 'string' ? value : '';
}

function getRowValue(row) {
  return pickFirst(row, [
    'value',
    'config',
    'config_value',
    'json_value',
    'settings',
    'data',
    'metadata',
  ]);
}

function buildConfigFromRows(rows) {
  const merged = {};

  for (const row of rows) {
    const rowName = getRowName(row);
    const rowValue = getRowValue(row);

    if (rowName && rowValue !== undefined) {
      const lowerName = rowName.toLowerCase();

      if (['r2', 'r2_config', 'r2_upload', 'cloudflare_r2'].includes(lowerName) && typeof rowValue === 'object') {
        Object.assign(merged, rowValue);
        continue;
      }

      merged[rowName] = rowValue;
      continue;
    }

    Object.assign(merged, row);
  }

  if (merged.r2 && typeof merged.r2 === 'object') {
    Object.assign(merged, merged.r2);
  }

  return normalizeFlatConfig(merged);
}

function validateR2RuntimeConfig(r2Config) {
  const missing = [];

  if (!r2Config.endpoint && !r2Config.accountId) {
    missing.push('endpoint/accountId');
  }

  for (const field of ['accessKeyId', 'secretAccessKey', 'bucket', 'publicBaseUrl']) {
    if (!r2Config[field]) {
      missing.push(field);
    }
  }

  if (missing.length) {
    throw new Error(`Thiếu cấu hình R2 trong runtime_configs: ${missing.join(', ')}`);
  }

  return {
    region: 'auto',
    ...r2Config,
  };
}

async function fetchRuntimeConfigRows() {
  if (!SERVER_CONFIG.supabaseUrl || !SERVER_CONFIG.supabaseServiceRoleKey) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY');
  }

  const baseUrl = SERVER_CONFIG.supabaseUrl.replace(/\/+$/, '');
  const table = encodeURIComponent(SERVER_CONFIG.runtimeConfigsTable);
  const url = `${baseUrl}/rest/v1/${table}?select=*`;

  const response = await fetch(url, {
    headers: {
      apikey: SERVER_CONFIG.supabaseServiceRoleKey,
      Authorization: `Bearer ${SERVER_CONFIG.supabaseServiceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Không đọc được runtime_configs từ Supabase: HTTP ${response.status} ${detail}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('runtime_configs trả về dữ liệu không hợp lệ');
  }

  return data;
}

async function getRuntimeR2Config(options = {}) {
  const now = Date.now();
  const cacheTtlMs = options.cacheTtlMs ?? SERVER_CONFIG.runtimeConfigCacheTtlMs;

  if (!options.forceRefresh && cachedRuntimeConfig && now < cacheExpiresAt) {
    return cachedRuntimeConfig.r2;
  }

  const rows = await fetchRuntimeConfigRows();
  const r2 = validateR2RuntimeConfig(buildConfigFromRows(rows));

  cachedRuntimeConfig = { r2 };
  cacheExpiresAt = now + cacheTtlMs;

  return r2;
}

function clearRuntimeConfigCache() {
  cachedRuntimeConfig = null;
  cacheExpiresAt = 0;
}

module.exports = {
  buildConfigFromRows,
  clearRuntimeConfigCache,
  getRuntimeR2Config,
  validateR2RuntimeConfig,
};
