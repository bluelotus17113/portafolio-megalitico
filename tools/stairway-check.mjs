/**
 * Diagnóstico de la escalinata, contra el módulo de verdad.
 *
 * Monta el campo de alturas igual que `World._buildField` e interroga a
 * `stairwayPlan`, así que lo que mide es lo que se construye. Comprueba:
 *
 *  - recorrido, subida y pendiente media,
 *  - contrahuella real y reparto de huellas (la mínima es la que se pisa mal),
 *  - desmonte y terraplén respecto al terreno SIN excavar,
 *  - que el terreno YA excavado no atraviesa ninguna huella,
 *  - que el trazado no se mete en ningún estrado ni cruza los caminos.
 *
 *   node tools/stairway-check.mjs
 */

import { TerrainField } from '../src/world/Terrain.js';
import { souterrainMound, souterrainCuts, souterrainTunnel } from '../src/models/Souterrain.js';
import { stairwayPlan, stairwayCuts, stairwayWalkways, STAIRWAY } from '../src/models/Stairway.js';
import { SECTIONS, SEED, DAIS, daisOuterRadius } from '../src/config.js';

const PAD_RADIUS = Object.fromEntries(
  Object.entries(DAIS).map(([id, d]) => [id, d.radius + d.steps * d.stepWidth + 0.5])
);

const field = new TerrainField(SEED);
field.addPad(0, 0, PAD_RADIUS.plaza, 10);
for (const def of SECTIONS) field.addPad(def.anchor[0], def.anchor[2], PAD_RADIUS[def.id] ?? 16, 10);
const cerro = souterrainMound();
field.addMound(cerro.x, cerro.z, cerro.radius, cerro.height);
for (const c of souterrainCuts(field)) field.addCut(c.ax, c.az, c.bx, c.bz, c);
const g = souterrainTunnel();
field.addTunnel(g.ax, g.az, g.bx, g.bz, g);

// El plan se calcula ANTES de sus propios desmontes, igual que en el mundo.
const plan = stairwayPlan(field);
const cortes = stairwayCuts(field);
for (const c of cortes) field.addCut(c.ax, c.az, c.bx, c.bz, c);
for (const w of stairwayWalkways(field)) field.addWalkway(w.ax, w.az, w.bx, w.bz, w);

// La última huella no cuenta: arranca donde el perfil alcanza la cima, que por
// construcción es la última muestra, así que su fondo es cero y no es un
// escalón sino el canto de la obra.
const fondos = plan.huellas.slice(0, -1).map((h) => h.lFin - h.lIni);
const min = Math.min(...fondos);
const max = Math.max(...fondos);
const media = fondos.reduce((a, b) => a + b, 0) / fondos.length;

console.log('── trazado');
console.log(`  recorrido      ${plan.largo.toFixed(1)} m   (eje directo 23,0 m)`);
console.log(`  subida         ${(plan.y1 - plan.y0).toFixed(2)} m   de ${plan.y0.toFixed(2)} a ${plan.y1.toFixed(2)}`);
console.log(`  pendiente      ${(((plan.y1 - plan.y0) / plan.largo) * 100).toFixed(0)} %  ` +
  `(${((Math.atan((plan.y1 - plan.y0) / plan.largo) * 180) / Math.PI).toFixed(0)}°)`);
console.log('── escalones');
console.log(`  número         ${plan.numero}`);
console.log(`  contrahuella   ${(plan.contrahuella * 100).toFixed(1)} cm`);
console.log(`  huella         mín ${(min * 100).toFixed(0)} cm · media ${(media * 100).toFixed(0)} cm · máx ${(max * 100).toFixed(0)} cm`);
console.log(`  2C+H medio     ${(2 * plan.contrahuella + media).toFixed(2)} m`);
const rellanos = plan.huellas.filter((h) => h.lFin - h.lIni > 1.4);
console.log(`  rellanos (>1,4 m): ${rellanos.length}` +
  rellanos.map((h) => `  l=${h.lIni.toFixed(1)}–${h.lFin.toFixed(1)} a ${h.y.toFixed(1)} m`).join(''));

console.log('── movimiento de tierras');
console.log(`  desmonte máx   ${plan.desmonte.toFixed(2)} m`);
console.log(`  terraplén máx  ${plan.terraplen.toFixed(2)} m`);

// ---- ¿asoma el terreno por las huellas, ya excavado? ------------------------
let peor = { d: -Infinity };
for (let i = 0; i < plan.puntos.length; i++) {
  const p = plan.puntos[i];
  const l = plan.acum[i];
  const huella = plan.huellas.find((h) => l <= h.lFin) ?? plan.huellas[plan.huellas.length - 1];
  // Se mide en el eje y a media anchura, que es donde el desmonte cede.
  for (const off of [0, -STAIRWAY.ancho * 0.35, STAIRWAY.ancho * 0.35]) {
    const j = i < plan.puntos.length - 1 ? i + 1 : i - 1;
    const dx = plan.puntos[j].x - p.x;
    const dz = plan.puntos[j].z - p.z;
    const m = Math.hypot(dx, dz) || 1;
    const x = p.x + (-dz / m) * off;
    const z = p.z + (dx / m) * off;
    const d = field.height(x, z) - huella.y;
    if (d > peor.d) peor = { d, l, off, x, z };
  }
}
console.log('── terreno contra huella (ya excavado)');
console.log(`  peor asomo     ${peor.d >= 0 ? '+' : ''}${peor.d.toFixed(2)} m  en l=${peor.l.toFixed(1)}, desvío ${peor.off.toFixed(1)}`);
console.log(`  ${peor.d > 0.05 ? '✗ el terreno atraviesa los escalones' : '✓ ninguna huella queda enterrada'}`);

// ---- ¿se mete en algún estrado? --------------------------------------------
console.log('── holguras');
const circulos = [
  { id: 'plaza', x: 0, z: 0, r: daisOuterRadius('plaza') },
  ...SECTIONS.map((d) => ({ id: d.id, x: d.anchor[0], z: d.anchor[2], r: daisOuterRadius(d.id) })),
];
for (const c of circulos) {
  let dmin = Infinity;
  for (const p of plan.puntos) dmin = Math.min(dmin, Math.hypot(p.x - c.x, p.z - c.z) - c.r);
  const marca = dmin < -0.5 ? '✗ invade' : dmin < 0.5 ? '· toca' : '✓';
  console.log(`  ${c.id.padEnd(11)} ${dmin >= 0 ? '+' : ''}${dmin.toFixed(1)} m  ${marca}`);
}

// ---- ¿la cámara sube por encima de los escalones? --------------------------
let peorPaseo = { d: Infinity };
for (let l = 0; l <= plan.largo; l += 0.5) {
  const i = plan.acum.findIndex((a) => a >= l);
  const p = plan.puntos[Math.max(0, i)];
  const huella = plan.huellas.find((h) => l <= h.lFin) ?? plan.huellas[plan.huellas.length - 1];
  const d = field.walkHeight(p.x, p.z, huella.y + 2) - huella.y;
  if (d < peorPaseo.d) peorPaseo = { d, l };
}
console.log('── paseo');
console.log(`  suelo bajo el pie, peor caso  ${peorPaseo.d >= 0 ? '+' : ''}${peorPaseo.d.toFixed(2)} m  en l=${peorPaseo.l.toFixed(1)}`);
console.log(`  ${peorPaseo.d < -0.4 ? '✗ se anda por debajo de las huellas' : '✓ se anda sobre los escalones'}`);
