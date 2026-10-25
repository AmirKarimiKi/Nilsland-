// Bakes a GLB mesh into one quantized point asset (10 bytes per point).
//
//   npm run bake -- path/to/bust.glb [--out-dir public/assets] [--label "text"]
//                   [--count 66000] [--no-glasses] [--glasses cx,cy,lensR,spacing,dz] [--seed 1]
//
// Record layout (little endian), 10 bytes:  x,y,z uint16 | nx,ny,nz int8 | kind uint8
// kind: 0 = surface, 1 = spectacle rim (curve points), 2 = spectacle lens (sparse shimmer points)
// Positions are normalised by the largest bbox side and the bbox centre (0..65535 <-> -0.5..+0.5).
//
// Model convention: +Y up, the face looks toward +Z.
// Glasses defaults are heuristics relative to the head bbox and MUST be tuned per model with --glasses.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i < 0 ? fallback : argv[i + 1]; };
const valueFlags = new Set(['--out-dir', '--label', '--count', '--glasses', '--seed']);
const file = argv.find((a, i) => !a.startsWith('--') && !valueFlags.has(argv[i - 1]));
if (!file) { console.error('Usage: npm run bake -- path/to/bust.glb [--out-dir dir] [--label text] [--count n] [--no-glasses] [--glasses cx,cy,lensR,spacing,dz]'); process.exit(1); }
const outDir = flag('out-dir', 'public/assets');
const label = flag('label', 'GLB SURFACE POINT CLOUD');
const COUNT = Number(flag('count', 66000));
const withGlasses = !argv.includes('--no-glasses');

// Deterministic RNG so a bake is reproducible.
let rs = Number(flag('seed', 1)) >>> 0 || 1;
const rand = () => { rs += 0x6D2B79F5; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// MeshSurfaceSampler uses Math.random by default; route it through the seeded RNG.
const sampleRandom = rand;

const source = await fs.readFile(file);
const gltf = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), path.dirname(path.resolve(file)) + '/');
gltf.scene.updateMatrixWorld(true);
const meshes = [];
gltf.scene.traverse(obj => { if (obj.isMesh && obj.geometry?.attributes?.position) { const geo = obj.geometry.clone(); geo.applyMatrix4(obj.matrixWorld); meshes.push(geo); } });
if (!meshes.length) throw new Error('GLB contains no mesh geometry');

// Area-weighted split across meshes.
const tri = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const areas = meshes.map(geo => {
  const pos = geo.attributes.position, idx = geo.index; let total = 0;
  for (let t = 0; t < (idx ? idx.count : pos.count); t += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(t) : t); b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1); c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2);
    total += tri.set(a, b, c).getArea();
  }
  return total;
});
const sum = areas.reduce((x, y) => x + y, 0);
if (sum <= 0) throw new Error('No sampleable mesh surface');
const cumulative = []; areas.reduce((acc, x) => (cumulative.push(acc + x), acc + x), 0);
const samplers = meshes.map(geo => new MeshSurfaceSampler(new THREE.Mesh(geo, new THREE.MeshBasicMaterial())).setRandomGenerator(sampleRandom).build());

const glassesBudget = withGlasses ? Math.round(COUNT * 0.045) : 0; // rim ~3.2%, lens ~1.3%
const rimBudget = Math.round(glassesBudget * 0.72), lensBudget = glassesBudget - rimBudget;
const surfaceTarget = COUNT - glassesBudget;

let surf = [];
const v = new THREE.Vector3(), n = new THREE.Vector3();
for (let i = 0; i < surfaceTarget; i++) {
  const r = rand() * sum, j = Math.max(0, cumulative.findIndex(x => r <= x));
  samplers[j].sample(v, n);
  surf.push({ p: v.clone(), n: n.clone(), kind: 0 });
}

// Bounds for the glasses heuristic come from the surface samples.
const box = new THREE.Box3(); surf.forEach(s => box.expandByPoint(s.p));
const size = box.getSize(new THREE.Vector3()), centre0 = box.getCenter(new THREE.Vector3());

let removed = 0, rim = [], lens = [];
if (withGlasses) {
  // Defaults: eye line ~ 0.19 of the bbox height below the top (bust with shoulders). Tune with --glasses.
  const [cxA, cyA, lensRA, spacingA, dzA] = (flag('glasses', '') || '').split(',').map(Number);
  const cx = Number.isFinite(cxA) ? cxA : centre0.x;
  const cy = Number.isFinite(cyA) ? cyA : box.max.y - size.y * 0.19;
  const lensR = Number.isFinite(lensRA) ? lensRA : size.x * 0.085;
  const spacing = Number.isFinite(spacingA) ? spacingA : lensR * 2.35;   // centre-to-centre
  const dz = Number.isFinite(dzA) ? dzA : size.z * 0.03;                  // frame stands off the face
  // Face depth: front-most surface near the eye line.
  let faceZ = -Infinity;
  for (const s of surf) if (Math.abs(s.p.y - cy) < lensR * 1.2 && Math.abs(s.p.x - cx) < spacing * 1.2) faceZ = Math.max(faceZ, s.p.z);
  if (!Number.isFinite(faceZ)) faceZ = box.max.z;
  const zAt = (x) => faceZ + dz - Math.pow(Math.abs(x - cx) / (spacing * 1.7), 2) * size.z * 0.12; // frame wraps slightly around the head
  const curves = [];
  for (const side of [-1, 1]) {
    const lx = cx + side * spacing / 2;
    curves.push({ lx, pts: Array.from({ length: 256 }, (_, k) => { const t = k / 256 * Math.PI * 2; return new THREE.Vector3(lx + Math.cos(t) * lensR, cy + Math.sin(t) * lensR * 0.92, zAt(lx + Math.cos(t) * lensR)); }) });
  }
  // Bridge arc and temple arms.
  const bridge = Array.from({ length: 24 }, (_, k) => { const t = k / 23, x = cx - spacing / 2 + lensR + t * (spacing - 2 * lensR); return new THREE.Vector3(x, cy + lensR * 0.28 + Math.sin(t * Math.PI) * lensR * 0.12, zAt(x)); });
  const temples = [-1, 1].map(side => Array.from({ length: 40 }, (_, k) => { const t = k / 39, x = cx + side * (spacing / 2 + lensR + t * lensR * 1.6); return new THREE.Vector3(x, cy + lensR * 0.55 - t * lensR * 0.1, zAt(x) - t * size.z * 0.12); }));
  const rimLine = [...curves.map(cu => cu.pts), bridge, ...temples];
  // Remove native points that overlap the frame (local only, radius < rim thickness * 1.8).
  const rimR = lensR * 0.075, kill = rimR * 1.8;
  const flat = rimLine.flat();
  const before = surf.length;
  surf = surf.filter(s => !(Math.abs(s.p.y - cy) < lensR * 1.4 && flat.some(q => q.distanceToSquared(s.p) < kill * kill)));
  removed = before - surf.length;
  // Rim points: distributed along the curve length with a thin tube cross-section.
  const lens0 = curves.map(cu => cu.pts);
  for (let i = 0; i < rimBudget; i++) {
    const line = rimLine[Math.floor(rand() * rimLine.length)], q = line[Math.floor(rand() * line.length)];
    const o = new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(rimR * 1.6);
    const nn = o.clone().normalize().multiplyScalar(.6).add(new THREE.Vector3(0, 0, .8)).normalize();
    rim.push({ p: q.clone().add(o), n: nn, kind: 1 });
  }
  // Lens points: sparse, recessed slightly behind the rim, used only for shimmer.
  for (let i = 0; i < lensBudget; i++) {
    const cu = curves[i % 2], ang = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * lensR * 0.93;
    lens.push({ p: new THREE.Vector3(cu.lx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.92, zAt(cu.lx) - dz * 0.35), n: new THREE.Vector3(0, 0, 1), kind: 2 });
  }
  console.log(`Glasses: centre (${cx.toFixed(3)}, ${cy.toFixed(3)}), lensR ${lensR.toFixed(3)}, spacing ${spacing.toFixed(3)}, faceZ ${faceZ.toFixed(3)}; removed ${removed} native points`);
}
// Top up surface points that were removed so the total stays exactly COUNT.
while (surf.length + rim.length + lens.length < COUNT) {
  const r = rand() * sum, j = Math.max(0, cumulative.findIndex(x => r <= x)); samplers[j].sample(v, n);
  if (withGlasses && rim.length && rim.some(q => q.p.distanceToSquared(v) < 1e-5)) continue;
  surf.push({ p: v.clone(), n: n.clone(), kind: 0 });
}
// Shuffle so any prefix of the file is a uniform subsample (mobile loads fewer points).
const all = [...surf, ...rim, ...lens];
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
const count = all.length;

const bb = new THREE.Box3(); all.forEach(s => bb.expandByPoint(s.p));
const centre = bb.getCenter(new THREE.Vector3()), bsize = bb.getSize(new THREE.Vector3());
const extent = Math.max(bsize.x, bsize.y, bsize.z) || 1;
const out = new ArrayBuffer(count * 10), dv = new DataView(out);
const clamp = THREE.MathUtils.clamp;
all.forEach((s, i) => {
  const o = i * 10;
  ['x', 'y', 'z'].forEach((k, d) => {
    dv.setUint16(o + d * 2, Math.round(65535 * clamp((s.p[k] - centre[k]) / extent + .5, 0, 1)), true);
    dv.setInt8(o + 6 + d, Math.round(127 * clamp(s.n[k], -1, 1)));
  });
  dv.setUint8(o + 9, s.kind);
});
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'portrait-points.bin'), Buffer.from(out));
await fs.writeFile(path.join(outDir, 'portrait-meta.json'), JSON.stringify({
  label, count, stride: 10, bytes: out.byteLength, extent, size: bsize.toArray(), center: centre.toArray(),
  kinds: { surface: all.filter(s => s.kind === 0).length, rim: rim.length, lens: lens.length }, removedNative: removed, source: path.basename(file)
}, null, 2));
console.log(`Wrote ${count} dots (${out.byteLength} bytes) to ${outDir}, extent ${extent.toFixed(4)}`);
