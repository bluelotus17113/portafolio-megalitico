/**
 * Capturas del ciclo de día.
 *
 * Recorre los cuatro momentos y guarda una imagen de cada uno desde el
 * mirador. Sirve para comparar las cuatro paletas de un vistazo, que es la
 * única forma de ver si funcionan: cada una por separado siempre parece
 * correcta, y lo que falla es la relación entre ellas.
 *
 * IMPRESCINDIBLE congelar la cámara antes de disparar. `CameraRig` tiene un
 * `idleDrift` que empieza a girar el azimut a los SEIS segundos sin tocar nada,
 * y la espera de esta herramienta es justo de seis segundos: sin congelarla,
 * cada foto sale desde un sitio distinto y las cuatro dejan de ser comparables.
 * Comparándolas así una vez, la noche parecía quedarse al 75 % de un mediodía
 * cuando en realidad estaba al 34 % — lo que se estaba midiendo era el giro.
 *
 *   node tools/daylight.mjs [url] [carpeta]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/?instant';
const OUT = process.argv[3] ?? 'captures/dia';

const CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
].filter(Boolean).find((p) => existsSync(p));

if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 800 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/404|font/i.test(m.text())) errors.push(m.text().slice(0, 160));
});

console.log('→', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 180000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 4000));

// Cámara clavada: ver la cabecera.
await page.evaluate(() => {
  const rig = window.__portfolio.rig;
  rig.idleDrift = false;
  rig.idleTimer = 0;
});

const phases = await page.evaluate(() =>
  [...document.querySelectorAll('.daylight__option')].map((b) => b.dataset.phase)
);
if (!phases.length) {
  console.error('No hay selector de momento del día en la interfaz.');
  process.exit(1);
}

for (const id of phases) {
  // Se pulsa el botón de verdad —así se comprueba también que el control
  // funciona— y luego se clava la fase.
  //
  // Esperar a que la transición llegue sola no vale aquí. El delta va topado a
  // 0,1 s por fotograma, y con SwiftShader esto corre a medio fotograma por
  // segundo: el mundo avanza una décima por cada dos segundos de reloj, así que
  // en seis segundos la transición se queda a un tercio del camino y la noche
  // sale al 78 % de un mediodía en vez de al 34 %. En un navegador de verdad, a
  // 60 fps, la misma transición dura los dos segundos de siempre.
  await page.click(`.daylight__option[data-phase="${id}"]`);
  await page.evaluate((p) => window.__portfolio.world.time.set(p, true), id);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/${id}.png` });
  const applied = await page.evaluate(() => window.__portfolio.world.time.current);
  console.log(`  ✓ ${id}${applied === id ? '' : ` (aplicado: ${applied})`}`);
}

console.log(errors.length ? 'ERRORES:\n' + errors.slice(0, 5).join('\n') : '✓ Consola limpia');
await browser.close();
