/**
 * Dolmen de portal.
 *
 * La isla grande ya tiene trilitos, círculo, estela, altar, souterrain y
 * escalinata. El dolmen es la forma megalítica que faltaba y no es un trilito
 * con otro nombre: un trilito son dos jambas y un dintel HORIZONTAL, un plano
 * que se cruza; un dolmen de portal es una cámara cuya cubierta se INCLINA,
 * alta por la boca y caída por detrás, apoyada en ortostatos de distinta
 * altura. Esa pendiente es toda su silueta —Poulnabrone, Brownshill— y es lo
 * que hace que se lea a contraluz desde el otro lado del agua.
 *
 * Va en el islote y no en el promontorio a propósito: un dolmen es una tumba,
 * y las tumbas se ponen fuera, al otro lado de algo que haya que cruzar.
 */

import * as THREE from 'three';
import { createSlab, createStone, stoneMesh } from './StoneFactory.js';
import { makeRandom } from '../utils/noise.js';

/**
 * @param {object} opciones
 * @param {number} opciones.rumbo  Hacia dónde mira la boca, en radianes.
 * @param {number} opciones.escala
 */
export function createDolmen({ rumbo = 0, escala = 1, seed = 907 } = {}) {
  const random = makeRandom(seed);
  const group = new THREE.Group();
  group.name = 'dolmen';

  // Los ortostatos: dos altos delante y dos bajos detrás. La diferencia de
  // altura es el dolmen entero — igualados, la cubierta queda plana y esto se
  // convierte en una mesa.
  const jambas = [
    { x: -1.35, z: 1.30, alto: 2.62, ancho: 1.20, grueso: 0.52 },
    { x: 1.35, z: 1.30, alto: 2.54, ancho: 1.16, grueso: 0.50 },
    { x: -1.18, z: -1.25, alto: 1.72, ancho: 1.05, grueso: 0.48 },
    { x: 1.18, z: -1.25, alto: 1.66, ancho: 1.10, grueso: 0.46 },
  ];

  let i = 0;
  for (const j of jambas) {
    const piedra = createStone({
      width: j.ancho * escala,
      height: j.alto * escala,
      depth: j.grueso * escala,
      seed: seed + i * 11,
      detail: 3,
      roundness: 0.22,
      taper: 0.08,
      erosion: 0.15,
      // Se abren un poco hacia fuera, que es como se sostiene una cámara sin
      // mortero: la cubierta las aprieta contra el terreno en vez de tumbarlas.
      lean: (j.x > 0 ? -1 : 1) * 0.07,
      flatBase: true,
    });
    const malla = stoneMesh(piedra, { name: `dolmen-jamba-${i}` });
    // `position.y` es la BASE, no el centro: `createStone` deja la malla
    // apoyada en y=0. Se hunde medio metro, que es lo que se hace con un
    // ortostato — se planta en una fosa, no se posa.
    malla.position.set(j.x * escala, -0.45 * escala, j.z * escala);
    malla.rotation.y = (random() - 0.5) * 0.22;
    group.add(malla);
    i++;
  }

  // La cubierta. Enorme y en voladizo por la boca: la piedra que cierra una
  // cámara siempre sobresale, y ese alero es lo que da la sombra.
  const cubierta = createSlab({
    width: 4.5 * escala,
    height: 0.78 * escala,
    depth: 3.9 * escala,
    seed: seed + 71,
    erosion: 0.11,
    detail: 4,
  });
  const tapa = stoneMesh(cubierta, { name: 'dolmen-cubierta' });
  // Se apoya sobre las jambas altas y cae hacia las bajas.
  const frente = 2.62 - 0.45;
  const fondo = 1.72 - 0.45;
  const caida = Math.atan2((frente - fondo) * escala, 2.55 * escala);
  // El origen de la losa es su base, y al girar sobre X gira alrededor de ese
  // punto: la mitad de delante sube y la de atrás baja. Así que el origen va a
  // la MEDIA de las dos coronaciones, no a la de atrás — puesto en `fondo`, la
  // cubierta se apoyaba en las jambas bajas y dejaba las altas al aire.
  tapa.position.set(0, ((frente + fondo) / 2 - 0.06) * escala, 0.18 * escala);
  tapa.rotation.x = -caida;
  tapa.rotation.y = (random() - 0.5) * 0.06;
  group.add(tapa);

  // Un par de bloques caídos al pie: ningún megalito de cinco mil años
  // conserva todas sus piezas en pie, y los derrumbes son la mitad de por qué
  // una ruina se lee como ruina.
  for (let k = 0; k < 2; k++) {
    const ang = random() * Math.PI * 2;
    const r = (2.6 + random() * 1.6) * escala;
    const bloque = createStone({
      width: (0.9 + random() * 0.5) * escala,
      height: (1.5 + random() * 0.7) * escala,
      depth: (0.6 + random() * 0.3) * escala,
      seed: seed + 200 + k,
      detail: 3,
      roundness: 0.28,
      erosion: 0.2,
      flatBase: false,
    });
    const malla = stoneMesh(bloque, { dark: k === 0, name: `dolmen-caido-${k}` });
    // Tumbado, el eje largo pasa a ser horizontal: la base queda de canto y
    // basta con levantarlo medio grosor del suelo.
    malla.position.set(Math.cos(ang) * r, 0.34 * escala, Math.sin(ang) * r);
    // Tumbados, que es la gracia.
    malla.rotation.set(Math.PI / 2 + (random() - 0.5) * 0.4, random() * Math.PI, (random() - 0.5) * 0.5);
    group.add(malla);
  }

  group.rotation.y = rumbo;
  return group;
}

/** Radio en planta que hay que dejar libre de hierba y pedregal. */
export const DOLMEN_RADIO = 5.2;
