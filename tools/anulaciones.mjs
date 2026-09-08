/**
 * Qué está cambiando de verdad el editor sobre la escena generada.
 *
 * `src/editor/escena.json` guarda las anulaciones: piezas movidas a mano que
 * se aplican también en la web publicada. Es una función deliberada y tiene un
 * filo que no se ve — **un arrastre accidental queda guardado igual que uno
 * pensado**, y a partir de ahí la escena se genera bien y se estropea después.
 * Es el fallo más difícil de encontrar leyendo el código, porque el código
 * está bien.
 *
 * Encontrado así: la losa de entrega de la escalinata a la plaza estaba treinta
 * metros bajo tierra. Su geometría era correcta —de y 43,3 a 45,1, justo la
 * cota de sus muros— y era su MALLA la que tenía `position.y = −30,32`. Eso no
 * está escrito en ningún fichero fuente.
 *
 * ── Cómo mide, y cómo NO ──────────────────────────────────────────────────
 *
 * El primer intento cargaba la isla dos veces, una con el fichero de
 * anulaciones vaciado y otra con él puesto, y restaba. Dio cero en las diez, o
 * sea «aquí no pasa nada», con la losa a treinta metros bajo tierra. El
 * motivo: `escena.json` está en la lista de ignorados del vigilante de Vite
 * —para que guardar desde el editor no recargue la página—, así que vaciarlo
 * desde fuera no llega al navegador y las dos cargas leían lo mismo.
 *
 * Lo de aquí no toca ningún fichero. El catálogo del editor ya guarda la
 * transformación con la que NACIÓ cada pieza (`pos0`, `rot0`, `esc0`), porque
 * la necesita para detectar identificadores derivados; y se construye antes de
 * aplicar las anulaciones. Restando contra ella se sabe exactamente qué mueve
 * cada una, en una sola carga y sin efectos secundarios.
 *
 *   node tools/anulaciones.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'node:fs';

const JSON_RUTA = 'src/editor/escena.json';
const URL = process.env.URL ?? 'http://127.0.0.1:5173/?instant';

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
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('.loader__enter');
    return el && !el.hidden;
  },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 1200));

const guardadas = Object.keys(JSON.parse(readFileSync(JSON_RUTA, 'utf8')).objetos ?? {});

const filas = await page.evaluate((ids) => {
  const app = window.__portfolio;
  const piezas = app.catalogo?.piezas;
  if (!piezas) return null;

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const salida = [];
  for (const id of ids) {
    const p = piezas.get(id);
    if (!p) {
      salida.push({ id, ausente: true });
      continue;
    }
    const o = p.objeto;
    const pos = [o.position.x, o.position.y, o.position.z];
    const rot = [o.rotation.x, o.rotation.y, o.rotation.z];
    const esc = [o.scale.x, o.scale.y, o.scale.z];
    salida.push({
      id,
      mueve: +dist(p.pos0, pos).toFixed(3),
      dy: +(pos[1] - p.pos0[1]).toFixed(2),
      gira: +(Math.max(...rot.map((v, i) => Math.abs(v - p.rot0[i]))) * (180 / Math.PI)).toFixed(1),
      escala: +dist(p.esc0, esc).toFixed(3),
    });
  }
  return salida;
}, guardadas);

await browser.close();

if (!filas) {
  console.error('No encuentro `catalogo.piezas` en la página. ¿Ha cambiado `Experience`?');
  process.exit(1);
}

filas.sort((a, b) => (b.mueve ?? 0) + (b.gira ?? 0) / 10 - ((a.mueve ?? 0) + (a.gira ?? 0) / 10));

console.log('\n── Anulaciones guardadas del editor ───────────────────────────\n');
console.log(`  ${filas.length} en ${JSON_RUTA}\n`);
console.log('     mueve      ΔY     gira    pieza');
console.log('  ' + '─'.repeat(74));
for (const f of filas) {
  if (f.ausente) {
    console.log(`  ⚠        —       —       —    ${f.id}   ← la pieza ya no existe`);
    continue;
  }
  const grave = f.mueve > 1 || f.gira > 1 || f.escala > 0.01;
  const nula = f.mueve === 0 && f.gira === 0 && f.escala === 0;
  const marca = grave ? '  ⚠' : nula ? '  ·' : '   ';
  console.log(
    `${marca} ${String(f.mueve).padStart(8)} ${String(f.dy).padStart(7)} ${String(f.gira).padStart(6)}°   ${f.id}`
  );
}

const graves = filas.filter((f) => !f.ausente && (f.mueve > 1 || f.gira > 1 || f.escala > 0.01));
const nulas = filas.filter((f) => !f.ausente && f.mueve === 0 && f.gira === 0 && f.escala === 0);
console.log(`\n  ⚠ mueve más de 1 m, gira más de 1° o cambia de escala: ${graves.length}`);
console.log(`  · no cambia nada (guardados sin edición): ${nulas.length}`);

/*
 * ── Qué se considera un accidente ─────────────────────────────────────────
 *
 * Los umbrales salen de medir los dos casos, no de elegir un número redondo.
 * En la limpieza de hoy había esto:
 *
 *   accidentes   30,32 m en vertical (una losa bajo tierra) y 19,16 m en
 *                horizontal (un faro fuera de su santuario)
 *   deliberado    3,62 m (una piedra runada recolocada a mano)
 *
 * Ocho metros cae en medio con holgura por los dos lados: más del doble del
 * ajuste legítimo y menos de la mitad del accidente más pequeño. Y tres metros
 * de caída, contra los 0,34 del ajuste legítimo.
 *
 * El giro NO hace fallar, sólo se informa: girar una piedra a mano es una
 * edición normal, y el único giro accidental que apareció era de 4°, que no se
 * puede separar de uno pensado con un umbral. Ese lo caza mirar, o `asiento`.
 */
const LIMITE_MUEVE = 8;
const LIMITE_CAIDA = -3;

const accidentes = filas.filter(
  (f) => !f.ausente && (f.mueve > LIMITE_MUEVE || f.dy < LIMITE_CAIDA)
);
const ausentes = filas.filter((f) => f.ausente);

if (accidentes.length || ausentes.length) {
  console.log('\n  ✗ ANULACIONES QUE PARECEN ACCIDENTES:\n');
  for (const f of accidentes) {
    console.log(`      ${f.id}  ·  mueve ${f.mueve} m, ΔY ${f.dy} m`);
  }
  for (const f of ausentes) {
    console.log(`      ${f.id}  ·  la pieza ya no existe: la anulación no se aplica`);
  }
  console.log(
    `\n  Se quitan borrando su entrada de ${JSON_RUTA}.` +
      `\n  Umbrales: mover más de ${LIMITE_MUEVE} m o caer más de ${-LIMITE_CAIDA} m.\n`
  );
  process.exit(1);
}

console.log('\n  Todo en orden.\n');
