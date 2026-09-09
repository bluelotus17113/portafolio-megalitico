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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { aplicarPerfil, idEtapa, PERFIL_COMPLETO, perfilPorId } from '../src/perfiles.js';

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
    document.querySelector('[data-accion="anadir"][data-lista="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 80));

    const recienNacido = { ...a.datos.perfiles[0] };
    const desmarcar = async (n) => {
      const c = [...document.querySelectorAll('[data-perfil="0"][data-lista="proyectos"]')][n];
      c.checked = false;
      c.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
    };
    await desmarcar(1);
    await desmarcar(3);
    const trasPodar = [...a.datos.perfiles[0].proyectos];

    const c = [...document.querySelectorAll('[data-perfil="0"][data-lista="proyectos"]')][1];
    c.checked = true;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const trasRestaurar = [...a.datos.perfiles[0].proyectos];

    a.datos.perfiles[0].id = 'prueba';
    a.datos.perfiles[0].nombre = 'Prueba';
    a.datos.perfiles[0].role = 'Oficio de prueba';
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

  comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));
} finally {
  writeFileSync(RUTA, original);
  const vuelto = readFileSync(RUTA, 'utf8') === original;
  console.log(`\n  ${vuelto ? 'src/contenido.json restaurado.' : '⚠ NO se pudo restaurar contenido.json'}`);
  if (!vuelto) fallos++;
  await browser.close();
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
