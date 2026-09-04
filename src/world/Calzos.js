/**
 * Calzos: las piedras de recalce del pie de cada menhir.
 *
 * Un ortostato de cinco toneladas no se apoya en la hierba. Se mete en un hoyo
 * y se acuña con piedras a su alrededor, y eso —no el tamaño ni la talla— es
 * lo que a un ojo le dice que el bloque está PLANTADO y no colocado encima.
 * Sin ellas la línea donde la piedra toca el suelo es un corte limpio, y un
 * corte limpio es el aviso de que aquí no hay peso.
 *
 * Va como una pasada sobre la escena ya construida y no dentro de cada
 * santuario, por dos motivos:
 *
 *  - Las piedras de pie las levantan siete ficheros distintos (`Megaliths`,
 *    `About`, `Projects`, `Skills`, `Contact`, `Experience`, `Souterrain`).
 *    Recalzarlas una a una sería el mismo bloque de código repetido siete
 *    veces, y el octavo sitio que plante un menhir se olvidaría.
 *  - Aquí todos los calzos de la isla caben en DOS mallas instanciadas. Hechos
 *    dentro de cada santuario serían trescientas llamadas de dibujo por una
 *    guarnición que ocupa medio metro.
 *
 * La cota de apoyo se saca de la caja de la propia piedra, no del campo de
 * alturas: sobre un enlosado el suelo real es la losa, que está por encima del
 * terreno, y preguntándole al terreno los calzos se enterrarían debajo del
 * pavimento.
 */

import * as THREE from 'three';
import { createBoulder, rockMaterial } from '../models/StoneFactory.js';
import { makeRandom } from '../utils/noise.js';
import { SEED } from '../config.js';

/**
 * Qué es una piedra de pie.
 *
 * Por nombre, que es como el resto del proyecto identifica lo que tiene
 * identidad. Quedan fuera los dinteles y las tapas —que no tocan el suelo— y
 * todo lo que sea relleno.
 */
const DE_PIE = /(^stone|trilithon-post|dolmen-leg|monolito|estela|mojon|piedra-runada|menhir|jamba)/;

// El nombre no basta y por eso están los dos filtros de abajo: en esta lista
// caen también el monolito caído de Proyectos y alguna losa tumbada, y a esos
// no se les acuña nada. Se descartan por lo que MIDEN, que es la pregunta de
// verdad — «¿está de pie?»— y no por acordarse de nombrarlos aparte.

/** Alto mínimo para merecer recalce, en metros. Un bolo bajo no se acuña. */
const ALTO_MINIMO = 1.6;
/** Y ancho máximo: un muro o una losa tumbada no son un menhir. */
const ANCHO_MAXIMO = 5.0;

/**
 * Siembra los calzos de toda la isla.
 *
 * @param {THREE.Object3D} escena  Con el mundo ya construido.
 * @returns {THREE.Group|null} El grupo añadido, o null si no había qué recalzar.
 */
export function sembrarCalzos(escena) {
  // Las cajas se miden en mundo, así que las matrices tienen que estar al día.
  // Es el mismo cuidado que necesita `construirColisionadores`, y por el mismo
  // motivo: antes del primer fotograma nadie ha recalculado nada.
  escena.updateMatrixWorld(true);

  const random = makeRandom(SEED + 7717);
  const caja = new THREE.Box3();
  const tamano = new THREE.Vector3();
  const centro = new THREE.Vector3();

  // Cinco formas, que es de sobra: giradas y escaladas no se repiten a la vista.
  const formas = [];
  for (let i = 0; i < 5; i++) {
    formas.push(createBoulder({ radius: 0.34, seed: SEED + 7800 + i, detail: 1 }));
  }
  const lotes = formas.map(() => []);

  escena.traverse((nodo) => {
    if (!nodo.isMesh || nodo.isInstancedMesh) return;
    if (!DE_PIE.test(nodo.name || '')) return;

    caja.setFromObject(nodo);
    if (caja.isEmpty()) return;
    caja.getSize(tamano);
    if (tamano.y < ALTO_MINIMO) return;
    if (Math.max(tamano.x, tamano.z) > ANCHO_MAXIMO) return;
    caja.getCenter(centro);

    // Radio de la huella, no del bulto: los calzos se arriman al pie, y el pie
    // es lo que la piedra ocupa en planta.
    const huella = Math.max(tamano.x, tamano.z) * 0.5;
    // Entre tres y cinco, repartidos con hueco: en fila cerrada parecen un
    // bordillo, y un recalce no es un bordillo.
    const cuantos = 3 + Math.floor(random() * 3);
    const giro0 = random() * Math.PI * 2;

    for (let i = 0; i < cuantos; i++) {
      const angulo = giro0 + (i / cuantos) * Math.PI * 2 + (random() - 0.5) * 0.7;
      const distancia = huella * (0.80 + random() * 0.42);
      const escala = 0.55 + random() * 0.75;
      lotes[Math.floor(random() * formas.length)].push({
        posicion: new THREE.Vector3(
          centro.x + Math.cos(angulo) * distancia,
          // Medio enterrado: un calzo que se ve entero es un canto suelto que
          // alguien dejó ahí, no una cuña metida a golpes.
          caja.min.y + 0.34 * escala * 0.45,
          centro.z + Math.sin(angulo) * distancia
        ),
        giro: new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
        escala: new THREE.Vector3(escala, escala * (0.6 + random() * 0.3), escala),
      });
    }
  });

  const total = lotes.reduce((s, l) => s + l.length, 0);
  if (!total) return null;

  const grupo = new THREE.Group();
  grupo.name = 'calzos';
  const material = rockMaterial({ dark: true });
  const matriz = new THREE.Matrix4();
  const cuaternion = new THREE.Quaternion();

  lotes.forEach((lote, i) => {
    if (!lote.length) return;
    const malla = new THREE.InstancedMesh(formas[i], material, lote.length);
    malla.name = `calzo-${i}`;
    lote.forEach((t, j) => {
      malla.setMatrixAt(j, matriz.compose(t.posicion, cuaternion.setFromEuler(t.giro), t.escala));
    });
    malla.instanceMatrix.needsUpdate = true;
    malla.castShadow = true;
    malla.receiveShadow = true;
    grupo.add(malla);
  });

  escena.add(grupo);
  return grupo;
}
