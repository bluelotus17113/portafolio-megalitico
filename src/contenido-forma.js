import { imagenSegura, urlSegura } from './utils/enlaces.js';

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

  // ── Y ninguna dirección con un esquema que ejecute ─────────────────────
  //
  // Al pintar ya se sanea, así que esto es la segunda barrera y no la única.
  // Existe porque las dos protegen de cosas distintas: sanear al pintar cubre
  // los sitios que hoy conozco, y rechazar al guardar cubre los que se escriban
  // mañana. Un `javascript:` guardado es una bomba con la espoleta puesta,
  // esperando a que alguien añada un sitio nuevo donde se pinte esa URL.
  //
  // Y aquí no se sanea en silencio: se RECHAZA. Guardar callando un enlace que
  // el dueño acaba de escribir le deja creyendo que está puesto.
  for (const [donde, valor, comprobar] of direcciones(datos)) {
    if (valor && !comprobar(valor)) {
      return donde === 'identidad.foto'
        ? '«identidad.foto» tiene que ser un fichero del propio sitio, no una dirección externa'
        : `«${donde}» no es una dirección admitida (sólo http, https, mailto o una ruta del propio sitio)`;
    }
  }
  return null;
}

/**
 * Cada sitio del contenido donde vive una dirección, con su nombre y con la
 * comprobación que le toca — que no es la misma para todas.
 *
 * El retrato se mide con la vara estrecha: tiene que ser un fichero del propio
 * sitio. Un `https://` ajeno pasaría el filtro de esquemas y sería un chivato —
 * el servidor de un tercero se entera de cada vez que alguien abre tu currículo,
 * con su IP y su hora.
 */
function* direcciones(datos) {
  yield ['identidad.foto', datos.identidad?.foto, imagenSegura];
  for (let i = 0; i < (datos.proyectos ?? []).length; i++) {
    const p = datos.proyectos[i];
    if (p && typeof p === 'object') yield [`proyectos[${i}].url`, p.url, urlSegura];
  }
  const enlaces = datos.contacto?.links ?? [];
  for (let i = 0; i < enlaces.length; i++) {
    const l = enlaces[i];
    if (l && typeof l === 'object') yield [`contacto.links[${i}].href`, l.href, urlSegura];
  }
}
