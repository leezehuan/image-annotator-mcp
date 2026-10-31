const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ATTACHMENT_DIRECTORY = path.join(__dirname, '.image-annotator-tmp');
const FORMAT_EXTENSIONS = {
  avif: '.avif',
  gif: '.gif',
  heic: '.heic',
  heif: '.heif',
  jpeg: '.jpg',
  jp2: '.jp2',
  png: '.png',
  svg: '.svg',
  tiff: '.tiff',
  webp: '.webp'
};

function decodeImageData(imageData) {
  if (typeof imageData !== 'string' || imageData.trim() === '') {
    throw new Error('image_data must be a non-empty Base64 string or data URL');
  }

  const value = imageData.trim();
  let payload = value;

  if (value.startsWith('data:')) {
    const match = /^data:[^;,]+;base64,(.*)$/s.exec(value);
    if (!match) {
      throw new Error('image_data data URL must use Base64 encoding');
    }
    payload = match[1];
  }

  payload = payload.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    throw new Error('image_data is not valid Base64');
  }

  const estimatedBytes = Math.floor(payload.length * 3 / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  if (estimatedBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error('image_data exceeds the 20 MB limit');
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    throw new Error('image_data is empty');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error('image_data exceeds the 20 MB limit');
  }

  return buffer;
}

function sanitizeStem(filename) {
  const suppliedName = typeof filename === 'string' ? filename.replace(/\\/g, '/') : '';
  const base = path.basename(suppliedName);
  const extension = path.extname(base);
  const stem = path.basename(base, extension)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/^[-_]+|[-_]+$/g, '');
  return (stem || 'attachment').slice(0, 80);
}

async function cleanupExpiredAttachments(directory = DEFAULT_ATTACHMENT_DIRECTORY, now = Date.now()) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  const cutoff = now - ATTACHMENT_RETENTION_MS;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directory, entry.name);
    const stats = await fs.promises.stat(filePath);
    if (stats.mtimeMs < cutoff) {
      await fs.promises.unlink(filePath);
      removed += 1;
    }
  }
  return removed;
}

async function saveAttachedImage({ image_data, filename, directory = DEFAULT_ATTACHMENT_DIRECTORY } = {}) {
  const buffer = decodeImageData(image_data);
  return saveImageBuffer(buffer, { filename, directory });
}

async function saveImageBuffer(buffer, { filename, directory = DEFAULT_ATTACHMENT_DIRECTORY } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Image data must be a non-empty buffer');
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Image exceeds the 20 MB limit');
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new Error('image_data is not a supported image');
  }

  if (!metadata.format || !metadata.width || !metadata.height) {
    throw new Error('image_data is not a supported image');
  }
  if (!Object.hasOwn(FORMAT_EXTENSIONS, metadata.format)) {
    throw new Error(`Unsupported image format: ${metadata.format}`);
  }

  try {
    await sharp(buffer).stats();
  } catch {
    throw new Error('image_data is not a supported image');
  }

  await fs.promises.mkdir(directory, { recursive: true });

  const extension = FORMAT_EXTENSIONS[metadata.format];
  const safeName = `${sanitizeStem(filename)}-${randomUUID()}${extension}`;
  const outputPath = path.resolve(directory, safeName);
  await fs.promises.writeFile(outputPath, buffer, { flag: 'wx' });

  return {
    path: outputPath,
    filename: safeName,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: buffer.length,
    expires_at: new Date(Date.now() + ATTACHMENT_RETENTION_MS).toISOString()
  };
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  cleanupExpiredAttachments,
  saveAttachedImage,
  saveImageBuffer
};
