/**
 * Relieve tallado sobre piedra.
 *
 * La referencia de monolito celta no es un bloque con un dibujo pintado
 * encima: es un bloque **labrado**. Tiene una cara desbastada plana, un marco
 * en resalte que la enmarca, un medallón circular con el nudo en hueco, y
 * bajo él la inscripción. El canto y la coronación se quedan en bruto. Esa
 * diferencia — parte trabajada contra parte sin tocar — es lo que hace que la
 * piedra parezca tallada por alguien.
 *
 * Aquí se resuelve con un mapa de alturas pintado en canvas que hace tres
 * trabajos a la vez:
 *
 *   1. **Desplaza la malla.** El marco sobresale de verdad y recorta contra el
 *      cielo. Un normal map solo no da eso: en cuanto miras el panel de canto,
 *      se ve que es una calcomanía plana.
 *   2. **Da el mapa de normales.** Para el cincelado fino, que a esa escala no
 *      cabe en la malla.
 *   3. **Da el recorte alfa.** El panel tiene silueta de arco con el borde
 *      irregular, no de rectángulo: un rectángulo sobre una piedra erosionada
 *      canta como un cartel pegado.
 */

import * as THREE from 'three';
import { granite } from '../utils/textures.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { SimplexNoise, clamp } from '../utils/noise.js';
import { rosette, triskelion, knotRing, RUNES, RUNE_NAMES } from '../utils/runes.js';
import { oghamStrokes } from '../utils/ogham.js';
import { createStone, stoneMesh } from './StoneFactory.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE, SEED } from '../config.js';

/** Cota de la superficie desbastada. Todo lo demás sube o baja desde aquí. */
const FIELD = 0.55;

/**
 * Traza polilíneas en coordenadas -0.5..0.5 dentro de una caja de la imagen.
 */
function strokePaths(ctx, paths, { cx, cy, size, lineWidth, value, closed = false }) {
  ctx.strokeStyle = `rgb(${value},${value},${value})`;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of paths) {
    if (path.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(cx + path[0][0] * size, cy - path[0][1] * size);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(cx + path[i][0] * size, cy - path[i][1] * size);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
}

/**
 * Contorno del paño: arco de medio punto arriba, esquinas vivas abajo.
 *
 * Es la silueta que tienen todas las estelas de la referencia, y no es un
 * capricho: la piedra se remata en arco por arriba porque es donde se lleva la
 * lluvia, y se deja recta abajo porque ahí se hinca. Con las cuatro esquinas
 * redondeadas por igual, el paño se leía como una placa moderna.
 */
function archOutline(ctx, x, y, w, h) {
  const r = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/**
 * Pinta el mapa de alturas del panel.
 * @returns {{ height: Float32Array, alpha: Float32Array, w: number, h: number }}
 */
function paintRelief({ w, h, seed, motif, oghamText, marks }) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const v = (x) => Math.round(clamp(x, 0, 1) * 255);

  // Campo: la cara desbastada.
  ctx.fillStyle = `rgb(${v(FIELD)},${v(FIELD)},${v(FIELD)})`;
  ctx.fillRect(0, 0, w, h);

  const inset = w * 0.085;
  const frameW = w * 0.055;

  // Rehundido interior: el paño de la inscripción queda por debajo del marco.
  ctx.fillStyle = `rgb(${v(FIELD - 0.12)},${v(FIELD - 0.12)},${v(FIELD - 0.12)})`;
  archOutline(ctx, inset, inset, w - inset * 2, h - inset);
  ctx.fill();

  // Marco en resalte, siguiendo el mismo arco.
  ctx.strokeStyle = `rgb(${v(FIELD + 0.30)},${v(FIELD + 0.30)},${v(FIELD + 0.30)})`;
  ctx.lineWidth = frameW;
  archOutline(ctx, inset, inset, w - inset * 2, h - inset);
  ctx.stroke();
  // Filete interior: dos molduras en vez de una, como en la referencia.
  ctx.strokeStyle = `rgb(${v(FIELD + 0.14)},${v(FIELD + 0.14)},${v(FIELD + 0.14)})`;
  ctx.lineWidth = frameW * 0.34;
  archOutline(ctx, inset + frameW * 1.15, inset + frameW * 1.15, w - (inset + frameW * 1.15) * 2, h - inset - frameW * 1.15);
  ctx.stroke();

  // Medallón: disco en resalte en el tercio alto, con el nudo en hueco encima.
  const medCx = w * 0.5;
  const medCy = h * 0.205;
  const medR = w * 0.315;

  ctx.fillStyle = `rgb(${v(FIELD + 0.08)},${v(FIELD + 0.08)},${v(FIELD + 0.08)})`;
  ctx.beginPath();
  ctx.arc(medCx, medCy, medR, 0, Math.PI * 2);
  ctx.fill();
  // Filete que rodea el medallón.
  ctx.strokeStyle = `rgb(${v(FIELD - 0.18)},${v(FIELD - 0.18)},${v(FIELD - 0.18)})`;
  ctx.lineWidth = w * 0.016;
  ctx.beginPath();
  ctx.arc(medCx, medCy, medR * 0.96, 0, Math.PI * 2);
  ctx.stroke();

  const motifPaths = motif === 'triskel'
    ? triskelion({ arms: 3, turns: 2.4, radius: 0.42 })
    : rosette({ arms: 7, radius: 0.40, inner: 0.135, sweep: 1.15 });
  strokePaths(ctx, motifPaths, {
    cx: medCx,
    cy: medCy,
    size: medR * 1.62,
    lineWidth: w * 0.026,
    value: v(FIELD - 0.34),   // hueco: el cincel entra
  });

  // Inscripción ogham en el eje del paño.
  if (oghamText) {
    const segments = oghamStrokes(oghamText, {
      length: 0.86,
      stroke: 0.20,
      gap: 0.062,
      space: 0.115,
    });
    const paths = [
      [[0, -0.47], [0, 0.47]],
      ...segments.map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]]),
    ];
    strokePaths(ctx, paths, {
      cx: w * 0.5,
      cy: h * 0.635,
      size: h * 0.40,
      lineWidth: w * 0.024,
      value: v(FIELD - 0.30),
    });
  }

  // Marcas menores al pie: espirales sueltas, como en la referencia.
  for (let i = 0; i < marks; i++) {
    const sx = w * (0.28 + (i % 2) * 0.44);
    const sy = h * (0.885 + Math.floor(i / 2) * 0.055);
    strokePaths(ctx, triskelion({ arms: 3, turns: 1.7, radius: 0.40 }), {
      cx: sx,
      cy: sy,
      size: w * 0.20,
      lineWidth: w * 0.018,
      value: v(FIELD - 0.28),
    });
  }

  const data = ctx.getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  const noise = new SimplexNoise(seed);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let hv = data[i * 4] / 255;

      // Grano de picado: la piedra labrada nunca queda lisa.
      hv += noise.fbm(x * 0.09, y * 0.09, 3.1, 3, 2.3, 0.5) * 0.035;
      hv += noise.fbm(x * 0.42, y * 0.42, 11.7, 2, 2.6, 0.5) * 0.014;
      height[i] = hv;

      // Silueta: arco con el borde comido. El ruido de baja frecuencia sobre
      // el radio del rectángulo redondeado es lo que descuadra el contorno.
      const u = x / w;
      const t = y / h;
      const bite = noise.fbm(u * 5.5, t * 9.0, 41.3, 3, 2.2, 0.5) * 0.032;
      const mx = Math.min(u, 1 - u);
      const my = Math.min(t, 1 - t);
      const edge = Math.min(mx, my * (w / h));
      alpha[i] = edge > 0.020 + bite ? 1 : 0;
    }
  }

  return { height, alpha, w, h };
}

/** Mapa de normales tangentes desde un campo de alturas rectangular. */
function normalTexture(height, w, h, strength) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const d = image.data;
  const at = (x, y) =>
    height[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = at(x - 1, y) - at(x + 1, y);
      const dy = at(x, y - 1) - at(x, y + 1);
      let nx = dx * strength;
      let ny = dy * strength;
      const len = Math.hypot(nx, ny, 1) || 1;
      nx /= len;
      ny /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Albedo del paño: el granito, oscurecido dentro de los huecos.
 *
 * La cavidad se hornea en el color en lugar de calcularse en el shader. Con el
 * sol alto y el sombreado cel — que aplana todo lo que cae dentro de una misma
 * banda — un surco de tres milímetros no genera sombra propia ninguna, y el
 * grabado desaparecía en cuanto la piedra recibía luz de frente. Oscureciendo
 * el fondo del surco, el dibujo se lee siempre, dé donde dé la luz.
 */
function albedoTexture(height, w, h, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const stone = granite({ seed: SEED + seed * 13, repeat: 1, lichen: 0.22 });
  const grain = stone.map.image;
  // El grano se repite dos veces a lo alto: el panel es el doble de alto.
  ctx.drawImage(grain, 0, 0, w, h * 0.5);
  ctx.drawImage(grain, 0, h * 0.5, w, h * 0.5);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  for (let i = 0; i < w * h; i++) {
    // 1 en la superficie labrada, hasta 0.42 en el fondo del surco.
    // El suelo del surco no baja de 0.58. Con el suelo en 0.42, donde varios
    // trazos se cruzan — el centro de la roseta, el corazón de un triskel — se
    // sumaba el picado del ruido y el hueco salía negro: se leía como un
    // agujero taladrado, no como un cincelado.
    const cavity = clamp(0.58 + (height[i] - (FIELD - 0.34)) * 1.35, 0.58, 1.10);
    d[i * 4] *= cavity;
    d[i * 4 + 1] *= cavity;
    d[i * 4 + 2] *= cavity;
  }
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function alphaTexture(alpha, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const d = image.data;
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] * 255;
    d[i * 4] = a;
    d[i * 4 + 1] = a;
    d[i * 4 + 2] = a;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Panel labrado listo para apoyar sobre la cara desbastada de una piedra.
 *
 * @param {object} opts
 * @param {number} opts.width   Anchura en unidades de mundo.
 * @param {number} opts.height  Altura.
 * @param {number} opts.relief  Vuelo del marco, en unidades de mundo.
 * @param {'knot'|'triskel'} opts.motif
 * @param {string} opts.oghamText  Texto a grabar. Vacío = sin inscripción.
 */
export function carvedPanel({
  width = 2.4,
  height = 6.2,
  relief = 0.10,
  seed = 1,
  motif = 'knot',
  oghamText = '',
  marks = 2,
  segments = 84,
} = {}) {
  // Resolución del mapa: el doble de alto que de ancho porque el panel lo es.
  const mapW = 256;
  const mapH = 512;
  const { height: field, alpha } = paintRelief({
    w: mapW,
    h: mapH,
    seed,
    motif,
    oghamText,
    marks,
  });

  const rows = Math.round(segments * (height / width));
  const geo = new THREE.PlaneGeometry(width, height, segments, rows);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = 1 - uv.getY(i);          // el canvas crece hacia abajo
    const x = Math.min(mapW - 1, Math.round(u * (mapW - 1)));
    const y = Math.min(mapH - 1, Math.round(v * (mapH - 1)));
    pos.setZ(i, (field[y * mapW + x] - FIELD) * (relief / 0.30));
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    map: albedoTexture(field, mapW, mapH, seed),
    normalMap: normalTexture(field, mapW, mapH, 5.5),
    normalScale: new THREE.Vector2(1.5, 1.5),
    alphaMap: alphaTexture(alpha, mapW, mapH),
    alphaTest: 0.5,
    color: 0xd7d5c6,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // El cel shading del panel es el de la piedra, pero con la banda de sombra
  // subida.
  //
  // El paño ya lleva la cavidad horneada en el albedo, así que aplicarle encima
  // la sombra de la roca desnuda oscurece dos veces: los mojones que dan la
  // espalda al sol salían como rectángulos negros pegados a la piedra. El
  // contorno va algo más marcado, que es lo que separa el marco del paño sin
  // necesidad de más malla.
  applyToonShading(material, {
    ...TOON_PRESETS.stone,
    shadow: new THREE.Vector3(0.46, 0.54, 0.64),
    mid: new THREE.Vector3(0.84, 0.85, 0.85),
    rim: 0.18,
    key: 'carving',
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'talla';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.relief = relief;

  /**
   * Dónde ha caído cada grabado, en coordenadas locales del panel.
   *
   * Lo publica el propio panel para que quien coloque encima el glifo luminoso
   * lo cuadre con el surco en vez de a ojo. Es la única forma de que la luz
   * salga de DENTRO de la talla: con dos sitios distintos calculando la misma
   * posición, basta tocar un margen aquí para que el resplandor se despegue
   * del hueco y se lea como una calcomanía flotando delante de la piedra.
   */
  mesh.userData.anchors = {
    medallion: { y: height * (0.5 - 0.205), size: width * 0.51 },
    ogham: { y: height * (0.5 - 0.635), size: height * 0.40 },
  };
  return mesh;
}

// ---------------------------------------------------------------------------
// Piedra con runas
// ---------------------------------------------------------------------------

/**
 * Motivos disponibles para `runeStone`.
 *
 * `espirales` es el de la referencia de estilo: la triple espiral que preside
 * la losa del umbral en un túmulo de paso. Los otros tres dan variedad para que
 * las piedras repartidas por la isla no se lean como copias.
 */
const MOTIVOS = {
  espirales: (r) => {
    // Tres espirales en triángulo, como en la losa de Newgrange. Una sola,
    // centrada, se lee como una diana; el grupo se lee como escritura.
    const centros = [[-0.21, 0.11], [0.21, 0.11], [0, -0.20]];
    const paths = [];
    for (const [cx, cy] of centros) {
      for (const trazo of triskelion({ arms: 3, turns: 1.9, radius: 0.15 })) {
        paths.push(trazo.map(([x, y]) => [x + cx, y + cy]));
      }
    }
    return paths;
  },
  nudo: () => knotRing({ lobes: 6, radius: 0.34, inner: 0.13 }),
  roseta: () => rosette({ arms: 8, radius: 0.34, inner: 0.09, sweep: 1.2 }),
  runa: (r) => {
    // Una letra sola, grande. La elige la semilla, no el azar de cada carga.
    const nombre = RUNE_NAMES[Math.floor(r() * RUNE_NAMES.length)];
    return RUNES[nombre].map((trazo) => trazo.map(([x, y]) => [x * 0.62, y * 0.62]));
  },
};

export const RUNE_MOTIFS = Object.keys(MOTIVOS);

/**
 * Mapa de alturas de un paño de runas: la cara desbastada y el motivo en hueco.
 *
 * Es deliberadamente más simple que `paintRelief`: sin marco, sin medallón y sin
 * inscripción. Una estela de sección es una pieza de arquitectura y pide todo
 * eso; una piedra suelta en mitad del prado con un marco tallado alrededor se
 * lee como un cartel. Aquí solo hay superficie de piedra y surco.
 */
function paintRunes({ w, h, seed, motif }) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const v = (x) => Math.round(clamp(x, 0, 1) * 255);
  const random = makeRandom(seed);

  ctx.fillStyle = `rgb(${v(FIELD)},${v(FIELD)},${v(FIELD)})`;
  ctx.fillRect(0, 0, w, h);

  const paths = (MOTIVOS[motif] ?? MOTIVOS.espirales)(random);

  // Dos pasadas: primero una ancha y poco honda —el desconchado del borde del
  // surco— y encima la estrecha y honda, que es el corte del cincel. Con una
  // sola pasada el grabado sale con canto de plantilla, como si lo hubieran
  // recortado con tijeras.
  strokePaths(ctx, paths, {
    cx: w * 0.5, cy: h * 0.5, size: Math.min(w, h) * 0.94,
    lineWidth: Math.min(w, h) * 0.052, value: v(FIELD - 0.10),
  });
  strokePaths(ctx, paths, {
    cx: w * 0.5, cy: h * 0.5, size: Math.min(w, h) * 0.94,
    lineWidth: Math.min(w, h) * 0.028, value: v(FIELD - 0.30),
  });

  const img = ctx.getImageData(0, 0, w, h);
  const field = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  const n = new SimplexNoise(seed + 17);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Grano de piedra sobre el paño, para que no salga liso de fábrica.
      field[i] = img.data[i * 4] / 255 + n.fbm(x * 0.06, y * 0.06, 3.3, 3, 2.2, 0.5) * 0.018;
      // Recorte con el borde comido: el paño labrado no llega al canto.
      const u = x / (w - 1) - 0.5;
      const t = y / (h - 1) - 0.5;
      const r = Math.hypot(u * 1.05, t * 1.15) * 2;
      alpha[i] = r < 0.90 + n.fbm(x * 0.05, y * 0.05, 9.1, 3, 2.1, 0.5) * 0.10 ? 1 : 0;
    }
  }
  return { height: field, alpha };
}

/**
 * Piedra con el paño de runas ya tallado y encendido.
 *
 * Devuelve un Group cuya base está en y = 0, listo para plantar. El grabado no
 * es una calcomanía: desplaza la malla del paño, así que visto de canto el
 * surco sigue ahí.
 *
 * El resplandor arcano va aparte, con `glyphDecal`, y colocado desde la misma
 * cuenta que el paño. Es la lección que ya costó una vez en la estela de Sobre
 * mí: con dos sitios calculando la posición del grabado, basta tocar un margen
 * para que la luz se despegue del hueco y se lea como una pegatina flotando.
 */
export function runeStone({
  width = 2.6,
  height = 3.2,
  depth = 1.1,
  motif = 'espirales',
  seed = 1,
  color = PALETTE.arcane,
  glow = 0.42,
  relief = 0.09,
} = {}) {
  const group = new THREE.Group();
  group.name = 'piedra-runada';

  const piedra = stoneMesh(
    createStone({
      width, height, depth,
      seed,
      detail: 3,
      roundness: 0.22,
      erosion: 0.11,
      taper: 0.07,
      // El frente aplanado a cincel es la mitad del efecto: sin él, el paño se
      // monta sobre una superficie abollada y el grabado ondula.
      dressedFace: 0.95,
    }),
    { name: 'piedra-runada-bloque' }
  );
  group.add(piedra);

  const lado = Math.min(width * 0.72, height * 0.72);
  const map = 320;
  const { height: field, alpha } = paintRunes({ w: map, h: map, seed, motif });

  const segs = 64;
  const geo = new THREE.PlaneGeometry(lado, lado, segs, segs);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.min(map - 1, Math.round(uv.getX(i) * (map - 1)));
    const y = Math.min(map - 1, Math.round((1 - uv.getY(i)) * (map - 1)));
    pos.setZ(i, (field[y * map + x] - FIELD) * (relief / 0.30));
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    map: albedoTexture(field, map, map, seed),
    normalMap: normalTexture(field, map, map, 5.0),
    normalScale: new THREE.Vector2(1.4, 1.4),
    alphaMap: alphaTexture(alpha, map, map),
    alphaTest: 0.5,
    color: 0xd7d5c6,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  applyToonShading(material, {
    ...TOON_PRESETS.stone,
    shadow: new THREE.Vector3(0.46, 0.54, 0.64),
    mid: new THREE.Vector3(0.84, 0.85, 0.85),
    rim: 0.18,
    key: 'carving',
  });

  const pano = new THREE.Mesh(geo, material);
  pano.name = 'paño-runas';
  pano.castShadow = true;
  pano.receiveShadow = true;
  const panoY = height * 0.54;
  pano.position.set(0, panoY, depth * 0.5 + 0.015);
  group.add(pano);

  if (glow > 0) {
    const paths = (MOTIVOS[motif] ?? MOTIVOS.espirales)(makeRandom(seed));
    const luz = glyphDecal(paths, {
      size: lado * 0.94,
      color,
      intensity: glow,
      pulse: 0.42,
      speed: 0.30 + (seed % 7) * 0.045,
      lineWidth: 0.016,
      glow: 0.045,
    });
    // Dentro del surco, no delante: el fondo del hueco queda a `relief` por
    // debajo del paño.
    luz.position.set(0, panoY, depth * 0.5 + 0.015 - relief * 0.45);
    group.add(luz);
    group.userData.glyph = luz.userData.glyph;
  }

  group.userData.motif = motif;
  return group;
}
