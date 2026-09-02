/**
 * Captura del editor con una pieza seleccionada.
 *
 * `shoot.mjs` y `fly.mjs` fotografían el mundo; este fotografía la HERRAMIENTA,
 * que es lo único que no se ve desde ellas. Sirve para revisar el panel sin
 * abrir el navegador a mano y para ilustrar la documentación.
 *
 *   node tools/shoot-editor.mjs [pieza] [material] [salida.png]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const PIEZA = process.argv[2] ?? 'escalinata/escalinata-jamba-1-mar';
const MATERIAL = process.argv[3] ?? 'roca';
const OUT = process.argv[4] ?? 'captures/editor.png';
const URL = process.env.URL ?? 'http://127.0.0.1:5173/?editor&instant';

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
await page.setViewport({ width: 1500, height: 900 });

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
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(([pieza, material]) => {
  const editor = window.__portfolio.editor;
  const elegida = editor.seleccionar(pieza);
  if (elegida) editor.enfocar(elegida);
  const selector = document.querySelector('[data-material]');
  if (selector) {
    selector.value = material;
    selector.dispatchEvent(new Event('change'));
  }
  // El vuelo de `enfocar` se avanza a mano.
  //
  // Aquí el navegador corre sobre WebGL por software y da alrededor de un
  // fotograma por segundo, así que un vuelo de 0,8 s no se termina esperando:
  // `dt` viene topado a 0,1 s por fotograma y la cámara se quedaría a un octavo
  // del camino. Empujando el rig con pasos fijos la captura sale igual en
  // cualquier máquina, que es lo que se le pide a una herramienta de capturas.
  const rig = window.__portfolio.rig;
  for (let i = 0; i < 24 && rig.travel; i++) rig.update(0.1);

  return {
    seleccionada: Boolean(elegida),
    piezas: window.__portfolio.catalogo?.piezas?.size ?? 0,
    materiales: window.__portfolio.catalogo?.materiales?.size ?? 0,
    llego: !rig.travel,
  };
}, [PIEZA, MATERIAL]);

await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: OUT });

console.log(
  `${info.piezas} piezas · ${info.materiales} materiales · ` +
  `${info.seleccionada ? `seleccionada ${PIEZA}` : `NO existe ${PIEZA}`}` +
  `${info.llego ? ' · cámara en su sitio' : ' · la cámara NO llegó'}`
);
console.log(errores.length ? `✗ ${errores.length} errores:\n  ${errores.join('\n  ')}` : '✓ Consola limpia');
console.log(`Captura en ${OUT}`);

await browser.close();
