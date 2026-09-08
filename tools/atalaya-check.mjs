/**
 * Prueba de la atalaya del islote.
 *
 * Lo que hay que demostrar es el VIAJE ENTERO, y por tramos separados no vale:
 * cada pieza —calzada, escalinata, rampa— puede estar bien y el conjunto no
 * llevar a ninguna parte. De hecho es lo que pasaba, y dos veces:
 *
 *  1. El rig recortaba la posición a `WORLD.radius * 1.02` = 171,4 m. La
 *     calzada existía, el terreno era continuo, no había un solo colisionador
 *     en el trayecto y la regla de pisada decía «se pasa» en cada paso — y aun
 *     así el caminante se quedaba clavado en la orilla con la velocidad a tope
 *     y cero avance. Ese recorte se escribió cuando la isla era el mundo.
 *
 *  2. La escalinata del islote llegaba hasta el centro, que es donde ahora
 *     está la torre. `walkHeight` se queda con el tramo de pasarela MÁS
 *     CERCANO, y a mitad de la rampa la escalinata ganaba por 0,54 contra 0,62:
 *     el suelo caía once metros de golpe. `enFabrica` seguía diciendo que sí
 *     había obra — la había, pero era la equivocada.
 *
 * Las dos veces el fallo estaba entre dos piezas correctas, así que la prueba
 * camina de verdad: se planta en la isla grande y anda hasta el adarve.
 *
 *   node tools/atalaya-check.mjs
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
await page.setViewport({ width: 900, height: 620 });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('.loader__enter');
    return el && !el.hidden;
  },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 2000));

console.log('\n── La atalaya del islote ──────────────────────────────────────\n');

// ── 1. Está levantada, y barata ────────────────────────────────────────────
const montaje = await page.evaluate(() => {
  const ex = window.__portfolio;
  let mallas = 0;
  ex.world.atalaya?.traverse((o) => {
    if (o.isMesh) mallas++;
  });
  let escena = 0;
  ex.scene.traverse((o) => {
    if (o.isMesh) escena++;
  });
  return {
    existe: Boolean(ex.world.atalaya),
    mallas,
    escena,
    velas: ex.world.atalaya?.userData?.velas?.length ?? 0,
    dolmenSigue: Boolean(ex.world.dolmen),
  };
});
comprobar(montaje.existe, 'La atalaya está en la escena');
comprobar(montaje.velas === 4, 'Con sus cuatro pebeteros', `${montaje.velas}`);
comprobar(montaje.dolmenSigue, 'Y el dolmen sigue ahí, corrido a un lado');
// Sin fundir son 1.270 mallas y la escena pasa de 753 a 2.023. No son los
// vértices: son las llamadas de dibujado, el mismo problema que ya documentó
// la calzada. Fundidas por material, la torre entera cuesta doce.
comprobar(montaje.mallas < 30, 'La torre está fundida por material', `${montaje.mallas} mallas`);
comprobar(montaje.escena < 820, 'Y la escena no se dispara', `${montaje.escena} mallas`);

// ── 2. Se llega andando desde la isla grande ───────────────────────────────
const viaje = await page.evaluate(() => {
  const ex = window.__portfolio;
  const rig = ex.rig;
  const campo = ex.world.field;
  const c = ex.world.isloteCentro;
  const rumbo = Math.atan2(c.y, c.x);
  const punto = (d) => [Math.cos(rumbo) * d, Math.sin(rumbo) * d];

  const ruta = [];
  for (let d = 158; d <= 296; d += 6) ruta.push(punto(d));

  rig.enabled = true;
  const ini = punto(150);
  rig.plantar(ini[0], ini[1], 0);
  rig.free.pointerLocked = true;
  rig.free.keys.clear();
  rig.free.keys.add('KeyW');

  let indice = 0;
  let sobreElMar = 0;
  for (let i = 0; i < 4000; i++) {
    const p = ex.camera.position;
    let meta = ruta[indice];
    while (meta && Math.hypot(p.x - meta[0], p.z - meta[1]) < 2.2 && indice < ruta.length - 1) {
      meta = ruta[++indice];
    }
    if (!meta) break;
    rig.free.yaw = Math.atan2(-(meta[0] - p.x), -(meta[1] - p.z));
    rig.update(0.05);
    // Los PIES secos, no el terreno: la gracia de una calzada es justo que
    // cruza el agua, y bajo su tablero el fondo está a −3. La primera versión
    // de esta comprobación miraba `height` y contaba 257 pasos «sobre el mar»
    // que eran exactamente los del puente, o sea la función que se buscaba.
    if (p.y - rig.walk.ojos < -0.4) sobreElMar++;
  }
  rig.free.keys.clear();
  const f = ex.camera.position;
  return {
    alCentro: +Math.hypot(f.x - c.x, f.z - c.y).toFixed(1),
    cota: +(f.y - rig.walk.ojos).toFixed(1),
    baseIslote: +campo.height(c.x, c.y).toFixed(1),
    sobreElMar,
  };
});
comprobar(viaje.alCentro < 20, 'Se cruza el mar a pie y se llega al islote', `a ${viaje.alCentro} m de la torre`);
comprobar(
  Math.abs(viaje.cota - viaje.baseIslote) < 3,
  'Y se llega arriba del islote, no a su orilla',
  `cota ${viaje.cota} contra base ${viaje.baseIslote}`
);
comprobar(viaje.sobreElMar === 0, 'Sin pisar el agua en ningún momento', `${viaje.sobreElMar} pasos`);

// ── 3. Se entra por la puerta y se sube ────────────────────────────────────
//
// Empezando FUERA, no dentro. La primera versión de esta prueba plantaba al
// caminante ya en el arranque de la rampa, y con eso pasaba en verde mientras
// la puerta estaba a 312° y la rampa arrancaba a 170°: entrar por la puerta
// dejaba en el patio sin nada que subir, y la escalera nacía a media torre
// contra el muro. Una prueba que empieza dentro no prueba que se pueda entrar.
const entrada = await page.evaluate(() => {
  const ex = window.__portfolio;
  const rig = ex.rig;
  const campo = ex.world.field;
  const c = ex.world.isloteCentro;
  const base = campo.height(c.x, c.y);
  const rumbo = 2.3 + Math.PI;
  const R = 7.8 - 2.1 - 1.05;

  const andar = (desde, ruta, pasos, tol) => {
    rig.enabled = true;
    rig.plantar(desde[0], desde[1], 0);
    rig.free.pointerLocked = true;
    rig.free.keys.clear();
    rig.free.keys.add('KeyW');
    let idx = 0;
    let cotaMax = -Infinity;
    let caidas = 0;
    let previa = base;
    for (let i = 0; i < pasos; i++) {
      const p = ex.camera.position;
      let meta = ruta[idx];
      while (meta && Math.hypot(p.x - meta[0], p.z - meta[1]) < tol && idx < ruta.length - 1) {
        meta = ruta[++idx];
      }
      if (!meta) break;
      rig.free.yaw = Math.atan2(-(meta[0] - p.x), -(meta[1] - p.z));
      rig.update(0.05);
      const suelo = p.y - rig.walk.ojos;
      if (suelo > cotaMax) cotaMax = suelo;
      if (previa - suelo > 2) caidas++;
      previa = suelo;
    }
    rig.free.keys.clear();
    const f = ex.camera.position;
    return {
      radio: +Math.hypot(f.x - c.x, f.z - c.y).toFixed(1),
      cota: +(f.y - rig.walk.ojos).toFixed(1),
      cotaMax: +cotaMax.toFixed(1),
      caidas,
    };
  };

  // A) Desde fuera, cruzando el umbral y subiendo hasta el adarve.
  const ruta = [[c.x + Math.cos(rumbo) * R, c.y + Math.sin(rumbo) * R]];
  for (let i = 1; i <= 46; i++) {
    const a = rumbo + (i / 46) * 0.92 * Math.PI * 2;
    ruta.push([c.x + Math.cos(a) * R, c.y + Math.sin(a) * R]);
  }
  ruta.push([c.x, c.y]); // y un último paso al centro del adarve
  const porLaPuerta = andar([c.x + Math.cos(rumbo) * 12, c.y + Math.sin(rumbo) * 12], ruta, 2800, 0.9);

  // B) Y el muro por el lado contrario: no se atraviesa.
  const op = rumbo + Math.PI;
  const porLaPared = andar([c.x + Math.cos(op) * 12, c.y + Math.sin(op) * 12], [[c.x, c.y]], 900, 0.5);

  return { base: +base.toFixed(1), cima: +(base + 11.5).toFixed(1), porLaPuerta, porLaPared };
});
comprobar(
  entrada.porLaPuerta.cotaMax - entrada.base > 10.5,
  'Se entra por la puerta y se sube hasta el adarve',
  `${(entrada.porLaPuerta.cotaMax - entrada.base).toFixed(1)} m de 11,5`
);
comprobar(entrada.porLaPuerta.caidas === 0, 'Sin despeñarse por el camino', `${entrada.porLaPuerta.caidas} desplomes`);
// Y lo contrario, que es lo que convierte la puerta en una puerta: por el muro
// no se pasa. Sin cuerpo en la fábrica, la torre es un decorado y entrar por
// donde toca no significa nada.
comprobar(
  entrada.porLaPared.radio > 5,
  'Y el muro no se atraviesa: por el lado ciego no se entra',
  `se queda a ${entrada.porLaPared.radio} m del eje`
);
comprobar(
  entrada.porLaPared.cotaMax - entrada.base < 1.5,
  'Ni se trepa por fuera',
  `sube ${(entrada.porLaPared.cotaMax - entrada.base).toFixed(1)} m`
);

// ── 4. Las velas obedecen a la hora ────────────────────────────────────────
const velas = await page.evaluate(async () => {
  const ex = window.__portfolio;
  const leer = async (fase) => {
    ex.world.time.set(fase, true);
    for (let i = 0; i < 6; i++) {
      ex.world.time.update(0.6);
      ex.world.update(0.1, { camera: ex.camera });
    }
    const v = ex.world.atalaya.userData.velas;
    return {
      fase,
      noche: +(ex.world.time.value.noche ?? -1).toFixed(2),
      arden: v.filter((x) => x.fuego.visible).length,
      luz: +v[0].luz.intensity.toFixed(2),
    };
  };
  return { dia: await leer('dia'), noche: await leer('noche'), tarde: await leer('tarde') };
});
comprobar(velas.dia.arden === 0, 'De día están apagadas', `luz ${velas.dia.luz}`);
comprobar(velas.noche.arden === 4, 'De noche arden las cuatro', `luz ${velas.noche.luz}`);
comprobar(
  velas.tarde.luz > velas.dia.luz && velas.tarde.luz < velas.noche.luz,
  'Y al atardecer están a medias, no conmutadas de golpe',
  `${velas.dia.luz} → ${velas.tarde.luz} → ${velas.noche.luz}`
);

comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
