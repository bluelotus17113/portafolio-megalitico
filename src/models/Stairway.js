/**
 * La Escalinata: sube del círculo central a Habilidades.
 *
 * Entre las dos explanadas hay 20,8 m de desnivel y 23 m de terreno. En recto
 * eso es el 90 % — 42°, una escala de mano, no una escalera. La pendiente no se
 * puede negociar con el terreno porque el escarpe es lo que es; lo único que se
 * puede alargar es el RECORRIDO, y por eso la escalinata no va derecha: sale de
 * la plaza abriéndose hacia el mar, cruza en diagonal la cara del talud, hace
 * rellano en el banco que hay a media ladera y vuelve a cerrar sobre el eje para
 * entrar en Habilidades de frente. Cuarenta metros de recorrido para los mismos
 * veintiún metros de subida: 52 %, que ya es una escalinata.
 *
 * Tres cosas se miden y no se eligen:
 *
 *  1. **El perfil sale del terreno.** Una rampa de pendiente constante es lo más
 *     fácil de escribir y lo peor de mirar: como el talud no sube a ritmo
 *     constante, la rampa se entierra tres metros en unos sitios y vuela tres en
 *     otros. Aquí se busca el perfil monótono más pegado al suelo que además
 *     respeta un tope de pendiente. El rellano de media ladera no está puesto a
 *     mano: aparece solo, porque ahí el terreno se aplana y el perfil con él.
 *
 *  2. **La contrahuella es constante y la huella no.** Es al revés de como se
 *     dibuja un tramo de escalera en un plano, y es lo correcto para una
 *     escalinata que sigue el suelo: lo que cansa es que cambie la altura del
 *     escalón, no que cambie el fondo. Los escalones caen donde el perfil cruza
 *     cada múltiplo de la contrahuella, así que en lo empinado salen juntos y en
 *     lo tendido se separan hasta convertirse en rellano.
 *
 *  3. **El desmonte se registra en el campo de alturas.** Donde el perfil va por
 *     debajo del terreno hay que excavar de verdad (`stairwayCuts`), o la ladera
 *     atraviesa las huellas. Donde va por encima, la fábrica lo resuelve sola con
 *     el muro de contención, que es más alto justo ahí.
 */

import * as THREE from 'three';
import { flagstone } from '../utils/textures.js';
import { createStone, stoneMesh, rockMaterial } from './StoneFactory.js';
import { DAIS_STEP_DROP } from './Dais.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { SimplexNoise } from '../utils/noise.js';
import { DAIS, SECTIONS, SEED, daisOuterRadius } from '../config.js';

export const STAIRWAY = {
  /** Ancho útil por el que se anda, sin contar los muretes. */
  ancho: 4.6,
  /**
   * Altura de escalón buscada. La real se ajusta para que quepa un número entero.
   *
   * Con la pendiente fijada por el trazado, la contrahuella decide también la
   * huella: son proporcionales. A 30 cm salían 69 escalones de 45 cm de fondo y
   * de cerca se leía como un muro de bloques, no como una escalinata. A 36 cm
   * son 58 peldaños de 69 cm de fondo medio — zancada larga, la de una obra
   * ceremonial, que es lo que es.
   */
  contrahuella: 0.36,
  /**
   * Tope de pendiente del perfil.
   *
   * Manda sobre la huella mínima: con 0,66 el escalón más justo tiene 45 cm de
   * fondo. Subirlo estrecha las huellas hasta que dejan de ser pisables; bajarlo
   * obliga a un recorrido que no cabe entre las dos explanadas.
   */
  topePendiente: 0.66,
  /** Grosor del murete lateral y altura del parapeto que lo corona. */
  muro: 0.62,
  parapeto: 0.52,
  /**
   * Panza del trazado, en coordenadas de EJE NORMALIZADO: `t` va de 0 en el
   * borde de la plaza a 1 en el de Habilidades, y `q` se desvía de lado en
   * metros, positivo hacia el mar.
   *
   * Los extremos NO se escriben aquí: salen de `daisOuterRadius`, para que la
   * escalinata nazca y muera tocando piedra aunque cambien las medidas de los
   * estrados. Cablearlos fue lo que dejó los caminos muriendo metro y medio
   * antes de la losa.
   *
   * La panza de +13 m es lo que compra el recorrido. Sin ella la subida vuelve
   * al 90 %.
   */
  panza: [
    [0.00, 0],
    [0.21, 8.7],
    [0.46, 14.7],
    [0.71, 13.8],
    [1.00, 0],
  ],
  seed: SEED + 6100,
};

let _plan = null;

/**
 * Perfil monótono más pegado al terreno, con un tope de pendiente.
 *
 * Se construye FACTIBLE, en una sola pasada, en vez de iterar hasta que salga.
 * El primer intento alternaba una pasada hacia delante y otra hacia atrás
 * esperando que convergieran, y no lo hacen: son filtros secuenciales, no
 * proyecciones sobre conjuntos convexos, así que cada pasada deshace parte de lo
 * que hizo la otra y oscilan. Y el fallo no se ve como un perfil un poco torcido
 * sino como diez escalones amontonados en el mismo punto, porque la última
 * muestra está clavada en `y1` y todo lo que le falte al perfil se paga de golpe
 * ahí.
 *
 * La construcción correcta es una banda:
 *
 *  - `hi[i] = y0 + tope·l` — lo más alto a lo que se puede haber llegado
 *    subiendo desde el pie sin pasarse de pendiente.
 *  - `lo[i] = y1 − tope·(largo − l)` — lo más bajo que se puede estar y todavía
 *    alcanzar la cima.
 *
 * Dentro de esa banda se sigue el terreno lo más de cerca posible. Como las dos
 * fronteras son rectas de pendiente `tope`, subir un punto hasta `lo` nunca
 * rompe el tope respecto al anterior, así que el resultado cumple monotonía,
 * pendiente y extremos a la vez y sin iterar.
 */
function perfilAjustado(acum, terreno, y0, y1, tope) {
  const n = terreno.length;
  const largo = acum[n - 1];

  // Objetivo: el terreno alisado. Sin alisar, cada mata de ruido del talud
  // mueve un escalón de sitio y la escalinata sale con la huella temblando.
  const objetivo = terreno.slice();
  for (let p = 0; p < 150; p++) {
    const previo = objetivo.slice();
    for (let i = 1; i < n - 1; i++) objetivo[i] = previo[i] * 0.6 + (previo[i - 1] + previo[i + 1]) * 0.2;
  }

  const y = new Array(n);
  y[0] = y0;
  for (let i = 1; i < n; i++) {
    const dl = Math.max(1e-4, acum[i] - acum[i - 1]);
    const hi = Math.min(y1, y0 + tope * acum[i]);
    const lo = Math.max(y0, y1 - tope * (largo - acum[i]));
    const meta = Math.min(hi, Math.max(lo, objetivo[i]));
    y[i] = Math.max(Math.min(Math.max(meta, y[i - 1]), y[i - 1] + tope * dl), lo);
  }
  y[n - 1] = y1;
  return y;
}

/**
 * Todo lo que hay que saber de la escalinata, medido sobre el terreno.
 *
 * Se llama con las explanadas y el cerro ya registrados y ANTES de sus propios
 * desmontes: necesita leer el talud sin excavar. Se memoiza porque lo consultan
 * el campo de alturas, la hierba, el arbolado y la propia geometría, y todos
 * tienen que estar mirando el mismo trazado.
 *
 * @param {import('../world/Terrain.js').TerrainField} field
 */
export function stairwayPlan(field) {
  if (_plan) return _plan;

  const skills = SECTIONS.find((d) => d.id === 'skills');
  const largoEje = Math.hypot(skills.anchor[0], skills.anchor[2]);
  const ux = skills.anchor[0] / largoEje;
  const uz = skills.anchor[2] / largoEje;
  // Perpendicular al eje. `q` positivo se aleja hacia el mar, que es el lado
  // libre: hacia el otro está la explanada de Trayectoria.
  const px = -uz;
  const pz = ux;
  const aMundo = (s, q) => ({ x: ux * s + px * q, z: uz * s + pz * q });

  // Los extremos son los radios enlosados de los dos estrados: la escalinata
  // arranca donde acaba la losa de la plaza y muere donde empieza la de
  // Habilidades.
  const sPie = daisOuterRadius('plaza');
  const sCima = largoEje - daisOuterRadius('skills');

  // Trazado: spline por los nodos, muestreada fina. La cota se lee del terreno
  // en cada muestra, así que cuanto más fina, mejor sigue el suelo.
  const curva = new THREE.SplineCurve(
    STAIRWAY.panza.map(([t, q]) => new THREE.Vector2(sPie + (sCima - sPie) * t, q))
  );
  const MUESTRAS = 260;
  const puntos = [];
  for (let i = 0; i <= MUESTRAS; i++) {
    const p = curva.getPoint(i / MUESTRAS);
    puntos.push(aMundo(p.x, p.y));
  }

  const acum = [0];
  for (let i = 1; i < puntos.length; i++) {
    acum.push(acum[i - 1] + Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].z - puntos[i - 1].z));
  }
  const largo = acum[acum.length - 1];

  const terreno = puntos.map((p) => field.height(p.x, p.z));
  const y0 = terreno[0];
  const y1 = terreno[terreno.length - 1];
  const perfil = perfilAjustado(acum, terreno, y0, y1, STAIRWAY.topePendiente);

  // Escalones: contrahuella constante, huella variable. Se recorre el perfil
  // buscando dónde cruza cada múltiplo, así que el reparto lo decide el terreno.
  const subida = y1 - y0;
  const numero = Math.max(1, Math.round(subida / STAIRWAY.contrahuella));
  const contrahuella = subida / numero;
  const cortes = [0];
  let k = 1;
  for (let i = 1; i < perfil.length && k <= numero; i++) {
    // El objetivo se recalcula DENTRO del bucle. Sacándolo fuera, `k` avanza y
    // la condición sigue comparando contra la cota del primer escalón: la
    // primera muestra que la supera dispara los sesenta y nueve seguidos y la
    // escalinata entera cabe en metro y medio.
    while (k <= numero && perfil[i] >= y0 + k * contrahuella - 1e-9) {
      const anterior = perfil[i - 1];
      const t = perfil[i] === anterior ? 0 : (y0 + k * contrahuella - anterior) / (perfil[i] - anterior);
      cortes.push(acum[i - 1] + (acum[i] - acum[i - 1]) * Math.min(1, Math.max(0, t)));
      k++;
    }
  }
  while (cortes.length <= numero) cortes.push(largo);

  /** Huellas: [lIni, lFin, cota]. La última llega hasta el final del trazado. */
  const huellas = [];
  for (let i = 0; i <= numero; i++) {
    const lIni = cortes[i];
    const lFin = i < numero ? cortes[i + 1] : largo;
    huellas.push({ lIni, lFin, y: y0 + i * contrahuella });
  }

  _plan = {
    puntos,
    acum,
    largo,
    perfil,
    terreno,
    huellas,
    contrahuella,
    numero,
    y0,
    y1,
    aMundo,
    eje: { ux, uz, px, pz },
    /**
     * Los dos estrados que enlaza y por dónde entrega en cada uno.
     *
     * Se publican aquí para que la geometría no tenga que volver a buscar el
     * santuario ni recalcular el eje: mover la escalinata debe mover también sus
     * peldaños de entrega, no dejarlos donde estaban.
     */
    entregas: [
      { id: 'plaza', centro: { x: 0, z: 0 }, l: 0 },
      { id: 'skills', centro: { x: skills.anchor[0], z: skills.anchor[2] }, l: largo },
    ],
    /** Recorte máximo respecto al terreno: negativo excava, positivo levanta. */
    desmonte: Math.max(0, ...perfil.map((y, i) => terreno[i] - y)),
    terraplen: Math.max(0, ...perfil.map((y, i) => y - terreno[i])),
  };
  return _plan;
}

/** Punto del trazado a `l` metros del pie, con su tangente unitaria. */
function enL(plan, l) {
  const { acum, puntos } = plan;
  const objetivo = Math.min(plan.largo, Math.max(0, l));
  let i = 1;
  while (i < acum.length - 1 && acum[i] < objetivo) i++;
  const t = (objetivo - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
  const a = puntos[i - 1];
  const b = puntos[i];
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const m = Math.hypot(dx, dz) || 1;
  return { x, z, tx: dx / m, tz: dz / m };
}

/** Cota de la escalinata a `l` metros: la huella que pisa ahí. */
function cotaEnL(plan, l) {
  for (const h of plan.huellas) {
    if (l <= h.lFin) return h.y;
  }
  return plan.y1;
}

/**
 * Desmontes para el campo de alturas.
 *
 * Se trocea el trazado porque `addCut` interpola su fondo LINEALMENTE entre los
 * dos extremos del segmento: un solo corte de cuarenta metros pondría una rampa
 * recta bajo un perfil que no lo es, y volvería a enterrar la escalinata en unos
 * sitios y a dejarla en el aire en otros.
 *
 * El fondo va un palmo por debajo de la huella: la escalinata se mete en la caja
 * excavada en vez de posarse encima de ella, que es lo que hace que se lea como
 * abierta en la ladera y no como puesta.
 *
 * Y solo se excava DONDE HAY LADERA POR ENCIMA. Rebajando por sistema, los
 * tramos que van sobre terraplén —y los dos extremos, donde el perfil coincide
 * con el terreno por construcción— salían con una cubeta de medio metro a su
 * alrededor: una calva de tierra pelada de ocho metros justo en el pie, contra
 * la losa de la plaza, que es el sitio de toda la obra donde peor sienta.
 */
export function stairwayCuts(field) {
  const plan = stairwayPlan(field);
  const TRAMO = 3.0;
  /** Cuánto se hinca la caja por debajo de la huella. */
  const CAMA = 0.35;
  const n = Math.max(2, Math.round(plan.largo / TRAMO));
  const cortes = [];
  for (let i = 0; i < n; i++) {
    const lA = (i / n) * plan.largo;
    const lB = ((i + 1) / n) * plan.largo;
    const a = enL(plan, lA);
    const b = enL(plan, lB);
    const cotaA = cotaEnL(plan, lA);
    const cotaB = cotaEnL(plan, lB);
    // Cuánto sube la ladera por encima de la huella, medido en el eje y en los
    // DOS bordes. Mirando solo el eje se escapa el caso que importa: como la
    // escalinata cruza el talud en diagonal, su borde de arriba puede estar
    // metro y medio por encima del centro, así que hay tramos que en el eje van
    // sobre terraplén y aun así tienen media ladera cayéndoles sobre las huellas.
    const enterrado = (p, cota) => {
      const nx = -p.tz;
      const nz = p.tx;
      let peor = -Infinity;
      for (const off of [-STAIRWAY.ancho * 0.5, 0, STAIRWAY.ancho * 0.5]) {
        peor = Math.max(peor, field.height(p.x + nx * off, p.z + nz * off) - cota);
      }
      return peor;
    };
    if (enterrado(a, cotaA) < 0.2 && enterrado(b, cotaB) < 0.2) continue;
    cortes.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      halfWidth: STAIRWAY.ancho * 0.5 + STAIRWAY.muro + 0.5,
      // La falda del desmonte, tendida a propósito. Con 3 m el talud excavado
      // salía al 80 % y el sombreado del terreno lo pinta como tierra pelada:
      // cuarenta metros de cicatriz marrón a los lados de la obra. Con 4,5 el
      // banco baja del 55 % y aguanta hierba, y el corte se sigue leyendo como
      // corte porque lo que lo define es el muro, no el talud.
      blend: 4.5,
      floorA: cotaA - CAMA,
      floorB: cotaB - CAMA,
    });
  }
  return cortes;
}

/** El perfil ajustado a `l` metros del pie, interpolado entre muestras. */
function perfilEnL(plan, l) {
  const { acum, perfil } = plan;
  const objetivo = Math.min(plan.largo, Math.max(0, l));
  let i = 1;
  while (i < acum.length - 1 && acum[i] < objetivo) i++;
  const t = (objetivo - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
  return perfil[i - 1] + (perfil[i] - perfil[i - 1]) * t;
}

/**
 * Pasarela para `walkHeight`: por dónde se anda al subir.
 *
 * Hace falta porque la escalinata es FÁBRICA, no terreno. En los tramos
 * excavados el suelo del desmonte ya deja la cámara a la altura de las huellas,
 * pero en los que van sobre terraplén el terreno queda metros por debajo y la
 * cámara subiría por dentro del muro en vez de por encima de los escalones.
 *
 * **El suelo de la pasarela es el PERFIL LISO, no la altura del peldaño.** Es
 * la rampa de colisión que hay debajo de una escalera dibujada, y se hace así en
 * cualquier juego: los escalones son lo que se ve, la rampa es por donde se
 * anda. La primera versión usaba la cota del peldaño y la muestreaba cada dos
 * metros; como una huella mide 69 cm, cada tramo se comía tres contrahuellas y
 * el suelo daba **saltos de 1,08 m**, por encima de cualquier tolerancia de
 * escalón razonable. Resultado: la escalinata era intransitable a los dos metros
 * de empezar, y el fallo se leía como «el límite de pendiente está mal».
 *
 * Se sube media contrahuella sobre el perfil para ir por el centro del peldaño
 * en vez de rozando su arranque.
 */
export function stairwayWalkways(field) {
  const plan = stairwayPlan(field);
  // Fino: el trazado es curvo y la pasarela se interpola en recto entre
  // extremos, así que tramos largos cortan la curva por dentro.
  const TRAMO = 1.0;
  const media = plan.contrahuella * 0.5;
  const n = Math.max(2, Math.round(plan.largo / TRAMO));
  const tramos = [];
  for (let i = 0; i < n; i++) {
    const lA = (i / n) * plan.largo;
    const lB = ((i + 1) / n) * plan.largo;
    const a = enL(plan, lA);
    const b = enL(plan, lB);
    tramos.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      halfWidth: STAIRWAY.ancho * 0.5,
      floorA: perfilEnL(plan, lA) + media,
      floorB: perfilEnL(plan, lB) + media,
    });
  }

  // Los tramos de entrega TAMBIÉN son fábrica y también se declaran.
  //
  // Sin esto la escalinata se puede subir entera y no se puede salir de ella.
  // Al pisar fuera de la pasarela, en la cima, se cae a un socavón de metro y
  // pico que dejan entre sí el desmonte de la escalinata y la falda de la
  // explanada de Habilidades; el lado de dentro remonta al 64 %, dos puntos por
  // encima del límite de pendiente, y el visitante se queda encerrado en el
  // último peldaño después de haber subido veintiún metros. La entrega cubre
  // exactamente ese hueco —para eso se construyó— así que lo que faltaba era
  // decirlo.
  for (const entrega of plan.entregas) {
    const mini = planEntrega(plan, field, entrega);
    if (!mini) continue;
    const a = mini.puntos[0];
    const b = mini.puntos[mini.puntos.length - 1];
    const suelo = mini.y0 + mini.contrahuella * 0.5;
    tramos.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      // Más ancha que la escalinata a propósito. El desmonte deja un labio de
      // pendiente 0,86 justo donde la obra entrega en la explanada, y con el
      // corredor a la anchura justa cualquier desvío de metro y medio te tira a
      // él y ya no se sale: se puede subir la escalinata entera y quedarse sin
      // poder entrar en Habilidades.
      halfWidth: STAIRWAY.ancho * 0.5 + 1.6,
      floorA: suelo,
      floorB: mini.y1 + mini.contrahuella * 0.5,
    });
    // Y un tramo más, del pie de la entrega hacia el centro del estrado, hasta
    // pisar llano de verdad. Es lo que cierra el paso del talud a la explanada.
    const haciaDentro = {
      x: (entrega.centro.x - a.x) / Math.max(1e-6, Math.hypot(entrega.centro.x - a.x, entrega.centro.z - a.z)),
      z: (entrega.centro.z - a.z) / Math.max(1e-6, Math.hypot(entrega.centro.x - a.x, entrega.centro.z - a.z)),
    };
    const dentro = { x: a.x + haciaDentro.x * 3.5, z: a.z + haciaDentro.z * 3.5 };
    tramos.push({
      ax: a.x,
      az: a.z,
      bx: dentro.x,
      bz: dentro.z,
      halfWidth: STAIRWAY.ancho * 0.5 + 1.6,
      floorA: suelo,
      floorB: Math.max(suelo, field.height(dentro.x, dentro.z)),
    });
  }
  return tramos;
}

/**
 * El trazado como cadena de círculos vedados: ni hierba, ni matas, ni árboles,
 * ni cantos del pedregal sobre los escalones.
 */
export function stairwayKeepOut(field) {
  const plan = stairwayPlan(field);
  const radio = STAIRWAY.ancho * 0.5 + STAIRWAY.muro + 1.2;
  const zonas = [];
  const paso = radio * 0.9;
  for (let l = 0; l <= plan.largo; l += paso) {
    const p = enL(plan, l);
    zonas.push({ x: p.x, z: p.z, radius: radio });
  }
  return zonas;
}

// ---------------------------------------------------------------- geometría

/**
 * Huellas y contrahuellas, en una sola malla.
 *
 * Cada huella es una banda del trazado a cota constante y cada contrahuella el
 * plano vertical que la levanta sobre la anterior. Se sube la banda en columnas
 * a lo ancho para que siga la curva: con dos vértices por lado, un escalón en la
 * parte curva del trazado cortaba la esquina y dejaba el murete al aire.
 *
 * **Huella y contrahuella NO comparten vértices**, y esa es la diferencia entre
 * una escalinata y una rampa. Cosiendo la contrahuella a la última fila de la
 * huella se ahorran vértices, pero entonces `computeVertexNormals` promedia la
 * normal de una cara horizontal con la de una vertical y devuelve un plano a 45°
 * en cada canto: los sesenta y nueve escalones se sombrean como una única
 * superficie lisa y desde veinte metros la obra entera se lee como un tobogán de
 * pizarra. Se duplican los cantos a propósito, que es lo que le da a cada peldaño
 * su línea de sombra.
 *
 * Las UV van `u` a lo ancho y `v` a lo largo de la SUPERFICIE, en metros
 * divididos por el tamaño de losa, así que las piezas salen a la misma escala
 * aquí que en el estrado.
 *
 * «A lo largo de la superficie» y no «a lo largo del trazado», y esa es toda la
 * diferencia en las contrahuellas: una contrahuella avanza cuatro centímetros y
 * medio en planta y sube treinta y seis, así que mapeada con la coordenada del
 * trazado le toca el 2 % de una losa estirado sobre el canto entero. El
 * resultado es el mismo defecto que tenían las contrahuellas del estrado —vetas
 * verticales, madera en vez de piedra— pero peor, porque aquí hay cincuenta y
 * ocho seguidas y de lejos se leen como un galón negro dentado sobre cada
 * peldaño. Parece un problema de sombras y no lo es.
 */
function cuerpoGeometry(plan, ruido) {
  const { ancho } = STAIRWAY;
  const LOSA = 2.2;
  const COLUMNAS = 6;
  /** Vuelo del canto sobre la contrahuella. Es lo que da la sombra del peldaño. */
  const NARIZ = 0.045;
  const positions = [];
  const uvs = [];
  const indices = [];

  const fila = (l, y, v) => {
    const base = positions.length / 3;
    const p = enL(plan, l);
    // Normal a la marcha, en el plano.
    const nx = -p.tz;
    const nz = p.tx;
    for (let c = 0; c <= COLUMNAS; c++) {
      const u = c / COLUMNAS - 0.5;
      const off = u * ancho;
      // Las huellas ceden un poco hacia el centro, como una piedra pisada mil
      // años. Sin esto la escalinata es un plano inclinado perfecto y se lee
      // como rampa de hormigón.
      //
      // Suave y SIN ruido por columna. El primer intento le sumaba ruido en `c`,
      // y como la huella solo tiene seis columnas, cada una quedaba inclinada
      // hacia un lado distinto.
      const hundido = (0.25 - u * u) * 0.055 + ruido.noise2(l * 0.3, 4.1) * 0.012;
      positions.push(p.x + nx * off, y - hundido, p.z + nz * off);
      uvs.push((off + ancho * 0.5) / LOSA, v / LOSA);
    }
    return base;
  };

  /**
   * Cose dos filas consecutivas.
   *
   * El giro es `columna → avance`. Las filas se recorren a lo ancho en dirección
   * `n = (−tz, tx)` y avanzan en `t = (tx, tz)`, así que coser al revés daría
   * `t × n = (0, −1, 0)` y las huellas mirarían al suelo. Aquí no se NOTA —el
   * material va a doble cara y Three invierte la normal en las caras traseras—
   * pero la malla se exporta y se le calculan sombras, así que vale la pena que
   * esté bien orientada.
   */
  const cose = (a, b) => {
    for (let c = 0; c < COLUMNAS; c++) {
      indices.push(a + c, a + c + 1, b + c, a + c + 1, b + c + 1, b + c);
    }
  };

  // Recorrido POR LA SUPERFICIE: suma el fondo de cada huella y la altura de
  // cada contrahuella. Es la coordenada con la que se mapea la piedra, y también
  // la distancia que de verdad recorre el pie.
  let v = 0;
  plan.huellas.forEach((h, i) => {
    const siguiente = plan.huellas[i + 1];
    const fondo = h.lFin - h.lIni;
    if (fondo > 1e-3) {
      // Un rellano largo necesita tramos intermedios o la curva se corta.
      const tramos = Math.max(1, Math.round(fondo / 0.55));
      let anterior = fila(h.lIni, h.y, v);
      for (let t = 1; t <= tramos; t++) {
        const avance = (fondo * t) / tramos;
        const actual = fila(h.lIni + avance, h.y, v + avance);
        cose(anterior, actual);
        anterior = actual;
      }
      v += fondo;
    }
    if (!siguiente) return;
    // Contrahuella, con vértices propios: arranca un poco POR DETRÁS del canto
    // de la huella, así que el peldaño vuela sobre ella y proyecta su sombra.
    const alto = siguiente.y - h.y;
    const abajo = fila(Math.max(h.lIni, h.lFin - NARIZ), h.y, v);
    const arriba = fila(siguiente.lIni, siguiente.y, v + alto);
    cose(abajo, arriba);
    v += alto;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Murete lateral: parapeto por dentro y muro de contención por fuera.
 *
 * Es la misma pieza que la falda del estrado y por la misma razón. La escalinata
 * es rígida y la ladera no: por el lado de arriba el terreno se le echa encima y
 * por el de abajo se le va, y sin muro los escalones acaban volando por un
 * costado. El canto inferior se muestrea metro a metro contra el terreno REAL,
 * así que cierra exactamente donde tiene que cerrar.
 *
 * Va sin UV: `rockMaterial` proyecta la textura en triplanar desde la posición,
 * así que la sillería sale a escala sea cual sea la forma de la pieza.
 *
 * @param {number} lado -1 o +1.
 */
function muroGeometry(plan, field, lado) {
  const { ancho, muro, parapeto } = STAIRWAY;
  const positions = [];
  const indices = [];
  const PASO = 0.6;
  const n = Math.max(2, Math.round(plan.largo / PASO));

  // Cuatro cantos por sección: interior-alto, exterior-alto, exterior-bajo y el
  // pie del parapeto por dentro.
  for (let i = 0; i <= n; i++) {
    const l = (i / n) * plan.largo;
    const p = enL(plan, l);
    const nx = -p.tz * lado;
    const nz = p.tx * lado;
    const rIn = ancho * 0.5;
    const rOut = ancho * 0.5 + muro;
    const cota = cotaEnL(plan, l);
    const coronacion = cota + parapeto;
    const suelo = field.height(p.x + nx * (rOut + 0.3), p.z + nz * (rOut + 0.3));
    // Medio metro por debajo del suelo: el muro se hinca, no se apoya.
    const pie = Math.min(cota - 0.15, suelo - 0.5);

    positions.push(
      p.x + nx * rIn, cota, p.z + nz * rIn,             // 0 pie interior
      p.x + nx * rIn, coronacion, p.z + nz * rIn,       // 1 interior alto
      p.x + nx * rOut, coronacion, p.z + nz * rOut,     // 2 exterior alto
      p.x + nx * rOut, pie, p.z + nz * rOut             // 3 exterior bajo
    );
  }

  /**
   * Cose un cuadrilátero con el giro que haga que mire hacia `fuera`.
   *
   * Escribir el giro a mano en un muro que va en dos sentidos es pedir el fallo:
   * la primera versión los tenía cambiados y el murete del lado del mar salía
   * con las normales del revés, o sea invisible —el material no dibuja caras
   * traseras— mientras el otro se veía perfectamente. Aquí el giro se deduce de
   * la geometría: se prueba, se mide la normal y se invierte si no apunta a
   * donde tiene que apuntar.
   */
  const cose = (p0, p1, q0, q1, fuera) => {
    const v = (k) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
    const normal = new THREE.Vector3()
      .subVectors(v(q0), v(p0))
      .cross(new THREE.Vector3().subVectors(v(p1), v(p0)));
    if (normal.dot(fuera) >= 0) indices.push(p0, q0, p1, p1, q0, q1);
    else indices.push(p0, p1, q0, p1, q1, q0);
  };

  const arriba = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    const l = (i / n) * plan.largo;
    const p = enL(plan, l);
    const haciaFuera = new THREE.Vector3(-p.tz * lado, 0, p.tx * lado);
    const haciaDentro = haciaFuera.clone().negate();
    // Cara interior (mira a los escalones), coronación y cara exterior.
    cose(a + 0, a + 1, b + 0, b + 1, haciaDentro);
    cose(a + 1, a + 2, b + 1, b + 2, arriba);
    cose(a + 2, a + 3, b + 2, b + 3, haciaFuera);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Tramo de entrega: baja del prado al enlosado rehundido de un estrado.
 *
 * Un estrado de este mundo es una plataforma REHUNDIDA — sus peldaños
 * concéntricos bajan hacia fuera— así que su losa acaba metro y pico POR DEBAJO
 * del prado y el muro de contención cierra ese salto. Sin este tramo, la
 * escalinata muere en el prado a metro ochenta por encima de la piedra a la que
 * lleva: llega al borde del círculo, no al círculo.
 *
 * Se devuelve un PLAN, no una malla, y ese es el truco. `cuerpoGeometry` y
 * `muroGeometry` solo miran `puntos`, `acum`, `largo` y `huellas`, así que un
 * tramo recto de cuatro peldaños es una escalinata en miniatura y sale con sus
 * mismos escalones, sus mismos muretes y su misma piedra. El primer intento usó
 * `createSteps` de `Dais.js`, que hace losas SUELTAS: las cotas salían exactas
 * —medidas— pero sin costados, y cuatro losas flotando sobre la hierba no se
 * leen como una escalera.
 *
 * Va de la LOSA HACIA FUERA para que suba, que es como espera las huellas
 * `cuerpoGeometry`; el visitante lo recorre al revés.
 */
function planEntrega(plan, field, entrega) {
  const d = DAIS[entrega.id];
  const p = enL(plan, entrega.l);
  const cotaBorde = cotaEnL(plan, entrega.l);
  // Cota del peldaño más bajo del estrado, calculada como la calcula él.
  const cotaLosa = field.height(entrega.centro.x, entrega.centro.z) - d.steps * DAIS_STEP_DROP + 0.04;
  const caida = cotaBorde - cotaLosa;
  if (caida < 0.4) return null;

  const numero = Math.max(2, Math.round(caida / STAIRWAY.contrahuella));
  const contrahuella = caida / numero;
  const rBorde = Math.hypot(p.x - entrega.centro.x, p.z - entrega.centro.z);
  const rLosa = d.radius + (d.steps - 1) * d.stepWidth + d.stepWidth * 0.45;
  // Se entrega dentro de la huella del peldaño más bajo, no en su canto, pero
  // sin pasarse de largo: la dirección ya no apunta al centro, así que avanzar
  // no reduce el radio metro a metro.
  const largo = Math.min(4.5, Math.max(1.5, rBorde - rLosa));

  // Dirección: la BISECTRIZ entre seguir la escalinata y apuntar al estrado.
  //
  // Ninguna de las dos sola vale, y por el mismo motivo: el trazado llega a
  // Habilidades casi de costado —los últimos nodos de la panza cierran sobre el
  // eje moviéndose de lado—, así que la tangente y el radio forman 75°.
  //
  //  - Apuntando al CENTRO, la entrega se dobla 75° respecto a la escalinata:
  //    queda ese codo raro que se veía en las capturas del pie, y sus muretes
  //    cruzan el paso.
  //  - Siguiendo la TANGENTE queda alineada y preciosa, pero avanzar por ella
  //    apenas reduce el radio: el tramo ya no tiende el puente que era su única
  //    razón de existir, y al llegar arriba no se puede entrar en el estrado.
  //
  // La bisectriz deja un quiebro de 29° —que se lee como un giro de verdad— y
  // conserva el 86 % del avance hacia el centro, suficiente para alcanzar la
  // losa.
  const signo = entrega.l <= 0 ? -1 : 1;
  const radial = { x: (entrega.centro.x - p.x) / rBorde, z: (entrega.centro.z - p.z) / rBorde };
  const mezcla = { x: p.tx * signo + radial.x, z: p.tz * signo + radial.z };
  const norma = Math.hypot(mezcla.x, mezcla.z) || 1;
  const dx = mezcla.x / norma;
  const dz = mezcla.z / norma;
  // Origen en la losa, avanzando hacia el prado: así el tramo SUBE.
  const oX = p.x + dx * largo;
  const oZ = p.z + dz * largo;

  const MUESTRAS = 12;
  const puntos = [];
  const acum = [];
  for (let i = 0; i <= MUESTRAS; i++) {
    const t = i / MUESTRAS;
    puntos.push({ x: oX - dx * largo * t, z: oZ - dz * largo * t });
    acum.push(largo * t);
  }

  const paso = largo / (numero + 1);
  const huellas = [];
  for (let k = 0; k <= numero; k++) {
    huellas.push({ lIni: k * paso, lFin: (k + 1) * paso, y: cotaLosa + k * contrahuella });
  }

  return { puntos, acum, largo, huellas, y0: cotaLosa, y1: cotaBorde, contrahuella, numero };
}

/**
 * La escalinata completa, en coordenadas de MUNDO.
 *
 * @param {import('../world/Terrain.js').TerrainField} field
 */
export function createStairway(field) {
  const plan = stairwayPlan(field);
  const grupo = new THREE.Group();
  grupo.name = 'escalinata';
  const ruido = new SimplexNoise(STAIRWAY.seed);

  // ---- Escalones ---------------------------------------------------------
  const losa = flagstone({ seed: STAIRWAY.seed, repeat: 1 });
  const matEscalones = new THREE.MeshStandardMaterial({
    map: losa.map.clone(),
    normalMap: losa.normalMap.clone(),
    normalScale: new THREE.Vector2(1.15, 1.15),
    color: 0xb8b3a6,
    roughness: 0.93,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // Las UV ya van en metros/losa, así que la repetición es 1: cambiarla aquí
  // volvería a estirar la piedra como pasaba en las contrahuellas del estrado.
  matEscalones.map.wrapS = matEscalones.map.wrapT = THREE.RepeatWrapping;
  matEscalones.normalMap.wrapS = matEscalones.normalMap.wrapT = THREE.RepeatWrapping;
  matEscalones.name = 'escalinata';
  applyToonShading(matEscalones, { ...TOON_PRESETS.paving, key: 'paving-stair' });

  const escalones = new THREE.Mesh(cuerpoGeometry(plan, ruido), matEscalones);
  escalones.name = 'escalinata-escalones';
  escalones.castShadow = true;
  escalones.receiveShadow = true;
  grupo.add(escalones);

  // ---- Muretes -----------------------------------------------------------
  const matMuro = rockMaterial();
  for (const lado of [-1, 1]) {
    const m = new THREE.Mesh(muroGeometry(plan, field, lado), matMuro);
    m.name = `escalinata-muro-${lado > 0 ? 'mar' : 'tierra'}`;
    m.castShadow = true;
    m.receiveShadow = true;
    grupo.add(m);
  }

  // ---- Jambas: una pareja al pie, otra en el rellano, otra en lo alto -----
  // No es un corro alrededor de nada: son tres puertas sobre el eje de marcha,
  // que es lo que dice «por aquí se sube» desde lejos.
  const rellano = plan.huellas.reduce((mejor, h) =>
    h.lFin - h.lIni > mejor.lFin - mejor.lIni ? h : mejor
  );
  const puertas = [
    { l: 1.2, alto: 3.6 },
    { l: (rellano.lIni + rellano.lFin) * 0.5, alto: 3.1 },
    { l: plan.largo - 1.2, alto: 3.4 },
  ];
  puertas.forEach((puerta, i) => {
    const p = enL(plan, puerta.l);
    const nx = -p.tz;
    const nz = p.tx;
    const cota = cotaEnL(plan, puerta.l);
    for (const lado of [-1, 1]) {
      // FUERA del corredor, no a caballo de él.
      //
      // A medio murete (2,61 m del eje) la cara interior de la jamba cae en
      // 2,03, o sea DENTRO de la pasarela de 2,3 m: estrechaban el paso a
      // 1,58 m por lado y arriba, donde además hay que girar, el visitante se
      // encajaba entre las dos. Puestas a un murete completo su cara interior
      // queda en 2,35 y el corredor entero queda libre.
      const off = (STAIRWAY.ancho * 0.5 + STAIRWAY.muro) * lado;
      const piedra = stoneMesh(
        createStone({
          width: 1.15,
          height: puerta.alto,
          depth: 0.85,
          seed: STAIRWAY.seed + i * 31 + (lado > 0 ? 7 : 0),
          detail: 5,
          roundness: 0.22,
          erosion: 0.12,
          taper: 0.11,
          facetSharpness: 0.7,
          dressedFace: 0.8,
        }),
        { name: `escalinata-jamba-${i}-${lado > 0 ? 'mar' : 'tierra'}` }
      );
      // Hincada: arranca por debajo de la coronación del murete.
      piedra.position.set(p.x + nx * off, cota - 0.5, p.z + nz * off);
      piedra.rotation.y = Math.atan2(p.tx, p.tz);
      grupo.add(piedra);
    }
  });

  // ---- Entrega en los dos estrados ---------------------------------------
  // Ver `planEntrega`: cada tramo es una escalinata en miniatura, así que sale
  // con los mismos escalones y los mismos muretes que el cuerpo principal.
  for (const entrega of plan.entregas) {
    const mini = planEntrega(plan, field, entrega);
    if (!mini) continue;
    const cuerpo = new THREE.Mesh(cuerpoGeometry(mini, ruido), matEscalones);
    cuerpo.name = `escalinata-entrega-${entrega.id}`;
    cuerpo.castShadow = true;
    cuerpo.receiveShadow = true;
    grupo.add(cuerpo);
    for (const lado of [-1, 1]) {
      const m = new THREE.Mesh(muroGeometry(mini, field, lado), matMuro);
      m.name = `escalinata-entrega-${entrega.id}-muro-${lado > 0 ? 'a' : 'b'}`;
      m.castShadow = true;
      m.receiveShadow = true;
      grupo.add(m);
    }
  }

  grupo.userData.plan = plan;
  return grupo;
}

/** Solo para pruebas: olvida el trazado memoizado. */
export function _resetStairwayPlan() {
  _plan = null;
}
