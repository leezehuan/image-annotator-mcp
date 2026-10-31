const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const {
  MAX_ATTACHMENT_BYTES,
  cleanupExpiredAttachments,
  saveAttachedImage
} = require('../attachment.js');

async function createPngBuffer() {
  return sharp({
    create: {
      width: 2,
      height: 1,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).png().toBuffer();
}

async function savesDataUrlAndReturnsReusableImageRecord() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-annotator-test-'));
  const imageBuffer = await createPngBuffer();

  try {
    const image = await saveAttachedImage({
      image_data: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      filename: '../quoted photo.png',
      directory
    });

    assert.equal(image.width, 2);
    assert.equal(image.height, 1);
    assert.equal(image.format, 'png');
    assert.equal(image.bytes, imageBuffer.length);
    assert.equal(path.dirname(image.path), directory);
    assert.match(path.basename(image.path), /^quoted_photo-[a-f0-9-]+\.png$/);
    assert.deepEqual(await fs.promises.readFile(image.path), imageBuffer);

    const secondImage = await saveAttachedImage({
      image_data: imageBuffer.toString('base64'),
      filename: 'another-name.jpg',
      directory
    });

    assert.notEqual(secondImage.path, image.path);
    assert.match(secondImage.path, /another-name-[a-f0-9-]+\.png$/);
    assert.ok(Date.parse(secondImage.expires_at) > Date.now());
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function rejectsNonImagesAndOversizedPayloads() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-annotator-test-'));

  try {
    await assert.rejects(
      saveAttachedImage({ image_data: Buffer.from('not an image').toString('base64'), directory }),
      /not a supported image/
    );

    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0);
    await assert.rejects(
      saveAttachedImage({ image_data: oversized.toString('base64'), directory }),
      /exceeds the 20 MB limit/
    );
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function removesOnlyExpiredAttachments() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-annotator-test-'));
  const expired = path.join(directory, 'expired.png');
  const current = path.join(directory, 'current.png');

  try {
    await fs.promises.writeFile(expired, 'expired');
    await fs.promises.writeFile(current, 'current');
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.promises.utimes(expired, oldTime, oldTime);

    const removed = await cleanupExpiredAttachments(directory);

    assert.equal(removed, 1);
    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(current), true);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const cases = [
    savesDataUrlAndReturnsReusableImageRecord,
    rejectsNonImagesAndOversizedPayloads,
    removesOnlyExpiredAttachments
  ];

  for (const run of cases) {
    await run();
    process.stdout.write(`PASS ${run.name}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
