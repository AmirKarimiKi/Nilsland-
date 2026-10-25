// Behavioural checks in headless Chromium (software GL): reduced motion, context loss/restore, missing-asset error,
// cursor/touch response, loader progress. Usage: node scripts/verify-behaviour.mjs [baseUrl]  (needs `playwright`)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://localhost:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = []; const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail); };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) n++; return n; };
async function open(url, opts = {}) { const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...opts }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); await page.goto(base + url); return { ctx, page, errs }; }
const raw = async (page) => (await import('node:zlib')).inflateSync ? null : null;

// 1 loader progress comes from real bytes: watch #pct while the bin is throttled
{
  const { ctx, page } = await open('/?asset=test&fixedres', {});
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 960, height: 540 } }); const p2 = await c2.newPage(); const seen = [];
  await p2.route('**/portrait-points.bin', async (route) => { const r = await route.fetch(); const body = await r.body(); await new Promise((res) => setTimeout(res, 400)); await route.fulfill({ response: r, body }); });
  await p2.goto(base + '/?asset=test&fixedres');
  for (let i = 0; i < 12; i++) { seen.push(await p2.textContent('#pct').catch(() => '')); await p2.waitForTimeout(150); }
  await p2.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  rec('loader shows percentage then completes', seen.some((t) => /%/.test(t)) && (await p2.textContent('#pct')) === '100%', JSON.stringify([...new Set(seen)]));
  await c2.close();
}
// 2 missing asset -> explicit error, no preview
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } }); const page = await ctx.newPage();
  await page.route('**/portrait-points.bin', (r) => r.fulfill({ status: 404, body: 'x' }));
  await page.route('**/portrait-meta.json', (r) => r.fulfill({ status: 404, body: 'x' }));
  await page.goto(base + '/'); await page.waitForTimeout(1500);
  const t = await page.textContent('#error'); const hidden = await page.$eval('#error', (e) => e.hidden);
  rec('missing asset shows explicit error state', !hidden && /PORTRAIT-ASSET FEHLT/.test(t), t.slice(0, 60));
  await ctx.close();
}
// 3 reduced motion: no intro/sweep, no head rotation
{
  const { ctx, page, errs } = await open('/?fixedres&clean', { reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500); const a = await page.screenshot({ type: 'jpeg', quality: 60 });
  await page.mouse.move(100, 270); await page.waitForTimeout(1500); const b = await page.screenshot({ type: 'jpeg', quality: 60 });
  const introRM = await page.evaluate(() => window.__dots.intro()), sweepRM = await page.evaluate(() => window.__dots.sweep());
  await page.mouse.move(900, 100); await page.waitForTimeout(800); const yawRM = await page.evaluate(() => window.__dots.yaw());
  rec('reduced motion: intro skipped (uIntro=1), no sweep, no head turn, no console errors', errs.length === 0 && introRM === 1 && sweepRM < -5 && yawRM === 0, `intro=${introRM} sweep=${sweepRM} yaw=${yawRM} errors=${errs.length}`);
  await ctx.close();
}
// 3b normal motion: the intro actually plays (uIntro < 1 shortly after ready)
{
  const { ctx, page } = await open('/?fixedres&clean'); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  const i0 = await page.evaluate(() => window.__dots.intro()); await page.waitForTimeout(12000); const i1 = await page.evaluate(() => window.__dots.intro());
  rec('normal motion: intro plays then completes', i0 < 1 && i1 === 1, `uIntro ${i0.toFixed(3)} -> ${i1}`); await ctx.close();
}
// 4 motion timeline, head follow, cursor light (needs pngjs)
import { PNG } from 'pngjs';
const lum = (buf) => { const png = PNG.sync.read(buf), { width: w, height: h, data } = png; const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = 0.3 * data[i * 4] + 0.59 * data[i * 4 + 1] + 0.11 * data[i * 4 + 2]; return { w, h, L }; };
const bbox = ({ w, h, L }, thr = 60) => { let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y * w + x] > thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return n < 30 ? null : { w: x1 - x0 + 1, h: y1 - y0 + 1, n }; };
const meanBox = ({ w, L }, x0, y0, x1, y1) => { let s = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += L[y * w + x]; c++; } return s / c; };
{ // 4a unfold: a ring grows into the bust over time (intro value + silhouette size per sample)
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }); const page = await ctx.newPage();
  await page.goto(base + '/?fixedres&clean'); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  const samples = [];
  for (let i = 0; i < 40; i++) { const iv = await page.evaluate(() => window.__dots.intro()); const bb = bbox(lum(await page.screenshot())); samples.push({ iv: +iv.toFixed(2), h: bb?.h ?? 0, w: bb?.w ?? 0 }); if (iv >= 1 && i > 6) break; }
  const final = samples[samples.length - 1], early = samples.filter((s) => s.iv < 0.25 && s.h > 0), mid = samples.filter((s) => s.iv > 0.3 && s.iv < 0.9);
  const hs = samples.map((s) => s.h).filter((h) => h > 0), mono = hs.every((h, i) => i === 0 || h >= hs[i - 1] - 6);
  const grows = early.length > 0 && early[0].h < 0.6 * final.h && mid.length >= 1 && mid.every((s) => s.h > 0) && mono;
  rec('unfold: ring -> bust is visible over time (silhouette grows monotonically, >=1 mid-flight sample)', grows && final.iv === 1, JSON.stringify(samples.map((s) => `${s.iv}:${s.h}`)));
  await ctx.close();
}
{ // 4b head follows cursor softly (yaw/pitch uniforms sampled at ~25 Hz), light follows cursor
  const { ctx, page } = await open('/?fixedres&clean'); await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForFunction(() => window.__dots?.intro?.() === 1, null, { timeout: 60000 }); await page.waitForTimeout(3500);
  const trace = async (ms) => { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await page.evaluate(() => [performance.now(), window.__dots.yaw()])); await page.waitForTimeout(40); } return out; };
  const speed = (tr) => Math.max(...tr.slice(1).map(([t, y], i) => Math.abs(y - tr[i][1]) / ((t - tr[i][0]) / 1000)));   // rad/s from in-page timestamps (robust to slow software frames)
  await page.mouse.move(600, 150); const tr1 = await trace(2600); const r = tr1.map((p) => p[1]); const fin = r[r.length - 1];
  const maxStep = speed(tr1), over = Math.max(...r) / fin;
  rec('head turns toward cursor (right): final yaw 0.25-0.45 rad', fin > 0.25 && fin < 0.45, `yaw=${fin.toFixed(3)}`);
  rec('head follow is soft: speed <= 1.5 rad/s, no overshoot, visible lag', maxStep < 1.5 && over < 1.04 && r[2] < 0.5 * fin, `maxSpeed=${maxStep.toFixed(2)} rad/s overshoot=${over.toFixed(3)} early=${r[2].toFixed(3)}`);
  await page.mouse.move(40, 150); const tr2 = await trace(2600); const l = tr2.map((p) => p[1]);
  rec('swinging the cursor to the other side reverses the turn smoothly', l[l.length - 1] < -0.25 && speed(tr2) < 1.5, `yaw=${l[l.length - 1].toFixed(3)} maxSpeed=${speed(tr2).toFixed(2)} rad/s`);
  // light pool: brightness of the lit region rises when the cursor is over it
  const shot = async (fx, fy) => { await page.mouse.move(640 * fx, 360 * fy, { steps: 5 }); await page.waitForTimeout(2500); return lum(await page.screenshot()); };
  const corner = await shot(0.02, 0.97), head = await shot(0.5, 0.18), chest = await shot(0.5, 0.7);
  const hb = [230, 20, 360, 130], cb = [200, 200, 440, 330];
  const headGain = meanBox(head, ...hb) / meanBox(corner, ...hb), chestGain = meanBox(chest, ...cb) / meanBox(corner, ...cb);
  rec('cursor light pool: lit region >= 1.25x brighter (head and chest)', headGain >= 1.25 && chestGain >= 1.25, `head x${headGain.toFixed(2)} chest x${chestGain.toFixed(2)}`);
  await ctx.close();
}
// 4c loader ring = dot ring with the CSS ring's radius; dust drifts (and is frozen under reduced motion)
{
  const { ctx, page } = await open('/?fixedres&clean'); await page.waitForFunction(() => window.__scene, null, { timeout: 30000 });
  const px = await page.evaluate(() => window.__scene.ringPx()); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  const t0 = await page.evaluate(() => window.__scene.dustTime()); await page.waitForTimeout(2500); const t1 = await page.evaluate(() => window.__scene.dustTime());
  rec('loader ring (WebGL dots) has the 66 px radius of the CSS ring', Math.abs(px - 66) < 2, `ring radius = ${px.toFixed(1)} px`);
  rec('ambient dust drifts slowly (time advances)', t1 > t0 + 1, `dust time ${t0.toFixed(1)} -> ${t1.toFixed(1)}, ${await page.evaluate(() => window.__scene.dustCount)} dust dots`);
  await ctx.close();
  const rm = await open('/?fixedres&clean', { reducedMotion: 'reduce' }); await rm.page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 }); await rm.page.waitForTimeout(1500);
  rec('reduced motion: dust is frozen', (await rm.page.evaluate(() => window.__scene.dustTime())) === 0); await rm.ctx.close();
}
// 5 touch
{
  const { ctx, page, errs } = await open('/?fixedres', { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 }); await page.waitForTimeout(6000);
  const before = await page.screenshot({ type: 'png' }); await page.touchscreen.tap(300, 350); await page.waitForTimeout(2500); const after = await page.screenshot({ type: 'png' });
  const info = await page.evaluate(() => window.__dots);
  rec('touch: tap is handled, mobile uses reduced dots', before.compare(after) !== 0 && info.count <= 36000 && errs.length === 0, `dots=${info.count} buffer=${info.buffer.w}x${info.buffer.h}`);
  await ctx.close();
}
// 6 context loss + restore
{
  const { ctx, page } = await open('/?fixedres&clean'); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl'); window.__ext = gl.getExtension('WEBGL_lose_context'); window.__ext.loseContext(); });
  await page.waitForTimeout(800); const note = await page.textContent('#note');
  await page.evaluate(() => window.__ext.restoreContext()); await page.waitForTimeout(2500);
  const note2 = await page.textContent('#note'); const fps = await page.evaluate(() => window.__dots.fps);
  rec('context loss shows a message, restore resumes rendering', /VERLOREN/.test(note) && !/VERLOREN/.test(note2), `${note.slice(0, 40)} -> ${note2.slice(0, 30)}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync('docs/VERIFY_RESULTS.json', JSON.stringify({ date: new Date().toISOString(), env: 'headless Chromium, SwiftShader (software GL) - not GPU', results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
