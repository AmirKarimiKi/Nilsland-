// Pre-bake geometry/orientation check for the portrait GLB.  Usage: npm run check:glb [-- path/to/bust.glb]
// Default path: assets-src/bust.glb.  Exit code 1 on blocking problems, 0 otherwise (warnings are printed).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const file = process.argv[2] || 'assets-src/bust.glb';
let buf;
try { buf = await fs.readFile(file); } catch { console.error(`MISSING: ${file} not found. The real portrait GLB has not been delivered yet (see ASSET-REQUIREMENTS.md).`); process.exit(1); }
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(path.resolve(file)) + '/');
gltf.scene.updateMatrixWorld(true);
let tris = 0, meshes = 0, textured = 0, noNormals = 0; const box = new THREE.Box3(), pts = [];
gltf.scene.traverse(o => {
  if (!o.isMesh || !o.geometry?.attributes?.position) return;
  meshes++; const g = o.geometry.clone().applyMatrix4(o.matrixWorld), pos = g.attributes.position;
  tris += (g.index ? g.index.count : pos.count) / 3; if (!g.attributes.normal) noNormals++;
  if (o.material?.map) textured++;
  for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 20000))) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i));
});
const errors = [], warns = [];
if (!meshes) errors.push('no mesh geometry');
pts.forEach(p => box.expandByPoint(p));
const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
if (tris < 5000) warns.push(`only ${Math.round(tris)} triangles - surface sampling will look coarse`);
if (textured) warns.push(`${textured} mesh(es) carry a texture; it is ignored by the bake (geometry only)`);
if (noNormals) warns.push(`${noNormals} mesh(es) without normals; normals will be derived`);
if (size.z > size.y * 1.15) warns.push('depth exceeds height: likely Z-up export -> try `npm run bake -- <glb> --rotate -90,0,0`');
if (size.x < size.y * 0.7) warns.push('bust is narrower than 0.7 x height: shoulders may be cropped or the model is not a head-and-shoulders bust');
// Facing heuristic: the nose/brow/chin protrude toward the face direction in the head region (upper 35% of height).
const headTop = box.max.y - size.y * 0.35, head = pts.filter(p => p.y > headTop);
if (head.length > 50) {
  const zs = head.map(p => p.z).sort((a, b) => a - b), mid = zs[zs.length >> 1], front = zs[zs.length - 1] - mid, back = mid - zs[0];
  console.log(`facing: front protrusion ${front.toFixed(3)} vs back ${back.toFixed(3)} (z, head region)`);
  if (back > front * 1.35) warns.push('head extends further toward -Z than +Z: face may look toward -Z -> try --rotate 0,180,0 (confirm visually)');
}
const sym = pts.filter(p => p.y > headTop); const mx = sym.reduce((a, p) => a + p.x, 0) / (sym.length || 1);
if (Math.abs(mx - c.x) > size.x * 0.05) warns.push(`head centre is ${(mx - c.x).toFixed(3)} off the bbox centre in X (tilted or off-centre)`);
console.log(JSON.stringify({ file, meshes, triangles: Math.round(tris), size: size.toArray().map(v => +v.toFixed(3)), center: c.toArray().map(v => +v.toFixed(3)), upright: size.y >= size.x * 0.9 }, null, 1));
warns.forEach(w => console.warn('WARN:', w)); errors.forEach(e => console.error('ERROR:', e));
if (errors.length) process.exit(1);
console.log(warns.length ? 'Check finished with warnings (review before baking).' : 'Check OK.');
