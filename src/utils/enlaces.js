/**
 * Saneado de las direcciones que vienen del contenido.
 *
 * Escapar no basta, y esa es toda la razón de que esto exista. `esc()` convierte
 * `<`, `>` y las comillas en entidades, que es lo que impide romper el atributo
 * y salirse a escribir HTML. Pero `javascript:alert(document.cookie)` no lleva
 * ninguno de esos caracteres: atraviesa el escapado intacto y queda como
 * `href="javascript:..."`, que al pulsarlo ejecuta.
 *
 * Ahí la cookie de sesión es `HttpOnly` y no se puede leer, pero el guion corre
 * en la página con la sesión abierta: puede llamar a `/api/contenido` en tu
 * nombre y reescribir el currículo entero. No hace falta robar la cookie cuando
 * se puede usar.
 *
 * Por eso la regla no es «quitar lo malo» sino AL REVÉS: sólo pasan los
 * esquemas que se han decidido, y todo lo demás cae. Una lista de esquemas
 * prohibidos siempre se queda corta —`data:`, `vbscript:`, `JaVaScRiPt:` con
 * mayúsculas alternas, con espacios delante, con `&#106;`— y basta con que se
 * olvide uno.
 */

/** Lo único que un enlace del contenido puede ser. */
const PERMITIDOS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Devuelve la dirección si es de fiar, y `null` si no.
 *
 * Las relativas pasan —`retrato.jpg`, `/algo`— porque son del propio sitio y no
 * pueden llevar esquema; se comprueba explícitamente que no empiecen por algo
 * con dos puntos antes de la primera barra, que es como se cuela `javascript:`
 * disfrazado de ruta.
 */
export function urlSegura(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  // Relativa: ni esquema ni protocolo-relativa (`//otro-sitio`).
  if (!/^[a-z][a-z0-9+.-]*:/i.test(texto)) {
    return texto.startsWith('//') ? null : texto;
  }
  try {
    // La base sólo sirve para que `URL` acepte relativas; aquí ya sabemos que
    // hay esquema, así que lo que se lee es el de verdad.
    const u = new URL(texto);
    return PERMITIDOS.has(u.protocol) ? texto : null;
  } catch {
    return null;
  }
}

/** Igual, pero para escribir dentro de un atributo: nunca devuelve vacío. */
export const hrefSeguro = (valor) => urlSegura(valor) ?? '#';

/**
 * Imágenes: además del esquema, se exige que sea del propio sitio.
 *
 * Un retrato es un fichero que sube el dueño a `public/`. Permitir una URL
 * externa convertiría la hoja de vida en un chivato: cada vez que alguien la
 * abre, el servidor de un tercero se entera de que la ha abierto.
 */
export function imagenSegura(valor) {
  const limpio = urlSegura(valor);
  if (!limpio) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(limpio) ? null : limpio;
}
