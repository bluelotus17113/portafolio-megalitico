/**
 * Captura en primera persona desde donde aterriza el visitante.
 *
 * `fly.mjs` coloca la cámara donde uno quiera; este la pone donde la pone el
 * juego — de pie, a altura de ojos, en el sitio y con el rumbo con los que
 * arranca el modo a pie. Es la única forma de revisar ese encuadre sin abrir el
 * navegador, y es el primer fotograma que ve cualquiera que entre.
 *
 *   node tools/shoot-walk.mjs [x,z] [pasos] [salida.png]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

// Sin argumento se usa el punto de entrada REAL del juego, no un sitio
// parecido: lo que se quiere revisar es el primer fotograma que ve cualquiera.
const DESDE = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const PASOS = Number(process.argv[3] ?? 0);
const OUT = process.argv[4] ?? 'captures/a-pie.png';
const URL = process.env.URL ?? 'http://127.0.0.1:5173/?instant';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}
await mkdir(dirname(OUT), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(([desde, pasos]) => {
  const ex = window.__portfolio;
  const rig = ex.rig;
  rig.enabled = true;
  const p0 = desde ? { x: desde[0], z: desde[1] } : ex.puntoDeEntrada;
  rig.plantar(p0.x, p0.z, ex.rumboDeEntrada);
  rig.free.pointerLocked = true;
  // Los pasos se avanzan a mano: aquí el navegador da un fotograma por segundo.
  if (pasos > 0) {
    rig.free.keys.add('KeyW');
    for (let i = 0; i < pasos; i++) rig.update(0.05);
    rig.free.keys.clear();
    for (let i = 0; i < 20; i++) rig.update(0.05);
  }
  const p = ex.camera.position;
  return { pos: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], suelo: +(p.y - rig.walk.ojos).toFixed(2) };
}, [DESDE, PASOS]);

await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: OUT });
console.log(`de pie en ${info.pos} · suelo ${info.suelo}`);
console.log(errores.length ? `✗ ${errores.length} errores:\n  ${errores.join('\n  ')}` : '✓ Consola limpia');
console.log(`Captura en ${OUT}`);
await browser.close();
