// Optional browser check (needs `playwright`, not a project dependency). Usage:
//   npm run build && npx vite preview --port 4173 &   then   node scripts/verify-browser.mjs [baseUrl]
// Writes screenshots to docs/screenshots and prints the REAL WebGL drawing-buffer size and measured FPS.
// FPS from headless/software GL (SwiftShader) says nothing about GPU performance.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://localhost:4173';
const cases = [
  { name: 'fixture-4k-3840x2160', url: '/?asset=test&fixedres', w: 3840, h: 2160, dsf: 1 },
  { name: 'fixture-4k-via-dpr2-1920x1080', url: '/?asset=test&fixedres', w: 1920, h: 1080, dsf: 2 },
  { name: 'fixture-mobile-390x844', url: '/?asset=test', w: 390, h: 844, dsf: 2, mobile: true },
  { name: 'missing-asset-error', url: '/', w: 1280, h: 720, dsf: 1 },
];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: c.dsf, isMobile: !!c.mobile, hasTouch: !!c.mobile });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', (e) => logs.push(`pageerror: ${e}`));
  await page.goto(base + c.url);
  const ready = await page.waitForFunction(() => window.__dots?.ready, null, { timeout: 45000 }).then(() => true, () => false);
  if (ready) { await page.mouse.move(c.w * 0.6, c.h * 0.4); await page.waitForTimeout(7000); }
  else await page.waitForTimeout(1500);
  const info = await page.evaluate(() => { const cv = document.querySelector('canvas'); return { dots: window.__dots, canvas: cv && [cv.width, cv.height], err: document.querySelector('#error')?.hidden === false ? document.querySelector('#error').textContent : null }; });
  await page.screenshot({ path: `docs/screenshots/${c.name}.jpg` });
  console.log(c.name, JSON.stringify(info), logs.filter((l) => !l.startsWith('info')).slice(0, 3));
  await ctx.close();
}
await browser.close();
