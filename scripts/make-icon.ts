/**
 * The app icon, generated from the design system's own tokens.
 *
 *   npx tsx scripts/make-icon.ts
 *
 * Written as a script rather than committed as a binary blob nobody can edit:
 * the colours come from tokens.css, so the icon cannot drift away from the
 * palette the app uses, and changing the accent changes the icon.
 *
 * The mark is a "J" drawn as three rectangles — a vertical stem, the hook, and
 * the terminal. Zero radius, flush geometry, one accent: the same grammar as
 * every other surface in the app, at 1024px. A PNG is written by hand here
 * (zlib is in the standard library and a flat-colour image is a few hundred
 * lines of pixels) rather than adding an image dependency for one file.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SIZE = 1024;
// From src/renderer/src/design/tokens.css.
const BG: RGB = [0x16, 0x15, 0x14];
const ACCENT: RGB = [0xec, 0x30, 0x13];
const ACCENT_HI: RGB = [0xff, 0x97, 0x83];

type RGB = [number, number, number];

const px = new Uint8Array(SIZE * SIZE * 3);

function fill(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, y0); y < Math.min(SIZE, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(SIZE, x1); x++) {
      const i = (y * SIZE + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

/**
 * macOS expects the artwork inset inside the canvas — a full-bleed square
 * renders visibly larger than every other icon in the Dock.
 */
const PAD = Math.round(SIZE * 0.1);
const R = Math.round(SIZE * 0.22);

fill(0, 0, SIZE, SIZE, [0, 0, 0]);

// Rounded square, drawn by testing each pixel against the corner radii. Slower
// than a path fill and completely adequate for one 1024px image.
for (let y = PAD; y < SIZE - PAD; y++) {
  for (let x = PAD; x < SIZE - PAD; x++) {
    const dx = Math.min(x - (PAD + R), 0) || Math.max(x - (SIZE - PAD - R), 0);
    const dy = Math.min(y - (PAD + R), 0) || Math.max(y - (SIZE - PAD - R), 0);
    if (dx * dx + dy * dy > R * R) continue;
    const i = (y * SIZE + x) * 3;
    px[i] = BG[0];
    px[i + 1] = BG[1];
    px[i + 2] = BG[2];
  }
}

// The J.
//
// The first attempt made it as wide as it was tall, and with a full-width
// crossbar the stem, hook and bar closed into a box — it read as a square with
// a notch, not as a letter. A J needs to be markedly taller than it is wide,
// and the crossbar has to stop short of the hook so the counter stays open.
const STEM_W = Math.round(SIZE * 0.105);
const TOP = Math.round(SIZE * 0.21);
const BOTTOM = Math.round(SIZE * 0.72);
const RIGHT = Math.round(SIZE * 0.655);
const HOOK_LEFT = Math.round(SIZE * 0.37);

// Stem.
fill(RIGHT - STEM_W, TOP, RIGHT, BOTTOM, ACCENT);
// Hook along the baseline.
fill(HOOK_LEFT, BOTTOM - STEM_W, RIGHT, BOTTOM, ACCENT);
// The short up-tick that finishes the hook. One stem width, no more, or the
// letter closes into a U.
fill(HOOK_LEFT, BOTTOM - STEM_W * 2, HOOK_LEFT + STEM_W, BOTTOM - STEM_W, ACCENT);
// The serif bar, in the lighter accent. Stops well left of the stem's top so
// the shape stays open.
fill(Math.round(SIZE * 0.43), TOP, RIGHT, TOP + Math.round(SIZE * 0.032), ACCENT_HI);
// The baseline rule — the app's 2px rule, at icon scale.
fill(
  PAD + Math.round(SIZE * 0.09),
  Math.round(SIZE * 0.795),
  SIZE - PAD - Math.round(SIZE * 0.09),
  Math.round(SIZE * 0.807),
  ACCENT,
);

// ------------------------------------------------------------------- PNG

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return c ^ -1;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour
// 10..12 stay zero: deflate, no filter, no interlace.

// One filter byte per scanline; filter 0 (none) is fine for flat colour and
// keeps this readable.
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0;
  Buffer.from(px.buffer, y * SIZE * 3, SIZE * 3).copy(raw, y * (SIZE * 3 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// The icon is generated and gitignored, so on a fresh clone `build/` does not
// exist at all — git does not track empty directories. Without this, the first
// step of `npm run package` fails on a machine that has only ever cloned.
const dir = join(process.cwd(), "build");
mkdirSync(dir, { recursive: true });
const out = join(dir, "icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} — ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} kB`);
