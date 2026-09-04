/**
 * Prueba de las estaciones.
 *
 * Lo que aquí se puede romper sin que se note son tres cosas distintas:
 *
 *  1. El REPARTO: qué estación le toca a una fecha, y el hemisferio. Un error
 *     de signo aquí manda el invierno a julio y nadie lo ve hasta julio.
 *  2. La LLEGADA: que la estación esté puesta ANTES del primer fotograma. Si
 *     llegara después, quien entra en otoño ve la isla reverdecer y volver a
 *     dorarse delante de él, que es peor que no tener estaciones.
 *  3. Que el shader VIRE DE VERDAD. Esta es la que importa y la única que no
 *     se puede juzgar leyendo el código: un uniform mal enchufado —o un
 *     `UniformsUtils.merge` que clona la referencia— deja el rótulo cambiando
 *     y el prado verde. Así que no se comprueba el estado interno sino los
 *     PÍXELES, comparando capturas de la misma cámara en dos estaciones.
 *
 * El reloj se falsea sustituyendo `Date` antes de que corra nada, igual que en
 * `momento-check.mjs`, y el huso se inyecta por parámetro para poder probar el
 * hemisferio sur y el trópico sin viajar.
 *
 *   node tools/estacion-check.mjs
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

// Página de servicio: descodifica PNG y cuenta píxeles, no dibuja isla ninguna.
// Se abre la primera y se queda viva hasta el final; ninguna isla convive con
// otra, así que nunca hay más de dos pestañas.
const comparador = await browser.newPage();

// ── 1. El reparto ────────────────────────────────────────────────────────
//
// Se importa el módulo suelto en una página en blanco. No hace falta montar la
// isla para comprobar una tabla de fechas, y montarla cuesta dos segundos por
// caso.
console.log('── a qué estación toca cada fecha');

await comparador.goto(`${BASE}?modo=ligero`, { waitUntil: 'load', timeout: 240000 });

const reparto = await comparador.evaluate(async (base) => {
  const { estacionDeLaFecha } = await import(`${base}src/world/Estaciones.js`);
  // OJO: `new Date('2026-03-21')` es UTC, y en un huso al oeste de Greenwich
  // eso es el día 20 — que es justo el borde que esta prueba quiere vigilar.
  // Se construye la fecha por componentes, que sí es local.
  const f = ([a, m, d], zona) => estacionDeLaFecha(new Date(a, m - 1, d), zona);
  return {
    // Norte: los cuatro cuadrantes y los dos bordes que más se equivocan.
    eneroMadrid: f([2026, 1, 15], 'Europe/Madrid'),
    abrilMadrid: f([2026, 4, 15], 'Europe/Madrid'),
    julioMadrid: f([2026, 7, 15], 'Europe/Madrid'),
    octubreMadrid: f([2026, 10, 15], 'Europe/Madrid'),
    // El corte del día 21, por los dos lados.
    marzo20: f([2026, 3, 20], 'Europe/Madrid'),
    marzo21: f([2026, 3, 21], 'Europe/Madrid'),
    dic20: f([2026, 12, 20], 'Europe/Madrid'),
    dic21: f([2026, 12, 21], 'Europe/Madrid'),
    // Sur: la misma fecha, la estación contraria.
    eneroBuenosAires: f([2026, 1, 15], 'America/Argentina/Buenos_Aires'),
    julioSidney: f([2026, 7, 15], 'Australia/Sydney'),
    julioSantiago: f([2026, 7, 15], 'America/Santiago'),
    // Trópico: no hay estación que valga.
    octubreBogota: f([2026, 10, 15], 'America/Bogota'),
    eneroBangkok: f([2026, 1, 15], 'Asia/Bangkok'),
    // Un huso que no está en ninguna lista se trata como norte.
    octubreDesconocido: f([2026, 10, 15], 'No/Existe'),
  };
}, BASE);

comprobar(reparto.eneroMadrid === 'invierno', 'enero en Madrid es invierno', reparto.eneroMadrid);
comprobar(reparto.abrilMadrid === 'primavera', 'abril en Madrid es primavera', reparto.abrilMadrid);
comprobar(reparto.julioMadrid === 'verano', 'julio en Madrid es verano', reparto.julioMadrid);
comprobar(reparto.octubreMadrid === 'otono', 'octubre en Madrid es otoño', reparto.octubreMadrid);

comprobar(
  reparto.marzo20 === 'invierno' && reparto.marzo21 === 'primavera',
  'la primavera entra el 21 de marzo, no el 20',
  `${reparto.marzo20} → ${reparto.marzo21}`
);
comprobar(
  reparto.dic20 === 'otono' && reparto.dic21 === 'invierno',
  'y el invierno el 21 de diciembre',
  `${reparto.dic20} → ${reparto.dic21}`
);

comprobar(
  reparto.eneroBuenosAires === 'verano',
  'enero en Buenos Aires es verano, no invierno',
  reparto.eneroBuenosAires
);
comprobar(reparto.julioSidney === 'invierno', 'julio en Sídney es invierno', reparto.julioSidney);
comprobar(reparto.julioSantiago === 'invierno', 'julio en Santiago es invierno', reparto.julioSantiago);

comprobar(
  reparto.octubreBogota === null,
  'en Bogotá no hay estación que devolver: null, no un otoño inventado',
  String(reparto.octubreBogota)
);
comprobar(reparto.eneroBangkok === null, 'ni en Bangkok', String(reparto.eneroBangkok));
comprobar(
  reparto.octubreDesconocido === 'otono',
  'un huso desconocido cae al norte en vez de romperse',
  String(reparto.octubreDesconocido)
);

// ── 2 y 3. La isla ───────────────────────────────────────────────────────

/**
 * Abre la isla con una fecha y un huso, y devuelve estado + captura.
 *
 * @param {string} sufijo  Lo que se le añade a la dirección.
 * @param {string|null} reloj  Fecha local en ISO, o null para no tocarla.
 */
async function abrir(sufijo = '', reloj = null) {
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

  // `?instant` para que no haya vuelo de llegada y la cámara esté siempre en el
  // mismo sitio: sin eso dos capturas no se pueden comparar.
  await page.goto(`${BASE}?instant&momento=dia${sufijo}`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(
    () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  await page.click('.loader__enter');
  await page.waitForFunction(() => window.__portfolio?.catalogo, { timeout: 240000 });
  // El velo de carga NO se quita al pulsar Explorar: se quita 1400 ms después.
  // Capturando antes se fotografía la PORTADA, con la isla detrás y atenuada, y
  // entonces lo que mide el diff es la animación del propio velo. Así salió un
  // suelo de ruido del 3,46 %: más alto que la diferencia entre dos estaciones,
  // o sea una prueba que no podía pasar ni estando el shader perfecto.
  await page.waitForFunction(() => !document.getElementById('loader'), { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  const datos = await page.evaluate(() => {
    const t = window.__portfolio.world.time;
    return {
      actual: t.estacionId,
      // `estacion` es de donde se PARTIÓ; que coincida con el destino es lo que
      // demuestra que no hay transición al entrar.
      partida: t.estacion.id,
      bruma: window.__portfolio.scene.fog.density,
      hoja: t.estacionValor.hoja.toArray().map((n) => +n.toFixed(3)),
      flor: +t.estacionValor.flor.toFixed(3),
      seco: +t.estacionValor.seco.toFixed(3),
      marcada: document.querySelector('[data-estaciones] .daylight__option[data-ahora]')?.dataset.phase ?? null,
      pulsada: document.querySelector("[data-estaciones] .daylight__option[aria-pressed='true']")?.dataset.phase ?? null,
      botones: document.querySelectorAll('[data-estaciones] .daylight__option').length,
    };
  });
  // La captura se saca aquí y la página se cierra en el acto. Dejándolas
  // abiertas para capturarlas luego, el sexto contexto WebGL tumbaba Firefox
  // entero —«Target closed»— y el fallo aparecía en la página siguiente, que
  // no tenía nada que ver.
  const png = await page.screenshot({ encoding: 'base64' });
  await page.close();
  return { datos, png, errores };
}

console.log('── la isla se abre ya en su estación');

const otono = await abrir('&estacion=otono');
comprobar(otono.datos.actual === 'otono', '?estacion manda', otono.datos.actual);
comprobar(
  otono.datos.partida === 'otono',
  'y arranca ya en otoño, sin verla virar delante',
  otono.datos.partida
);
comprobar(otono.datos.botones === 4, 'hay cuatro estaciones en la barra', String(otono.datos.botones));
comprobar(otono.datos.pulsada === 'otono', 'la pulsada es la que se está viendo', String(otono.datos.pulsada));

const verano = await abrir('&estacion=verano');
comprobar(
  verano.datos.hoja[0] === 1 && verano.datos.hoja[1] === 1 && verano.datos.hoja[2] === 1,
  'el verano es el neutro: la isla calibrada, sin tocar',
  `hoja ${verano.datos.hoja.join(', ')}`
);
comprobar(
  otono.datos.bruma > verano.datos.bruma * 1.15,
  'el otoño trae más bruma que el verano',
  `${otono.datos.bruma.toExponential(2)} frente a ${verano.datos.bruma.toExponential(2)}`
);

const invierno = await abrir('&estacion=invierno');
comprobar(invierno.datos.flor === 0, 'en invierno no hay flor en el prado', String(invierno.datos.flor));
comprobar(invierno.datos.seco > 0.4, 'y la vegetación pierde croma de verdad', String(invierno.datos.seco));

const disparate = await abrir('&estacion=cosecha');
comprobar(
  disparate.datos.actual === 'verano',
  'una estación que no existe cae al neutro',
  disparate.datos.actual
);

console.log('── el punto de «la tuya»');

// El huso NO se puede falsear desde la página: `Intl` lo lee del sistema. Se
// lanza un navegador aparte con TZ puesto, que además es la única forma
// honesta de probarlo — es exactamente lo que hará el navegador del visitante.
//
// Y hace falta hacerlo así porque si no la prueba dependería de dónde se
// ejecute: esta máquina está en America/Bogota, o sea justo en el caso
// tropical, y el «no marca ninguna» pasaría aquí por accidente y fallaría en
// cuanto alguien la lanzara desde Madrid.
async function conHuso(tz, reloj) {
  const nav = await puppeteer.launch({
    browser: 'firefox',
    executablePath: FIREFOX,
    headless: true,
    protocol: 'webDriverBiDi',
    env: { ...process.env, TZ: tz },
  });
  const page = await nav.newPage();
  await page.setViewport({ width: 900, height: 600 });
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
  await page.goto(`${BASE}?modo=3d&instant`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(
    () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  await page.click('.loader__enter');
  await page.waitForFunction(() => window.__portfolio?.catalogo, { timeout: 240000 });
  const r = await page.evaluate(() => ({
    huso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    marcada: document.querySelector('[data-estaciones] .daylight__option[data-ahora]')?.dataset.phase ?? null,
  }));
  await nav.close();
  return r;
}

const madrid = await conHuso('Europe/Madrid', '2026-10-15T12:00:00');
comprobar(madrid.huso === 'Europe/Madrid', 'el navegador de prueba se cree en Madrid', madrid.huso);
comprobar(
  madrid.marcada === 'otono',
  'y ahí el punto señala el otoño que le toca a su fecha',
  String(madrid.marcada)
);

const bogota = await conHuso('America/Bogota', '2026-10-15T12:00:00');
comprobar(
  bogota.marcada === null,
  'en Bogotá no se marca ninguna: allí no hay una que sea la suya',
  String(bogota.marcada)
);

console.log('── y el prado vira DE VERDAD');

// La prueba que no se puede hacer leyendo el código. Misma cámara, misma hora,
// misma semilla: lo único distinto es la estación, así que cualquier diferencia
// de píxeles es el shader haciendo su trabajo.
//
// El umbral no es un número inventado: es el suelo de ruido medido entre dos
// cargas IDÉNTICAS, que no es cero porque la hierba ondea y las nubes corren.
const gemela = await abrir('&estacion=verano');

/** Diferencia media por canal, en porcentaje, entre dos PNG en base64. */
async function diferencia(a, b) {
  return comparador.evaluate(async (par) => {
    const carga = (b64) => new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = `data:image/png;base64,${b64}`;
    });
    const [ia, ib] = await Promise.all([carga(par[0]), carga(par[1])]);
    const lienzo = (img) => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    };
    const da = lienzo(ia); const db = lienzo(ib);
    let suma = 0;
    for (let i = 0; i < da.length; i += 4) {
      suma += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    }
    return (suma / (da.length / 4) / 3 / 255) * 100;
  }, [a, b]);
}

const ruido = await diferencia(verano.png, gemela.png);
const dOtono = await diferencia(verano.png, otono.png);
const dInvierno = await diferencia(verano.png, invierno.png);

console.log(`  · suelo de ruido entre dos cargas iguales: ${ruido.toFixed(3)} %`);
comprobar(
  dOtono > ruido * 3,
  'el otoño se ve, y no es el ruido de la hierba ondeando',
  `${dOtono.toFixed(2)} % frente a ${ruido.toFixed(2)} % de ruido`
);
comprobar(
  dInvierno > ruido * 3,
  'y el invierno también',
  `${dInvierno.toFixed(2)} % frente a ${ruido.toFixed(2)} % de ruido`
);

const errores = [
  ...otono.errores, ...verano.errores, ...invierno.errores,
  ...disparate.errores, ...gemela.errores,
];
comprobar(errores.length === 0, 'consola limpia', errores.slice(0, 2).join(' · '));

await browser.close();
console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
