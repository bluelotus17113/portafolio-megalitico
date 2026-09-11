/**
 * Prueba de la hoja de vida imprimible.
 *
 * Lo que hay que demostrar aquí no es que el botón exista, es que el PDF que
 * sale sirve para lo que sirve un currículo:
 *
 *  1. Que lleve **todo** lo que hay en `content.js`. Un documento aparte del
 *     de la pantalla puede quedarse atrás sin que nada falle: se añade un
 *     proyecto, aparece en la versión ligera, y en el papel no. Por eso aquí
 *     se comparan las dos listas, no se mira si «hay proyectos».
 *  2. Que sea **texto**, no una foto de un texto. Es la diferencia entre que
 *     un filtro de currículos lo lea y que lo tire, y desde fuera las dos
 *     cosas se ven idénticas. Se mira dentro del PDF: un documento con
 *     tipografías incrustadas tiene texto; uno hecho con html2canvas, no.
 *  3. Que los **enlaces sigan vivos**, que es la otra mitad de mandarlo por
 *     correo.
 *  4. Que no se imprima **en negativo**. El portafolio es texto claro sobre
 *     fondo oscuro y los navegadores no imprimen los fondos: sin cambiar el
 *     color del texto, el PDF sale en blanco sobre blanco y quien lo genere no
 *     se entera hasta que lo abre.
 *
 *   node tools/hoja-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'node:fs';
import {
  ABOUT,
  CONTACT,
  etiquetaEstado,
  EXPERIENCE,
  FORMACION,
  IDENTITY,
  PROJECTS,
  SKILLS,
} from '../src/content.js';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
const SALIDA = process.env.PDF ?? '/tmp/hoja-check.pdf';

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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
});

await page.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForSelector('.cv', { timeout: 30000 });

console.log('\n── Hoja de vida ───────────────────────────────────────────────\n');

// ── 1. En pantalla no está; al imprimir es lo único que hay ────────────────
const visibilidad = await page.evaluate(() => {
  const cv = document.querySelector('.cv');
  const enPantalla = getComputedStyle(cv).display;
  return { enPantalla, botones: document.querySelectorAll('[data-imprimir]').length };
});
comprobar(visibilidad.enPantalla === 'none', 'En pantalla la hoja no se ve (no se enseña dos veces)');
comprobar(visibilidad.botones === 2, 'Hay botón arriba y abajo', `${visibilidad.botones}`);

await page.emulateMediaType('print');
const impresion = await page.evaluate(() => {
  const cv = document.querySelector('.cv');
  const hermanos = [...document.querySelector('#ligero').children].filter((el) => el !== cv);
  const visibles = hermanos.filter((el) => getComputedStyle(el).display !== 'none');
  const est = getComputedStyle(cv);
  return {
    cvVisible: est.display !== 'none',
    colados: visibles.map((el) => el.className || el.tagName),
    color: est.color,
    fondo: getComputedStyle(document.body).backgroundColor,
    ancho: cv.scrollWidth,
    caja: cv.clientWidth,
  };
});
comprobar(impresion.cvVisible, 'Al imprimir, la hoja aparece');
comprobar(
  impresion.colados.length === 0,
  'Y no se cuela nada del portafolio en el papel',
  impresion.colados.join(', ')
);

// ── 2. Tinta oscura sobre papel blanco ─────────────────────────────────────
//
// El fallo real que se vigila: el portafolio es claro sobre oscuro, los
// navegadores no imprimen fondos, y sin tocar el color el texto sale blanco
// sobre blanco. Se mide la luminosidad de verdad, no que el color «sea otro».
const luz = (css) => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
comprobar(luz(impresion.color) < 0.35, 'El texto se imprime oscuro', impresion.color);
comprobar(luz(impresion.fondo) > 0.9, 'Sobre papel blanco', impresion.fondo);
comprobar(impresion.ancho <= impresion.caja + 1, 'Nada se sale del ancho de la página');

// ── 3. Lleva TODO lo de content.js ─────────────────────────────────────────
const texto = await page.evaluate(() => document.querySelector('.cv').innerText);
const falta = (lista) => lista.filter((v) => v && !texto.includes(v));

comprobar(texto.includes(IDENTITY.name) && texto.includes(IDENTITY.role), 'Nombre y oficio');
const sinExp = falta(EXPERIENCE.flatMap((e) => [e.period, e.role, e.org]));
comprobar(sinExp.length === 0, `Las ${EXPERIENCE.length} etapas de la trayectoria`, sinExp.join(', '));
const sinFor = falta(FORMACION.flatMap((e) => [e.period, e.role, e.org]));
comprobar(sinFor.length === 0, `Los ${FORMACION.length} estudios`, sinFor.join(', '));
const sinSkill = falta(SKILLS.map((s) => s.name));
comprobar(sinSkill.length === 0, `Las ${SKILLS.length} habilidades`, sinSkill.join(', '));
const sinFam = falta([...new Set(SKILLS.map((s) => s.family))]);
comprobar(sinFam.length === 0, 'Y sus familias', sinFam.join(', '));
const sinProy = falta(PROJECTS.map((p) => p.title));
comprobar(sinProy.length === 0, `Los ${PROJECTS.length} proyectos`, sinProy.join(', '));
// En papel el estado no puede ser un distintivo de color —los fondos no se
// imprimen—, así que va como una palabra más de la línea de datos. Aquí se
// comprueba que esa palabra llegó.
const conEstado = PROJECTS.filter((p) => etiquetaEstado(p.estado));
const estados = [...new Set(conEstado.map((p) => etiquetaEstado(p.estado)))];
comprobar(
  conEstado.length === 0 || falta(estados).length === 0,
  'Con el estado de cada uno escrito',
  estados.join(' / ')
);
// Los canales CON dirección salen; los que sólo tienen un marcador, no.
//
// Antes se exigía que salieran todos, y por eso «LinkedIn usuario» se imprimía
// en el PDF con la bendición de la prueba: la afirmación era «está lo que hay
// en el contenido» cuando la que importa es «está lo que sirve». Un canal sin
// dirección que funcione no es un canal, es una promesa rota impresa en papel.
const conDireccion = (CONTACT.links ?? []).filter((l) => l.value && l.href);
const sinDireccion = (CONTACT.links ?? []).filter((l) => l.value && !l.href);
comprobar(
  falta(conDireccion.map((l) => l.value)).length === 0,
  `Y los ${conDireccion.length} canales que llevan a algún sitio`,
  falta(conDireccion.map((l) => l.value)).join(', ')
);
const colados = sinDireccion.filter((l) => texto.includes(l.value));
comprobar(
  colados.length === 0,
  'Y ninguno a medio rellenar se cuela en el papel',
  colados.map((l) => `${l.label}: ${l.value}`).join(', ')
);
// El perfil del PAPEL, que no es el de la isla.
//
// Antes se exigía el texto largo entero. Dejó de ser lo correcto en cuanto la
// hoja tuvo el suyo: los dos hacen trabajos distintos —en la isla quien lee ya
// se ha parado, en un currículo se barre— y exigir el largo obligaba a
// imprimir ochocientos caracteres de prosa que empujaban la experiencia a la
// página siguiente.
const presentacion = ABOUT.resumenHoja?.length ? ABOUT.resumenHoja : ABOUT.body;
comprobar(falta(presentacion ?? []).length === 0, 'El texto de presentación del papel, entero');
if (ABOUT.resumenHoja?.length) {
  comprobar(
    falta(ABOUT.body ?? []).length > 0,
    '  y el largo de la isla NO se imprime: son dos textos, no uno repetido'
  );
}

// ── 4. Orden de currículo, no de portafolio ────────────────────────────────
const orden = await page.evaluate(() => {
  const y = (sel, texto) => {
    const el = [...document.querySelectorAll(sel)].find((e) => !texto || e.textContent.trim() === texto);
    return el ? el.getBoundingClientRect().top : Infinity;
  };
  const titulos = [...document.querySelectorAll('.cv__bloque h2')].map((h) => h.textContent.trim());
  return {
    titulos,
    contacto: y('.cv__canales'),
    perfil: y('.cv__bloque h2', 'Perfil'),
    experiencia: y('.cv__bloque h2', 'Experiencia'),
    proyectos: y('.cv__bloque h2', 'Proyectos'),
    primerPeriodo: document.querySelector('.cv__periodo')?.textContent.trim(),
  };
});
comprobar(
  orden.contacto < orden.perfil && orden.perfil < orden.experiencia && orden.experiencia < orden.proyectos,
  'El contacto va arriba del todo y la experiencia antes que los proyectos',
  orden.titulos.join(' → ')
);
comprobar(
  orden.primerPeriodo === EXPERIENCE.at(-1).period,
  'La trayectoria va del presente hacia atrás, al revés que el sendero de la escena',
  `${orden.primerPeriodo}`
);

// ── 5. Los marcadores de posición no se imprimen ───────────────────────────
const guiones = await page.evaluate(() =>
  [...document.querySelectorAll('.cv dd, .cv p, .cv li')].filter((el) => {
    const t = el.textContent.trim();
    return t === '—' || t === '-';
  }).length
);
comprobar(guiones === 0, 'Ningún dato queda con un guion de relleno', `${guiones}`);
const pie = await page.evaluate(() => document.querySelector('[data-cv-url]')?.textContent.trim());
comprobar(Boolean(pie) && pie !== '—', 'El pie lleva la dirección del portafolio', pie);

// ── 6. El título con el que se guarda el fichero ───────────────────────────
const titulos = await page.evaluate(() => {
  const antes = document.title;
  window.dispatchEvent(new Event('beforeprint'));
  const durante = document.title;
  window.dispatchEvent(new Event('afterprint'));
  return { antes, durante, despues: document.title };
});
comprobar(
  titulos.durante === `${IDENTITY.name} — Hoja de vida`,
  'Al imprimir, el navegador propone el nombre del fichero',
  titulos.durante
);
comprobar(titulos.despues === titulos.antes, 'Y luego el título vuelve a lo que era', titulos.despues);

// ── 7. El PDF de verdad ────────────────────────────────────────────────────
await page.emulateMediaType(null);
await page.pdf({ path: SALIDA, printBackground: false, preferCSSPageSize: true, format: 'A4' });
const pdf = readFileSync(SALIDA);
const crudo = pdf.toString('latin1');
const cuenta = (re) => (crudo.match(re) ?? []).length;
const paginas = cuenta(/\/Type\s*\/Page[^s]/g);

comprobar(crudo.startsWith('%PDF-'), 'Sale un PDF', `${(pdf.length / 1024).toFixed(0)} kB`);
comprobar(paginas >= 1 && paginas <= 3, 'De una a tres páginas', `${paginas}`);
// Un PDF hecho con html2canvas o con una captura NO tiene tipografías dentro:
// tiene una imagen. Esta es la comprobación que separa un currículo legible
// por una máquina de uno que es una foto.
comprobar(cuenta(/\/Type\s*\/Font/g) > 0, 'Con tipografías incrustadas: es TEXTO, no una imagen');
// Y la cuenta de imágenes es EXACTAMENTE la del retrato. Antes se exigía cero,
// que era la misma idea cuando la hoja no llevaba foto; ahora un cero
// significaría que el retrato no llegó al papel, y un dos, que se coló un fondo
// rasterizado. Atarlo al dato es lo que mantiene viva la afirmación.
const conRetrato = Boolean(JSON.parse(readFileSync('src/contenido.json', 'utf8')).identidad.foto);
comprobar(
  cuenta(/\/Subtype\s*\/Image/g) === (conRetrato ? 1 : 0),
  conRetrato ? 'Y la única imagen es el retrato' : 'Y sin ninguna imagen dentro',
  `${cuenta(/\/Subtype\s*\/Image/g)}`
);
const enlaces = cuenta(/\/Subtype\s*\/Link/g);
const esperados = (CONTACT.links ?? []).filter((l) => l.href).length + PROJECTS.filter((p) => p.url).length + 1;
comprobar(enlaces >= esperados, 'Los enlaces siguen pinchables en el PDF', `${enlaces} de ${esperados}`);

comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}  PDF en ${SALIDA}\n`);
process.exit(fallos === 0 ? 0 : 1);
