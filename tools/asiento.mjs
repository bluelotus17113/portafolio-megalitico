/**
 * Diagnóstico de asiento: qué piezas de la isla no tocan el suelo.
 *
 * «Se ve mal puesto» no es un dato con el que se pueda arreglar nada. Esto lo
 * convierte en uno: para cada pieza con nombre, mide la cota de su punto más
 * bajo contra la de la superficie que tiene DEBAJO. Positiva es hueco —flota—;
 * negativa es que está metida en el terreno, que es lo que se hace con un
 * ortostato y no es un fallo.
 *
 * ── Cómo se mide el suelo, y por qué así ──────────────────────────────────
 *
 * Hicieron falta tres intentos, y los dos primeros daban respuestas con pinta
 * de buenas:
 *
 * 1. **Preguntarle al campo de alturas.** Salían cuarenta piezas «flotando»
 *    exactamente 0,23–0,26 m. No flotaban: se apoyan en el ENLOSADO de un
 *    estrado, que es geometría y no terreno, y el campo de alturas no lo
 *    conoce. Un grupo entero de fallos con el mismo número no es un patrón,
 *    es un sesgo del método.
 *
 * 2. **Un rayo hacia abajo desde la base de la pieza.** Salían sesenta piezas
 *    «sin nada debajo», entre ellas los treinta ortostatos del pasadizo. El
 *    rayo arrancaba DENTRO del terreno —porque la pieza está enterrada, que es
 *    justo lo correcto— y salía por las caras traseras, que el trazador no
 *    cuenta. La medida le daba su peor nota a las piezas mejor plantadas.
 *
 * 3. **Lo de aquí abajo.** El terreno se le pregunta al campo de alturas, que
 *    para eso está y es exacto; la OBRA —enlosados, peldaños, otras piedras—
 *    se busca con rayos lanzados sólo contra ella, y desde POR ENCIMA de la
 *    pieza para no arrancar nunca dentro de una malla. Se toma la más alta de
 *    las dos. Además de ser correcta es mucho más rápida: el terreno son
 *    534.578 triángulos, y trazarlos por fuerza bruta cinco veces por pieza
 *    era lo que hacía que esto tardase minutos.
 *
 * ── Lo que no cuenta como fallo ───────────────────────────────────────────
 *
 *  - Dinteles, cubiertas y tapas: se apoyan sobre otras piedras a propósito.
 *  - Paneles flotantes, tallas y paños de runas: van en el aire o sobre la
 *    cara de una piedra por diseño.
 *  - Efectos: rótulos, líneas ley, espíritus, fuego, humo, hierba, hojas.
 *  - Instanciadas: su caja envolvente es la del conjunto, no la de cada pieza.
 *
 *   node tools/asiento.mjs [hueco mínimo en metros, por defecto 0.15]
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const UMBRAL = Number(process.argv[2] ?? 0.15);
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
await page.setViewport({ width: 900, height: 600 });
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

const informe = await page.evaluate((umbral) => {
  const app = window.__portfolio;
  const campo = app.world.field;
  // three no viaja como módulo a la página; las clases salen de objetos vivos.
  const Rayo = app.interaction.raycaster.constructor;
  const V3 = app.camera.position.constructor;

  /** Va en el aire o sobre otra piedra a propósito. */
  const NO_APOYA =
    /(lintel|dintel|capstone|cubierta|-cap$|tapa|holo|panel|talla|pa[ñn]o|canal-|pulse|anillo)/i;
  /** Efectos y rótulos: no son geometría del sitio. */
  const EFECTO =
    /(label|rotulo|ley|espiritu|sidhe|bird|pajaro|humo|smoke|fire|fuego|glyph|glifo|beacon|poster|cartel|sky|cielo|grass|hierba|hoja|leaf)/i;
  /** El suelo del mundo. Sale del campo de alturas, no del trazador. */
  const SUELO_MUNDO = /^(terrain|ocean)$/;

  const todas = [];
  app.scene.traverse((o) => {
    if (o.isMesh && o.visible) todas.push(o);
  });

  // Contra qué se trazan los rayos: la obra, y sólo la obra.
  const obra = todas.filter(
    (o) => !SUELO_MUNDO.test(o.name || '') && !EFECTO.test(o.name || '') && !o.isInstancedMesh
  );

  const rayo = new Rayo();
  rayo.far = 400;
  const abajo = new V3(0, -1, 0);

  const piezas = [];
  for (const o of todas) {
    const nombre = o.name || '';
    if (o.isInstancedMesh || !nombre) continue;
    if (SUELO_MUNDO.test(nombre) || EFECTO.test(nombre) || NO_APOYA.test(nombre)) continue;

    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) continue;
    const caja = bb.clone().applyMatrix4(o.matrixWorld);
    const ancho = caja.max.x - caja.min.x;
    const fondo = caja.max.z - caja.min.z;
    const alto = caja.max.y - caja.min.y;
    if (ancho > 120 || fondo > 120) continue;

    // Cinco puntos de la huella: el centro y las cuatro esquinas metidas un
    // 15 % hacia dentro, para no salirse por el canto de una pieza inclinada.
    const m = 0.15;
    const cx = (caja.min.x + caja.max.x) / 2;
    const cz = (caja.min.z + caja.max.z) / 2;
    const puntos = [
      [cx, cz],
      [caja.min.x + ancho * m, caja.min.z + fondo * m],
      [caja.min.x + ancho * m, caja.max.z - fondo * m],
      [caja.max.x - ancho * m, caja.min.z + fondo * m],
      [caja.max.x - ancho * m, caja.max.z - fondo * m],
    ];

    // El suelo más alto bajo la huella. Se toma el MÁXIMO porque basta con que
    // la pieza apoye en un punto: una piedra en una ladera toca por el lado de
    // arriba y tiene aire por el de abajo, y eso está bien puesto.
    let suelo = -Infinity;
    let sobre = '';
    // Se descartan los golpes por encima de su coronación: son las piezas
    // apoyadas ENCIMA de ésta, como un dintel sobre su jamba.
    const techo = caja.max.y - 0.05;
    const desde = caja.max.y + 1;

    for (const [x, z] of puntos) {
      const cota = campo.walkHeight(x, z, caja.min.y);
      if (cota > suelo) {
        suelo = cota;
        sobre = 'terreno';
      }
      rayo.set(new V3(x, desde, z), abajo);
      for (const golpe of rayo.intersectObjects(obra, false)) {
        if (golpe.object === o || golpe.object.parent === o) continue;
        const y = desde - golpe.distance;
        if (y > techo) continue;
        if (y > suelo) {
          suelo = y;
          sobre = golpe.object.name || golpe.object.type;
        }
        break; // el primero por debajo de la coronación es el que sostiene
      }
    }

    piezas.push({
      nombre,
      padre: o.parent?.name || '',
      x: +cx.toFixed(1),
      z: +cz.toFixed(1),
      alto: +alto.toFixed(2),
      base: +caja.min.y.toFixed(2),
      suelo: +suelo.toFixed(2),
      hueco: +(caja.min.y - suelo).toFixed(2),
      sobre,
    });
  }

  return {
    total: piezas.length,
    obra: obra.length,
    flotando: piezas.filter((p) => p.hueco > umbral).sort((a, b) => b.hueco - a.hueco),
    enterradas: piezas.filter((p) => p.hueco < -1.5).sort((a, b) => a.hueco - b.hueco),
  };
}, UMBRAL);

console.log('\n── Asiento de las piezas ──────────────────────────────────────\n');
console.log(`  piezas examinadas: ${informe.total}   ·   obra contra la que se traza: ${informe.obra}`);
console.log(`  FLOTANDO más de ${UMBRAL} m: ${informe.flotando.length}`);
console.log(`  hundidas más de 1,5 m: ${informe.enterradas.length}\n`);

const tabla = (lista, titulo) => {
  if (!lista.length) return;
  console.log(`  ${titulo}`);
  console.log('   hueco   alto      posición        pieza                          apoya en');
  console.log('  ' + '─'.repeat(78));
  for (const p of lista.slice(0, 30)) {
    const pos = `(${String(p.x).padStart(6)},${String(p.z).padStart(6)})`;
    const ruta = `${p.padre ? p.padre + '/' : ''}${p.nombre}`;
    console.log(
      `  ${String(p.hueco).padStart(6)}  ${String(p.alto).padStart(5)}  ${pos}  ${ruta.padEnd(30)} ${p.sobre}`
    );
  }
  if (lista.length > 30) console.log(`  … y ${lista.length - 30} más`);
  console.log();
};

tabla(informe.flotando, 'FLOTANDO');
tabla(informe.enterradas, 'HUNDIDAS (informativo: un ortostato va plantado)');

await browser.close();
