/**
 * Prueba de la hora de llegada.
 *
 * La isla se abre con el momento del día que sea de verdad donde está quien
 * mira. Eso son dos cosas que se rompen por separado: el reparto de horas en
 * fases, y que esa fase llegue al mundo ANTES del primer fotograma —si llegase
 * después, quien entra de noche vería la isla amanecer y volver a oscurecerse
 * delante de él, que es peor que no tener la función—.
 *
 * El reloj se falsea sustituyendo `Date` antes de que corra nada de la página:
 * más honesto que fiarse de la hora a la que se lance la prueba, y así también
 * se puede comprobar la medianoche sin esperar a la medianoche.
 *
 * Y se comprueba lo contrario: que `?instant`, el parámetro de las
 * herramientas de captura, deje la hora clavada. Una escena que cambia de
 * color según cuándo se lance la prueba no se puede comparar con la de ayer.
 *
 *   node tools/momento-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';

const FIREFOX = [process.env.FIREFOX_PATH, '/usr/lib/firefox/firefox', '/usr/bin/firefox']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!FIREFOX) {
  console.error('No encuentro Firefox. Define FIREFOX_PATH.');
  process.exit(1);
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: FIREFOX,
  headless: true,
  protocol: 'webDriverBiDi',
});

/**
 * Abre la isla con el reloj puesto a una hora concreta.
 *
 * @param {string|null} reloj  Hora local en ISO sin huso, o null para no tocarla.
 * @param {string} sufijo      Lo que se le añade a la dirección.
 */
async function abrir(reloj, sufijo = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 160));
  });

  if (reloj) {
    await page.evaluateOnNewDocument((iso) => {
      const Real = Date;
      const fijo = new Real(iso).getTime();
      const Falso = function (...args) {
        return args.length ? new Real(...args) : new Real(fijo);
      };
      Falso.prototype = Real.prototype;
      Falso.now = () => fijo;
      Falso.parse = Real.parse;
      Falso.UTC = Real.UTC;
      window.Date = Falso;
    }, reloj);
  }

  await page.goto(`${BASE}?modo=3d${sufijo}`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.__portfolio?.world?.time, { timeout: 240000 });
  const datos = await page.evaluate(() => {
    const exp = window.__portfolio;
    const t = exp.world.time;
    return {
      // `current` es el destino; `phase` es de donde se PARTIÓ. Que los dos
      // coincidan es lo que demuestra que no hay transición al entrar.
      actual: t.current,
      partida: t.phase.id,
      cielo: `#${t.value.skyTop.getHexString()}`,
      estrellas: t.value.stars,
      marcado: document.querySelector('.daylight__option[data-ahora]')?.dataset.phase ?? null,
      pulsado: document.querySelector(".daylight__option[aria-pressed='true']")?.dataset.phase ?? null,
    };
  });
  await page.close();
  return { ...datos, errores };
}

console.log('── el reloj del visitante manda');

const noche = await abrir('2026-09-03T23:30:00');
comprobar(noche.actual === 'noche', 'a las 23:30 la isla está de noche', noche.actual);
comprobar(noche.partida === 'noche', 'y arranca ya de noche, sin transición a la vista', noche.partida);
comprobar(noche.estrellas > 0.5, 'con las estrellas puestas', String(noche.estrellas));

const alba = await abrir('2026-09-03T06:15:00');
comprobar(alba.actual === 'amanecer', 'a las 06:15 amanece', alba.actual);

const mediodia = await abrir('2026-09-03T13:00:00');
comprobar(mediodia.actual === 'dia', 'a las 13:00 es mediodía', mediodia.actual);

const tarde = await abrir('2026-09-03T19:45:00');
comprobar(tarde.actual === 'tarde', 'a las 19:45 atardece', tarde.actual);

comprobar(
  noche.cielo !== mediodia.cielo,
  'y el cielo cambia de verdad, no solo el rótulo',
  `${noche.cielo} frente a ${mediodia.cielo}`
);

console.log('── la barra dice cuál es su hora');

comprobar(noche.marcado === 'noche', 'el punto señala el momento del reloj', String(noche.marcado));
comprobar(noche.pulsado === 'noche', 'y es el que está activo al entrar', String(noche.pulsado));

console.log('── las anulaciones');

const forzado = await abrir('2026-09-03T23:30:00', '&momento=amanecer');
comprobar(forzado.actual === 'amanecer', '?momento manda sobre el reloj', forzado.actual);
comprobar(forzado.marcado === 'noche', 'pero el punto sigue diciendo qué hora es', String(forzado.marcado));

const captura = await abrir('2026-09-03T23:30:00', '&instant');
comprobar(captura.actual === 'dia', '?instant clava el mediodía para las capturas', captura.actual);

const disparate = await abrir('2026-09-03T23:30:00', '&momento=jueves');
comprobar(disparate.actual === 'dia', 'un momento que no existe cae al mediodía', disparate.actual);

const errores = [...noche.errores, ...alba.errores, ...forzado.errores, ...captura.errores];
comprobar(errores.length === 0, 'consola limpia', errores.slice(0, 2).join(' · '));

await browser.close();
console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
