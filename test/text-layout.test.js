const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../server.js');

function boundsOf(data, info, matches) {
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (!matches(data[offset], data[offset + 1], data[offset + 2])) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  assert.ok(right >= left && bottom >= top, 'expected visible pixels');
  return { left, top, right, bottom };
}

async function main() {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'text-layout-'));
  const inputPath = path.join(fixture, 'source.png');
  const server = createServer();
  const client = new Client({ name: 'text-layout-test', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await sharp({ create: { width: 400, height: 180, channels: 3, background: '#ffffff' } }).png().toFile(inputPath);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    async function render(annotation, options = {}) {
      const result = await client.callTool({
        name: 'annotate_screenshot',
        arguments: {
          input_path: inputPath,
          output_path: path.join(fixture, 'result.png'),
          scale: 1,
          ...options,
          annotations: [annotation]
        }
      });
      assert.ok(!result.isError, JSON.stringify(result));
      const image = result.content.find((part) => part.type === 'image');
      return sharp(Buffer.from(image.data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    }

    const cases = [
      { name: 'Chinese label', text: '双向稳压二极管' },
      { name: 'wide Latin label', text: 'WWWWWWW' },
      { name: 'narrow Latin label', text: 'iiiiiii' },
      { name: 'mixed label', text: '±U_Z 稳压 W/i' },
      { name: 'scaled Chinese label', text: '双向稳压二极管', options: { scale: 2 } },
      { name: 'default annotation scale', text: '稳压 Test', annotation: { scale: undefined } },
      { name: 'themed label', text: '稳压 Test', options: { theme: 'tutorial' }, fontSize: undefined },
      { name: 'XML characters', text: '<稳压 & "test">' }
    ];
    for (const example of cases) {
      const annotation = {
        type: 'label', x: 80, y: 100, text: example.text,
        fontSize: example.fontSize === undefined && example.options?.theme ? undefined : 20,
        color: '#ff0000', background: null, shadow: false,
        ...example.annotation
      };
      if (example.options?.theme) delete annotation.fontSize;
      const textImage = await render(annotation, example.options);
      const text = boundsOf(textImage.data, textImage.info, (r, g, b) => r > 200 && g < 80 && b < 80);
      const boxed = await render({ ...annotation, background: '#0000ff' }, example.options);
      const box = boundsOf(boxed.data, boxed.info, (r, g, b) => b > 200 && r < 80 && g < 80);
      const leftPadding = text.left - box.left;
      const rightPadding = box.right - text.right;
      const topPadding = text.top - box.top;
      const bottomPadding = box.bottom - text.bottom;
      assert.ok(leftPadding >= 7 && rightPadding >= 7, `${example.name}: text must fit within the box`);
      assert.ok(topPadding >= 7 && bottomPadding >= 7, `${example.name}: text must fit vertically`);
      assert.ok(Math.abs(leftPadding - rightPadding) <= 2, `${example.name}: horizontal padding must be balanced`);
      assert.ok(Math.abs(topPadding - bottomPadding) <= 2, `${example.name}: vertical padding must be balanced`);
      process.stdout.write(`PASS ${example.name} has balanced padding around actual glyphs\n`);
    }

    const invisible = await render({
      type: 'label', x: 80, y: 100, text: '\u200b', fontSize: 20,
      color: '#ff0000', background: '#0000ff', shadow: false
    });
    const invisibleBox = boundsOf(invisible.data, invisible.info, (r, g, b) => b > 200 && r < 80 && g < 80);
    assert.ok(invisibleBox.right - invisibleBox.left <= 40, 'invisible text must not use the measurement canvas as its width');
    assert.ok(invisibleBox.bottom - invisibleBox.top <= 50, 'invisible text must have a finite line-sized box');
    process.stdout.write('PASS invisible text does not create a canvas-sized background\n');

    const blankLineCallout = {
      type: 'callout', x: 80, y: 20, text: 'Test', fontSize: 20,
      color: '#ff0000', background: '#0000ff', shadow: false, pointer: 'none'
    };
    const singleLine = await render(blankLineCallout);
    const blankLines = await render({ ...blankLineCallout, text: '\nTest\n' });
    const singleBox = boundsOf(singleLine.data, singleLine.info, (r, g, b) => b > 200 && r < 80 && g < 80);
    const blankBox = boundsOf(blankLines.data, blankLines.info, (r, g, b) => b > 200 && r < 80 && g < 80);
    const extraHeight = (blankBox.bottom - blankBox.top) - (singleBox.bottom - singleBox.top);
    assert.ok(Math.abs(extraHeight - 60) <= 2, 'leading and trailing blank lines must keep their line spacing');
    process.stdout.write('PASS callouts preserve leading and trailing blank lines\n');

    const callout = await render({
      type: 'callout', x: 200, y: 160, text: '双向稳压二极管\n±U_Z = 5.1 V', fontSize: 20,
      color: '#ff0000', background: '#0000ff', shadow: false, pointer: 'bottom'
    });
    const glyphs = boundsOf(callout.data, callout.info, (r, g, b) => r < 120 && g < 120 && b < 120);
    const box = boundsOf(callout.data, callout.info, (r, g, b) => b > 200 && r < 80 && g < 80);
    assert.ok(glyphs.left >= box.left + 9 && glyphs.right <= box.right - 9);
    assert.ok(glyphs.top >= box.top + 9 && glyphs.bottom <= box.bottom - 9);
    assert.ok(Math.abs((glyphs.left - box.left) - (box.right - glyphs.right)) <= 2);
    process.stdout.write('PASS multiline Chinese callout contains and centers its text\n');
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
