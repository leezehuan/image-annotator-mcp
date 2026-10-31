const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createServer } = require('../server.js');

function request(url, { route, method = 'GET', host } = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port, path: route || parsed.pathname,
      method, agent: false, headers: host ? { Host: host } : {}
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'image-urls-'));
  const inputPath = path.join(fixture, 'source.png');
  const outputPath = path.join(fixture, 'result.png');
  const server = createServer();
  const client = new Client({ name: 'image-url-test', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const originalNow = Date.now;
  try {
    await sharp({ create: { width: 120, height: 80, channels: 3, background: 'white' } }).png().toFile(inputPath);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    async function generate(output, annotations = []) {
      const result = await client.callTool({
        name: 'annotate_screenshot', arguments: { input_path: inputPath, output_path: output, annotations }
      });
      assert.ok(!result.isError, JSON.stringify(result));
      const url = result.content[0].text.match(/Image URL: (http:\/\/127\.0\.0\.1:\d+\/images\/[^\s]+)/)?.[1];
      assert.ok(url, 'must return a local HTTP URL');
      return { url, bytes: Buffer.from(result.content.find((part) => part.type === 'image').data, 'base64') };
    }

    const [first, parallel] = await Promise.all([
      generate(outputPath), generate(path.join(fixture, 'second.png'))
    ]);
    assert.equal(new URL(first.url).origin, new URL(parallel.url).origin, 'concurrent first outputs share one listener');
    assert.notEqual(first.url, parallel.url);
    assert.deepEqual((await request(parallel.url)).bytes, parallel.bytes);
    process.stdout.write('PASS concurrent generations share one loopback listener and unique URLs\n');

    const head = await request(first.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers['content-length']), first.bytes.length);
    assert.equal(head.headers['content-type'], 'image/png');
    assert.equal(head.bytes.length, 0);
    assert.equal(head.headers['cache-control'], 'no-store');
    assert.equal(head.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(head.headers['access-control-allow-origin'], '*');
    process.stdout.write('PASS image URLs support HEAD and cross-origin image rendering\n');

    for (const route of ['/', '/server.js', '/images/unknown.png', '/images/../../package.json', '/images/%2e%2e%2fpackage.json']) {
      const denied = await request(first.url, { route });
      assert.equal(denied.status, 404, route);
      assert.equal(denied.bytes.length, 0);
    }
    assert.equal((await request(first.url, { method: 'POST' })).status, 405);
    assert.equal((await request(first.url, { host: 'unrelated.example' })).status, 403);
    process.stdout.write('PASS URL service rejects arbitrary files, traversal, writes, and alternate Host names\n');

    const replacement = await generate(outputPath, [{ type: 'rect', x: 10, y: 10, width: 20, height: 20, color: 'red' }]);
    assert.notDeepEqual(replacement.bytes, first.bytes);
    assert.notEqual(replacement.url, first.url);
    assert.deepEqual((await request(first.url)).bytes, first.bytes, 'old URLs retain the original output snapshot');
    await fs.unlink(outputPath);
    assert.deepEqual((await request(replacement.url)).bytes, replacement.bytes, 'URL snapshot survives source output removal');
    process.stdout.write('PASS earlier image URLs stay stable when outputs are overwritten or removed\n');

    Date.now = () => originalNow() + 24 * 60 * 60 * 1000 + 1000;
    assert.equal((await request(first.url)).status, 404);
    Date.now = originalNow;
    process.stdout.write('PASS image URLs expire after 24 hours\n');

    await server.close();
    await assert.rejects(request(replacement.url), (error) => error.code === 'ECONNREFUSED');
    process.stdout.write('PASS closing the MCP connection stops its HTTP listener\n');

    const stdioClient = new Client({ name: 'image-url-stdio-test', version: '1.0' });
    const stdioTransport = new StdioClientTransport({
      command: process.execPath, args: [path.resolve(__dirname, '..', 'server.js')], stderr: 'pipe'
    });
    let errors = '';
    stdioTransport.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    try {
      await stdioClient.connect(stdioTransport);
      const result = await stdioClient.callTool({
        name: 'annotate_screenshot', arguments: { input_path: inputPath, output_path: outputPath, annotations: [] }
      });
      assert.ok(!result.isError, JSON.stringify(result));
      const url = result.content[0].text.match(/Image URL: (http:\/\/127\.0\.0\.1:\d+\/images\/[^\s]+)/)?.[1];
      assert.ok(url, errors);
      assert.deepEqual((await request(url)).bytes, Buffer.from(result.content.find((part) => part.type === 'image').data, 'base64'));
      await stdioClient.close();
      await assert.rejects(request(url), (error) => error.code === 'ECONNREFUSED');
      process.stdout.write('PASS real stdio process serves image URLs and exits on client disconnect\n');
    } finally {
      await stdioClient.close();
    }
  } finally {
    Date.now = originalNow;
    await client.close();
    await server.close();
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
