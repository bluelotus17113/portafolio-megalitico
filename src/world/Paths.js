/**
 * Red de caminos empedrados.
 *
 * Une el círculo central con cada santuario. La ruta es la MISMA curva que
 * sigue la línea ley, así que la veta de energía corre por encima del
 * empedrado en vez de por su lado: son la misma vía leída de dos maneras, una
 * física y otra arcana.
 *
 * El camino es una cinta de quads pegada al terreno, no una hilera de losas
 * sueltas. Con losas independientes cada una necesita su propia altura y en
 * cuanto el suelo ondula unas flotan y otras se hunden; una cinta muestrea el
 * terreno en cada vértice y se apoya siempre. Además es un solo draw call para
 * los cinco ramales.
 */

import * as THREE from 'three';
import { cobblePath } from '../utils/textures.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { createBoulder, rockMaterial } from '../models/StoneFactory.js';
import { makeRandom, SimplexNoise } from '../utils/noise.js';
import { SEED } from '../config.js';

/**
 * Traza de un ramal, pegado al terreno.
 *
 * La curva es una Bézier cuadrática con el punto medio desplazado de lado —
 * exactamente la que usa `createLeyLine`, para que ambas coincidan.
 *
 * @param {import('./Terrain.js').TerrainField} field
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @returns {THREE.Vector3[]}
 */
export function pathRoute(field, from, to, { arc = 0.10, samples = 90 } = {}) {
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const side = new THREE.Vector3().subVectors(to, from);
  const length = side.length();
  side.set(-side.z, 0, side.x).normalize().multiplyScalar(length * arc);
  mid.add(side);

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = new THREE.Vector3().lerpVectors(from, mid, t);
    const b = new THREE.Vector3().lerpVectors(mid, to, t);
    const p = a.lerp(b, t);
    p.y = field.meshHeight(p.x, p.z);
    points.push(p);
  }
  return points;
}

/**
 * Tramo que rodea la plaza en vez de cruzarla.
 *
 * Interpola en POLARES alrededor del centro de la isla — ángulo y radio— en
 * lugar de en línea recta. Es lo que hace que el camino entre dos santuarios
 * describa un arco por fuera del círculo central en vez de atravesarlo.
 *
 * Existe porque la red radial no daba de sí: los estrados están tan cerca del
 * círculo central que tres de los cinco ramales medían menos de tres metros.
 * Midiéndolos se ve enseguida — `daisOuterRadius('plaza')` es 33,4 y el borde
 * del estrado de «Sobre mí» cae a 29 del centro, o sea que se tocan.
 */
export function polarRoute(field, from, to, {
  bulge = 0.07,
  samples = 90,
  minRadius = 0,
} = {}) {
  const r0 = Math.hypot(from.x, from.z);
  const r1 = Math.hypot(to.x, to.z);
  const a0 = Math.atan2(from.z, from.x);
  let sweep = Math.atan2(to.z, to.x) - a0;
  // Siempre por el lado corto.
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;

  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = a0 + sweep * t;
    // Panza hacia fuera a medio recorrido: sin ella el arco se lee como el
    // trazo de un compás, no como un camino.
    let r = (r0 + (r1 - r0) * t) * (1 + Math.sin(t * Math.PI) * bulge);
    r = Math.max(r, minRadius);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    points.push(new THREE.Vector3(x, field.meshHeight(x, z), z));
  }
  return points;
}

/**
 * Cuánto trepa un ramal: metros recorridos por encima de `limite` de pendiente,
 * y la pendiente máxima que llega a cruzar.
 *
 * Hace falta porque el trazado es CIEGO al relieve: las rutas se dibujan en
 * planta —una Bézier o un arco en polares— y solo después se les pega la altura
 * del terreno. En una meseta llana eso da igual; aquí no, porque el promontorio
 * tiene un escarpe de unos veinte metros entre la meseta baja (la plaza, a 44)
 * y la alta (Trayectoria a 61, Habilidades a 66). Tres ramales lo subían de
 * frente, uno de ellos al 192 % — sesenta grados. Vistos desde el mirador
 * quedan de perfil y parecen un repecho; desde arriba son una cinta de adoquín
 * pegada a un cortado.
 */
export function routeClimb(route, limite = 0.25) {
  let empinado = 0;
  let maxima = 0;
  for (let i = 1; i < route.length; i++) {
    const d = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    if (d < 1e-3) continue;
    const p = Math.abs(route[i].y - route[i - 1].y) / d;
    maxima = Math.max(maxima, p);
    if (p > limite) empinado += d;
  }
  return { empinado, maxima };
}

/**
 * Círculos por los que NO se siembra hierba ni se planta arbolado.
 *
 * Una cadena de círculos aproxima la cinta lo bastante bien y encaja con el
 * mecanismo que ya usan los estrados, que también trabaja con círculos. Con
 * una prueba de distancia a segmento habría que tocar tres módulos.
 */
export function pathKeepOut(routes, radius, spacing = 2.0) {
  const zones = [];
  for (const route of routes) {
    let run = spacing;         // el primer punto siempre entra
    for (let i = 0; i < route.length; i++) {
      if (i > 0) run += route[i].distanceTo(route[i - 1]);
      if (run < spacing) continue;
      run = 0;
      zones.push({ x: route[i].x, z: route[i].z, radius });
    }
  }
  return zones;
}

/**
 * Cinta empedrada sobre una o varias rutas, fundidas en una sola malla.
 *
 * @param {import('./Terrain.js').TerrainField} field
 * @param {THREE.Vector3[][]} routes
 */
export function createPaths(field, routes, {
  width = 3.4,
  lift = 0.09,
  tile = 5.5,
  seed = 91,
} = {}) {
  const noise = new SimplexNoise(seed);

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let base = 0;

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (const route of routes) {
    let run = 0;
    const first = base;

    for (let i = 0; i < route.length; i++) {
      const p = route[i];
      const prev = route[Math.max(0, i - 1)];
      const next = route[Math.min(route.length - 1, i + 1)];
      tangent.subVectors(next, prev);
      tangent.y = 0;
      if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, 1);
      tangent.normalize();
      side.set(-tangent.z, 0, tangent.x);

      if (i > 0) run += p.distanceTo(prev);

      // Anchura irregular: un camino de siglos no tiene el mismo ancho en
      // todo su recorrido. Es lo que evita que se lea como una carretera.
      const half = width * 0.5 * (0.80 + noise.noise2(run * 0.06, seed) * 0.30);

      for (const s of [-1, 1]) {
        const x = p.x + side.x * half * s;
        const z = p.z + side.z * half * s;
        // La altura se muestrea en el borde, no en el eje: en una ladera
        // transversal, una cinta plana clavaría un canto en el suelo y
        // levantaría el otro medio metro.
        const y = field.meshHeight(x, z) + lift;
        positions.push(x, y, z);
        normals.push(0, 1, 0);
        uvs.push(s < 0 ? 0 : 1, run / tile);
      }

      if (i > 0) {
        const a = first + (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    base += route.length * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const tex = cobblePath({ seed: SEED + seed });
  const material = new THREE.MeshStandardMaterial({
    name: 'adoquinado',
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    alphaTest: 0.5,
    color: 0xc9c3b2,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    // La cinta va seis centímetros por encima del terreno, pero en una loma
    // vista de canto seis centímetros no bastan contra el z-fighting.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  applyToonShading(material, { ...TOON_PRESETS.paving, cloudShadow: 0.42, key: 'path' });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'caminos';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/**
 * Bordillo: cantos sueltos a los lados del camino, instanciados.
 *
 * No son continuos a propósito — se saltan tramos y cambian de tamaño. Una
 * hilera regular convierte el sendero en un bordillo de acera.
 */
export function createPathKerb(field, routes, {
  width = 3.4,
  seed = 77,
  spacing = 3.2,
} = {}) {
  const random = makeRandom(seed);
  const variants = [];
  for (let i = 0; i < 6; i++) {
    variants.push(createBoulder({ radius: 0.40, seed: SEED + 3400 + i, detail: 1 }));
  }

  const placements = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (const route of routes) {
    let run = 0;
    let nextAt = spacing;
    for (let i = 1; i < route.length; i++) {
      run += route[i].distanceTo(route[i - 1]);
      if (run < nextAt) continue;
      nextAt = run + spacing * (0.7 + random() * 0.9);

      tangent.subVectors(route[Math.min(route.length - 1, i + 1)], route[i - 1]);
      tangent.y = 0;
      if (tangent.lengthSq() < 1e-6) continue;
      tangent.normalize();
      side.set(-tangent.z, 0, tangent.x);

      for (const s of [-1, 1]) {
        if (random() < 0.34) continue;      // huecos: la hilera no es continua
        const off = width * 0.5 + 0.30 + random() * 0.45;
        const x = route[i].x + side.x * off * s;
        const z = route[i].z + side.z * off * s;
        // `meshHeight` y no `height`: el bordillo se apoya sobre la superficie
        // DIBUJADA, igual que la cinta que flanquea. Con la altura analítica, en
        // cuanto el terreno se curva el canto queda flotando unos decímetros
        // justo al lado del empedrado, que es donde más se nota.
        placements.push({ x, y: field.meshHeight(x, z) - 0.16, z, r: random() });
      }
    }
  }

  const meshes = [];
  const material = rockMaterial({ dark: true });
  const perVariant = Math.ceil(placements.length / variants.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (let v = 0; v < variants.length; v++) {
    const slice = placements.filter((_, i) => i % variants.length === v);
    if (!slice.length) continue;
    const inst = new THREE.InstancedMesh(variants[v], material, slice.length);
    slice.forEach((pl, i) => {
      pos.set(pl.x, pl.y, pl.z);
      euler.set(pl.r * 0.4, pl.r * 12.5, pl.r * 0.3);
      quat.setFromEuler(euler);
      scale.setScalar(0.55 + pl.r * 0.7);
      matrix.compose(pos, quat, scale);
      inst.setMatrixAt(i, matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.name = `bordillo-${v}`;
    meshes.push(inst);
  }

  const group = new THREE.Group();
  group.name = 'bordillos';
  for (const m of meshes) group.add(m);
  group.userData.count = placements.length;
  return group;
}
