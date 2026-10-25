import * as THREE from 'three';
import './style.css';

const $ = (s) => document.querySelector(s);
const el = { app: $('#app'), loader: $('#loader'), arc: $('#arc'), pct: $('#pct'), status: $('#status'), note: $('#note'), hint: $('#hint'), panel: $('#panel'), stats: $('#stats'), replay: $('#replay'), error: $('#error') };

const params = new URLSearchParams(location.search);
const BASE = import.meta.env.BASE_URL;
const ASSET_DIR = `${BASE}assets/${params.get('asset') === 'test' ? 'test/' : ''}`; // ?asset=test -> primitive test fixture
if (params.has('clean')) document.documentElement.classList.add('clean');   // inspection only: hide UI text for comparison images
const mobile = matchMedia('(max-width: 720px)').matches || matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
// Hardware-adaptive density: 66k target on capable desktops, fewer on phones / weak devices. ?points=N overrides (test only).
const tierPoints = mobile ? 36000 : (mem <= 2 || cores <= 2) ? 36000 : 66000;
const MAX_POINTS = Math.min(66000, Number(params.get('points')) || tierPoints); // the bake shuffles points so any prefix is a uniform subsample
const PREVIEW = import.meta.env.DEV && params.has('preview'); // 2.5D photo study: dev-only, never part of a production build
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
// Resolution: real drawing-buffer pixels, not CSS upscaling. 3840x2160 (8.29 Mpx) fits the desktop budget; the
// budget, WebGL limits and a dynamic scale (see tick) keep weaker GPUs and phones in range.
const gl = renderer.getContext();
const maxDim = Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
const PIXEL_BUDGET = mobile ? 2.5e6 : 8.6e6;
const maxDpr = Number(params.get('dpr')) || (mobile ? 1.5 : 2);
let resScale = 1; const MIN_SCALE = 0.55;
const dpr = () => {
  const w = innerWidth, h = innerHeight;
  let d = Math.min(devicePixelRatio || 1, maxDpr) * resScale;
  d = Math.min(d, Math.sqrt(PIXEL_BUDGET / (w * h)), maxDim / Math.max(w, h));
  return Math.max(0.5, d);
};
const buffer = { w: 0, h: 0, dpr: 0 };
function applyResolution() {
  const d = dpr(); renderer.setPixelRatio(d); renderer.setSize(innerWidth, innerHeight);
  material.uniforms.uRatio.value = renderer.domElement.height / (mobile ? 1000 : 800);   // dot size follows the buffer height, so 4K looks like 720p, only sharper
  buffer.w = gl.drawingBufferWidth; buffer.h = gl.drawingBufferHeight; buffer.dpr = d;
  if (window.__dots) window.__dots.buffer = { ...buffer, css: [innerWidth, innerHeight], devicePixelRatio, maxDim };
  console.info(`[dots] drawing buffer ${buffer.w}x${buffer.h} (CSS ${innerWidth}x${innerHeight}, dpr ${d.toFixed(3)}, devicePixelRatio ${devicePixelRatio}, scale ${resScale.toFixed(2)}, max ${maxDim})`);
}
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
  if (!import.meta.env.DEV) throw new Error('2.5D preview is dev-only');
  img.src = '/assets-src/reference-photo.jpg'; // served from the project root by the dev server only; not in public/, not in dist/
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
// Motion model (all GPU side): (1) ring -> bust unfold, staggered top-down with a short swirl, played once;
// (2) calm interactive state: head turns over the shoulders toward the cursor, cursor light + faint specular,
// depth cue (nearer dots larger/brighter). No random per-dot motion.
const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {
    uIntro: { value: 0 }, uSpin: { value: 0 }, uSweep: { value: -9 }, uGlint: { value: -9 },
    uLight: { value: new THREE.Vector3(0, 0, 2) }, uLightOn: { value: 0 },
    uHead: { value: new THREE.Vector2(0, 0) }, uBody: { value: 0 },
    uPivot: { value: new THREE.Vector3(0, 0, 0) }, uBounds: { value: new THREE.Vector2(-1.4, 1.4) },
    uRatio: { value: 1 }, uPointScale: { value: mobile ? 1.15 : 1 }
  },
  vertexShader: /* glsl */`
    attribute float aSeed; attribute float aKind;
    uniform float uIntro, uSpin, uSweep, uGlint, uRatio, uPointScale, uLightOn, uBody;
    uniform vec3 uLight, uPivot; uniform vec2 uHead, uBounds;
    varying float vBright; varying float vSeed; varying float vGlint;
    vec3 yawRot(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
    vec3 pitchRot(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
    void main(){
      vSeed = aSeed; vGlint = 0.;
      float h = clamp((position.y - uBounds.x) / (uBounds.y - uBounds.x), 0., 1.);

      // (1) one-time unfold: a ring of dots releases top-down (head first) and swirls into the bust.
      float th = aSeed * 6.2831853 + uSpin;
      vec3 start = vec3(cos(th), sin(th), 0.) * .62;
      float delay = .50 * (1. - h) + .10 * aSeed;
      float te = clamp((uIntro - delay) / .40, 0., 1.);
      float e = 1. - pow(1. - te, 3.);                                     // ease-out cubic
      vec3 pos = mix(start, position, e);
      float ang = (1. - e) * 1.25 * (1. - .5 * h);                           // swirl that unwinds to zero
      float ca = cos(ang), sa = sin(ang);
      pos.xy = vec2(pos.x * ca - pos.y * sa, pos.x * sa + pos.y * ca);
      pos.xy *= 1. + .16 * sin(e * 3.14159);                                 // slight outward arc in flight
      float flight = sin(e * 3.14159);                                       // 0 at ring and at rest

      // (2) head turns over the shoulders: yaw/pitch about a neck pivot, body follows a fraction
      vec3 nrm = normal;
      float wHead = smoothstep(uPivot.y - .15, uPivot.y + .25, pos.y);
      float yaw = mix(uBody, uHead.x, wHead);
      vec3 q = pos - vec3(uPivot.x, 0., uPivot.z);
      q = yawRot(q, yaw); nrm = yawRot(nrm, yaw);
      vec3 qp = q - vec3(0., uPivot.y, 0.);
      qp = mix(qp, pitchRot(qp, uHead.y), wHead); nrm = mix(nrm, pitchRot(nrm, uHead.y), wHead);
      pos = qp + vec3(uPivot.x, uPivot.y, uPivot.z);

      vec4 world = modelMatrix * vec4(pos, 1.);
      vec3 wn = normalize(mat3(modelMatrix) * nrm);

      // cursor = one soft point light in front of the bust (diffuse + a faint specular reflex)
      vec3 toL = uLight - world.xyz;
      float dist = length(toL); vec3 L = toL / max(dist, .001);
      float facing = .22 + .78 * max(0., dot(wn, L));
      float reach = pow(max(0., 1. - dist * .62), 2.0);
      float lit = reach * facing * uLightOn;
      float spec = pow(max(0., dot(reflect(-L, wn), vec3(0., 0., 1.))), 16.) * pow(max(0., 1. - dist * .55), 2.) * uLightOn;
      float rim = pow(1. - abs(wn.z), 2.);
      float key = max(0., dot(wn, normalize(vec3(-.45, .65, .62))));
      float sweep = exp(-pow((world.y + world.x * .18 - uSweep) * 3.2, 2.));
      float near = clamp(.5 + .5 * world.z / 1.2, 0., 1.);                   // depth cue: nearer dots larger/brighter

      float base = .24;
      float size = 2.2 + aSeed * 2.6;
      float extra = 0.;
      if (aKind > .5 && aKind < 1.5) { base = .70; size += .5; extra = spec * .5; }   // spectacle rim
      if (aKind > 1.5) {                                                              // lens: faint, glint + cursor reflex
        float glint = exp(-pow((world.x - uGlint) * 5., 2.));
        base = .10 + glint * .55; size = 2.0; extra = spec * 1.3 + lit * .7; vGlint = clamp(max(glint, spec * .9 + lit * .25), 0., 1.);
      }
      float b = (base + lit * 3.2 + spec * 1.3 + extra + rim * .10 + key * .16 + sweep * .55) * (.82 + aSeed * .34);
      b *= (.70 + .50 * near);
      b *= (.55 + .45 * smoothstep(0., .25, te)) * (1. + .6 * flight);
      vBright = min(1.5, b);
      vec4 view = viewMatrix * world;
      gl_Position = projectionMatrix * view;
      float psz = (size * (.82 + .30 * near) * (1. + .30 * lit) + sweep * 1.0 + flight * .8) * uRatio * uPointScale * 5. / -view.z;
      gl_PointSize = clamp(psz, 1., 10. * max(1., uRatio));
    }`,
  fragmentShader: /* glsl */`
    precision mediump float; varying float vBright; varying float vSeed; varying float vGlint;
    void main(){
      float r = length(gl_PointCoord - .5);
      float a = exp(-r * r * 16.) * .88;            // soft gaussian sprite
      if (a < .018) discard;
      vec3 tint = mix(vec3(.74,.76,.79), vec3(.88,.90,.93), vSeed);
      tint = mix(tint, vec3(.62,.74,.98), vGlint * .8);   // cool reflex on the lenses only
      gl_FragColor = vec4(tint * vBright, a);
    }`
});

// ---------------------------------------------------------------- interaction
const pointer = { x: 0, y: 0, seen: false, active: false };
const lightTarget = new THREE.Vector3(0, 0, 2);
const ndc = new THREE.Vector3(), dirV = new THREE.Vector3();
function onPointer(e) {
  pointer.x = THREE.MathUtils.clamp(e.clientX / innerWidth * 2 - 1, -1, 1); pointer.y = THREE.MathUtils.clamp(1 - e.clientY / innerHeight * 2, -1, 1);
  pointer.active = true;
  if (!pointer.seen) { pointer.seen = true; el.hint.classList.add('gone'); }
}
addEventListener('pointermove', onPointer, { passive: true });
addEventListener('pointerdown', onPointer, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });   // cursor left the window: head eases back, light parks
addEventListener('resize', () => { applyResolution(); fitCamera(); });
applyResolution();
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); renderer.setAnimationLoop(null);
  el.note.classList.add('warn'); el.note.textContent = 'WEBGL-KONTEXT VERLOREN — warte auf Wiederherstellung …';
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  el.note.classList.remove('warn'); el.note.textContent = noteText; renderer.setAnimationLoop(tick);
});

// ---------------------------------------------------------------- main
const fixedRes = params.has('fixedres'); let lastT = 0, dtSum = 0, dtN = 0;
let cloud, noteText = '', begin = 0, frames = 0, lastFps = performance.now(), fps = 0, dotCount = 0, modeLabel = '';
// Timeline (s): 0-HOLD ring is shown and slowly turns | HOLD-(HOLD+UNFOLD) staggered unfold | then one light sweep | then calm + interactive.
const HOLD = 0.8, UNFOLD = 3.6, SWEEP_AT = HOLD + UNFOLD + 0.1, SWEEP_LEN = 1.9, LIVE_AT = HOLD + UNFOLD * 0.7;
const smoothDamp = (cur, target, st, smoothTime, dt, maxSpeed = 1.4) => {   // critically damped follow, speed-limited: no jerks, soft lag
  const om = 2 / smoothTime, x = om * dt, ex = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
  let ch = cur - target; const lim = maxSpeed * smoothTime; ch = THREE.MathUtils.clamp(ch, -lim, lim);
  const tgt = cur - ch, tmp = (st.v + om * ch) * dt; st.v = (st.v - om * tmp) * ex;
  let out = tgt + (ch + tmp) * ex; if ((target - cur > 0) === (out > target)) { out = target; st.v = 0; } return out;
};
const sYaw = { v: 0 }, sPitch = { v: 0 }, sPx = { v: 0 }, sPy = { v: 0 };
let headYaw = 0, headPitch = 0, camX = 0, camY = 0, prevT = 0;
const lightPark = new THREE.Vector3();

function tick(t) {
  const dtS = Math.min(0.1, Math.max(0.001, (t - (prevT || t - 16)) / 1000)); prevT = t;
  const elapsed = reducedMotion ? 99 : (t - begin) / 1000;
  const u = material.uniforms, inspect = params.has('yaw');
  u.uIntro.value = reducedMotion ? 1 : Math.min(1, Math.max(0, (elapsed - HOLD) / UNFOLD));
  u.uSpin.value = reducedMotion ? 0 : Math.min(elapsed, HOLD + UNFOLD) * 0.45;
  const sw = (elapsed - SWEEP_AT) / SWEEP_LEN;
  u.uSweep.value = reducedMotion ? -9 : (sw >= 0 && sw <= 1 ? 1.9 - sw * 3.8 : -9);   // single pass, then rest
  const g = (elapsed - 8) % 11 / 1.6;                                              // lens glint: brief, every ~11 s
  u.uGlint.value = !reducedMotion && elapsed > 8 && g >= 0 && g <= 1 ? -0.9 + g * 1.8 : -9;

  // calm interactive state, faded in once the unfold is mostly done
  const live = reducedMotion ? 1 : THREE.MathUtils.smoothstep((elapsed - LIVE_AT) / 0.9, 0, 1);
  const px = pointer.active ? pointer.x : 0, py = pointer.active ? pointer.y : 0;
  if (!reducedMotion && !inspect) {
    headYaw = smoothDamp(headYaw, px * 0.42 * live, sYaw, 0.40, dtS, 0.8);            // +-24 deg, soft lag (~0.4 s)
    headPitch = smoothDamp(headPitch, -py * 0.13 * live, sPitch, 0.45, dtS, 0.8);
    camX = smoothDamp(camX, px * 0.22 * live, sPx, 0.6, dtS, 1.0);               // slight parallax so the volume reads as 3D
    camY = smoothDamp(camY, py * 0.09 * live, sPy, 0.6, dtS, 1.0);
  }
  u.uHead.value.set(headYaw, headPitch); u.uBody.value = headYaw * 0.28;
  camera.position.x = camX; camera.position.y = camY; camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  cloud.rotation.y = inspect ? THREE.MathUtils.degToRad(Number(params.get('yaw')) || 0) : 0;

  // cursor light on a plane in front of the bust; before the first cursor move it wanders slowly as a hint (not in reduced motion)
  let intensity;
  if (pointer.seen && pointer.active) {
    ndc.set(pointer.x, pointer.y, .5).unproject(camera); dirV.copy(ndc).sub(camera.position).normalize();
    lightTarget.copy(camera.position).addScaledVector(dirV, (camera.position.z - 0.95) / -dirV.z);
    intensity = 1;
  } else {
    const k = reducedMotion ? 0 : elapsed;
    lightTarget.set(Math.sin(k * .55) * .9, .35 + Math.cos(k * .41) * .75, .95);
    intensity = pointer.seen ? .0 : .55;
  }
  u.uLight.value.lerp(lightTarget, 1 - Math.exp(-dtS * 9));
  u.uLightOn.value += (intensity * live - u.uLightOn.value) * (1 - Math.exp(-dtS * 3));

  renderer.render(scene, camera);
  frames++;
  // Dynamic resolution: if the measured frame time stays above ~22 ms after warm-up, step the buffer down (never up -> no oscillation).
  const dt = t - lastT; lastT = t;
  if (!fixedRes && elapsed > 5 && dt < 200) {
    dtSum += dt; dtN++;
    if (dtN >= 90) { if (dtSum / dtN > 22 && resScale > MIN_SCALE) { resScale = Math.max(MIN_SCALE, resScale * 0.85); applyResolution(); } dtSum = 0; dtN = 0; }
  }
  if (t - lastFps > 1000) {
    fps = Math.round(frames * 1000 / (t - lastFps)); frames = 0; lastFps = t;
    el.stats.textContent = `${modeLabel} · ${dotCount.toLocaleString('de-DE')} DOTS · ${buffer.w}×${buffer.h} · ${fps} FPS`;
    if (window.__dots) window.__dots.fps = fps;
  }
}

async function start() {
  let result = null;
  if (!PREVIEW) {
    try { result = await loadBakedPoints(); }
    catch (e) { console.warn('Baked asset failed:', e); fail(`PUNKT-ASSET DEFEKT — ${e.message || e}`); return; }
    if (!result) { fail('PORTRAIT-ASSET FEHLT — public/assets/portrait-points.bin wurde noch nicht erzeugt. Benötigt: bust.glb → npm run bake -- bust.glb (siehe ASSET-REQUIREMENTS.md). Dies ist kein fertiger Zustand.'); return; }
  }

  if (result) {
    const label = result.meta?.label || 'GLB SURFACE POINT CLOUD';
    const isFixture = /test fixture/i.test(label);
    modeLabel = isFixture ? 'TEST FIXTURE' : 'GLB POINT CLOUD';
    noteText = `${label.toUpperCase()} · ${result.count.toLocaleString('de-DE')} DOTS${result.count < (result.meta?.count || result.count) ? ' (REDUCED FOR THIS DEVICE)' : ''}`;
    if (isFixture) el.note.classList.add('warn');
  } else {
    result = await buildPhotoPreview();
    modeLabel = '2.5D PREVIEW';
    noteText = '2.5D-FOTO-VORSCHAU (nur Dev) — NICHT die 3D-Skulptur und nicht fertig.';
    el.note.classList.add('warn');
  }
  el.note.textContent = noteText;
  dotCount = result.count;
  setProgress(100);
  // head-turn pivot (neck) and height range, in the normalised world units of the baked cloud
  result.geometry.computeBoundingBox(); const bb = result.geometry.boundingBox;
  material.uniforms.uBounds.value.set(bb.min.y, bb.max.y);
  const m = result.meta;
  if (m?.center && m?.extent) {            // portrait asset: neck axis measured on the photo (model x -0.05, z -0.03, collar top y 0.60 in model units)
    const k = SCALE / m.extent; material.uniforms.uPivot.value.set((-0.05 - m.center[0]) * k, (0.60 - m.center[1]) * k, (-0.03 - m.center[2]) * k);
  } else material.uniforms.uPivot.value.set(0, bb.min.y + (bb.max.y - bb.min.y) * 0.55, 0);
  cloud = new THREE.Points(result.geometry, material);
  cloud.frustumCulled = false;
  scene.add(cloud);
  setTimeout(() => el.loader.classList.add('hidden'), reducedMotion ? 0 : 150);
  el.panel.hidden = false;
  begin = performance.now();
  el.replay.addEventListener('click', () => { begin = performance.now(); material.uniforms.uLightOn.value = 0; headYaw = headPitch = 0; sYaw.v = sPitch.v = 0; });
  renderer.setAnimationLoop(tick);
  window.__dots = { intro: () => material.uniforms.uIntro.value, sweep: () => material.uniforms.uSweep.value, yaw: () => material.uniforms.uHead.value.x, pitch: () => material.uniforms.uHead.value.y, light: () => material.uniforms.uLight.value.toArray(), lightOn: () => material.uniforms.uLightOn.value, count: dotCount, mode: modeLabel, ready: true, buffer: { ...buffer, css: [innerWidth, innerHeight], devicePixelRatio, maxDim } }; // used by the automated check
}
start().catch((err) => fail(`FEHLER BEIM START — ${err.message || err}`));
