/**
 * Utilidades de HTML compartidas por las dos versiones del portafolio.
 *
 * Vive aparte de `ui/panels.js` porque la versión ligera también las necesita
 * y `panels.js` es el contenido del panel lateral de la escena: importarlo
 * desde fuera arrastraría media interfaz tridimensional detrás.
 */

/**
 * Escapa para interpolar en HTML. El contenido lo escribe una persona, pero un
 * `&` suelto en un nombre no debería romper la página.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Color de sección (número de `config.js`) a `#rrggbb`. */
export function hex(color, porDefecto = 0x4fe6d8) {
  return `#${(color ?? porDefecto).toString(16).padStart(6, '0')}`;
}
