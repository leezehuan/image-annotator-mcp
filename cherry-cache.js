const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { MAX_ATTACHMENT_BYTES } = require('./attachment.js');

const IMAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpe?g|gif|bmp|webp)$/i;

function defaultUserDataDirectory() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CherryStudio');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'CherryStudio');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'CherryStudio');
}

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

async function resolveCherryFilesDirectory({
  filesDirectory = process.env.CHERRY_STUDIO_FILES_DIR,
  bootConfigPath = path.join(os.homedir(), '.cherrystudio', 'boot-config.json'),
  fallbackUserDataDirectory = defaultUserDataDirectory()
} = {}) {
  if (filesDirectory) {
    const resolved = path.resolve(filesDirectory);
    if (await isDirectory(resolved)) return resolved;
    throw new Error(`Cherry image cache not found: ${resolved}. CHERRY_STUDIO_FILES_DIR must point to Data/Files.`);
  }

  let config;
  try {
    config = JSON.parse(await fs.readFile(bootConfigPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Cannot read Cherry boot configuration. Set CHERRY_STUDIO_FILES_DIR to the active Data/Files directory.');
    }
  }

  const mapping = config?.['app.user_data_path'];
  if (mapping && typeof mapping === 'object') {
    const directories = [...new Set(Object.values(mapping)
      .filter((root) => typeof root === 'string' && root.length > 0)
      .map((root) => path.resolve(root, 'Data', 'Files')))];
    const existing = [];
    for (const directory of directories) {
      if (await isDirectory(directory)) existing.push(directory);
    }
    if (existing.length === 1) return existing[0];
    if (directories.length > 0) {
      throw new Error('Cherry has multiple data directories or its configured cache is unavailable. Set CHERRY_STUDIO_FILES_DIR to the active Data/Files directory.');
    }
  }

  const fallback = path.resolve(fallbackUserDataDirectory, 'Data', 'Files');
  if (await isDirectory(fallback)) return fallback;
  throw new Error(`Cherry image cache not found: ${fallback}. Set CHERRY_STUDIO_FILES_DIR to the active Data/Files directory.`);
}

async function readImage(directory, imageId) {
  if (typeof imageId !== 'string' || !IMAGE_ID.test(imageId)) {
    throw new Error('cherry_image_id must be an image ID returned by list_cherry_images, including its extension');
  }
  const sourcePath = path.join(directory, imageId);
  let stats;
  try {
    stats = await fs.lstat(sourcePath);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Cherry image no longer exists. Call list_cherry_images again.');
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Cherry image must be a regular file inside the cache');
  }
  if (stats.size > MAX_ATTACHMENT_BYTES) throw new Error('Cherry image exceeds the 20 MB limit');

  const buffer = await fs.readFile(sourcePath);
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Cherry image exceeds the 20 MB limit');
  return { buffer, modified_at: stats.mtime.toISOString() };
}

async function readCherryImage(imageId) {
  return readImage(await resolveCherryFilesDirectory(), imageId);
}

async function listCherryImages({ limit = 5, offset = 0, include_previews = true } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('limit must be an integer from 1 to 10');
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer');
  if (typeof include_previews !== 'boolean') throw new Error('include_previews must be a boolean');

  const directory = await resolveCherryFilesDirectory();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_ID.test(entry.name)) continue;
    try {
      const stats = await fs.lstat(path.join(directory, entry.name));
      if (stats.isFile() && !stats.isSymbolicLink() && stats.size <= MAX_ATTACHMENT_BYTES) {
        candidates.push({ id: entry.name, modified: stats.mtimeMs });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  candidates.sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));

  const images = [];
  const previews = [];
  let cursor = Math.min(offset, candidates.length);
  while (cursor < candidates.length && images.length < limit) {
    const { id } = candidates[cursor++];
    try {
      const { buffer, modified_at } = await readImage(directory, id);
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) continue;
      const preview = include_previews
        ? await sharp(buffer).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
        : null;
      images.push({ id, width: metadata.width, height: metadata.height, format: metadata.format, bytes: buffer.length, modified_at });
      if (preview) previews.push({ id, data: preview.toString('base64'), mimeType: 'image/png' });
    } catch (error) {
      // Files may be deleted by Cherry, or may be images unsupported by this sharp build.
      if (error.code === 'EACCES' || error.code === 'EPERM') throw error;
    }
  }

  return {
    cache_directory: directory,
    images,
    next_offset: cursor < candidates.length ? cursor : null,
    note: 'This cache includes images from all Cherry chats. Match previews to the user image; do not assume the newest is the current attachment.',
    previews
  };
}

module.exports = { listCherryImages, readCherryImage, resolveCherryFilesDirectory };
