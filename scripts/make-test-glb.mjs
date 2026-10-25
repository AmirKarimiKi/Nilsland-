// Writes test/test-bust.glb: a PRIMITIVE test fixture (ellipsoid head + neck + shoulders).
// It is NOT the portrait. It only exists to exercise `npm run bake` and the renderer end to end.
import fs from 'node:fs';
const pos = [], nor = [], idx = [];
function ellipsoid(cx, cy, cz, rx, ry, rz, seg = 64, rings = 48, yMin = -1, yMax = 1) {
  const base = pos.length / 3;
  for (let r = 0; r <= rings; r++) {
    const v = yMin + (yMax - yMin) * r / rings, ring = Math.sqrt(Math.max(0, 1 - v * v));
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * Math.PI * 2, x = Math.cos(a) * ring, z = Math.sin(a) * ring;
      pos.push(cx + x * rx, cy + v * ry, cz + z * rz);
      const nx = x / rx, ny = v / ry, nz = z / rz, l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const i = base + r * (seg + 1) + s, j = i + seg + 1; idx.push(i, j, i + 1, i + 1, j, j + 1); }
}
ellipsoid(0, 0.55, 0, 0.42, 0.55, 0.46);                  // head
ellipsoid(0, -0.15, -0.02, 0.2, 0.32, 0.2);               // neck
ellipsoid(0, -0.78, -0.02, 0.82, 0.42, 0.42, 64, 24, 0, 1); // shoulders
const pb = Buffer.from(new Float32Array(pos).buffer), nb = Buffer.from(new Float32Array(nor).buffer), ib = Buffer.from(new Uint32Array(idx).buffer);
const bin = Buffer.concat([pb, nb, ib]);
const json = { asset: { version: '2.0', generator: 'make-test-glb (primitive fixture)' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pb.length }, { buffer: 0, byteOffset: pb.length, byteLength: nb.length }, { buffer: 0, byteOffset: pb.length + nb.length, byteLength: ib.length }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-0.82, -1.2, -0.46], max: [0.82, 1.1, 0.46] },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' }] };
let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
const total = 12 + 8 + js.length + 8 + bin.length, h = Buffer.alloc(12); h.write('glTF'); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
fs.mkdirSync('test', { recursive: true });
fs.writeFileSync('test/test-bust.glb', Buffer.concat([h, ch(js.length, 0x4E4F534A), js, ch(bin.length, 0x004E4942), bin]));
console.log('test/test-bust.glb', total, 'bytes');
