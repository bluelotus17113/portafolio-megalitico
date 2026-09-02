/**
 * Vegetación del promontorio: arbolado y matorral.
 *
 * Dos capas con reglas distintas, porque no crecen en los mismos sitios:
 *
 *  - **Árboles.** Necesitan suelo hondo y resguardo, así que salen sobre todo
 *    tierra adentro y en las lomas, agrupados en bosquetes.
 *  - **Matorral.** Tojo y brezo aguantan el viento salino y llegan hasta el
 *    borde del acantilado. Es la capa que rellena el prado vacío y la que
 *    evita que la isla se lea como una alfombra verde lisa.
 *
 * Todo se planta con `InstancedMesh`: cientos de copias cuestan una veintena
 * de llamadas de dibujo.
 */

import * as THREE from 'three';
import { createTree, barkMaterial, leafMaterial, SPECIES } from '../models/Tree.js';
import { radialSprite } from '../utils/textures.js';
import { makeRandom, SimplexNoise, clamp, smoothstep } from '../utils/noise.js';
import { SECTIONS, SEED, WORLD, daisOuterRadius } from '../config.js';

/** Prototipos de árbol: tres especies, siete variantes. */
const TREE_PROTOTYPES = [
  { species: 'carballo', seed: SEED + 143 },
  { species: 'carballo', seed: SEED + 167 },
  { species: 'carballo', seed: SEED + 199 },
  { species: 'roble', seed: SEED + 101 },
  { species: 'roble', seed: SEED + 137 },
  { species: 'fresno', seed: SEED + 211 },
  { species: 'fresno', seed: SEED + 251 },
];

/** Prototipos de matorral: mata de hoja, brezo y helecho. */
const SHRUB_PROTOTYPES = [
  { species: 'arbusto', seed: SEED + 311 },
  { species: 'arbusto', seed: SEED + 331 },
  { species: 'arbusto', seed: SEED + 359 },
  { species: 'brezo', seed: SEED + 337 },
  { species: 'brezo', seed: SEED + 373 },
];

/**
 * El helecho va aparte porque no se reparte como el matorral: busca la sombra
 * y el abrigo, así que se siembra al pie de los árboles y de las piedras en
 * vez de por toda la isla.
 */
const FERN_PROTOTYPES = [
  { species: 'helecho', seed: SEED + 401 },
  { species: 'helecho', seed: SEED + 419 },
];

const TREE_SPACING = 11.5;
const SHRUB_SPACING = 3.4;

export class Forest {
  /**
   * @param {import('./Terrain.js').TerrainField} field
   * @param {object} opts
   * @param {Array<{x:number,z:number}>} opts.pathPoints  Eje del sendero de Trayectoria.
   * @param {Array<{x:number,z:number,radius:number}>} opts.keepOut  Vetos del arbolado.
   * @param {Array<{x:number,z:number,radius:number}>} opts.paveKeepOut  Enlosado.
   */
  constructor(field, {
    pathPoints = [],
    keepOut = [],
    paveKeepOut = [],
    trees = 150,
    pathTrees = 16,
    shrubs = 620,
    ferns = 260,
    seed = SEED + 4242,
  } = {}) {
    this.field = field;
    this.group = new THREE.Group();
    this.group.name = 'forest';

    this.random = makeRandom(seed);
    this.noise = new SimplexNoise(seed + 7);
    this.keepOut = keepOut;
    // El matorral solo respeta el enlosado: por lo demás crece donde quiere.
    this.paveKeepOut = paveKeepOut;

    this._trees = [];
    this._shrubs = [];
    this._ferns = [];

    const treeSpots = [
      ...this._plantTrees(trees),
      ...this._plantAlongPath(pathPoints, pathTrees),
    ];
    const shrubSpots = this._plantShrubs(shrubs);
    const fernSpots = this._plantFerns(treeSpots, ferns);

    this._build(TREE_PROTOTYPES, treeSpots, 'arbol', true);
    this._build(SHRUB_PROTOTYPES, shrubSpots, 'mata', false);
    this._build(FERN_PROTOTYPES, fernSpots, 'helecho', false);
    this._buildGroundShadows(treeSpots);

    this.count = treeSpots.length;
    this.shrubCount = shrubSpots.length;
    this.fernCount = fernSpots.length;
  }

  // ────────────────────────────────────────────────────────────── criterios

  _blockedByZones(x, z, zones) {
    // Al cuadrado: con los caminos en la lista son casi doscientos círculos
    // por candidato, y la raíz no cambia el resultado de la comparación.
    for (const zone of zones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz < zone.radius * zone.radius) return true;
    }
    return false;
  }

  _tooClose(x, z, placed, spacing) {
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < spacing) return true;
    }
    return false;
  }

  /** ¿Se puede plantar un árbol aquí? */
  _treeSuitable(x, z) {
    const h = this.field.height(x, z);
    // Ni en la playa ni en la franja que baña el mar: la sal no perdona.
    if (h < WORLD.seaLevel + 26) return false;
    // Ni en pendientes donde no agarraría la raíz.
    if (this.field.slope(x, z) > 0.40) return false;
    // Ni sobre la roca desnuda que el terreno ya pinta como piedra.
    if (this.field.rockiness(x, z) > 0.55) return false;
    if (this._blockedByZones(x, z, this.keepOut)) return false;
    return !this._tooClose(x, z, this._trees, TREE_SPACING);
  }

  /**
   * El matorral es mucho menos exigente: aguanta viento, sal y pendiente.
   * Solo respeta el enlosado y la roca viva.
   */
  _shrubSuitable(x, z) {
    const h = this.field.height(x, z);
    if (h < WORLD.seaLevel + 8) return false;
    if (this.field.slope(x, z) > 0.52) return false;
    if (this.field.rockiness(x, z) > 0.72) return false;
    if (this._blockedByZones(x, z, this.paveKeepOut)) return false;
    return !this._tooClose(x, z, this._shrubs, SHRUB_SPACING);
  }

  /**
   * Probabilidad de árbol. Sube tierra adentro y en alto, y el ruido de baja
   * frecuencia los agrupa en bosquetes en vez de espolvorearlos por igual.
   *
   * El umbral hacia el interior es holgado a propósito: con una puerta dura,
   * media isla se quedaba pelada y se leía como una alfombra vacía.
   */
  _treeDensity(x, z) {
    const angle = Math.atan2(z, x);
    const inland = smoothstep(-0.30, 0.80, Math.cos(angle - WORLD.inlandDirection));
    const h = this.field.height(x, z);
    const elevation = smoothstep(WORLD.plateau - 6, WORLD.plateau + 40, h);
    const grove = this.noise.fbm(x * 0.016, z * 0.016, 3.3, 3, 2.2, 0.55) * 0.5 + 0.5;
    return clamp((0.25 + inland * 0.75) * (0.30 + elevation * 0.70) * (grove * 1.7 - 0.35), 0, 1);
  }

  /** El matorral cubre toda la isla, y se espesa donde no hay árbol. */
  _shrubDensity(x, z) {
    const patch = this.noise.fbm(x * 0.030, z * 0.030, 51.7, 3, 2.3, 0.55) * 0.5 + 0.5;
    const h = this.field.height(x, z);
    // Más tupido en el borde expuesto: es donde el tojo gana al arbolado.
    const exposed = 1 - smoothstep(WORLD.plateau, WORLD.plateau + 46, h);
    return clamp((0.34 + exposed * 0.34) * (patch * 1.8 - 0.35), 0, 1);
  }

  // ────────────────────────────────────────────────────────────── plantado

  _plantTrees(target) {
    const spots = [];
    let guard = 0;
    while (spots.length < target && guard < target * 260) {
      guard++;
      const r = Math.sqrt(this.random()) * WORLD.radius * 0.97;
      const a = this.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.random() > this._treeDensity(x, z)) continue;
      if (!this._treeSuitable(x, z)) continue;
      spots.push(this._makeSpot(x, z, TREE_PROTOTYPES.length, this._trees, 0.88, 1.14));
    }
    return spots;
  }

  _plantShrubs(target) {
    const spots = [];
    let guard = 0;
    while (spots.length < target && guard < target * 90) {
      guard++;
      const r = Math.sqrt(this.random()) * WORLD.radius;
      const a = this.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.random() > this._shrubDensity(x, z)) continue;
      if (!this._shrubSuitable(x, z)) continue;
      spots.push(this._makeSpot(x, z, SHRUB_PROTOTYPES.length, this._shrubs, 0.7, 1.5));
    }
    return spots;
  }

  /**
   * Helechos al pie de los árboles.
   *
   * No se reparten por densidad como el matorral: se siembran en corro
   * alrededor de un tronco elegido al azar. Un helecho en mitad del prado
   * expuesto no tiene sentido — busca sombra y humedad, y ponerlo donde toca
   * es lo que hace que el pie del árbol deje de ser un plano vacío.
   */
  _plantFerns(treeSpots, target) {
    if (!treeSpots.length) return [];
    const spots = [];
    let guard = 0;
    while (spots.length < target && guard < target * 60) {
      guard++;
      const host = treeSpots[Math.floor(this.random() * treeSpots.length)];
      // En el ruedo del árbol: ni pegado al tronco ni fuera de su sombra.
      const a = this.random() * Math.PI * 2;
      const r = 2.2 + this.random() * 4.5;
      const x = host.x + Math.cos(a) * r;
      const z = host.z + Math.sin(a) * r;

      if (this.field.slope(x, z) > 0.50) continue;
      if (this.field.rockiness(x, z) > 0.80) continue;
      if (this._blockedByZones(x, z, this.paveKeepOut)) continue;
      if (this._tooClose(x, z, this._ferns, 1.9)) continue;

      spots.push(this._makeSpot(x, z, FERN_PROTOTYPES.length, this._ferns, 0.75, 1.35));
    }
    return spots;
  }

  /**
   * Hilera irregular a ambos lados del sendero. No es una alameda: hay huecos
   * y la distancia al eje varía, para que no parezca plantado por un jardinero.
   */
  _plantAlongPath(pathPoints, target) {
    if (!pathPoints.length) return [];
    const spots = [];
    let guard = 0;
    while (spots.length < target && guard < target * 120) {
      guard++;
      const i = Math.floor(this.random() * (pathPoints.length - 1));
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      const t = this.random();
      const cx = a.x + (b.x - a.x) * t;
      const cz = a.z + (b.z - a.z) * t;

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const side = this.random() > 0.5 ? 1 : -1;
      // Bien apartados del eje: flanquean el sendero, no lo tapan.
      const offset = side * (12 + this.random() * 9);
      const x = cx + (-dz / len) * offset;
      const z = cz + (dx / len) * offset;

      if (!this._treeSuitable(x, z)) continue;
      spots.push(this._makeSpot(x, z, TREE_PROTOTYPES.length, this._trees, 0.88, 1.14));
    }
    return spots;
  }

  /**
   * @param {number} minScale El rango de escala de los árboles es estrecho a
   *   propósito: si un ejemplar puede salir al doble que su vecino, el bosque
   *   se lee como una maqueta mal montada. El matorral sí admite variación.
   */
  _makeSpot(x, z, prototypeCount, registry, minScale, maxScale) {
    // La superficie que se ve es la malla, no la altura analítica: en una loma
    // la interpolación de la rejilla queda por debajo, y una mata apoyada en la
    // analítica se queda flotando.
    const y = this.field.meshHeight(x, z);
    const normal = this.field.normal(x, z);
    const spot = {
      x,
      z,
      y,
      scale: minScale + Math.pow(this.random(), 0.85) * (maxScale - minScale),
      yaw: this.random() * Math.PI * 2,
      // Se inclinan un poco con la ladera, pero menos que ella: una planta
      // busca la vertical aunque nazca en cuesta.
      lean: normal.clone().lerp(new THREE.Vector3(0, 1, 0), 0.62).normalize(),
      prototype: Math.floor(this.random() * prototypeCount),
    };
    registry.push(spot);
    return spot;
  }

  // ────────────────────────────────────────────────────────────── montaje

  _build(prototypes, spots, label, castShadow) {
    const byPrototype = prototypes.map(() => []);
    for (const s of spots) byPrototype[s.prototype].push(s);

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const upright = new THREE.Vector3(0, 1, 0);
    const leanQuat = new THREE.Quaternion();
    const yawQuat = new THREE.Quaternion();

    prototypes.forEach((proto, index) => {
      const list = byPrototype[index];
      if (!list.length) return;

      const plant = createTree(proto);
      const trunk = new THREE.InstancedMesh(plant.trunk, barkMaterial(), list.length);
      const canopy = new THREE.InstancedMesh(plant.canopy, leafMaterial(proto.species), list.length);

      trunk.castShadow = castShadow;
      trunk.receiveShadow = true;
      // La copa no entra en el mapa de sombras, y es una decisión de imagen,
      // no de rendimiento (medido: apagarla no cambia el tiempo de fotograma).
      // El mapa solo cubre unos 95 m alrededor de donde mira la cámara, así
      // que la sombra aparecería y desaparecería al desplazarse; y en la
      // sección del sendero dejaba el suelo tan oscuro que no se leían los
      // mojones. La mancha de suelo ancla el árbol en toda la isla por igual.
      canopy.castShadow = false;
      canopy.receiveShadow = true;
      trunk.name = `tallos-${label}-${proto.species}-${index}`;
      canopy.name = `copas-${label}-${proto.species}-${index}`;

      list.forEach((s, i) => {
        position.set(s.x, s.y - 0.2, s.z);
        leanQuat.setFromUnitVectors(upright, s.lean);
        yawQuat.setFromAxisAngle(upright, s.yaw);
        quat.copy(leanQuat).multiply(yawQuat);
        scale.setScalar(s.scale);
        matrix.compose(position, quat, scale);
        trunk.setMatrixAt(i, matrix);
        canopy.setMatrixAt(i, matrix);
      });

      trunk.instanceMatrix.needsUpdate = true;
      canopy.instanceMatrix.needsUpdate = true;
      // Las instancias están repartidas por todo el promontorio; el volumen
      // que three calcula por defecto se queda corto y las hace desaparecer.
      trunk.frustumCulled = false;
      canopy.frustumCulled = false;

      this.group.add(trunk, canopy);
    });

    // La altura de la copa entra en el shader del viento: sin ella, el
    // palanqueo se calcularía contra un valor fijo y las matas ondearían como
    // si midieran veinte metros.
    for (const species of new Set(prototypes.map((p) => p.species))) {
      leafMaterial(species).userData.uniforms.uCanopyTop.value = SPECIES[species].height[1] * 1.1;
    }
  }

  /**
   * Sombra de suelo bajo cada árbol.
   *
   * El mapa de sombras solo cubre unos 95 metros alrededor de donde mira la
   * cámara, así que los árboles de las lomas no proyectarían nada y se verían
   * flotando. Esta mancha oscura pegada al terreno los ancla siempre.
   */
  _buildGroundShadows(spots) {
    const positions = [];
    const uvs = [];
    const indices = [];
    let vertex = 0;

    for (const s of spots) {
      const r = 2.5 * s.scale;
      // Cuatro esquinas, cada una a la altura real del terreno: así la mancha
      // se amolda a la pendiente en vez de cortarla.
      for (const [ox, oz] of [[-r, -r], [r, -r], [r, r], [-r, r]]) {
        const x = s.x + ox;
        const z = s.z + oz;
        positions.push(x, this.field.height(x, z) + 0.12, z);
      }
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
      vertex += 4;
    }

    if (!positions.length) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: radialSprite({ size: 128, falloff: 1.7 }),
        color: 0x0d1a14,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        toneMapped: false,
      })
    );
    mesh.name = 'sombras-arboles';
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
}

/**
 * Zonas donde no se plantan árboles.
 *
 * Además de la plaza y los santuarios, se veta el punto donde aparca la
 * cámara al enfocar cada sección y el mirador de bienvenida. Sin esa regla
 * el arbolado crecía justo delante del objetivo y tapaba el monumento que
 * la sección tiene que enseñar.
 */
/**
 * @param {Array<{x:number,z:number,radius:number}>} [opts.corridors]
 *   Pasillos por los que se anda —la escalinata de Trayectoria, las trincheras
 *   del pasadizo— con radio de ÁRBOL, no de losa.
 *
 *   Hacen falta aquí y no valía con `paveKeepOut` por dos razones. Una: el
 *   arbolado no consulta `paveKeepOut`, solo el matorral lo hace, así que un
 *   carballo podía plantarse literalmente entre los peldaños. Y dos: aunque lo
 *   consultara, el radio que le sirve a la hierba —lo justo para no brotar
 *   entre las losas— deja el tronco a cinco metros del eje y la copa encima del
 *   camino igualmente. Lo que hay que apartar de un sendero es la copa.
 */
export function forestKeepOut({ padRadius, homeView, shrines = [], corridors = [] }) {
  const zones = [
    { x: 0, z: 0, radius: daisOuterRadius('plaza') + 10 },
    ...SECTIONS.map((def) => ({
      x: def.anchor[0],
      z: def.anchor[2],
      radius: (padRadius[def.id] ?? 16) + 8,
    })),
    ...corridors,
  ];

  for (const shrine of shrines) {
    const def = shrine.def;
    // El punto de mira real, no el ancla: en Trayectoria la cámara enfoca un
    // punto del sendero que está a treinta metros del estrado, así que
    // calcular el veto desde el ancla lo dejaba en el sitio equivocado y el
    // arbolado seguía plantándose delante del objetivo.
    const focus = shrine.focusPoint;
    const camX = focus.x + Math.sin(def.view.azimuth) * def.view.distance;
    const camZ = focus.z + Math.cos(def.view.azimuth) * def.view.distance;

    // Se despeja todo el segmento cámara → monumento, no solo los extremos.
    const samples = 5;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      zones.push({
        x: camX + (focus.x - camX) * t,
        z: camZ + (focus.z - camZ) * t,
        // Ancho en la cámara, más estrecho al llegar al monumento.
        radius: 22 - t * 8,
      });
    }
  }

  if (homeView) zones.push({ x: homeView[0], z: homeView[2], radius: 30 });
  return zones;
}
