/**
 * Texturas procedurales.
 *
 * No hay un solo archivo de imagen en el proyecto: granito, liquen, losas y
 * mapas de normales se pintan en un canvas al arrancar. Se cachean por clave
 * porque varios modelos comparten el mismo material de roca.
 */

import * as THREE from 'three';
import { SimplexNoise, clamp, lerp, makeRandom, smoothstep } from './noise.js';

const cache = new Map();

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * Pinta una textura pixel a pixel. `fn(x, y, u, v)` devuelve [r, g, b] en 0..1.
 */
function paint(size, fn) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = fn(x, y, x / size, y / size);
      data[i] = clamp(r, 0, 1) * 255;
      data[i + 1] = clamp(g, 0, 1) * 255;
      data[i + 2] = clamp(b, 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Deriva un mapa de normales tangentes de un campo de alturas (Sobel). */
function heightToNormal(height, size, strength = 2.6) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len) * 0.5 * 255 + 127.5;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toTexture(canvas, { repeat = 1, srgb = false, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Granito con vetas, liquen y motas de mica.
 * Devuelve { map, normalMap, roughnessMap } listos para MeshStandardMaterial.
 */
export function granite({ seed = 11, size = 512, repeat = 2, lichen = 0.55 } = {}) {
  const key = `granite:${seed}:${size}:${repeat}:${lichen}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const albedo = paint(size, (x, y, u, v) => {
    const s = 6;
    // Base de granito: fBm grueso + veta direccional.
    const base = n.fbm(u * s, v * s, 0, 5, 2.1, 0.55) * 0.5 + 0.5;
    const grain = n.fbm(u * s * 9, v * s * 9, 3.1, 3, 2.4, 0.5) * 0.5 + 0.5;
    const vein = Math.abs(n.fbm(u * s * 1.7 + v * 2.2, v * s * 1.7, 9.5, 4, 2, 0.5));
    const crack = smoothstep(0.02, 0.0, vein) * 0.75;

    let lum = 0.30 + base * 0.30 + grain * 0.16;
    lum -= crack * 0.22;

    // Mica: puntitos claros dispersos.
    const mica = n.noise3(u * size * 0.55, v * size * 0.55, 17.3);
    if (mica > 0.86) lum += (mica - 0.86) * 2.2;

    // Liquen: manchas verdosas donde el ruido de baja frecuencia es alto.
    const patch = smoothstep(0.18, 0.62, n.fbm(u * 3.1, v * 3.1, 41.7, 4, 2.2, 0.5) * 0.5 + 0.5);
    const moss = patch * lichen;

    let r = lum * 0.99;
    let g = lum * 0.98;
    let b = lum * 0.93;
    // Liquen, no musgo. El tinte anterior se llevaba el rojo al 0,42 y el azul
    // al 0,30 sobre un verde de 0,72: manchas verdes saturadas del tamaño de un
    // palmo que sobre la piedra se leían como camuflaje militar, y que además
    // tapaban los paños de fractura de la geometría — el relieve se perdía
    // debajo del dibujo. Una costra de liquen destiñe y agrisa la piedra; no la
    // pinta de verde.
    r = lerp(r, lum * 0.74, moss);
    g = lerp(g, lum * 0.86 + 0.03, moss);
    b = lerp(b, lum * 0.64, moss);

    const i = y * size + x;
    height[i] = base * 0.6 + grain * 0.4 - crack;
    // El liquen es mate, la piedra pulida por la lluvia algo menos.
    rough[i] = clamp(0.62 + moss * 0.30 + (1 - grain) * 0.12, 0, 1);
    return [r, g, b];
  });

  const normal = heightToNormal(height, size, 2.2);
  const roughness = paint(size, (x, y) => {
    const r = rough[y * size + x];
    return [r, r, r];
  });

  const result = {
    map: toTexture(albedo, { repeat, srgb: true }),
    normalMap: toTexture(normal, { repeat }),
    roughnessMap: toTexture(roughness, { repeat }),
  };
  cache.set(key, result);
  return result;
}

/**
 * Suelo del acantilado: hierba corta sobre roca, con calvas de tierra.
 */
/**
 * Prado.
 *
 * Los cuatro verdes salen del propio esquema de la referencia de hierba anime,
 * que enseña su paleta como cuatro muestras: dos verdes de sombra, uno vivo y
 * un sage pálido. La textura solo tiene que dar el DIBUJO — matas, briznas,
 * calvas — porque el tono final lo decide la rampa cel del terreno; por eso
 * aquí no hay ni marrón de tierra ni el verde apagado que llevaba antes. Con
 * el pardo horneado en la textura, la banda iluminada salía color caqui.
 */
export function turf({ seed = 5, size = 512, repeat = 1 } = {}) {
  const key = `turf:anime:${seed}:${size}:${repeat}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const height = new Float32Array(size * size);

  // Muestras del esquema, en sRGB normalizado.
  const SHADE = [0.106, 0.365, 0.192];   // #1b5d31
  const MID = [0.220, 0.545, 0.220];     // #388b38
  const BRIGHT = [0.451, 0.741, 0.259];  // #73bd42
  const SAGE = [0.545, 0.643, 0.443];    // #8ba471

  const albedo = paint(size, (x, y, u, v) => {
    const s = 8;
    const clumps = n.fbm(u * s, v * s, 0, 5, 2.3, 0.55) * 0.5 + 0.5;
    const blades = n.fbm(u * s * 14, v * s * 14, 6.2, 3, 2.6, 0.45) * 0.5 + 0.5;
    const dry = smoothstep(0.70, 0.90, n.fbm(u * 2.6, v * 2.6, 30.1, 3, 2, 0.5) * 0.5 + 0.5);

    // Rampa de tres tramos: la mata densa al verde de sombra, la brizna suelta
    // al verde vivo. Es la «color variation» del esquema, pintada en el mapa.
    //
    // El peso deja la media por debajo del tramo vivo a propósito: el suelo es
    // el fondo contra el que se recortan las briznas instanciadas, cuya base
    // medida es un verde azulado oscuro. Con el suelo tan claro como la punta
    // de la brizna, cada brizna se leía como una púa oscura clavada en el
    // césped en vez de como hierba.
    const t = clamp(clumps * 0.60 + blades * 0.46 - 0.03, 0, 1);
    const a = t < 0.5 ? SHADE : MID;
    const b0 = t < 0.5 ? MID : BRIGHT;
    const k = t < 0.5 ? t * 2 : t * 2 - 1;

    let r = lerp(a[0], b0[0], k);
    let g = lerp(a[1], b0[1], k);
    let b = lerp(a[2], b0[2], k);

    // Calvas de hierba agostada, en el sage de la paleta. Sustituyen a la
    // tierra parda: rompen el verde sin ensuciarlo. La mezcla va corta a
    // propósito — con el sage entero las laderas altas salían color caqui y el
    // promontorio dejaba de leerse como prado.
    r = lerp(r, SAGE[0], dry * 0.55);
    g = lerp(g, SAGE[1], dry * 0.55);
    b = lerp(b, SAGE[2], dry * 0.55);

    height[y * size + x] = clumps * 0.5 + blades * 0.5;
    return [r, g, b];
  });

  const result = {
    map: toTexture(albedo, { repeat, srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 1.4), { repeat }),
  };
  cache.set(key, result);
  return result;
}

/**
 * Losas del enlosado: adoquines concéntricos irregulares con junta oscura.
 * Se aplica en coordenadas polares desde el propio shader del suelo, así que
 * aquí solo generamos la variación de piedra.
 */
export function flagstone({ seed = 77, size = 512, repeat = 1 } = {}) {
  const key = `flagstone:${seed}:${size}:${repeat}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const height = new Float32Array(size * size);

  const albedo = paint(size, (x, y, u, v) => {
    // Rejilla deformada por ruido: cada celda es una losa con su tono.
    const wobbleU = u + n.fbm(u * 4, v * 4, 1.1, 3, 2, 0.5) * 0.035;
    const wobbleV = v + n.fbm(u * 4, v * 4, 7.7, 3, 2, 0.5) * 0.035;
    const cols = 9;
    const cu = Math.floor(wobbleU * cols);
    const cv = Math.floor(wobbleV * cols);
    const cellId = n.noise3(cu * 1.7, cv * 1.7, 3.3) * 0.5 + 0.5;

    const fu = wobbleU * cols - cu;
    const fv = wobbleV * cols - cv;
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const joint = 1 - smoothstep(0.0, 0.045, edge);

    const grain = n.fbm(u * 46, v * 46, cellId * 20, 3, 2.3, 0.5) * 0.5 + 0.5;
    let lum = 0.30 + cellId * 0.22 + grain * 0.14;
    lum = lerp(lum, 0.10, joint);

    // Musgo en las juntas: la humedad se acumula donde no pisa nadie.
    const moss = joint * smoothstep(0.35, 0.8, n.fbm(u * 5.5, v * 5.5, 60.2, 3, 2, 0.5) * 0.5 + 0.5);
    const r = lerp(lum, lum * 0.55, moss);
    const g = lerp(lum * 0.99, lum * 1.25 + 0.03, moss);
    const b = lerp(lum * 0.94, lum * 0.5, moss);

    height[y * size + x] = (1 - joint) * (0.55 + grain * 0.45) + cellId * 0.1;
    return [r, g, b];
  });

  const result = {
    map: toTexture(albedo, { repeat, srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 2.8), { repeat }),
  };
  cache.set(key, result);
  return result;
}

/**
 * Adoquinado de sendero.
 *
 * Es una tira, no un azulejo: `u` cruza el camino de lado a lado y `v` corre a
 * lo largo, así que solo se repite en una dirección. Eso permite pintar cosas
 * que dependen de dónde estés a lo ancho — el desgaste del centro por donde
 * pisa la gente, la tierra que asoma en los bordes y el recorte irregular del
 * contorno — que es justo lo que separa un camino de una alfombra de piedra.
 *
 * El canal alfa lleva el borde comido. Sin él, la cinta acaba en una línea
 * recta contra la hierba y se lee como una calcomanía.
 */
export function cobblePath({ seed = 5, width = 256, height = 512 } = {}) {
  const key = `cobble:${seed}:${width}:${height}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const relief = new Float32Array(width * height);

  const canvas = canvasOf(width);
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.createImageData(width, height);
  const data = image.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const i = y * width + x;

      // Celdas de adoquín: rejilla deformada, más apretada en el centro.
      const wu = u + n.fbm(u * 5, v * 14, 2.3, 3, 2, 0.5) * 0.045;
      const wv = v + n.fbm(u * 5, v * 14, 8.1, 3, 2, 0.5) * 0.022;
      const cols = 7;
      const rows = 22;
      const cu = Math.floor(wu * cols);
      const cv = Math.floor(wv * rows);
      const cell = n.noise3(cu * 2.1, cv * 2.1, 5.5) * 0.5 + 0.5;
      const fu = wu * cols - cu;
      const fv = wv * rows - cv;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const joint = 1 - smoothstep(0.0, 0.085, edge);

      const grain = n.fbm(u * 60, v * 90, cell * 30, 3, 2.3, 0.5) * 0.5 + 0.5;
      let lum = 0.34 + cell * 0.20 + grain * 0.13;
      lum = lerp(lum, 0.11, joint);

      // Rodada central: por donde se pisa, la piedra está lisa y clara.
      const centre = 1 - smoothstep(0.0, 0.34, Math.abs(u - 0.5));
      lum = lerp(lum, lum * 1.16 + 0.05, centre * 0.55);

      let r = lum * 1.02;
      let g = lum * 1.0;
      let b = lum * 0.94;

      // Tierra pisada hacia los bordes: la piedra se va soltando.
      const soil = smoothstep(0.26, 0.46, Math.abs(u - 0.5))
        * (0.55 + n.fbm(u * 6, v * 18, 31.7, 3, 2.2, 0.5) * 0.9);
      r = lerp(r, 0.40, clamp(soil, 0, 1) * 0.8);
      g = lerp(g, 0.32, clamp(soil, 0, 1) * 0.8);
      b = lerp(b, 0.22, clamp(soil, 0, 1) * 0.8);

      // Musgo en la junta, y solo donde no se pisa.
      const moss = joint * (1 - centre) * smoothstep(0.4, 0.85, n.fbm(u * 7, v * 20, 60.2, 3, 2, 0.5) * 0.5 + 0.5);
      r = lerp(r, r * 0.55, moss);
      g = lerp(g, g * 1.30 + 0.03, moss);
      b = lerp(b, b * 0.52, moss);

      // Contorno comido: el camino no acaba en línea recta.
      const bite = n.fbm(u * 3, v * 26, 77.1, 3, 2.4, 0.5) * 0.5 + 0.5;
      const across = 1 - Math.abs(u - 0.5) * 2;      // 1 centro, 0 borde
      const alpha = across > 0.10 + bite * 0.20 ? 255 : 0;

      relief[i] = (1 - joint) * (0.55 + grain * 0.45) + cell * 0.12;

      data[i * 4] = clamp(r, 0, 1) * 255;
      data[i * 4 + 1] = clamp(g, 0, 1) * 255;
      data[i * 4 + 2] = clamp(b, 0, 1) * 255;
      data[i * 4 + 3] = alpha;
    }
  }
  ctx.putImageData(image, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // A lo ancho NO se repite: la tira es el camino entero de borde a borde.
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const normalCanvas = canvasOf(width);
  normalCanvas.height = height;
  const nctx = normalCanvas.getContext('2d');
  const nimg = nctx.createImageData(width, height);
  const nd = nimg.data;
  const at = (x, y) => relief[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = at(x - 1, y) - at(x + 1, y);
      const dy = at(x, y - 1) - at(x, y + 1);
      let nx = dx * 2.6;
      let ny = dy * 2.6;
      const len = Math.hypot(nx, ny, 1) || 1;
      nx /= len;
      ny /= len;
      const i = (y * width + x) * 4;
      nd[i] = (nx * 0.5 + 0.5) * 255;
      nd[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      nd[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.ClampToEdgeWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;

  const result = { map, normalMap };
  cache.set(key, result);
  return result;
}

/**
 * Corteza: vetas verticales, grietas profundas y musgo en la cara norte.
 */
export function bark({ seed = 21, size = 512, repeat = 1, gnarled = 0.5 } = {}) {
  const key = `bark:${seed}:${size}:${repeat}:${gnarled}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const height = new Float32Array(size * size);

  const albedo = paint(size, (x, y, u, v) => {
    // Las vetas corren en vertical y se retuercen: estirar el ruido en V es
    // lo que las hace leer como corteza y no como piedra.
    const warp = n.fbm(u * 3.0, v * 0.8, 4.1, 3, 2.1, 0.5) * 0.12 * gnarled;
    const uu = u + warp;

    const fibre = n.fbm(uu * 26, v * 3.4, 1.7, 4, 2.3, 0.5) * 0.5 + 0.5;
    const coarse = n.fbm(uu * 7, v * 1.6, 8.3, 3, 2.2, 0.55) * 0.5 + 0.5;

    // Grietas: donde el ruido de cresta se acerca a cero.
    const ridge = Math.abs(n.fbm(uu * 11, v * 2.2, 15.5, 3, 2.4, 0.5));
    const crack = smoothstep(0.055, 0.0, ridge);

    let lum = 0.34 + coarse * 0.24 + fibre * 0.16;
    lum -= crack * 0.16 * (0.6 + gnarled * 0.8);

    // Marrón grisáceo, nunca saturado: la corteza mojada tira a gris.
    let r = lum * 1.12;
    let g = lum * 0.98;
    let b = lum * 0.82;

    // Musgo y liquen en manchas.
    const moss = smoothstep(0.55, 0.85, n.fbm(u * 4.2, v * 2.0, 60.7, 4, 2.2, 0.5) * 0.5 + 0.5);
    r = lerp(r, lum * 0.62, moss);
    g = lerp(g, lum * 1.18 + 0.03, moss);
    b = lerp(b, lum * 0.58, moss);

    height[y * size + x] = coarse * 0.5 + fibre * 0.5 - crack * 1.4;
    return [r, g, b];
  });

  const result = {
    map: toTexture(albedo, { repeat, srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 3.4), { repeat }),
  };
  cache.set(key, result);
  return result;
}

/**
 * Atlas de hojarasca: cuatro racimos distintos en una rejilla 2×2.
 *
 * Cada tarjeta del follaje toma uno de los cuatro, así que un árbol no repite
 * el mismo recorte por toda la copa. El canal alfa lleva la silueta recortada
 * — se usa con `alphaTest`, no con transparencia, para no tener que ordenar
 * cientos de tarjetas por profundidad.
 */
export function leafCluster({
  seed = 33,
  size = 512,
  leaves = 130,
  autumn = 0.25,
  shape = 'lobed',
  /** Tono de flor en grados. Si se da, sustituye al amarillo del borde. */
  flowerHue = null,
} = {}) {
  const key = `leaf:${seed}:${size}:${leaves}:${autumn}:${shape}:${flowerHue}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const random = makeRandom(seed);
  const half = size / 2;

  /** Hoja lobulada de roble. */
  const drawLobed = (r) => {
    ctx.beginPath();
    const lobes = 4;
    ctx.moveTo(0, -r);
    for (let i = 0; i < lobes * 2; i++) {
      const t = (i + 1) / (lobes * 2);
      const ang = -Math.PI / 2 + t * Math.PI;
      const rad = r * (i % 2 === 0 ? 0.52 : 0.34);
      ctx.quadraticCurveTo(Math.cos(ang) * rad * 1.5, -r + t * r * 2, Math.cos(ang) * rad, -r + t * r * 2);
    }
    for (let i = lobes * 2 - 1; i >= 0; i--) {
      const t = (i + 1) / (lobes * 2);
      const ang = -Math.PI / 2 + t * Math.PI;
      const rad = r * (i % 2 === 0 ? 0.52 : 0.34);
      ctx.quadraticCurveTo(-Math.cos(ang) * rad * 1.5, -r + t * r * 2, -Math.cos(ang) * rad, -r + t * r * 2);
    }
    ctx.closePath();
    ctx.fill();
  };

  /** Hoja compuesta de fresno: un raquis con folíolos a los lados. */
  const drawPinnate = (r) => {
    const pairs = 4;
    ctx.save();
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.9);
    ctx.lineTo(0, -r * 0.9);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    for (let i = 0; i <= pairs; i++) {
      const t = i / pairs;
      const y = r * 0.85 - t * r * 1.7;
      const len = r * (0.52 - t * 0.16);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * len * 0.55, y, len * 0.55, r * 0.13, side * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  /** Hoja acicular: brezo y tojo, trazos cortos y apretados. */
  const drawNeedle = (r) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, r * 0.26);
    ctx.strokeStyle = ctx.fillStyle;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + random() * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawLeaf =
    shape === 'pinnate' ? drawPinnate : shape === 'needle' ? drawNeedle : drawLobed;

  // Los racimos se reparten en cuatro cuadrantes del atlas.
  for (let cell = 0; cell < 4; cell++) {
    const cx = (cell % 2) * half + half / 2;
    const cy = Math.floor(cell / 2) * half + half / 2;
    const spread = half * 0.40;

    for (let i = 0; i < leaves; i++) {
      // Distribución en disco, algo más densa en el centro del racimo.
      const a = random() * Math.PI * 2;
      const rr = Math.pow(random(), 0.62) * spread;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.86;
      const scale = half * (0.058 + random() * 0.052) * (1 - (rr / spread) * 0.28);

      // Color: verde profundo dentro, más claro y amarillo en el borde.
      const edge = rr / spread;
      const yellow = Math.min(1, Math.pow(edge, 1.6) * autumn * 2.2 + random() * autumn * 0.28);
      if (flowerHue === null) {
        // Caducifolia: la hoja entera vira de verde a amarillo.
        const hue = lerp(96, 52, yellow);
        const sat = lerp(38, 62, yellow);
        const light = lerp(20 + edge * 16, 48, yellow) + (random() - 0.5) * 7;
        ctx.fillStyle = `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
      } else {
        // Con flor: NO se desplaza el tono de toda la hoja — se pintan de flor
        // solo algunas puntas, que es como florece un brezal.
        //
        // Interpolando el tono de verde (96°) a violeta (305°) se cruza por el
        // cian y el azul: la mata salía turquesa fosforito.
        const isFlower = random() < yellow;
        ctx.fillStyle = isFlower
          // Malva sordo, no fucsia. Medido sobre el propio atlas: la flor pesa
          // mucho más de lo que dice su porcentaje de píxeles, porque el trazo
          // acicular tiene radios largos y destaca sobre el verde compacto.
          // Por eso va desaturada y solo un punto más clara que el follaje.
          ? `hsl(${flowerHue}, ${(22 + random() * 10).toFixed(0)}%, ${(38 + random() * 8).toFixed(0)}%)`
          : `hsl(${(88 + random() * 18).toFixed(0)}, ${(28 + random() * 12).toFixed(0)}%, ${(28 + edge * 12).toFixed(0)}%)`;
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(random() * Math.PI * 2);
      ctx.globalAlpha = 0.88 + random() * 0.12;
      drawLeaf(scale);
      ctx.restore();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/**
 * Enlosado radial: anillos concéntricos de losas, como el pavimento de los
 * círculos de piedra de la referencia.
 *
 * Se dibuja en coordenadas polares y se aplica SIN repetición sobre la cara
 * superior del estrado, de modo que el centro de la textura coincide con el
 * centro del círculo y los anillos salen redondos de verdad.
 */
export function radialPaving({ seed = 5, size = 1024, rings = 9 } = {}) {
  const key = `radial:${seed}:${size}:${rings}`;
  if (cache.has(key)) return cache.get(key);

  const n = new SimplexNoise(seed);
  const height = new Float32Array(size * size);

  const albedo = paint(size, (x, y, u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2; // 0 en el centro, 1 en el borde
    const a = Math.atan2(dy, dx);

    if (r > 1.02) {
      height[y * size + x] = 0;
      return [0.06, 0.06, 0.055];
    }

    // Ondulación del radio: las juntas de un enlosado antiguo no son círculos
    // perfectos, y verlas perfectas delata el procedimiento.
    const wobble = n.fbm(Math.cos(a) * 2.2, Math.sin(a) * 2.2, r * 3.5, 3, 2.1, 0.5) * 0.012;
    const rr = r + wobble;

    const ringIndex = Math.floor(rr * rings);
    const ringFrac = rr * rings - ringIndex;

    // Cada anillo tiene más losas cuanto mayor es su perímetro.
    const slabs = Math.max(6, Math.round((ringIndex + 1) * 5.5));
    // Desfase por anillo: las juntas no se alinean en radios continuos.
    const offset = n.noise2(ringIndex * 3.1, seed) * Math.PI;
    const slabPos = ((a + Math.PI + offset) / (Math.PI * 2)) * slabs;
    const slabIndex = Math.floor(slabPos);
    const slabFrac = slabPos - slabIndex;

    const cellId = n.noise3(ringIndex * 2.3, slabIndex * 1.9, 7.7) * 0.5 + 0.5;

    // Junta: distancia al borde más cercano, radial o circunferencial.
    const jointR = Math.min(ringFrac, 1 - ringFrac);
    const jointA = Math.min(slabFrac, 1 - slabFrac);
    // Las dos juntas tienen que pesar PARECIDO, y medidas en metros, no en
    // fracción.
    //
    // La trampa está en que las dos fracciones no miden lo mismo: `jointR` va
    // sobre el ancho de una hilada y `jointA` sobre el arco de una losa, que a
    // este radio es casi tres veces mayor. Con el mismo número en las dos, la
    // junta radial salía al triple de ancha que la circunferencial, las hiladas
    // desaparecían y el enlosado se leía como un entarimado de duelas largas
    // tendidas en abanico desde el centro. Compensando la diferencia, lo que se
    // ve es una losa cerrada por sus cuatro lados.
    // Los dos anchos están puestos para que la junta mida unos ocho centímetros
    // de verdad: la losa del anillo exterior mide 2,4 m de ancho por 2,7 m de
    // arco, así que 0,018 de fracción es la junta y el resto es piedra.
    const joint = Math.max(
      1 - smoothstep(0.0, 0.020, jointR),
      1 - smoothstep(0.0, 0.016 / Math.max(0.35, rr), jointA)
    );

    const grain = n.fbm(u * 90, v * 90, cellId * 30, 3, 2.3, 0.5) * 0.5 + 0.5;
    // Cada losa es de un tono distinto: es la otra mitad de lo mismo. Una
    // cantería real se cortó de bloques distintos y se ve.
    let lum = 0.30 + cellId * 0.32 + grain * 0.12;
    // Desgaste: el centro está más pisado y pulido.
    lum *= 0.92 + smoothstep(1.0, 0.1, rr) * 0.16;
    lum = lerp(lum, 0.11, joint);

    // Musgo. Prende en las juntas y, sobre todo, en el borde exterior: es lo
    // que rompe la circunferencia perfecta contra la hierba. Sin él el estrado
    // termina en un canto de compás y se le ve el procedimiento.
    const patch = smoothstep(0.3, 0.85, n.fbm(u * 6.5, v * 6.5, 51.4, 3, 2, 0.5) * 0.5 + 0.5);
    const rim = smoothstep(0.78, 1.0, rr) * smoothstep(0.35, 0.75, n.fbm(u * 9, v * 9, 77.1, 3, 2, 0.5) * 0.5 + 0.5);
    const moss = Math.min(1, joint * patch * 0.55 + rim * 0.70);
    const r0 = lerp(lum * 0.96, lum * 0.6, moss);
    const g0 = lerp(lum * 1.0, lum * 1.22 + 0.02, moss);
    const b0 = lerp(lum * 1.08, lum * 0.55, moss);

    height[y * size + x] = (1 - joint) * (0.55 + grain * 0.45) + cellId * 0.12;
    return [r0, g0, b0];
  });

  const result = {
    map: toTexture(albedo, { repeat: 1, srgb: true }),
    normalMap: toTexture(heightToNormal(height, size, 3.0), { repeat: 1 }),
  };
  // Sin repetición: el patrón ya es radial y ha de quedar centrado.
  for (const tex of Object.values(result)) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }
  cache.set(key, result);
  return result;
}

/** Gradiente radial suave: sirve de sprite para brasas, motas y destellos. */
export function radialSprite({ size = 128, falloff = 2.4, inner = 0.0 } = {}) {
  const key = `sprite:${size}:${falloff}:${inner}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      let a = clamp(1 - d, 0, 1);
      a = Math.pow(a, falloff);
      if (inner > 0) a = clamp(a + smoothstep(inner, 0, d) * 0.6, 0, 1);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Curva de nubes para el cielo y para las sombras que barren el prado. */
export function cloudTexture({ seed = 3, size = 512 } = {}) {
  const key = `clouds:${seed}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const n = new SimplexNoise(seed);
  const canvas = paint(size, (x, y, u, v) => {
    // Ruido tileable: se muestrea en un toro para que no se vea la costura.
    const a1 = u * Math.PI * 2;
    const a2 = v * Math.PI * 2;
    const nx = Math.cos(a1) * 1.6;
    const ny = Math.sin(a1) * 1.6;
    const nz = Math.cos(a2) * 1.6 + Math.sin(a2) * 1.6;
    let d = n.fbm(nx, ny, nz, 5, 2.2, 0.55) * 0.5 + 0.5;
    d = smoothstep(0.42, 0.82, d);
    return [d, d, d];
  });
  const tex = toTexture(canvas, { repeat: 1 });
  cache.set(key, tex);
  return tex;
}

export function disposeTextureCache() {
  for (const value of cache.values()) {
    if (value instanceof THREE.Texture) value.dispose();
    else Object.values(value).forEach((t) => t.dispose?.());
  }
  cache.clear();
}
