/**
 * Runas y ogham como SVG en línea.
 *
 * Los trazos no se vuelven a dibujar aquí: salen de `runes.js` y `ogham.js`,
 * que son los mismos que la escena convierte en tubos de piedra y en muescas
 * cinceladas sobre la estela. Esto sólo los pasa de polilíneas a `<path>`.
 *
 * Que sea la misma fuente importa más de lo que parece. Redibujar las runas a
 * mano para la página habría dado dos alfabetos parecidos que van separándose
 * con cada retoque, y la gracia de que la versión ligera parezca un panel
 * grabado es justamente que lo que hay grabado sea lo mismo.
 *
 * Ni una línea de three, ni directa ni por debajo: los dos módulos de los que
 * cuelga son geometría pura, y por eso la versión ligera puede usarlos.
 */

import { RUNES } from './runes.js';
import { oghamStrokes } from './ogham.js';

/**
 * Una runa del futhark antiguo.
 *
 * Los trazos vienen en un cuadro de −0,5 a 0,5 con la Y hacia arriba; el SVG
 * la tiene hacia abajo, así que se voltea al convertir.
 *
 * @param {string} nombre  clave de `RUNES`
 */
export function runaSVG(nombre, { tam = 40, grosor = 1.5, clase = '' } = {}) {
  const trazos = RUNES[nombre];
  if (!trazos) return '';

  const d = trazos
    .map((linea) =>
      linea
        .map(([x, y], i) => `${i ? 'L' : 'M'}${(x + 0.5).toFixed(4)} ${(0.5 - y).toFixed(4)}`)
        .join(' ')
    )
    .join(' ');

  return `<svg class="${clase}" viewBox="0 0 1 1" width="${tam}" height="${tam}" aria-hidden="true"
    fill="none" stroke="currentColor" stroke-width="${(grosor / tam).toFixed(4)}"
    stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/**
 * Una inscripción ogham vertical, con su arista y sus muescas.
 *
 * El ogham se lee de abajo arriba sobre la arista de la piedra, y así se
 * dibuja: la caja se calcula de los propios trazos en vez de darla por
 * supuesta, porque cuántas muescas salen a cada lado depende de las letras.
 *
 * @param {string} texto  se transcribe tal cual; los acentos se reducen
 */
export function oghamSVG(texto, { alto = 200, grosor = 1.3, clase = '', arista = true } = {}) {
  const segmentos = oghamStrokes(texto, { length: 10, stroke: 0.62, gap: 0.2, space: 0.46 });
  if (!segmentos.length) return '';

  let minX = 0;
  let maxX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x1, y1, x2, y2] of segmentos) {
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  // La caja se hace simétrica alrededor de la arista.
  //
  // Sin esto la caja se ciñe a las muescas, y como cuántas caen a cada lado
  // depende de las letras, la arista queda descentrada por una cantidad
  // distinta en cada palabra. Al colocar el SVG centrado sobre la línea
  // vertical de la página, la arista se separaba de ella un poco y de forma
  // impredecible: dos rayas paralelas casi juntas, que es peor que una sola.
  const brazo = Math.max(Math.abs(minX), Math.abs(maxX));
  const margen = 0.18;
  minX = -brazo - margen;
  maxX = brazo + margen;
  minY -= margen * 1.4;
  maxY += margen * 1.4;

  const anchoU = maxX - minX;
  const altoU = maxY - minY;
  const ancho = Math.round((alto * anchoU) / altoU);

  // Y hacia abajo en SVG: se voltea contra `maxY`.
  const px = (x) => (x - minX).toFixed(4);
  const py = (y) => (maxY - y).toFixed(4);

  const muescas = segmentos
    .map(([x1, y1, x2, y2]) => `M${px(x1)} ${py(y1)}L${px(x2)} ${py(y2)}`)
    .join(' ');
  const druim = arista ? `<path d="M${px(0)} 0L${px(0)} ${altoU.toFixed(4)}" opacity="0.45"/>` : '';

  return `<svg class="${clase}" viewBox="0 0 ${anchoU.toFixed(4)} ${altoU.toFixed(4)}"
    width="${ancho}" height="${alto}" aria-hidden="true"
    fill="none" stroke="currentColor" stroke-width="${((grosor * altoU) / alto).toFixed(4)}"
    stroke-linecap="round">${druim}<path d="${muescas}"/></svg>`;
}
