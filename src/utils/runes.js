/**
 * Futhark antiguo como polilíneas.
 *
 * Cada runa es una lista de trazos en un cuadro de -0.5..0.5 (X derecha,
 * Y arriba). De ahí salen tanto los tubos 3D de la sección de habilidades
 * como los glifos pintados en canvas para las inscripciones.
 */

const S = 0.5; // media altura del stave

/** @type {Record<string, number[][][]>} nombre -> polilíneas -> puntos [x, y] */
export const RUNES = {
  fehu: [
    [[-0.18, -S], [-0.18, S]],
    [[-0.18, 0.28], [0.26, 0.5]],
    [[-0.18, 0.0], [0.26, 0.22]],
  ],
  uruz: [
    [[-0.24, -S], [-0.24, 0.34], [0.24, S], [0.24, -0.1]],
  ],
  thurisaz: [
    [[-0.2, -S], [-0.2, S]],
    [[-0.2, 0.3], [0.24, 0.05], [-0.2, -0.2]],
  ],
  ansuz: [
    [[-0.2, -S], [-0.2, S]],
    [[-0.2, 0.42], [0.24, 0.16]],
    [[-0.2, 0.12], [0.24, -0.14]],
  ],
  raidho: [
    [[-0.22, -S], [-0.22, S]],
    [[-0.22, S], [0.22, 0.28], [-0.22, 0.06]],
    [[-0.22, 0.06], [0.24, -S]],
  ],
  kaunan: [
    [[0.22, S], [-0.22, 0.0], [0.22, -S]],
  ],
  gebo: [
    [[-0.26, -S], [0.26, S]],
    [[0.26, -S], [-0.26, S]],
  ],
  wunjo: [
    [[-0.2, -S], [-0.2, S]],
    [[-0.2, S], [0.24, 0.28], [-0.2, 0.06]],
  ],
  hagalaz: [
    [[-0.24, -S], [-0.24, S]],
    [[0.24, -S], [0.24, S]],
    [[-0.24, 0.12], [0.24, -0.12]],
  ],
  naudiz: [
    [[0.0, -S], [0.0, S]],
    [[-0.26, -0.18], [0.26, 0.18]],
  ],
  isaz: [
    [[0.0, -S], [0.0, S]],
  ],
  jera: [
    [[-0.28, 0.34], [0.0, 0.12], [-0.28, -0.1]],
    [[0.28, -0.34], [0.0, -0.12], [0.28, 0.1]],
  ],
  eihwaz: [
    [[0.0, -0.36], [0.0, 0.36]],
    [[0.0, 0.36], [0.26, S]],
    [[0.0, -0.36], [-0.26, -S]],
  ],
  perth: [
    [[-0.2, -S], [-0.2, S]],
    [[-0.2, S], [0.22, 0.28]],
    [[-0.2, -S], [0.22, -0.28]],
    [[0.22, 0.28], [0.22, -0.28]],
  ],
  algiz: [
    [[0.0, -S], [0.0, S]],
    [[0.0, 0.16], [-0.28, S]],
    [[0.0, 0.16], [0.28, S]],
  ],
  sowilo: [
    [[0.24, S], [-0.14, 0.18], [0.16, -0.06], [-0.24, -S]],
  ],
  tiwaz: [
    [[0.0, -S], [0.0, S]],
    [[-0.26, 0.2], [0.0, S], [0.26, 0.2]],
  ],
  berkanan: [
    [[-0.2, -S], [-0.2, S]],
    [[-0.2, S], [0.24, 0.26], [-0.2, 0.02]],
    [[-0.2, 0.02], [0.24, -0.24], [-0.2, -S]],
  ],
  ehwaz: [
    [[-0.26, -S], [-0.26, S]],
    [[0.26, -S], [0.26, S]],
    [[-0.26, S], [0.0, 0.06], [0.26, S]],
  ],
  mannaz: [
    [[-0.26, -S], [-0.26, S]],
    [[0.26, -S], [0.26, S]],
    [[-0.26, S], [0.26, 0.02]],
    [[0.26, S], [-0.26, 0.02]],
  ],
  laguz: [
    [[-0.12, -S], [-0.12, S]],
    [[-0.12, S], [0.26, 0.24]],
  ],
  ingwaz: [
    [[0.0, S], [0.26, 0.0], [0.0, -S], [-0.26, 0.0], [0.0, S]],
  ],
  dagaz: [
    [[-0.26, -S], [-0.26, S]],
    [[0.26, -S], [0.26, S]],
    [[-0.26, S], [0.26, -S]],
    [[-0.26, -S], [0.26, S]],
  ],
  othala: [
    [[0.0, S], [0.24, 0.16], [0.0, -0.16], [-0.24, 0.16], [0.0, S]],
    [[0.0, -0.16], [0.28, -S]],
    [[0.0, -0.16], [-0.28, -S]],
  ],
};

export const RUNE_NAMES = Object.keys(RUNES);

/** Runa determinista a partir de un texto: mismo nombre, misma runa. */
export function runeFor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return RUNE_NAMES[h % RUNE_NAMES.length];
}

/**
 * Espiral triple tipo Newgrange (triskel). Es el motivo grabado que aparece
 * en las losas de la referencia; se genera como polilíneas para poder
 * dibujarlo tanto en canvas como en geometría.
 */
export function triskelion({ arms = 3, turns = 2.6, points = 90, radius = 0.46 } = {}) {
  const paths = [];
  for (let a = 0; a < arms; a++) {
    const base = (a / arms) * Math.PI * 2;
    const path = [];
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const angle = base + t * turns * Math.PI * 2;
      const r = radius * Math.pow(t, 0.78);
      path.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    paths.push(path.reverse());
  }
  return paths;
}

/** Nudo celta simple: dos elipses entrelazadas repetidas en anillo. */
export function knotRing({ lobes = 6, radius = 0.42, inner = 0.16, points = 220 } = {}) {
  const path = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const r = radius + Math.sin(t * lobes) * inner;
    path.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return [path];
}

/**
 * Roseta de espirales: el medallón de los monolitos celtas de la referencia.
 *
 * No es un nudo entrelazado — eso pide resolver cruces por encima y por debajo,
 * y a la escala a la que se ve aquí no se distinguiría. Es lo otro que aparece
 * una y otra vez tallado en estas piedras: una flor de brazos curvos girando
 * desde el centro, rematada por un aro concéntrico.
 *
 * Cada brazo es un tramo de espiral logarítmica; el giro de todos en el mismo
 * sentido es lo que da la sensación de rotación que tiene el motivo real.
 */
export function rosette({ arms = 8, radius = 0.44, inner = 0.10, sweep = 1.25, points = 26, ring = true } = {}) {
  const paths = [];
  for (let a = 0; a < arms; a++) {
    const base = (a / arms) * Math.PI * 2;
    const path = [];
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const r = inner + (radius - inner) * t;
      // La espiral se abre y luego vuelve: el brazo es un pétalo, no un rayo.
      const angle = base + Math.sin(t * Math.PI) * sweep;
      path.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    // Vuelta al centro por el otro flanco: cierra el pétalo.
    for (let i = points; i >= 0; i--) {
      const t = i / points;
      const r = inner + (radius - inner) * t;
      const angle = base + Math.sin(t * Math.PI) * sweep * 0.42;
      path.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    paths.push(path);
  }
  if (ring) {
    const circle = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      circle.push([Math.cos(t) * (radius + 0.055), Math.sin(t) * (radius + 0.055)]);
    }
    paths.push(circle);
  }
  return paths;
}
