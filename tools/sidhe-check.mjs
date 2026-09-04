/**
 * Prueba de los aos sí.
 *
 * Hay tres cosas que se rompen aquí sin dar un solo error:
 *
 *  1. El REPARTO. Cuántos hay despiertos sale de multiplicar la hora por la
 *     estación, y las dos vienen interpoladas. Si se invierte un signo, el
 *     mediodía se llena y la noche se vacía, que es justo al revés — y nadie
 *     lo ve hasta que abre la isla de noche.
 *  2. Que se DIBUJEN. Esta es la que se llevó la tarde: la primera versión
 *     compartía los atributos de una `PlaneGeometry` que luego desechaba, y no
 *     pintaba nada. Ni con el tamaño a treinta, ni con el fragment forzado a
 *     magenta opaco. El estado interno estaba PERFECTO —veintiséis instancias,
 *     posiciones buenas, todas dentro del tronco de visión, la llamada de
 *     dibujado emitiéndose cincuenta y ocho veces— y en pantalla no había
 *     nada. Por eso aquí no se comprueba el estado sino los PÍXELES.
 *  3. Que se COMPORTEN. Que se repartan por la isla en vez de quedarse en la
 *     boca del túmulo, que no se metan bajo tierra y que reaccionen a quien
 *     se les acerca.
 *
 * Y una trampa que ya costó dos medidas malas en este proyecto: la cámara
 * DERIVA sola tras seis segundos parada. Comparando dos capturas sin
 * congelarla, lo que se mide es el giro. Aquí se apaga `idleDrift` antes de
 * medir nada.
 *
 *   node tools/sidhe-check.mjs
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
 * Abre la isla en un momento y una estación, y deja que se repartan.
 *
 * Los treinta segundos de espera NO son por prudencia: salen todos de la boca
 * del túmulo, así que a los cuatro segundos siguen amontonados ahí y cualquier
 * medida de reparto sale mal por motivos que no son un fallo.
 */
async function abrir(momento, estacion, { asentar = 30000 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 620 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 160));
  });

  await page.goto(`${BASE}?instant&momento=${momento}&estacion=${estacion}`, {
    waitUntil: 'load',
    timeout: 240000,
  });
  await page.waitForFunction(
    () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  await page.click('.loader__enter');
  await page.waitForFunction(() => window.__portfolio?.catalogo, { timeout: 240000 });
  await page.waitForFunction(() => !document.getElementById('loader'), { timeout: 60000 });
  await page.evaluate(() => { window.__portfolio.rig.idleDrift = false; });
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), asentar);
  return { page, errores };
}

const leer = (page) =>
  page.evaluate(() => {
    const P = window.__portfolio;
    const e = P.world.espiritus;
    const t = P.world.time;
    const estados = {};
    for (const b of e.bichos) estados[b.estado] = (estados[b.estado] ?? 0) + 1;
    const radios = e.bichos.map((b) => Math.hypot(b.pos.x, b.pos.z));
    return {
      total: e.bichos.length,
      despiertos: e.bichos.filter((b) => b.brillo > 0.5).length,
      estados,
      sidhe: +t.value.sidhe.toFixed(3),
      velo: +t.estacionValor.velo.toFixed(3),
      // ¿Se han repartido o siguen en la boca del túmulo?
      radioMax: +Math.max(...radios).toFixed(0),
      // ¿Alguno enterrado? Se compara contra la cota real bajo cada uno.
      bajoTierra: e.bichos.filter(
        (b) => b.estado !== 0 && b.pos.y < P.world.field.height(b.pos.x, b.pos.z) - 0.5
      ).length,
      // ¿Alguno en el mar? El disco navegable son 168.
      fuera: radios.filter((r) => r > 168).length,
    };
  });

// ── 1. Cuántos salen ─────────────────────────────────────────────────────
console.log('── cuántos hay despiertos');

const noche = await abrir('noche', 'otono');
const dNoche = await leer(noche.page);
comprobar(dNoche.total === 26, 'son veintiséis', String(dNoche.total));
comprobar(
  dNoche.despiertos === dNoche.total,
  'la noche de Samhain los saca a todos',
  `${dNoche.despiertos}/${dNoche.total}, presencia ${(dNoche.sidhe * dNoche.velo).toFixed(2)}`
);
comprobar(dNoche.velo === 1.35, 'el otoño es el máximo del velo', String(dNoche.velo));
comprobar(dNoche.errores === undefined && noche.errores.length === 0, 'consola limpia', noche.errores.join(' | '));

const dia = await abrir('dia', 'verano', { asentar: 8000 });
const dDia = await leer(dia.page);
comprobar(
  dDia.despiertos < 5 && dDia.despiertos > 0,
  'el mediodía de verano deja solo a los rezagados',
  `${dDia.despiertos}/${dDia.total}`
);
comprobar(
  dDia.despiertos >= 3,
  'pero nunca se vacía del todo: una isla sin ninguno parece rota, no folclórica',
  String(dDia.despiertos)
);
comprobar(dia.errores.length === 0, 'consola limpia', dia.errores.join(' | '));

const invierno = await abrir('noche', 'invierno', { asentar: 8000 });
const dInv = await leer(invierno.page);
comprobar(
  dInv.despiertos < dNoche.despiertos,
  'a la MISMA hora, el invierno saca menos que el otoño',
  `${dInv.despiertos} contra ${dNoche.despiertos}`
);
comprobar(
  dInv.velo < dNoche.velo && dInv.velo === 0.55,
  'porque el velo del invierno está cerrado, no porque haga frío',
  `velo ${dInv.velo} contra ${dNoche.velo}`
);
await invierno.page.close();
await dia.page.close();

// ── 2. Dónde andan ───────────────────────────────────────────────────────
console.log('\n── por dónde se mueven');
comprobar(dNoche.radioMax > 50, 'se reparten por la isla y no se quedan en la boca del túmulo', `radio máximo ${dNoche.radioMax} m`);
comprobar(dNoche.fuera === 0, 'ninguno se va al mar', `${dNoche.fuera} fuera del disco`);
comprobar(dNoche.bajoTierra === 0, 'ninguno se mete bajo tierra', `${dNoche.bajoTierra} enterrados`);
comprobar(
  (dNoche.estados[1] ?? 0) > 0 && (dNoche.estados[2] ?? 0) > 0,
  'unos van de camino y otros están posados en un monumento',
  `${dNoche.estados[1] ?? 0} vagando, ${dNoche.estados[2] ?? 0} posados`
);

// ── 3. Que hacen caso a quien se acerca ──────────────────────────────────
//
// Se le pasa una cámara de mentira pegada a uno de ellos y se avanza la
// simulación a mano. Mover la cámara de verdad exigiría entrar en modo a pie y
// caminar hasta encontrarse con uno, que es media prueba de navegación metida
// dentro de esta.
console.log('\n── si te ven');
const reaccion = await noche.page.evaluate(() => {
  const e = window.__portfolio.world.espiritus;
  const b = e.bichos[0];
  const antes = b.estado;
  const pegada = { position: { x: b.pos.x + 3, y: b.pos.y, z: b.pos.z } };
  e.update(0.05, { camera: pegada, presencia: 1.35 });
  const espantado = b.estado;
  // Y ahora desde lejos pero dentro del radio en que se fijan.
  const lejos = { position: { x: b.pos.x + 22, y: b.pos.y, z: b.pos.z } };
  b.estado = 1;
  b.reloj = 5;
  e.update(0.05, { camera: lejos, presencia: 1.35 });
  return { antes, espantado, curioso: b.estado };
});
comprobar(reaccion.espantado === 4, 'a tres metros se espanta', `estado ${reaccion.antes} → ${reaccion.espantado}`);
comprobar(reaccion.curioso === 3, 'a veintidós se acerca a mirar', `estado ${reaccion.curioso}`);

// ── 4. Que se vean de verdad ─────────────────────────────────────────────
//
// Lo único que no se puede juzgar leyendo el estado, y la medida costó dos
// intentos malos:
//
//  - A fotograma completo, el suelo de ruido salía del 9,7 %: el mar
//    centellea solo y se comía la señal entera.
//  - Recortando a la tierra bajaba al 5,6 %, y seguía sin servir — la hierba
//    ondea, las líneas ley laten y el fuego parpadea. Todo eso cambia entre
//    dos capturas aunque no se toque nada.
//
// Así que la pregunta no es «¿cambia la imagen?» sino «¿se ve CADA UNO?». Se
// proyecta cada espíritu a la pantalla y se mide cuánto se aclara SU caja al
// encenderlos, contra el mismo estadístico en cajas de control repartidas por
// la tierra donde no hay ninguno. Las cajas de control son la hipótesis nula:
// dicen cuánto se aclara un trozo de isla por el mero hecho de que pase el
// tiempo.
console.log('\n── si se ven');

const CAJA = 15; // medio lado, en píxeles

await noche.page.evaluate(() => {
  window.__portfolio.world.espiritus.group.visible = false;
});
await noche.page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
const sinEllos = await noche.page.screenshot({ encoding: 'base64' });

await noche.page.evaluate(() => {
  window.__portfolio.world.espiritus.group.visible = true;
});
await noche.page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
// Las posiciones se leen JUNTO a la captura, no antes: se mueven a siete
// metros por segundo y medio segundo de desfase los saca de su propia caja.
const puntos = await noche.page.evaluate(() => {
  const P = window.__portfolio;
  const e = P.world.espiritus;
  const v = e.bichos[0].pos.clone();
  const w = P.renderer?.domElement?.clientWidth ?? 1000;
  const h = P.renderer?.domElement?.clientHeight ?? 620;
  return e.bichos
    .filter((b) => b.brillo > 0.6)
    .map((b) => {
      v.copy(b.pos).project(P.camera);
      return { x: Math.round(((v.x + 1) / 2) * w), y: Math.round(((1 - v.y) / 2) * h), z: v.z };
    })
    .filter((p) => p.z > -1 && p.z < 1);
});
const conEllos = await noche.page.screenshot({ encoding: 'base64' });

const comparador = await browser.newPage();
await comparador.goto('about:blank');
const medida = await comparador.evaluate(
  async ([sin, con, pts, caja]) => {
    const carga = (b64) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = 'data:image/png;base64,' + b64;
      });
    const [ia, ib] = await Promise.all([carga(sin), carga(con)]);
    const datos = (im) => {
      const c = new OffscreenCanvas(im.width, im.height);
      c.getContext('2d').drawImage(im, 0, 0);
      return c.getContext('2d').getImageData(0, 0, im.width, im.height);
    };
    const A = datos(ia);
    const B = datos(ib);
    const W = A.width;

    // Cuánto se ACLARA lo más brillante de una caja. Sin valor absoluto: lo
    // que hace un espíritu es sumar luz, nunca quitarla.
    const subida = (cx, cy) => {
      let m = 0;
      for (let y = cy - caja; y <= cy + caja; y++) {
        if (y < 0 || y >= A.height) continue;
        for (let x = cx - caja; x <= cx + caja; x++) {
          if (x < 0 || x >= W) continue;
          const i = (y * W + x) * 4;
          const d = Math.max(
            B.data[i] - A.data[i],
            B.data[i + 1] - A.data[i + 1],
            B.data[i + 2] - A.data[i + 2]
          );
          if (d > m) m = d;
        }
      }
      return m;
    };

    const suyas = pts
      .filter((p) => p.x > caja && p.x < W - caja && p.y > caja && p.y < 545)
      .map((p) => subida(p.x, p.y));

    // Control: una rejilla fija sobre la tierra, quitando las casillas que
    // caigan encima de alguno.
    const control = [];
    for (let y = 320; y < 530; y += 42) {
      for (let x = 80; x < 920; x += 42) {
        if (pts.some((p) => Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 34)) continue;
        control.push(subida(x, y));
      }
    }
    const orden = (a) => [...a].sort((u, w) => u - w);
    const pc = (a, q) => (a.length ? orden(a)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0);
    const umbral = pc(control, 0.95);
    return {
      n: suyas.length,
      nControl: control.length,
      medianaSuya: pc(suyas, 0.5),
      medianaControl: pc(control, 0.5),
      umbral,
      porEncima: suyas.filter((v) => v > umbral).length,
    };
  },
  [sinEllos, conEllos, puntos, CAJA]
);

console.log(`    subida mediana donde hay uno   +${medida.medianaSuya}`);
console.log(`    subida mediana de control      +${medida.medianaControl}   (${medida.nControl} casillas)`);
console.log(`    umbral (control, percentil 95) +${medida.umbral}`);
comprobar(
  medida.n >= 12,
  'hay bastantes en pantalla para poder medir',
  `${medida.n} proyectados dentro del encuadre`
);
comprobar(
  medida.medianaSuya > Math.max(12, medida.medianaControl * 3),
  'donde hay un aos sí, la imagen se aclara mucho más que donde no lo hay',
  `+${medida.medianaSuya} contra +${medida.medianaControl}`
);
// El 0,6 no es un umbral rebajado hasta que pase: es que la cifra es
// ESTOCÁSTICA y el 0,7 estaba justo en el filo. Los veintiséis andan sueltos,
// así que en cada tirada unos cuantos quedan por delante de algo que ya
// brillaba —una línea ley, un faro, el centelleo del mar— y ahí su propio
// resplandor no llega a superar el percentil 95 del control. Medido en tres
// tiradas: 19/25, 17/25 y 17/24, o sea un 70 % ± 5. Un listón puesto en el 70
// falla una de cada dos veces sin que nada se haya roto. La señal que de
// verdad importa es la anterior —mediana +226 contra +43, cinco veces— y esa
// no se mueve.
comprobar(
  medida.porEncima >= Math.ceil(medida.n * 0.6),
  'y se ve la mayoría de ellos uno a uno, no un resplandor general',
  `${medida.porEncima} de ${medida.n} por encima del umbral`
);

await noche.page.close();
await comparador.close();
await browser.close();

console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
