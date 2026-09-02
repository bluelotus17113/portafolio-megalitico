/**
 * Captura del banco de pruebas de la cantería.
 *
 * Necesita el servidor de desarrollo levantado (`npm run dev`), porque el banco
 * vive en tools/ y `vite build` no lo empaqueta.
 *
 *   node tools/shoot-stones.mjs [url] [salida.png]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.argv[2] ?? 'http://127.0.0.1:5173/tools/stone-preview.html';
const OUT = process.argv[3] ?? 'captures/piedra.png';

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
await page.setViewport({ width: 1600, height: 700 });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  // El banco no tiene favicon y Vite la pide igual: ese 404 no es un error de
  // la escena y taparlo aquí evita que la herramienta grite cada vez.
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => document.body.dataset.listo === '1', { timeout: 180000 });
await page.screenshot({ path: OUT });
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
if (hud) console.log(hud);
console.log(errores.length ? 'ERRORES:\n' + errores.slice(0, 4).join('\n') : '✓ Consola limpia');
await browser.close();
