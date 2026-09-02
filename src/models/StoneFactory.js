/**
 * Fábrica de piedra procedural.
 *
 * Todo lo pétreo de la escena — menhires, dinteles, losas, cantos rodados —
 * sale de aquí, y hay DOS primitivas porque hay dos clases de piedra:
 *
 *   `createStone`   caja subdividida. Ortostatos, dinteles, estelas: piedra de
 *                   cantera, arrancada y partida a cuña. Caras planas, cantos
 *                   rectos, remate recto.
 *   `createBoulder` icosaedro. Cantos rodados: piedra transportada y pulida.
 *                   Ahí la esfera sí es la primitiva correcta.
 *
 * El material usa proyección triplanar, así que ninguna de las dos necesita UVs:
 * la textura se pega según la posición en el objeto.
 *
 * POR QUÉ LA CAJA. Antes los ortostatos también salían de un icosaedro
 * proyectado hacia una caja. El icosaedro reparte sus vértices uniformes por
 * ÁNGULO SÓLIDO, y la proyección los reparte por superficie, que no es lo
 * mismo en cuanto la pieza deja de ser cúbica: en un dintel de 10,8 × 1,25 ×
 * 1,84 las dos caras de los extremos ocupan menos del 1 % del ángulo sólido,
 * así que de 642 vértices les caían tres. Sin vértices no hay cara, y el dintel
 * remataba en pico por los dos lados — la lenteja. En un menhir de 3,2 × 10,2
 * pasaba lo mismo con la coronación y salía el colmillo. Los dos defectos eran
 * el mismo fallo visto en los dos ejes.
 *
 * Subdividiendo la caja en celdas de tamaño fijo EN UNIDADES DE MUNDO, cada
 * cara recibe vértices en proporción a lo que mide de verdad, y de paso dos
 * piezas de tamaños muy distintos salen con el mismo grano de detalle — que es
 * lo que hace que un dintel y el pie que lo sostiene parezcan de la misma
 * cantera.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise, clamp, lerp, smoothstep } from '../utils/noise.js';
import { granite } from '../utils/textures.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { PALETTE, SEED } from '../config.js';

const _v = new THREE.Vector3();

/**
 * Escalona un valor continuo: en vez de una rampa suave, mesetas planas
 * separadas por una transición corta.
 *
 * Es la pieza clave del parecido con la piedra de cantera. El granito no se
 * desgasta, se PARTE, y lo hace en paños planos que se cortan en arista viva.
 * Con ruido continuo sale un guijarro gigante por mucha amplitud que se le
 * ponga; escalonado sale un bloque partido a cuña.
 *
 * @param {number} hardness 0 = sin escalón (ruido tal cual), 1 = salto seco.
 */
function stepped(v, steps, ramp) {
  const s = v * steps;
  const fl = Math.floor(s);
  const w = clamp(ramp, 0.04, 1);
  return (fl + smoothstep(0.5 - w * 0.5, 0.5 + w * 0.5, s - fl)) / steps;
}

/**
 * Rampa mínima que la malla puede dibujar sin astillarse.
 *
 * Un escalón cuya transición cabe dentro de un solo cuadrilátero no sale como
 * arista: sale como una esquirla brillante. De los cuatro vértices del cuadro
 * solo se mueve uno, así que de los dos triángulos uno queda casi de canto y
 * pilla el sol de refilón. La cara se llena de astillas claras.
 *
 * Es un error fácil de cometer porque los dos números que lo provocan viven
 * lejos: la dureza del escalón se toca aquí y la resolución sale del tamaño de
 * la piedra. Por eso la rampa se calcula, no se pide — así el escalón se ablanda
 * solo cuando la malla es basta y se afila cuando hay con qué dibujarlo.
 *
 * El fBm recorre su rango en aproximadamente 1/(2,2·frecuencia) metros; con esa
 * pendiente se pasa la rampa de unidades de ruido a metros y se exige que ocupe
 * al menos un par de celdas.
 */
function minRamp(cell, freq, steps) {
  return clamp(2.4 * cell * (2.2 * freq) * steps, 0.05, 1);
}

/**
 * Caja hueca subdividida, con las seis caras en rejilla y el número de
 * divisiones de cada eje dado aparte.
 *
 * Cada cara se define con un origen y dos vectores (u, v) elegidos para que
 * u × v sea su normal saliente; con ese convenio el orden de índices de abajo
 * vale igual para las seis y no hay ninguna cara del revés.
 */
function boxGrid(hx, hy, hz, nx, ny, nz) {
  const positions = [];
  const indices = [];

  const face = (ox, oy, oz, ux, uy, uz, vx, vy, vz, nu, nv) => {
    const base = positions.length / 3;
    for (let j = 0; j <= nv; j++) {
      const t = j / nv;
      for (let i = 0; i <= nu; i++) {
        const s = i / nu;
        positions.push(ox + ux * s + vx * t, oy + uy * s + vy * t, oz + uz * s + vz * t);
      }
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * row + i;
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
  };

  const w = hx * 2;
  const h = hy * 2;
  const d = hz * 2;
  face(hx, -hy, -hz, 0, h, 0, 0, 0, d, ny, nz); // +X : u=+Y, v=+Z
  face(-hx, -hy, -hz, 0, 0, d, 0, h, 0, nz, ny); // -X : u=+Z, v=+Y
  face(-hx, hy, -hz, 0, 0, d, w, 0, 0, nz, nx); // +Y : u=+Z, v=+X
  face(-hx, -hy, -hz, w, 0, 0, 0, 0, d, nx, nz); // -Y : u=+X, v=+Z
  face(-hx, -hy, hz, w, 0, 0, 0, h, 0, nx, ny); // +Z : u=+X, v=+Y
  face(-hx, -hy, -hz, 0, h, 0, w, 0, 0, ny, nx); // -Z : u=+Y, v=+X

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// Frecuencias del relieve, en unidades de MUNDO y no relativas al tamaño de
// cada pieza. Es lo que hace que un dintel de once metros y el pie de tres que
// lo sostiene parezcan arrancados de la misma cantera: con frecuencia relativa
// cada pieza salía con el mismo NÚMERO de paños, así que el dintel los tenía de
// tres metros y el pie de uno, y juntos no pegaban.
// Van bajas a propósito. La geometría solo puede sostener los planos GRANDES —
// los que cambian la silueta y parten la luz; el grano fino de cincel no cabe en
// la malla y lo pone la textura, que para eso tiene resolución de sobra. Subir
// aquí la frecuencia buscando detalle solo consigue que el escalón se meta
// dentro de una celda y salgan esquirlas.
const F_ESTRATO = 0.16; // planos de sedimentación: tumbados, poco frecuentes
const F_PANO = 0.26; // paños de fractura: el grano dominante
const F_PICADO = 1.1; // ondulación fina; por debajo de esto ya alías

/**
 * Ortostato: bloque de cantera. Caja subdividida, achaflanada, partida en paños
 * y desportillada por los cantos.
 *
 * @param {object} opts
 * @param {number} opts.width      Anchura (X) en unidades de mundo.
 * @param {number} opts.height     Altura (Y).
 * @param {number} opts.depth      Fondo (Z).
 * @param {number} opts.seed       Semilla; misma semilla, misma piedra.
 * @param {number} opts.detail     Grano de la malla. 3 ≈ 1400 tris en un menhir.
 * @param {number} opts.roundness  Chaflán del canto. 0 = arista viva.
 * @param {number} opts.erosion    Amplitud del relieve, relativa al grosor.
 * @param {number} opts.taper      Estrechamiento hacia la coronación (0 = recto).
 * @param {number} opts.lean       Inclinación lateral acumulada con la altura.
 * @param {number} opts.flatBase   Aplana la suela para que asiente.
 * @param {number} opts.facetSharpness Dureza del escalón entre paños.
 * @param {number} opts.dressedFace 0 = piedra en bruto; 1 = frente desbastado a
 *                                  cincel, listo para recibir un relieve.
 */
export function createStone({
  width = 2,
  height = 6,
  depth = 1.4,
  seed = 1,
  detail = 3,
  roundness = 0.30,
  erosion = 0.14,
  taper = 0.10,
  lean = 0,
  flatBase = true,
  facetSharpness = 0.72,
  dressedFace = 0,
} = {}) {
  const noise = new SimplexNoise(seed);
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;

  // La celda mide LO MISMO EN METROS para toda la isla; `detail` solo la afina.
  // Es la mitad de por qué las piezas pegan entre sí: un dintel de once metros
  // y el pie de tres que lo sostiene reciben el mismo grano de malla y el mismo
  // tamaño de paño, en vez de la misma cuenta de triángulos estirada sobre
  // superficies muy distintas.
  //
  // Referirla al eje largo de cada pieza —que fue el primer intento— parece lo
  // mismo y no lo es: una pata de dolmen de 3,4 m salía con celda de 11 cm y
  // 3.800 triángulos, más malla que el menhir de diez metros que tiene al lado.
  const cell = clamp(0.34 * (3 / Math.max(1, detail)), 0.10, 1.2);
  const nx = Math.max(2, Math.round(width / cell));
  const ny = Math.max(2, Math.round(height / cell));
  const nz = Math.max(2, Math.round(depth / cell));

  // Soldar ANTES de esculpir, no después. Cada vértice compartido queda uno
  // solo, recibe el desplazamiento una vez y es imposible que se abra una
  // costura entre dos caras por diferencias de coma flotante.
  const geo = mergeVertices(boxGrid(hx, hy, hz, nx, ny, nz), 1e-4);

  const minHalf = Math.min(hx, hy, hz);
  const bevel = clamp(roundness * minHalf * 0.55, 1e-3, minHalf * 0.9);
  const ex = hx - bevel;
  const ey = hy - bevel;
  const ez = hz - bevel;
  const band = minHalf * 0.42; // ancho de la franja desportillada junto al canto
  // La amplitud va referida a la dimensión MENOR. Referida a la mayor, un
  // dintel de once metros recibía medio metro de relieve sobre un canto de
  // 1,25 y se deshacía.
  const amp = erosion * Math.min(width, height, depth) * 1.9;
  // La coronación se lleva el doble de relieve, pero solo en las piezas de pie.
  // Es por donde el bloque se separó de la roca madre: está PARTIDA, no cortada,
  // y con el remate liso el menhir parece un pilar de hormigón. En una tapa de
  // dolmen ese mismo refuerzo se comería el grosor de la losa.
  const crown = height > Math.max(width, depth) * 1.4 ? 2.0 : 1.2;
  // `facetSharpness` pide dureza; la malla decide cuánta puede dar.
  const rampPano = Math.max(1 - clamp(facetSharpness, 0, 1), minRamp(cell, F_PANO, 1.4));
  const rampEstrato = Math.max(1 - clamp(facetSharpness, 0, 1), minRamp(cell, F_ESTRATO * 2.2, 1.8));

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let px = pos.getX(i);
    let py = pos.getY(i);
    let pz = pos.getZ(i);
    const sx = px < 0 ? -1 : 1;
    const sy = py < 0 ? -1 : 1;
    const sz = pz < 0 ? -1 : 1;
    const ax = Math.abs(px);
    const ay = Math.abs(py);
    const az = Math.abs(pz);

    // ---- Chaflán ----------------------------------------------------------
    // Proyección a caja redondeada: el vértice solo se mueve si sale de la caja
    // interior, así que el centro de cada cara se queda EXACTAMENTE plano y solo
    // se recogen los cantos. La normal sale del mismo vector q, que es función
    // pura de la posición: dos vértices que estaban soldados reciben el mismo
    // empuje aunque vinieran de caras distintas.
    let qx = Math.max(ax - ex, 0);
    let qy = Math.max(ay - ey, 0);
    let qz = Math.max(az - ez, 0);
    const qlen = Math.hypot(qx, qy, qz) || 1e-6;
    const nX = (qx / qlen) * sx;
    const nY = (qy / qlen) * sy;
    const nZ = (qz / qlen) * sz;
    if (qlen > bevel) {
      const k = bevel / qlen;
      qx *= k;
      qy *= k;
      qz *= k;
    }
    if (ax > ex) px = sx * (ex + qx);
    if (ay > ey) py = sy * (ey + qy);
    if (az > ez) pz = sz * (ez + qz);

    // Proximidad al canto: de los tres huecos hasta el borde, el menor es ~0
    // (el vértice está en una cara) y el segundo dice a qué distancia queda de
    // la arista de esa cara. Ahí es donde la piedra se desportilla.
    let lo = hx - ax;
    let mid = hy - ay;
    let hi = hz - az;
    if (lo > mid) { const t = lo; lo = mid; mid = t; }
    if (mid > hi) { const t = mid; mid = hi; hi = t; }
    if (lo > mid) { const t = lo; lo = mid; mid = t; }
    const edge = 1 - smoothstep(0, band, mid);

    // ---- Silueta ----------------------------------------------------------
    // Estrechamiento LINEAL, no cuadrático. Con t² el adelgazamiento se
    // concentraba en el último tramo y la piedra remataba en punta — el
    // colmillo. Una losa de cantera se estrecha de forma pareja de la suela a
    // la coronación, y el remate es recto.
    const t = clamp(py / (hy * 2) + 0.5, 0, 1);
    const shrink = lerp(1, 1 - taper, t);
    px *= shrink;
    pz *= shrink * lerp(1, 0.96, t);
    px += lean * (py + hy) * 0.5; // siglos cediendo

    // ---- Relieve ----------------------------------------------------------
    // Cuatro escalas, de la silueta al grano. Las dos de en medio van
    // escalonadas: son las que convierten un bulto en un paño de fractura.
    //
    // El escalonado se hace con MUY POCOS escalones a propósito. Con cuatro, el
    // salto entre mesetas queda por debajo del centímetro y la cara se lee lisa
    // por mucho ruido que lleve encima.
    const deriva = noise.fbm(px * 0.14, py * 0.11, pz * 0.14, 2, 2.0, 0.5);
    const estrato = stepped(
      noise.fbm(px * F_ESTRATO, py * F_ESTRATO * 2.2, pz * F_ESTRATO, 2, 2.2, 0.5),
      1.8,
      rampEstrato
    );
    const pano = stepped(
      noise.fbm(px * F_PANO, py * F_PANO * 0.78, pz * F_PANO, 3, 2.15, 0.5),
      1.4,
      rampPano
    );
    const picado = noise.ridged(px * F_PICADO, py * F_PICADO * 0.86, pz * F_PICADO, 2, 2.4, 0.5);
    // El desportillado solo resta: un canto golpeado pierde material, no lo gana.
    const mella = edge * Math.abs(noise.fbm(px * 1.5, py * 1.5, pz * 1.5, 2, 2.3, 0.5));

    let disp = (deriva * 0.5 + estrato * 0.42 + pano * 0.85 + picado * 0.10 - mella * 0.85) * amp;

    // Frente desbastado: la cara labrada de una estela está aplanada a cincel
    // mientras el canto y la coronación siguen en bruto. Ese contraste entre lo
    // trabajado y lo encontrado es lo que hace que la piedra parezca tallada
    // por alguien. Se recoge un pelo por debajo del plano de la caja para que el
    // paño de relieve, que va montado delante, no se cruce con ella.
    if (dressedFace > 0 && nZ > 0.35) {
      const inX = 1 - smoothstep(0.50, 0.92, ax / hx);
      const inY = 1 - smoothstep(0.55, 0.94, ay / hy);
      const w = clamp((nZ - 0.35) / 0.4, 0, 1) * inX * inY * dressedFace;
      disp = lerp(disp, -amp * 0.05, w);
    }

    if (sy > 0) disp *= lerp(1, crown, smoothstep(hy * 0.72, hy * 0.98, ay));
    // La suela apenas se mueve: si se le mete relieve, la piedra acaba apoyada
    // en un solo pico y flotando por el resto de la base.
    if (flatBase && sy < 0) disp *= lerp(1, 0.14, smoothstep(hy * 0.86, hy * 0.99, ay));

    pos.setXYZ(i, px + nX * disp, py + nY * disp, pz + nZ * disp);
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();
  // Deja la base en y = 0 para poder plantarla directamente sobre el terreno.
  geo.translate(0, -geo.boundingBox.min.y, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Losa horizontal: dinteles, tapas de dolmen, mesa de altar, escalones.
 *
 * Es el mismo generador que el ortostato con otros números — que es justo lo
 * que hace que una tapa y el pie que la sostiene peguen entre sí.
 */
export function createSlab({ width = 4, height = 0.6, depth = 2.4, seed = 1, erosion = 0.06, detail = 3 } = {}) {
  return createStone({
    width,
    height,
    depth,
    seed,
    detail,
    roundness: 0.26,
    erosion,
    taper: 0.03,
    flatBase: true,
    facetSharpness: 0.66,
  });
}

/**
 * Canto rodado: relleno del paisaje, bordes de sendero.
 *
 * Aquí sí manda el icosaedro. Un canto es piedra transportada y pulida, sin
 * caras ni cantos que preservar, y la esfera subdividida da la malla más barata
 * para una silueta redonda — un tercio de los triángulos que costaría la caja
 * para el mismo resultado, y de estos hay decenas por la isla.
 */
export function createBoulder({ radius = 1, seed = 1, detail = 2 } = {}) {
  const noise = new SimplexNoise(seed);
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, detail), 1e-5);
  const pos = geo.attributes.position;
  const hx = radius * 1.1;
  const hy = radius * 0.75;
  const hz = radius * 0.95;

  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).normalize();
    const dir = _v.clone();
    const k = Math.max(Math.abs(dir.x) / hx, Math.abs(dir.y) / hy, Math.abs(dir.z) / hz) || 1;
    const p = dir
      .clone()
      .divideScalar(k)
      .lerp(new THREE.Vector3(dir.x * hx, dir.y * hy, dir.z * hz), 0.72);

    // El mismo escalonado que los ortostatos, más suave: incluso un canto
    // rodado conserva algún plano de rotura, y sin él parece una patata.
    const bulto = noise.fbm(p.x * 1.6, p.y * 1.4, p.z * 1.6, 3, 2.1, 0.5);
    const rotura = stepped(noise.fbm(p.x * 2.6, p.y * 2.2, p.z * 2.6, 2, 2.2, 0.5), 3, 0.55);
    const disp = (bulto * 0.42 + rotura * 0.5) * 0.30 * radius;
    p.addScaledVector(p.clone().normalize(), disp);

    // Suela plana: se apoya sin flotar.
    const floor = -hy * 0.88;
    if (p.y < floor) p.y = floor;
    pos.setXYZ(i, p.x, p.y, p.z);
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.min.y, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

let _rockMaterial = null;
let _rockMaterialDark = null;

/**
 * Material de roca con proyección triplanar.
 * Se comparte entre todas las piedras: un solo programa, un solo set de
 * texturas, y la instancia se puede reutilizar sin coste.
 */
export function rockMaterial({ dark = false } = {}) {
  const cached = dark ? _rockMaterialDark : _rockMaterial;
  if (cached) return cached;

  const tex = granite({ seed: SEED + (dark ? 31 : 17), repeat: 1, lichen: dark ? 0.08 : 0.13 });
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dark ? PALETTE.rockDark : PALETTE.rock),
    roughness: 0.92,
    metalness: 0,
    dithering: true,
    // Sombreado facetado: es lo que convierte estas mallas en piedra. Con
    // normales suaves, un menhir erosionado se lee como un bulto orgánico
    // — más cerca de un arbusto que de un bloque de granito partido.
    flatShading: true,
  });
  // Nombre de familia: es lo que hace que el editor pueda retocar la piedra de
  // la isla entera de una vez. Ver `src/editor/registro.js`.
  material.name = dark ? 'roca-oscura' : 'roca';

  material.userData.uniforms = {
    uRock: { value: tex.map },
    uRough: { value: tex.roughnessMap },
    uScale: { value: 0.42 },
    uLichenDir: { value: new THREE.Vector3(0.25, 1, -0.2).normalize() },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vObjPos;
         varying vec3 vObjNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vObjPos = position;
         vObjNormal = normalize( normal );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uRock;
         uniform sampler2D uRough;
         uniform float uScale;
         uniform vec3 uLichenDir;
         varying vec3 vObjPos;
         varying vec3 vObjNormal;

         vec3 triplanarWeights( vec3 n ) {
           vec3 w = pow( abs( n ), vec3( 4.0 ) );
           return w / max( w.x + w.y + w.z, 1e-4 );
         }

         vec4 triplanar( sampler2D tex, vec3 p, vec3 w, float s ) {
           vec4 x = texture2D( tex, p.zy * s );
           vec4 y = texture2D( tex, p.xz * s );
           vec4 z = texture2D( tex, p.xy * s );
           return x * w.x + y * w.y + z * w.z;
         }`
      )
      .replace(
        '#include <map_fragment>',
        `vec3 triW = triplanarWeights( vObjNormal );
         vec4 rockTexel = triplanar( uRock, vObjPos, triW, uScale );
         // Segunda octava girada: rompe la repetición sin coste de memoria.
         vec4 rockDetail = triplanar( uRock, vObjPos * 3.17 + 41.0, triW, uScale );
         // La segunda octava modula alrededor de 1, no multiplica por un
         // valor menor que 1: si no, romper la repetición costaba un tercio
         // del brillo y la piedra se iba a gris oscuro.
         rockTexel.rgb *= mix( vec3( 1.0 ), rockDetail.rgb * 2.25, 0.30 );
         diffuseColor *= rockTexel;

         // Realce de fisura.
         //
         // El cel shading aplana todo lo que cae dentro de una misma banda, así
         // que una grieta de dos centímetros deja de existir en cuanto la
         // piedra recibe luz de frente: no genera sombra propia suficiente para
         // saltar de banda. Si la fisura tiene que verse, tiene que venir del
         // ALBEDO. Se estira el contraste solo por abajo, donde están las
         // grietas y las juntas, sin tocar el cuerpo de la piedra.
         float rockLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
         float crack = smoothstep( 0.24, 0.045, rockLum );
         diffuseColor.rgb *= mix( 1.0, 0.46, crack );

         // El liquen y el musgo crecen mirando arriba: oscurece las caras
         // que miran al suelo y verdea las que miran al cielo.
         float up = dot( vObjNormal, normalize( uLichenDir ) );
         diffuseColor.rgb *= mix( 0.68, 1.08, smoothstep( -0.9, 0.6, up ) );
         diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.88, 1.05, 0.80 ), smoothstep( 0.45, 0.98, up ) * 0.22 );`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * triplanar( uRough, vObjPos, triW, uScale ).g;`
      );
  };

  applyToonShading(material, { ...TOON_PRESETS.stone, key: `rock-${dark ? 'd' : 'l'}` });

  if (dark) _rockMaterialDark = material;
  else _rockMaterial = material;
  return material;
}

/**
 * Malla de piedra lista para plantar: geometría + material compartido +
 * sombras activadas.
 */
export function stoneMesh(geometry, { dark = false, name = 'stone' } = {}) {
  const mesh = new THREE.Mesh(geometry, rockMaterial({ dark }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
