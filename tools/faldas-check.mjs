/**
 * Que ninguna obra acabe en el aire.
 *
 * El defecto que motiva esto se ve como «esta parte de la isla está rota»: se
 * mira el canto de la escalinata y hay hierba debajo. La causa era que la
 * escalinata es una CINTA —una superficie de escalones sin bajos ni costados—
 * y los muretes sólo tapaban parte de su contorno. Donde el muro se acababa,
 * el borde quedaba colgando.
 *
 * ── Qué se mide, y por qué no lo obvio ────────────────────────────────────
 *
 * La medida evidente sería contar ARISTAS DE BORDE en el aire: las que
 * pertenecen a un solo triángulo son, por definición, el contorno abierto de
 * la malla. Se probó y no sirve como criterio, porque cada peldaño de esta
 * escalinata es una tira independiente —la huella vuela sobre la contrahuella
 * a propósito, y ese vuelo es la sombra del escalón— así que hay más de mil
 * aristas abiertas que son interiores y quedan encerradas por la falda. Contar
 * agujeros da 1.521 con la falda puesta y 1.553 sin ella: casi el mismo número
 * para dos escenas que se ven completamente distintas.
 *
 * Lo que sí separa los dos casos es CUÁNTO DE LA MALLA BAJA DEL SUELO. Una
 * cinta sin falda tiene el cien por cien de sus vértices por encima del
 * terreno —no toca la tierra en ningún punto— y una con falda se hunde en
 * ella. Medido en la escalinata a Habilidades: 0 % antes, 23 % después.
 *
 *   node tools/faldas-check.mjs
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });

const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('.loader__enter');
    return el && !el.hidden;
  },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 1500));

const medidas = await page.evaluate(() => {
  const ex = window.__portfolio;
  const campo = ex.world.field;
  const V3 = ex.camera.position.constructor;
  const v = new V3();
  const salida = {};
  ex.scene.traverse((o) => {
    if (!o.isMesh || !/^escalinata(-escalones|-entrega-(plaza|skills))?$/.test(o.name || '')) return;
    o.updateWorldMatrix(true, false);
    const pos = o.geometry.attributes.position;
    let bajoTierra = 0;
    let masBajo = Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const d = v.y - campo.height(v.x, v.z);
      if (d < -0.05) bajoTierra++;
      if (d < masBajo) masBajo = d;
    }
    salida[o.name] = {
      vertices: pos.count,
      pct: +((100 * bajoTierra) / pos.count).toFixed(0),
      masBajo: +masBajo.toFixed(2),
    };
  });
  return salida;
});

console.log('\n── Faldas: que la obra llegue al suelo ────────────────────────\n');

// El cuerpo principal y las dos entregas. Los tres eran cintas sin bajos, y los
// tres tienen que hundirse en el terreno por su contorno.
for (const nombre of ['escalinata-escalones', 'escalinata-entrega-plaza', 'escalinata-entrega-skills']) {
  const m = medidas[nombre];
  if (!m) {
    comprobar(false, `${nombre} existe`);
    continue;
  }
  comprobar(
    m.pct >= 10,
    `${nombre} se hunde en el terreno por su contorno`,
    `${m.pct} % de sus vértices bajo tierra`
  );
  // Y no de milímetros: la falda tiene que bajar de verdad, o desde un ángulo
  // rasante se sigue viendo por debajo.
  comprobar(
    m.masBajo <= -0.5,
    '  y baja lo suficiente para no verse por debajo',
    `${m.masBajo} m en su punto más hondo`
  );
}

comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
