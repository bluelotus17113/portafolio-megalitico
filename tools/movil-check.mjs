/**
 * Que la página se pueda usar en un teléfono.
 *
 * Nada lo comprobaba: todas las demás pruebas abren ventanas de portátil, así
 * que un menú con dos de cinco secciones fuera de la pantalla pasaba entero
 * inadvertido. Y no se veía como un fallo — se veía como un menú.
 *
 * ── Los dos defectos que motivan esto ──────────────────────────────────────
 *
 * El menú de la versión ligera medía 472 px de contenido en una caja de 328:
 * «Trayectoria» salía cortada a media palabra y «Contacto» no aparecía. Tenía
 * `overflow-x: auto`, así que técnicamente se llegaba arrastrando de lado —
 * pero sin ninguna señal de que hubiera más. Un desplazamiento lateral sin
 * señal no es una función, es un escondite.
 *
 * Y el menú de la isla le hablaba a un aparato que no está: «Rueda para
 * acercar · Clic en un monumento», y una insignia con la tecla «C» al lado de
 * «Caminar por la isla», prometiendo un atajo que en un teléfono no existe.
 *
 * ── Por qué 320 px ────────────────────────────────────────────────────────
 *
 * Es el ancho del teléfono más estrecho que sigue en circulación. Si el menú
 * cabe ahí, cabe en todos; comprobar sólo con un móvil moderno deja fuera
 * justo a quien peor lo tiene.
 *
 *   node tools/movil-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:5173';
const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

const TELEFONOS = [
  ['iPhone 12', 390, 844],
  ['Android corriente', 360, 740],
  ['el más estrecho que queda', 320, 568],
];

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  protocolTimeout: 600000,
});

console.log('\n── En un teléfono ─────────────────────────────────────────────\n');

try {
  // ── 1. La versión ligera, en tres anchos ────────────────────────────────
  console.log('  el menú de la versión ligera');
  for (const [nombre, w, h] of TELEFONOS) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.goto(`${URL}/?modo=ligero`, { waitUntil: 'networkidle2', timeout: 180000 });
    await new Promise((r) => setTimeout(r, 1400));

    const m = await p.evaluate(() => {
      const enlaces = [...document.querySelectorAll('.lg-nav__enlace')];
      const dentro = (e) => {
        const r = e.getBoundingClientRect();
        return r.right <= window.innerWidth + 1 && r.left >= -1;
      };
      return {
        total: enlaces.length,
        alcanzables: enlaces.filter(dentro).length,
        anchoDoc: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
        cabecera: Math.round(document.querySelector('.lg-cabecera')?.getBoundingClientRect().height ?? 0),
      };
    });

    comprobar(
      m.total > 0 && m.alcanzables === m.total,
      `${nombre} (${w}px): se ven las ${m.total} secciones sin arrastrar de lado`,
      `${m.alcanzables}/${m.total}`
    );
    comprobar(
      m.anchoDoc <= m.ventana + 1,
      `  y la página no se desborda a lo ancho`,
      `${m.anchoDoc} vs ${m.ventana}`
    );
    // Una cabecera fija que se coma un tercio de la pantalla deja el contenido
    // asomando por una rendija.
    comprobar(
      m.cabecera < h * 0.3,
      `  y la cabecera fija no se come la pantalla`,
      `${m.cabecera}px de ${h} (${Math.round((m.cabecera / h) * 100)}%)`
    );
    await p.close();
  }

  // ── 2. La isla le habla al aparato que tiene delante ────────────────────
  console.log('\n  la ayuda del menú de la isla');
  const verMenu = async (movil) => {
    const p = await browser.newPage();
    if (movil) await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    else await p.setViewport({ width: 1280, height: 800 });
    await p.goto(`${URL}/?instant`, { waitUntil: 'networkidle2', timeout: 240000 });
    await p.waitForFunction(
      () => {
        const e = document.querySelector('.loader__enter');
        return e && !e.hidden;
      },
      { timeout: 240000 }
    );
    await p.click('.loader__enter');
    await new Promise((r) => setTimeout(r, 3200));
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) =>
        /menu|menú/i.test((e.className || '') + (e.getAttribute('aria-label') || ''))
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    const r = await p.evaluate(() => {
      const vis = (el) => el && getComputedStyle(el).display !== 'none';
      return {
        ayuda: [...document.querySelectorAll('.menu__help')]
          .filter(vis)
          .map((e) => e.textContent.trim().replace(/\s+/g, ' ')),
        teclas: [...document.querySelectorAll('.menu__mode kbd')].filter(vis).length,
      };
    });
    await p.close();
    return r;
  };

  const raton = await verMenu(false);
  comprobar(raton.ayuda.length === 1, 'Con ratón se enseña UNA ayuda, no las dos', raton.ayuda.join(' / '));
  comprobar(/rueda|clic/i.test(raton.ayuda[0] ?? ''), '  y es la de ratón', raton.ayuda[0] ?? '');
  comprobar(raton.teclas > 0, '  con sus atajos de teclado a la vista', `${raton.teclas}`);

  const dedo = await verMenu(true);
  comprobar(dedo.ayuda.length === 1, 'Con dedo también UNA', dedo.ayuda.join(' / '));
  comprobar(
    /desliza|pellizca|toca/i.test(dedo.ayuda[0] ?? '') && !/rueda|clic/i.test(dedo.ayuda[0] ?? ''),
    '  y es la de gestos, sin hablar de ratón',
    dedo.ayuda[0] ?? ''
  );
  comprobar(
    dedo.teclas === 0,
    '  y sin insignias de teclas: prometen un atajo que ahí no existe',
    `${dedo.teclas}`
  );
} finally {
  await browser.close();
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
