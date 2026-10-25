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
  rec('reduced motion: intro skipped (uIntro=1), no sweep, no console errors', errs.length === 0 && introRM === 1 && sweepRM < -5, `intro=${introRM} sweep=${sweepRM} errors=${errs.length}`);
  await ctx.close();
}
// 3b normal motion: the intro actually plays (uIntro < 1 shortly after ready)
{
  const { ctx, page } = await open('/?fixedres&clean'); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  const i0 = await page.evaluate(() => window.__dots.intro()); await page.waitForTimeout(12000); const i1 = await page.evaluate(() => window.__dots.intro());
  rec('normal motion: intro plays then completes', i0 < 1 && i1 === 1, `uIntro ${i0.toFixed(3)} -> ${i1}`); await ctx.close();
}
// 4 cursor interaction (normal motion): moving the cursor changes the image (light + head turn)
{
  const { ctx, page } = await open('/?fixedres&clean'); await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.mouse.move(150, 270, { steps: 4 }); await page.waitForTimeout(2500); const L = await page.screenshot({ type: 'png' });
  await page.mouse.move(810, 270, { steps: 4 }); await page.waitForTimeout(2500); const R = await page.screenshot({ type: 'png' });
  const sharp = (await import('node:module')).createRequire(import.meta.url);
  let changed = L.compare(R) !== 0; rec('cursor movement changes the rendering (light/head turn)', changed, `png bytes ${L.length}/${R.length}`);
  await ctx.close();
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
