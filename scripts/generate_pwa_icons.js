const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// CRC32 table & implementation for valid PNG generation
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPng(width, height, getPixelRgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    scanlines[pos++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixelRgba(x, y, width, height);
      scanlines[pos++] = r;
      scanlines[pos++] = g;
      scanlines[pos++] = b;
      scanlines[pos++] = a;
    }
  }

  const compressedData = zlib.deflateSync(scanlines);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(4 + 4 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcValue = crc32(crcData);
  chunk.writeUInt32BE(crcValue, 8 + length);

  return chunk;
}

// Distance from point (px, py) to line segment (x1, y1) -> (x2, y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Draw OmniFin official icon: Emerald base (#1F7A5C) with white circle & dollar emblem
function omnifinPixel(x, y, width, height, cornerRadiusRatio = 0.22) {
  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height);

  // Background rounded rect
  const r = size * cornerRadiusRatio;
  const halfW = width / 2;
  const halfH = height / 2;
  const qx = Math.abs(x + 0.5 - halfW);
  const qy = Math.abs(y + 0.5 - halfH);

  let bgDist = 0;
  if (qx > halfW - r && qy > halfH - r) {
    bgDist = Math.hypot(qx - (halfW - r), qy - (halfH - r)) - r;
  } else {
    bgDist = Math.max(qx - halfW, qy - halfH);
  }

  if (bgDist > 0.5) {
    return [0, 0, 0, 0]; // transparent
  }

  // Smooth anti-aliased edge for background
  let bgAlpha = 255;
  if (bgDist > -0.5) {
    bgAlpha = Math.round(255 * (0.5 - bgDist));
  }

  // Base background color: OmniFin Brand Emerald (#1F7A5C -> rgb(31, 122, 92))
  // Subtle gradient: slightly brighter emerald on top, deeper at bottom
  const gradT = y / height;
  const bgR = Math.round(31 + (22 - 31) * gradT);
  const bgG = Math.round(135 + (110 - 135) * gradT);
  const bgB = Math.round(105 + (80 - 105) * gradT);

  // Emblem: Outer Ring
  const ringRadius = size * 0.32;
  const ringStroke = size * 0.055;
  const distFromCenter = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  const ringDist = Math.abs(distFromCenter - ringRadius) - ringStroke / 2;

  let emblemAlpha = 0;
  if (ringDist <= 0.5) {
    const a = ringDist <= -0.5 ? 1 : (0.5 - ringDist);
    emblemAlpha = Math.max(emblemAlpha, a);
  }

  // Emblem: Vertical Center Bar (M12 7v10)
  const barTopY = cy - size * 0.22;
  const barBotY = cy + size * 0.22;
  const barStroke = size * 0.055;
  const barDist = distToSegment(x + 0.5, y + 0.5, cx, barTopY, cx, barBotY) - barStroke / 2;
  if (barDist <= 0.5) {
    const a = barDist <= -0.5 ? 1 : (0.5 - barDist);
    emblemAlpha = Math.max(emblemAlpha, a);
  }

  // Emblem: S Curves (Top Loop and Bottom Loop)
  const topLoopCy = cy - size * 0.085;
  const topLoopR = size * 0.105;
  const distTopLoop = Math.hypot(x + 0.5 - cx, y + 0.5 - topLoopCy);
  if (x + 0.5 >= cx - ringStroke * 0.4) {
    const d = Math.abs(distTopLoop - topLoopR) - barStroke / 2;
    if (d <= 0.5 && y + 0.5 <= cy + ringStroke * 0.2) {
      const a = d <= -0.5 ? 1 : (0.5 - d);
      emblemAlpha = Math.max(emblemAlpha, a);
    }
  }

  const botLoopCy = cy + size * 0.085;
  const botLoopR = size * 0.105;
  const distBotLoop = Math.hypot(x + 0.5 - cx, y + 0.5 - botLoopCy);
  if (x + 0.5 <= cx + ringStroke * 0.4) {
    const d = Math.abs(distBotLoop - botLoopR) - barStroke / 2;
    if (d <= 0.5 && y + 0.5 >= cy - ringStroke * 0.2) {
      const a = d <= -0.5 ? 1 : (0.5 - d);
      emblemAlpha = Math.max(emblemAlpha, a);
    }
  }

  // Blend white emblem over emerald background
  const rOut = Math.round(bgR * (1 - emblemAlpha) + 255 * emblemAlpha);
  const gOut = Math.round(bgG * (1 - emblemAlpha) + 255 * emblemAlpha);
  const bOut = Math.round(bgB * (1 - emblemAlpha) + 255 * emblemAlpha);

  return [rOut, gOut, bOut, bgAlpha];
}

// Generate SVG string
function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="omniGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#238C69"/>
      <stop offset="100%" stop-color="#16654B"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#omniGrad)"/>
  <g fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" transform="translate(64, 64) scale(16)">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5" />
  </g>
</svg>`;
}

function generateFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="favGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#248A68"/>
      <stop offset="100%" stop-color="#145C44"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#favGrad)"/>
  <circle cx="16" cy="16" r="10" fill="none" stroke="#FFFFFF" stroke-width="2.6"/>
  <path d="M16 9.5v13M12.5 12.5c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3c0 2-3.5 2.5-3.5 4s1.6 2.5 3.5 2.5" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const iconsDir = path.join(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. icon.svg & favicon.svg
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), generateSvg(), 'utf-8');
console.log('Created icon.svg');

fs.writeFileSync(path.join(iconsDir, 'favicon.svg'), generateFaviconSvg(), 'utf-8');
console.log('Created favicon.svg');

// 2. PNG sizes (PWA, Apple Touch and Favicon PNGs)
const sizes = [
  { name: 'icon-192x192.png', size: 192, cornerRatio: 0.22 },
  { name: 'icon-512x512.png', size: 512, cornerRatio: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, cornerRatio: 0.22 },
  { name: 'apple-touch-icon-180x180.png', size: 180, cornerRatio: 0.22 },
  { name: 'apple-touch-icon-152x152.png', size: 152, cornerRatio: 0.22 },
  { name: 'apple-touch-icon-120x120.png', size: 120, cornerRatio: 0.22 },
  { name: 'favicon-32x32.png', size: 32, cornerRatio: 0.22 },
  { name: 'favicon-16x16.png', size: 16, cornerRatio: 0.22 }
];

for (const s of sizes) {
  const buf = createPng(s.size, s.size, (x, y, w, h) => omnifinPixel(x, y, w, h, s.cornerRatio));
  fs.writeFileSync(path.join(iconsDir, s.name), buf);
  console.log(`Created ${s.name} (${s.size}x${s.size})`);
}

console.log('All PWA, iOS and Favicon icons generated successfully!');
