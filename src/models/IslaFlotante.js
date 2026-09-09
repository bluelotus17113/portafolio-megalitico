/**
 * La isla flotante que corona el Camino del Viajero.
 *
 * El sendero de la trayectoria ya ascendía —sube 11,3 m reales a lo largo de
 * 47,6 m— pero moría en el prado, sin llegar a ninguna parte. Esta isla es su
 * destino: lo que se ha recorrido termina en un sitio que no toca el suelo.
 *
 * ── Por qué esto NO es terreno ─────────────────────────────────────────────
 *
 * Es la restricción que decide toda la forma del fichero. `TerrainField` es un
 * CAMPO DE ALTURAS: guarda una elevación por cada (x, z). Suelo sobre suelo no
 * se puede expresar ahí — no es que quede feo, es que no cabe en la estructura.
 * Una isla flotante es, por definición, terreno encima de terreno.
 *
 * Así que la isla es un MODELO, y para poder andar por ella se declara aparte:
 * `islaWalkways` publica su cubierta como pasarela y el cuerpo se declara como
 * cuerpo de colisión. Es el mismo camino que ya recorrieron la calzada al
 * islote y la atalaya, que tropezaron con esta misma pared.
 *
 * ── La silueta es el modelo ────────────────────────────────────────────────
 *
 * A una isla flotante se le mira por debajo: es lo único que la distingue de
 * una meseta. Por eso la quilla se lleva la mayor parte de los triángulos —
 * anillos que se estrechan hasta una punta, con repisas que sobresalen y una
 * cornisa que vuela sobre el primer anillo. Sin ese vuelo la pieza se lee como
 * un cono, y un cono no flota: se apoya.
 *
 * ── El origen está en la HIERBA ────────────────────────────────────────────
 *
 * `y = 0` es la superficie por la que se anda, no el centro ni el fondo. Es lo
 * que hace que colocarla sea decir a qué altura queda la cubierta, que es el
 * único número que importa cuando se pone algo encima y cuando se declara la
 * pasarela.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStone, rockMaterial, stoneMesh } from './StoneFactory.js';
import { PALETTE, SEED } from '../config.js';
import { makeRandom, SimplexNoise } from '../utils/noise.js';

/** Radio de la cubierta: lo que se pisa. */
export const ISLA_RADIO = 13.5;

/** Cuánto cuelga la quilla por debajo de la hierba. */
export const ISLA_QUILLA = 17;

/** Radio libre alrededor de la fuente, para que quede sitio por donde rodearla. */
export const FUENTE_RADIO = 3.4;

/** Grosor de la loma de hierba antes de que empiece la roca. */
const CANTO = 1.5;

/**
 * Perfil de la quilla, de la cornisa a la punta.
 *
 * El primer anillo es MÁS ANCHO que la cubierta a propósito: esa cornisa es la
 * que proyecta sombra sobre la roca y la que dice, desde abajo, que la hierba
 * vuela por encima del vacío.
 */
const PERFIL = [
  [-CANTO, 1.06],
  [-2.7, 0.95],
  [-3.5, 1.01], // repisa: el radio VUELVE A CRECER, y eso es un alero
  [-5.6, 0.81],
  [-6.6, 0.87], // segunda repisa
  [-9.0, 0.62],
  [-11.2, 0.45],
  [-12.4, 0.5], // tercera, ya menuda
  [-14.4, 0.29],
  [-16.0, 0.15],
  [-ISLA_QUILLA, 0],
];

const SEGMENTOS = 44;

/**
 * La cubierta y la quilla, como una sola malla cerrada.
 *
 * Se genera a mano y no con `LatheGeometry` porque cada anillo lleva ruido
 * propio en radio y en altura: torneada saldría una peonza perfecta, y lo que
 * se busca es una peña arrancada.
 */
function cuerpoGeometry(seed) {
  const ruido = new SimplexNoise(seed);
  const random = makeRandom(seed + 17);
  const pos = [];
  const idx = [];

  // Radio y altura de un vértice del anillo `a` en el ángulo `th`.
  const punto = (rBase, yBase, thCrudo, escalaRuido, fase = 0) => {
    // Cada anillo entra girado: sin la fase, los estratos se alinean en
    // columnas verticales y la peña se lee como torneada.
    const th = thCrudo + fase;
    const c = Math.cos(th);
    const s = Math.sin(th);
    // El ruido se muestrea en el CÍRCULO, no en el ángulo: muestreado en theta
    // hay una costura donde 2π vuelve a 0 y se ve una grieta recta de arriba
    // abajo de la isla.
    const n = ruido.noise3(c * 1.55, yBase * 0.13, s * 1.55);
    const m = ruido.noise3(c * 3.9, yBase * 0.31, s * 3.9) * 0.5;
    const r = rBase * (1 + (n + m) * escalaRuido);
    return [c * r, yBase + n * escalaRuido * 2.2, s * r];
  };

  const anillos = [];
  // Anillo cero: el borde de la hierba, sin ruido vertical para que la cubierta
  // apoye plana sobre él.
  for (let i = 0; i < SEGMENTOS; i++) {
    const th = (i / SEGMENTOS) * Math.PI * 2;
    const [x, , z] = punto(ISLA_RADIO, 0, th, 0.045);
    anillos.push([x, 0, z]);
  }
  let fase = 0;
  for (const [y, k] of PERFIL) {
    if (k === 0) break;
    fase += 0.16 + (random() - 0.5) * 0.2;
    for (let i = 0; i < SEGMENTOS; i++) {
      const th = (i / SEGMENTOS) * Math.PI * 2;
      // El ruido crece hacia la punta: arriba la peña está cortada por la
      // hierba y abajo se deshace en lascas.
      anillos.push(punto(ISLA_RADIO * k, y, th, 0.11 + (1 - k) * 0.26, fase));
    }
  }

  for (const p of anillos) pos.push(p[0], p[1], p[2]);
  const filas = anillos.length / SEGMENTOS;

  // Costados
  for (let f = 0; f + 1 < filas; f++) {
    for (let i = 0; i < SEGMENTOS; i++) {
      const j = (i + 1) % SEGMENTOS;
      const a = f * SEGMENTOS + i;
      const b = f * SEGMENTOS + j;
      const c = (f + 1) * SEGMENTOS + i;
      const d = (f + 1) * SEGMENTOS + j;
      idx.push(a, c, b, b, c, d);
    }
  }

  // La punta, cerrando el último anillo en un solo vértice.
  const punta = pos.length / 3;
  pos.push((random() - 0.5) * 1.2, -ISLA_QUILLA, (random() - 0.5) * 1.2);
  const ultimo = (filas - 1) * SEGMENTOS;
  for (let i = 0; i < SEGMENTOS; i++) {
    idx.push(ultimo + i, punta, ultimo + ((i + 1) % SEGMENTOS));
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * La loma de hierba: un disco levemente abombado sobre el anillo de la roca.
 *
 * Va en malla APARTE de la quilla porque lleva otro material, y el corte entre
 * las dos es justo la línea que se quiere ver: hierba arriba, peña abajo.
 */
function cespedGeometry(seed) {
  const ruido = new SimplexNoise(seed + 91);
  const pos = [];
  const idx = [];

  // Loma suave que se hunde en el eje. `k` es el radio normalizado.
  const hondo = (k) => 0.3 * (1 - k * k) - 0.58 * Math.exp(-((k / 0.27) ** 2));
  const ANILLOS = 13;

  // El centro está HUNDIDO, no encumbrado: la fuente vive en una hondonada.
  //
  // Con la loma abombada la cubierta subía 0,34 m en el eje y el pilón quedaba
  // por debajo del césped — se veía una esquirla de agua entre las briznas y
  // nada más. Un manantial nace donde el terreno recoge, no en la cima.
  pos.push(0, hondo(0), 0);
  for (let a = 1; a <= ANILLOS; a++) {
    const k = a / ANILLOS;
    for (let i = 0; i < SEGMENTOS; i++) {
      const th = (i / SEGMENTOS) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const n = ruido.noise3(c * 1.7, 0, s * 1.7);
      const r = ISLA_RADIO * k * (1 + n * 0.045 * k);
      // Se abomba hacia el centro y cae hasta 0 justo en el borde, que es donde
      // la roca la recibe.
      const y = hondo(k) + ruido.noise3(c * 3.1 * k, 1.4, s * 3.1 * k) * 0.16 * (1 - k);
      pos.push(c * r, y, s * r);
    }
  }

  for (let i = 0; i < SEGMENTOS; i++) {
    idx.push(0, 1 + ((i + 1) % SEGMENTOS), 1 + i);
  }
  for (let a = 1; a < ANILLOS; a++) {
    for (let i = 0; i < SEGMENTOS; i++) {
      const j = (i + 1) % SEGMENTOS;
      const p = 1 + (a - 1) * SEGMENTOS;
      const q = 1 + a * SEGMENTOS;
      // Cara arriba. Con el bobinado contrario —que es el que salió primero—
      // 528 de los 572 triángulos miraban al suelo, el césped se recortaba por
      // cara trasera y desde arriba se veía el INTERIOR de la quilla: la isla
      // parecía tener la cubierta de piedra beige.
      idx.push(p + i, p + j, q + i, p + j, q + j, q + i);
    }
  }

  // Color por vértice, en dos verdes.
  //
  // Con un verde plano la cubierta se leía como pizarra: el prado del mundo no
  // es un color, son dos mezclados por ruido, y una isla de un solo tono no
  // parece del mismo sitio.
  const oscuro = new THREE.Color(PALETTE.grassDark);
  const claro = new THREE.Color(PALETTE.grassLight);
  const col = [];
  const mezcla = new THREE.Color();
  for (let i = 0; i < pos.length; i += 3) {
    // Dos frecuencias, y sesgado al verde OSCURO. Con una sola octava y sesgo
    // claro salía un verde plano de fieltro que no era de este mundo: el prado
    // de la isla grande tiene manchas de los dos tonos, no un color medio.
    const t =
      0.4 +
      ruido.noise3(pos[i] * 0.14, 3.7, pos[i + 2] * 0.14) * 0.34 +
      ruido.noise3(pos[i] * 0.52, 9.1, pos[i + 2] * 0.52) * 0.18;
    mezcla.copy(oscuro).lerp(claro, Math.min(1, Math.max(0, t)));
    col.push(mezcla.r, mezcla.g, mezcla.b);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * La fuente: un brocal de piedra con un menhir en el eje.
 *
 * Es lo que la sección quiere decir. La experiencia no es un montón que crece:
 * es agua que sigue manando, siempre la misma y nunca la misma. Por eso está en
 * el centro y por eso no se le pone tapa.
 */
function fuenteGrupo(seed) {
  const g = new THREE.Group();
  g.name = 'fuente';
  const random = makeRandom(seed + 404);

  // Brocal: sillares en corona, no un cilindro. Un cilindro liso al lado de
  // esta cantería se lee como de otro juego.
  const sillares = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const piedra = createStone({
      width: 1.35,
      height: 0.86 + random() * 0.16,
      depth: 0.72,
      seed: SEED + 6100 + i,
      erosion: 0.1,
    });
    piedra.rotateY(-th);
    piedra.translate(Math.cos(th) * FUENTE_RADIO, 0, Math.sin(th) * FUENTE_RADIO);
    sillares.push(piedra);
  }
  const brocal = stoneMesh(mergeGeometries(sillares, false), { name: 'fuente-brocal' });
  brocal.castShadow = true;
  brocal.receiveShadow = true;
  g.add(brocal);
  for (const s of sillares) s.dispose();

  // Suelo del pilón, un poco hundido: el agua tiene que tener fondo.
  const fondo = new THREE.Mesh(
    new THREE.CircleGeometry(FUENTE_RADIO + 0.3, 40).rotateX(-Math.PI / 2),
    rockMaterial({ dark: true })
  );
  fondo.position.y = -0.45;
  fondo.receiveShadow = true;
  fondo.name = 'fuente-fondo';
  g.add(fondo);

  // El menhir del eje, del que mana.
  const menhir = stoneMesh(
    createStone({ width: 1.15, height: 3.1, depth: 1.0, seed: SEED + 6200, erosion: 0.13, taper: 0.34 }),
    { name: 'fuente-menhir' }
  );
  menhir.position.y = -0.45;
  menhir.castShadow = true;
  g.add(menhir);

  return g;
}

/**
 * La lámina de agua.
 *
 * Aparte de todo lo demás y con su propio material: es lo único de la isla que
 * se mueve, y tenerla suelta es lo que permite animarla sin volver a tocar la
 * geometría.
 */
function aguaMesh() {
  // Del color del mar del mundo, no de un cian de rotulador. La primera versión
  // usaba `arcane` a opacidad 0,72 y salía un disco de plástico turquesa que se
  // veía desde media isla; y estaba tan alta que asomaba POR ENCIMA del brocal,
  // que es exactamente lo que el agua no hace.
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.oceanShallow,
    transparent: true,
    opacity: 0.5,
    roughness: 0.08,
    metalness: 0.15,
    emissive: PALETTE.arcaneDeep,
    emissiveIntensity: 0.07,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(FUENTE_RADIO - 0.62, 48).rotateX(-Math.PI / 2), mat);
  m.name = 'fuente-agua';
  m.userData.brilloBase = mat.emissiveIntensity;
  // Los sillares del brocal arrancan en 0 y miden 0,86: la lámina va MUY por
  // debajo de su coronación, o no hay pilón, hay charco.
  m.position.y = 0.26;
  m.renderOrder = 2;
  return m;
}

/**
 * Monta la isla entera.
 *
 * @param {object} opciones
 * @param {number} opciones.base   Altura de MUNDO de la cubierta: lo que se pisa.
 * @param {number} opciones.seed
 * @returns {THREE.Group} con `userData.cuerpos` ya puesto.
 */
export function createIslaFlotante({ base = 0, seed = SEED + 7331 } = {}) {
  const isla = new THREE.Group();
  isla.name = 'isla-flotante';
  isla.position.y = base;

  const quilla = stoneMesh(cuerpoGeometry(seed), { name: 'isla-quilla' });
  quilla.castShadow = true;
  quilla.receiveShadow = true;
  isla.add(quilla);

  const cesped = new THREE.Mesh(
    cespedGeometry(seed),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
  );
  cesped.name = 'isla-cesped';
  cesped.receiveShadow = true;
  isla.add(cesped);

  isla.add(fuenteGrupo(seed));
  const agua = aguaMesh();
  isla.add(agua);

  // La luz del manantial. De día no existe; de noche es lo único que se ve de
  // la isla desde el prado, y lo que dice que allí arriba hay algo.
  const luz = new THREE.PointLight(PALETTE.arcane, 0, 26, 2);
  luz.position.set(0, 1.4, 0);
  luz.name = 'fuente-luz';
  isla.add(luz);

  isla.userData.nocturno = { agua, luz };
  return isla;
}

/**
 * La cubierta de la isla, como una sola pasarela degenerada.
 *
 * Los dos extremos del tramo son el mismo punto, así que `_onSegment` mide
 * distancia al CENTRO y el corredor sale circular: un disco de radio
 * `ISLA_RADIO - margen`. Es el mismo truco con el que se resolvió el adarve de
 * la atalaya, y aquí hace dos trabajos de una vez.
 *
 * El primero es evidente: da suelo a veintiún metros de altura, donde el campo
 * de alturas no tiene nada que ofrecer.
 *
 * El segundo es que hace de PRETIL sin dibujar ninguno. Fuera del disco la
 * pasarela deja de contar y el suelo vuelve a ser el mar, que el paseo revierte
 * por su cuenta; así el borde de la isla no se puede cruzar y no ha habido que
 * levantar una tapia alrededor de una pradera que se quiere abierta.
 */
export function islaWalkways(centro, base, { margen = 1.4 } = {}) {
  return [
    {
      ax: centro.x,
      az: centro.z,
      bx: centro.x,
      bz: centro.z,
      floorA: base,
      floorB: base,
      halfWidth: ISLA_RADIO - margen,
    },
  ];
}

/**
 * Enciende el manantial al caer la noche.
 *
 * El mismo trato que las velas de la atalaya, y por la misma razón: una isla
 * que flota a veintiún metros y de noche se apaga entera deja de existir, y con
 * ella el final del camino. Lo que se enciende es el agua, no un foco: la
 * fuente es lo que la sección quiere decir, así que es lo que alumbra.
 *
 * @param {THREE.Group} isla
 * @param {number} noche  0 de día, 1 de noche.
 */
export function prenderFuente(isla, noche) {
  const n = isla?.userData?.nocturno;
  if (!n) return;
  const k = Math.min(1, Math.max(0, noche));
  n.agua.material.emissiveIntensity = n.agua.userData.brilloBase + k * 0.85;
  n.agua.material.opacity = 0.5 + k * 0.28;
  n.luz.intensity = k * 7;
}
