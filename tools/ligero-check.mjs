/**
 * Prueba de la versión ligera.
 *
 * Lo que de verdad hay que demostrar aquí es lo que no se ve: que al pedir la
 * versión ligera NO se descargue three. Esa es la razón entera de que exista —
 * una página que oculta el lienzo pero se sigue tragando 635 kB de motor no
 * sirve de nada en el equipo para el que se hizo. Un vistazo a la pantalla no
 * puede distinguir un caso del otro, así que se mira la lista de peticiones.
 *
 * Lo demás es que el contenido esté completo (las cinco secciones, un proyecto
 * por entrada de `content.js`), que las láminas se pinten al asomar y que el
 * paso de una versión a la otra funcione en los dos sentidos.
 *
 *   node tools/ligero-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';

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

/** Abre una URL vigilando peticiones y errores. */
async function abrir(url, { viewport = { width: 1200, height: 900 } } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const peticiones = [];
  const errores = [];
  page.on('request', (r) => peticiones.push(r.url()));
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
  page.on('console', (m) => {
    // Se ignoran los tropiezos de red con hosts de fuera —las fuentes vienen de
    // Google Fonts— porque dicen algo del banco de pruebas y nada del código:
    // un DNS lento marcaría en rojo un cambio de CSS perfectamente correcto.
    const t = m.text();
    const ajeno = /favicon|404|ERR_TIMED_OUT|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|fonts\.g/i.test(t);
    if (m.type() === 'error' && !ajeno) errores.push(t.slice(0, 200));
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  return { page, peticiones, errores };
}

/**
 * ¿Se ha pedido el motor?
 *
 * En desarrollo three llega como un montón de módulos sueltos servidos por
 * Vite (`/node_modules/.vite/deps/three.js`, y los `chunk-*` que arrastra); en
 * la build es un único `three-*.js`. Se cubren las dos formas para que la
 * prueba valga contra el servidor de desarrollo y contra `dist/`.
 */
const pidioThree = (peticiones) =>
  peticiones.filter((u) => /\/three[-.@]|deps\/three|three\.module/.test(u));

// ═══════════════════════════════════════════════════ 0. la puerta
console.log('\nLa puerta (sin parámetro)');
{
  const { page, peticiones, errores } = await abrir(BASE);

  const visible = await page.$eval('#portada', (el) => !el.hidden);
  comprobar(visible, 'aparece la puerta');

  // Elegir PANEL no puede costar el motor: la puerta vive en el bundle de
  // entrada justamente para que preguntar sea gratis.
  const motor = pidioThree(peticiones);
  comprobar(motor.length === 0, 'la puerta no descarga three', motor.length ? motor[0] : '');

  const opciones = await page.$$eval('[data-elige]', (els) =>
    els.map((e) => ({
      modo: e.dataset.elige,
      nombre: e.querySelector('.pt-op__nombre').textContent.trim(),
      // Cuadrados de verdad: la lámina tiene que ser tan ancha como alta.
      cuadrado: (() => {
        const r = e.querySelector('.pt-op__lamina').getBoundingClientRect();
        return Math.abs(r.width - r.height) < 2;
      })(),
    }))
  );
  comprobar(opciones.length === 2, 'hay dos opciones', opciones.map((o) => o.nombre).join(' · '));
  comprobar(
    opciones[0]?.nombre === 'Panel' && opciones[1]?.nombre === 'Isla',
    'y son PANEL e ISLA'
  );
  comprobar(opciones.every((o) => o.cuadrado), 'las dos láminas son cuadradas');

  // Los glifos salen de `runes.js` y `ogham.js`, los mismos que talla la
  // escena. Si un día se quedan sin dibujar, la puerta sigue funcionando y
  // sólo se ve vacía — por eso se cuentan.
  const runas = await page.$$eval('.pt-runa svg', (e) => e.length);
  const ogham = await page.$$eval('.pt-cab__ogham svg path', (e) => e.length);
  comprobar(runas === 12 && ogham >= 2, 'los glifos están dibujados', `${runas} runas, ${ogham} trazos ogham`);

  // Al elegir se entra sin recargar y la dirección queda apuntando a ello.
  await page.click('[data-elige="ligero"]');
  await page.waitForFunction(() => { const el = document.getElementById('ligero'); return el && !el.hidden; },
    { timeout: 60000 });
  comprobar(true, 'al elegir PANEL se entra en la versión ligera');
  const busqueda = await page.evaluate(() => location.search);
  comprobar(busqueda.includes('modo=ligero'), 'la dirección queda apuntando a lo elegido', busqueda);

  // Y la puerta se retira del DOM: es `position: fixed` a pantalla completa,
  // así que quedarse invisible taparía la página entera sin dar la cara.
  await new Promise((r) => setTimeout(r, 1000));
  const queda = await page.evaluate(() => Boolean(document.getElementById('portada')));
  comprobar(!queda, 'y la puerta se retira del DOM');

  comprobar(errores.length === 0, 'consola limpia', errores[0] ?? '');
  await page.close();
}

// ═══════════════════════════════════════════════════ 1. la versión ligera
console.log('\nVersión ligera (?modo=ligero)');
{
  const { page, peticiones, errores } = await abrir(`${BASE}?modo=ligero`);

  const motor = pidioThree(peticiones);
  comprobar(motor.length === 0, 'no se descarga three', motor.length ? motor[0] : '');

  // Ni un solo host de fuera.
  //
  // Las tipografías venían de Google y eran tres viajes encadenados a dos
  // servidores más antes de que una letra se dibujase con su letra. Ahora se
  // sirven desde aquí, y esto es lo que impide que vuelvan a colarse —o que se
  // cuele cualquier otro CDN— sin que nadie se dé cuenta: a ojo la página es
  // idéntica en los dos casos.
  const base = new URL(BASE).host;
  const fuera = [...new Set(peticiones.map((u) => new URL(u).host).filter((h) => h && h !== base))];
  comprobar(fuera.length === 0, 'no se contacta con ningún servidor externo', fuera.join(', '));

  const visible = await page.$eval('#ligero', (el) => !el.hidden);
  comprobar(visible, 'la página ligera está montada');

  const lienzoVivo = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return Boolean(c && c.getContext && c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) && c.width > 300);
  });
  comprobar(!lienzoVivo, 'el lienzo 3D no se ha inicializado');

  const secciones = await page.$$eval('.lg-seccion', (els) => els.map((e) => e.id));
  comprobar(
    secciones.length === 5,
    'están las cinco secciones',
    secciones.join(', ')
  );

  const fichas = await page.$$eval('.lg-ficha', (els) => els.length);
  // Sólo se puede contrastar contra la fuente si la fuente se sirve, o sea
  // corriendo contra el servidor de desarrollo. En `dist/` no está, y pedirla
  // no da un 404 sino el `index.html` de recambio: hay que mirar el tipo de
  // contenido, porque el texto llega igual y el recuento saldría cero.
  const esperados = await page.evaluate(() =>
    fetch('/src/content.js')
      .then((r) =>
        r.ok && /javascript/.test(r.headers.get('content-type') ?? '')
          ? r.text().then((t) => (t.match(/^\s{4}id: '\w+',$/gm) ?? []).length)
          : -1
      )
      .catch(() => -1)
  );
  comprobar(
    esperados < 0 ? fichas > 0 : fichas === esperados,
    esperados < 0 ? 'hay fichas de proyecto' : 'un proyecto por entrada de content.js',
    `${fichas} fichas`
  );

  const encabezados = await page.$$eval('.lg-seccion__titulo', (els) =>
    els.map((e) => e.textContent.trim())
  );
  comprobar(
    encabezados.join('|') === 'Sobre mí|Proyectos|Habilidades|Trayectoria|Contacto',
    'los títulos son los de la escena',
    encabezados.join(', ')
  );

  // Medidores y canales sí salen del panel de la escena. La cronología no: la
  // del panel apila en vertical porque vive en 380 px, y aquí hay el doble de
  // ancho para leerla como se lee un currículo —fecha a un lado, qué pasó al
  // otro—. Se comprueban por separado para que se vea que la diferencia es
  // deliberada y no un descuido.
  const medidores = await page.$$eval('.meter', (els) => els.length);
  const canales = await page.$$eval('.channels__link', (els) => els.length);
  comprobar(medidores > 0 && canales > 0,
    'se reutilizan medidores y canales del panel',
    `${medidores} / ${canales}`);

  const hitos = await page.$$eval('.lg-hito', (els) => els.length);
  const enDosColumnas = await page.evaluate(() => {
    const h = document.querySelector('.lg-hito');
    if (!h) return false;
    const periodo = h.querySelector('.lg-hito__periodo').getBoundingClientRect();
    const cuerpo = h.querySelector('.lg-hito__cuerpo').getBoundingClientRect();
    return cuerpo.left > periodo.right;
  });
  comprobar(hitos > 0 && enDosColumnas, 'la cronología es propia y va en dos columnas', `${hitos} hitos`);

  const formulario = await page.$('[data-contact-form]');
  comprobar(Boolean(formulario), 'el formulario de contacto está');

  // Las láminas se pintan al asomar, no al cargar.
  //
  // Lo que hay que exigir es que al entrar queden láminas SIN pintar, no que
  // no haya ninguna: cuántas caben por encima del pliegue depende del alto de
  // la ventana y de la maquetación, y atarlo a cero convierte cualquier
  // reajuste de la portada en un fallo rojo que no significa nada.
  const pintadas = () => page.$$eval('[data-lamina]', (els) =>
    els.filter((e) => e.dataset.pintada === 'si').length
  );
  const totalLaminas = await page.$$eval('[data-lamina]', (els) => els.length);

  await new Promise((r) => setTimeout(r, 600));
  const alEntrar = await pintadas();
  comprobar(alEntrar < totalLaminas, 'al entrar quedan láminas por pintar', `${alEntrar}/${totalLaminas}`);

  // Se baja como se lee, a saltos de una pantalla. De una sola zancada al pie
  // del documento el navegador no llega a ver entrar las fichas intermedias
  // —y ese es el comportamiento correcto del observador, no un fallo.
  await page.evaluate(async () => {
    const paso = window.innerHeight * 0.8;
    for (let y = 0; y <= document.body.scrollHeight; y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
  });
  await new Promise((r) => setTimeout(r, 700));
  const alBajar = await pintadas();
  comprobar(alBajar === totalLaminas, 'se pintan al pasar por delante', `${alBajar}/${totalLaminas}`);

  // El documento tiene que poder desplazarse: la escena lo bloquea.
  const desplazado = await page.evaluate(() => window.scrollY > 100);
  comprobar(desplazado, 'la página se desplaza');

  // Y quien tiene que desplazarse es la VENTANA. Si el elemento raíz se queda
  // en `overflow: hidden` la página se lee igual, pero el que desplaza pasa a
  // ser `body` y la cabecera fija se va con el contenido sin que nada falle.
  const cabeceraArriba = await page.evaluate(() => {
    const r = document.querySelector('.lg-cabecera').getBoundingClientRect();
    return Math.round(r.top);
  });
  comprobar(cabeceraArriba === 0, 'la cabecera se queda arriba al bajar', `top ${cabeceraArriba}`);

  const ancho = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  comprobar(ancho, 'no se desborda a lo ancho');

  // La retícula editorial: el raíl de datos se queda fijo mientras se lee la
  // sección. Es la pieza que sostiene el diseño y la que más fácil se rompe
  // sin ruido —basta un `overflow` en cualquier antepasado— así que se mide en
  // vez de mirarse: a mitad de los nueve proyectos, el encabezado tiene que
  // seguir arriba y no haberse ido con el contenido.
  const rail = await page.evaluate(() => {
    const seccion = document.getElementById('lg-projects');
    const cab = seccion.querySelector('.lg-seccion__cab');
    // A mitad de la sección, lo bastante dentro para que el pegado esté activo.
    window.scrollTo(0, seccion.offsetTop + seccion.offsetHeight / 2);
    return new Promise((r) =>
      requestAnimationFrame(() =>
        r({
          arriba: Math.round(cab.getBoundingClientRect().top),
          alto: Math.round(document.querySelector('.lg-cabecera').getBoundingClientRect().height),
        })
      )
    );
  });
  // Pegado justo por debajo de la cabecera, no arrastrado fuera de la ventana.
  comprobar(
    rail.arriba > rail.alto - 4 && rail.arriba < rail.alto + 90,
    'el raíl de la sección se queda fijo al leerla',
    `top ${rail.arriba}, cabecera ${rail.alto}`
  );

  const linea = await page.evaluate(() => {
    const el = document.querySelector('.lg-secciones');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
  comprobar(linea > 1000, 'la línea vertical recorre las cinco secciones', `${linea} px`);

  // El panel grabado: cada sección con su nombre en ogham sobre la arista y su
  // runa al pie del filete. La arista del ogham tiene que caer ENCIMA de la
  // línea vertical — si se descentra quedan dos rayas paralelas casi juntas,
  // que se lee peor que una sola.
  const grabado = await page.evaluate(() => {
    const secciones = [...document.querySelectorAll('.lg-seccion')];
    let oghams = 0;
    let runas = 0;
    let desvio = 0;

    for (const s of secciones) {
      const svg = s.querySelector('.lg-seccion__ogham svg');
      if (svg) oghams++;
      if (s.querySelector('.lg-seccion__runa svg')) runas++;
      if (!svg) continue;

      // La calle se mide con las cajas de verdad y no leyendo `--calle`:
      // es un `clamp()`, y `getPropertyValue` de una propiedad personalizada
      // devuelve lo ESCRITO, no lo calculado — `parseFloat('clamp(32px, …')`
      // es NaN, que al cruzar el puente con el navegador llega como `null`.
      const cab = s.querySelector('.lg-seccion__cab').getBoundingClientRect();
      const cuerpo = s.querySelector('.lg-seccion__cuerpo').getBoundingClientRect();
      const xLinea = (cab.right + cuerpo.left) / 2;
      const r = svg.getBoundingClientRect();
      desvio = Math.max(desvio, Math.abs(r.left + r.width / 2 - xLinea));
    }

    return { oghams, runas, secciones: secciones.length, desvio };
  });
  comprobar(
    grabado.oghams === grabado.secciones && grabado.runas === grabado.secciones,
    'cada sección lleva su ogham y su runa',
    `${grabado.oghams} / ${grabado.runas} de ${grabado.secciones}`
  );
  comprobar(grabado.desvio < 2, 'la arista del ogham cae sobre la línea', `desvío ${grabado.desvio.toFixed(1)} px`);

  // Nada tapa lo que hay que poder pulsar.
  //
  // El lienzo 3D es `position: fixed` a pantalla completa y transparente: si
  // se queda en el DOM se pone por delante de todo lo que no esté posicionado
  // y mata los botones de debajo sin dejar ni una marca. Se salvaban los de la
  // cabecera —`sticky`— y todo lo que cuelga de `.lg-secciones`, así que la
  // portada y el pie quedaban muertos y las pruebas seguían en verde. Se
  // pregunta por el elemento que hay REALMENTE en el punto donde se pulsaría.
  const tapados = await page.evaluate(() =>
    ['.lg-portada .lg-boton', '.lg-pie [data-a-escena]', '.lg-portada__nombre', '.lg-nav__enlace']
      .filter((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !el.contains(encima) && encima !== el;
      })
  );
  comprobar(tapados.length === 0, 'nada tapa lo que hay que poder pulsar', tapados.join(', '));

  const lienzo = await page.evaluate(() => Boolean(document.getElementById('scene')));
  comprobar(!lienzo, 'el lienzo 3D se retira del DOM');

  // El fondo se mueve, y se mueve gratis.
  //
  // `transform` y `opacity` son las dos únicas propiedades que el navegador
  // resuelve componiendo capas ya dibujadas. Colar aquí un `filter`, un
  // `background-position` o un color obligaría a repintar la ventana entera en
  // cada fotograma — y eso, en esta versión, es contradecir el motivo de que
  // exista. A ojo se ve idéntico, así que se pregunta.
  //
  // Sólo las que no acaban nunca. `getAnimations()` devuelve también las
  // transiciones en curso, y ahí sí hay un `color` —el del enlace del menú al
  // marcarse como sección activa—: eso es un repintado de un elemento pequeño
  // una vez, no sesenta veces por segundo para siempre. Meterlas en el mismo
  // saco obligaría a renunciar a las transiciones de estado, que es tirar el
  // niño con el agua.
  const anim = await page.evaluate(() =>
    document.getAnimations()
      .filter((a) => a.effect.getTiming().iterations === Infinity)
      .map((a) => ({
        sobre: a.effect.target.className || a.effect.target.tagName,
        props: [...new Set(a.effect.getKeyframes().flatMap((k) =>
          Object.keys(k).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))],
      }))
  );
  comprobar(anim.length >= 3, 'el fondo tiene sus capas animadas', `${anim.length} animaciones sin fin`);
  const caras = anim.filter((a) => a.props.some((p) => p !== 'transform' && p !== 'opacity'));
  comprobar(caras.length === 0, 'sólo se anima transform y opacity',
    caras.map((c) => `${c.sobre}: ${c.props}`).join('; '));

  // ── El sendero de Trayectoria ───────────────────────────────────────────
  //
  // Se dibuja al llegar y se queda. Lo que hay que vigilar de verdad es lo de
  // después: el trazado usa `stroke-dashoffset`, que en Blink cuesta un layout
  // por fotograma, y eso está bien pagarlo una vez —son unos 200 ms mientras
  // dura— pero sería inadmisible que siguiera corriendo. Ya trazado tiene que
  // costar CERO, y a ojo las dos cosas se ven igual.
  const sendero = await page.evaluate(() => {
    const s = document.querySelector('#lg-experience .lg-sendero');
    return s
      ? { existe: true, visto: s.dataset.visto ?? null, mojones: s.querySelectorAll('.lg-sendero__mojon').length }
      : { existe: false };
  });
  comprobar(sendero.existe, 'Trayectoria tiene su sendero');
  comprobar(sendero.mojones === hitos, 'con un mojón por etapa', `${sendero.mojones} de ${hitos}`);

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const reloj = async () => {
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    return m.LayoutCount;
  };

  await page.evaluate(() => document.getElementById('lg-experience').scrollIntoView());
  await new Promise((r) => setTimeout(r, 500));
  const trazando = await page.evaluate(
    () => document.querySelector('#lg-experience .lg-sendero').dataset.visto === 'si'
  );
  comprobar(trazando, 'se traza al llegar a la sección');

  // Se le da tiempo de sobra a terminar el trazado y los mojones escalonados.
  await new Promise((r) => setTimeout(r, 5000));
  const antes = await reloj();
  await new Promise((r) => setTimeout(r, 3000));
  const layouts = (await reloj()) - antes;
  comprobar(layouts < 6, 'y ya trazado no cuesta nada', `${layouts} layouts en 3 s`);

  const capas = ['.lg-fondo__luz--a', '.lg-fondo__luz--b', '.lg-fondo__motas'];
  const quietas = await page.evaluate(async (sels) => {
    const leer = () => sels.map((s) => getComputedStyle(document.querySelector(s)).transform);
    const antes = leer();
    await new Promise((r) => setTimeout(r, 2000));
    return sels.filter((s, i) => leer()[i] === antes[i]);
  }, capas);
  comprobar(quietas.length === 0, 'las tres capas del fondo se mueven', quietas.join(', '));

  comprobar(errores.length === 0, 'consola limpia', errores[0] ?? '');
  await page.close();
}

// ═══════════════════════════════════════════════════ 2. estrecho, como un móvil
console.log('\nEn pantalla estrecha (390×780)');
{
  const { page, errores } = await abrir(`${BASE}?modo=ligero`, {
    viewport: { width: 390, height: 780 },
  });
  const ancho = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  comprobar(ancho, 'no se desborda a lo ancho');
  const cabecera = await page.$eval('.lg-cabecera', (el) => el.getBoundingClientRect().height);
  comprobar(cabecera < 200, 'la cabecera no se come la pantalla', `${Math.round(cabecera)} px`);
  comprobar(errores.length === 0, 'consola limpia', errores[0] ?? '');
  await page.close();
}

// ═══════════════════════════════════════════════════ 3. ida y vuelta
console.log('\nCambio de versión');
{
  const { page, errores } = await abrir(`${BASE}?modo=ligero`);
  await page.click('[data-a-escena]');
  await page.waitForFunction(() => location.search.includes('modo=3d'), { timeout: 30000 });
  comprobar(true, 'desde la ligera se pide la escena');

  // Un clic y dentro: NO debe aparecer un segundo botón que pulsar.
  await page.waitForFunction(
    () => { const el = document.getElementById('ui'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  comprobar(true, 'la escena entra sola, sin pasar por «Explorar»');

  const explorarVisto = await page.evaluate(() => {
    const el = document.querySelector('.loader__enter');
    return Boolean(el) && !el.hidden;
  });
  comprobar(!explorarVisto, 'el botón «Explorar» ni se llega a enseñar');

  const andando = await page.evaluate(() => window.__portfolio.rig.enabled);
  comprobar(andando, 'la cámara queda en marcha');

  const recordado = await page.evaluate(() => localStorage.getItem('portafolio:modo'));
  comprobar(recordado === 'pleno', 'la elección queda guardada', String(recordado));

  // La marca de «vengo de pulsar» se consume: un F5 vuelve a la portada.
  const marca = await page.evaluate(() => sessionStorage.getItem('portafolio:entrar'));
  comprobar(marca === null, 'la intención se gasta al usarla', String(marca));

  // Y la vuelta, por el menú.
  await page.waitForFunction(() => !document.getElementById('loader'), { timeout: 30000 });
  await page.click('.menu-toggle');
  await page.click('#menu [data-action="ligero"]');
  await page.waitForFunction(() => location.search.includes('modo=ligero'), { timeout: 30000 });
  await page.waitForFunction(() => { const el = document.getElementById('ligero'); return el && !el.hidden; },
    { timeout: 60000 });
  comprobar(true, 'y por el menú se vuelve a la ligera');
  comprobar(errores.length === 0, 'consola limpia en el viaje de ida y vuelta', errores[0] ?? '');
  await page.close();
}

// ═══════════════════════════════════════════════════ 4. el enlace compartido
console.log('\nEnlace ?modo=3d abierto en frío');
{
  // Quien recibe el enlace no ha pulsado nada: a ese la portada le sirve de
  // presentación y de aviso de que aquí se carga un mundo. Es la mitad que
  // justifica guardar la intención en sesión y no en la URL.
  const { page } = await abrir(`${BASE}?modo=3d`);
  await page.waitForFunction(
    () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  comprobar(true, 'sí se enseña la portada con «Explorar»');
  const dentro = await page.evaluate(() => !document.getElementById('ui').hidden);
  comprobar(!dentro, 'y no se entra solo');
  await page.close();
}

// ═══════════════════════════════════════════════════ 5. sin WebGL
console.log('\nSin WebGL');

/** Un navegador al que se le ha quitado WebGL antes de que corra la página. */
async function abrirSinWebGL(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  const peticiones = [];
  page.on('request', (r) => peticiones.push(r.url()));
  await page.evaluateOnNewDocument(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      return /webgl/i.test(tipo) ? null : original.call(this, tipo, ...resto);
    };
    delete window.WebGL2RenderingContext;
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => { const el = document.getElementById('ligero'); return el && !el.hidden; },
    { timeout: 120000 });
  return { page, peticiones };
}

{
  const { page, peticiones } = await abrirSinWebGL(`${BASE}?modo=ligero`);
  comprobar(true, 'se sirve la ligera');
  const motor = pidioThree(peticiones);
  comprobar(motor.length === 0, 'y no se descarga three', motor.length ? motor[0] : '');

  const aviso = await page.$eval('.lg-aviso', (el) => el.textContent.trim()).catch(() => '');
  comprobar(/WebGL/.test(aviso), 'se explica que falta WebGL');
  // El aviso tiene que decir de quién es el problema: «falta WebGL» a secas se
  // lee como «este portafolio está roto».
  comprobar(/navegador/i.test(aviso), 'y que el problema es del navegador, no del portafolio');

  // La cabecera no ofrece el viaje —sería mandar a una pantalla negra— pero el
  // pie sí deja insistir. Sin eso, un falso negativo deja al visitante
  // encerrado en la versión ligera sin saber siquiera que hay otra.
  const enCabecera = await page.$('.lg-cabecera [data-a-escena]');
  comprobar(!enCabecera, 'la cabecera no ofrece el 3D');
  const salida = await page.$eval('.lg-pie [data-a-escena]', (el) => el.textContent.trim()).catch(() => '');
  comprobar(Boolean(salida), 'pero el pie deja intentarlo igualmente', salida);
  await page.close();
}

{
  // Y al insistir, se intenta de verdad en vez de desviar en silencio: la
  // escena arranca, revienta por falta de contexto y se vuelve contando por
  // qué. Un fallo explicado vale más que una negativa muda.
  const { page } = await abrirSinWebGL(`${BASE}?modo=3d`);
  comprobar(true, 'pedir 3d sin WebGL no se desvía en silencio');
  const aviso = await page.$eval('.lg-aviso', (el) => el.textContent.trim()).catch(() => '');
  comprobar(/no ha podido arrancar/i.test(aviso), 'se vuelve a la ligera contando el motivo', aviso.slice(0, 72));
  await page.close();
}

await browser.close();
console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en orden\n');
process.exit(fallos ? 1 : 0);
