/**
 * La atalaya del islote: un broch.
 *
 * Un *broch* es la torre redonda de piedra seca de la Edad del Hierro
 * escocesa, y es la pieza que le faltaba a esta isla. No es un capricho de
 * catálogo: de todo el repertorio megalítico es la única forma que se SUBE, y
 * lo que hacía falta aquí era una razón para cruzar el mar que no fuera mirar
 * una tumba de lejos. Un dolmen se contempla; una atalaya se ocupa.
 *
 * Y encaja con lo que ya hay. Los brochs de verdad —Mousa, Dun Carloway— son
 * de muro doble con la escalera METIDA entre los dos paramentos, sin mortero,
 * de la misma piedra apilada que la escalinata y los muretes del promontorio.
 * Aquí eso se aprovecha literalmente: la escalera va por dentro del grosor del
 * muro, en espiral, y sale a un adarve.
 *
 * ── Cómo se sube ──────────────────────────────────────────────────────────
 *
 * La torre no se sube con una escalera de mallas: se sube porque el CAMPO DE
 * ALTURAS la conoce. `atalayaWalkways()` devuelve los tramos de la rampa
 * helicoidal para que `TerrainField` los registre como obra, igual que la
 * escalinata y la galería del pasadizo. Es la misma regla del proyecto —«donde
 * hay obra manda la obra»— y por eso el visitante puede subir aunque la
 * pendiente real sea imposible para el límite de la ladera.
 *
 * Se buscó la alternativa de hacerlo con peldaños sueltos y se descartó por lo
 * que ya está escrito en `Stairway`: cuatro losas flotando no se leen como una
 * escalera, y aquí serían cuarenta en espiral.
 *
 * ── Las velas ─────────────────────────────────────────────────────────────
 *
 * En el adarve hay cuatro pebeteros. No arden siempre: se encienden cuando
 * cae la noche, que es lo que convierte la torre en lo que su nombre dice —una
 * atalaya avisa, y una que avisa de día no avisa de nada. `prenderVelas()`
 * recibe cuánta noche hay, de 0 a 1, y lo aplica al fuego, a la luz y al humo.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSlab, createStone, rockMaterial, stoneMesh } from './StoneFactory.js';
import { createFire, createSmoke } from '../vfx/Fire.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE } from '../config.js';

/** Radio exterior en la base. Se estrecha hacia arriba. */
export const ATALAYA_RADIO = 7.8;
/** Alto del cuerpo, sin contar el parapeto. */
export const ATALAYA_ALTO = 11.5;
/** Grosor del muro doble. Es el hueco por el que sube la escalera. */
const GRUESO = 2.1;
/** Cuánto se estrecha la torre de la base a la coronación. */
const ENTASIS = 0.82;
/**
 * Vueltas que da la escalera helicoidal. **Menos de una, y no es estético.**
 *
 * Un campo de alturas guarda UNA cota por punto del plano, y una espiral de
 * más de una vuelta pasa dos veces por el mismo (x, z) a alturas distintas.
 * Con 1,75 vueltas, tres cuartos de la rampa se solapaban consigo mismos y el
 * suelo transitable en esa zona era el que ganase el desempate por distancia
 * —o sea, arbitrario—: el caminante subía media vuelta y se caía.
 *
 * Con 0,92 la rampa no se cruza nunca. Sube los 11,5 m en 30,9 m de recorrido,
 * que es una pendiente del 37 % — empinada para una escalera de casa y normal
 * para una de torre, que es lo que es.
 */
const VUELTAS = 0.92;
/**
 * Radio del eje de la rampa: ADOSADA al muro por dentro, no metida en él.
 *
 * La primera versión la puso en el centro del grosor, que es la traza de un
 * broch de verdad. No funciona aquí y por una razón de bulto: entre los dos
 * paramentos quedaban 46 cm libres, y el cuerpo del visitante mide 90 de
 * diámetro. La escalera intramural auténtica es así de estrecha —lo eran— pero
 * una que no se puede pisar no es una escalera.
 *
 * Adosada por dentro se gana lo que hacía falta: la rampa queda libre de la
 * fábrica, y por tanto el muro PUEDE tener cuerpo sin cerrar el paso. Que es
 * lo que convierte la puerta en una puerta, en vez de en un dibujo por el que
 * da igual entrar o atravesar la pared.
 */
const R_RAMPA = ATALAYA_RADIO - GRUESO - 1.05;

const _uno = new THREE.Vector3(1, 1, 1);

/** Radio en planta a la altura `t` (0 en la base, 1 en la coronación). */
const radioEn = (t) => ATALAYA_RADIO * (1 - (1 - ENTASIS) * t);

/**
 * Los tramos por los que se anda dentro de la torre.
 *
 * Se devuelven en coordenadas de MUNDO —ya trasladados al centro que se les
 * pasa— porque `TerrainField.addWalkway` trabaja en mundo y no sabe nada de
 * grupos ni de matrices. Es la misma convención que usan la escalinata y el
 * souterrain.
 *
 * @param {{x:number, z:number}} centro
 * @param {number} base  Cota del suelo bajo la torre.
 */
export function atalayaWalkways(centro, base, rumbo = 0) {
  const tramos = [];
  // Un tramo por cada 18° de giro. Más largo, la rampa se sale del muro en la
  // cuerda; más corto, son cien tramos que recorrer en cada consulta de altura.
  const pasos = Math.round(VUELTAS * 360 / 18);
  // La rampa ARRANCA EN LA PUERTA, y por eso este ángulo se recibe en vez de
  // escribirse aquí. Estaba fijo en π: la puerta se abría a 312° y la rampa
  // empezaba a 170°, o sea que entrar por la puerta te dejaba en el patio sin
  // nada que subir, y la escalera arrancaba a media torre contra el muro.
  const rumboPuerta = rumbo;
  for (let i = 0; i < pasos; i++) {
    const a0 = rumboPuerta + (i / pasos) * VUELTAS * Math.PI * 2;
    const a1 = rumboPuerta + ((i + 1) / pasos) * VUELTAS * Math.PI * 2;
    const y0 = base + (i / pasos) * ATALAYA_ALTO;
    const y1 = base + ((i + 1) / pasos) * ATALAYA_ALTO;
    // Con las claves que espera `addWalkway`: `ax/az` y `bx/bz` los extremos,
    // `floorA`/`floorB` las cotas. Se devuelve ya en esa forma para que quien
    // lo registre no tenga que traducir nada.
    tramos.push({
      ax: centro.x + Math.cos(a0) * R_RAMPA,
      az: centro.z + Math.sin(a0) * R_RAMPA,
      bx: centro.x + Math.cos(a1) * R_RAMPA,
      bz: centro.z + Math.sin(a1) * R_RAMPA,
      floorA: y0,
      floorB: y1,
      halfWidth: GRUESO * 0.45,
    });
  }
  // Y el adarve: un tramo DEGENERADO —los dos extremos en el mismo punto— con
  // el radio del patio. Un segmento con grosor es una cápsula, así que uno de
  // longitud cero es un disco limpio en el centro de la torre.
  //
  // La primera versión lo declaró como un tramo que cruzaba la torre de lado a
  // lado con medio ancho igual al radio. Eso no es un disco: es una cápsula de
  // catorce metros que cubría la torre entera Y la rampa, y como `walkHeight`
  // devuelve el tramo más cercano, dentro de la torre todo el suelo pasaba a
  // estar a la altura de la coronación. Medido: el caminante aparecía ya
  // arriba y la rampa no existía.
  //
  // El radio se queda por dentro de la banda de la rampa para que gane la
  // rampa donde hay rampa, y la toca para que no quede un anillo de vacío por
  // el que colarse al salir a lo alto.
  const cima = base + ATALAYA_ALTO;
  tramos.push({
    ax: centro.x,
    az: centro.z,
    bx: centro.x,
    bz: centro.z,
    floorA: cima,
    floorB: cima,
    halfWidth: R_RAMPA - GRUESO * 0.45 + 0.15,
  });
  return tramos;
}

/** Radio en planta que hay que dejar libre de otras piezas. */
export const ATALAYA_RADIO_LIBRE = ATALAYA_RADIO + 3.5;

/**
 * @param {object} opciones
 * @param {number} opciones.rumbo  Hacia dónde mira la puerta, en radianes.
 * @param {number} opciones.base   Cota del suelo bajo la torre.
 */
export function createAtalaya({ rumbo = 0, base = 0, seed = 4211 } = {}) {
  const random = makeRandom(seed);
  const grupo = new THREE.Group();
  grupo.name = 'atalaya';
  const material = rockMaterial();
  /**
   * Los bloques del muro y del parapeto, para fundirlos en dos mallas.
   *
   * Sin esto la torre son 1.270 mallas —cada bloque la suya— y la escena pasa
   * de 753 a 2.023. Es exactamente el problema que ya documentó la calzada: no
   * son los vértices, son las llamadas de dibujado. Aquí es peor porque un
   * broch tiene el doble de piedras que un puente y ninguna se mueve nunca.
   */
  const piezas = [];

  // ── El muro, por hiladas ──────────────────────────────────────────────
  //
  // Anillos de bloques y no un cilindro: un broch es piedra seca apilada, y
  // eso se ve en las juntas o no se ve. Cada hilada va girada media pieza
  // respecto a la de abajo, que es como se traba un muro sin mortero — con
  // las juntas alineadas se leería como ladrillo de fábrica moderno.
  const HILADAS = 26;
  const altoHilada = ATALAYA_ALTO / HILADAS;
  // La puerta: un hueco de dos hiladas y pico en el arranque.
  //
  // El medio ángulo se calcula desde un ANCHO en metros y no se escribe fijo.
  // Estaba en 0,28 rad, que con la torre a radio 6,4 daba una puerta de 3,6 m
  // —ya generosa— y al ensanchar la torre a 7,8 pasó a 4,4: en el alzado no se
  // leía como una puerta sino como un tramo de muro caído. Con el ancho fijado
  // en metros, la torre puede crecer sin que la puerta crezca con ella.
  const PUERTA_ANCHO = 2.6;
  const puertaMedioAng = PUERTA_ANCHO / 2 / ATALAYA_RADIO;
  const puertaHasta = Math.round(2.6 / altoHilada);

  for (let h = 0; h < HILADAS; h++) {
    const t = h / HILADAS;
    const r = radioEn(t);
    const y = base + h * altoHilada;
    // Bloques por hilada: los de arriba son algo más pequeños, que es como se
    // levantan estas torres — el peso baja.
    const cuantos = Math.max(16, Math.round((2 * Math.PI * r) / 1.5));
    const desfase = (h % 2) * (Math.PI / cuantos);

    for (let i = 0; i < cuantos; i++) {
      const a = desfase + (i / cuantos) * Math.PI * 2;
      // Hueco de la puerta.
      let dAng = Math.abs(((a - rumbo + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (h < puertaHasta && dAng < puertaMedioAng) continue;

      // Y la aspillera: una tronera estrecha en el lado opuesto, a media
      // altura. Una atalaya sin por dónde mirar es un silo.
      dAng = Math.abs(((a - rumbo + Math.PI * 2) % (Math.PI * 2)) - Math.PI);
      const hMedia = Math.round(HILADAS * 0.55);
      if (dAng < 0.12 && h >= hMedia && h < hMedia + 3) continue;

      const ancho = (2 * Math.PI * r) / cuantos;
      const bloque = createStone({
        width: ancho * (0.86 + random() * 0.2),
        height: altoHilada * (0.9 + random() * 0.16),
        depth: GRUESO * (0.42 + random() * 0.12),
        seed: seed + h * 97 + i,
        detail: 1,
        roundness: 0.16,
        erosion: 0.2,
        taper: 0.04,
        flatBase: true,
      });
      const oscura = random() > 0.72;
      // Doble paramento: una piedra por dentro y otra por fuera. Es la traza
      // real de un broch, y aquí además es lo que deja pasar la luz de las
      // velas por la tronera.
      for (const signo of [1, -1]) {
        const rr = r - GRUESO * 0.5 + signo * GRUESO * 0.28;
        piezas.push({
          geo: bloque,
          oscura,
          m: new THREE.Matrix4().compose(
            new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(0, -a + Math.PI / 2 + (random() - 0.5) * 0.1, 0)
            ),
            _uno
          ),
        });
      }
    }
  }

  // ── Dintel de la puerta ───────────────────────────────────────────────
  const dintel = createSlab({
    width: 2.6,
    height: 0.5,
    depth: GRUESO * 1.15,
    seed: seed + 3001,
    erosion: 0.12,
    detail: 2,
  });
  const md = stoneMesh(dintel, { name: 'atalaya-dintel' });
  md.position.set(
    Math.cos(rumbo) * (ATALAYA_RADIO - GRUESO * 0.5),
    base + puertaHasta * altoHilada,
    Math.sin(rumbo) * (ATALAYA_RADIO - GRUESO * 0.5)
  );
  md.rotation.y = -rumbo + Math.PI / 2;
  grupo.add(md);

  // ── Adarve: el suelo de arriba, sobre ménsulas ────────────────────────
  const cima = base + ATALAYA_ALTO;
  const rCima = radioEn(1);
  const suelo = new THREE.Mesh(
    new THREE.CylinderGeometry(rCima - GRUESO * 0.5, rCima - GRUESO * 0.5, 0.34, 28),
    material
  );
  suelo.name = 'atalaya-adarve';
  suelo.position.set(0, cima - 0.17, 0);
  suelo.receiveShadow = true;
  suelo.castShadow = true;
  grupo.add(suelo);

  // Parapeto: una hilada más, entera, por fuera del adarve.
  const almenas = 22;
  for (let i = 0; i < almenas; i++) {
    const a = (i / almenas) * Math.PI * 2;
    const bloque = createStone({
      width: ((2 * Math.PI * rCima) / almenas) * 0.9,
      height: 0.95 + random() * 0.3,
      depth: 0.75,
      seed: seed + 5000 + i,
      detail: 1,
      roundness: 0.2,
      erosion: 0.26,
      flatBase: true,
    });
    piezas.push({
      geo: bloque,
      oscura: random() > 0.6,
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * (rCima - 0.42), cima, Math.sin(a) * (rCima - 0.42)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0)),
        _uno
      ),
    });
  }

  // ── Los pebeteros ─────────────────────────────────────────────────────
  //
  // Cuatro, en cruz. En cruz y no repartidos al azar porque una atalaya es
  // obra, y la obra se ordena: cuatro fuegos a los cuatro rumbos se leen como
  // puestos, y cinco desperdigados como una hoguera que se fue de las manos.
  const velas = [];
  const rBrasero = rCima - GRUESO * 0.5 - 0.9;
  for (let i = 0; i < 4; i++) {
    const a = rumbo + Math.PI / 4 + (i / 4) * Math.PI * 2;
    const x = Math.cos(a) * rBrasero;
    const z = Math.sin(a) * rBrasero;

    // El pie: un pilar corto de piedra.
    const pie = createStone({
      width: 0.62,
      height: 0.95,
      depth: 0.62,
      seed: seed + 6100 + i,
      detail: 2,
      roundness: 0.3,
      erosion: 0.14,
      flatBase: true,
    });
    const mp = stoneMesh(pie, { dark: true, name: `atalaya-pebetero-${i}` });
    mp.position.set(x, cima, z);
    grupo.add(mp);

    const fuego = createFire({
      count: 54,
      rise: 1.5,
      radius: 0.22,
      spread: 0.5,
      seed: seed + 6200 + i,
      intensity: 1,
    });
    fuego.name = `atalaya-fuego-${i}`;
    fuego.position.set(x, cima + 1.0, z);
    grupo.add(fuego);

    const humo = createSmoke({ count: 16, rise: 4.2, radius: 0.3, seed: seed + 6300 + i });
    humo.name = `atalaya-humo-${i}`;
    humo.position.set(x, cima + 1.7, z);
    grupo.add(humo);

    // Una luz de verdad por pebetero, y aquí hay que ser tacaño: cada luz con
    // sombra cuesta un pase de sombreado entero. Sin sombras, cuatro puntos
    // son baratos y lo que se busca es que el adarve se tiña de ámbar, no que
    // proyecten.
    const luz = new THREE.PointLight(PALETTE.ember, 0, 16, 2);
    luz.position.set(x, cima + 1.2, z);
    grupo.add(luz);

    velas.push({ fuego, humo, luz });
  }

  // Fundido: dos mallas, una por material. Las geometrías originales se
  // sueltan, que si no se quedan los 1.270 buffers en memoria sin dibujarse.
  for (const oscura of [false, true]) {
    const lote = piezas.filter((p) => p.oscura === oscura);
    if (!lote.length) continue;
    const geos = lote.map(({ geo, m }) => geo.clone().applyMatrix4(m));
    const junta = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!junta) continue;
    junta.computeBoundingSphere();
    const malla = new THREE.Mesh(junta, rockMaterial({ dark: oscura }));
    malla.name = `atalaya-muro-${oscura ? 'oscuro' : 'claro'}`;
    malla.castShadow = true;
    malla.receiveShadow = true;
    grupo.add(malla);
  }
  for (const { geo } of piezas) geo.dispose();

  // ── El cuerpo del muro ────────────────────────────────────────────────
  //
  // Se declara aparte y a propósito grueso: veintiocho cajas alrededor del
  // anillo, con su hueco en la puerta. Las otras dos vías no valen. Las mallas
  // fundidas son dos cintas de quince metros, y su volumen envolvente incluye
  // el patio entero — colisionar contra eso cerraría la torre. Y una caja por
  // sillar serían mil doscientas setenta, contra las doscientas ochenta y tres
  // que tiene hoy la isla completa, para describir un cilindro.
  //
  // Sin esto la torre es un decorado: se entra atravesando la pared en
  // cualquier punto y la puerta no significa nada. `Colliders` excluye todo lo
  // que se llame «muro» —un murete flanquea un paso, y ponerle cuerpo cierra el
  // paso que flanquea— pero el muro de una torre no flanquea: encierra. Por eso
  // se declara en vez de deducirse del nombre.
  const cuerpos = [];
  const SECTORES = 28;
  for (let i = 0; i < SECTORES; i++) {
    const a = (i / SECTORES) * Math.PI * 2;
    const dAng = Math.abs(((a - rumbo + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (dAng < puertaMedioAng + 0.06) continue; // el hueco de la puerta
    const rMed = ATALAYA_RADIO - GRUESO * 0.5;
    const cx = Math.cos(a) * rMed;
    const cz = Math.sin(a) * rMed;
    // Cada caja cubre su arco con holgura, para que no queden rendijas entre
    // sectores por las que colarse.
    const arco = ((2 * Math.PI * rMed) / SECTORES) * 0.62;
    const semi = Math.max(arco, GRUESO * 0.5);
    cuerpos.push({
      minX: cx - semi,
      maxX: cx + semi,
      minY: base - 1,
      maxY: base + ATALAYA_ALTO + 1.2,
      minZ: cz - semi,
      maxZ: cz + semi,
    });
  }
  grupo.userData.cuerpos = cuerpos;

  grupo.userData.velas = velas;
  grupo.userData.cima = cima;
  return grupo;
}

/**
 * Enciende o apaga las velas del adarve.
 *
 * @param {THREE.Group} atalaya
 * @param {number} noche  0 de día, 1 de noche cerrada.
 */
export function prenderVelas(atalaya, noche) {
  const velas = atalaya?.userData?.velas;
  if (!velas) return;
  const n = Math.min(1, Math.max(0, noche));
  for (const v of velas) {
    // El fuego y el humo se apagan del todo: una llama al 10 % no se lee como
    // una llama floja, se lee como un fallo de transparencia.
    v.fuego.visible = n > 0.06;
    v.humo.visible = n > 0.06;
    v.luz.intensity = n * 9;
  }
}
