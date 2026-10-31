const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const RETENTION_MS = 24 * 60 * 60 * 1000;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Each instance belongs to one MCP connection. Only published image snapshots
// are addressable; URL paths are opaque keys, never filesystem paths.
class ImageServer {
  constructor({ directory = path.join(__dirname, '.image-annotator-tmp') } = {}) {
    this.directory = directory;
    this.images = new Map();
    this.closed = false;
  }

  start() {
    if (this.closed) return Promise.reject(new Error('Image server is closed'));
    if (this.starting) return this.starting;
    this.server = http.createServer((request, response) => {
      this.respond(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    this.starting = new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.authority = `127.0.0.1:${this.server.address().port}`;
        this.server.unref();
        resolve();
      });
    });
    return this.starting;
  }

  async publish(buffer, mimeType) {
    const extension = EXTENSIONS[mimeType];
    if (!extension) throw new Error(`Unsupported preview format: ${mimeType}`);
    await this.start();
    if (this.closed) throw new Error('Image server is closed');
    const now = Date.now();
    for (const [key, image] of this.images) {
      if (image.expiresAt <= now) this.images.delete(key);
    }
    const token = randomBytes(24).toString('hex');
    const route = `/images/${token}.${extension}`;
    const filename = path.join(this.directory, `preview-${token}.${extension}`);
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(filename, buffer, { flag: 'wx' });
    if (this.closed) throw new Error('Image server is closed');
    this.images.set(route, { filename, mimeType, expiresAt: now + RETENTION_MS });
    return `http://${this.authority}${route}`;
  }

  async respond(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Reject alternate Host names even if they resolve to the loopback listener.
    if (request.headers.host !== this.authority) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const image = this.images.get(request.url);
    if (!image || image.expiresAt <= Date.now()) {
      this.images.delete(request.url);
      response.writeHead(404).end();
      return;
    }
    let buffer;
    try {
      buffer = await fs.readFile(image.filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.images.delete(request.url);
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': image.mimeType,
      'Content-Length': buffer.length,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    response.end(request.method === 'HEAD' ? undefined : buffer);
  }

  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.images.clear();
    this.closing = this.stopListener();
    return this.closing;
  }

  async stopListener() {
    if (this.starting) await this.starting.catch(() => {});
    if (this.server?.listening) {
      await new Promise((resolve) => {
        this.server.close(resolve);
        this.server.closeAllConnections?.();
      });
    }
  }
}

module.exports = { ImageServer };
