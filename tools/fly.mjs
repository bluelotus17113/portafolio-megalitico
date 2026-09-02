/**
 * Captura desde un punto de vista arbitrario.
 *
 * `shoot.mjs` recorre las seis vistas guionizadas, que es lo que hace falta para
 * revisar un cambio de estilo. Cuando lo que se está mirando es el TERRENO —una
 * ladera concreta, por dónde pasa un camino, dónde cabe una boca de túnel— esas
 * seis vistas no sirven: hay que poder ponerse encima del sitio.
 *
 * Usa el modo de vuelo libre del propio rig, así que lo que se ve es lo que
 * vería el visitante desde ahí.
 *
 *   node tools/fly.mjs <x,y,z> <mx,my,mz> [salida.png]
 *
 *   node tools/fly.mjs -40,95,-10 -34,55,-34 captures/escarpe.png
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const vec = (s, def) => {
  if (!s) return def;
  const v = s.split(',').map(Number);
  if (v.length !== 3 || v.some(Number.isNaN)) throw new Error(`Vector inválido: ${s}`);
  return v;
};

const POS = vec(process.argv[2], [0, 120, 120]);
const MIRA = vec(process.argv[3], [0, 50, 0]);
const OUT = process.argv[4] ?? 'captures/vuelo.png';
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
await page.setViewport({ width: Number(process.env.W ?? 1400), height: Number(process.env.H ?? 900) });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 180000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 3500));

const info = await page.evaluate(([pos, mira]) => {
  const rig = window.__portfolio.rig;
  rig.idleDrift = false;
  rig.idleTimer = 0;
  // Vuelo libre: la órbita no deja apuntar a cualquier sitio, y además sube la
  // cámara sola en cuanto la órbita la mete bajo tierra.
  rig.mode = 'free';
  rig.enabled = true;
  const cam = window.__portfolio.camera ?? rig.camera;
  cam.position.set(pos[0], pos[1], pos[2]);
  cam.lookAt(mira[0], mira[1], mira[2]);
  const e = cam.rotation.clone();
  rig.free.yaw = e.y;
  rig.free.pitch = e.x;
  rig.free.velocity.set(0, 0, 0);
  const suelo = window.__portfolio.world.field.height(pos[0], pos[2]);
  return { suelo: Number(suelo.toFixed(1)) };
}, [POS, MIRA]);

await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: OUT });
console.log(`cámara (${POS}) → (${MIRA})   suelo bajo la cámara: ${info.suelo} m`);
console.log(errores.length ? 'ERRORES:\n' + errores.slice(0, 4).join('\n') : '✓ Consola limpia');
await browser.close();
