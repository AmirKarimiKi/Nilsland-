// Records the real application (headless Chromium, software GL) while a scripted cursor path plays: unfold, idle light, head turn, light travel.
// Usage: node scripts/record-demo.mjs [baseUrl] [outDir]  -> <outDir>/demo.webm   (convert with ffmpeg for mp4)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://localhost:4173', out = process.argv[3] || 'work/vid';
const W = 800, H = 450;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: out, size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.goto(base + '/?fixedres');
await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 60000 });
await page.waitForTimeout(6800);                       // unfold + sweep (~5.5 s) and the parked light wandering
const path = [[0.5, 0.2, 1100], [0.18, 0.28, 1500], [0.5, 0.3, 1400], [0.82, 0.28, 1500], [0.5, 0.3, 1000], [0.5, 0.75, 1500], [0.2, 0.8, 1300], [0.8, 0.8, 1500], [0.5, 0.35, 1200]];
await page.mouse.move(W * 0.95, H * 0.1);              // first cursor contact: the wandering hint light hands over
await page.waitForTimeout(700);
for (const [fx, fy, ms] of path) { await page.mouse.move(W * fx, H * fy, { steps: 28 }); await page.waitForTimeout(ms); }
await page.waitForTimeout(900);
const info = await page.evaluate(() => ({ fps: window.__dots.fps, buffer: window.__dots.buffer }));
await ctx.close(); await browser.close();
console.log('recorded', JSON.stringify(info));
