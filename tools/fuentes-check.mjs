/**
 * Qué cuestan las fuentes.
 *
 * Mide lo único que importa de un cambio de tipografía: cuántas peticiones se
 * hacen, a cuántos servidores distintos, cuántos bytes pesan y —lo que de
 * verdad ve el visitante— cuánto tarda el texto en estar dibujado con la letra
 * que le toca. Mientras eso no ocurre, la página se lee en Georgia y en la
 * sans del sistema, que es exactamente el aspecto que se estaba evitando.
 *
 * Corre contra las dos versiones, porque el problema no es el mismo: la escena
 * ya espera a `document.fonts.ready` antes de dibujar sus rótulos en canvas
 * —si no, se quedan grabados con la letra del sistema y ya no se rehacen—, así
 * que ahí una fuente lenta no afea: retrasa la carga entera.
 *
 *   node tools/fuentes-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});

/** Una pasada. Devuelve los recursos por URL única y cuándo estuvo la letra. */
async function pasada(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  // Sin caché: se mide la primera visita, que es la que decide si alguien se
  // queda. La segunda siempre sale bien y no dice nada.
  await page.setCacheEnabled(false);

  // Por URL y no por evento.
  //
  // Una precarga acertada emite DOS respuestas para una sola descarga: la de
  // la precarga y la del uso, que se sirve de ella. Contando eventos, poner
  // bien el `<link rel="preload">` parecía duplicar el peso de la tipografía —
  // el medidor daba por empeorado justo el cambio que estaba mejorando.
  const recursos = new Map();
  page.on('response', async (res) => {
    const u = res.url();
    if (u.startsWith('data:') || recursos.has(u)) return;
    let bytes = 0;
    try {
      bytes = Number((await res.headers())['content-length'] ?? 0);
    } catch {
      /* algunas respuestas no dejan mirar */
    }
    recursos.set(u, { host: new URL(u).host, bytes });
  });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  const listas = await page.evaluate(() =>
    document.fonts.ready.then(() => Math.round(performance.now()))
  );
  const total = Date.now() - t0;
  await page.close();

  const todos = [...recursos.entries()].map(([url, r]) => ({ url, ...r }));
  return {
    hosts: [...new Set(todos.map((r) => r.host))],
    externas: todos.filter((r) => !r.host.startsWith('127.0.0.1')).length,
    ficheros: todos.filter((r) => /\.woff2?$/.test(r.url)),
    listas,
    total,
  };
}

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function medir(nombre, url, veces = 5) {
  const pasadas = [];
  for (let i = 0; i < veces; i++) pasadas.push(await pasada(url));
  const ultima = pasadas.at(-1);
  const bytes = ultima.ficheros.reduce((a, f) => a + f.bytes, 0);

  console.log(`\n  ${nombre}`);
  console.log(`    hosts contactados        ${ultima.hosts.length}  ${ultima.hosts.join(', ')}`);
  console.log(`    peticiones externas      ${ultima.externas}`);
  console.log(`    ficheros de fuente       ${ultima.ficheros.length}  ${ultima.ficheros.map((f) => f.url.split('/').pop()).join(', ')}`);
  console.log(`    bytes de tipografía      ${(bytes / 1024).toFixed(1)} kB`);
  console.log(`    fonts.ready (mediana)    ${mediana(pasadas.map((p) => p.listas))} ms   [${pasadas.map((p) => p.listas).join(' ')}]`);
  console.log(`    carga completa (mediana) ${mediana(pasadas.map((p) => p.total))} ms`);
}

console.log('\nCoste de la tipografía');
await medir('versión ligera', `${BASE}?modo=ligero`);

await browser.close();
console.log('');
