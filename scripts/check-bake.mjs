// Validates the baked portrait asset: size, stride, point/kind counts, bounds. Exit 1 on failure.
import fs from 'node:fs';
const dir = process.argv[2] || 'public/assets';
const bin = fs.readFileSync(`${dir}/portrait-points.bin`), meta = JSON.parse(fs.readFileSync(`${dir}/portrait-meta.json`, 'utf8'));
const bad = [];
if (bin.length % 10) bad.push('size not a multiple of 10');
const n = bin.length / 10, dv = new DataView(bin.buffer, bin.byteOffset, bin.length), kinds = [0, 0, 0, 0];
let mn = 65535, mxv = 0;
for (let i = 0; i < n; i++) { for (let j = 0; j < 3; j++) { const v = dv.getUint16(i * 10 + j * 2, true); mn = Math.min(mn, v); mxv = Math.max(mxv, v); } kinds[Math.min(3, dv.getUint8(i * 10 + 9))]++; }
if (n !== 66000) bad.push(`expected 66000 points, got ${n}`);
if (n !== meta.count || bin.length !== meta.bytes) bad.push('meta.json does not match the binary');
if (!kinds[1] || !kinds[2]) bad.push('no spectacle rim/lens points baked (was --no-glasses used?)');
console.log({ points: n, bytes: bin.length, kinds: { surface: kinds[0], rim: kinds[1], lens: kinds[2] }, quantRange: [mn, mxv], label: meta.label });
if (bad.length) { console.error('FAIL:', bad.join('; ')); process.exit(1); }
console.log('Bake check OK');
