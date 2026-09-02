/**
 * ¿Se nota el fondo animado?
 *
 * Existe porque el primer intento no se notaba y yo no me di cuenta mirando:
 * las tres capas se movían, `getAnimations()` las listaba, dos capturas
 * separadas cuarenta y ocho segundos parecían la misma imagen — y lo eran, con
 * una diferencia media de 0,010 sobre 765. Un resplandor de mil píxeles de
 * caída suave que se corre doscientos no cambia la luz de ningún punto de la
 * pantalla lo bastante para que un ojo lo registre.
 *
 * Así que se mide. Se le pone la hora a mano a cada animación —los ciclos son
 * de 71, 97 y 53 segundos y esperarlos serían tres minutos por captura— y se
 * comparan los fotogramas sobre una franja de fondo limpio, sin texto ni
 * filetes que contaminen la cuenta.
 *
 * Los umbrales no son gusto mío: por debajo de ~1/765 de diferencia media el
 * cambio queda por debajo de lo que distingue un ojo en un degradado oscuro, y
 * por encima de ~12 deja de ser un fondo y empieza a competir con el texto.
 *
 *   node tools/fondo-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
const INSTANTES = [0, 18, 36, 53, 71];

/** Franja de fondo limpio a la derecha de la portada: ni texto ni filetes. */
const RECORTE = { x: 780, y: 90, width: 620, height: 380 };

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

const carpeta = mkdtempSync(join(tmpdir(), 'fondo-'));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });

// El pulso del botón «Ver en 3D» late cada 3 s y cae fuera del recorte, pero
// se para igual: lo que se mide es el fondo, no la interfaz.
await page.evaluate(() => {
  for (const a of document.getAnimations()) a.pause();
});

const archivos = [];
for (const s of INSTANTES) {
  await page.evaluate((seg) => {
    for (const a of document.getAnimations()) {
      if (a.effect.getTiming().iterations === Infinity) a.currentTime = seg * 1000;
    }
  }, s);
  await new Promise((r) => setTimeout(r, 200));
  const archivo = join(carpeta, `${String(s).padStart(3, '0')}.png`);
  await page.screenshot({ path: archivo, clip: RECORTE });
  archivos.push({ s, archivo });
}

await browser.close();

/** Diferencia media y máxima entre dos recortes, en la escala 0..765. */
function diferencia(a, b) {
  const salida = execFileSync('python3', [
    '-c',
    `import sys
from PIL import Image, ImageChops, ImageStat
a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
d = ImageChops.difference(a, b)
st = ImageStat.Stat(d)
print(sum(st.mean), sum(st.extrema[i][1] for i in range(3)))`,
    a,
    b,
  ]);
  const [media, maxima] = String(salida).trim().split(' ').map(Number);
  return { media, maxima };
}

console.log('\nEl fondo animado, ¿se nota?');
console.log(`  recorte ${RECORTE.width}×${RECORTE.height} de fondo limpio, escala 0..765\n`);

let mayor = 0;
for (let i = 1; i < archivos.length; i++) {
  const { media, maxima } = diferencia(archivos[i - 1].archivo, archivos[i].archivo);
  mayor = Math.max(mayor, media);
  console.log(
    `    ${String(archivos[i - 1].s).padStart(3)}s → ${String(archivos[i].s).padStart(3)}s` +
      `   media ${media.toFixed(2).padStart(6)}   máx ${maxima.toFixed(0).padStart(4)}`
  );
}

const extremos = diferencia(archivos[0].archivo, archivos.at(-1).archivo);
console.log(`    ${String(archivos[0].s).padStart(3)}s → ${String(archivos.at(-1).s).padStart(3)}s   media ${extremos.media.toFixed(2).padStart(6)}   máx ${extremos.maxima.toFixed(0).padStart(4)}   (recorrido completo)\n`);

comprobar(extremos.media > 1, 'el recorrido completo se ve', `media ${extremos.media.toFixed(2)}`);
comprobar(extremos.media < 12, 'y no compite con el texto', `media ${extremos.media.toFixed(2)}`);
comprobar(mayor > 0.25, 'el cambio es continuo, no un salto', `mayor tramo ${mayor.toFixed(2)}`);

rmSync(carpeta, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo en orden\n');
process.exit(fallos ? 1 : 0);
