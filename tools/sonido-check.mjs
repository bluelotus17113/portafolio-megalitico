/**
 * Prueba del sonido de la isla.
 *
 * El audio es el subsistema más fácil de dar por bueno sin haberlo probado:
 * suena algo, uno lo oye, y no se entera de que el mar está igual de fuerte en
 * la cima que en la orilla, o de que los pasos van por libre respecto a la
 * cabeza. Peor todavía: **un grafo desconectado y uno conectado se ven
 * exactamente igual desde fuera** — las ganancias tienen el valor correcto en
 * los dos casos. Por eso `Sonido` lleva un `AnalyserNode` fijo detrás del
 * maestro y aquí se leen las dos cosas: las ganancias, que prueban la lógica,
 * y la energía real, que prueba que el cable llega.
 *
 * El módulo se avanza a mano (`sonido.update(0.1, …)` en bucle) en vez de
 * esperar al reloj, por lo mismo que en `walk-check`: aquí el navegador va
 * sobre WebGL por software y da un fotograma por segundo. Así además la prueba
 * es determinista.
 *
 *   node tools/sonido-check.mjs
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
const n = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // Sin `--mute-audio`: aquí lo que se mide es justo la señal.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
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
// El clic de verdad: es el gesto que le da permiso al navegador para sonar.
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 2500));

/** Instala en la página los ayudantes de la prueba. */
await page.evaluate(() => {
  const app = window.__portfolio;
  const s = app.sonido;

  // Se para el bucle principal. No es por rendimiento: es que `tick` mueve la
  // cámara —la órbita la reescribe cada fotograma—, avanza el sonido con sus
  // propios datos y, sobre todo, llama a `_sidhe` con los espíritus de verdad,
  // que pisaría la histéresis que se prueba más abajo. Aquí el tiempo lo lleva
  // la prueba.
  app.stop();
  app.rig.enabled = false;

  /**
   * Coloca el oyente y deja que el suavizado se asiente.
   *
   * Cuatro segundos simulados: con la constante más lenta del módulo (1,2) eso
   * es e^−4,8, o sea el 0,8 % de error. Lo que se lee después es el valor de
   * régimen, no un fotograma a medio camino.
   */
  window.__poner = ({ x, y, z, yaw = 0, estacion = 'verano', modo = 'orbit' }) => {
    app.camera.position.set(x, y, z);
    // Basta con la rotación: el objeto sincroniza su cuaternión solo, y es del
    // cuaternión de donde `_pan` saca el vector «derecha».
    app.camera.rotation.set(0, yaw, 0, 'YXZ');
    for (let i = 0; i < 40; i++) {
      s.update(0.1, { camera: app.camera, modo, walk: app.rig.walk, estacion });
    }
    return s.medir();
  };

  /** Cuenta las pisadas envolviendo `_pisar`. */
  window.__contarPasos = (fn) => {
    const original = s._pisar.bind(s);
    let cuenta = 0;
    s._pisar = (p, f) => {
      cuenta++;
      original(p, f);
    };
    try {
      fn();
    } finally {
      s._pisar = original;
    }
    return cuenta;
  };
});

console.log('\n── Sonido de la isla ──────────────────────────────────────────\n');

// ── 1. Está sonando ────────────────────────────────────────────────────────
const base = await page.evaluate(() => window.__portfolio.sonido.medir());
comprobar(base !== null, 'El motor de audio arrancó con el clic de Explorar');
comprobar(base?.estado === 'running', 'El contexto está en marcha', `estado=${base?.estado}`);
comprobar(base?.maestro > 0.4, 'El maestro subió tras el fundido de entrada', `${n(base?.maestro)}`);

// ¿Llega señal de verdad al analizador? Si el navegador no tiene salida de
// audio esto sale a cero sin que nada esté roto, así que se dice y se sigue.
const haySenial = base && base.rms > 1e-5;
comprobar(haySenial, 'Hay energía real en la salida (grafo conectado)', `rms=${base?.rms?.toExponential(2)}`);
if (!haySenial) {
  console.log('    ↳ este navegador no rinde audio; el resto se prueba sobre las ganancias.');
}

// ── 2. El mar manda la orilla, no el mapa ──────────────────────────────────
const mar = await page.evaluate(() => {
  const campo = window.__portfolio.world.field;
  // Buscar la orilla marchando hacia el este desde el centro.
  let orilla = 0;
  for (let r = 20; r < 260; r += 2) {
    if (campo.height(r, 0) < 0) {
      orilla = r;
      break;
    }
  }
  const enLaOrilla = window.__poner({ x: orilla - 4, y: campo.height(orilla - 4, 0) + 1.7, z: 0 });
  const enElCentro = window.__poner({ x: 0, y: campo.height(0, 0) + 1.7, z: 0 });
  return { orilla, enLaOrilla, enElCentro };
});
comprobar(mar.orilla > 100, 'Se localiza la orilla', `a ${mar.orilla} m del centro`);
comprobar(
  mar.enLaOrilla.ganancias.mar > mar.enElCentro.ganancias.mar * 1.8,
  'El mar suena bastante más fuerte en la orilla que en la plaza',
  `${n(mar.enLaOrilla.ganancias.mar)} vs ${n(mar.enElCentro.ganancias.mar)}`
);
comprobar(
  mar.enElCentro.ganancias.mar > 0.05,
  'Y en la plaza sigue oyéndose de fondo (nunca hay silencio)',
  `${n(mar.enElCentro.ganancias.mar)}`
);
comprobar(
  mar.enLaOrilla.orilla < 12 && mar.enElCentro.orilla > 100,
  'La distancia a la orilla que mide el módulo es la real',
  `${n(mar.enLaOrilla.orilla, 0)} m y ${n(mar.enElCentro.orilla, 0)} m`
);

// ── 3. El viento sube con la altura y con la estación ──────────────────────
const viento = await page.evaluate(() => {
  const abajo = window.__poner({ x: 0, y: 6, z: 0, estacion: 'verano' });
  const arriba = window.__poner({ x: 0, y: 60, z: 0, estacion: 'verano' });
  const invierno = window.__poner({ x: 0, y: 60, z: 0, estacion: 'invierno' });
  return { abajo, arriba, invierno };
});
comprobar(
  viento.arriba.ganancias.viento > viento.abajo.ganancias.viento * 1.5,
  'El viento arrecia con la altura',
  `${n(viento.abajo.ganancias.viento)} a 6 m → ${n(viento.arriba.ganancias.viento)} a 60 m`
);
comprobar(
  viento.arriba.ganancias.silbo > 0.02 && viento.abajo.ganancias.silbo < 0.005,
  'El silbo de altura solo aparece arriba',
  `${n(viento.abajo.ganancias.silbo)} → ${n(viento.arriba.ganancias.silbo)}`
);
comprobar(
  viento.invierno.ganancias.viento > viento.arriba.ganancias.viento * 1.25,
  'En invierno sopla más que en verano en el mismo sitio',
  `${n(viento.arriba.ganancias.viento)} → ${n(viento.invierno.ganancias.viento)}`
);

// ── 4. El fuego se puede encontrar de oído ─────────────────────────────────
const fuego = await page.evaluate(() => {
  const app = window.__portfolio;
  const altar = app.world.getShrine('contact').group.position;
  // De pie a cinco metros al oeste del brasero, mirando al norte: el fuego
  // queda a la derecha. Y a sesenta metros, fuera de alcance.
  const cerca = window.__poner({ x: altar.x - 5, y: altar.y + 1.7, z: altar.z, yaw: 0 });
  const lejos = window.__poner({ x: altar.x - 60, y: altar.y + 1.7, z: altar.z, yaw: 0 });
  return { cerca, lejos, pan: app.sonido.panFuego.pan.value, altar: { x: altar.x, z: altar.z } };
});
comprobar(
  fuego.cerca.ganancias.fuego > 0.15,
  'El brasero se oye desde al lado',
  `${n(fuego.cerca.ganancias.fuego)}`
);
comprobar(
  fuego.lejos.ganancias.fuego < 0.01,
  'Y a sesenta metros ya no',
  `${n(fuego.lejos.ganancias.fuego)}`
);
// El estéreo se mide en la última posición evaluada, que es la lejana; se
// vuelve a poner cerca para leer el paneo.
const pan = await page.evaluate(() => {
  const app = window.__portfolio;
  const altar = app.world.getShrine('contact').group.position;
  window.__poner({ x: altar.x - 5, y: altar.y + 1.7, z: altar.z, yaw: 0 });
  const panDerecha = app.sonido.panFuego.pan.value;
  window.__poner({ x: altar.x + 5, y: altar.y + 1.7, z: altar.z, yaw: 0 });
  const panIzquierda = app.sonido.panFuego.pan.value;
  return { panDerecha, panIzquierda };
});
comprobar(
  pan.panDerecha > 0.5 && pan.panIzquierda < -0.5,
  'Mirando al norte, el fuego suena a la derecha si arde al este y al revés',
  `${n(pan.panDerecha, 2)} / ${n(pan.panIzquierda, 2)}`
);

// ── 5. Los pasos ───────────────────────────────────────────────────────────
const pasos = await page.evaluate(() => {
  const app = window.__portfolio;
  const s = app.sonido;
  const campo = app.world.field;
  const w = app.rig.walk;

  // Superficie. La plaza es enlosado; un punto de ladera lejos de todo, no.
  const enlosado = s._esPiedra(0, 0, campo.height(0, 0));
  const hierba = s._esPiedra(70, -95, campo.height(70, -95));
  // La calzada del islote está DECLARADA como pasarela en el campo de alturas.
  const c = app.world.isloteCentro;
  const mitad = { x: c.x * 0.62, z: c.y * 0.62 };
  const calzada = s._esPiedra(mitad.x, mitad.z, campo.walkHeight(mitad.x, mitad.z, 1e4));

  // Cadencia: el vaivén avanza 2π por cada 1,1 m andados, y el pie cae en el
  // mínimo del seno. Diez ciclos tienen que dar diez pisadas, ni nueve ni once.
  w.enSuelo = true;
  w.velocity.set(0, 0, 3.4);
  s._enSueloPrevio = true;
  s._vaivenPrevio = w.vaiven;
  const diez = window.__contarPasos(() => {
    for (let i = 0; i < 100; i++) {
      w.vaiven += (Math.PI * 2) / 10;
      s._pasos(w, app.camera.position);
    }
  });

  // Aterrizar suena aunque no toque por fase.
  w.enSuelo = false;
  s._pasos(w, app.camera.position);
  w.enSuelo = true;
  const alCaer = window.__contarPasos(() => s._pasos(w, app.camera.position));

  // En el aire no hay zancada que contar.
  w.enSuelo = false;
  s._enSueloPrevio = false;
  const enElAire = window.__contarPasos(() => {
    for (let i = 0; i < 100; i++) {
      w.vaiven += (Math.PI * 2) / 10;
      s._pasos(w, app.camera.position);
    }
  });
  w.enSuelo = true;
  s._enSueloPrevio = true;

  return { enlosado, hierba, calzada, diez, alCaer, enElAire };
});
comprobar(pasos.enlosado === true, 'La plaza suena a piedra');
comprobar(pasos.hierba === false, 'La ladera pelada no');
comprobar(pasos.calzada === true, 'La calzada del islote también suena a piedra');
comprobar(pasos.diez === 10, 'Diez ciclos de vaivén dan diez pisadas', `${pasos.diez}`);
comprobar(pasos.alCaer === 1, 'Aterrizar de un salto suena', `${pasos.alCaer}`);
comprobar(pasos.enElAire === 0, 'En el aire no se oyen pasos', `${pasos.enElAire}`);

// ── 6. La nota de los espíritus, con su histéresis ─────────────────────────
const sidhe = await page.evaluate(() => {
  const app = window.__portfolio;
  const s = app.sonido;
  s._sonaron.clear();
  const falso = (d) => ({
    masCercano: () => ({ indice: 0, distancia: d }),
    bichos: [{ pos: { x: app.camera.position.x + d, y: 0, z: app.camera.position.z } }],
  });
  const lejos = (s._sidhe(falso(20), app.camera), s._sonaron.size);
  const entra = (s._sidhe(falso(6), app.camera), s._sonaron.size);
  const sigue = (s._sidhe(falso(6), app.camera), s._sonaron.size);
  const rebordeando = (s._sidhe(falso(12), app.camera), s._sonaron.size);
  const seVa = (s._sidhe(falso(20), app.camera), s._sonaron.size);
  const vuelve = (s._sidhe(falso(6), app.camera), s._sonaron.size);
  return { lejos, entra, sigue, rebordeando, seVa, vuelve };
});
comprobar(sidhe.lejos === 0, 'A veinte metros el espíritu no suena');
comprobar(sidhe.entra === 1, 'Al entrar en nueve, suena');
comprobar(sidhe.sigue === 1 && sidhe.rebordeando === 1, 'Y no vuelve a sonar mientras ronda');
comprobar(sidhe.seVa === 0 && sidhe.vuelve === 1, 'Se rearma al alejarse de dieciséis y vuelve a sonar');

// ── 7. El bucle de ruido no chasca ─────────────────────────────────────────
const bucle = await page.evaluate(() => {
  const d = window.__portfolio.sonido.ruido.getChannelData(0);
  let suma = 0;
  for (let i = 1; i < d.length; i++) suma += Math.abs(d[i] - d[i - 1]);
  const tipico = suma / (d.length - 1);
  return { costura: Math.abs(d[0] - d[d.length - 1]), tipico, largo: d.length };
});
comprobar(
  bucle.costura < bucle.tipico * 6,
  'La costura del bucle es tan suave como el resto del ruido',
  `salto ${bucle.costura.toExponential(2)} vs ${bucle.tipico.toExponential(2)} típico`
);

// ── 8. Silenciar silencia ──────────────────────────────────────────────────
//
// Por los DOS caminos de verdad, y no llamando al módulo: silenciando a mano se
// prueba la lógica pero no el cableado, que es justo lo que se rompe. Se apaga
// con el botón de la barra y se vuelve a encender con la tecla M, así que si
// alguno de los dos se queda sin conectar, esto lo cuenta.
const mudo = await page.evaluate(async () => {
  const s = window.__portfolio.sonido;
  document.querySelector('[data-sonido]').click();
  await new Promise((r) => setTimeout(r, 600));
  const callado = s.medir();
  const marcado = document.querySelector('[data-sonido]').hasAttribute('data-mudo');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
  await new Promise((r) => setTimeout(r, 1800));
  const desmarcado = !document.querySelector('[data-sonido]').hasAttribute('data-mudo');
  return { callado, marcado, desmarcado, devuelto: s.medir() };
});
comprobar(mudo.callado.maestro < 0.01, 'El botón de la barra silencia el maestro', `${n(mudo.callado.maestro)}`);
comprobar(mudo.marcado === true, 'Y se marca como silenciado');
comprobar(mudo.devuelto.maestro > 0.4, 'La tecla M lo devuelve', `${n(mudo.devuelto.maestro)}`);
comprobar(mudo.desmarcado === true, 'Y el botón se entera de que fue por teclado');
if (haySenial) {
  comprobar(mudo.callado.rms < base.rms * 0.1, 'Y la señal real cae de verdad', `rms=${mudo.callado.rms.toExponential(2)}`);
}

// ── 9. Lo que cuesta por fotograma ─────────────────────────────────────────
//
// El sonido entra en el mismo presupuesto de 16,6 ms que el render, y tiene un
// punto caro escondido: `_orilla` sondea el campo de alturas. Se mide el caso
// real —un oyente andando a 3,4 m/s— con el módulo entero.
//
// Lo que se afirma es **cuántos fotogramas pasan de un milisegundo**, y no la
// media ni el máximo, porque es la única cifra que separa un diseño de otro.
// Medido AQUÍ DENTRO, que es donde se afirma —una tanda aislada sale mucho más
// limpia (0 a 2 contra 26 a 35) y con esos números el umbral no valdría—:
//
//     barrido repartido   media 0,08 ms   p99 0,7 ms   >1 ms: 12, 15 de 2000
//     barrido de golpe    media 0,07 ms   p99 2,0 ms   >1 ms: 37 de 2000
//
// De ahí sale el 22: en medio de los dos, con sitio para el ruido de un lado y
// margen de sobra para pillar la vuelta al otro.
//
// La media no distingue nada —es la misma con las dos—, el máximo tampoco:
// `performance.now()` viene redondeado a 0,1 ms, así que la mediana sale en
// cero y cualquier pausa del recolector se lleva el récord. De hecho una tanda
// con el volcado a los nodos DESACTIVADO marcó un pico de 2,3 ms, más que la
// tanda completa. El recuento de fotogramas largos separa trece veces.
const coste = await page.evaluate(() => {
  const app = window.__portfolio;
  const s = app.sonido;
  const ctx = { camera: app.camera, modo: 'walk', walk: app.rig.walk, estacion: 'otonio' };
  const tanda = () => {
    app.camera.position.set(0, 20, 0);
    s.update(0.016, ctx);
    const t = [];
    for (let i = 0; i < 2000; i++) {
      // 6 cm por fotograma: andando a 3,4 m/s a 60 fps.
      app.camera.position.x += 0.06;
      const a = performance.now();
      s.update(0.016, ctx);
      t.push(performance.now() - a);
    }
    const media = t.reduce((a, b) => a + b, 0) / t.length;
    t.sort((a, b) => a - b);
    return { media, p99: t[1980], largos: t.filter((v) => v > 1).length };
  };
  tanda(); // en frío: sin calentar, el compilador y el recolector meten ruido
  return tanda();
});
comprobar(
  coste.media < 0.15,
  'El sonido cuesta una fracción del fotograma',
  `${coste.media.toFixed(3)} ms de media`
);
comprobar(
  coste.largos <= 22,
  'Y no acumula fotogramas largos: el barrido de la orilla va repartido',
  `${coste.largos} de 2000 por encima de 1 ms (p99 ${coste.p99.toFixed(1)} ms)`
);

// ── 10. Sin errores de consola ──────────────────────────────────────────────
comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
