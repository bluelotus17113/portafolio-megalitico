/**
 * Capturas de la versión ligera, para mirarla en vez de imaginársela.
 *
 * Saca la página entera y cada sección por separado, en escritorio y en
 * móvil. Los recortes por sección son lo útil: en la captura larga todo cabe
 * y todo parece bien, y es en el detalle donde se ve que una cabecera pisa
 * algo o que una ficha se queda coja.
 *
 *   node tools/shoot-ligero.mjs [carpeta]
 */

import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
const SALIDA = process.argv[2] ?? 'captures/ligero';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});

/** Baja del todo y vuelve: obliga a dibujar todas las láminas aplazadas. */
async function despertarLaminas(page) {
  await page.evaluate(async () => {
    const paso = window.innerHeight * 0.8;
    for (let y = 0; y <= document.body.scrollHeight; y += paso) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 700));
}

async function retratar(nombre, viewport, { secciones = false, tiras = 0 } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
  await despertarLaminas(page);

  if (tiras) {
    // Por tiras y no de una pieza. La captura de página completa se cose por
    // trozos, y con una cabecera fija encima Chromium la repite en cada
    // costura: sale una imagen con el portafolio tres veces que parece un
    // fallo de la página y no lo es. Una pantalla cada vez es lo que se ve.
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    const paso = viewport.height;
    for (let i = 0; i < tiras && i * paso < alto; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * paso);
      await new Promise((r) => setTimeout(r, 250));
      const archivo = `${SALIDA}/${nombre}-${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: archivo });
      console.log(`  ${archivo}`);
    }
    await page.close();
    return;
  }

  await page.screenshot({ path: `${SALIDA}/${nombre}.png`, fullPage: true });
  console.log(`  ${SALIDA}/${nombre}.png`);

  if (secciones) {
    for (const sel of ['.lg-portada', '#lg-about', '#lg-projects', '#lg-skills', '#lg-experience', '#lg-contact']) {
      const el = await page.$(sel);
      if (!el) continue;
      const archivo = `${SALIDA}/${sel.replace(/[#.]/g, '')}.png`;
      await el.screenshot({ path: archivo });
      console.log(`  ${archivo}`);
    }
    // La cabecera fija, con una sección a media lectura detrás.
    await page.evaluate(() => document.getElementById('lg-skills').scrollIntoView());
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `${SALIDA}/cabecera.png` });
    console.log(`  ${SALIDA}/cabecera.png`);
  }

  await page.close();
}

/**
 * El fondo en varios momentos de su ciclo.
 *
 * No se espera: se le pone la hora a mano a cada animación con
 * `animation.currentTime`. Los ciclos son de 71, 97 y 53 segundos, así que
 * mirar el recorrido en tiempo real serían tres minutos de vídeo por captura,
 * y además cada intento saldría en un punto distinto. Fijando el reloj, las
 * imágenes son comparables entre sí y entre ejecuciones.
 */
async function retratarFondo(nombre, viewport, instantes) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });

  for (const segundos of instantes) {
    await page.evaluate((s) => {
      for (const a of document.getAnimations()) {
        if (a.effect.getTiming().iterations !== Infinity) continue;
        a.pause();
        a.currentTime = s * 1000;
      }
    }, segundos);
    await new Promise((r) => setTimeout(r, 250));
    const archivo = `${SALIDA}/${nombre}-${String(segundos).padStart(3, '0')}s.png`;
    await page.screenshot({ path: archivo });
    console.log(`  ${archivo}`);
  }

  await page.close();
}

/**
 * La puerta, en reposo y con cada opción señalada.
 *
 * Las tres hacen falta: en reposo se juzga si las dos opciones pesan lo mismo
 * —que es todo el planteamiento— y señaladas se ve si el motivo responde. Con
 * la captura en reposo sola, un `:hover` que no hiciera nada pasaría por
 * bueno.
 */
async function retratarPuerta(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  const tomas = [
    ['puerta', null],
    ['puerta-panel', '.pt-op--panel'],
    ['puerta-isla', '.pt-op--isla'],
  ];
  for (const [nombre, sel] of tomas) {
    if (sel) {
      await page.hover(sel);
      await new Promise((r) => setTimeout(r, 900));
    }
    await page.screenshot({ path: `${SALIDA}/${nombre}.png` });
    console.log(`  ${SALIDA}/${nombre}.png`);
  }
  await page.close();
}

console.log('\nCapturando la versión ligera');
await retratarPuerta({ width: 1440, height: 900 });
await retratar('escritorio', { width: 1440, height: 900 }, { secciones: true });
await retratar('movil', { width: 390, height: 780, deviceScaleFactor: 2 }, { tiras: 6 });
await retratarFondo('fondo', { width: 1440, height: 900 }, [0, 24, 48, 71]);

await browser.close();
console.log('');
