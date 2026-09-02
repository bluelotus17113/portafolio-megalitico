/**
 * Prueba de punta a punta del editor dentro de la web.
 *
 * Lo que hay que demostrar no es que el panel se pinte, sino que el CICLO se
 * cierra: mover una pieza en el navegador, guardar, recargar y encontrarla
 * donde se dejó. Eso cruza el navegador, el middleware de Vite, el fichero en
 * disco y el arranque del mundo, y cualquiera de los cuatro puede romperlo sin
 * que se note en los otros tres.
 *
 * Se ejecuta contra el servidor de DESARROLLO, que es el único que tiene las
 * rutas de guardado. Deja `src/editor/escena.json` como estaba.
 *
 *   node tools/editor-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const URL_BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
const ESCENA = 'src/editor/escena.json';
const PIEZA = process.env.PIEZA ?? 'piedras-runadas/piedra-runada#0';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

const original = existsSync(ESCENA) ? readFileSync(ESCENA, 'utf8') : null;
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

/** Abre la escena y espera a que el mundo esté montado. */
async function abrir(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 240000 });
  await page.waitForFunction(
    () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
    { timeout: 240000 }
  );
  await page.click('.loader__enter');
  await new Promise((r) => setTimeout(r, 1500));
  return { page, errores };
}

try {
  // ---- 1. El editor se monta y cataloga --------------------------------
  console.log('── modo editor');
  const { page, errores } = await abrir(`${URL_BASE}?editor&instant`);

  const montado = await page.evaluate(() => {
    const e = window.__portfolio.editor;
    return {
      hayEditor: Boolean(e),
      hayPanel: Boolean(document.querySelector('.ed')),
      hayGizmo: Boolean(e?.ayudante),
      piezas: window.__portfolio.catalogo?.piezas?.size ?? 0,
      materiales: window.__portfolio.catalogo?.materiales?.size ?? 0,
    };
  });
  comprobar(montado.hayEditor, 'el editor arranca con ?editor');
  comprobar(montado.hayPanel, 'el panel está en el DOM');
  comprobar(montado.hayGizmo, 'el gizmo está en la escena');
  comprobar(montado.piezas > 80, `piezas catalogadas`, `(${montado.piezas})`);
  comprobar(montado.materiales >= 8, `familias de material`, `(${montado.materiales})`);

  // ---- 2. Mover una pieza y guardar ------------------------------------
  console.log('── mover y guardar');
  const movimiento = await page.evaluate(async (id) => {
    const e = window.__portfolio.editor;
    const pieza = e.seleccionar(id);
    if (!pieza) return { error: `no existe la pieza ${id}` };
    const antes = pieza.objeto.position.toArray();
    e.aplicar({ pos: [antes[0] + 3, antes[1] + 4, antes[2] - 2] });
    await e.guardar();
    return { antes, despues: pieza.objeto.position.toArray(), sucio: e.sucio };
  }, PIEZA);

  comprobar(!movimiento.error, 'la pieza de prueba existe', movimiento.error ?? PIEZA);
  if (!movimiento.error) {
    comprobar(
      Math.abs(movimiento.despues[1] - movimiento.antes[1] - 4) < 1e-6,
      'la pieza se mueve en vivo'
    );
    comprobar(movimiento.sucio === false, 'el guardado limpia el indicador de cambios');
  }

  // ---- 3. El fichero del proyecto lo recoge ----------------------------
  const enDisco = JSON.parse(readFileSync(ESCENA, 'utf8'));
  const anotacion = enDisco.objetos?.[PIEZA];
  comprobar(Boolean(anotacion), 'la anulación está en src/editor/escena.json');
  comprobar(Array.isArray(anotacion?.pos0), 'guarda la posición de origen para detectar derivas');

  // ---- 4. Textura de fichero -------------------------------------------
  console.log('── textura de fichero');
  const textura = await page.evaluate(async () => {
    // PNG de 2×2 en base64, suficiente para probar el circuito completo.
    const datos =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR42mNk+M9Qz0AEYBxVSF+FjIONjIwMAFXBBAFmvxQoAAAAAElFTkSuQmCC';
    const r = await fetch('/__editor/textura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'prueba editor', datos }),
    });
    return r.json();
  });
  comprobar(textura.ok === true, 'la imagen se sube al proyecto', textura.ruta ?? textura.error);
  comprobar(
    textura.ruta === 'texturas/prueba-editor.png',
    'el nombre se sanea',
    textura.ruta
  );

  comprobar(errores.length === 0, 'consola limpia', errores.join(' | '));

  // ---- 5. Recargar: ¿persiste? -----------------------------------------
  console.log('── persistencia tras recargar');
  await page.close();
  const segunda = await abrir(`${URL_BASE}?instant`);
  const persistido = await segunda.page.evaluate((id) => {
    const scene = window.__portfolio.scene;
    let encontrada = null;
    scene.traverse((o) => {
      if (o.userData?.editorId === id) encontrada = o.position.toArray();
    });
    return encontrada;
  }, PIEZA);

  comprobar(Boolean(persistido), 'la pieza sigue existiendo tras recargar');
  if (persistido && !movimiento.error) {
    const igual = persistido.every((v, i) => Math.abs(v - movimiento.despues[i]) < 0.01);
    comprobar(igual, 'conserva la posición guardada', `${persistido.map((v) => v.toFixed(2))}`);
  }
  comprobar(
    segunda.errores.length === 0,
    'consola limpia SIN el editor',
    segunda.errores.join(' | ')
  );
  await segunda.page.close();
} finally {
  await browser.close();
  // Se deja el proyecto como estaba: esto es una prueba, no una edición.
  if (original !== null) writeFileSync(ESCENA, original, 'utf8');
}

console.log(fallos ? `\n${fallos} comprobaciones han fallado.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
