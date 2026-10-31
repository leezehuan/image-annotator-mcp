const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../server.js');

async function main() {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'cherry-attachments-'));
  const originalFilesDirectory = process.env.CHERRY_STUDIO_FILES_DIR;
  process.env.CHERRY_STUDIO_FILES_DIR = fixture;
  const imageId = '11111111-2222-4333-8444-555555555555.png';
  const savedPaths = [];
  const client = new Client({ name: 'attachment-integration-test', version: '1.0.0' });
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    const original = await sharp({
      create: { width: 100, height: 60, channels: 3, background: '#ffffff' }
    }).png().toBuffer();
    await fs.writeFile(path.join(fixture, imageId), original);
    await fs.writeFile(path.join(fixture, 'ignore.pdf'), 'not an image');
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const listing = await client.callTool({ name: 'list_cherry_images', arguments: {} });
    assert.ok(!listing.isError, JSON.stringify(listing));
    const candidates = JSON.parse(listing.content[0].text);
    assert.equal(candidates.images.length, 1);
    assert.equal(candidates.images[0].id, imageId);
    assert.equal(candidates.images[0].width, 100);
    assert.equal(candidates.images[0].height, 60);
    assert.equal(listing.content.filter((part) => part.type === 'image').length, 1);
    process.stdout.write('PASS MCP lists Cherry cache images with previews without a supplied path\n');

    const saved = await client.callTool({
      name: 'save_attached_image', arguments: { cherry_image_id: imageId }
    });
    assert.ok(!saved.isError, JSON.stringify(saved));
    const image = JSON.parse(saved.content[0].text);
    savedPaths.push(image.path);
    assert.equal(path.dirname(image.path), path.resolve(__dirname, '..', '.image-annotator-tmp'));
    assert.deepEqual(await fs.readFile(image.path), original);

    const dimensions = await client.callTool({
      name: 'get_image_dimensions', arguments: { image_path: image.path }
    });
    assert.deepEqual(JSON.parse(dimensions.content[0].text), { width: 100, height: 60, format: 'png' });
    const outputPath = path.join(fixture, 'annotated.png');
    const annotated = await client.callTool({
      name: 'annotate_screenshot',
      arguments: {
        input_path: image.path,
        output_path: outputPath,
        scale: 1,
        annotations: [{ type: 'rect', x: 10, y: 10, width: 20, height: 20, color: 'red' }]
      }
    });
    assert.ok(!annotated.isError, JSON.stringify(annotated));
    const { data, info } = await sharp(outputPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 100);
    assert.equal(info.height, 60);
    const strokePixel = (10 * info.width + 20) * info.channels;
    assert.ok(data[strokePixel] > data[strokePixel + 1], 'rectangle must change white pixels to red');
    assert.deepEqual(await fs.readFile(path.join(fixture, imageId)), original, 'Cherry source stays intact');
    process.stdout.write('PASS MCP imports a cache ID and annotates it without Base64 or a supplied path\n');

    for (const arguments_ of [
      { cherry_image_id: `../${imageId}` },
      { cherry_image_id: `..\\${imageId}` },
      { cherry_image_id: '00000000-0000-4000-8000-000000000000.png' },
      { cherry_image_id: imageId, image_data: original.toString('base64') },
      {}
    ]) {
      const invalid = await client.callTool({ name: 'save_attached_image', arguments: arguments_ });
      assert.equal(invalid.isError, true, JSON.stringify(arguments_));
    }
    process.stdout.write('PASS MCP rejects traversal, missing IDs, and ambiguous or absent image sources\n');

    const newerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';
    const corruptId = 'ffffffff-ffff-4fff-8fff-ffffffffffff.png';
    await fs.writeFile(path.join(fixture, newerId), original);
    const future = new Date(Date.now() + 10000);
    await fs.utimes(path.join(fixture, newerId), future, future);
    await fs.writeFile(path.join(fixture, corruptId), 'corrupt image');
    const firstPage = await client.callTool({
      name: 'list_cherry_images', arguments: { limit: 1, include_previews: false }
    });
    const first = JSON.parse(firstPage.content[0].text);
    assert.equal(first.images[0].id, newerId);
    assert.equal(firstPage.content.length, 1);
    assert.ok(first.next_offset !== null);
    const secondPage = await client.callTool({
      name: 'list_cherry_images', arguments: { offset: first.next_offset, include_previews: false }
    });
    const second = JSON.parse(secondPage.content[0].text);
    assert.equal(second.images.length, 1);
    assert.equal(second.images[0].id, imageId);
    assert.equal(second.next_offset, null);
    process.stdout.write('PASS MCP pages older images and skips corrupt cache files\n');

    const orientedId = '12345678-1234-4234-8234-123456789012.jpg';
    const oriented = await sharp({
      create: { width: 120, height: 60, channels: 3, background: '#ffffff' }
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    await fs.writeFile(path.join(fixture, orientedId), oriented);
    const latest = new Date(Date.now() + 20000);
    await fs.utimes(path.join(fixture, orientedId), latest, latest);
    const orientedPage = await client.callTool({ name: 'list_cherry_images', arguments: { limit: 1 } });
    const orientedRecord = JSON.parse(orientedPage.content[0].text).images[0];
    assert.equal(orientedRecord.id, orientedId);
    const orientedPreview = orientedPage.content.find((part) => part.type === 'image');
    const previewMetadata = await sharp(Buffer.from(orientedPreview.data, 'base64')).metadata();
    assert.equal(previewMetadata.width, orientedRecord.width);
    assert.equal(previewMetadata.height, orientedRecord.height);
    process.stdout.write('PASS MCP preview pixel direction matches the annotation canvas for EXIF images\n');
  } finally {
    await client.close();
    await server.close();
    if (originalFilesDirectory === undefined) delete process.env.CHERRY_STUDIO_FILES_DIR;
    else process.env.CHERRY_STUDIO_FILES_DIR = originalFilesDirectory;
    for (const savedPath of savedPaths) await fs.rm(savedPath, { force: true });
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
