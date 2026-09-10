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
import { createBoulder, createSlab, createStone, rockMaterial, stoneMesh } from './StoneFactory.js';
import { createTree, barkMaterial, leafMaterial } from './Tree.js';
import { radialSprite } from '../utils/textures.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { PALETTE, SEED } from '../config.js';
import { makeRandom, SimplexNoise } from '../utils/noise.js';

/** Radio de la cubierta: lo que se pisa. */
export const ISLA_RADIO = 16;

/**
 * Cuánto cuelga la quilla por debajo de la hierba.
 *
 * Holgada respecto al radio. Una peña tan honda como ancha se lee como un
 * peñasco arrancado; con la quilla corta se lee como una tarta, y una tarta no
 * flota — parece apoyada en algo que no se ve.
 */
export const ISLA_QUILLA = 23;

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
// Profundidades en FRACCIÓN de la quilla, no en metros.
//
// Estaban en metros y la quilla pasó de 17 a 23: los diez primeros anillos se
// quedaron donde estaban y el último se fue solo, así que la peña era un cono
// normal rematado por una aguja larguísima. Un perfil escrito en absolutos deja
// de ser un perfil en cuanto se toca el tamaño.
//
// Y estrecha DEPRISA desde la cornisa. Con los primeros anillos por encima del
// 0,8 del radio hasta un tercio de la profundidad, lo que se veía por debajo
// era un plato ancho y plano; una peña arrancada se estrecha desde el primer
// palmo.
const PERFIL = [
  [0.06, 1.06],
  [0.13, 0.98],
  [0.17, 1.02], // repisa: el radio VUELVE A CRECER, y eso es un alero
  [0.28, 0.78],
  [0.33, 0.84], // segunda repisa
  [0.46, 0.55],
  [0.58, 0.38],
  [0.64, 0.43], // tercera, ya menuda
  [0.78, 0.22],
  [0.9, 0.1],
  [1, 0],
];

/**
 * Radio del BORDE de la isla en un ángulo dado.
 *
 * Lo comparten la roca y la hierba, y ese es todo el asunto. Antes cada una
 * sacaba su irregularidad de un ruido propio —semillas distintas— así que ni
 * casaban entre sí ni hacía falta que casaran: para disimularlo, las dos iban
 * casi circulares. Y un disco perfecto es lo que delata que algo está hecho por
 * una máquina; en un promontorio de verdad no hay ni un canto redondo.
 *
 * Con un solo borde se puede morder de verdad: entrantes, salientes y algún
 * lóbulo, sabiendo que la hierba acaba exactamente donde empieza la peña.
 */
function radioBorde(ruido, th) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const n = ruido.noise3(c * 1.55, 0, s * 1.55);
  const m = ruido.noise3(c * 3.9, 0, s * 3.9) * 0.42;
  return ISLA_RADIO * (1 + (n + m) * 0.15);
}

/** Radio de la quilla —en fracción del radio de la isla— a una profundidad. */
export function radioEnProfundidad(y) {
  const k = Math.min(1, Math.max(0, -y / ISLA_QUILLA));
  let a = [0, 1];
  for (const par of PERFIL) {
    if (par[0] >= k) {
      const t = (k - a[0]) / (par[0] - a[0] || 1);
      return a[1] + (par[1] - a[1]) * t;
    }
    a = par;
  }
  return 0;
}

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
    const r = radioBorde(ruido, th);
    anillos.push([Math.cos(th) * r, 0, Math.sin(th) * r]);
  }
  let fase = 0;
  for (const [prof, k] of PERFIL) {
    if (k === 0) break;
    const y = -prof * ISLA_QUILLA;
    fase += 0.16 + (random() - 0.5) * 0.2;
    for (let i = 0; i < SEGMENTOS; i++) {
      const th = (i / SEGMENTOS) * Math.PI * 2;
      // El ruido crece hacia la punta: arriba la peña está cortada por la
      // hierba y abajo se deshace en lascas.
      anillos.push(punto(radioBorde(ruido, th) * k, y, th, 0.11 + (1 - k) * 0.26, fase));
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
      // Cara HACIA FUERA.
      //
      // Iba al revés: los 924 triángulos de la quilla miraban al centro, así
      // que con recorte por cara trasera lo que se veía desde fuera era la
      // superficie INTERIOR del otro lado, iluminada por la luz que entra por
      // arriba. De ahí que la peña se leyera como un cuenco oscuro y plano en
      // vez de como una roca: no estábamos mirando la roca.
      //
      // Es el mismo fallo que tenía el césped, y no se me ocurrió mirar aquí.
      idx.push(a, b, c, b, d, c);
    }
  }

  // La punta, cerrando el último anillo en un solo vértice.
  const punta = pos.length / 3;
  pos.push((random() - 0.5) * 1.2, -ISLA_QUILLA, (random() - 0.5) * 1.2);
  const ultimo = (filas - 1) * SEGMENTOS;
  for (let i = 0; i < SEGMENTOS; i++) {
    // El abanico de la punta, con el mismo sentido que los costados.
    idx.push(ultimo + i, ultimo + ((i + 1) % SEGMENTOS), punta);
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
  // La MISMA semilla que la quilla: es lo que hace que los dos bordes sean
  // el mismo borde y no dos parecidos.
  const ruido = new SimplexNoise(seed);
  const pos = [];
  const idx = [];

  const hondo = cotaCesped;
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
      const r = radioBorde(ruido, th) * k;
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
      0.16 +
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
 * Cota de la loma de hierba a un radio normalizado `k`.
 *
 * Vive fuera de `cespedGeometry` porque hay tres cosas que necesitan saber a
 * qué altura queda el prado y sólo una de ellas es el prado: los árboles y las
 * piedras se plantan sobre él, y a ojo quedan flotando o enterrados.
 */
export function cotaCesped(k) {
  return 0.3 * (1 - k * k) - 0.58 * Math.exp(-((k / 0.27) ** 2));
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
 * La lámina de agua del manantial.
 *
 * Con el mismo vocabulario que el mar de abajo, porque es el mismo mundo: red
 * de cáusticas de Worley, bandas de color por profundidad y espuma de orilla.
 * Antes era un disco translúcido de un solo tono — correcto y mudo, la clase de
 * pieza que no se mira dos veces.
 *
 * ── Lo que NO se copia del mar ─────────────────────────────────────────────
 *
 * El oleaje. Un mar tiene viento y kilómetros; un pilón de tres metros tiene
 * una piedra en el centro de la que mana. Así que las olas de Gerstner se
 * cambian por ondas CONCÉNTRICAS que salen del eje, que es lo que hace el agua
 * cuando brota, y por unas pocas gotas que caen y abren su propio anillo.
 *
 * Esas ondas hacen tres trabajos con una sola cuenta: mueven la superficie de
 * verdad en el vértice, deforman la red de cáusticas del fondo y quiebran el
 * reflejo. Calcularlas tres veces por separado habría dado tres aguas distintas
 * superpuestas.
 *
 * ── La malla es de anillos, no un abanico ──────────────────────────────────
 *
 * `CircleGeometry` es un abanico: todos los triángulos comparten el vértice del
 * centro y sólo hay vértices en el borde. Con eso el desplazamiento vertical no
 * tiene dónde ocurrir — el agua se movería sólo en el canto. De ahí el disco de
 * anillos.
 */
function discoDeAnillos(radio, anillos, segmentos) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  for (let a = 1; a <= anillos; a++) {
    const r = (a / anillos) * radio;
    for (let i = 0; i < segmentos; i++) {
      const th = (i / segmentos) * Math.PI * 2;
      pos.push(Math.cos(th) * r, 0, Math.sin(th) * r);
    }
  }
  for (let i = 0; i < segmentos; i++) idx.push(0, 1 + ((i + 1) % segmentos), 1 + i);
  for (let a = 1; a < anillos; a++) {
    for (let i = 0; i < segmentos; i++) {
      const j = (i + 1) % segmentos;
      const p = 1 + (a - 1) * segmentos;
      const q = 1 + a * segmentos;
      idx.push(p + i, q + i, p + j, p + j, q + i, q + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const AGUA_VERTEX = `
  uniform float uTime;
  uniform float uRadio;
  varying vec2 vPos;
  varying float vAltura;

  // Las mismas ondas que el fragmento, calculadas una vez.
  float ondas( vec2 p, float t ) {
    float r = length( p );
    // El pulso del manantial: anillos que salen del eje.
    float h = sin( r * 7.5 - t * 2.1 ) * 0.020 * smoothstep( 0.0, 0.5, r );
    h += sin( r * 15.0 - t * 3.4 ) * 0.008;
    // Tres gotas, cada una con su sitio y su compás.
    vec2 g1 = vec2( 0.42, -0.30 );
    vec2 g2 = vec2( -0.55, 0.18 );
    vec2 g3 = vec2( 0.10, 0.62 );
    h += sin( length( p - g1 ) * 22.0 - t * 5.0 ) * 0.006 * exp( -length( p - g1 ) * 1.6 );
    h += sin( length( p - g2 ) * 19.0 - t * 4.1 ) * 0.005 * exp( -length( p - g2 ) * 1.5 );
    h += sin( length( p - g3 ) * 25.0 - t * 6.2 ) * 0.004 * exp( -length( p - g3 ) * 1.8 );
    return h;
  }

  void main() {
    vPos = position.xz / uRadio;
    vAltura = ondas( position.xz, uTime );
    vec3 p = position;
    p.y += vAltura;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
  }
`;

const AGUA_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uHondo;
  uniform vec3 uSomero;
  uniform vec3 uEspuma;
  uniform vec3 uCaustica;
  uniform vec3 uBrillo;
  uniform float uNoche;
  varying vec2 vPos;
  varying float vAltura;

  vec2 hash22( vec2 p ) {
    p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
    return fract( sin( p ) * 43758.5453 );
  }

  // Red de cáusticas: distancia al borde entre celdas de Worley, F2 - F1.
  // F1 solo da manchas redondas; la diferencia es la que da la MALLA.
  float causticEdge( vec2 p, float t ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    float d1 = 8.0;
    float d2 = 8.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 o = hash22( i + g );
        o = 0.5 + 0.42 * sin( t * 0.85 + 6.2831 * o );
        float d = length( g + o - f );
        if ( d < d1 ) { d2 = d1; d1 = d; }
        else if ( d < d2 ) { d2 = d; }
      }
    }
    return d2 - d1;
  }

  void main() {
    float r = length( vPos );
    if ( r > 1.0 ) discard;

    // Profundidad: honda en la corona entre el menhir y el brocal, somera en
    // los dos bordes. Un pilón no es un cuenco liso.
    float hondura = smoothstep( 0.15, 0.55, r ) * ( 1.0 - smoothstep( 0.72, 1.0, r ) );
    vec3 color = mix( uSomero, uHondo, hondura * 0.85 );

    // La red del fondo, arrastrada por las ondas de la superficie. Es lo que
    // hace que el fondo se retuerza en vez de limitarse a desplazarse.
    // A escala de PILÓN, no de mar. Con 4,6 las celdas de Worley medían medio
    // metro sobre un charco de tres, así que la red salía como vetas de mármol:
    // no eran cáusticas, era el mismo patrón mirado demasiado de cerca.
    vec2 cp = vPos * 13.0 + vAltura * 34.0;
    float e1 = causticEdge( cp, uTime * 0.9 );
    float e2 = causticEdge( cp * 2.3 + 3.1, uTime * 1.3 );
    float red = pow( clamp( e1, 0.0, 1.0 ), 2.2 ) + 0.45 * pow( clamp( e2, 0.0, 1.0 ), 2.6 );
    // Más marcada donde hay poca agua, que es donde de verdad se ven.
    red *= mix( 1.0, 0.35, hondura );
    color += uCaustica * red * 0.55;

    // Espuma de orilla contra el brocal, y en las crestas de las ondas. Recorte
    // duro y no degradado: la espuma pintada tiene contorno; difuminada se
    // convierte en niebla.
    // Un filete contra la piedra, no una banda. Iba de 0,88 a 1,0 —un doce por
    // ciento del radio, veinte centímetros de espuma en un pilón de tres
    // metros— y con la cresta de cada onda encendida por encima: el agua salía
    // con un aro blanco de plástico y anillos de nata.
    float orilla = smoothstep( 0.945, 1.0, r );
    float cresta = smoothstep( 0.017, 0.025, vAltura );
    float espuma = smoothstep( 0.4, 0.7, orilla * 0.95 + cresta * 0.35 );
    color = mix( color, uEspuma, espuma * 0.55 );

    // De noche el manantial es lo único que alumbra ahí arriba, y alumbra en
    // ARCANO. Sumando el color de las cáusticas —que es casi blanco— el pilón
    // se convertía en una caja de luz: brillaba, pero podría haber sido una
    // farola. Lo que tiene que decir es que el agua es de otro mundo.
    color += uBrillo * uNoche * ( 0.14 + red * 0.42 );

    // Más opaca en el centro y más translúcida en el canto: así se adivina la
    // piedra del fondo junto al brocal y no parece una tapa.
    // Se tiene que adivinar la piedra del fondo: opaca del todo es una tapa.
    float alfa = mix( 0.7, 0.42, smoothstep( 0.5, 1.0, r ) );
    gl_FragColor = vec4( color, alfa );
    #include <colorspace_fragment>
  }
`;

function aguaMesh() {
  const RADIO = FUENTE_RADIO - 0.62;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRadio: { value: RADIO },
      uHondo: { value: new THREE.Color(PALETTE.oceanDeep) },
      uSomero: { value: new THREE.Color(PALETTE.oceanShallow) },
      uEspuma: { value: new THREE.Color(PALETTE.foam) },
      uCaustica: { value: new THREE.Color(PALETTE.caustic) },
      uBrillo: { value: new THREE.Color(PALETTE.arcane) },
      uNoche: { value: 0 },
    },
    vertexShader: AGUA_VERTEX,
    fragmentShader: AGUA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(discoDeAnillos(RADIO, 14, 56), mat);
  m.name = 'fuente-agua';
  m.position.y = 0.26;
  m.renderOrder = 2;
  return m;
}

/**
 * El arbolado de la cubierta.
 *
 * Es lo que ata la isla al resto del mundo. Una peña con hierba y una fuente se
 * lee como una maqueta; con los mismos carballos y el mismo matorral que crecen
 * cuarenta metros más abajo, se lee como un trozo de la isla grande que se
 * soltó. No hace falta que sean parecidos: tienen que ser LOS MISMOS, del mismo
 * `createTree` y con los mismos materiales.
 *
 * Se instancian por especie —dos llamadas de dibujo cada una— y no se plantan
 * sueltos, que siete árboles sueltos son catorce llamadas por lo mismo.
 */
function arbolado(seed, entrada) {
  const g = new THREE.Group();
  g.name = 'isla-arbolado';
  const random = makeRandom(seed + 777);

  // Rumbo por el que llega la escalinata: por ahí no se planta nada. Un
  // carballo en la boca de la escalera tapa la llegada y, peor, tapa la fuente
  // justo desde donde se la ve por primera vez.
  const rumboEntrada = Math.atan2(entrada.z, entrada.x);

  const lotes = new Map();
  const PLANTAS = [
    ['carballo', 0.52, 0.72, 4],
    ['arbusto', 0.62, 0.86, 5],
    ['helecho', 0.5, 0.8, 4],
  ];

  // Por SECTORES y a zancadas COPRIMAS.
  //
  // Con ángulos al azar los trece se apelotonaron en un tercio de la cubierta:
  // el azar uniforme se agrupa, y un prado que se ha dejado crecer no. Y con
  // sectores consecutivos pasaba otra cosa peor de ver que de explicar — cada
  // especie cogía un arco seguido, así que había un rincón de carballos, otro
  // de matorral y otro de helechos, como un vivero.
  //
  // Avanzando de cinco en cinco sobre trece sectores —y 5 y 13 no tienen
  // divisores comunes— se recorren los trece antes de repetir ninguno, y las
  // tres especies se entrelazan.
  let sector = 0;
  const SECTORES = 13;
  const ZANCADA = 5;
  for (const [especie, kMin, kMax, cuantos] of PLANTAS) {
    const puestos = [];
    let intentos = 0;
    while (puestos.length < cuantos && intentos++ < 60) {
      const th = ((sector % SECTORES) / SECTORES) * Math.PI * 2 + (random() - 0.5) * 0.4;
      // Diferencia angular con la entrada, en [-π, π].
      let d = th - rumboEntrada;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.75) { sector += ZANCADA; continue; }
      const k = kMin + random() * (kMax - kMin);
      const r = ISLA_RADIO * k;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      sector += ZANCADA;
      if (puestos.some((p) => Math.hypot(p.x - x, p.z - z) < 3.4)) continue;
      puestos.push({ x, z, y: cotaCesped(k), giro: random() * Math.PI * 2, escala: 0.42 + random() * 0.2 });
    }
    if (puestos.length) lotes.set(especie, puestos);
  }

  const m4 = new THREE.Matrix4();
  for (const [especie, puestos] of lotes) {
    const planta = createTree({ species: especie, seed: seed + especie.length * 31 });
    const tronco = new THREE.InstancedMesh(planta.trunk, barkMaterial(), puestos.length);
    const copa = new THREE.InstancedMesh(planta.canopy, leafMaterial(especie), puestos.length);
    tronco.name = `isla-${especie}-tronco`;
    copa.name = `isla-${especie}-copa`;
    tronco.castShadow = true;
    copa.castShadow = true;
    puestos.forEach((p, i) => {
      m4.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.giro, 0)),
        new THREE.Vector3(p.escala, p.escala, p.escala)
      );
      tronco.setMatrixAt(i, m4);
      copa.setMatrixAt(i, m4);
    });
    tronco.instanceMatrix.needsUpdate = true;
    copa.instanceMatrix.needsUpdate = true;
    g.add(tronco, copa);
  }
  return g;
}

/**
 * Tres menhires inclinados en el borde.
 *
 * La isla es el final del Camino del Viajero y todo el camino está jalonado de
 * piedra hincada: sin ninguna arriba, el remate no pertenece a la serie. Van
 * inclinados y no a plomo porque llevan ahí más tiempo que la escalinata.
 */
function menhires(seed) {
  const random = makeRandom(seed + 313);
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + 0.6;
    const k = 0.74;
    const piedra = createStone({
      width: 1.1 + random() * 0.4,
      height: 3.4 + random() * 1.6,
      depth: 0.9,
      seed: SEED + 6400 + i,
      erosion: 0.15,
      lean: (random() - 0.5) * 0.24,
    });
    piedra.rotateY(random() * Math.PI);
    piedra.translate(Math.cos(th) * ISLA_RADIO * k, cotaCesped(k) - 0.3, Math.sin(th) * ISLA_RADIO * k);
    geos.push(piedra);
  }
  const m = stoneMesh(mergeGeometries(geos, false), { name: 'isla-menhires' });
  m.castShadow = true;
  for (const g of geos) g.dispose();
  return m;
}

/**
 * Las raíces que cuelgan de la cornisa.
 *
 * Es el detalle que más dice, y cuesta poco: una peña con el corte limpio
 * parece serrada, y una de la que cuelgan raíces parece ARRANCADA. Dice, sin
 * escribirlo, que esto estuvo pegado a algo.
 *
 * Cuelgan de la cornisa y no del canto de la hierba: la cornisa es lo que vuela,
 * y una raíz que sale por debajo del prado se lee como un pelo.
 */
function raices(seed) {
  const random = makeRandom(seed + 909);
  const geos = [];
  const CUANTAS = 26;
  for (let i = 0; i < CUANTAS; i++) {
    const th = (i / CUANTAS) * Math.PI * 2 + random() * 0.22;
    const hasta = ISLA_QUILLA * (0.2 + random() * 0.45);
    const grueso = 0.045 + random() * 0.07;
    // La raíz SIGUE LA PEÑA, no cuelga en el aire.
    //
    // La primera versión las bajaba rectas desde la cornisa, con un grosor de
    // veinte centímetros y saliéndose de la silueta: parecían andamios
    // apuntalando la isla desde abajo, que es exactamente lo contrario de lo
    // que tienen que decir. Una raíz se agarra a la roca; un puntal la sujeta.
    const puntos = [];
    const TRAMOS = 7;
    for (let t = 0; t <= TRAMOS; t++) {
      const u = t / TRAMOS;
      const y = -1.2 - hasta * u;
      // Pegada a la superficie, un pelo por fuera para que no se hunda en ella.
      const r = ISLA_RADIO * radioEnProfundidad(y) * 1.015;
      const giro = th + Math.sin(u * 3.1 + i) * 0.05;
      puntos.push(new THREE.Vector3(Math.cos(giro) * r, y, Math.sin(giro) * r));
    }
    // La punta se despega y cede hacia dentro: es lo único que cuelga libre.
    const ult = puntos[puntos.length - 1];
    puntos.push(new THREE.Vector3(ult.x * 0.9, ult.y - 1.1 - random() * 1.8, ult.z * 0.9));

    const curva = new THREE.CatmullRomCurve3(puntos);
    geos.push(new THREE.TubeGeometry(curva, 12, grueso, 4, false));
  }
  const m = new THREE.Mesh(mergeGeometries(geos, false), barkMaterial());
  m.name = 'isla-raices';
  m.castShadow = false;
  for (const g of geos) g.dispose();
  return m;
}

/**
 * La nube que la sostiene sin sostenerla.
 *
 * No es adorno: es lo que da ESCALA. Sin nada debajo, una peña en el aire puede
 * medir tres metros o trescientos, y el ojo elige lo pequeño. Con una nube por
 * debajo, la peña mide lo que mide una nube.
 *
 * ── Por qué motas y no poliedros ───────────────────────────────────────────
 *
 * La primera versión era un montón de icosaedros achatados. Tenía todos los
 * papeles en regla —color de nube, caras planas como el resto del mundo— y se
 * leía como poliespán: una nube no tiene silueta, y aquello tenía once.
 *
 * Esto son motas sueltas orientadas a cámara con una caída suave. Al girar
 * alrededor no hay ninguna cara que se ponga de perfil, y donde dos se
 * superponen la densidad se suma sola. Es lo que hace que parezca que tiene
 * dentro.
 *
 * ── El truco del volumen es el TONO, no la forma ───────────────────────────
 *
 * Las motas no reciben luz, así que un cúmulo de un solo blanco sale plano por
 * mucha mota que lleve. Las de abajo van del color de sombra de nube del mundo
 * y las de arriba del de luz: eso solo ya dibuja un cúmulo iluminado desde
 * arriba, que es de donde viene el sol.
 */
function nube(seed) {
  const g = new THREE.Group();
  g.name = 'isla-nube';
  const random = makeRandom(seed + 55);
  const textura = radialSprite({ size: 128, falloff: 2.1 });
  const oscuro = new THREE.Color(PALETTE.cloudShade);
  const claro = new THREE.Color(PALETTE.cloudLight);

  const MOTAS = 46;
  // Arrimada a la punta de la quilla. Colgada a una quilla entera por debajo no
  // se veía desde el prado, que es desde donde hace su trabajo: dar escala.
  const TECHO = -ISLA_QUILLA * 0.66;
  const HONDO = 13;
  for (let i = 0; i < MOTAS; i++) {
    const th = random() * Math.PI * 2;
    // Repartidas en un disco achatado más ancho que la isla: una nube que cabe
    // dentro de la silueta de la peña no se ve desde ningún sitio útil.
    const r = Math.sqrt(random()) * ISLA_RADIO * 1.65;
    const alto = random();
    const y = TECHO - alto * HONDO;
    const tam = 7 + random() * 11;

    const mat = new THREE.SpriteMaterial({
      map: textura,
      color: oscuro.clone().lerp(claro, 1 - alto * 0.85),
      transparent: true,
      opacity: 0.26 + random() * 0.2,
      depthWrite: false,
      fog: true,
    });
    const m = new THREE.Sprite(mat);
    m.position.set(Math.cos(th) * r, y, Math.sin(th) * r);
    m.scale.set(tam, tam * 0.72, 1);
    g.add(m);
  }
  g.renderOrder = -1;
  return g;
}

/**
 * Cantos sueltos sobre el prado.
 *
 * Sin ellos la cubierta es un fieltro verde: catorce metros de un solo tono con
 * los árboles plantados encima, y el ojo lee moqueta. Los mismos cantos que
 * salpican el prado de la isla grande dicen que esto es terreno y no una
 * superficie.
 */
function cantos(seed) {
  const random = makeRandom(seed + 1201);
  const geos = [];
  for (let i = 0; i < 14; i++) {
    const th = random() * Math.PI * 2;
    const k = 0.25 + random() * 0.62;
    const g = createBoulder({ radius: 0.34 + random() * 0.75, seed: SEED + 6600 + i, detail: 1 });
    g.scale(1, 0.55 + random() * 0.4, 1);
    g.rotateY(random() * Math.PI * 2);
    g.translate(
      Math.cos(th) * ISLA_RADIO * k,
      cotaCesped(k) - 0.18 - random() * 0.2,
      Math.sin(th) * ISLA_RADIO * k
    );
    geos.push(g);
  }
  const m = stoneMesh(mergeGeometries(geos, false), { name: 'isla-cantos', dark: true });
  m.castShadow = true;
  m.receiveShadow = true;
  for (const g of geos) g.dispose();
  return m;
}


/**
 * Cubierta vegetal: mata menuda repartida por todo el prado.
 *
 * Es lo que separa un prado de una alfombra. El arbolado da silueta y los
 * cantos dan textura, pero entre unos y otros quedaban descampados de verde
 * liso donde no crece nada, y eso en un sitio que lleva ahí siglos no pasa.
 *
 * Va en su propia pasada y no dentro de `arbolado` porque la regla es otra:
 * aquel se reparte por sectores para que se vea equilibrado, y ésta se
 * amontona donde puede, que es como crece el brezo.
 */
function matorral(seed, entrada) {
  const g = new THREE.Group();
  g.name = 'isla-matorral';
  const random = makeRandom(seed + 2024);
  const rumboEntrada = Math.atan2(entrada.z, entrada.x);

  for (const [especie, cuantos, escMin, escMax] of [
    ['brezo', 34, 0.3, 0.6],
    ['helecho', 22, 0.22, 0.4],
  ]) {
    const puestos = [];
    for (let i = 0; i < cuantos * 3 && puestos.length < cuantos; i++) {
      const th = random() * Math.PI * 2;
      const k = 0.14 + Math.sqrt(random()) * 0.78;
      // Ni dentro del pilón ni en la senda de llegada: por ahí se anda.
      if (k * ISLA_RADIO < FUENTE_RADIO + 1.4) continue;
      let d = th - rumboEntrada;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.28) continue;
      puestos.push({
        x: Math.cos(th) * ISLA_RADIO * k,
        z: Math.sin(th) * ISLA_RADIO * k,
        y: cotaCesped(k),
        giro: random() * Math.PI * 2,
        escala: escMin + random() * (escMax - escMin),
      });
    }
    if (!puestos.length) continue;
    const planta = createTree({ species: especie, seed: seed + especie.length * 17 });
    const m4 = new THREE.Matrix4();
    for (const [geo, mat, sufijo] of [
      [planta.trunk, barkMaterial(), 'tallo'],
      [planta.canopy, leafMaterial(especie), 'mata'],
    ]) {
      const inst = new THREE.InstancedMesh(geo, mat, puestos.length);
      inst.name = `isla-${especie}-${sufijo}`;
      inst.castShadow = true;
      puestos.forEach((p, i) => {
        m4.compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.giro, 0)),
          new THREE.Vector3(p.escala, p.escala, p.escala)
        );
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }
  }
  return g;
}

/**
 * La senda de losas de la llegada al manantial, y el menhir caído.
 *
 * La senda hace un trabajo que no es decorativo: dice POR DÓNDE. Quien llega
 * arriba se encuentra un prado redondo con árboles y no hay nada que le diga
 * que el sitio al que ha subido está en el centro; con una línea de losas
 * hundidas en la hierba, no hace falta decírselo.
 *
 * Y el menhir caído es lo único de la isla que cuenta que aquí ha pasado
 * tiempo. Tres de pie y uno tumbado: los tres de pie son un lugar, el tumbado
 * es una historia.
 */
function senda(seed, entrada) {
  const random = makeRandom(seed + 3131);
  const geos = [];

  const dist = Math.hypot(entrada.x, entrada.z);
  const ux = entrada.x / dist;
  const uz = entrada.z / dist;
  const LOSAS = 9;
  for (let i = 0; i < LOSAS; i++) {
    const t = i / (LOSAS - 1);
    const r = dist * (1 - t) + (FUENTE_RADIO + 1.1) * t;
    // Zigzag suave: una hilera recta de losas se lee como una regla.
    const lado = (random() - 0.5) * 1.5;
    const x = ux * r - uz * lado;
    const z = uz * r + ux * lado;
    const k = Math.hypot(x, z) / ISLA_RADIO;
    const losa = createSlab({
      width: 1.25 + random() * 0.5,
      height: 0.26,
      depth: 1.05 + random() * 0.4,
      seed: SEED + 6800 + i,
      erosion: 0.12,
    });
    losa.rotateY(random() * Math.PI);
    // Hundidas: una losa apoyada encima de la hierba parece caída de un camión.
    losa.translate(x, cotaCesped(k) - 0.17, z);
    geos.push(losa);
  }

  // El caído, tumbado y medio comido por el prado.
  const caido = createStone({
    width: 1.2,
    height: 4.6,
    depth: 1.0,
    seed: SEED + 6900,
    erosion: 0.2,
  });
  caido.rotateZ(Math.PI / 2 + 0.06);
  caido.rotateY(1.1);
  {
    const k = 0.62;
    const th = rumbo(entrada) + 2.3;
    caido.translate(Math.cos(th) * ISLA_RADIO * k, cotaCesped(k) - 0.25, Math.sin(th) * ISLA_RADIO * k);
  }
  geos.push(caido);

  const m = stoneMesh(mergeGeometries(geos, false), { name: 'isla-senda' });
  m.castShadow = true;
  m.receiveShadow = true;
  for (const g of geos) g.dispose();
  return m;
}

const rumbo = (p) => Math.atan2(p.z, p.x);

/**
 * Monta la isla entera.
 *
 * @param {object} opciones
 * @param {number} opciones.base   Altura de MUNDO de la cubierta: lo que se pisa.
 * @param {{x:number,z:number}} opciones.entrada  Dónde aterriza la escalinata,
 *   en coordenadas de la isla. No se adivina: lo sabe quien traza la escalinata,
 *   y sin él el arbolado planta un carballo en la boca de la escalera.
 * @param {number} opciones.seed
 */
export function createIslaFlotante({ base = 0, entrada = { x: 0, z: -11 }, seed = SEED + 7331 } = {}) {
  const isla = new THREE.Group();
  isla.name = 'isla-flotante';
  isla.position.y = base;

  const quilla = stoneMesh(cuerpoGeometry(seed), { name: 'isla-quilla' });
  quilla.castShadow = true;
  quilla.receiveShadow = true;
  isla.add(quilla);

  // El césped, con el MISMO sombreado que el prado del mundo.
  //
  // Era el único material de la isla que no pasaba por `applyToonShading`, y
  // ahí estaba el desajuste de color: la piedra, la corteza y la hoja lo llevan
  // desde sus fábricas, así que viraban con la hora y con la estación; la
  // cubierta no, y de noche se quedaba de un verde de rotulador mientras el
  // prado de abajo se apagaba. No era el tono elegido: era que este trozo de
  // mundo no se estaba enterando de qué hora es.
  //
  // `estacion: 'hierba'` lo mete además en la tabla de estaciones, y la sombra
  // de nubes lo ata a la misma luz que barre el prado.
  const cespedMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
  });
  applyToonShading(cespedMat, {
    ...TOON_PRESETS.terrain,
    cloudShadow: 0.42,
    key: 'isla-cesped',
    estacion: 'hierba',
  });
  const cesped = new THREE.Mesh(cespedGeometry(seed), cespedMat);
  cesped.name = 'isla-cesped';
  cesped.receiveShadow = true;
  isla.add(cesped);

  isla.add(nube(seed));
  isla.add(raices(seed));
  isla.add(menhires(seed));
  isla.add(cantos(seed));
  isla.add(arbolado(seed, entrada));
  isla.add(matorral(seed, entrada));
  isla.add(senda(seed, entrada));
  isla.add(fuenteGrupo(seed));
  const agua = aguaMesh();
  isla.add(agua);

  // La luz del manantial. De día no existe; de noche es lo único que se ve de
  // la isla desde el prado, y lo que dice que allí arriba hay algo.
  // Largo alcance a propósito: tiene que llegar a las copas y a la cara interna
  // de la cornisa. Con veintiséis metros sólo alumbraba el brocal, y desde el
  // prado —que es desde donde se mira— la isla se quedaba negra: el manantial
  // se veía sólo si ya habías subido, o sea justo cuando ya no hace falta que
  // te llame.
  const luz = new THREE.PointLight(PALETTE.arcane, 0, 46, 1.6);
  luz.position.set(0, 2.2, 0);
  luz.name = 'fuente-luz';
  isla.add(luz);

  isla.userData.nocturno = { agua, luz, nube: isla.getObjectByName('isla-nube') };
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
export function prenderFuente(isla, noche, dt = 0) {
  const n = isla?.userData?.nocturno;
  if (!n) return;
  const k = Math.min(1, Math.max(0, noche));
  const u = n.agua.material.uniforms;
  // El agua corre siempre: es lo único que se mueve ahí arriba, y una fuente
  // quieta es un charco.
  u.uTime.value += dt;
  u.uNoche.value = k;
  n.luz.intensity = k * 16;
  // La nube también. Un cúmulo blanco a plena opacidad sobre un mar nocturno se
  // lee como un agujero en la pantalla.
  if (n.nube) {
    for (const mota of n.nube.children) {
      if (mota.userData.opacidadDia === undefined) mota.userData.opacidadDia = mota.material.opacity;
      mota.material.opacity = mota.userData.opacidadDia * (1 - k * 0.55);
    }
  }
}

