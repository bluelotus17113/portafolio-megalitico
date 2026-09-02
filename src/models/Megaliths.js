/**
 * Estructuras megalíticas compuestas: trilitos, dólmenes y túmulos.
 *
 * Todas se montan con piezas de `StoneFactory`, así que comparten material y
 * lenguaje. Cada una devuelve un Group con la base en y = 0.
 */

import * as THREE from 'three';
import { createStone, createSlab, createBoulder, stoneMesh, rockMaterial } from './StoneFactory.js';
import { makeRandom } from '../utils/noise.js';

/**
 * Trilito: dos pies y un dintel. La puerta clásica de Stonehenge.
 */
export function createTrilithon({
  height = 8,
  gap = 3.4,
  postWidth = 1.9,
  postDepth = 1.4,
  lintelOverhang = 1.1,
  lintelHeight = 1.25,
  seed = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = 'trilithon';
  const random = makeRandom(seed);

  for (const side of [-1, 1]) {
    const geo = createStone({
      width: postWidth,
      height,
      depth: postDepth,
      seed: seed * 91 + (side > 0 ? 5 : 11),
      detail: 3,
      roundness: 0.24,
      erosion: 0.12,
      taper: 0.06,
      lean: side * 0.006,
    });
    const post = stoneMesh(geo, { name: 'trilithon-post' });
    post.position.set(side * (gap / 2 + postWidth / 2), 0, (random() - 0.5) * 0.25);
    post.rotation.y = (random() - 0.5) * 0.12;
    group.add(post);
  }

  const lintelWidth = gap + postWidth * 2 + lintelOverhang * 2;
  const lintel = stoneMesh(
    createSlab({
      width: lintelWidth,
      height: lintelHeight,
      depth: postDepth * 1.15,
      seed: seed * 91 + 23,
      erosion: 0.075,
    }),
    { name: 'trilithon-lintel' }
  );
  // Se apoya con una décima de holgura: siglos de asiento.
  lintel.position.set((random() - 0.5) * 0.18, height * 0.97, (random() - 0.5) * 0.2);
  lintel.rotation.y = (random() - 0.5) * 0.05;
  lintel.rotation.z = (random() - 0.5) * 0.018;
  group.add(lintel);

  group.userData.clearHeight = height;
  return group;
}

/**
 * Dolmen: tres o cuatro ortostatos y una tapa inclinada.
 */
export function createDolmen({
  height = 3.4,
  spread = 2.9,
  capWidth = 7.2,
  capDepth = 5.4,
  capThickness = 1.15,
  legs = 4,
  seed = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = 'dolmen';
  const random = makeRandom(seed);

  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.35;
    const h = height * (0.88 + random() * 0.24);
    const geo = createStone({
      width: 1.5 + random() * 0.5,
      height: h,
      depth: 1.1 + random() * 0.4,
      seed: seed * 77 + i,
      // Malla más fina y menos relieve que un menhir: la pata mide metro y
      // medio de fondo, así que la amplitud que en una piedra de tres metros
      // es un paño, aquí es un bollo.
      detail: 4,
      roundness: 0.24,
      erosion: 0.085,
      taper: 0.07,
      lean: (random() - 0.5) * 0.05,
    });
    const leg = stoneMesh(geo, { name: 'dolmen-leg' });
    leg.position.set(Math.cos(a) * spread, 0, Math.sin(a) * spread);
    leg.rotation.y = a + (random() - 0.5) * 0.3;
    group.add(leg);
  }

  const cap = stoneMesh(
    createSlab({
      width: capWidth,
      height: capThickness,
      depth: capDepth,
      seed: seed * 77 + 41,
      erosion: 0.095,
    }),
    { name: 'dolmen-cap' }
  );
  cap.position.set(0, height * 0.94, 0);
  cap.rotation.y = random() * 0.4;
  // Inclinación característica: la tapa nunca queda a nivel.
  cap.rotation.z = -0.075 - random() * 0.05;
  cap.rotation.x = (random() - 0.5) * 0.05;
  group.add(cap);

  group.userData.chamberHeight = height * 0.9;
  return group;
}

/**
 * Túmulo: montón cónico de piedras. Sirve de hito y de relleno del paisaje.
 */
export function createCairn({ radius = 1.6, height = 2.2, count = 26, seed = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'cairn';
  const random = makeRandom(seed);
  const mat = rockMaterial({ dark: true });
  const geos = [];
  for (let i = 0; i < 6; i++) geos.push(createBoulder({ radius: 0.45, seed: seed * 13 + i, detail: 1 }));

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const layerR = radius * (1 - t * 0.85);
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * layerR;
    const mesh = new THREE.Mesh(geos[i % geos.length], mat);
    mesh.position.set(Math.cos(a) * r, t * height, Math.sin(a) * r);
    mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    mesh.scale.setScalar((0.7 + random() * 0.6) * (1 - t * 0.35));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.height = height;
  return group;
}

/**
 * Cuenco de ofrendas: un bloque bajo con el centro rebajado. Lo usa el altar.
 */
export function createBasin({ radius = 1.5, height = 0.9, seed = 1 } = {}) {
  const group = new THREE.Group();
  const outer = stoneMesh(
    createStone({
      width: radius * 2,
      height,
      depth: radius * 2,
      seed: seed * 5 + 3,
      detail: 3,
      roundness: 0.62,
      erosion: 0.09,
      taper: -0.12,
    }),
    { name: 'basin' }
  );
  group.add(outer);

  // Hueco: un cilindro oscuro hundido. Con blending sale más limpio que
  // una resta booleana, y desde arriba no se distingue.
  const hollow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.45, height * 0.55, 28, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x1a1712, roughness: 1, metalness: 0 })
  );
  hollow.position.y = height * 0.82;
  hollow.receiveShadow = true;
  group.add(hollow);

  group.userData.rimHeight = height;
  group.userData.hollowRadius = radius * 0.55;
  return group;
}
