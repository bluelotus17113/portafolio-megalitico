/**
 * Verificación en Firefox.
 *
 * Existe porque Chromium no vale como único juez: la pantalla en negro que
 * tapaba la escena entera solo se daba en Firefox — un objetivo de render
 * half-float multimuestreado que Gecko no resuelve a textura — y las capturas
 * de `shoot.mjs`, hechas en Chromium, salían perfectas mientras la web estaba
 * rota. Cualquier cambio en la cadena de post-proceso o en un shader hay que
 * pasarlo por aquí.
 *
 *   node tools/firefox-check.mjs [url]
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/?instant';
const OUT = process.argv[3] ?? 'captures';

const CANDIDATES = [
  process.env.FIREFOX_PATH,
  '/usr/lib/firefox/firefox',
  '/usr/bin/firefox',
].filter(Boolean);

const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No encuentro Firefox. Define FIREFOX_PATH.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath,
  headless: true,
  protocol: 'webDriverBiDi',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 800 });

const errors = [];
page.on('pageerror', (e) => {
  if (!/font/i.test(e.message)) errors.push(e.message.slice(0, 180));
});
page.on('console', (m) => {
  if (m.type() === 'error' && !/404|font/i.test(m.text())) {
    errors.push('[consola] ' + m.text().slice(0, 160));
  }
});

console.log('→', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 180000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('.loader__enter');
    return el && !el.hidden;
  },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 6000));

const stats = await page.evaluate(() => {
  const app = window.__portfolio;
  const world = app.world;
  return {
    fps: app.overlay.perf.textContent,
    draws: app.renderer.info.render.calls,
    triangles: app.renderer.info.render.triangles,
    programs: app.renderer.info.programs.length,
    trees: world.forest?.count,
    shrubs: world.forest?.shrubCount,
    ferns: world.forest?.fernCount,
    blades: world.grass?.userData.bladeCount,
    flowers: world.grass?.userData.flowerCount,
  };
});

// Prueba del lienzo en negro.
//
// Se mide sobre una captura de pantalla de verdad, no leyendo el canvas con
// `drawImage`: sin `preserveDrawingBuffer` el búfer de dibujo se vacía en
// cuanto se compone el fotograma, así que leerlo devuelve negro transparente
// SIEMPRE — la prueba daba negativo con la escena perfectamente visible.
const shot = `${OUT}/firefox.png`;
await page.screenshot({ path: shot });

console.log(`Firefox ${stats.fps} · ${stats.programs} programas`);
console.log(
  `Escena: ${stats.trees} árboles · ${stats.shrubs} matas · ${stats.ferns} helechos · ` +
    `${stats.blades} briznas (${stats.flowers} con flor)`
);
console.log(`Captura en ${shot}`);
console.log(errors.length ? 'ERRORES:\n' + errors.slice(0, 5).join('\n') : '✓ Consola limpia');

await browser.close();
