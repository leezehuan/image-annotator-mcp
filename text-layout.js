const sharp = require('sharp');

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

// The synchronous SVG builder can be used on its own, without a rendering pass.
// Keep its fallback conservative instead of assuming every character is 0.6 em.
function estimateTextBounds(lines, fontSize, lineHeight) {
  return {
    left: 0,
    top: -fontSize,
    width: Math.max(0, ...lines.map((line) => line.length * fontSize)),
    height: Math.max(fontSize * 1.3, (lines.length - 1) * lineHeight + fontSize * 1.3)
  };
}

async function measureTextBounds({ lines, fontSize, fontFamily, fontWeight, lineHeight }) {
  if (fontSize <= 0 || lines.every((line) => line.trim() === '')) {
    return estimateTextBounds(lines, fontSize, lineHeight);
  }

  const gutter = Math.ceil(fontSize * 2 + 4);
  const baseline = gutter + Math.ceil(fontSize * 2);
  const width = Math.ceil(Math.max(...lines.map((line) => line.length)) * fontSize * 2 + gutter * 2);
  const height = Math.ceil(gutter * 2 + fontSize * 2 + (lines.length - 1) * lineHeight);
  const spans = lines.map((line, index) =>
    `<tspan x="${gutter}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('');
  // Measure with the same SVG renderer and font stack used for compositing.
  // Trimming transparent pixels gives actual bearings, ascenders, and descenders.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="${gutter}" y="${baseline}" font-family="${escapeXml(fontFamily)}"
      font-size="${fontSize}" font-weight="${escapeXml(fontWeight)}" fill="white">${spans}</text>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .trim({ background: '#00000000', threshold: 0 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // A fully transparent render has no trim bounds (e.g. a zero-width space).
  // Sharp returns the original canvas in that case; it is not a text box.
  let hasInk = false;
  for (let offset = info.channels - 1; offset < data.length; offset += info.channels) {
    if (data[offset] > 0) {
      hasInk = true;
      break;
    }
  }
  if (!hasInk) return estimateTextBounds(lines, fontSize, lineHeight);

  // Trimming removes intentional blank lines at the edges of a callout.
  // Restore their line spacing while retaining measured glyph bearings.
  const leadingBlankLines = lines.findIndex((line) => line.trim() !== '');
  let trailingBlankLines = 0;
  for (let index = lines.length - 1; index >= 0 && lines[index].trim() === ''; index--) {
    trailingBlankLines++;
  }

  return {
    left: -info.trimOffsetLeft - gutter,
    top: -info.trimOffsetTop - baseline - leadingBlankLines * lineHeight,
    width: info.width,
    height: info.height + (leadingBlankLines + trailingBlankLines) * lineHeight
  };
}

module.exports = { estimateTextBounds, measureTextBounds };
