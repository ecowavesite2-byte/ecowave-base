#!/usr/bin/env node
// Crop horizontal bands out of audit PNGs (orig | local | diff) for close-up review.
// Usage:
//   node scripts/audit/crop.mjs --key=newsroom --y=1280-1690 [--vp=desktop] [--pad=12] [--sides=orig,local,diff]
//   --y accepts a comma separated list of start-end ranges.
// Output: design/audit/crops/<vp>/<key>/<start>-<end>-<side>.png
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=');
      return [k, v.join('=')];
    }),
);

const vp = args.vp || args.viewport || 'desktop';
const key = args.key;
const pad = Number.parseInt(args.pad ?? '12', 10);
const sides = (args.sides || 'orig,local,diff').split(',').map((s) => s.trim());
const ranges = (args.y || '')
  .split(',')
  .map((r) => r.split('-').map(Number))
  .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

if (!key || ranges.length === 0) {
  console.error('need --key and --y=start-end[,start-end...]');
  process.exit(1);
}

const outRoot = args.out || 'design/audit/crops';

function sidePath(side) {
  return side === 'diff'
    ? `design/audit/diff/${vp}/${key}.png`
    : `design/audit/${side}/${vp}/${key}.png`;
}

for (const side of sides) {
  const srcPath = sidePath(side);
  if (!existsSync(srcPath)) {
    console.error(`missing ${srcPath}`);
    continue;
  }
  const src = PNG.sync.read(readFileSync(srcPath));
  for (const [r0, r1] of ranges) {
    const y0 = Math.max(0, r0 - pad);
    const y1 = Math.min(src.height, r1 + pad);
    const h = y1 - y0;
    if (h <= 0) {
      console.error(`empty range ${r0}-${r1} (srcH=${src.height}) for ${side} ${key}`);
      continue;
    }
    const out = new PNG({ width: src.width, height: h });
    for (let y = 0; y < h; y++) {
      const srcStart = (y0 + y) * src.width * 4;
      src.data.copy(out.data, y * src.width * 4, srcStart, srcStart + src.width * 4);
    }
    const dir = path.join(outRoot, vp, key);
    mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${r0}-${r1}-${side}.png`);
    writeFileSync(outPath, PNG.sync.write(out));
    console.log(`${outPath} srcH=${src.height} padded=${y0}-${y1}`);
  }
}
