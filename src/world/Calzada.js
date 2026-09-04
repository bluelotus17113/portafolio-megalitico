/**
 * La calzada al islote.
 *
 * Es un puente «clapper»: losas enormes apoyadas en pilas de piedra seca, sin
 * mortero y sin arcos. Es la única forma de puente que sabe hacer alguien que
 * mueve megalitos, y existe de verdad —Postbridge, Tarr Steps— con este mismo
 * aspecto de bloque sobre bloque. Un arco de dovelas aquí sería un acueducto
 * romano dos mil años antes de tiempo.
 *
 * Va acompañada de pares de menhires, como la avenida de Avebury. No son
 * decoración: desde el mirador la calzada se ve de canto y a cincuenta metros
 * de distancia, o sea como una raya gris de dos píxeles de alto sobre el
 * agua. Las siluetas verticales son lo que la hace legible desde lejos y lo
 * que dice, sin explicar nada, que se puede ir por ahí.
 *
 * La cota del tablero no se elige: se mide en las dos orillas y se pone en
 * rampa entre ellas, de modo que la calzada nace y muere a ras de suelo. Con
 * una cota fija salía un escalón de tres metros y medio en la primera losa, y
 * en el modo a pie un escalón es un muro.
 */

import * as THREE from 'three';
import { createSlab, createStone, stoneMesh } from '../models/StoneFactory.js';
import { makeRandom } from '../utils/noise.js';
import { WORLD } from '../config.js';

/**
 * Busca sobre el rumbo el punto donde el terreno cruza una cota.
 *
 * Marcha metro a metro en vez de resolverlo: el campo de alturas lleva ruido
 * y rasa mareal, así que no hay fórmula que invertir.
 *
 * @param {import('./Terrain.js').TerrainField} field
 * @param {number} rumbo
 * @param {number} desdeD  Distancia de partida.
 * @param {number} paso    Positivo se aleja del centro, negativo se acerca.
 * @param {number} cota    Altura buscada.
 */
function buscarOrilla(field, rumbo, desdeD, paso, cota) {
  const cx = Math.cos(rumbo);
  const cz = Math.sin(rumbo);
  for (let i = 0; i < 400; i++) {
    const d = desdeD + paso * i;
    if (field.height(cx * d, cz * d) < cota) return d - paso;
  }
  return desdeD;
}

/**
 * @param {import('./Terrain.js').TerrainField} field
 * @param {object} opciones
 * @param {number} opciones.rumbo
 * @param {number} opciones.distancia  Centro del islote, para saber hacia dónde.
 * @param {number} opciones.ancho      Anchura de la losa.
 * @param {number} opciones.tramo      Longitud de cada vano.
 */
export function createCalzada(field, { rumbo, distancia, ancho = 4.6, tramo = 5.2, seed = 613 } = {}) {
  const random = makeRandom(seed);
  const group = new THREE.Group();
  group.name = 'calzada';

  // OJO CON EL ORIGEN DE LAS PIEDRAS.
  //
  // `createStone` termina con `geo.translate(0, -boundingBox.min.y, 0)`: la
  // malla sale con la BASE en y=0, no centrada. Toda la fábrica de este
  // proyecto asume eso —`Megaliths` apoya el dintel en `height * 0.97`— y la
  // primera versión de la calzada no: colocaba cada pieza por su centro, así
  // que subían media altura de más. Las dieciocho pilas asomaban por encima
  // del tablero y el puente se leía como un esqueleto de pez. Aquí, `position.y`
  // es SIEMPRE la cota de la base.
  const dir = new THREE.Vector2(Math.cos(rumbo), Math.sin(rumbo));
  const lado = new THREE.Vector2(-dir.y, dir.x);
  const punto = (d, off = 0) =>
    new THREE.Vector2(dir.x * d + lado.x * off, dir.y * d + lado.y * off);

  // ── Los dos estribos ────────────────────────────────────────────────
  //
  // Se buscan marchando desde dentro de cada tierra hacia el agua, y se
  // entran dos metros y medio en firme: un puente que muere justo en la orilla
  // deja el último paso sobre la rasa mojada, que es donde el terreno tiene
  // más ruido y donde más fácil sale un escalón.
  const costa = field.coastRadius(rumbo);
  const dA = buscarOrilla(field, rumbo, costa - 18, 1, 0.9) - 2.5;
  const dB = buscarOrilla(field, rumbo, distancia - 4, -1, 0.9) + 2.5;

  const pA = punto(dA);
  const pB = punto(dB);
  const largo = dB - dA;
  const vanos = Math.max(2, Math.round(largo / tramo));
  const paso = largo / vanos;

  // El tablero va EN RAMPA, no a nivel.
  //
  // A nivel había que ponerlo por encima del estribo más alto, y las dos
  // orillas no están a la misma cota: el islote tiene paredes de treinta y
  // tantos grados, así que entrar dos metros en firme por ese lado ya son
  // cuatro metros de altura. Medido, el tablero salía a 4,9 y el arranque en
  // la isla grande está a 1,4 — o sea, un escalón de tres metros y medio en la
  // primera losa. En rampa la pendiente sale del 6 %, que se sube sin enterarse
  // y que además es lo que hace una calzada de verdad al llegar a una peña.
  const hA = field.height(pA.x, pA.y);
  const hB = field.height(pB.x, pB.y);
  // Losa gorda y tablero casi a ras del estribo. Con 0,55 de resalte había un
  // escalón de medio metro en la primera losa; con 0,15 se entra a la calzada
  // sin levantar el pie, y la losa de casi un metro deja sitio a las pilas por
  // debajo sin que el tablero quede volando sobre el agua.
  const grosor = 0.95;
  const cotaA = hA + 0.15;
  const cotaB = hB + 0.15;
  const cotaEn = (t) => cotaA + (cotaB - cotaA) * t;
  const pendiente = Math.atan2(cotaB - cotaA, largo);

  // ── Losas ───────────────────────────────────────────────────────────
  for (let i = 0; i < vanos; i++) {
    const d = dA + paso * (i + 0.5);
    const p = punto(d);
    // Cada losa se desvía un poco: talladas iguales, la calzada se lee como
    // hormigón encofrado y no como diez bloques que alguien arrastró hasta aquí.
    const losa = createSlab({
      width: paso + 0.55,
      height: grosor,
      depth: ancho + (random() - 0.5) * 0.5,
      seed: seed + i * 7,
      erosion: 0.09,
      detail: 3,
    });
    const malla = stoneMesh(losa, { name: `calzada-losa-${i}` });
    malla.position.set(p.x, cotaEn((i + 0.5) / vanos) - grosor, p.y);
    // El orden importa: primero se gira en planta y luego se tumba, si no la
    // pendiente se aplica sobre el eje equivocado y las losas salen peraltadas
    // en vez de en cuesta.
    malla.rotation.order = 'YZX';
    malla.rotation.y = -rumbo + (random() - 0.5) * 0.035;
    malla.rotation.z = -pendiente + (random() - 0.5) * 0.012;
    group.add(malla);
  }

  // ── Pilas ───────────────────────────────────────────────────────────
  //
  // Una en cada junta, con dos bloques a cada lado bajo el filo de la losa.
  // El fondo bajo la calzada es el bajío, o sea unos tres metros: la pila
  // mide lo que un hombre y el conjunto se lee como algo que se pudo levantar
  // a mano.
  for (let i = 1; i < vanos; i++) {
    const d = dA + paso * i;
    for (const off of [-1, 1]) {
      const p = punto(d, off * (ancho / 2 - 0.75));
      const lecho = field.height(p.x, p.y);
      // Hasta el INTRADÓS de la losa, ni un centímetro más.
      //
      // La primera versión pedía `alto + 0.6` para enterrar la base y dejaba la
      // coronación 12 cm por debajo del tablero — o sea, doce centímetros por
      // ENCIMA de la cara inferior de la losa. Las dieciocho pilas asomaban por
      // los dos lados y la calzada se leía como un esqueleto de pez. Lo que hay
      // que alargar es la parte de abajo: se entierra bajando la base, no
      // subiendo la cabeza.
      const enterrado = 0.8;
      const alto = cotaEn(i / vanos) - grosor - lecho;
      if (alto < 0.4) continue;
      const pila = createStone({
        width: 1.95,
        height: alto + enterrado,
        depth: 1.6,
        seed: seed + 100 + i * 5 + (off > 0 ? 1 : 0),
        detail: 3,
        roundness: 0.16,
        // Talud: más ancha abajo. Es lo que aguanta de verdad y lo que hace
        // que una pila parezca una pila y no un poste.
        taper: -0.22,
        erosion: 0.16,
        flatBase: true,
      });
      const malla = stoneMesh(pila, { dark: true, name: `calzada-pila-${i}` });
      malla.position.set(p.x, lecho - enterrado, p.y);
      malla.rotation.y = -rumbo + (random() - 0.5) * 0.16;
      group.add(malla);
    }
  }

  // ── Menhires de la avenida ──────────────────────────────────────────
  //
  // Cada tres vanos, un par. Van justo por fuera del pasillo por el que se
  // anda —el tablero mide 4,6 y el pasillo 3,4— así que enmarcan sin estorbar.
  for (let i = 2; i < vanos; i += 3) {
    const d = dA + paso * i;
    for (const off of [-1, 1]) {
      const p = punto(d, off * (ancho / 2 - 0.42));
      const h = 2.7 + random() * 1.6;
      const menhir = createStone({
        width: 0.82,
        height: h,
        depth: 0.62,
        seed: seed + 300 + i * 3 + (off > 0 ? 1 : 0),
        detail: 3,
        roundness: 0.30,
        taper: 0.20,
        erosion: 0.13,
        lean: (random() - 0.5) * 0.10,
        flatBase: true,
      });
      const malla = stoneMesh(menhir, { name: `calzada-menhir-${i}` });
      malla.position.set(p.x, cotaEn(i / vanos) - 0.16, p.y);
      malla.rotation.y = -rumbo + (random() - 0.5) * 0.3;
      group.add(malla);
    }
  }

  // ── Por dónde se anda ───────────────────────────────────────────────
  //
  // Un tramo por vano y no uno solo de punta a punta: `_onSegment` recorta la
  // proyección a [0,1], así que un tramo único devolvería su cota entera a
  // quien esté nadando más allá del final. Troceado, el pasillo acaba donde
  // acaba la piedra.
  //
  // El medio ancho es 1,7 contra los 2,3 de la losa: el borde de una calzada
  // sin pretil no se pisa, y dejar medio metro de margen evita que se pueda
  // andar por el aire sobre el filo.
  for (let i = 0; i < vanos; i++) {
    const a = punto(dA + paso * i);
    const b = punto(dA + paso * (i + 1));
    field.addWalkway(a.x, a.y, b.x, b.y, {
      halfWidth: 1.7,
      floorA: cotaEn(i / vanos),
      floorB: cotaEn((i + 1) / vanos),
    });
  }

  group.userData.cota = cotaA;
  group.userData.cotaB = cotaB;
  group.userData.desde = pA;
  group.userData.hasta = pB;
  group.userData.vanos = vanos;
  return group;
}

/**
 * La escalinata que sube del desembarco al dolmen.
 *
 * Hace falta por una medida, no por gusto: la ladera del islote sube a 0,86 y
 * el modo a pie admite 0,62 de tangente (`CameraRig.walk.pendienteMax`). Sin
 * escalera se cruza la calzada, se llega al pie de la peña y ahí se acaba el
 * viaje — un puente a un sitio en el que no se puede entrar.
 *
 * Peldaños de losa, no rampa. Sobre FÁBRICA el modo a pie deja de mirar la
 * pendiente y mira el escalón, que admite 0,55 m; con contrahuellas por debajo
 * de eso se sube cualquier cosa. Y una escalera de losas es además lo que se
 * construye en un sitio así: es la escalinata de Skellig, seiscientos peldaños
 * de piedra seca subiendo una peña.
 *
 * @param {import('./Terrain.js').TerrainField} field
 */
export function createEscalinata(field, { rumbo, desdeD, hastaD, cotaSalida, cotaLlegada, ancho = 3.6, seed = 811 } = {}) {
  const random = makeRandom(seed);
  const group = new THREE.Group();
  group.name = 'escalinata-islote';

  const dir = new THREE.Vector2(Math.cos(rumbo), Math.sin(rumbo));
  const lado = new THREE.Vector2(-dir.y, dir.x);
  const punto = (d, off = 0) =>
    new THREE.Vector2(dir.x * d + lado.x * off, dir.y * d + lado.y * off);

  // La cota de llegada viene DADA, no se consulta al terreno: el desmonte que
  // abre este corredor se registró con esos mismos números, y preguntarle al
  // campo aquí devolvería la cota ya excavada, que es otra.
  const subida = cotaLlegada - cotaSalida;
  const largo = hastaD - desdeD;
  if (subida < 1 || largo < 3) return group;

  // El número de peldaños lo manda la CONTRAHUELLA, no la estética: se pide
  // 0,42 m, holgado por debajo del 0,55 que se sube sin preguntar, y de ahí
  // sale cuántos hacen falta.
  const peldanos = Math.max(2, Math.ceil(subida / 0.42));
  const contra = subida / peldanos;
  const huella = largo / peldanos;
  const grosor = Math.min(0.55, contra * 0.9);

  for (let i = 0; i < peldanos; i++) {
    const d = desdeD + huella * (i + 0.5);
    const p = punto(d);
    const techo = cotaSalida + contra * (i + 1);
    const losa = createSlab({
      width: huella + 0.5,
      height: grosor,
      depth: ancho + (random() - 0.5) * 0.45,
      seed: seed + i * 13,
      erosion: 0.12,
      detail: 3,
    });
    const malla = stoneMesh(losa, { dark: i % 3 === 0, name: `escalon-${i}` });
    // Por la base, como toda la fábrica de piedra de este proyecto.
    malla.position.set(p.x, techo - grosor, p.y);
    malla.rotation.y = -rumbo + (random() - 0.5) * 0.05;
    group.add(malla);

    const a = punto(desdeD + huella * i);
    const b = punto(desdeD + huella * (i + 1));
    field.addWalkway(a.x, a.y, b.x, b.y, {
      halfWidth: ancho / 2 - 0.5,
      floorA: cotaSalida + contra * i,
      floorB: techo,
    });
  }

  // Dos jalones arriba, donde se corona: sin ellos la escalera muere en la
  // hierba y desde abajo no se ve que lleva a alguna parte.
  for (const off of [-1, 1]) {
    const p = punto(hastaD - 0.5, off * (ancho / 2 + 0.35));
    const h = 1.7 + random() * 0.8;
    const jalon = createStone({
      width: 0.7, height: h, depth: 0.55,
      seed: seed + 400 + (off > 0 ? 1 : 0),
      detail: 3, roundness: 0.3, taper: 0.18, erosion: 0.14,
      lean: (random() - 0.5) * 0.12, flatBase: true,
    });
    const malla = stoneMesh(jalon, { name: 'escalinata-jalon' });
    malla.position.set(p.x, field.height(p.x, p.y) - 0.25, p.y);
    malla.rotation.y = -rumbo + (random() - 0.5) * 0.3;
    group.add(malla);
  }

  group.userData.peldanos = peldanos;
  group.userData.contra = contra;
  return group;
}

/**
 * Zona en la que no debe brotar nada, para que la hierba y el pedregal no
 * salgan a través del tablero. En metros y en planta.
 */
export function calzadaKeepOut(field, { rumbo, distancia, ancho = 4.6 }) {
  const costa = field.coastRadius(rumbo);
  const dA = buscarOrilla(field, rumbo, costa - 18, 1, 0.9) - 3.5;
  const dB = buscarOrilla(field, rumbo, distancia - 4, -1, 0.9) + 3.5;
  const zonas = [];
  const cx = Math.cos(rumbo);
  const cz = Math.sin(rumbo);
  // Se cubre con discos solapados en vez de con un rectángulo porque el resto
  // del proyecto ya habla en discos: `Grass` y `Forest` solo saben rechazar
  // por centro y radio.
  for (let d = dA; d <= dB; d += 3) {
    zonas.push({ x: cx * d, z: cz * d, radius: ancho / 2 + 1.4 });
  }
  return zonas;
}

/** Cuánto se aparta del centro de la isla el arranque de la calzada. */
export function calzadaArranque(field, rumbo) {
  const costa = field.coastRadius(rumbo);
  return Math.min(WORLD.radius, buscarOrilla(field, rumbo, costa - 18, 1, 0.9));
}
