// Generates public/icons/icon-192.png and icon-512.png with no dependencies.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Scene: rounded dark tile, teal ring (clock face), two hands, a small accent dot.
function scene(size) {
  const bg = [15, 18, 22];
  const teal = [45, 212, 191];
  const white = [244, 246, 248];
  const cx = size / 2, cy = size / 2;
  const R = size * 0.30;
  const ring = size * 0.055;
  const hand = size * 0.05;
  const radius = size * 0.22;

  const sdRoundRect = (x, y) => {
    const hx = size / 2 - radius, hy = size / 2 - radius;
    const dx = Math.abs(x - cx) - hx, dy = Math.abs(y - cy) - hy;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
  };
  const sdSegment = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax, aby = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
  };
  const cover = (d) => Math.max(0, Math.min(1, 0.5 - d)); // 1px anti-alias
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const tile = cover(sdRoundRect(px, py));
    if (tile <= 0) return [0, 0, 0, 0];
    let col = bg;
    const dist = Math.hypot(px - cx, py - cy);
    const ringCov = cover(Math.abs(dist - R) - ring / 2);
    col = mix(col, teal, ringCov);
    // hands: hour hand to 10 o'clock, minute hand to 2 o'clock ("punch in" time)
    const h = sdSegment(px, py, cx, cy, cx - R * 0.42, cy - R * 0.30);
    const m = sdSegment(px, py, cx, cy, cx + R * 0.48, cy - R * 0.60);
    col = mix(col, white, cover(h - hand / 2));
    col = mix(col, white, cover(m - hand / 2));
    const dot = cover(dist - hand * 0.75);
    col = mix(col, teal, dot);
    return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), Math.round(255 * tile)];
  };
}

for (const size of [192, 512]) {
  const out = resolve(here, `../public/icons/icon-${size}.png`);
  writeFileSync(out, png(size, scene(size)));
  console.log('wrote', out);
}
