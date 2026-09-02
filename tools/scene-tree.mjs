/**
 * Vuelca el grafo de escena del mundo ya construido.
 *
 * Sirve para decidir el esquema de identificadores del editor sobre la escena
 * REAL en vez de sobre lo que uno cree recordar del código: cuántos nodos hay,
 * cuáles llevan nombre, cuáles son instanciados —esos no se editan pieza a
 * pieza— y a qué profundidad está la granularidad útil («un menhir», no «un
 * triángulo»).
 *
 *   node tools/scene-tree.mjs [profundidad]
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const PROFUNDIDAD = Number(process.argv[2] ?? 3);
const URL = process.env.URL ?? 'http://127.0.0.1:5173/?instant';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => { const el = document.querySelector('.loader__enter'); return el && !el.hidden; },
  { timeout: 240000 }
);

const informe = await page.evaluate((maxDepth) => {
  const scene = window.__portfolio.scene;
  const lineas = [];
  const conteo = { total: 0, conNombre: 0, mallas: 0, instanciados: 0, grupos: 0 };

  const visitar = (o, depth) => {
    conteo.total++;
    if (o.name) conteo.conNombre++;
    if (o.isInstancedMesh) conteo.instanciados++;
    else if (o.isMesh) conteo.mallas++;
    if (o.isGroup) conteo.grupos++;

    if (depth <= maxDepth) {
      const tipo = o.isInstancedMesh ? `Instanced×${o.count}` : o.isMesh ? 'Mesh' : o.type;
      lineas.push(
        `${'  '.repeat(depth)}${o.name || '(sin nombre)'}  [${tipo}]  hijos=${o.children.length}`
      );
    }
    for (const h of o.children) visitar(h, depth + 1);
  };
  for (const h of scene.children) visitar(h, 0);

  // Reparto de hijos del primer nivel: es donde hay que decidir la granularidad.
  const nivel1 = scene.children.map((c) => ({
    nombre: c.name || '(sin nombre)',
    tipo: c.type,
    hijos: c.children.length,
    conNombre: c.children.filter((h) => h.name).length,
  }));

  return { lineas, conteo, nivel1 };
}, PROFUNDIDAD);

console.log(informe.lineas.join('\n'));
console.log('\n── recuento');
console.log(informe.conteo);
console.log('\n── primer nivel (nombre · tipo · hijos · de ellos con nombre)');
for (const n of informe.nivel1) {
  console.log(`  ${n.nombre.padEnd(22)} ${n.tipo.padEnd(14)} ${String(n.hijos).padStart(5)}  ${String(n.conNombre).padStart(5)}`);
}

await browser.close();
