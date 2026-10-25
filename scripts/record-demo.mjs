// Records the real application (headless Chromium, software GL) while a scripted cursor path plays.
// Usage: node scripts/record-demo.mjs <baseUrl> <outDir> [query] [WxH]
//   env THROTTLE_MS: delay the point file so the loader ring is visible filling.  env CLOSEUP=1: short cursor path for a zoomed close-up.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://localhost:4173', out = process.argv[3] || 'work/vid', query = process.argv[4] || '?fixedres';
const [W, H] = (process.argv[5] || '960x540').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
const page = await ctx.newPage();
const delay = Number(process.env.THROTTLE_MS || 0);
if (delay) await page.route('**/portrait-points.bin', async (r) => { const resp = await r.fetch(); const body = await resp.body(); await new Promise((x) => setTimeout(x, delay)); await r.fulfill({ response: resp, body }); });
await page.goto(base + '/' + query);
await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 90000 });
await page.waitForFunction(() => window.__dots.intro() >= 1, null, { timeout: 60000 });
await page.waitForTimeout(process.env.CLOSEUP ? 2500 : 5200);   // sweep, then the calm resting state without any cursor
const m = (fx, fy, ms) => page.mouse.move(W * fx, H * fy, { steps: 30 }).then(() => page.waitForTimeout(ms));
if (process.env.CLOSEUP) { for (const [x, y, ms] of [[0.3, 0.5, 1800], [0.7, 0.5, 2200], [0.5, 0.3, 1800], [0.5, 0.7, 1800], [0.5, 0.5, 1200]]) await m(x, y, ms); }
else { await page.mouse.move(W * 0.97, H * 0.1); await page.waitForTimeout(500);
  for (const [x, y, ms] of [[0.5, 0.35, 1500], [0.1, 0.45, 2300], [0.9, 0.45, 2500], [0.5, 0.05, 2000], [0.5, 0.95, 2000], [0.5, 0.4, 1500]]) await m(x, y, ms); }
const info = await page.evaluate(() => ({ fps: window.__dots.fps, buffer: window.__dots.buffer }));
await ctx.close(); await browser.close(); console.log('recorded', JSON.stringify(info));
