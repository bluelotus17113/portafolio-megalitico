/**
 * Árboles procedurales.
 *
 * Tres especies: un **roble** bajo y nudoso, un **fresno** alto y esbelto con
 * la hoja amarilleando, y un **carballo** — el roble de la foto de referencia,
 * con sus proporciones medidas en píxeles sobre ella.
 *
 * La copa no es una bola: se reparte en lóbulos desiguales asignando cada
 * punta de rama a su lóbulo más cercano, y el amarillo de otoño se indexa por
 * la distancia radial dentro del lóbulo. Las dos cosas salen de medir la
 * referencia, no de ajustar a ojo.
 *
 * Un árbol son dos mallas separadas porque necesitan materiales distintos:
 *   - `trunk`: tubos a lo largo del esqueleto de ramas, con corteza PBR.
 *   - `canopy`: tarjetas de hojarasca recortadas con `alphaTest`.
 *
 * Las normales de la copa NO son las de cada tarjeta, sino la dirección desde
 * el centro de la copa hacia el racimo. Es el truco de siempre para follaje:
 * con la normal real, cada tarjeta se ilumina como un cartel plano y la copa
 * se ve como un montón de recortes; con la normal esférica se ilumina como
 * una masa redonda, que es lo que el ojo espera.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRandom, clamp, lerp } from '../utils/noise.js';
import { bark, leafCluster } from '../utils/textures.js';
import { registerClock } from '../vfx/materials.js';
import { applyToonShading, tone, TOON_PRESETS } from '../vfx/toon.js';
import { SEED } from '../config.js';

/**
 * Perfiles de especie. Todo lo que distingue un árbol de otro está aquí.
 */
export const SPECIES = {
  /** Roble: tronco corto y grueso que se abre pronto en brazos pesados. */
  roble: {
    height: [10.5, 13.5],
    trunkRadius: 0.46,        // grosor relativo a la altura
    trunkShare: 0.42,         // qué parte de la altura es tronco antes del horcajo
    trunkSegments: 7,
    maxDepth: 3,
    laterals: [3, 2, 1],      // ramas a lo largo del eje, por nivel
    forkAtTip: [3, 2, 2],     // en cuántas se abre al final, por nivel
    branchAngle: 0.88,        // separación respecto al eje madre, en radianes
    lengthFalloff: 0.73,
    radiusFalloff: 0.54,
    droop: -0.035,            // < 0 = las puntas ceden hacia abajo
    curl: 0.26,               // serpenteo
    firstBranchAt: 0.34,
    roots: 7,
    rootLength: 0.20,
    canopyCards: 340,
    cardSize: [1.5, 2.5],
    canopyLift: 0.02,
    // Copa en tres masas desiguales con hueco entre ellas.
    canopyLobes: 3,
    lobeRadiusRatios: [1.0, 0.78, 0.62],
    lobeAutumnBias: [0.35, 1.0, 0.85],
    crownSpread: 1.18,
    autumn: 0.20,
    leafTextureAutumn: 0.10,
    leafShape: 'lobed',
    leafSeed: 71,
    leaves: 150,
  },
  /** Fresno: guía central marcada, copa alta y estrecha, hoja amarilleando. */
  fresno: {
    height: [12, 15.5],
    trunkRadius: 0.26,
    trunkShare: 0.60,
    trunkSegments: 6,
    maxDepth: 3,
    laterals: [3, 2, 1],
    forkAtTip: [2, 2, 2],
    branchAngle: 0.52,
    lengthFalloff: 0.62,
    radiusFalloff: 0.56,
    droop: 0.012,             // > 0 = las ramas siguen subiendo
    curl: 0.14,
    firstBranchAt: 0.48,
    roots: 4,
    rootLength: 0.10,
    canopyCards: 280,
    cardSize: [1.2, 2.1],
    canopyLift: 0.06,
    // El fresno es más columnar: dos lóbulos y poco ensanchamiento.
    canopyLobes: 2,
    lobeRadiusRatios: [1.0, 0.72],
    lobeAutumnBias: [0.6, 1.0],
    crownSpread: 1.0,
    autumn: 0.40,
    leafTextureAutumn: 0.14,
    leafShape: 'pinnate',
    leafSeed: 97,
    leaves: 110,
  },

  /**
   * Carballo: el roble de la imagen de referencia, medido.
   *
   * Sale del análisis por capas que hizo el pipeline de img2threejs sobre la
   * foto. Las tres cifras que lo definen están medidas en píxeles sobre ella:
   * copa 1.17 veces más ancha que alta, tronco 0.35 de la altura antes de la
   * primera horquilla, y raíces del 0.25 de la altura reptando sobre la piedra.
   */
  carballo: {
    height: [10.5, 14],
    trunkRadius: 0.52,
    trunkShare: 0.35,        // medido: la horquilla está muy baja
    trunkSegments: 8,
    maxDepth: 3,
    laterals: [3, 2, 1],
    forkAtTip: [3, 2, 2],
    branchAngle: 1.02,       // brazos muy abiertos: es lo que da la copa ancha
    lengthFalloff: 0.78,
    radiusFalloff: 0.52,
    droop: -0.05,
    curl: 0.34,              // más nudoso que el roble corriente
    firstBranchAt: 0.30,
    roots: 9,
    rootLength: 0.25,        // medido: sogas largas sobre la roca
    canopyCards: 360,
    cardSize: [1.5, 2.6],
    canopyLift: 0.0,
    canopyLobes: 3,
    lobeRadiusRatios: [1.0, 0.80, 0.64],
    // El lóbulo lateral es el que concentra el amarillo en la referencia.
    lobeAutumnBias: [0.30, 1.15, 0.90],
    crownSpread: 1.28,       // ajustado midiendo hasta rondar el 1.17 medido
    autumn: 0.30,
    leafTextureAutumn: 0.10,
    leafShape: 'lobed',
    leafSeed: 143,
    leaves: 160,
  },

  /**
   * Arbusto de hoja: mata redondeada de varios tallos, la que rellena claros
   * y bordes de sendero.
   */
  arbusto: {
    height: [1.6, 2.8],
    trunkRadius: 0.18,
    trunkShare: 0.52,
    trunkSegments: 5,
    maxDepth: 2,
    ramillaDesde: 1,   // mata pequeña: todo lo que no sea el tallo es palillo
    laterals: [2, 1],
    forkAtTip: [3, 2],
    branchAngle: 0.92,
    lengthFalloff: 0.66,
    radiusFalloff: 0.50,
    droop: -0.02,
    curl: 0.34,
    firstBranchAt: 0.24,
    stems: 4,                // sin tronco: cuatro tallos desde el suelo
    roots: 0,
    rootLength: 0,
    canopyCards: 150,
    cardSize: [0.60, 1.05],
    canopyLift: 0.0,
    canopyLobes: 2,
    lobeRadiusRatios: [1.0, 0.80],
    lobeAutumnBias: [0.5, 1.0],
    crownSpread: 1.15,
    autumn: 0.22,
    leafTextureAutumn: 0.12,
    leafShape: 'lobed',
    leafSeed: 311,
    leaves: 140,
  },

  /**
   * Helecho: roseta de frondas arqueadas, sin tallo leñoso a la vista. Va al
   * pie de los árboles y al abrigo de las piedras, que es donde hay sombra.
   */
  helecho: {
    height: [0.9, 1.6],
    trunkRadius: 0.08,       // el raquis casi no se ve bajo la fronda
    trunkShare: 0.72,
    trunkSegments: 4,
    maxDepth: 1,             // sin ramificación: cada tallo es una fronda
    laterals: [0],
    forkAtTip: [1],
    branchAngle: 0.30,
    lengthFalloff: 0.55,
    radiusFalloff: 0.30,
    droop: 0.16,             // la fronda se arquea al alejarse del centro
    curl: 0.10,
    firstBranchAt: 0.30,
    stems: 7,                // roseta de frondas desde el suelo
    roots: 0,
    rootLength: 0,
    canopyCards: 84,
    cardSize: [0.42, 0.72],
    canopyLift: 0.0,
    canopyLobes: 1,
    lobeRadiusRatios: [1.0],
    lobeAutumnBias: [1.0],
    crownSpread: 1.5,        // se abre mucho más de lo que sube
    // El helecho tampoco amarillea: verde entero, sin rampa.
    tintMode: 'none',
    autumn: 0,
    leafTextureAutumn: 0.08,
    leafShape: 'pinnate',
    leafSeed: 401,
    leaves: 120,
  },

  /**
   * Brezo: mata baja y apretada de hoja acicular con la flor violácea del
   * brezal atlántico. Va a ras de suelo y rompe el prado liso.
   */
  brezo: {
    height: [0.7, 1.25],
    trunkRadius: 0.13,
    trunkShare: 0.55,
    trunkSegments: 4,
    maxDepth: 2,
    ramillaDesde: 1,   // mata pequeña: todo lo que no sea el tallo es palillo
    laterals: [2, 1],
    forkAtTip: [3, 2],
    branchAngle: 0.78,
    lengthFalloff: 0.60,
    radiusFalloff: 0.48,
    droop: 0.01,
    curl: 0.40,
    firstBranchAt: 0.20,
    stems: 6,
    roots: 0,
    rootLength: 0,
    canopyCards: 120,
    cardSize: [0.30, 0.52],
    canopyLift: 0.0,
    canopyLobes: 1,
    lobeRadiusRatios: [1.0],
    lobeAutumnBias: [1.0],
    crownSpread: 1.25,
    // Sin rampa de otoño: el brezo no amarillea, y aplicársela lo apagaba a
    // casi negro. El color lo pone entero la textura.
    tintMode: 'none',
    autumn: 0,
    // Solo florece la punta. Medido con `tools/leaf-texture-preview.html`:
    // a 0.20 la flor ocupaba el 27 % de los píxeles opacos y la mata se leía
    // rosa entera. El objetivo es rondar el 10 %.
    leafTextureAutumn: 0.085,
    leafShape: 'needle',
    flowerHue: 305,          // violeta de brezo en flor
    leafSeed: 337,
    leaves: 260,             // agujas más apretadas: el verde tiene que mandar
  },
};

const _up = new THREE.Vector3(0, 1, 0);

const _axisA = new THREE.Vector3(0, 1, 0);
const _axisB = new THREE.Vector3(1, 0, 0);

/**
 * Dirección de una rama hija: se inclina `angle` respecto a la madre y luego
 * gira `around` alrededor de ella.
 *
 * Hay que hacerlo con rotaciones sobre la madre, no interpolando hacia un
 * vector horizontal fijo: interpolando, todas las hijas se escoran hacia el
 * mismo lado y el árbol crece torcido.
 */
function childDirection(parentDir, angle, around) {
  const reference = Math.abs(parentDir.y) < 0.92 ? _axisA : _axisB;
  const perp = new THREE.Vector3().crossVectors(parentDir, reference).normalize();
  return parentDir.clone().applyAxisAngle(perp, angle).applyAxisAngle(parentDir, around).normalize();
}

/**
 * Hace crecer el esqueleto.
 *
 * Cada rama es un eje que serpentea, suelta laterales a lo largo de su
 * recorrido y se bifurca al final. Ramificar solo en la punta daba escobas;
 * hacerlo también a lo largo del eje es lo que produce la silueta llena.
 */
function growSkeleton(profile, random, height) {
  const branches = [];
  const leafPoints = [];
  const baseRadius = profile.trunkRadius * Math.pow(height, 0.62) * 0.30;
  // Ángulo áureo: reparte las laterales sin que se alineen entre pisos.
  const GOLDEN = 2.399963;
  let spiral = random() * Math.PI * 2;

  const grow = (origin, direction, length, radius, depth) => {
    const points = [origin.clone()];
    const p = origin.clone();
    const d = direction.clone().normalize();
    const steps = Math.max(4, Math.round(3 + length * 0.55));
    const curl = profile.curl * (1 + depth * 0.35);

    for (let i = 0; i < steps; i++) {
      d.x += (random() - 0.5) * curl * 0.35;
      d.z += (random() - 0.5) * curl * 0.35;
      // Gravedad: las ramas de orden alto ceden a su propio peso.
      d.y += profile.droop * (depth + 1) * 0.35;
      d.normalize();
      p.addScaledVector(d, length / steps);
      points.push(p.clone());
    }

    const r1 = radius * (depth >= profile.maxDepth ? 0.14 : profile.radiusFalloff);
    branches.push({ points, r0: radius, r1, depth });

    // Las ramas finales son las que llevan hoja, y también el último tercio
    // de las penúltimas: así la copa tiene fondo y no solo cáscara.
    if (depth >= profile.maxDepth - 1) {
      const from = depth >= profile.maxDepth ? 0.25 : 0.62;
      for (let i = 0; i < points.length; i++) {
        if (i / (points.length - 1) < from) continue;
        leafPoints.push(points[i].clone());
      }
    }

    if (depth >= profile.maxDepth) return;

    const childLength = () => length * profile.lengthFalloff * (0.82 + random() * 0.36);
    const childRadius = radius * profile.radiusFalloff;

    // Laterales repartidas a lo largo del eje.
    const laterals = profile.laterals[Math.min(depth, profile.laterals.length - 1)];
    for (let k = 0; k < laterals; k++) {
      const t = profile.firstBranchAt + (1 - profile.firstBranchAt) * ((k + 0.35 + random() * 0.3) / laterals);
      const index = clamp(Math.round(t * (points.length - 1)), 1, points.length - 2);
      const at = points[index];
      const tangent = points[index + 1].clone().sub(points[index - 1]).normalize();
      spiral += GOLDEN;
      const dir = childDirection(tangent, profile.branchAngle * (0.8 + random() * 0.4), spiral);
      grow(at.clone(), dir, childLength() * 0.82, childRadius * 0.85, depth + 1);
    }

    // Bifurcación terminal: el eje se reparte en varias ramas.
    const forks = profile.forkAtTip[Math.min(depth, profile.forkAtTip.length - 1)];
    for (let k = 0; k < forks; k++) {
      spiral += GOLDEN;
      const angle = profile.branchAngle * (k === 0 ? 0.35 : 0.9) * (0.8 + random() * 0.4);
      const dir = childDirection(d, angle, spiral);
      grow(p.clone(), dir, childLength(), childRadius, depth + 1);
    }
  };

  const trunkLength = height * profile.trunkShare;
  const stems = profile.stems ?? 1;
  if (stems === 1) {
    grow(new THREE.Vector3(0, 0, 0), _up.clone(), trunkLength, baseRadius, 0);
  } else {
    // Un arbusto no tiene tronco: salen varios tallos del suelo abriéndose.
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + random() * 0.6;
      const tilt = 0.22 + random() * 0.30;
      const dir = new THREE.Vector3(Math.cos(a) * tilt, 1, Math.sin(a) * tilt).normalize();
      const base = new THREE.Vector3(Math.cos(a) * baseRadius * 1.4, 0, Math.sin(a) * baseRadius * 1.4);
      grow(base, dir, trunkLength * (0.8 + random() * 0.45), baseRadius * 0.8, 0);
    }
  }

  // Raíces: salen de la base, se hunden y luego se aplanan reptando.
  for (let i = 0; i < profile.roots; i++) {
    const a = (i / profile.roots) * Math.PI * 2 + random() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), -0.30 - random() * 0.25, Math.sin(a)).normalize();
    const points = [new THREE.Vector3(0, baseRadius * 1.1, 0)];
    const p = points[0].clone();
    for (let s = 0; s < 4; s++) {
      dir.y += 0.11;
      dir.normalize();
      p.addScaledVector(dir, (height * profile.rootLength) / 4);
      points.push(p.clone());
    }
    branches.push({ points, r0: baseRadius * 0.66, r1: baseRadius * 0.14, depth: 0 });
  }

  return { branches, leafPoints, baseRadius };
}

/**
 * Tubo cónico a lo largo de una polilínea.
 *
 * `densidad` son los tramos de tubo por punto de la polilínea: dos dibujan la
 * curva suave que necesita un brazo grueso, uno basta para una ramilla que
 * nunca ocupa más de unos píxeles.
 */
function branchGeometry(branch, radialSegments, densidad = 2) {
  const curve = new THREE.CatmullRomCurve3(branch.points, false, 'centripetal', 0.4);
  const tubular = Math.max(3, Math.round(branch.points.length * densidad));
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radialSegments, false);

  // TubeGeometry sale con radio constante; el estrechamiento se hace a mano.
  //
  // OJO con el eje: en TubeGeometry `uv.x` recorre el tubo a lo largo y
  // `uv.y` da la vuelta alrededor. Usando uv.y como parámetro longitudinal
  // el radio se escala según el ángulo y el tronco queda aplastado en una
  // cinta plana.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const t = clamp(uv.getX(i), 0, 1);
    // Ensanchamiento en la base: el arranque del tronco es más grueso.
    const flare = 1 + Math.pow(1 - t, 6) * 0.9;
    const r = lerp(branch.r0, branch.r1, t) * flare;
    curve.getPointAt(t, centre);
    v.fromBufferAttribute(pos, i).sub(centre).multiplyScalar(r).add(centre);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // La corteza se repite a lo largo del eje; si no, se estira sin fin.
  const length = curve.getLength();
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.max(1, length * 0.24), uv.getY(i) * Math.max(1, branch.r0 * 7));
  }
  return geo;
}

/**
 * Copa: tarjetas de hojarasca alrededor de las puntas de las ramas.
 */
/**
 * Elige centros de lóbulo bien separados entre las puntas de rama.
 *
 * Muestreo del punto más lejano: se arranca del punto más alto y cada lóbulo
 * siguiente es el que más lejos queda de los ya elegidos. Repartiéndolos al
 * azar salían solapados y la copa volvía a leerse como una masa única.
 */
function pickLobeCentres(leafPoints, count, random) {
  const centres = [];
  let seed = leafPoints[0];
  for (const p of leafPoints) if (p.y > seed.y) seed = p;
  centres.push(seed.clone());

  while (centres.length < count) {
    let best = null;
    let bestDistance = -1;
    // Se examina una muestra, no los miles de puntos: el resultado es el mismo
    // y evita un bucle cuadrático en árboles densos.
    for (let i = 0; i < 220; i++) {
      const candidate = leafPoints[Math.floor(random() * leafPoints.length)];
      let nearest = Infinity;
      for (const c of centres) nearest = Math.min(nearest, candidate.distanceToSquared(c));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    centres.push(best.clone());
  }
  return centres;
}

function canopyGeometry(profile, random, leafPoints, height) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const depths = [];
  const indices = [];

  if (!leafPoints.length) leafPoints = [new THREE.Vector3(0, height * 0.75, 0)];

  // Centro de la copa: sirve para las normales esféricas.
  const centre = new THREE.Vector3();
  for (const p of leafPoints) centre.add(p);
  centre.divideScalar(leafPoints.length);
  centre.y += height * profile.canopyLift;

  // Ensanchamiento de copa: separa las puntas del eje del tronco hasta dar la
  // relación ancho/alto medida en la referencia. Es el mando directo sobre esa
  // proporción; tocando ángulos de rama solo se llega de rebote.
  const spread = profile.crownSpread ?? 1;
  if (spread !== 1) {
    for (const p of leafPoints) {
      p.x = centre.x + (p.x - centre.x) * spread;
      p.z = centre.z + (p.z - centre.z) * spread;
    }
  }

  // ── Lóbulos ──────────────────────────────────────────────────────────
  // La copa de la referencia son tres masas solapadas de tamaño desigual con
  // hueco entre ellas, no una bola. Se reparten las tarjetas por lóbulo y se
  // descartan las que caen fuera de todos: ese descarte ES el hueco.
  const lobeCount = profile.canopyLobes ?? 1;
  const ratios = profile.lobeRadiusRatios ?? [1];
  const autumnBias = profile.lobeAutumnBias ?? [1];
  const centres = pickLobeCentres(leafPoints, lobeCount, random);

  const lobes = centres.map((c, i) => ({
    centre: c,
    autumn: autumnBias[i] ?? autumnBias[autumnBias.length - 1],
    // El peso reparte tarjetas: un lóbulo del doble de radio se lleva el
    // cuádruple de hoja, no el doble.
    weight: Math.pow(ratios[i] ?? ratios[ratios.length - 1], 2),
    points: [],
    radius: 1,
  }));
  const totalWeight = lobes.reduce((sum, l) => sum + l.weight, 0);

  // Reparto Voronoi: cada punta de rama va al lóbulo más cercano, sin excepción.
  //
  // Antes se recortaba por radio y las ramas que caían fuera de todo lóbulo se
  // quedaban desnudas: el árbol salía con pinchos oscuros asomando por todas
  // partes. El hueco entre masas tiene que venir de que la densidad de hoja
  // cae hacia el borde, no de dejar rama sin cubrir.
  for (const p of leafPoints) {
    let best = lobes[0];
    let bestDistance = Infinity;
    for (const lobe of lobes) {
      const d = p.distanceToSquared(lobe.centre);
      if (d < bestDistance) {
        bestDistance = d;
        best = lobe;
      }
    }
    best.points.push(p);
  }
  // Extensión de la copa. Es la escala natural para dispersar las tarjetas:
  // proporcional a la planta, sea un carballo de catorce metros o un brezo de
  // uno.
  let extent = 0.1;
  for (const p of leafPoints) extent = Math.max(extent, p.distanceTo(centre));

  for (const lobe of lobes) {
    if (!lobe.points.length) lobe.points.push(lobe.centre.clone());
    // El radio de cada lóbulo sale de sus propios puntos: es la escala con la
    // que se normaliza el gradiente de otoño.
    let max = 1e-4;
    for (const p of lobe.points) max = Math.max(max, p.distanceTo(lobe.centre));
    lobe.radius = max;
  }

  // ── Gradiente de otoño ───────────────────────────────────────────────
  // Paradas medidas en la referencia, indexadas por distancia radial al centro
  // del lóbulo. Se aplican como color de vértice multiplicando la textura, así
  // que se guardan como razón respecto al verde base y no como color absoluto.
  //
  // OJO: esta rampa solo es NEUTRA en su punto medio (t = 0.5). Por debajo
  // oscurece. Aplicarla a una especie que no amarillea la apaga: el brezo
  // acabó al 66-86 % de una textura que ya partía oscura, o sea casi negro.
  // Por eso existe `tintMode`.
  const AUTUMN_STOPS = [
    [0.0, 0x2e4419],
    [0.5, 0x4c6b2a],
    [0.85, 0x8fa33a],
    [1.0, 0xc7b93a],
  ].map(([t, hex]) => [t, new THREE.Color(hex)]);
  const NEUTRAL = new THREE.Color(1, 1, 1);
  const useAutumnTint = (profile.tintMode ?? 'autumn') === 'autumn';
  const base = new THREE.Color(0x4c6b2a);
  const target = new THREE.Color();
  const tint = new THREE.Color();

  const autumnTint = (t, bias) => {
    const k = clamp(t * bias, 0, 1);
    let i = 0;
    while (i < AUTUMN_STOPS.length - 2 && k > AUTUMN_STOPS[i + 1][0]) i++;
    const [t0, c0] = AUTUMN_STOPS[i];
    const [t1, c1] = AUTUMN_STOPS[i + 1];
    const f = clamp((k - t0) / (t1 - t0), 0, 1);
    target.copy(c0).lerp(c1, f);
    tint.setRGB(
      clamp(target.r / Math.max(base.r, 1e-4), 0.45, 2.6),
      clamp(target.g / Math.max(base.g, 1e-4), 0.45, 2.6),
      clamp(target.b / Math.max(base.b, 1e-4), 0.45, 2.6)
    );
    return tint;
  };

  // `cardSize` va en unidades de mundo, no relativo.
  //
  // Antes se multiplicaba por `height / 13`, una normalización pensada para
  // árboles de trece metros. Al heredarla los arbustos, las tarjetas de un
  // brezo de un metro salían de tres centímetros: solo se veían los tallos,
  // y la mata parecía un manojo de palitos secos.
  const [minSize, maxSize] = profile.cardSize;
  const jitterScale = extent * 0.30;
  let vertexCount = 0;

  for (let i = 0; i < profile.canopyCards; i++) {
    // Lóbulo por peso, y dentro de él un punto de rama real.
    let pick = random() * totalWeight;
    let lobe = lobes[0];
    for (const l of lobes) {
      pick -= l.weight;
      if (pick <= 0) { lobe = l; break; }
    }

    // Sesgo al núcleo del lóbulo: de dos candidatos se queda el más cercano al
    // centro. Así la masa es densa por dentro y se deshilacha en el borde,
    // que es de donde salen los huecos por los que se ve la rama y el cielo.
    const a = lobe.points[Math.floor(random() * lobe.points.length)];
    const b = lobe.points[Math.floor(random() * lobe.points.length)];
    const anchor =
      a.distanceToSquared(lobe.centre) <= b.distanceToSquared(lobe.centre) ? a : b;
    const jitter = new THREE.Vector3(
      (random() - 0.5) * 1.0,
      (random() - 0.5) * 0.8,
      (random() - 0.5) * 1.0
    ).multiplyScalar(jitterScale);
    const p = anchor.clone().add(jitter);

    // Distancia radial al centro de SU lóbulo: es lo que indexa el amarillo.
    const radial = clamp(p.distanceTo(lobe.centre) / Math.max(lobe.radius, 1e-4), 0, 1);
    const cardTint = useAutumnTint
      ? autumnTint(radial, lobe.autumn * (profile.autumn ?? 0.3) * 3.2)
      : NEUTRAL;

    const size = lerp(minSize, maxSize, random());

    // Orientación libre: la tarjeta gira sobre sí misma y se inclina.
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (random() - 0.5) * 1.5,
        random() * Math.PI * 2,
        (random() - 0.5) * 1.5
      )
    );
    const ex = new THREE.Vector3(size * 0.5, 0, 0).applyQuaternion(quat);
    const ey = new THREE.Vector3(0, size * 0.5, 0).applyQuaternion(quat);

    // Normal esférica, no la de la tarjeta.
    const n = p.clone().sub(centre).normalize();
    if (n.lengthSq() < 0.01) n.set(0, 1, 0);
    // Un poco hacia arriba: la copa recibe la luz por arriba.
    n.lerp(_up, 0.30).normalize();

    // Un cuadrante distinto del atlas por tarjeta.
    const cell = Math.floor(random() * 4);
    const u0 = (cell % 2) * 0.5;
    const v0 = Math.floor(cell / 2) * 0.5;

    const corners = [
      p.clone().sub(ex).sub(ey),
      p.clone().add(ex).sub(ey),
      p.clone().add(ex).add(ey),
      p.clone().sub(ex).add(ey),
    ];
    const cornerUv = [
      [u0, v0 + 0.5],
      [u0 + 0.5, v0 + 0.5],
      [u0 + 0.5, v0],
      [u0, v0],
    ];

    // Profundidad dentro de la masa: 1 en el corazón del lóbulo, 0 en la
    // silueta. Sustituye al nodo de oclusión ambiental que usa la referencia,
    // que a esa distancia (2.5 m) solo mide una cosa: cuánta hoja hay
    // alrededor. Es lo que da la copa con el borde encendido y el interior
    // apagado en vez de una bola de color uniforme.
    const depth = 1 - radial;

    for (let c = 0; c < 4; c++) {
      positions.push(corners[c].x, corners[c].y, corners[c].z);
      normals.push(n.x, n.y, n.z);
      uvs.push(cornerUv[c][0], cornerUv[c][1]);
      colors.push(cardTint.r, cardTint.g, cardTint.b);
      depths.push(depth);
    }
    indices.push(
      vertexCount, vertexCount + 1, vertexCount + 2,
      vertexCount, vertexCount + 2, vertexCount + 3
    );
    vertexCount += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Genera un árbol completo.
 * @param {'roble'|'fresno'} species
 * @returns {{trunk: THREE.BufferGeometry, canopy: THREE.BufferGeometry, height: number, radius: number}}
 */
export function createTree({ species = 'roble', seed = 1 } = {}) {
  const profile = SPECIES[species];
  const random = makeRandom(seed);
  const height = lerp(profile.height[0], profile.height[1], random());

  const { branches, leafPoints } = growSkeleton(profile, random, height);

  // Detalle según la profundidad de la rama.
  //
  // El tronco y los brazos que salen de él se ven de cerca —al visitante no le
  // impide nada pararse debajo de un carballo—, así que ahí no se toca nada.
  // Del segundo nivel para dentro son ramillas de cinco centímetros de grueso
  // que en el peor encuadre ocupan unos pocos píxeles: darles ocho caras y una
  // curva suave es gastar triángulos en algo que nadie puede ver.
  // A partir de `ramillaDesde` una rama es una ramilla: tres caras y sin
  // curva. En un árbol eso es el segundo nivel; en una mata de brezo de un
  // metro, el primero — sus «ramas» ya son palillos de un centímetro.
  const ramillaDesde = profile.ramillaDesde ?? 2;
  const parts = branches.map((b) => {
    if (b.depth >= ramillaDesde) return branchGeometry(b, 3, 1);
    if (b.depth === 0) return branchGeometry(b, profile.trunkSegments);
    return branchGeometry(b, Math.max(3, profile.trunkSegments - 2));
  });
  const trunk = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  trunk.computeBoundingSphere();

  const canopy = canopyGeometry(profile, random, leafPoints, height);

  // Radio útil para separar unos árboles de otros al plantarlos.
  const radius = canopy.boundingSphere ? canopy.boundingSphere.radius * 0.55 : height * 0.3;

  return { trunk, canopy, height, radius, species };
}

// ─────────────────────────────────────────────────────────── materiales ──

let _barkMaterial = null;

/** Corteza compartida por todos los árboles. */
export function barkMaterial() {
  if (_barkMaterial) return _barkMaterial;
  const tex = bark({ seed: SEED + 61, repeat: 1, gnarled: 0.7 });
  const material = new THREE.MeshStandardMaterial({
    name: 'corteza',
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(1.3, 1.3),
    color: 0xa89a86,
    roughness: 0.96,
    metalness: 0,
    dithering: true,
  });
  applyToonShading(material, { ...TOON_PRESETS.bark, key: 'bark' });
  _barkMaterial = material;
  return material;
}

const _leafMaterials = new Map();

/**
 * Rampas de follaje, en sRGB.
 *
 * Salen de la ColorRamp.003 de `AnimeTree_GooEngine.blend`, la rampa de la cara
 * iluminada. Las demás especies son variaciones de tono sobre esa estructura,
 * no paletas independientes: lo que hace que un bosque se lea como pintado por
 * la misma mano es que todos los verdes sean de la misma familia.
 *
 * La banda oscura es un verde, no un azul. Antes se remataba por abajo con la
 * parada más oscura de la ColorRamp.004 (#17303d), pero en el .blend esa rampa
 * NO se mezcla con la otra: es la que pinta la mitad de la copa que da la
 * espalda al sol, y se elige con un gradiente en espacio de objeto. Metida como
 * escalón inferior de la rampa iluminada, cada masa de sombra dentro de la copa
 * salía casi negra y se leía como un agujero en vez de como hoja.
 *
 * `texMix` es cuánto pesa la textura de hojarasca frente al color pintado. En
 * la referencia pesa cero — la textura solo recorta. Aquí sube en el brezo
 * porque su flor vive en la textura y con el color plano desaparecería.
 */
const LEAF_TOON = {
  roble:   { shadow: 0x2c6a4c, mid: 0x3f8a49, light: 0x9fcb68, texMix: 0.42 },
  fresno:  { shadow: 0x2e6c4d, mid: 0x459050, light: 0xb4d477, texMix: 0.46 },
  carballo:{ shadow: 0x2b6547, mid: 0x428544, light: 0xa8c95e, texMix: 0.44 },
  arbusto: { shadow: 0x286245, mid: 0x387c46, light: 0x8dbc5c, texMix: 0.40 },
  helecho: { shadow: 0x2d6a4e, mid: 0x428d52, light: 0x9ecb6a, texMix: 0.38 },
  brezo:   { shadow: 0x365e48, mid: 0x4f8253, light: 0xaebd7d, texMix: 0.80 },
};

/**
 * Follaje: recorte por `alphaTest` (no transparencia) y viento propio.
 *
 * El `alphaTest` importa: con transparencia real habría que ordenar cientos
 * de tarjetas por profundidad cada frame y aun así se verían costuras al
 * cruzarse entre ellas.
 */
export function leafMaterial(species) {
  if (_leafMaterials.has(species)) return _leafMaterials.get(species);
  const profile = SPECIES[species];

  const material = new THREE.MeshStandardMaterial({
    name: 'hoja',
    map: leafCluster({
      seed: SEED + profile.leafSeed,
      // La textura lleva muy poco amarillo a propósito: el gradiente de otoño
      // lo pone el color de vértice según la posición radial dentro del lóbulo,
      // que es como se distribuye en la referencia. Horneándolo en la textura
      // salía repartido por igual por toda la copa.
      autumn: profile.leafTextureAutumn,
      shape: profile.leafShape,
      leaves: profile.leaves,
      flowerHue: profile.flowerHue ?? null,
    }),
    vertexColors: true,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    color: 0xffffff,
  });

  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() },
    uWindStrength: { value: 0.5 },
    uCanopyTop: { value: 18 },
  };
  material.userData.uniforms = uniforms;
  registerClock(uniforms);

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec2 uWindDir;
         uniform float uWindStrength;
         uniform float uCanopyTop;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // La fase sale de la posición de la instancia, así que cada árbol
           // ondea a su tiempo sin necesidad de un atributo extra.
           #ifdef USE_INSTANCING
             vec3 instWorld = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
           #else
             vec3 instWorld = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
           #endif
           float phase = dot( instWorld.xz, uWindDir ) * 0.028;
           float gust = sin( uTime * 0.62 - phase ) * 0.62 + sin( uTime * 1.45 - phase * 2.1 ) * 0.26;
           // Cuanto más arriba en la copa, más se mueve.
           float lever = pow( clamp( transformed.y / uCanopyTop, 0.0, 1.0 ), 1.7 );
           transformed.xz += uWindDir * gust * uWindStrength * lever;
           // Aleteo de la hoja suelta, mucho más rápido y corto.
           transformed += normal * sin( uTime * 3.4 + transformed.x * 2.2 + transformed.z * 1.9 ) * 0.09 * lever;
         }`
      );

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aDepth;
         varying float vLeafDepth;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLeafDepth = aDepth;`
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform vec2 uWindDir;`
    );
  };

  const palette = LEAF_TOON[species] ?? LEAF_TOON.roble;
  applyToonShading(material, {
    mode: 'replace',
    key: `leaf-${species}`,
    bands: 3,
    // Corte casi duro: en la referencia el follaje tiene mesetas largas de
    // color plano y el salto ocurre en una franja estrechísima.
    edge: 0.05,
    // Envolvente alto: la copa nunca se va a negro por el lado de la sombra,
    // se va al azul de la banda baja.
    wrap: 0.50,
    shadow: tone(palette.shadow),
    mid: tone(palette.mid),
    light: tone(palette.light),
    uniforms: {
      uLeafTexMix: { value: palette.texMix },
      uLeafTexGain: { value: 2.9 },
      uLeafCore: { value: 0.70 },
      uLeafTranslucency: { value: 0.32 },
    },
    extraFragment: `
      varying float vLeafDepth;
      uniform float uLeafTexMix;
      uniform float uLeafTexGain;
      uniform float uLeafCore;
      uniform float uLeafTranslucency;`,
    extraShade: `
      // Corazón de la copa apagado, borde encendido. Es lo que la referencia
      // saca de un nodo de oclusión ambiental de 2.5 m de radio, que dentro de
      // una masa de hoja no mide otra cosa que cuánta hoja hay alrededor.
      //
      // Baja el NIVEL de luz, no el color resultante. Multiplicando el color
      // se salía de la paleta: el interior de la copa acababa casi negro y se
      // leía como un agujero. Bajando el nivel, el núcleo cae en la banda de
      // sombra pintada — ese azul verdoso oscuro — y ahí se queda.
      toonT *= mix( 1.0, uLeafCore, vLeafDepth );`,
    extraFinal: `
      // La textura de hojarasca solo aporta dibujo y variación; el color sale
      // de la rampa. Viene en lineal y muy oscura, así que se lleva a un rango
      // perceptual antes de usarla como modulación alrededor de 1: si no,
      // habría que calibrar una ganancia distinta para cada atlas.
      vec3 leafTex = pow( max( diffuseColor.rgb, vec3( 0.0 ) ), vec3( 1.0 / 2.2 ) ) * uLeafTexGain;
      toonBase *= mix( vec3( 1.0 ), leafTex, uLeafTexMix );

      // Translucidez a contraluz: la hoja se enciende por dentro. Sin esto la
      // cara en sombra de la copa es una mancha plana y muerta.
      vec3 leafView = normalize( inverseTransformDirection( geometryViewDir, viewMatrix ) );
      float leafBack = clamp( -dot( normalize( uToonSun ), leafView ), 0.0, 1.0 );
      toonBase += uToonLight * pow( leafBack, 3.0 ) * uLeafTranslucency * ( 1.0 - vLeafDepth );`,
  });

  _leafMaterials.set(species, material);
  return material;
}
