/**
 * Qué tiene que ser un `contenido.json` para no romper la web.
 *
 * Vive aquí, y no dentro de quien escribe, porque lo consultan DOS: el
 * complemento de Vite cuando guardas en local y la función de Vercel cuando
 * guardas desde el panel publicado. Con una copia en cada sitio, la primera vez
 * que se añada un bloque nuevo una de las dos se queda vieja — y la que se
 * quede vieja dejará pasar un fichero que la otra rechaza, o al revés.
 *
 * Comprueba la FORMA, no los valores: que falte un resumen es cosa de quien
 * escribe, pero que `proyectos` no sea una lista es un fichero roto que deja la
 * web en blanco.
 */
export function revisarContenido(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return 'se esperaba un objeto';
  }
  for (const clave of ['identidad', 'perfil', 'contacto']) {
    if (!datos[clave] || typeof datos[clave] !== 'object' || Array.isArray(datos[clave])) {
      return `falta el bloque «${clave}»`;
    }
  }
  for (const clave of ['proyectos', 'habilidades', 'trayectoria', 'formacion']) {
    if (!Array.isArray(datos[clave])) return `«${clave}» tiene que ser una lista`;
  }
  if (!Array.isArray(datos.perfil.body)) return '«perfil.body» tiene que ser una lista de párrafos';
  if (typeof datos.identidad.name !== 'string') return '«identidad.name» tiene que ser texto';
  if (datos.perfiles !== undefined && !Array.isArray(datos.perfiles)) {
    return '«perfiles» tiene que ser una lista';
  }
  return null;
}
