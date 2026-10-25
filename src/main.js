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
// Calibration knobs (defaults are the shipped look; ?size= ?back= ?alpha= ?gain= ?blend=add|normal exist for the comparison series)
const cal = { size: Number(params.get('size')) || 1.6, back: params.has('back') ? Number(params.get('back')) : 0.55, alpha: Number(params.get('alpha')) || 0.85, gain: Number(params.get('gain')) || 1.3, blend: params.get('blend') || 'normal' };
const STILL = params.has('still');   // frozen, repeatable state for comparison images: unfold done, no sweep, fixed light, no drift
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
  material.uniforms.uRatio.value = (renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z)) / 237.2;   // dot size follows the bust's pixel scale (= H/800 on 16:9; smaller on narrow phones where the bust is width-limited)   // dot size follows the buffer height, so 4K looks like 720p, only sharper
  buffer.w = gl.drawingBufferWidth; buffer.h = gl.drawingBufferHeight; buffer.dpr = d;
  if (window.__dots) window.__dots.buffer = { ...buffer, css: [innerWidth, innerHeight], devicePixelRatio, maxDim };
  console.info(`[dots] drawing buffer ${buffer.w}x${buffer.h} (CSS ${innerWidth}x${innerHeight}, dpr ${d.toFixed(3)}, devicePixelRatio ${devicePixelRatio}, scale ${resScale.toFixed(2)}, max ${maxDim})`);
}
renderer.setClearColor(0x060608);
el.app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const uRingR = { value: 0.34 };   // world radius of the loader ring = the CSS ring radius (66 px) seen through the camera
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
function fitCamera() {
  camera.aspect = innerWidth / innerHeight;
  const half = 1.62 / (Number(params.get('zoom')) || 1), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));   // ?zoom= is for close-up recordings only
  camera.position.set(0, 0, Math.max(half / t, half / (t * camera.aspect)) + 0.2); // fit height, or width on portrait screens
  camera.updateProjectionMatrix();
  uRingR.value = 66 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / innerHeight;
}
fitCamera();

// ---------------------------------------------------------------- loader UI
let ringTarget = 0;
function setProgress(p) {
  const v = Math.max(0, Math.min(100, Math.floor(p)));
  ringTarget = v / 100; el.arc.classList.remove('indeterminate');
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
  // Normal (alpha) blending: overlapping translucent dots converge to the dot colour instead of summing into hot spots.
  transparent: true, depthWrite: false, depthTest: false, blending: cal.blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  uniforms: {
    uIntro: { value: 0 }, uSpin: { value: 0 }, uSweep: { value: -9 }, uGlint: { value: -9 },
    uLight: { value: new THREE.Vector3(0, 0, 2) }, uLightOn: { value: 0 },
    uHead: { value: new THREE.Vector2(0, 0) }, uBody: { value: 0 },
    uPivot: { value: new THREE.Vector3(0, 0, 0) }, uBounds: { value: new THREE.Vector2(-1.4, 1.4) },
    uRatio: { value: 1 }, uPointScale: { value: 1 }, uRingR,
    uSize: { value: cal.size }, uBack: { value: cal.back }, uAlpha: { value: cal.alpha }, uGain: { value: cal.gain }, uRefZ: { value: 5.6 }
  },
  vertexShader: /* glsl */`
    attribute float aSeed; attribute float aKind;
    uniform float uIntro, uSpin, uSweep, uGlint, uRatio, uPointScale, uLightOn, uBody, uRingR, uSize, uBack, uGain, uRefZ;
    uniform vec3 uLight, uPivot; uniform vec2 uHead, uBounds;
    varying float vBright; varying float vSeed; varying float vGlint;
    vec3 yawRot(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
    vec3 pitchRot(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
    void main(){
      vSeed = aSeed; vGlint = 0.;
      float r1 = aSeed;                                   // size random
      float r2 = fract(sin(aSeed * 91.7 + 3.1) * 437.58);   // brightness random (independent of r1)
      float h = clamp((position.y - uBounds.x) / (uBounds.y - uBounds.x), 0., 1.);

      // (1) one-time unfold: a ring of dots releases top-down (head first) and swirls into the bust.
      float th = aSeed * 6.2831853 + uSpin;
      vec3 start = vec3(cos(th), sin(th), 0.) * (uRingR + (fract(aSeed * 7.31) - .5) * .02);
      float delay = .50 * (1. - h) + .10 * aSeed;
      float te = clamp((uIntro - delay) / .40, 0., 1.);
      float e = 1. - pow(1. - te, 3.);
      vec3 pos = mix(start, position, e);
      float ang = (1. - e) * 1.25 * (1. - .5 * h);
      float ca = cos(ang), sa = sin(ang);
      pos.xy = vec2(pos.x * ca - pos.y * sa, pos.x * sa + pos.y * ca);
      pos.xy *= 1. + .16 * sin(e * 3.14159);
      float flight = sin(e * 3.14159);

      // (2) head turns over the shoulders
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
      vec3 V = normalize(cameraPosition - world.xyz);
      float facing = dot(wn, V);

      // lighting terms of the reference brightness model:  b = .3 + key*.14 + lit*1.5 + rim*.12
      float key = max(0., dot(wn, normalize(vec3(-.45, .65, .62))));
      float rim = pow(1. - abs(facing), 2.);
      vec3 toL = uLight - world.xyz;
      float dist = length(toL); vec3 L = toL / max(dist, .001);
      float reach = pow(max(0., 1. - dist * .42), 2.);
      float lit = reach * (.35 + .65 * max(0., dot(wn, L))) * uLightOn * .62;   // wide, soft pool: peak ~.6 -> about +.9 on the base (capped below white)
      float spec = pow(max(0., dot(reflect(-L, wn), vec3(0., 0., 1.))), 16.) * pow(max(0., 1. - dist * .55), 2.) * uLightOn;
      float sweep = exp(-pow((world.y + world.x * .18 - uSweep) * 3.2, 2.));
      float near = clamp(.5 + .5 * world.z / 1.2, 0., 1.);

      float b = .30 + key * .14 + lit * 1.5 + rim * .12 + sweep * .45;
      float sizeK = 1. + 2. * pow(r1, 2.2);                                  // 1x ... 3x size variation, most dots fine
      float extra = 0.;
      if (aKind > .5 && aKind < 1.5) { b += .12; sizeK *= .9; extra = spec * .3; }       // spectacle rim: a touch brighter
      if (aKind > 1.5) {                                                              // lens: faint, glint + cursor reflex
        float glint = exp(-pow((world.x - uGlint) * 5., 2.));
        b = .06 + glint * .5; sizeK = 1.1; extra = spec * .9 + lit * .6; vGlint = clamp(max(glint, spec * .8 + lit * .3), 0., 1.);
      }
      b += extra;
      b *= mix(uBack, 1., smoothstep(-.3, .25, facing));                       // surfaces turned away dim down
      b *= .7 + r2 * .5;                                                       // per-dot brightness variation
      b *= .9 + .2 * near;                                                     // subtle depth cue
      b *= mix(.30, 1., smoothstep(0., .28, te)) * (1. + .5 * flight);
      vBright = min(1.0, b * uGain);   // hard ceiling: no blown highlights
      vec4 view = viewMatrix * world;
      gl_Position = projectionMatrix * view;
      // sprite diameter in device pixels: uSize css-px-at-800px-height * ratio, perspective-scaled, depth cue, never below a soft-gaussian-safe 3 px
      float psz = (uSize * sizeK * (.88 + .24 * near) * (1. + .25 * lit) + sweep * .8 + flight * .8) * uRatio * uPointScale * uRefZ / -view.z;
      gl_PointSize = clamp(psz, 3., 18. * max(1., uRatio));
    }`,
  fragmentShader: /* glsl */`
    precision mediump float; varying float vBright; varying float vSeed; varying float vGlint; uniform float uAlpha;
    void main(){
      float r = length(gl_PointCoord - .5);
      float a = exp(-r * r * 16.);                   // gaussian falloff from the reference
      a *= uAlpha * smoothstep(.5, .42, r);          // reaches exactly 0 at the sprite edge: no visible square/disc
      if (a < .006) discard;
      vec3 tint = mix(vec3(.80,.82,.85), vec3(.90,.92,.95), vSeed);
      tint = mix(tint, vec3(.66,.76,.98), vGlint * .7);   // cool reflex on the lenses only
      gl_FragColor = vec4(tint * vBright, a);
    }`
});

material.uniforms.uRefZ.value = camera.position.z;

// ---------------------------------------------------------------- loader ring (dots, driven by real bytes) + drifting dust
const softPoint = /* glsl */`precision mediump float; varying float vB;
  void main(){ float r = length(gl_PointCoord - .5); float a = exp(-r * r * 16.) * smoothstep(.5, .42, r); if (a < .006) discard; gl_FragColor = vec4(vec3(.80,.82,.86) * vB, a); }`;
const RING_N = 720, ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RING_N * 3), 3));
ringGeo.setAttribute('aAng', new THREE.BufferAttribute(Float32Array.from({ length: RING_N }, (_, i) => i / RING_N), 1));
const ringMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uR: uRingR, uProg: { value: 0 }, uRatio: material.uniforms.uRatio, uAlpha: { value: 1 } },
  vertexShader: /* glsl */`attribute float aAng; uniform float uR, uProg, uRatio, uAlpha; varying float vB;
    void main(){ float a = aAng * 6.2831853 - 1.5707963; vec3 p = vec3(cos(a), -sin(a), 0.) * uR;
      vB = (.14 + .86 * smoothstep(0., .02, uProg - aAng)) * uAlpha;
      vec4 view = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * view;
      gl_PointSize = clamp(4.6 * uRatio * 5.6 / -view.z, 3., 12.); }`,
  fragmentShader: softPoint
});
const ring = new THREE.Points(ringGeo, ringMat); ring.frustumCulled = false; scene.add(ring);

const DUST_N = mobile ? 380 : 900, dustPos = new Float32Array(DUST_N * 3), dustSeed = new Float32Array(DUST_N);
{ let q = 11; const r = () => ((q = Math.imul(q ^ (q >>> 15), 2246822507) + 0x9E3779B9 | 0), (q >>> 0) / 4294967296);
  for (let i = 0; i < DUST_N; i++) { dustPos.set([(r() - .5) * 7.2, (r() - .5) * 4.4, -2.4 + r() * 3.4], i * 3); dustSeed[i] = r(); } }
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uDust: { value: 0 }, uRatio: material.uniforms.uRatio },
  vertexShader: /* glsl */`attribute float aSeed; uniform float uTime, uRatio, uDust; varying float vB;
    void main(){ vec3 p = position + vec3(sin(uTime * (.05 + .04 * aSeed) + aSeed * 40.), cos(uTime * (.04 + .03 * aSeed) + aSeed * 17.), sin(uTime * .045 + aSeed * 9.)) * .16;
      float near = clamp(.5 + .5 * p.z / 1.4, 0., 1.);
      vB = (.07 + .12 * aSeed * aSeed) * (.55 + .9 * near) * uDust;
      vec4 view = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * view;
      gl_PointSize = clamp((2.6 + 3. * aSeed * aSeed) * (.7 + .6 * near) * uRatio * 5.6 / -view.z, 3., 9. * max(1., uRatio)); }`,
  fragmentShader: softPoint
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);
let ringShown = 0;
function ambient(t, elapsed, dtS) {                         // ring progress + dust drift: shared by the pre-load loop and the main loop
  ringShown += (ringTarget - ringShown) * (1 - Math.exp(-dtS * 9)); if (ringTarget >= 1 && ringShown > .995) ringShown = 1;
  ringMat.uniforms.uProg.value = ringShown * 1.0005;
  ringMat.uniforms.uAlpha.value = 1 - THREE.MathUtils.smoothstep(material.uniforms.uIntro.value, 0.10, 0.45);   // the dot ring stays until the bust dots have emerged
  dustMat.uniforms.uTime.value = (reducedMotion || STILL) ? 0 : t / 1000;
  dustMat.uniforms.uDust.value = Math.min(1, dustMat.uniforms.uDust.value + dtS / 2.5);
}
let preT = 0;
function preTick(t) { const dtS = Math.min(0.1, Math.max(0.001, (t - (preT || t - 16)) / 1000)); preT = t; material.uniforms.uSpin.value = reducedMotion ? 0 : t / 1000 * 0.45; ambient(t, 0, dtS); renderer.render(scene, camera); }
renderer.setAnimationLoop(preTick);
window.__scene = { ringPx: () => Math.abs(new THREE.Vector3(uRingR.value, 0, 0).project(camera).x) * innerWidth / 2, dustCount: DUST_N, dustTime: () => dustMat.uniforms.uTime.value };   // inspection hooks for the automated checks

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
addEventListener('resize', () => { applyResolution(); fitCamera(); material.uniforms.uRefZ.value = camera.position.z; });
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
const focus = (params.get('focus') || '0,0').split(',').map(Number);   // ?focus=x,y (world units) with ?zoom= for close-ups
const sYaw = { v: 0 }, sPitch = { v: 0 }, sPx = { v: 0 }, sPy = { v: 0 };
let headYaw = 0, headPitch = 0, camX = 0, camY = 0, prevT = 0;
const lightPark = new THREE.Vector3();

function tick(t) {
  const dtS = Math.min(0.1, Math.max(0.001, (t - (prevT || t - 16)) / 1000)); prevT = t;
  const elapsed = (reducedMotion || STILL) ? 99 : (t - begin) / 1000;
  const u = material.uniforms, inspect = params.has('yaw');
  ambient(t, elapsed, dtS);
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
    headYaw = smoothDamp(headYaw, px * 0.42 * live, sYaw, 0.50, dtS, 0.65);            // +-24 deg, soft lag (~0.4 s)
    headPitch = smoothDamp(headPitch, -py * 0.13 * live, sPitch, 0.45, dtS, 0.8);
    camX = smoothDamp(camX, px * 0.22 * live, sPx, 0.6, dtS, 1.0);               // slight parallax so the volume reads as 3D
    camY = smoothDamp(camY, py * 0.09 * live, sPy, 0.6, dtS, 1.0);
  }
  u.uHead.value.set(headYaw, headPitch); u.uBody.value = headYaw * 0.28;
  camera.position.x = camX + focus[0]; camera.position.y = camY + focus[1]; camera.lookAt(focus[0], focus[1], 0); camera.updateMatrixWorld();
  cloud.rotation.y = inspect ? THREE.MathUtils.degToRad(Number(params.get('yaw')) || 0) : 0;

  // cursor light on a plane in front of the bust; before the first cursor move it wanders slowly as a hint (not in reduced motion)
  let intensity;
  if (pointer.seen && pointer.active) {
    ndc.set(pointer.x, pointer.y, .5).unproject(camera); dirV.copy(ndc).sub(camera.position).normalize();
    lightTarget.copy(camera.position).addScaledVector(dirV, (camera.position.z - 0.95) / -dirV.z);
    intensity = 1;
  } else if (STILL) {
    lightTarget.set(-0.55, 0.55, .95); intensity = 1;
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
  material.uniforms.uSize.value = cal.size * Math.sqrt(66000 / result.count);   // keep the dot coverage constant when fewer dots are drawn (mobile, ?points=)
  setProgress(100);
  for (let w = 0; w < 40 && ringShown < 0.99 && !reducedMotion; w++) await new Promise((res) => setTimeout(res, 50));   // let the ring finish filling (max 2 s)
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
  el.panel.hidden = false; document.documentElement.classList.add('live');
  begin = performance.now();
  el.replay.addEventListener('click', () => { begin = performance.now(); material.uniforms.uLightOn.value = 0; headYaw = headPitch = 0; sYaw.v = sPitch.v = 0; });
  renderer.setAnimationLoop(tick);
  window.__dots = { intro: () => material.uniforms.uIntro.value, sweep: () => material.uniforms.uSweep.value, yaw: () => material.uniforms.uHead.value.x, pitch: () => material.uniforms.uHead.value.y, light: () => material.uniforms.uLight.value.toArray(), lightOn: () => material.uniforms.uLightOn.value, count: dotCount, mode: modeLabel, ready: true, buffer: { ...buffer, css: [innerWidth, innerHeight], devicePixelRatio, maxDim } }; // used by the automated check
}
start().catch((err) => fail(`FEHLER BEIM START — ${err.message || err}`));
