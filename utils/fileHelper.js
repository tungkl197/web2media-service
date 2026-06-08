/**
 * Web2Media Service — File Helper Utilities
 *
 * Provides functions for converting files and buffers to base64 data URIs,
 * used by the thumbnail generation feature.
 */

const fs = require('fs');
const path = require('path');

/**
 * MIME type mapping by extension.
 */
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Convert a local file to a base64 data URI.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {string} Base64 data URI string
 */
function fileToBase64Uri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/png';
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert raw bytes (Buffer) to a base64 data URI.
 *
 * @param {Buffer} buffer - Image data buffer
 * @param {string} [mimeType='image/jpeg'] - MIME type of the image
 * @returns {string} Base64 data URI string
 */
function bufferToBase64Uri(buffer, mimeType = 'image/jpeg') {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

module.exports = { fileToBase64Uri, bufferToBase64Uri };
