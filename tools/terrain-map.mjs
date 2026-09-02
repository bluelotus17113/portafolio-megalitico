/**
 * Mapa del promontorio: altura, pendiente y trazado de los caminos.
 *
 * Escribe un PPM de la isla vista desde arriba y, por consola, el perfil de
 * cada ramal — cuánto sube, qué pendiente máxima cruza y cuántos metros pasa
 * por encima de terreno empinado.
 *
 * Sirve para decidir por dónde va un camino sin mirarlo a ojo desde el aire,
 * que es como se colaron los dos que trepan la ladera pelada: desde el mirador
 * la loma queda de perfil y una cuesta del 45 % parece un repecho.
 *
 *   node tools/terrain-map.mjs [salida.ppm]
 */

import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { TerrainField } from '../src/world/Terrain.js';
import { pathRoute, polarRoute } from '../src/world/Paths.js';
import { SECTIONS, WORLD, SEED, daisOuterRadius } from '../src/config.js';

const OUT = process.argv[2] ?? 'captures/terreno.ppm';
const PAD_RADIUS = { about: 16, projects: 34, skills: 24, experience: 13, contact: 17 };

// Mismo orden de construcción que World: explanadas primero, rutas después.
const field = new TerrainField(SEED);
field.addPad(0, 0, WORLD.plazaRadius + 9, 28);
for (const def of SECTIONS) field.addPad(def.anchor[0], def.anchor[2], PAD_RADIUS[def.id] ?? 16, 24);

const anchorOf = (d) => new THREE.Vector3(d.anchor[0], 0, d.anchor[2]);
const plazaOuter = daisOuterRadius('plaza');

const rutas = [];
for (const def of SECTIONS) {
  const anchor = anchorOf(def);
  const dir = anchor.clone().normalize();
  const from = dir.clone().multiplyScalar(plazaOuter - 1.5);
  const to = anchor.clone().sub(dir.clone().multiplyScalar(daisOuterRadius(def.id) - 1.5));
  const samples = Math.max(8, Math.round(from.distanceTo(to) * 1.2));
  rutas.push({ nombre: `radio ${def.id}`, pts: pathRoute(field, from, to, { arc: 0.06, samples }) });
}
const ordenadas = [...SECTIONS].sort(
  (a, b) => Math.atan2(a.anchor[2], a.anchor[0]) - Math.atan2(b.anchor[2], b.anchor[0])
);
for (let i = 0; i < ordenadas.length; i++) {
  const a = ordenadas[i];
  const b = ordenadas[(i + 1) % ordenadas.length];
  const pa = anchorOf(a);
  const pb = anchorOf(b);
  const dir = pb.clone().sub(pa).normalize();
  const from = pa.clone().addScaledVector(dir, daisOuterRadius(a.id) - 1.5);
  const to = pb.clone().addScaledVector(dir, -(daisOuterRadius(b.id) - 1.5));
  rutas.push({
    nombre: `arco ${a.id}→${b.id}`,
    pts: polarRoute(field, from, to, { bulge: 0.07, samples: 96, minRadius: plazaOuter + 4 }),
  });
}

// ---- Perfil de cada ramal ---------------------------------------------------
console.log('ramal                       largo   subida  pend.máx  m en cuesta >25%');
for (const { nombre, pts } of rutas) {
  let largo = 0;
  let subida = 0;
  let maxPend = 0;
  let enCuesta = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const dy = pts[i].y - pts[i - 1].y;
    largo += d;
    subida += Math.abs(dy);
    const pend = d > 1e-3 ? Math.abs(dy) / d : 0;
    maxPend = Math.max(maxPend, pend);
    if (pend > 0.25) enCuesta += d;
  }
  const aviso = enCuesta > 8 ? '  ← trepa' : '';
  console.log(
    `${nombre.padEnd(26)} ${largo.toFixed(0).padStart(5)} m ${subida.toFixed(0).padStart(6)} m` +
    `  ${(maxPend * 100).toFixed(0).padStart(6)} %  ${enCuesta.toFixed(0).padStart(14)}${aviso}`
  );
}

// ---- Mapa -------------------------------------------------------------------
// Solo la meseta. Normalizando sobre todo el rango, los 130 m que hay del fondo
// marino a la cima se comen los 30 m de relieve del interior y la isla sale de
// un color plano: justo la parte que hay que leer.
const N = 520;
const EXTENT = 130;
const px = new Uint8Array(N * N * 3);
const aMundo = (i) => (i / (N - 1)) * EXTENT * 2 - EXTENT;

const alturas = new Float32Array(N * N);
let hMin = Infinity;
let hMax = -Infinity;
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const h = field.height(aMundo(i), aMundo(j));
    alturas[j * N + i] = h;
    if (h > 20) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
  }
}

// Sombreado de relieve: sol del noroeste, que es como se lee un mapa.
const sombra = (i, j) => {
  const s = (EXTENT * 2) / (N - 1);
  const dx = (alturas[j * N + Math.min(N - 1, i + 1)] - alturas[j * N + Math.max(0, i - 1)]) / (2 * s);
  const dz = (alturas[Math.min(N - 1, j + 1) * N + i] - alturas[Math.max(0, j - 1) * N + i]) / (2 * s);
  const n = 1 / Math.hypot(dx, dz, 1);
  return Math.max(0.15, (-dx * 0.6 - dz * 0.55 + 1.4) * n);
};

for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const h = alturas[j * N + i];
    const k = (j * N + i) * 3;
    if (h < 20) { px[k] = 28; px[k + 1] = 64; px[k + 2] = 104; continue; }
    const t = (h - hMin) / Math.max(1, hMax - hMin);
    const luz = sombra(i, j);
    let r = (110 + t * 130) * luz;
    let g = (150 + t * 60) * luz;
    let b = (95 + t * 30) * luz;
    // Curvas cada 4 m, para poder contar el desnivel de un vistazo.
    if (Math.abs((h % 4) - 2) > 1.86) { r *= 0.72; g *= 0.72; b *= 0.72; }
    px[k] = Math.min(255, r | 0); px[k + 1] = Math.min(255, g | 0); px[k + 2] = Math.min(255, b | 0);
  }
}

const pinta = (x, z, c, radio = 1) => {
  const i = Math.round(((x + EXTENT) / (EXTENT * 2)) * (N - 1));
  const j = Math.round(((z + EXTENT) / (EXTENT * 2)) * (N - 1));
  for (let dj = -radio; dj <= radio; dj++) for (let di = -radio; di <= radio; di++) {
    const ii = i + di;
    const jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
    const k = (jj * N + ii) * 3;
    px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2];
  }
};

// Los tramos empinados se pintan de rojo sobre el propio trazado: así se ve
// DÓNDE trepa cada ramal, no solo cuánto.
for (const { nombre, pts } of rutas) {
  const base = nombre.startsWith('arco') ? [250, 250, 250] : [255, 205, 40];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const d = Math.hypot(pts[i].x - a.x, pts[i].z - a.z);
    const pend = d > 1e-3 ? Math.abs(pts[i].y - a.y) / d : 0;
    pinta(pts[i].x, pts[i].z, pend > 0.25 ? [255, 40, 40] : base);
  }
}
for (const def of SECTIONS) pinta(def.anchor[0], def.anchor[2], [255, 0, 255], 3);
pinta(0, 0, [255, 0, 255], 3);

writeFileSync(OUT, Buffer.concat([Buffer.from(`P6\n${N} ${N}\n255\n`), Buffer.from(px)]));
console.log(`\nMapa en ${OUT}  (${EXTENT * 2} × ${EXTENT * 2} m; +X derecha, +Z abajo)`);
console.log(`alturas de la meseta ${hMin.toFixed(1)} … ${hMax.toFixed(1)} m`);
for (const def of SECTIONS) {
  console.log(`  ${def.label.padEnd(12)} (${def.anchor[0]}, ${def.anchor[2]})  h=${field.height(def.anchor[0], def.anchor[2]).toFixed(1)}`);
}
