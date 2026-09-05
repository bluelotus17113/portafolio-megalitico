/**
 * Prueba del salto y de los ejes del modo a pie.
 *
 * Dos cosas, y la primera llevaba rota desde siempre sin que ninguna prueba la
 * mirase: el vector lateral de `_updateWalk` estaba NEGADO —escrito (z, 0, -x)
 * cuando `forward × arriba` es (-z, 0, x)—, así que A y D iban cambiadas al
 * andar, y con ellas el eje lateral de la palanca táctil. El vuelo libre no lo
 * sufría porque saca su lateral del cuaternión de la cámara, y por eso el
 * fallo sobrevivió: en la mitad del código que sí se probaba, funcionaba.
 *
 * Aquí no se comprueba «que se mueva» sino HACIA DÓNDE, proyectando el
 * desplazamiento sobre el lateral de la cámara. Un signo cambiado es
 * exactamente el tipo de fallo que pasa un test de «anda cuando pulso».
 *
 * Del salto se mide la parábola: altura de la cima, tiempo en el aire, que no
 * haya salto doble, que valga el margen del coyote y que se pueda subir a un
 * bolo sin poder atravesar el acantilado.
 *
 * El rig se avanza a mano con `rig.update(dt)` en bucle, como en `walk-check`:
 * esperar a los fotogramas de verdad haría la medida dependiente de la carga.
 *
 *   node tools/salto-check.mjs
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

const page = await browser.newPage();
await page.setViewport({ width: 900, height: 560 });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 160)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 160));
});

await page.goto(`${BASE}?instant&momento=dia&estacion=verano`, { waitUntil: 'load', timeout: 240000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await page.waitForFunction(() => window.__portfolio?.catalogo, { timeout: 240000 });
await page.waitForFunction(() => !document.getElementById('loader'), { timeout: 60000 });

const datos = await page.evaluate(() => {
  const P = window.__portfolio;
  const rig = P.rig;
  const w = rig.walk;
  const cam = P.camera;

  /** Deja al caminante quieto en un punto llano, mirando a un rumbo. */
  const plantar = (x, z, yaw) => {
    rig.setMode('walk');
    rig.enabled = true;
    rig.free.pointerLocked = true;
    rig.plantar(x, z, yaw);
    rig.free.keys.clear();
    rig.free.pitch = 0;
    rig.free.yaw = yaw;
    // Unos fotogramas para que se asiente en el suelo antes de medir.
    for (let i = 0; i < 40; i++) rig.update(1 / 60);
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z };
  };

  const correr = (n, dt = 1 / 60, alPaso = null) => {
    for (let i = 0; i < n; i++) {
      rig.update(dt);
      if (alPaso) alPaso(i);
    }
  };

  // ── Ejes ────────────────────────────────────────────────────────────
  //
  // Se planta mirando a un rumbo cualquiera y se pulsa D. El desplazamiento
  // tiene que caer sobre el lateral DERECHO de la cámara, que se saca del
  // cuaternión —o sea, de la misma fuente que usa el vuelo libre, que está
  // bien— y no de la fórmula que se está probando.
  const ejes = {};
  for (const [tecla, signo] of [['KeyD', 1], ['KeyA', -1], ['KeyW', 0], ['KeyS', 0]]) {
    const a = plantar(10, 30, 0.7);
    const der = new (cam.position.constructor)(1, 0, 0).applyQuaternion(cam.quaternion);
    der.y = 0;
    der.normalize();
    const del = new (cam.position.constructor)(0, 0, -1).applyQuaternion(cam.quaternion);
    del.y = 0;
    del.normalize();
    rig.free.keys.add(tecla);
    correr(45);
    rig.free.keys.clear();
    const d = new (cam.position.constructor)(
      cam.position.x - a.x, 0, cam.position.z - a.z
    );
    ejes[tecla] = {
      lateral: +d.dot(der).toFixed(2),
      frontal: +d.dot(del).toFixed(2),
      esperado: signo,
    };
  }

  // ── El salto ────────────────────────────────────────────────────────
  const base = plantar(10, 30, 0.7);
  const suelo0 = base.y - w.ojos;
  rig.free.keys.add('Space');
  const alturas = [];
  let tiempoAire = 0;
  correr(90, 1 / 60, (i) => {
    // Se suelta la barra al tercer fotograma: un salto no es mantener pulsado.
    if (i === 3) rig.free.keys.delete('Space');
    alturas.push(cam.position.y - w.ojos);
    if (!w.enSuelo) tiempoAire += 1 / 60;
  });
  rig.free.keys.clear();
  const cima = Math.max(...alturas) - suelo0;
  const finalY = cam.position.y - w.ojos;

  // ── Ni saltos dobles ni salto en el aire ────────────────────────────
  plantar(10, 30, 0.7);
  rig.free.keys.add('Space');
  correr(4);
  rig.free.keys.delete('Space');
  correr(12);                       // a media subida
  const yMedia = cam.position.y;
  const enAire = !w.enSuelo;
  rig.free.keys.add('Space');       // se intenta saltar otra vez
  correr(2);
  const caidaTrasIntento = w.caida;
  rig.free.keys.clear();
  correr(80);

  // ── El margen del coyote ────────────────────────────────────────────
  //
  // Se fuerza el estado de recién salido del suelo y se comprueba que la
  // ventana existe y que se cierra.
  plantar(10, 30, 0.7);
  w.enSuelo = false;
  w.coyote = w.coyoteMax * 0.5;
  rig.free.keys.add('Space');
  correr(1);
  const coyoteVale = w.caida < 0;
  rig.free.keys.clear();
  correr(90);

  plantar(10, 30, 0.7);
  w.enSuelo = false;
  w.coyote = w.coyoteMax * 4;
  rig.free.keys.add('Space');
  correr(1);
  const coyoteCaduca = w.caida >= 0;
  rig.free.keys.clear();
  correr(90);

  // ── Que el salto sirva para subirse a algo ──────────────────────────
  //
  // No basta con que exista la parábola: si la regla de pisada siguiera
  // mandando en el aire, saltar sobre un repecho te dejaría flotando contra su
  // costado.
  //
  // El escalón se FABRICA en vez de buscarlo por la isla. El primer intento
  // barría el terreno buscando un desnivel de un metro que `_sePuedePisar`
  // rechazara, y encontró uno... que no existía: el caminante avanzaba 2,7 m
  // por encima de él sin ganar altura, o sea que era un pico de ruido de una
  // sola muestra, no una pared. Una pasarela registrada a mano da un escalón
  // de la altura exacta que se quiere, ancho de verdad, y encima pasa por
  // `enFabrica`, que es la rama del criterio que interesa probar.
  const f = P.world.field;
  const BANCO = 1.0;
  const base2 = plantar(6, 34, 0.7);
  const h0 = base2.y - w.ojos;
  const del2 = new (cam.position.constructor)(0, 0, -1).applyQuaternion(cam.quaternion);
  del2.y = 0;
  del2.normalize();
  // El banco empieza a SEIS metros, no a dos, y se salta con carrerilla.
  //
  // La primera versión saltaba desde parado a metro ochenta del escalón y no
  // llegaba. Trazado fotograma a fotograma: en la cima de la parábola —0,3 s—
  // solo se había avanzado 0,80 m, porque la velocidad horizontal arranca
  // amortiguada y tarda un tercio de segundo en llegar a crucero; al pisar el
  // escalón los pies ya iban por 0,39 y volvían a bajar. No era un fallo del
  // salto, era una prueba mal montada: nadie salta un bordillo desde parado con
  // la punta del pie pegada a él. Se toma carrerilla y se salta ANTES de llegar.
  // OJO CON EL ANCHO: `_onSegment` recorta la proyección a [0,1], así que un
  // punto que quede POR DETRÁS del arranque mide su distancia contra ese
  // arranque. Con medio ancho 6 y el banco a 6 m, el caminante nacía dentro
  // del propio pasillo y no se movía. Estrecho y lejos.
  const pa = { x: base2.x + del2.x * 8.0, z: base2.z + del2.z * 8.0 };
  const pb = { x: base2.x + del2.x * 22.0, z: base2.z + del2.z * 22.0 };
  f.addWalkway(pa.x, pa.z, pb.x, pb.z, {
    halfWidth: 2.5,
    floorA: h0 + BANCO,
    floorB: h0 + BANCO,
  });

  /** Corre hacia el banco y, si se pide, salta a 1,3 m de él. */
  const intento = (conSalto) => {
    plantar(base2.x, base2.z, 0.7);
    const y0 = cam.position.y - w.ojos;
    const q0 = { x: cam.position.x, z: cam.position.z };
    const avanceDe = () =>
      (cam.position.x - q0.x) * del2.x + (cam.position.z - q0.z) * del2.z;
    let saltado = false;
    let cima = 0;
    rig.free.keys.add('KeyW');
    correr(220, 1 / 60, () => {
      // A 1,3 m del borde REAL del pasillo, que está en 5,5 y no en 8: el medio
      // ancho de 2,5 cuenta también por delante del arranque del tramo.
      if (conSalto && !saltado && avanceDe() > 4.2) {
        rig.free.keys.add('Space');
        saltado = true;
      } else if (saltado) {
        rig.free.keys.delete('Space');
      }
      cima = Math.max(cima, cam.position.y - w.ojos - y0);
    });
    const r = {
      sube: +(cam.position.y - w.ojos - y0).toFixed(2),
      // Avance PROYECTADO sobre la marcha, no distancia recorrida: chocar de
      // frente con algo y deslizarse a lo largo también recorre metros.
      avance: +avanceDe().toFixed(2),
      cima: +cima.toFixed(2),
    };
    rig.free.keys.clear();
    correr(30);
    return r;
  };

  // ¿Existe de verdad el banco? Se le pregunta al campo antes de andar nada.
  const medio = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
  const bancoReal = {
    suelo: +f.walkHeight(medio.x, medio.z, h0 + 2).toFixed(2),
    esperado: +(h0 + BANCO).toFixed(2),
    terreno: +f.height(medio.x, medio.z).toFixed(2),
    enFabrica: f.enFabrica(medio.x, medio.z, h0 + 1),
    // Y que el caminante NO nazca ya dentro del pasillo.
    salida: +f.walkHeight(base2.x, base2.z, h0 + 2).toFixed(2),
  };


  const andando = intento(false);
  const saltando = intento(true);
  f.walkways.pop();   // se desmonta el banco

  return {
    ejes,
    salto: {
      cima: +cima.toFixed(2),
      aire: +tiempoAire.toFixed(2),
      vuelveAlSuelo: Math.abs(finalY - suelo0) < 0.2,
      impulso: w.saltoImpulso,
      gravedad: w.gravedad,
      teorica: +((w.saltoImpulso * w.saltoImpulso) / (2 * w.gravedad)).toFixed(2),
    },
    doble: { enAire, caidaTrasIntento: +caidaTrasIntento.toFixed(2), yMedia: +yMedia.toFixed(2) },
    coyote: { vale: coyoteVale, caduca: coyoteCaduca, ventana: w.coyoteMax },
    banco: BANCO,
    bancoReal,
    andando,
    saltando,
  };
});

// ── 1. Los ejes ──────────────────────────────────────────────────────────
console.log('── hacia dónde se anda');
const d = datos.ejes.KeyD;
const a = datos.ejes.KeyA;
comprobar(
  d.lateral > 0.5,
  'D lleva a la DERECHA de la cámara',
  `avanza ${d.lateral} m por el lateral derecho`
);
comprobar(
  a.lateral < -0.5,
  'y A a la izquierda',
  `avanza ${a.lateral} m por el lateral derecho`
);
comprobar(
  Math.abs(d.frontal) < 0.35 && Math.abs(a.frontal) < 0.35,
  'sin colarse hacia delante ni hacia atrás',
  `D ${d.frontal} m, A ${a.frontal} m de componente frontal`
);
comprobar(
  datos.ejes.KeyW.frontal > 0.5 && datos.ejes.KeyS.frontal < -0.5,
  'y W y S siguen yendo adonde deben',
  `W ${datos.ejes.KeyW.frontal} m, S ${datos.ejes.KeyS.frontal} m`
);

// ── 2. El salto ──────────────────────────────────────────────────────────
console.log('\n── el salto');
comprobar(
  datos.salto.cima > 0.9 && datos.salto.cima < 1.8,
  'se despega del suelo y sube algo más de un metro',
  `cima a ${datos.salto.cima} m (la teórica con v=${datos.salto.impulso} y g=${datos.salto.gravedad} son ${datos.salto.teorica})`
);
comprobar(
  Math.abs(datos.salto.cima - datos.salto.teorica) < 0.25,
  'y la parábola sale la que dicen los números, no otra',
  `medido ${datos.salto.cima} contra ${datos.salto.teorica}`
);
comprobar(
  datos.salto.aire > 0.4 && datos.salto.aire < 1.1,
  'con un tiempo en el aire de persona, no de astronauta',
  `${datos.salto.aire} s`
);
comprobar(datos.salto.vuelveAlSuelo, 'y se vuelve al suelo donde se estaba');

// ── 3. Sin saltos dobles ─────────────────────────────────────────────────
console.log('\n── lo que NO se puede hacer');
comprobar(datos.doble.enAire, 'a mitad de salto se está en el aire', `y a ${datos.doble.yMedia} m`);
comprobar(
  datos.doble.caidaTrasIntento > -datos.salto.impulso * 0.5,
  'y volver a pulsar ahí no da un segundo impulso',
  `velocidad vertical ${datos.doble.caidaTrasIntento} m/s (un salto nuevo la pondría en -${datos.salto.impulso})`
);

// ── 4. El coyote ─────────────────────────────────────────────────────────
console.log('\n── el margen del coyote');
comprobar(datos.coyote.vale, `dentro de los ${datos.coyote.ventana} s todavía se salta`);
comprobar(datos.coyote.caduca, 'y pasada la ventana ya no');

// ── 5. Que sirva de algo ─────────────────────────────────────────────────
console.log('\n── para qué sirve');
console.log(`    · banco a ${datos.bancoReal.suelo} m (esperado ${datos.bancoReal.esperado}), terreno ${datos.bancoReal.terreno}, salida a ${datos.bancoReal.salida}`);
comprobar(
  datos.andando.sube < 0.3 && datos.andando.avance > 1.0,
  `andando de frente contra un escalón de ${datos.banco} m no se sube`,
  `avanza ${datos.andando.avance} m de frente y gana ${datos.andando.sube} m`
);
comprobar(
  datos.saltando.sube > datos.banco * 0.75,
  'y saltando sí: el salto sirve para algo',
  `gana ${datos.saltando.sube} m (cima ${datos.saltando.cima}) contra los ${datos.andando.sube} de andar`
);

comprobar(errores.length === 0, 'consola limpia', errores.join(' | '));

await page.close();
await browser.close();

console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
