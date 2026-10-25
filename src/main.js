import * as THREE from 'three';
import './style.css';

const $ = (s) => document.querySelector(s);
const el = { app: $('#app'), loader: $('#loader'), arc: $('#arc'), pct: $('#pct'), status: $('#status'), note: $('#note'), hint: $('#hint'), panel: $('#panel'), stats: $('#stats'), replay: $('#replay'), error: $('#error') };

const params = new URLSearchParams(location.search);
const BASE = import.meta.env.BASE_URL;
const ASSET_DIR = `${BASE}assets/${params.get('asset') === 'test' ? 'test/' : ''}`; // ?asset=test -> primitive test fixture
const mobile = matchMedia('(max-width: 720px)').matches || matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_POINTS = mobile ? 36000 : 66000; // GPU / memory budget; the bake shuffles points so any prefix is a uniform subsample
const SCALE = 2.9;                          // world size of the normalised bust (largest bbox side)
const STRIDE = 10;

function fail(message) {
  el.error.hidden = false; el.error.textContent = message;
  el.loader.classList.add('hidden');
  console.error(message);
}

// ---------------------------------------------------------------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: mobile ? 'low-power' : 'high-performance' });
} catch (err) {
  fail('WEBGL NICHT VERFÜGBAR — Dieser Browser oder dieses Gerät kann die 3D-Punktwolke nicht darstellen.');
  throw err;
}
const maxDpr = mobile ? 1.5 : 2;
const dpr = () => Math.min(devicePixelRatio || 1, maxDpr);
renderer.setPixelRatio(dpr());
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x060608);
el.app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
function fitCamera() {
  camera.aspect = innerWidth / innerHeight;
  const half = 1.62, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0, Math.max(half / t, half / (t * camera.aspect)) + 0.2); // fit height, or width on portrait screens
  camera.updateProjectionMatrix();
}
fitCamera();

// ---------------------------------------------------------------- loader UI
function setProgress(p) {
  const v = Math.max(0, Math.min(100, Math.floor(p)));
  el.arc.classList.remove('indeterminate');
  el.arc.style.setProperty('--p', v);
  el.pct.textContent = `${v}%`;
  el.loader.setAttribute('aria-valuenow', v);
}
function setIndeterminate() { el.arc.classList.add('indeterminate'); el.pct.textContent = '···'; }

// ---------------------------------------------------------------- asset: real baked point cloud
// Returns { geometry, meta } or null when no baked asset exists (-> 2.5D preview).
async function loadBakedPoints() {
  let meta = null;
  try {
    const r = await fetch(`${ASSET_DIR}portrait-meta.json`);
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) meta = await r.json();
  } catch { /* meta is optional for length, but the bin must exist */ }
  const res = await fetch(`${ASSET_DIR}portrait-points.bin`);
  if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return null; // dev servers answer 200 + index.html for missing files
  const declared = Number(res.headers.get('content-length')) || 0;
  const fileBytes = declared || meta?.bytes || 0;
  const wantBytes = fileBytes ? Math.min(fileBytes, MAX_POINTS * STRIDE) : MAX_POINTS * STRIDE;
  const limit = Math.floor(wantBytes / STRIDE) * STRIDE;
  if (!fileBytes) setIndeterminate();

  const data = new Uint8Array(limit);
  const reader = res.body.getReader();
  let received = 0;
  while (received < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, limit - received);
    data.set(take === value.byteLength ? value : value.subarray(0, take), received);
    received += take;
    if (fileBytes) setProgress(Math.min(99, received / limit * 100)); // % from bytes actually received
  }
  reader.cancel().catch(() => {}); // stop downloading once the mobile budget is reached
  const count = Math.floor(received / STRIDE);
  if (count < 1000) throw new Error('Punkt-Asset ist beschädigt oder zu kurz.');

  const dv = new DataView(data.buffer);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), seed = new Float32Array(count), kind = new Float32Array(count);
  for (let i = 0, o = 0; i < count; i++, o += STRIDE) {
    for (let j = 0; j < 3; j++) {
      position[i * 3 + j] = (dv.getUint16(o + j * 2, true) / 65535 - 0.5) * SCALE;
      normal[i * 3 + j] = dv.getInt8(o + 6 + j) / 127;
    }
    kind[i] = dv.getUint8(o + 9);
    seed[i] = (i * 0.61803398875) % 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  return { geometry, meta, count };
}

// ---------------------------------------------------------------- asset: 2.5D photo preview (NOT the 3D result)
async function buildPhotoPreview() {
  el.status.textContent = 'PREPARING 2.5D STUDY';
  setIndeterminate();
  const img = new Image();
  img.src = `${BASE}assets/reference-photo.jpg`;
  await img.decode();
  const W = 480, H = Math.round(W * img.height / img.width);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  let s = 7; const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9E3779B9 | 0), (s >>> 0) / 4294967296);
  const target = Math.min(MAX_POINTS - 8000, mobile ? 28000 : 58000);
  const pts = [], ns = [], seeds = [], kinds = [];
  for (let i = 0; i < target * 7 && seeds.length < target; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), k = (y * W + x) * 4, r = px[k], g = px[k + 1], b = px[k + 2];
    const dark = (r + g + b) / 3 < 145, skin = r > g * 1.10 && g > b * 1.04 && r > 70; // person vs. bright backdrop
    const xx = x / W * 2 - 1, yy = 1 - y / H * 2;
    if (!(dark || skin) || Math.abs(xx) > 0.93) continue;
    const radial = Math.min(1, Math.abs(xx) / (0.36 + 0.22 * Math.max(0, -yy)));
    const z = Math.sqrt(Math.max(0, 1 - radial * radial)) * 0.31;
    const j = () => (rnd() - 0.5) * 0.009;
    pts.push(xx * 1.18 + j(), yy * 1.08 + j(), z + j());
    ns.push(xx * 0.5, 0.07, Math.sqrt(Math.max(0.1, 1 - xx * xx * 0.3)));
    seeds.push(rnd()); kinds.push(0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
  geometry.computeBoundingBox();
  const c = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, -c.z);
  return { geometry, count: seeds.length };
}

// ---------------------------------------------------------------- material
const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uIntro: { value: 0 }, uSweep: { value: -9 }, uGlint: { value: -9 },
    uLight: { value: new THREE.Vector3(0, 0, 2) }, uLightOn: { value: 0 },
    uRatio: { value: dpr() }, uPointScale: { value: mobile ? 1.15 : 1 }
  },
  vertexShader: /* glsl */`
    attribute float aSeed; attribute float aKind;
    uniform float uIntro, uSweep, uGlint, uRatio, uPointScale, uLightOn; uniform vec3 uLight;
    varying float vBright; varying float vSeed;
    void main(){
      vSeed = aSeed;
      // Unfold: every dot starts on a ring and eases to its place on the bust.
      float th = aSeed * 6.2831853;
      vec3 start = vec3(cos(th) * .46, sin(th) * .46, 0.);
      float delay = aSeed * .54;
      float t = smoothstep(delay, min(1., delay + .44), uIntro);
      t = t * t * (3. - 2. * t);
      vec3 pos = mix(start, position, t);

      vec4 world = modelMatrix * vec4(pos, 1.);
      vec3 wn = normalize(mat3(modelMatrix) * normal);
      // Cursor = a single soft point light in front of the bust.
      vec3 toL = uLight - world.xyz;
      float dist = length(toL);
      float facing = .35 + .65 * max(0., dot(wn, toL / max(dist, .001)));
      float lit = pow(max(0., 1. - dist * .52), 3.) * facing * uLightOn;
      float rim = pow(1. - abs(wn.z), 2.);
      // One soft light sweep after the unfold.
      float sweep = exp(-pow((world.y + world.x * .18 - uSweep) * 3.2, 2.));

      float base = .40;
      float size = 2.2 + aSeed * 2.6;
      if (aKind > .5 && aKind < 1.5) { base = .62; size += .5; }          // spectacle rim: slightly denser/brighter
      if (aKind > 1.5) {                                                // lens: very faint, a slow glint passes over it
        float glint = exp(-pow((world.x - uGlint) * 5., 2.));
        base = .10 + glint * .55; size = 2.0;
      }
      vBright = min(1.15, (base + lit * .75 + rim * .10 + sweep * .55) * (.86 + aSeed * .28));
      vec4 view = viewMatrix * world;
      gl_Position = projectionMatrix * view;
      gl_PointSize = clamp((size + sweep * 1.0) * uRatio * uPointScale * 5. / -view.z, 1., 10.);
    }`,
  fragmentShader: /* glsl */`
    precision mediump float; varying float vBright; varying float vSeed;
    void main(){
      float r = length(gl_PointCoord - .5);
      float a = exp(-r * r * 18.) * .88;            // soft gaussian sprite
      if (a < .018) discard;
      vec3 tint = mix(vec3(.74,.76,.79), vec3(.88,.90,.93), vSeed);
      gl_FragColor = vec4(tint * vBright, a);
    }`
});

// ---------------------------------------------------------------- interaction
const pointer = { x: 0, y: 0, seen: false };
const lightTarget = new THREE.Vector3(0, 0, 2);
const ndc = new THREE.Vector3(), dirV = new THREE.Vector3();
function onPointer(e) {
  pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = 1 - e.clientY / innerHeight * 2;
  if (!pointer.seen) { pointer.seen = true; el.hint.classList.add('gone'); }
}
addEventListener('pointermove', onPointer, { passive: true });
addEventListener('pointerdown', onPointer, { passive: true });
addEventListener('resize', () => {
  renderer.setPixelRatio(dpr()); renderer.setSize(innerWidth, innerHeight);
  material.uniforms.uRatio.value = dpr(); fitCamera();
});
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); renderer.setAnimationLoop(null);
  el.note.classList.add('warn'); el.note.textContent = 'WEBGL-KONTEXT VERLOREN — warte auf Wiederherstellung …';
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  el.note.classList.remove('warn'); el.note.textContent = noteText; renderer.setAnimationLoop(tick);
});

// ---------------------------------------------------------------- main
let cloud, noteText = '', begin = 0, frames = 0, lastFps = performance.now(), fps = 0, dotCount = 0, modeLabel = '';
const INTRO = 2.4, SWEEP_AT = 2.6, SWEEP_LEN = 1.9;

function tick(t) {
  const elapsed = reducedMotion ? 99 : (t - begin) / 1000;
  const u = material.uniforms;
  u.uIntro.value = Math.min(1, elapsed / INTRO);
  const sw = (elapsed - SWEEP_AT) / SWEEP_LEN;
  u.uSweep.value = reducedMotion ? -9 : (sw >= 0 && sw <= 1 ? 1.9 - sw * 3.8 : -9);   // single pass, then rest
  const g = (elapsed - 6) % 11 / 1.6;                                              // glasses glint: brief, every ~11 s
  u.uGlint.value = !reducedMotion && elapsed > 6 && g >= 0 && g <= 1 ? -0.9 + g * 1.8 : -9;
  // Cursor -> world-space point light at z = 1.3
  ndc.set(pointer.x, pointer.y, .5).unproject(camera); dirV.copy(ndc).sub(camera.position).normalize();
  lightTarget.copy(camera.position).addScaledVector(dirV, (camera.position.z - 1.3) / -dirV.z);
  u.uLight.value.lerp(lightTarget, .12);
  u.uLightOn.value += ((pointer.seen ? 1 : 0) * Math.min(1, Math.max(0, (elapsed - 3.6) / 1)) - u.uLightOn.value) * .06;
  if (!reducedMotion) {
    cloud.rotation.y += (THREE.MathUtils.clamp(pointer.x * .21, -.23, .23) - cloud.rotation.y) * .045;   // subtle turn toward the cursor
    cloud.rotation.x += (THREE.MathUtils.clamp(-pointer.y * .09, -.09, .09) - cloud.rotation.x) * .045;
  }
  renderer.render(scene, camera);
  frames++;
  if (t - lastFps > 1000) { fps = Math.round(frames * 1000 / (t - lastFps)); frames = 0; lastFps = t; el.stats.textContent = `${modeLabel} · ${dotCount.toLocaleString('de-DE')} DOTS · ${fps} FPS`; }
}

async function start() {
  let result = null;
  try { result = await loadBakedPoints(); }
  catch (e) { console.warn('Baked asset failed, falling back to preview:', e); }

  if (result) {
    const label = result.meta?.label || 'GLB SURFACE POINT CLOUD';
    const isFixture = /test fixture/i.test(label);
    modeLabel = isFixture ? 'TEST FIXTURE' : 'GLB POINT CLOUD';
    noteText = `${label.toUpperCase()} · ${result.count.toLocaleString('de-DE')} DOTS${result.count < (result.meta?.count || result.count) ? ' (REDUCED FOR THIS DEVICE)' : ''}`;
    if (isFixture) el.note.classList.add('warn');
  } else {
    result = await buildPhotoPreview();
    modeLabel = '2.5D PREVIEW';
    noteText = '2.5D-FOTO-VORSCHAU — NICHT die 3D-Skulptur. Es liegt noch kein gebackenes GLB-Punktasset vor (siehe README: GLB erzeugen, dann npm run bake).';
    el.note.classList.add('warn');
  }
  el.note.textContent = noteText;
  dotCount = result.count;
  setProgress(100);
  cloud = new THREE.Points(result.geometry, material);
  cloud.frustumCulled = false;
  scene.add(cloud);
  setTimeout(() => el.loader.classList.add('hidden'), reducedMotion ? 0 : 450);
  el.panel.hidden = false;
  begin = performance.now();
  el.replay.addEventListener('click', () => { begin = performance.now(); material.uniforms.uLightOn.value = 0; });
  renderer.setAnimationLoop(tick);
  window.__dots = { count: dotCount, mode: modeLabel, ready: true }; // used by the automated check
}
start().catch((err) => fail(`FEHLER BEIM START — ${err.message || err}`));
