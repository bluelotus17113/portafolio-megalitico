/**
 * Ogham: el alfabeto de las estelas irlandesas.
 *
 * Se escribe sobre una arista (el "druim") de abajo arriba, con grupos de
 * 1 a 5 muescas. El lado y la inclinación de la muesca determinan el aicme
 * (la familia) y por tanto la letra.
 */

/** side: 'right' | 'left' | 'across' (perpendicular) | 'diagonal' */
const LETTERS = {
  // Aicme Beithe — a la derecha del druim
  b: { count: 1, side: 'right' },
  l: { count: 2, side: 'right' },
  f: { count: 3, side: 'right' },
  v: { count: 3, side: 'right' },
  s: { count: 4, side: 'right' },
  n: { count: 5, side: 'right' },
  // Aicme hÚatha — a la izquierda
  h: { count: 1, side: 'left' },
  d: { count: 2, side: 'left' },
  t: { count: 3, side: 'left' },
  c: { count: 4, side: 'left' },
  k: { count: 4, side: 'left' },
  q: { count: 5, side: 'left' },
  // Aicme Muine — cruzando en diagonal
  m: { count: 1, side: 'diagonal' },
  g: { count: 2, side: 'diagonal' },
  y: { count: 3, side: 'diagonal' }, // ng
  z: { count: 4, side: 'diagonal' },
  r: { count: 5, side: 'diagonal' },
  // Aicme Ailme — vocales, muescas cortas perpendiculares
  a: { count: 1, side: 'across' },
  o: { count: 2, side: 'across' },
  u: { count: 3, side: 'across' },
  e: { count: 4, side: 'across' },
  i: { count: 5, side: 'across' },
  // Forfeda y dígrafos habituales
  p: { count: 5, side: 'diagonal' },
  j: { count: 2, side: 'diagonal' },
  w: { count: 3, side: 'right' },
  x: { count: 4, side: 'diagonal' },
};

const ACCENTS = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', ç: 'c' };

/** Convierte texto latino a la secuencia de grupos de muescas ogham. */
export function textToOgham(text) {
  const out = [];
  const clean = text.toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const raw = clean[i];
    const ch = ACCENTS[raw] ?? raw;
    if (ch === ' ') {
      out.push({ char: ' ', space: true });
      continue;
    }
    const letter = LETTERS[ch];
    if (letter) out.push({ char: ch, ...letter });
  }
  return out;
}

/**
 * Traza las muescas a lo largo de un druim vertical.
 *
 * Devuelve segmentos [x0, y0, x1, y1] en un sistema donde x = 0 es la arista,
 * x > 0 el lado derecho, e y avanza de abajo arriba.
 *
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.length  Longitud total disponible del druim.
 * @param {number} opts.stroke  Largo de una muesca completa.
 * @param {number} opts.gap     Separación entre muescas del mismo grupo.
 * @param {number} opts.space   Separación entre letras.
 */
export function oghamStrokes(text, { length = 10, stroke = 0.7, gap = 0.22, space = 0.5 } = {}) {
  const letters = textToOgham(text);
  const segments = [];

  // Primera pasada: cuánto ocupa el texto para poder centrarlo.
  let total = 0;
  for (const l of letters) {
    total += l.space ? space * 1.6 : (l.count - 1) * gap + space;
  }
  const scale = total > length ? length / total : 1;
  const g = gap * scale;
  const sp = space * scale;
  const st = stroke * scale;

  let y = -Math.min(total, length) / 2;
  for (const l of letters) {
    if (l.space) {
      y += sp * 1.6;
      continue;
    }
    const spanStart = y;
    for (let i = 0; i < l.count; i++) {
      const ly = spanStart + i * g;
      switch (l.side) {
        case 'right':
          segments.push([0, ly, st, ly]);
          break;
        case 'left':
          segments.push([-st, ly, 0, ly]);
          break;
        case 'across':
          segments.push([-st * 0.55, ly, st * 0.55, ly]);
          break;
        case 'diagonal':
          segments.push([-st * 0.62, ly - st * 0.34, st * 0.62, ly + st * 0.34]);
          break;
        default:
          break;
      }
    }
    y = spanStart + (l.count - 1) * g + sp;
  }

  return segments;
}
