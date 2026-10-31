const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../server.js');

async function main() {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'image-results-'));
  const inputPath = path.join(fixture, 'source.png');
  const server = createServer();
  const client = new Client({ name: 'image-result-test', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await sharp({
      create: { width: 240, height: 160, channels: 3, background: '#ffffff' }
    }).png().toFile(inputPath);
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const cases = [
      { name: 'create_step_guide', arguments: { steps: [{ x: 40, y: 40, label: 'Target' }] } },
      { name: 'highlight_area', arguments: { shape: 'rect', x: 30, y: 30, width: 20 } },
      { name: 'add_callout', arguments: { x: 40, y: 40, text: 'Target' } },
      { name: 'blur_area', arguments: { x: 30, y: 30, width: 20, height: 20 } },
      { name: 'frame_screenshot', arguments: { format: 'jpeg' } },
      { name: 'annotate_screenshot', arguments: { annotations: [], format: 'webp' } }
    ];

    for (const example of cases) {
      // Use a .png name even for JPEG/WebP: the content type must follow actual bytes.
      const outputPath = path.join(fixture, `${example.name}.png`);
      const result = await client.callTool({
        name: example.name,
        arguments: { input_path: inputPath, output_path: outputPath, ...example.arguments }
      });
      assert.ok(!result.isError, JSON.stringify(result));
      const image = result.content.find((part) => part.type === 'image');
      assert.ok(image, `${example.name} must return an image for the client to display`);
      const expectedFormat = example.arguments.format || 'png';
      assert.equal(image.mimeType, `image/${expectedFormat}`);
      const bytes = Buffer.from(image.data, 'base64');
      assert.deepEqual(bytes, await fs.readFile(outputPath));
      assert.equal((await sharp(bytes).metadata()).format, expectedFormat);
      assert.ok(result.content[0].text.includes(outputPath), 'saved path remains available');
      const url = result.content[0].text.match(/Image URL: (http:\/\/127\.0\.0\.1:\d+\/images\/[^\s]+)/)?.[1];
      assert.ok(url, `${example.name} must return a local image URL`);
      assert.ok(result.content[0].text.includes(`![Annotated image](${url})`), 'result includes Markdown to embed unchanged');
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), image.mimeType);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      process.stdout.write(`PASS ${example.name} returns ${expectedFormat} image data and a working HTTP image URL\n`);
    }
  } finally {
    await client.close();
    await server.close();
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
