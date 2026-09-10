/**
 * La escalinata que sube del prado a la isla flotante.
 *
 * Sustituye al sendero enlosado del Camino del Viajero. El sendero contaba lo
 * mismo —subía— pero moría en la hierba, y una trayectoria que no llega a
 * ninguna parte no es una trayectoria. Esta arranca donde arrancaba aquel,
 * asciende con los mojones a los lados y, pasado el último, SE DESPEGA DEL
 * SUELO y trepa por el aire hasta la cubierta de la isla.
 *
 * ── Por qué no se reutiliza `Stairway.js` ──────────────────────────────────
 *
 * La escalinata a Habilidades resuelve otro problema. Su plan sale de las
 * constantes de `STAIRWAY`, se ajusta contra el terreno en toda su longitud y
 * da por hecho que cada peldaño se apoya en tierra: `perfilAjustado` existe
 * precisamente para pegar el perfil al suelo. Aquí la mitad del recorrido no
 * tiene suelo debajo. Generalizarla habría sido tocar novecientas líneas que
 * hoy funcionan para que sirvieran a un caso que no se les parece.
 *
 * ── El tramo del aire tiene que tener PANZA ────────────────────────────────
 *
 * En tierra basta con una cinta de peldaños: lo que hay debajo es monte, y la
 * falda lo tapa. En el aire se ve por debajo, y una cinta sin grosor vista
 * desde abajo es una hoja de papel. Por eso la escalinata se construye como un
 * SÓLIDO: la cara de arriba escalona, la de abajo es una rampa lisa que sigue
 * la misma curva un poco más honda, y los costados las cosen. Es también lo
 * que le da el canto de sombra que la separa del cielo.
 *
 * ── Peldaños de altura constante, no de terreno ────────────────────────────
 *
 * La huella se estira y se encoge para que la contrahuella sea siempre la
 * misma. Al revés —huella fija y contrahuella variable— la parte de tierra
 * salía con peldaños de tres centímetros donde el prado es llano y de medio
 * metro en la cuesta, que no es una escalinata: es un montón de losas.
 */

import * as THREE from 'three';
import { rockMaterial } from './StoneFactory.js';
import { PALETTE } from '../config.js';
import { SimplexNoise } from '../utils/noise.js';

/** Ancho de la escalinata, de borde a borde. */
export const ANCHO = 4.6;

/**
 * Grosor del sólido bajo los peldaños.
 *
 * Generoso a propósito. En el tramo de tierra la panza tiene que quedar POR
 * DEBAJO del terreno en todo su ancho, o el prado asoma por debajo del canto y
 * la escalinata se ve partida en losas sueltas flotando sobre la hierba, que es
 * exactamente como salió la primera versión.
 */
const PANZA = 2.4;

/**
 * Cuánto se levantan las huellas sobre el terreno en el tramo de tierra.
 *
 * A ras de suelo la hierba se dibuja por encima y se come la mitad de los
 * peldaños. Es obra: tiene que verse que está puesta encima del monte.
 */
const REALCE = 0.3;

/**
 * Contrahuella que se busca mantener en todo el recorrido.
 *
 * El techo no lo pone el gusto, lo pone `escalon: 0.55` del paseo: por encima
 * de esa altura la cámara a pie lee el peldaño como una pared y no lo sube. La
 * contrahuella real se pasa un poco de la buscada —el muestreo de la curva
 * avanza a saltitos y el terreno puede subir dentro de uno— así que con 0,4 la
 * peor salía a 0,50 y quedaban cinco centímetros de margen. Con 0,34 la peor se
 * queda por debajo de 0,46 y el margen es de un palmo.
 */
const CONTRAHUELLA = 0.34;

/**
 * Trazado en planta, en coordenadas LOCALES del santuario.
 *
 * Los siete primeros puntos son EXACTAMENTE los del sendero que había: el
 * arranque, la ese y los mojones siguen donde estaban, y lo que se añade es la
 * prolongación hacia la isla. Cambiar también el trazado de abajo habría movido
 * los tres mojones y el estrado de arranque sin ninguna necesidad.
 *
 * @param {number} avanceIsla  Distancia del centro de la isla al final del tramo de tierra.
 */
export function escalinataCurva(avanceIsla) {
  const puntos = [];
  for (let i = 0; i < PUNTOS_TIERRA; i++) {
    const t = i / (PUNTOS_TIERRA - 1);
    puntos.push(new THREE.Vector2(Math.sin(t * Math.PI * 1.15) * 11 - 1, 8 + t * 42));
  }
  const fin = puntos[puntos.length - 1];
  // El vuelo: una ese al revés que la de abajo, para que las dos curvas no se
  // lean como una sola comba larga. Aterriza dentro del disco de la isla, no en
  // su borde: un último peldaño en el canto se ve colgando desde media isla.
  // Comba SUAVE, no una ese marcada.
  //
  // La primera versión salía del prado con un quiebro de ocho unidades en seis:
  // un giro de cincuenta y tres grados justo donde la escalinata empieza a
  // volar. Subiendo se lee bien desde fuera y es intransitable desde dentro —
  // el paseo se salía por el lado en la curva y caía al prado, y allí volver a
  // subir era un escalón de metro y medio, o sea un muro. Se atascaba en el
  // peldaño 50 de 101.
  //
  // Lo que se dibuja tiene que poder andarse: si el trazado obliga a girar más
  // rápido de lo que se anda, no es un camino, es un adorno con forma de camino.
  // Los puntos del vuelo van en FRACCIONES de su largo, no en metros fijos.
  //
  // Estaban en +8, +17 y +24 desde el prado, con la isla a treinta y siete. Al
  // alejarla a sesenta, los tres se quedaron amontonados en el primer tercio y
  // el resto era una recta larguísima: el trazado se deformaba al mover la
  // isla, que es justo lo que no puede pasar cuando la distancia es el número
  // que se toca para ajustar la pendiente.
  const L = avanceIsla + ENTRADA.z;
  puntos.push(new THREE.Vector2(fin.x + 3.5, fin.y + L * 0.2));
  puntos.push(new THREE.Vector2(fin.x + 5.5, fin.y + L * 0.42));
  puntos.push(new THREE.Vector2(fin.x + 3.0, fin.y + L * 0.64));
  puntos.push(new THREE.Vector2(fin.x + 0.5, fin.y + L * 0.84));
  puntos.push(new THREE.Vector2(fin.x + ENTRADA.x, fin.y + L));
  return new THREE.SplineCurve(puntos);
}

/** Puntos de control del tramo que pisa tierra. Son los del sendero de antes. */
const PUNTOS_TIERRA = 7;

/** Y los del vuelo. */
const PUNTOS_VUELO = 5;

/**
 * Dónde aterriza la escalinata, en coordenadas de la ISLA.
 *
 * Dentro del disco y no en el canto: un último peldaño en el borde se ve
 * colgando desde media isla. Lo publica este módulo porque quien traza la
 * escalinata es quien sabe dónde acaba, y la isla lo necesita para no plantar
 * un carballo en la boca de la escalera.
 */
export const ENTRADA = { x: -2.5, z: -12 };

/**
 * Parámetro de la curva en el que la escalinata deja de tocar el suelo.
 *
 * Derivado, no escrito a mano. `SplineCurve` reparte los puntos de control a
 * intervalos iguales del parámetro, así que el despegue cae en el punto de
 * control número siete; con el número a pelo, añadir un punto al vuelo movía el
 * despegue sin que nada lo dijera —y con él los mojones, el menhir del presente
 * y el veto del arbolado, que se sitúan por este valor.
 */
export const U_DESPEGUE = (PUNTOS_TIERRA - 1) / (PUNTOS_TIERRA + PUNTOS_VUELO - 1);

/**
 * El perfil completo: un peldaño por elemento, ya en coordenadas locales.
 *
 * @param {(x:number,z:number)=>number} groundAt  Cota del terreno, en local.
 * @param {number} alturaCubierta  Cota LOCAL de la cubierta de la isla.
 * @param {number} avanceIsla
 * @param {{x:number,z:number}} centroIsla  En las mismas coordenadas que la curva.
 * @param {number} radioIsla
 */
export function escalinataPlan(groundAt, alturaCubierta, avanceIsla, centroIsla, radioIsla) {
  const curva = escalinataCurva(avanceIsla);
  const largo = curva.getLength();

  // Dónde entra la curva en la silueta de la isla.
  //
  // Hay que estar ARRIBA antes de llegar aquí. Subiendo hasta el final del
  // recorrido, los últimos seis peldaños quedaban por debajo de la cubierta
  // mientras ya estaban dentro del radio de la peña: la escalinata atravesaba
  // la roca por dentro y salía por el césped, como un tornillo. Desde fuera se
  // veían tramos de peldaños incrustados en la panza.
  //
  // El margen de 1,08 es por la cornisa, que vuela un 6 % más que la cubierta.
  const RESGUARDO = 1.08;
  let uBorde = 1;
  for (let i = 0; i <= 400; i++) {
    const u = U_DESPEGUE + (1 - U_DESPEGUE) * (i / 400);
    const q = curva.getPoint(u);
    if (Math.hypot(q.x - centroIsla.x, q.y - centroIsla.z) <= radioIsla * RESGUARDO) {
      uBorde = u;
      break;
    }
  }
  // Un pelo por encima del plano de la cubierta: el césped se abomba hasta un
  // palmo y con la cota exacta los últimos peldaños quedaban enterrados en él.
  const cotaLlegada = alturaCubierta + 0.12;

  // Cota buscada en cada punto: el terreno mientras haya terreno, y a partir
  // del despegue una subida suave hasta la cubierta. Con una recta, el enlace
  // entre las dos partes hacía un pico visible.
  const cotaEn = (u) => {
    const p = curva.getPoint(u);
    const suelo = groundAt(p.x, p.y);
    if (u <= U_DESPEGUE) return suelo + REALCE;
    const k = Math.min(1, (u - U_DESPEGUE) / (uBorde - U_DESPEGUE));
    const suave = k * k * (3 - 2 * k);
    return suelo + REALCE + (cotaLlegada - suelo - REALCE) * suave;
  };

  // Se recorre la curva a pasos finos y se emite un peldaño cada vez que se
  // acumula una contrahuella. Así la huella la marca la pendiente y no al revés.
  const FINO = 900;
  const peldanos = [];
  let cotaUltimo = cotaEn(0);
  let uUltimo = 0;
  peldanos.push({ u: 0, x: curva.getPoint(0).x, z: curva.getPoint(0).y, y: cotaUltimo });

  for (let i = 1; i <= FINO; i++) {
    const u = i / FINO;
    const cota = cotaEn(u);
    const p = curva.getPoint(u);
    const avance = (u - uUltimo) * largo;
    // Un peldaño nuevo cuando se ha subido una contrahuella O cuando se ha
    // andado demasiado en llano: sin lo segundo, el tramo plano del arranque
    // salía como una sola losa de doce metros.
    if (Math.abs(cota - cotaUltimo) >= CONTRAHUELLA || avance >= 2.4) {
      peldanos.push({ u, x: p.x, z: p.y, y: cota });
      cotaUltimo = cota;
      uUltimo = u;
    }
  }
  const uf = 1;
  const pf = curva.getPoint(uf);
  peldanos.push({ u: uf, x: pf.x, z: pf.y, y: cotaEn(uf) });

  return { curva, peldanos, largo, uDespegue: U_DESPEGUE, uBorde };
}

/**
 * La malla: cara de arriba escalonada, panza lisa y costados.
 *
 * Se construye por TRAMOS y con transparencia por vértice, que es lo que
 * permite que la escalinata deje de ser piedra a mitad de camino. Ver
 * `createEscalinataIsla`.
 *
 * @param {number} desde   Primer peldaño (incluido).
 * @param {number} hasta   Último (excluido).
 * @param {(i:number)=>number} alfa  Opacidad del peldaño `i`, de 0 a 1.
 */
function escalinataGeometry(plan, seed, desde = 0, hasta = Infinity, alfa = null) {
  const ruido = new SimplexNoise(seed);
  const pos = [];
  const idx = [];

  const { curva, peldanos } = plan;
  const medio = ANCHO / 2;

  // Normal horizontal en un punto de la curva.
  const normalEn = (u) => {
    const t = curva.getTangent(Math.min(0.9999, Math.max(0.0001, u)));
    return new THREE.Vector2(t.y, -t.x).normalize();
  };

  // El material de la cantería del sitio, no un gris propio.
  //
  // La primera versión pintaba color por vértice entre `rock` y `rockDark` y
  // salía una cinta casi blanca: al lado de los menhires, que llevan el
  // material triplanar con su grano y su liquen, parecía de otro juego.
  const col = [];
  let aHora = 1;
  const empujar = (x, y, z) => {
    const n = ruido.noise3(x * 0.4, y * 0.4, z * 0.4);
    pos.push(x, y + n * 0.03, z);
    // El cuarto canal es la opacidad: three lo usa cuando el atributo de color
    // tiene cuatro componentes y el material lleva `vertexColors`.
    col.push(1, 1, 1, aHora);
    return pos.length / 3 - 1;
  };

  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);

  const fin = Math.min(peldanos.length - 1, hasta);
  for (let i = Math.max(0, desde); i < fin; i++) {
    aHora = alfa ? alfa(i) : 1;
    const A = peldanos[i];
    const B = peldanos[i + 1];
    const nA = normalEn(A.u);
    const nB = normalEn(B.u);
    // Un dedo de vuelo en cada peldaño: es lo que le da la sombra que hace
    // legible el escalón desde lejos.
    const wA = medio + ruido.noise3(A.u * 9, 0, 0) * 0.09;
    const wB = medio + ruido.noise3(B.u * 9, 0, 0) * 0.09;

    // Huella: de A a B a la cota de A.
    const h0 = empujar(A.x - nA.x * wA, A.y, A.z - nA.y * wA);
    const h1 = empujar(A.x + nA.x * wA, A.y, A.z + nA.y * wA);
    const h2 = empujar(B.x + nB.x * wB, A.y, B.z + nB.y * wB);
    const h3 = empujar(B.x - nB.x * wB, A.y, B.z - nB.y * wB);
    quad(h0, h3, h2, h1);

    // Contrahuella: de la cota de A a la de B, en la vertical de B.
    const c0 = empujar(B.x - nB.x * wB, B.y, B.z - nB.y * wB);
    const c1 = empujar(B.x + nB.x * wB, B.y, B.z + nB.y * wB);
    quad(h3, c0, c1, h2);

    // Panza: la misma traza, PANZA metros más abajo de la cota de A, lisa.
    const p0 = empujar(A.x - nA.x * wA, A.y - PANZA, A.z - nA.y * wA);
    const p1 = empujar(A.x + nA.x * wA, A.y - PANZA, A.z + nA.y * wA);
    const p2 = empujar(B.x + nB.x * wB, B.y - PANZA, B.z + nB.y * wB);
    const p3 = empujar(B.x - nB.x * wB, B.y - PANZA, B.z - nB.y * wB);
    quad(p0, p1, p2, p3);

    // Costados, uno por banda, cosiendo huella y contrahuella con la panza.
    quad(h0, h3, p3, p0);
    quad(h1, p1, p2, h2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * El vidrio del tramo volado.
 *
 * `DoubleSide` no es un descuido: en un sólido opaco ver la cara de dentro es
 * un fallo, y en vidrio es justo lo que hace que parezca vidrio — se ve el
 * canto del peldaño de más allá a través del de más acá. Y por eso tampoco
 * escribe en el buffer de profundidad.
 */
function materialVidrio() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xcaf4f6,
    emissive: PALETTE.arcaneDeep,
    emissiveIntensity: 0.45,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
}

/**
 * Monta la escalinata.
 *
 * @returns {{grupo: THREE.Group, plan: object}}
 */
export function createEscalinataIsla({
  groundAt,
  alturaCubierta,
  avanceIsla,
  centroIsla,
  radioIsla,
  seed = 8821,
}) {
  const plan = escalinataPlan(groundAt, alturaCubierta, avanceIsla, centroIsla, radioIsla);
  const grupo = new THREE.Group();
  grupo.name = 'escalinata-isla';

  // Piedra abajo, vidrio arriba, y un cruce en medio.
  //
  // Es lo que cuenta la sección: lo andado empieza siendo tierra —cantería
  // sobre el monte, con la ladera pegada al canto— y a partir del punto en que
  // se despega deja de ser materia. No hay un corte: durante una docena de
  // peldaños el vidrio se va sobreponiendo a la piedra, así que la escalinata
  // no cambia de material, se transfigura.
  //
  // Dos mallas y no una porque los dos materiales no se mezclan por vértice.
  // La opacidad del vidrio SÍ va por vértice, y ese es el cruce.
  const corte = plan.peldanos.findIndex((e) => e.u >= plan.uDespegue);
  const SOLAPE = 14;
  const iCorte = corte < 0 ? Math.floor(plan.peldanos.length * 0.5) : corte;

  const piedra = new THREE.Mesh(
    escalinataGeometry(plan, seed, 0, iCorte + SOLAPE + 2),
    rockMaterial()
  );
  piedra.name = 'escalinata-isla-cuerpo';
  piedra.castShadow = true;
  piedra.receiveShadow = true;
  grupo.add(piedra);

  const vidrio = new THREE.Mesh(
    escalinataGeometry(plan, seed, Math.max(0, iCorte - 2), Infinity, (i) =>
      Math.min(1, Math.max(0, (i - (iCorte - 2)) / SOLAPE))
    ),
    materialVidrio()
  );
  vidrio.name = 'escalinata-isla-vidrio';
  vidrio.renderOrder = 3;
  grupo.add(vidrio);

  return { grupo, plan };
}

/**
 * La escalinata, como cadena de pasarelas para el modo a pie.
 *
 * Un tramo por peldaño, y el corredor CASI tan ancho como la obra.
 *
 * Iba medio metro más estrecho a cada lado, con la idea de que nadie anduviera
 * por el borde exacto del canto. El efecto fue el contrario: medio metro de
 * peldaño a cada lado se veía de piedra maciza y no tenía suelo, así que al
 * tomar una curva te salías por un lado que parecía firme, caías al prado seis
 * metros más abajo y desde allí volver a subir era un escalón de seis metros,
 * o sea un muro. Se atascaba en el peldaño 17 de 101.
 *
 * Al final el corredor va EXACTAMENTE tan ancho como la obra. La idea de
 * dejarle un margen «por seguridad» es la que provocó el fallo: cualquier
 * margen es piedra que se ve y no se pisa, y el pie se va por ella.
 *
 * Las cotas se dan en LOCAL y el campo de alturas las quiere en mundo, de ahí
 * `dy`: el grupo del santuario está desplazado en altura, y registrarlas tal
 * cual las dejaba sesenta y un metros por debajo de la escalinata que dicen
 * describir. En pantalla no se notaba nada —la obra estaba bien— y al andar el
 * suelo era el prado, como si no hubiera escalinata.
 *
 * @param {object} plan       El de `escalinataPlan`.
 * @param {(x:number,z:number)=>{x:number,z:number}} aMundo
 * @param {number} dy         Altura del grupo del santuario en el mundo.
 */
export function escalinataWalkways(plan, aMundo, { halfWidth = ANCHO / 2, dy = 0 } = {}) {
  const salida = [];
  const p = plan.peldanos;
  for (let i = 0; i + 1 < p.length; i++) {
    const A = aMundo(p[i].x, p[i].z);
    const B = aMundo(p[i + 1].x, p[i + 1].z);
    salida.push({
      ax: A.x,
      az: A.z,
      bx: B.x,
      bz: B.z,
      floorA: p[i].y + dy,
      floorB: p[i + 1].y + dy,
      halfWidth,
    });
  }
  return salida;
}
