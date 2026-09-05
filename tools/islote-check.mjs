/**
 * Prueba del islote y su calzada.
 *
 * Cuatro cosas se rompen aquí sin dar un error, y las cuatro salieron mal en
 * la primera versión:
 *
 *  1. EL CAMPO. El islote se compone con `Math.max` sobre el promontorio, así
 *     que su falda levanta el lecho allí donde quede por encima del fondo
 *     natural. Con una falda a -9 salía una meseta de sesenta y cuatro metros
 *     de radio alrededor del islote — un pedestal cuadrado bajo el agua.
 *  2. LA COTA DE LAS PIEDRAS. `createStone` devuelve la malla con la BASE en
 *     y=0, no centrada. Colocándola por el centro, todo sube media altura: las
 *     dieciocho pilas de la calzada asomaban por encima del tablero y el
 *     puente se leía como un esqueleto de pez.
 *  3. QUE SE PUEDA SUBIR. La ladera del islote sube a 0,88 de tangente y el
 *     modo a pie admite 0,62. Sin escalinata se cruza el puente, se llega al
 *     pie de la peña y ahí se acaba — un puente a un sitio en el que no se
 *     puede entrar. Y no basta con posar peldaños: `walkHeight` devuelve el
 *     MÁXIMO entre terreno y pasarela, así que sobre una ladera que sube más
 *     deprisa que la escalera, la escalera queda enterrada.
 *  4. QUE EL DOLMEN NO ESTÉ ENTERRADO. El terreno subía dos metros en los
 *     cinco de huella del monumento y la jamba de atrás quedaba tragada 1,79
 *     de sus 1,94.
 *
 *   node tools/islote-check.mjs
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
await page.setViewport({ width: 1100, height: 660 });
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
// La cámara deriva sola tras seis segundos parada. Si se va a comparar nada
// entre dos capturas, hay que congelarla antes.
await page.evaluate(() => { window.__portfolio.rig.idleDrift = false; });
await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

const datos = await page.evaluate(() => {
  const P = window.__portfolio;
  const w = P.world;
  const f = w.field;
  const I = w.isloteCentro;
  const R = w.isloteRadio;
  const dCentro = Math.hypot(I.x, I.y);
  const rumbo = Math.atan2(I.y, I.x);
  const c = Math.cos(rumbo);
  const s = Math.sin(rumbo);
  const costa = f.coastRadius(rumbo);

  // ── Perfil a lo largo del rumbo ────────────────────────────────────
  const perfil = [];
  // El barrido llega hasta pasada la orilla LEJANA del islote. Con un tope
  // fijo de 300 la prueba fallaba al ensanchar el islote, y no porque el
  // mundo estuviera mal: es que el tercer cruce del nivel del mar se quedaba
  // fuera del rango medido.
  for (let d = 150; d <= dCentro + R * 1.6; d += 0.5) perfil.push([d, f.height(c * d, s * d)]);
  const cruces = [];
  for (let i = 1; i < perfil.length; i++) {
    if (Math.sign(perfil[i - 1][1]) !== Math.sign(perfil[i][1])) cruces.push(+perfil[i][0].toFixed(0));
  }
  const aguaEntre = cruces.length >= 2 ? cruces[1] - cruces[0] : 0;
  const cima = Math.max(...perfil.map((p) => p[1]));

  // ── ¿Pedestal? El lecho lejos del islote, con y sin él ─────────────
  //
  // Se compara contra el promontorio a secas, que es lo que `_promontorio`
  // devuelve antes de componer nada.
  const perp = rumbo + Math.PI / 2;
  const pedestal = [];
  // Las distancias van en RADIOS del islote, no en metros fijos: a 44 y 60 m
  // de un islote de radio 78 se mide dentro del propio islote, y entonces la
  // prueba acusa de pedestal a la peña misma.
  //
  // Y las dos de fuera van a 2,0 y 2,8 radios porque la falda submarina está
  // DEFINIDA hasta 1,9 (ver `_islotes`): muestreando a 1,8 se mide la falda y
  // se la llama pedestal.
  for (const r of [R * 1.35, R * 2.0, R * 2.8]) {
    const x = I.x + Math.cos(perp) * r;
    const z = I.y + Math.sin(perp) * r;
    pedestal.push({
      r: +(r / R).toFixed(2),
      cota: +f.height(x, z).toFixed(1),
      sobra: +(f.height(x, z) - f._promontorio(x, z)).toFixed(1),
    });
  }

  // ── La calzada ─────────────────────────────────────────────────────
  const cal = w.calzada;
  const desde = cal.userData.desde;
  const hasta = cal.userData.hasta;
  const dDesde = Math.hypot(desde.x, desde.y);
  const dHasta = Math.hypot(hasta.x, hasta.y);

  // Corte transversal a mitad del puente: dentro se anda, fuera se cae.
  const dm = (dDesde + dHasta) / 2;
  const lx = -s;
  const lz = c;
  const ancho = [];
  for (let o = -4; o <= 4; o += 0.5) {
    const x = c * dm + lx * o;
    const z = s * dm + lz * o;
    ancho.push([+o.toFixed(1), f.enFabrica(x, z, 3)]);
  }
  const pasillo = ancho.filter(([, e]) => e).map(([o]) => o);

  // ── ¿Se puede llegar andando hasta el dolmen? ──────────────────────
  //
  // Se replica el criterio del propio `CameraRig`: donde hay obra manda el
  // ESCALÓN (0,55 m), donde solo hay tierra manda la PENDIENTE (0,62 de
  // tangente). Y se avanza a doce centímetros por paso, que es lo que se
  // mueve alguien andando entre dos fotogramas — comprobarlo metro a metro
  // daría un falso negativo, porque una escalera de peldaños de 0,42 sube
  // 0,88 por metro y ninguna escalera del mundo pasaría esa prueba.
  const PASO = 0.12;
  const ESCALON = 0.55;
  const PENDIENTE = 0.62;
  let bloqueo = null;
  let y = f.walkHeight(c * (dDesde - 4), s * (dDesde - 4), 5);
  for (let d = dDesde - 4; d <= Math.hypot(w.dolmen.position.x, w.dolmen.position.z); d += PASO) {
    const x = c * d;
    const z = s * d;
    const suelo = f.walkHeight(x, z, y + 1.7);
    const subida = suelo - y;
    const obra = f.enFabrica(x, z, suelo);
    const vale = obra ? subida <= ESCALON : subida / PASO <= PENDIENTE;
    if (!vale && bloqueo === null) {
      bloqueo = { d: +d.toFixed(1), subida: +subida.toFixed(2), obra, tan: +(subida / PASO).toFixed(2) };
    }
    y = suelo;
  }

  // ── El dolmen ──────────────────────────────────────────────────────
  w.scene.updateMatrixWorld(true);
  const V = w.dolmen.position.constructor;
  const p = new V();
  const piezas = w.dolmen.children.map((o) => {
    o.getWorldPosition(p);
    const caja = o.geometry.boundingBox;
    return {
      n: o.name,
      // Cuánto de la pieza queda por encima del suelo que tiene debajo.
      visible: +(p.y + (caja.max.y - caja.min.y) - f.height(p.x, p.z)).toFixed(2),
      alto: +(caja.max.y - caja.min.y).toFixed(2),
    };
  });

  return {
    rumbo: +rumbo.toFixed(2),
    costa: +costa.toFixed(0),
    cruces,
    aguaEntre,
    cima: +cima.toFixed(1),
    pedestal,
    calzada: {
      vanos: cal.userData.vanos,
      piezas: cal.children.length,
      cotaA: +cal.userData.cota.toFixed(2),
      cotaB: +cal.userData.cotaB.toFixed(2),
      dDesde: +dDesde.toFixed(0),
      dHasta: +dHasta.toFixed(0),
    },
    escalinata: {
      piezas: w.escalinata.children.length,
      peldanos: w.escalinata.userData.peldanos ?? 0,
      contra: +(w.escalinata.userData.contra ?? 0).toFixed(2),
    },
    pasillo: pasillo.length ? [Math.min(...pasillo), Math.max(...pasillo)] : null,
    bloqueo,
    piezas,
  };
});

// ── 1. El campo ──────────────────────────────────────────────────────────
console.log('── la segunda tierra');
comprobar(
  datos.cruces.length >= 3,
  'hay dos tierras separadas por agua sobre el rumbo del islote',
  `el nivel del mar se cruza en d = ${datos.cruces.join(', ')}`
);
comprobar(
  datos.aguaEntre > 25,
  'y el brazo de mar que hay que cruzar es de verdad',
  `${datos.aguaEntre} m entre las dos orillas`
);
comprobar(datos.cima > 15, 'el islote levanta lo suyo', `cima a ${datos.cima} m`);
// Que el islote tenga falda submarina es CORRECTO: una isla se apoya en algo.
// Lo que no puede haber es un escalón plano cerca de la superficie, que fue el
// fallo de la primera versión —una meseta a -9 m en sesenta y cuatro metros a
// la redonda—. Así que se piden dos cosas distintas: cerca, que la falda vaya
// bien hundida; lejos, que se haya fundido ya con el lecho de verdad.
const cerca = datos.pedestal[0];
const lejos = datos.pedestal.slice(1);
comprobar(
  cerca.cota < -8,
  'la falda del islote va bien hundida: no hay repisa a flor de agua',
  `a 1,35 radios el fondo está a ${cerca.cota} m`
);
comprobar(
  lejos.every((v) => Math.abs(v.sobra) < 0.5),
  'y se funde con el lecho de verdad: no hay pedestal',
  lejos.map((v) => `a ${v.r} radios sobra ${v.sobra} m`).join(', ')
);

// ── 2. La calzada ────────────────────────────────────────────────────────
console.log('\n── la calzada');
comprobar(datos.calzada.vanos >= 8, 'tiene vanos suficientes para leerse como puente', `${datos.calzada.vanos} vanos, ${datos.calzada.piezas} piezas`);
comprobar(
  datos.calzada.cotaB > datos.calzada.cotaA,
  'el tablero va en rampa, no a nivel',
  `de ${datos.calzada.cotaA} m a ${datos.calzada.cotaB} m`
);
comprobar(
  Math.abs(datos.calzada.cotaB - datos.calzada.cotaA) / (datos.calzada.dHasta - datos.calzada.dDesde) < 0.12,
  'y la pendiente es suave',
  `${(((datos.calzada.cotaB - datos.calzada.cotaA) / (datos.calzada.dHasta - datos.calzada.dDesde)) * 100).toFixed(0)} %`
);
comprobar(
  datos.pasillo !== null && datos.pasillo[1] - datos.pasillo[0] <= 4,
  'el pasillo por el que se anda es estrecho: fuera de la losa se cae uno al agua',
  datos.pasillo ? `de ${datos.pasillo[0]} a ${datos.pasillo[1]} m del eje` : 'no hay pasillo'
);

// ── 3. Se llega arriba ───────────────────────────────────────────────────
console.log('\n── se cruza y se sube');
comprobar(datos.escalinata.peldanos > 0, 'hay escalinata desde el desembarco', `${datos.escalinata.peldanos} peldaños de ${datos.escalinata.contra} m`);
comprobar(
  datos.escalinata.contra <= 0.55,
  'con la contrahuella por debajo de lo que el modo a pie sube sin preguntar',
  `${datos.escalinata.contra} m contra un máximo de 0,55`
);
comprobar(
  datos.bloqueo === null,
  'y se llega andando desde la isla grande hasta el dolmen sin un solo tramo infranqueable',
  datos.bloqueo
    ? `cortado en d=${datos.bloqueo.d}: sube ${datos.bloqueo.subida} m ${datos.bloqueo.obra ? 'sobre obra' : `en tierra (tangente ${datos.bloqueo.tan})`}`
    : ''
);

// ── 4. El dolmen ─────────────────────────────────────────────────────────
console.log('\n── el dolmen');
const enterradas = datos.piezas.filter((p) => p.visible < p.alto * 0.35);
comprobar(datos.piezas.length >= 7, 'tiene sus jambas, su cubierta y sus bloques caídos', `${datos.piezas.length} piezas`);
comprobar(
  enterradas.length === 0,
  'y ninguna pieza está tragada por el terreno',
  enterradas.length
    ? enterradas.map((p) => `${p.n} asoma ${p.visible} de ${p.alto}`).join(' · ')
    : datos.piezas.map((p) => `${p.visible}/${p.alto}`).join(' ')
);

// ── 5. Que se vea ────────────────────────────────────────────────────────
//
// Con la cámara puesta a mirar el islote —no desde el mirador, donde el
// cinturón de árboles de la isla grande lo tapa—: aquí lo que se comprueba es
// que la fábrica se DIBUJA, no dónde queda encuadrada.
console.log('\n── se ve');
const pintado = await page.evaluate(async () => {
  const P = window.__portfolio;
  const w = P.world;
  const rumbo = Math.atan2(w.isloteCentro.y, w.isloteCentro.x);
  P.rig.target.copy(w.dolmen.position).setY(w.dolmen.position.y + 4);
  P.rig.distance = 165;
  P.rig.polar = 1.1;
  P.rig.azimuth = -rumbo + 0.55;
  P.rig.idleDrift = false;
  await new Promise((r) => setTimeout(r, 3200));
  const V = w.dolmen.position.constructor;
  const v = new V();
  const W = P.renderer.domElement.clientWidth;
  const H = P.renderer.domElement.clientHeight;
  const px = (o) => {
    v.copy(o).project(P.camera);
    return [Math.round(((v.x + 1) / 2) * W), Math.round(((1 - v.y) / 2) * H)];
  };
  return {
    dolmen: px(w.dolmen.position),
    calzada: px(new V(w.calzada.userData.desde.x, w.calzada.userData.cota, w.calzada.userData.desde.y)),
    W,
    H,
  };
});
const dentro = ([x, y]) => x > 0 && x < pintado.W && y > 0 && y < pintado.H;
comprobar(dentro(pintado.dolmen), 'el dolmen cae dentro del cuadro al mirar hacia él', `en ${pintado.dolmen}`);
comprobar(dentro(pintado.calzada), 'y la calzada también', `en ${pintado.calzada}`);
comprobar(errores.length === 0, 'consola limpia', errores.join(' | '));

await page.close();
await browser.close();

console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
