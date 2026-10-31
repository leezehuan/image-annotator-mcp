// Rebuild the README samples through the project's actual MCP interface.
// Downloaded source images and their licenses are recorded in SOURCES.md.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createServer } = require('../server.js');

const samples = [
  {
    name: 'circuit', source: 'voltage-divider.svg', fit: 'contain',
    annotations: [
      { type: 'rect', x: 365, y: 108, width: 66, height: 164, color: 'orange', strokeWidth: 3 },
      { type: 'label', x: 70, y: 170, text: '上臂电阻 R1', fontSize: 26, color: 'orange', background: 'white', shadow: false },
      { type: 'arrow', from: [240, 170], to: [363, 185], color: 'orange', strokeWidth: 3, shadow: false },
      { type: 'rect', x: 365, y: 392, width: 66, height: 164, color: 'teal', strokeWidth: 3 },
      { type: 'label', x: 70, y: 490, text: '下臂电阻 R2', fontSize: 26, color: 'teal', background: 'white', shadow: false },
      { type: 'arrow', from: [240, 480], to: [363, 480], color: 'teal', strokeWidth: 3, shadow: false },
      { type: 'circle', x: 565, y: 334, radius: 24, color: 'blue', strokeWidth: 3 },
      { type: 'label', x: 650, y: 245, text: '分压输出', fontSize: 26, color: 'blue', background: 'white', shadow: false },
      { type: 'arrow', from: [686, 270], to: [589, 321], color: 'blue', strokeWidth: 3 },
      { type: 'label', x: 525, y: 540, text: 'Vout = Vin × R2 / (R1 + R2)', fontSize: 22, color: 'darkGray', background: 'white', shadow: false }
    ]
  },
  {
    name: 'arduino', source: 'arduino-uno.jpg', fit: 'contain',
    annotations: [
      { type: 'rect', x: 148, y: 278, width: 156, height: 158, color: 'blue', strokeWidth: 3 },
      { type: 'marker', number: 1, target: [226, 353], offset: [-115, -120], color: 'blue', size: 24 },
      { type: 'label', x: 35, y: 195, text: 'USB 接口', fontSize: 24, color: 'blue', background: 'white', shadow: false },
      { type: 'circle', x: 558, y: 325, radius: 35, color: 'orange', strokeWidth: 3 },
      { type: 'marker', number: 2, target: [558, 325], offset: [200, -210], color: 'orange', size: 24 },
      { type: 'label', x: 690, y: 75, text: '主控芯片', fontSize: 24, color: 'orange', background: 'white', shadow: false },
      { type: 'rect', x: 320, y: 427, width: 130, height: 123, color: 'teal', strokeWidth: 3 },
      { type: 'marker', number: 3, target: [385, 485], offset: [195, 85], color: 'teal', size: 24 },
      { type: 'label', x: 632, y: 580, text: '直流电源接口', fontSize: 24, color: 'teal', background: 'white', shadow: false }
    ]
  },
  {
    name: 'earthrise', source: 'earthrise.jpg', fit: 'cover',
    annotations: [
      { type: 'spotlight', target: [510, 339], width: 190, height: 160, shape: 'ellipse', dim: 0.22, feather: 12 },
      { type: 'label', x: 50, y: 75, text: 'Apollo 8 · Earthrise', fontSize: 20, color: '#b7c9de', background: '#101826', shadow: false },
      { type: 'circle', x: 510, y: 339, radius: 79, color: 'cyan', strokeWidth: 3 },
      { type: 'label', x: 115, y: 235, text: '地球', fontSize: 30, color: 'cyan', background: '#152439', shadow: false },
      { type: 'arrow', from: [230, 250], to: [430, 316], color: 'cyan', strokeWidth: 3 },
      { type: 'label', x: 640, y: 475, text: '月球地平线', fontSize: 24, color: 'white', background: '#152439', shadow: false },
      { type: 'arrow', from: [702, 496], to: [697, 608], color: 'cyan', strokeWidth: 3, shadow: false }
    ]
  }
];

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'image-annotator-gallery-'));
  const inputs = [];
  const server = createServer();
  const client = new Client({ name: 'readme-gallery', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await fs.mkdir(path.join(__dirname, 'gallery'), { recursive: true });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    for (const sample of samples) {
      const input = path.join(temporary, `${sample.name}.png`);
      inputs.push(input);
      await sharp(path.join(__dirname, 'sources', sample.source))
        .resize({ width: 900, height: 650, fit: sample.fit, background: '#f8fafc' })
        .flatten({ background: '#f8fafc' }).png().toFile(input);
      const output = path.join(__dirname, 'gallery', `${sample.name}.webp`);
      const result = await client.callTool({
        name: 'annotate_screenshot',
        arguments: {
          input_path: input, output_path: output, annotations: sample.annotations,
          scale: 1, format: 'webp', quality: 90
        }
      });
      if (result.isError) throw new Error(result.content[0].text);
      const metadata = await sharp(output).metadata();
      const { size } = await fs.stat(output);
      console.log(`${sample.name}: ${metadata.width}×${metadata.height}, ${size} bytes, ${sample.annotations.length} annotations (MCP)`);
    }
  } finally {
    await client.close();
    await server.close();
    for (const input of inputs) await fs.unlink(input).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(temporary);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
