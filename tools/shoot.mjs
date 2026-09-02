/**
 * Capturas de verificación.
 *
 * Abre la build en un Chromium headless con WebGL por software (SwiftShader),
 * entra en la escena, recorre las cinco secciones y guarda una imagen de cada
 * una. Sirve para revisar el resultado sin abrir el navegador a mano y para
 * detectar errores de consola que en desarrollo pasan desapercibidos.
 *
 *   node tools/shoot.mjs [url] [carpeta-destino]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// `?instant` salta los vuelos de cámara: con WebGL por software la escena
// corre a pocos fotogramas y una animación de cinco segundos tardaría
// minutos en completarse.
const URL = process.argv[2] ?? 'http://127.0.0.1:4173/?instant';
const OUT = process.argv[3] ?? 'captures';
const WIDTH = Number(process.env.SHOT_W ?? 1600);
const HEIGHT = Number(process.env.SHOT_H ?? 900);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOTS = [
  { id: null, name: '00-mirador' },
  { id: 'about', name: '01-about' },
  { id: 'projects', name: '02-projects' },
  { id: 'skills', name: '03-skills' },
  { id: 'experience', name: '04-experience' },
  { id: 'contact', name: '05-contact' },
];

/** Espera a que se dibujen N fotogramas de verdad, no a un reloj de pared. */
const waitFrames = (page, n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => (++i >= count ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n
  );

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // WebGL2 por software: sin esto el lienzo sale negro en headless.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-features=Vulkan',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    problems.push(`[${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => problems.push(`[request] ${req.url()} — ${req.failure()?.errorText}`));

console.log(`→ ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 120000 });

// Esperar a que el botón de entrada aparezca (la escena ya está montada).
try {
  await page.waitForFunction(
    () => {
      const b = document.querySelector('.loader__enter');
      return b && !b.hidden;
    },
    { timeout: 180000 }
  );
} catch {
  await page.screenshot({ path: `${OUT}/error-carga.png` });
  console.error('La escena no llegó a estar lista. Ver error-carga.png');
  console.error(problems.slice(0, 25).join('\n'));
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: `${OUT}/00a-carga.png` });
console.log('  ✓ pantalla de carga');

await page.click('.loader__enter');

for (const shot of SHOTS) {
  if (shot.id !== null) {
    await page.evaluate((id) => window.__portfolio.goTo(id), shot.id);
  }
  // Unos cuantos fotogramas para que arranquen los VFX y se asiente el SMAA.
  await waitFrames(page, 12);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log(`  ✓ ${shot.name}`);
}

// Una captura con el panel abierto de un proyecto: es la vista más densa.
await page.evaluate(() => window.__portfolio.overlay.open('projects'));
await sleep(900);
await page.evaluate(() => document.querySelector('[data-open-project]')?.click());
await sleep(1600);
await page.screenshot({ path: `${OUT}/06-panel-proyecto.png` });
console.log('  ✓ 06-panel-proyecto');

const stats = await page.evaluate(() => {
  const p = window.__portfolio;
  const info = p.renderer.info;
  return {
    fps: p.overlay.perf?.textContent ?? '?',
    calls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    quality: p.quality,
    grass: p.world.grass?.userData?.bladeCount ?? 0,
  };
});

console.log('\nEscena:');
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);

if (problems.length) {
  console.log(`\n⚠ ${problems.length} avisos/errores de consola:`);
  const seen = new Set();
  for (const p of problems) {
    const key = p.slice(0, 140);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log('  ' + key);
    if (seen.size >= 20) break;
  }
} else {
  console.log('\n✓ Consola limpia');
}

await browser.close();
