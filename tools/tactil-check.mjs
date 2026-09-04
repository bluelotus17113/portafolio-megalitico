/**
 * Prueba del mando táctil del modo a pie.
 *
 * Lo que se comprueba no es que salga un círculo bonito abajo a la izquierda,
 * sino las tres cosas que en un móvil no existían: que se pueda ENTRAR a pie
 * sin teclado, que la palanca ANDE —y ande despacio si se empuja poco—, y que
 * se pueda MIRAR sin bloqueo de puntero, que en un teléfono no se concede
 * nunca.
 *
 * Los dedos son eventos sintéticos con `pointerType: 'touch'`, no emulación
 * del navegador: lo que decide el camino de código es ese campo, así que la
 * prueba toca exactamente lo mismo que un dedo de verdad y además vale igual
 * en cualquier navegador.
 *
 * Va en Firefox y no en el Chromium por software de `walk-check.mjs` porque
 * aquí no se juzga nada de lo que se dibuja: con GPU la escena está montada en
 * dos segundos en vez de en dos minutos.
 *
 * El rig se avanza a mano (`rig.update(dt)` en bucle) para que la medida no
 * dependa de a cuántos fotogramas vaya la máquina.
 *
 *   node tools/tactil-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
/** `?instant` para las medidas —sin vuelo de llegada— y `?tactil` para el mando. */
const URL = `${BASE}?instant&tactil`;
/** La misma isla pero entrando como entra todo el mundo, con su vuelo. */
const URL_LLEGADA = `${BASE}?modo=3d&tactil`;

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
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860 }); // un teléfono de pie

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: 'load', timeout: 240000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await page.waitForFunction(() => window.__portfolio?.rig, { timeout: 60000 });

/** Un dedo sintético: los manejadores solo miran `pointerType` y las coordenadas. */
await page.evaluate(() => {
  window.__dedo = (destino, tipo, x, y, id = 7) => {
    const el = typeof destino === 'string' ? document.querySelector(destino) : destino;
    (tipo === 'pointermove' && el === window ? window : el).dispatchEvent(
      new PointerEvent(tipo, {
        pointerId: id, pointerType: 'touch', isPrimary: true,
        clientX: x, clientY: y, bubbles: true, cancelable: true,
      })
    );
  };
  window.__centroPalanca = () => {
    const c = document.querySelector('.mando__base').getBoundingClientRect();
    return { x: c.left + c.width / 2, y: c.top + c.height / 2, r: c.width * 0.38 };
  };
});

console.log('── la puerta al modo a pie');

const inicio = await page.evaluate(() => ({
  modo: window.__portfolio.rig.mode,
  mandoOculto: document.querySelector('.mando')?.hidden,
  hayBoton: !!document.querySelector('[data-action="walk"]'),
}));
comprobar(inicio.hayBoton, 'hay un botón para caminar en el menú');
comprobar(inicio.mandoOculto === true, 'el mando no se ve en órbita');

await page.click('.menu-toggle');
await page.click('[data-action="walk"]');

const dentro = await page.evaluate(() => ({
  modo: window.__portfolio.rig.mode,
  mandoVisible: document.querySelector('.mando')?.hidden === false,
  bloqueado: window.__portfolio.rig.free.pointerLocked,
}));
comprobar(dentro.modo === 'walk', 'el botón pone al visitante de pie', dentro.modo);
comprobar(dentro.mandoVisible, 'y saca el mando');
comprobar(!dentro.bloqueado, 'sin bloqueo de puntero, que en un móvil no se concede');

console.log('── la palanca');

const paso = await page.evaluate(() => {
  const rig = window.__portfolio.rig;
  const c = window.__centroPalanca();

  const recorrer = (fraccion, pasos = 120, dt = 1 / 60) => {
    rig.enabled = true;
    rig.plantar(60, 60, 0);
    rig.free.keys.clear();
    window.__dedo('.mando__base', 'pointerdown', c.x, c.y);
    window.__dedo('.mando__base', 'pointermove', c.x, c.y - c.r * fraccion);
    const p0 = rig.camera.position.clone();
    for (let i = 0; i < pasos; i++) rig.update(dt);
    const p1 = rig.camera.position.clone();
    window.__dedo('.mando__base', 'pointerup', c.x, c.y - c.r * fraccion);
    return { d: Math.hypot(p1.x - p0.x, p1.z - p0.z), dz: p1.z - p0.z, dx: p1.x - p0.x };
  };

  const tope = recorrer(1.4);      // más allá del aro: tope, o sea correr
  const medio = recorrer(0.45);
  const nada = recorrer(0);

  // Soltar tiene que parar: se suelta y se siguen avanzando dos segundos.
  rig.enabled = true;
  rig.plantar(60, 60, 0);
  window.__dedo('.mando__base', 'pointerdown', c.x, c.y);
  window.__dedo('.mando__base', 'pointermove', c.x, c.y - c.r);
  for (let i = 0; i < 60; i++) rig.update(1 / 60);
  window.__dedo('.mando__base', 'pointerup', c.x, c.y - c.r);
  const antes = rig.camera.position.clone();
  for (let i = 0; i < 120; i++) rig.update(1 / 60);
  const deriva = Math.hypot(rig.camera.position.x - antes.x, rig.camera.position.z - antes.z);

  return { tope, medio, nada, deriva, palanca: { ...rig.palanca } };
});

comprobar(paso.tope.d > 8, 'a tope se corre', `${paso.tope.d.toFixed(1)} m en 2 s`);
comprobar(
  paso.medio.d > 1 && paso.medio.d < paso.tope.d * 0.75,
  'a medio gas se anda más despacio',
  `${paso.medio.d.toFixed(1)} m frente a ${paso.tope.d.toFixed(1)} m`
);
comprobar(paso.nada.d < 0.2, 'con la palanca en el centro no se anda', `${paso.nada.d.toFixed(2)} m`);
comprobar(
  Math.abs(paso.tope.dz) > Math.abs(paso.tope.dx) * 4 && paso.tope.dz < 0,
  'arriba es hacia donde se mira',
  `dz ${paso.tope.dz.toFixed(1)} · dx ${paso.tope.dx.toFixed(1)}`
);
comprobar(paso.deriva < 0.6, 'al soltar el dedo se para', `${paso.deriva.toFixed(2)} m después de soltar`);
comprobar(paso.palanca.x === 0 && paso.palanca.y === 0, 'y la palanca vuelve al centro');

console.log('── mirar con el dedo');

const mirada = await page.evaluate(() => {
  const rig = window.__portfolio.rig;
  rig.plantar(60, 60, 0);
  const yaw0 = rig.free.yaw;
  const pitch0 = rig.free.pitch;
  const p0 = rig.camera.position.clone();
  window.__dedo('#scene', 'pointerdown', 210, 400, 9);
  for (let i = 1; i <= 10; i++) window.__dedo(window, 'pointermove', 210 + i * 20, 400, 9);
  window.__dedo(window, 'pointerup', 410, 400, 9);
  for (let i = 0; i < 10; i++) rig.update(1 / 60);
  const giro = rig.free.yaw - yaw0;

  // Y el mismo arrastre después de soltar no tiene que mover nada.
  const yaw1 = rig.free.yaw;
  window.__dedo(window, 'pointermove', 100, 400, 9);
  return {
    giro,
    pitch: Math.abs(rig.free.pitch - pitch0),
    fantasma: Math.abs(rig.free.yaw - yaw1),
    movido: Math.hypot(rig.camera.position.x - p0.x, rig.camera.position.z - p0.z),
    modo: rig.mode,
  };
});

comprobar(mirada.giro < -0.5 && mirada.giro > -1.5, 'arrastrar gira la cabeza', `${mirada.giro.toFixed(2)} rad en 200 px`);
comprobar(mirada.pitch < 0.02, 'un arrastre horizontal no cabecea', mirada.pitch.toFixed(3));
comprobar(mirada.fantasma < 1e-6, 'con el dedo levantado ya no gira');
comprobar(mirada.movido < 0.05, 'y mirar no es andar', `${mirada.movido.toFixed(3)} m`);
comprobar(mirada.modo === 'walk', 'sigue de pie: sin bloqueo de puntero no se cae a la órbita');

console.log('── la salida');

await page.click('.mando__salir');
const fuera = await page.evaluate(() => ({
  modo: window.__portfolio.rig.mode,
  mandoOculto: document.querySelector('.mando').hidden,
}));
comprobar(fuera.modo === 'orbit', 'el botón Salir devuelve a la órbita', fuera.modo);
comprobar(fuera.mandoOculto, 'y el mando se guarda');

console.log('── llegar a la isla es llegar a pie');

// El camino que recorre TODO el mundo no es el botón del menú: es pulsar
// «Explorar» y dejarse llevar. El vuelo de llegada acaba plantando al
// visitante de pie, y ahí el modo se cambia sin pasar por `setMode`, así que
// esta es la comprobación que separa «el mando funciona» de «el mando está».
const llegada = await browser.newPage();
await llegada.setViewport({ width: 420, height: 860 });
const erroresLlegada = [];
llegada.on('pageerror', (e) => erroresLlegada.push(e.message.slice(0, 200)));
await llegada.goto(URL_LLEGADA, { waitUntil: 'load', timeout: 240000 });
await llegada.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await llegada.click('.loader__enter');
const aterrizaje = await llegada
  .waitForFunction(() => window.__portfolio.rig.mode === 'walk', { timeout: 30000 })
  .then(() => llegada.evaluate(() => ({
    mando: document.querySelector('.mando')?.hidden === false,
    aviso: document.querySelector('[data-tooltip]')?.textContent ?? '',
  })))
  .catch(() => null);

comprobar(!!aterrizaje, 'el vuelo de llegada acaba a pie');
comprobar(aterrizaje?.mando === true, 'y el mando está puesto al aterrizar');
comprobar(
  /palanca/i.test(aterrizaje?.aviso ?? ''),
  'el aviso habla de la palanca, no de W A S D',
  aterrizaje?.aviso
);
errores.push(...erroresLlegada);

comprobar(errores.length === 0, 'consola limpia', errores.slice(0, 2).join(' · '));

await browser.close();
console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
