/**
 * Prueba de las hojas de vida a medida.
 *
 * Un perfil SELECCIONA sobre el contenido en vez de copiarlo, y de esa decisión
 * cuelga todo lo que hay que comprobar aquí. Lo que se vigila no es que el
 * formulario pinte casillas, sino las tres propiedades que hacen que el modelo
 * sirva:
 *
 *  1. **Los hechos no se duplican.** Aplicar un perfil no toca los datos: el
 *     correo, las fechas y los títulos siguen viviendo en un solo sitio. Si
 *     esto se rompiera, corregir un dato dejaría currículos viejos por ahí
 *     diciendo lo contrario, y un currículo desactualizado no avisa de que lo
 *     está.
 *  2. **El orden del perfil manda.** Poner delante el proyecto que se parece a
 *     la vacante es la mitad de adaptar un currículo.
 *  3. **Ausente no es vacío.** Sin listas, un perfil hereda todo; con lista
 *     vacía no hereda nada. Un perfil nuevo tiene que nacer heredándolo todo o
 *     habría que reconstruirlo desde cero en cada candidatura.
 *
 * La primera mitad corre en Node contra el módulo puro, que es donde estas tres
 * cosas se demuestran exactamente. La segunda abre el panel y hace el viaje
 * entero —crear, podar, guardar, PDF—, porque el modelo puede estar bien y el
 * cableado no llevar a ninguna parte.
 *
 * **Escribe en `src/contenido.json` de verdad** y lo restaura pase lo que pase.
 *
 *   node tools/perfiles-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  aplicarPerfil,
  idEtapa,
  ordenarPorPerfil,
  PERFIL_COMPLETO,
  perfilPorId,
} from '../src/perfiles.js';

const RUTA = 'src/contenido.json';
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

/**
 * Un JPEG de 1×1 en base64. Sirve porque lo que se prueba es el CAMINO —que
 * suba, que se guarde, que se imprima y que un perfil pueda quitarla—, no la
 * imagen. Escrito aquí para que la prueba no dependa de tener una foto suelta
 * en el disco ni de que alguien la borre.
 */
const JPEG_MINIMO =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const RETRATO = 'public/retrato.jpg';
const TMP_JPG = '/tmp/perfiles-check-retrato.jpg';

console.log('\n── Hojas de vida a medida ─────────────────────────────────────\n');

// ── 1. El modelo, en Node ──────────────────────────────────────────────────
console.log('  el modelo');
const datos = JSON.parse(readFileSync(RUTA, 'utf8'));
const ids = datos.proyectos.map((p) => p.id);

const alReves = aplicarPerfil(datos, { ...PERFIL_COMPLETO, proyectos: [ids[2], ids[0]] });
comprobar(
  alReves.proyectos.map((p) => p.id).join() === `${ids[2]},${ids[0]}`,
  'el orden del perfil manda sobre el del contenido',
  alReves.proyectos.map((p) => p.id).join(' · ')
);
comprobar(
  datos.proyectos.length === ids.length && datos.identidad.role !== 'tocado',
  'aplicar un perfil no muta los datos: los hechos viven en un solo sitio'
);
comprobar(
  aplicarPerfil(datos, null).proyectos.length === ids.length,
  'sin perfil, la hoja lo enseña todo'
);
comprobar(
  aplicarPerfil(datos, { ...PERFIL_COMPLETO, proyectos: [] }).proyectos.length === 0,
  'una lista VACÍA no es lo mismo que ausente: no enseña ninguno'
);
comprobar(
  aplicarPerfil(datos, { ...PERFIL_COMPLETO, proyectos: [ids[0], 'ya-no-existe'] }).proyectos.length === 1,
  'y un id que ya no existe se descarta en vez de romper la hoja'
);
const etapas = datos.trayectoria.map(idEtapa);
comprobar(
  new Set(etapas).size === etapas.length,
  'cada etapa de la trayectoria tiene un identificador único',
  `${new Set(etapas).size} de ${etapas.length}`
);
comprobar(
  perfilPorId([], 'inventado').id === PERFIL_COMPLETO.id,
  'un perfil que no existe cae en la hoja completa, no en una vacía'
);

// ── 2. El viaje entero, en el navegador ────────────────────────────────────
const original = readFileSync(RUTA, 'utf8');

// El retrato de VERDAD, si lo hay.
//
// Esta prueba sube una foto y luego limpia lo suyo, y en la primera versión
// limpiaba borrando `public/retrato.jpg` a secas — que es exactamente el
// fichero donde vive el retrato del dueño del currículo. Ejecutarla después de
// que él subiera su foto se la borraba, y el PDF salía con el icono de imagen
// rota en la cabecera sin que nada avisara. Una prueba no puede destruir el
// material sobre el que se ejecuta.
const RESPALDO = 'node_modules/.cache/perfiles-check';
const habiaRetrato = existsSync(RETRATO);
if (habiaRetrato) {
  mkdirSync(RESPALDO, { recursive: true });
  writeFileSync(`${RESPALDO}/retrato.jpg`, readFileSync(RETRATO));
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 160));
  });

  await page.goto(`${BASE}?admin`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('.ad__hoja', { timeout: 30000 });

  console.log('\n  el panel');
  const panel = await page.evaluate(async () => {
    const a = window.__admin;
    document.querySelector('[data-seccion="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 80));
    // Qué había ANTES, para reconocer al recién nacido.
    //
    // La prueba leía `perfiles[0]` dando por hecho que el nuevo es el primero,
    // y sólo era cierto mientras la lista estuviera vacía: en cuanto el dueño
    // del currículo se montó sus tres hojas, la prueba empezó a podar el perfil
    // de Videojuegos y a fallar por ello. Lo que se prueba es el panel, y el
    // panel tiene que funcionar con perfiles ya guardados.
    const antes = new Set(a.datos.perfiles.map((p) => p.id));
    document.querySelector('[data-accion="anadir"][data-lista="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 80));

    const i = a.datos.perfiles.findIndex((p) => !antes.has(p.id));
    const recienNacido = { ...a.datos.perfiles[i] };
    const desmarcar = async (n) => {
      const c = [...document.querySelectorAll(`[data-perfil="${i}"][data-lista="proyectos"]`)][n];
      c.checked = false;
      c.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    };
    await desmarcar(1);
    await desmarcar(3);
    const trasPodar = [...a.datos.perfiles[i].proyectos];

    const c = [...document.querySelectorAll(`[data-perfil="${i}"][data-lista="proyectos"]`)][1];
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const trasRestaurar = [...a.datos.perfiles[i].proyectos];

    a.datos.perfiles[i].id = 'prueba';
    a.datos.perfiles[i].nombre = 'Prueba';
    a.datos.perfiles[i].role = 'Oficio de prueba';
    await a._guardar();
    return {
      recienNacido,
      trasPodar,
      trasRestaurar,
      todos: a.datos.proyectos.map((p) => p.id),
      sucio: a.sucio,
    };
  });

  comprobar(
    panel.recienNacido.proyectos === null && panel.recienNacido.trayectoria === null,
    'una hoja nueva nace heredándolo todo, y se trabaja quitando'
  );
  comprobar(
    panel.trasPodar.length === panel.todos.length - 2,
    'desmarcar quita de la lista',
    `${panel.trasPodar.length} de ${panel.todos.length}`
  );
  // El detalle que separa una lista de un conjunto: al volver a marcar algo,
  // recupera SU sitio. Añadido al final, el orden del perfil se degradaría con
  // cada clic hasta no significar nada.
  const esperado = panel.todos.filter((id) => panel.trasRestaurar.includes(id));
  comprobar(
    panel.trasRestaurar.join() === esperado.join(),
    'y al volver a marcarlo recupera su sitio, no se va al final',
    panel.trasRestaurar.join(' · ')
  );
  comprobar(panel.sucio === false, 'la hoja se guarda en el proyecto');

  const enDisco = JSON.parse(readFileSync(RUTA, 'utf8'));
  comprobar(
    enDisco.perfiles?.some((p) => p.id === 'prueba'),
    'y aparece en src/contenido.json',
    `${enDisco.perfiles?.length ?? 0} perfiles`
  );

  console.log('\n  el PDF');
  const cv = await browser.newPage();
  await cv.goto(`${BASE}?modo=ligero&perfil=prueba`, { waitUntil: 'networkidle2', timeout: 120000 });
  await cv.waitForSelector('.cv', { timeout: 30000 });
  const hoja = await cv.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    return {
      rol: document.querySelector('.cv__rol').textContent.trim(),
      proyectos: document.querySelectorAll('.cv__proyecto').length,
      titulo: document.title,
      nombre: document.querySelector('.cv__nombre').textContent.trim(),
    };
  });
  comprobar(hoja.rol === 'Oficio de prueba', 'la hoja usa el oficio de su perfil', hoja.rol);
  comprobar(
    hoja.proyectos === panel.trasRestaurar.length,
    'y enseña sólo los proyectos elegidos',
    `${hoja.proyectos} de ${panel.todos.length}`
  );
  comprobar(
    hoja.titulo.includes('(Prueba)'),
    'el fichero se propone con el nombre del perfil dentro',
    hoja.titulo
  );
  // Lo compartido sigue compartido: es la mitad del argumento del modelo.
  comprobar(
    hoja.nombre === enDisco.identidad.name,
    'y el nombre sigue siendo el de siempre, no una copia',
    hoja.nombre
  );

  const completa = await browser.newPage();
  await completa.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
  await completa.waitForSelector('.cv', { timeout: 30000 });
  const todos = await completa.evaluate(() => ({
    proyectos: document.querySelectorAll('.cv__proyecto').length,
    fichas: document.querySelectorAll('.lg-ficha').length,
  }));
  comprobar(
    todos.proyectos === enDisco.proyectos.length,
    'sin perfil en la dirección, la hoja sigue completa',
    `${todos.proyectos}`
  );
  // Y lo que NO deben tocar: el portafolio enseña siempre todo. Un portafolio
  // recortado según a qué se opta deja de ser un portafolio.
  comprobar(
    todos.fichas === enDisco.proyectos.length,
    'la versión ligera enseña el portafolio entero, con perfiles o sin ellos',
    `${todos.fichas}`
  );

  // ── La foto ──────────────────────────────────────────────────────────────
  //
  // Va en `<img>` y no en un fondo de CSS a propósito: los navegadores NO
  // imprimen los fondos, así que una foto puesta con `background-image` se ve
  // en pantalla y desaparece del PDF — el único sitio donde importa.
  // ── El selector: la única forma de usar esto sin saberse los ids ────────
  //
  // Las hojas a medida llevaban días hechas y sin poder usarse: había que
  // escribir `?perfil=videojuegos` a mano en la barra del navegador. Una
  // función que exige memorizar identificadores no está terminada.
  console.log('\n  elegir la hoja desde la propia hoja');
  const conSelector = await browser.newPage();
  await conSelector.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
  await conSelector.waitForSelector('[data-elegir-perfil]', { timeout: 30000 });
  const listado = await conSelector.$eval('[data-elegir-perfil]', (s2) =>
    [...s2.options].map((o) => o.value)
  );
  comprobar(listado.includes('completa'), 'La completa está en la lista', listado.join(', '));
  comprobar(listado.length >= 2, 'Y las de verdad también', `${listado.length} hojas`);

  const otra = listado.find((v) => v !== 'completa');
  await conSelector.select('[data-elegir-perfil]', otra);
  await new Promise((r) => setTimeout(r, 2200));
  const tras = await conSelector.evaluate(() => ({
    url: location.search,
    marcada: document.querySelector('[data-elegir-perfil]')?.value,
    proyectos: document.querySelectorAll('.cv__proyecto').length,
  }));
  comprobar(
    tras.url.includes(`perfil=${otra}`),
    'Elegir cambia LA URL, no sólo la vista: el enlace que copies lleva el perfil dentro',
    tras.url
  );
  comprobar(tras.marcada === otra, 'Y al recargar sigue marcada la que elegiste');

  await conSelector.select('[data-elegir-perfil]', 'completa');
  await new Promise((r) => setTimeout(r, 2200));
  const limpia = await conSelector.evaluate(() => location.search);
  comprobar(
    !limpia.includes('perfil='),
    'Volver a la completa deja el enlace limpio, sin parámetro de sobra',
    limpia
  );

  // ── Y el orden de la isla, que es lógica pura ───────────────────────────
  //
  // Sin navegador: lo que se afirma —«primero los del perfil, detrás el resto,
  // y ninguno se pierde»— es una propiedad de la función, no de la escena. El
  // cableado a la isla lo comprueba `isla-check`, que ya carga WebGL; hacerlo
  // aquí obligaba a levantar el 3D en una prueba que no lo necesita para nada.
  console.log('\n  y la isla ordena, no recorta');
  {
    const todos = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const ids = (l) => l.map((x) => x.id).join('');
    const clave = (x) => x.id;

    comprobar(ids(ordenarPorPerfil(todos, ['d', 'b'], clave)) === 'dbace', 'los elegidos van delante, en SU orden');
    comprobar(
      ordenarPorPerfil(todos, ['d', 'b'], clave).length === todos.length,
      'y no se pierde ninguno: la obra no se recorta'
    );
    comprobar(ids(ordenarPorPerfil(todos, null, clave)) === 'abcde', 'sin perfil, el orden se queda como estaba');
    comprobar(ids(ordenarPorPerfil(todos, [], clave)) === 'abcde', 'y con lista vacía también');
    comprobar(
      ids(ordenarPorPerfil(todos, ['z', 'c'], clave)) === 'cabde',
      'un id que ya no existe se ignora sin romper nada'
    );
  }

  console.log('\n  la foto');
  // Por el SELECTOR DE FICHERO, que es lo que usa una persona.
  //
  // La primera versión llamaba a la ruta a mano y luego a `_guardar()`, y daba
  // «subida ✓» con la foto sin guardar: `_guardar` sale antes si no hay cambios
  // pendientes, y escribir el dato a pelo no marca nada como sucio. Los tres
  // fallos que salían después eran ciertos —la hoja no tenía foto— pero la
  // causa era la prueba, no el código. Usando el input real se ejercita
  // `_subirFoto`, que es quien marca sucio, y el camino que se prueba es el que
  // existe.
  writeFileSync(TMP_JPG, Buffer.from(JPEG_MINIMO, 'base64'));
  // El selector de fichero sólo existe con Identidad montada: el panel dibuja
  // una sección cada vez.
  await page.evaluate(() => document.querySelector('[data-seccion="identidad"]').click());
  const entrada = await page.waitForSelector('[data-foto-fichero]', { timeout: 10000 });
  await entrada.uploadFile(TMP_JPG);
  await new Promise((r) => setTimeout(r, 700));
  const subida = await page.evaluate(async () => {
    const a = window.__admin;
    await a._guardar();
    return { ok: Boolean(a.datos.identidad.foto), ruta: a.datos.identidad.foto, sucio: a.sucio };
  });
  comprobar(subida.ok === true, 'La foto se sube al proyecto', subida.ruta ?? '');
  comprobar(subida.sucio === false, 'Y se guarda en el contenido');
  comprobar(
    JSON.parse(readFileSync(RUTA, 'utf8')).identidad.foto === 'retrato.jpg',
    'La ruta queda escrita en src/contenido.json'
  );
  comprobar(
    subida.ruta === 'retrato.jpg' && existsSync(RETRATO),
    'Con nombre fijo: un retrato se sustituye, no se colecciona',
    subida.ruta ?? ''
  );

  const conFoto = await browser.newPage();
  await conFoto.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
  await conFoto.waitForSelector('.cv', { timeout: 30000 });
  const vista = await conFoto.evaluate(async () => {
    const img = document.querySelector('.cv__foto');
    if (!img) return { hay: false };
    await img.decode().catch(() => {});
    return { hay: true, cargada: img.naturalWidth > 0, esImg: img.tagName === 'IMG' };
  });
  comprobar(vista.hay && vista.esImg, 'Sale en la hoja, y como <img> para que se imprima');
  comprobar(vista.cargada, 'Y el navegador la encuentra de verdad');

  // El PDF es el único juez de si se imprime. Un `<img>` sí; un fondo, no.
  await conFoto.pdf({ path: '/tmp/perfiles-check.pdf', printBackground: false, format: 'A4' });
  const pdf = readFileSync('/tmp/perfiles-check.pdf').toString('latin1');
  comprobar(
    (pdf.match(/\/Subtype\s*\/Image/g) ?? []).length > 0,
    'Y llega al PDF impreso, que es el único sitio donde importa'
  );

  // Y el interruptor: una hoja puede ir sin ella. En el mundo anglosajón una
  // foto en el currículo se desaconseja, y borrar el fichero antes de cada
  // envío para volver a subirlo después no es una forma de trabajar.
  // Igual que arriba: por la casilla real. Empujar el perfil al estado a mano
  // no marca nada como sucio y `_guardar` no llega a escribir.
  const quitada = await page.evaluate(async () => {
    const a = window.__admin;
    document.querySelector('[data-seccion="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 80));
    document.querySelector('[data-accion="anadir"][data-lista="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 80));

    const i = a.datos.perfiles.findIndex((p) => p.id !== 'prueba' && !p.role);
    const casilla = document.querySelector(`[data-perfil-foto="${i}"]`);
    const marcadaAlNacer = casilla.checked;
    casilla.checked = false;
    casilla.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));

    a.datos.perfiles[i].id = 'sin-foto';
    a.datos.perfiles[i].nombre = 'Sin foto';
    await a._guardar();
    return { marcadaAlNacer, foto: a.datos.perfiles[i].foto };
  });
  // Un perfil nace heredando la foto: se trabaja quitando, no poniendo.
  comprobar(quitada.marcadaAlNacer === true, 'Un perfil nace con el retrato puesto');
  comprobar(quitada.foto === false, 'Y desmarcarla lo deja en false, no en true');
  const sinFoto = await browser.newPage();
  await sinFoto.goto(`${BASE}?modo=ligero&perfil=sin-foto`, { waitUntil: 'networkidle2', timeout: 120000 });
  await sinFoto.waitForSelector('.cv', { timeout: 30000 });
  const nada = await sinFoto.evaluate(() => ({
    foto: Boolean(document.querySelector('.cv__foto')),
    nombre: document.querySelector('.cv__nombre').textContent.trim(),
  }));
  comprobar(!nada.foto, 'Un perfil puede quitarla para esa candidatura');
  comprobar(nada.nombre.length > 0, 'Y la hoja sigue entera sin ella');

  comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));
} finally {
  writeFileSync(RUTA, original);
  // La foto de prueba se borra: es un fichero de verdad en `public/`, y ahí
  // dentro cualquier cosa que se quede viaja con el sitio publicado.
  // Se devuelve el retrato que había, o se quita el que puso la prueba.
  if (habiaRetrato) writeFileSync(RETRATO, readFileSync(`${RESPALDO}/retrato.jpg`));
  else if (existsSync(RETRATO)) rmSync(RETRATO);
  if (existsSync(TMP_JPG)) rmSync(TMP_JPG);
  const vuelto = readFileSync(RUTA, 'utf8') === original;
  console.log(`\n  ${vuelto ? 'src/contenido.json restaurado.' : '⚠ NO se pudo restaurar contenido.json'}`);
  if (!vuelto) fallos++;
  await browser.close();
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
