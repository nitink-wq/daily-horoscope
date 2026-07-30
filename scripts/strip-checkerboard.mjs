// Remove the baked-in transparency checkerboard from AI-generated icon PNGs
// (image generators often export the checker pattern as real pixels, no
// alpha): flood fill from the image borders over near-neutral light pixels
// (the two checker greys), leaving enclosed whites inside the artwork
// untouched. Then crop to the artwork bbox, pad to a centered square, and
// write out. Downscale afterwards with sips/any resizer.
//
//   npm i -D pngjs   (one-off; pure JS, no build step)
//   node scripts/strip-checkerboard.mjs in.png public/icons/out.png
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const [src, dst] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(src));
const { width: W, height: H, data } = png;

const isChecker = (i) => {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mn > 200 && mx - mn < 20; // light and near-neutral
};

// BFS flood fill from every border pixel
const visited = new Uint8Array(W * H);
const queue = [];
for (let x = 0; x < W; x++) { queue.push(x, 0, x, H - 1); }
for (let y = 0; y < H; y++) { queue.push(0, y, W - 1, y); }
const pending = [];
for (let i = 0; i < queue.length; i += 2) pending.push([queue[i], queue[i + 1]]);
while (pending.length) {
  const [x, y] = pending.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (visited[p]) continue;
  visited[p] = 1;
  if (!isChecker(p * 4)) continue;
  data[p * 4 + 3] = 0; // transparent
  pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Soften the cut edge: any opaque pixel bordering transparency that is still
// checker-like gets partial alpha so no grey fringe survives downscaling.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (data[p * 4 + 3] === 0) continue;
    const nearClear =
      data[(p - 1) * 4 + 3] === 0 || data[(p + 1) * 4 + 3] === 0 ||
      data[(p - W) * 4 + 3] === 0 || data[(p + W) * 4 + 3] === 0;
    if (nearClear && isChecker(p * 4)) data[p * 4 + 3] = 90;
  }
}

// bbox of remaining artwork
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
const side = Math.ceil(Math.max(bw, bh) * 1.06); // ~3% pad each side
const out = new PNG({ width: side, height: side });
const ox = Math.floor((side - bw) / 2), oy = Math.floor((side - bh) / 2);
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const s = ((y0 + y) * W + (x0 + x)) * 4;
    const d = ((oy + y) * side + (ox + x)) * 4;
    data.copy(out.data, d, s, s + 4);
  }
}
writeFileSync(dst, PNG.sync.write(out));
console.log(`${src} -> ${dst} (${W}x${H} -> ${side}x${side}, bbox ${bw}x${bh})`);
