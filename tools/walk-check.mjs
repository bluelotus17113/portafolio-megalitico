/**
 * Prueba del modo a pie.
 *
 * Lo que se comprueba no es que la cámara se mueva —eso se ve en dos segundos—
 * sino que la isla tenga RUTAS: que a Habilidades se suba por la escalinata y
 * no por el talud que tiene al lado. Ese es el único motivo por el que el modo
 * a pie tiene límite de pendiente, y si el número está mal la escalinata pasa a
 * ser decorativa sin que nada falle de forma visible.
 *
 * El rig se avanza a mano (`rig.update(0.05)` en bucle) en vez de esperar al
 * reloj: aquí el navegador va sobre WebGL por software y da alrededor de un
 * fotograma por segundo, así que un paseo de treinta segundos no se anda
 * esperando. Además así la prueba es determinista.
 *
 *   node tools/walk-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:5173/?instant';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700 });

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
await new Promise((r) => setTimeout(r, 1200));

/**
 * Instala en la página un caminante dirigible.
 *
 * `andar` empuja al rig hacia una serie de puntos, girando la cabeza hacia el
 * siguiente en cada paso. Devuelve por dónde acabó y cuánto avanzó de verdad.
 */
await page.evaluate(() => {
  const ex = window.__portfolio;
  window.__andar = ({ desde, hasta, pasos = 400, dt = 0.05 }) => {
    const rig = ex.rig;
    rig.enabled = true;
    rig.plantar(desde[0], desde[1], 0);
    // El bloqueo de puntero no existe en esta prueba; se fuerza el estado para
    // que el rig se comporte como si el visitante estuviera mirando.
    rig.free.pointerLocked = true;
    rig.free.keys.clear();
    rig.free.keys.add('KeyW');

    const ruta = hasta.map(([x, z]) => ({ x, z }));
    let indice = 0;
    let cotaMax = -Infinity;
    const traza = [];
    for (let i = 0; i < pasos; i++) {
      const p = ex.camera.position;
      let meta = ruta[indice];
      while (meta && Math.hypot(p.x - meta.x, p.z - meta.z) < 2.2 && indice < ruta.length - 1) {
        meta = ruta[++indice];
      }
      if (!meta) break;
      // Yaw tal que «adelante» = (−sin, −cos) apunte a la meta.
      rig.free.yaw = Math.atan2(-(meta.x - p.x), -(meta.z - p.z));
      rig.update(dt);
      cotaMax = Math.max(cotaMax, p.y - rig.walk.ojos);
      if (i % 40 === 0) traza.push([+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]);
    }
    rig.free.keys.clear();
    const f = ex.camera.position;
    return {
      fin: [+f.x.toFixed(1), +f.y.toFixed(1), +f.z.toFixed(1)],
      suelo: +(f.y - rig.walk.ojos).toFixed(2),
      cotaMax: +cotaMax.toFixed(2),
      alMeta: +Math.hypot(f.x - ruta[ruta.length - 1].x, f.z - ruta[ruta.length - 1].z).toFixed(1),
      traza,
    };
  };
  window.__datos = () => {
    const plan = ex.world.stairway?.userData?.plan;
    return {
      colisionadores: ex.rig.walk.colisionadores?.cajas.length ?? 0,
      escalinata: plan ? plan.puntos.filter((_, i) => i % 10 === 0).map((p) => [+p.x.toFixed(1), +p.z.toFixed(1)]) : null,
      cimaEscalinata: plan ? +plan.y1.toFixed(2) : null,
      pieEscalinata: plan ? +plan.y0.toFixed(2) : null,
    };
  };
});

const datos = await page.evaluate(() => window.__datos());

console.log('── montaje');
comprobar(datos.colisionadores > 60, 'hay cantería con cuerpo', `(${datos.colisionadores} cajas)`);
comprobar(Boolean(datos.escalinata), 'el trazado de la escalinata está publicado');

// ---- 1. Subir por la escalinata --------------------------------------------
//
// Se mide en DOS tramos, y no de un tirón hasta el centro de Habilidades, para
// no confundir dos cosas distintas: subir los veintiún metros —que es lo que se
// está probando— y acertar el giro cerrado que hay arriba entre las jambas, que
// es habilidad del robot de la prueba y no del modo a pie.
console.log('── del pie de la escalinata a Habilidades, de un tirón');
const porLaEscalinata = await page.evaluate(
  (ruta) => window.__andar({ desde: [-9.8, -31.9], hasta: [...ruta, [-24, -78]], pasos: 1400 }),
  datos.escalinata
);
comprobar(
  porLaEscalinata.cotaMax > datos.cimaEscalinata - 1.2,
  'se corona la escalinata',
  `máx ${porLaEscalinata.cotaMax} (cima ${datos.cimaEscalinata})`
);
comprobar(
  porLaEscalinata.cotaMax - datos.pieEscalinata > 19,
  'se ganan los veintiún metros de desnivel',
  `+${(porLaEscalinata.cotaMax - datos.pieEscalinata).toFixed(1)} m`
);
comprobar(
  porLaEscalinata.alMeta < 12,
  'se llega al enlosado de Habilidades',
  `a ${porLaEscalinata.alMeta} m del centro`
);

// ---- 2. NO subir por el escarpe --------------------------------------------
console.log('── trepar el escarpe (no debe poderse)');
const porElTalud = await page.evaluate(() =>
  window.__andar({ desde: [-9.8, -31.9], hasta: [[-24, -78]], pasos: 900 })
);
comprobar(
  porElTalud.suelo < datos.cimaEscalinata - 8,
  'el talud frena al visitante',
  `se queda en ${porElTalud.suelo}`
);
comprobar(
  porElTalud.alMeta > 15,
  'no se alcanza Habilidades en línea recta',
  `${porElTalud.alMeta} m de distancia`
);

// ---- 3. Chocar con la piedra ------------------------------------------------
//
// Se apunta a una caja CONCRETA y se comprueba que no se llega a su centro, en
// vez de cruzar la plaza a ver si algo se interpone: el corro de trilitos tiene
// huecos de tres metros y una línea recta puede colarse por uno, con lo que la
// prueba pasaría sin haber demostrado nada.
console.log('── cuerpo contra la piedra');
const choque = await page.evaluate(() => {
  const cajas = window.__portfolio.rig.walk.colisionadores.cajas;
  // Una piedra del corro interior de la plaza, alta y cerca del centro.
  const diana = cajas
    .filter((c) => c.etiqueta && Math.hypot(c.cx, c.cz) < 20 && c.maxY - c.minY > 2)
    .sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[0];
  if (!diana) return null;
  const partida = [diana.cx * 1.9, diana.cz * 1.9];
  const r = window.__andar({ desde: partida, hasta: [[diana.cx, diana.cz]], pasos: 300 });
  return { ...r, diana: [+diana.cx.toFixed(1), +diana.cz.toFixed(1)], etiqueta: diana.etiqueta };
});
comprobar(Boolean(choque), 'hay una piedra a la que apuntar');
if (choque) {
  comprobar(
    choque.alMeta > 0.8,
    `no se atraviesa «${choque.etiqueta}»`,
    `se queda a ${choque.alMeta} m del centro de la piedra`
  );
}

// ─────────────────────────────────────────────── cómo se siente el andar
//
// Cuatro números que antes estaban mal y no lo decía nada: la prueba pasaba
// entera con el visitante patinando a 5,18 m/s, la cámara dos metros por
// debajo del suelo y bajando los escalones como un ascensor. Se llegaba a
// Habilidades igual, así que ninguna comprobación se enteraba.
console.log('── cómo se anda');
const tacto = await page.evaluate(() => {
  const ex = window.__portfolio;
  const rig = ex.rig;
  const w = rig.walk;
  const dt = 1 / 60;

  const recorrer = (correr, pasos) => {
    rig.enabled = true;
    rig.plantar(60, 60, 0);
    rig.free.pointerLocked = true;
    rig.free.yaw = 0;
    rig.free.keys.clear();
    rig.free.keys.add('KeyW');
    if (correr) rig.free.keys.add('Shift');
    const p0 = rig.camera.position.clone();
    for (let i = 0; i < pasos; i++) rig.update(dt);
    return { pos: rig.camera.position.clone(), p0 };
  };

  const a = recorrer(false, 120);
  const c = recorrer(true, 120);
  const dist = (r) => Math.hypot(r.pos.x - r.p0.x, r.pos.z - r.p0.z);

  // Deriva lateral andando en línea recta. El balanceo de la cabeza tiene que
  // ser alabeo de la VISTA: aplicado como desplazamiento se suma al fotograma
  // siguiente y el caminante se va en espiral sin tocar A ni D.
  const largo = recorrer(false, 600);
  const lateral = Math.abs(largo.pos.x - largo.p0.x);

  // Retraso de los ojos respecto al suelo subiendo la escalinata.
  rig.plantar(-9.7, -32, 0);
  rig.free.pointerLocked = true;
  rig.free.yaw = Math.atan2(7.3, 7.6);
  rig.free.keys.clear();
  rig.free.keys.add('KeyW');
  let retraso = 0;
  for (let i = 0; i < 600; i++) {
    rig.update(dt);
    const q = rig.camera.position;
    const suelo = ex.world.field.walkHeight(q.x, q.z);
    retraso = Math.max(retraso, Math.abs(q.y - w.ojos - w.bamboleo - suelo));
  }

  // Caer un metro. Con amortiguación exponencial no se cae: se posa.
  rig.plantar(60, 60, 0);
  rig.free.keys.clear();
  const y0 = rig.camera.position.y;
  rig.camera.position.y += 1;
  let t = 0;
  while (rig.camera.position.y - y0 > 0.05 && t < 3) {
    rig.update(dt);
    t += dt;
  }

  return {
    andando: dist(a) / 2,
    corriendo: dist(c) / 2,
    lateral,
    retraso,
    caida: t,
  };
});

comprobar(
  tacto.andando > 2.6 && tacto.andando < 4.2,
  'se anda a paso de persona',
  `${tacto.andando.toFixed(2)} m/s`
);
comprobar(
  tacto.corriendo > 4.5 && tacto.corriendo < 7,
  'y se corre a paso de corredor',
  `${tacto.corriendo.toFixed(2)} m/s`
);
comprobar(tacto.lateral < 0.2, 'en línea recta no se deriva de lado', `${tacto.lateral.toFixed(2)} m en 10 s`);
comprobar(
  tacto.retraso < 0.5,
  'la cámara no se queda enterrada al subir',
  `retraso máx ${tacto.retraso.toFixed(2)} m`
);
comprobar(
  tacto.caida < 0.42,
  'se cae, no se posa',
  `un metro en ${tacto.caida.toFixed(2)} s`
);

comprobar(errores.length === 0, 'consola limpia', errores.join(' | '));

console.log(`\n  traza escalinata: ${JSON.stringify(porLaEscalinata.traza.slice(0, 8))}`);
await browser.close();
console.log(fallos ? `\n${fallos} comprobaciones han fallado.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
