/**
 * La puerta del panel publicado: que se abra y que se quite de en medio.
 *
 * Existe por un fallo que dejó la función entera inservible y que NINGUNA de
 * las otras comprobaciones podía ver: todas miran el servidor de desarrollo, y
 * ahí no hay puerta —el panel se abre directo— así que la única ruta donde
 * vivía el fallo era la que nadie ejercitaba.
 *
 * El fallo: al acertar, el panel se montaba en el mismo cuerpo DETRÁS de la
 * puerta, y como la puerta ocupa el alto entero de la ventana, el panel quedaba
 * justo por debajo del borde inferior. Quien acertaba leía «Dentro.» y no veía
 * nada más. La entrada funcionaba; lo que estaba roto era el orden.
 *
 * ── Cómo se prueba sin saber la contraseña ────────────────────────────────
 *
 * Interceptando la respuesta del servidor. Lo que se afirma aquí es «qué hace
 * la página cuando el servidor dice que sí», y eso no necesita el secreto de
 * nadie — de hecho es mejor que no lo necesite: una prueba que exigiera la
 * contraseña de verdad no se podría ejecutar nunca en otro sitio.
 *
 *   npx vite build && node tools/puerta-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PUERTO = 4178;
const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}
if (!existsSync('dist')) {
  console.error('No hay dist/. Lanza `npx vite build` antes: la puerta sólo existe en lo compilado.');
  process.exit(1);
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

const servidor = spawn('npx', ['vite', 'preview', '--port', String(PUERTO), '--host', '127.0.0.1'], {
  stdio: 'ignore',
});
const parar = () => servidor.kill();
process.on('exit', parar);

await new Promise((r) => setTimeout(r, 5000));
const U = `http://127.0.0.1:${PUERTO}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 800 });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 160)));

console.log('\n── La puerta del panel publicado ──────────────────────────────\n');

try {
  // ── 1. Cerrada de entrada ───────────────────────────────────────────────
  await page.goto(`${U}/?admin`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
  const alLlegar = await page.evaluate(() => ({
    puerta: !!document.querySelector('.pu__caja'),
    panel: !!document.querySelector('.ad__hoja'),
  }));
  comprobar(alLlegar.puerta, 'Al llegar sin sesión sale la puerta');
  comprobar(!alLlegar.panel, 'Y el panel no se dibuja detrás');

  // ── 2. Con contraseña equivocada no pasa nada ───────────────────────────
  await page.setRequestInterception(true);
  let responder = { status: 401, body: { error: 'No es la contraseña.' } };
  page.on('request', (r) => {
    if (r.url().endsWith('/api/entrar') && r.method() === 'POST') {
      return r.respond({
        status: responder.status,
        contentType: 'application/json',
        body: JSON.stringify(responder.body),
      });
    }
    r.continue();
  });

  await page.type('input[name="clave"]', 'no-es-la-contrasena');
  await page.click('.pu__boton');
  await new Promise((r) => setTimeout(r, 900));
  const trasFallar = await page.evaluate(() => ({
    puerta: !!document.querySelector('.pu__caja'),
    panel: !!document.querySelector('.ad__hoja'),
    nota: document.querySelector('[data-nota]')?.textContent ?? '',
    reintentable: !document.querySelector('.pu__boton').disabled,
  }));
  comprobar(trasFallar.puerta && !trasFallar.panel, 'Con la contraseña mal, la puerta sigue cerrada');
  comprobar(/no es la contraseña/i.test(trasFallar.nota), 'Y lo dice', trasFallar.nota);
  comprobar(trasFallar.reintentable, 'Y deja volver a intentarlo');

  // ── 3. Con contraseña buena, entra Y LA PUERTA SE QUITA ─────────────────
  responder = { status: 200, body: { ok: true } };
  await page.click('.pu__boton');
  await new Promise((r) => setTimeout(r, 3500));
  const dentro = await page.evaluate(() => ({
    puerta: !!document.querySelector('.pu__caja'),
    panel: !!document.querySelector('.ad__hoja'),
    admin: typeof window.__admin,
    hijos: document.body.children.length,
  }));
  comprobar(dentro.panel, 'Acertando, el panel se monta');
  comprobar(
    !dentro.puerta,
    'Y la puerta se quita: si se queda, tapa el panel a pantalla completa',
    `${dentro.hijos} hijo(s) en el cuerpo`
  );
  comprobar(dentro.admin === 'object', 'Y el panel queda utilizable');

  comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  parar();
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
