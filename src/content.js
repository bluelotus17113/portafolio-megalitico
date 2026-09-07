/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EL CONTENIDO DEL PORTAFOLIO. Se edita con el panel, no aquí.
 *
 *      npm run dev   →   http://127.0.0.1:5173/?admin
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este fichero era la lista de datos y ahora es el CARGADOR de esa lista, que
 * vive en `contenido.json` al lado. El cambio tiene un motivo concreto: un
 * panel que escribiera JavaScript se llevaría por delante estos comentarios en
 * el primer guardado, y son la mitad de para qué existe el fichero. En JSON
 * están los datos; aquí, lo que hay que saber para rellenarlos.
 *
 * Se puede seguir editando `contenido.json` a mano con cualquier editor: es un
 * fichero normal y versionado. Lo que NO conviene es volver a poner los datos
 * aquí dentro, porque entonces habría dos sitios donde mirar y un día no
 * dirían lo mismo.
 *
 * Todo lo de abajo alimenta LAS DOS versiones a la vez —el promontorio en 3D y
 * la página ligera— y también la hoja de vida imprimible. Se escribe una vez.
 *
 * ── Qué lleva cada cosa ────────────────────────────────────────────────────
 *
 * **identidad**
 *   `name`        En la cabecera y en la pantalla de carga.
 *   `role`        Una línea. Va bajo el nombre en la pantalla de entrada.
 *   `oghamMotto`  Se graba en ogham en la estela. Sólo letras latinas, sin
 *                 números: el alfabeto ogham no tiene cifras y lo que no sabe
 *                 transcribir lo deja en blanco.
 *
 * **perfil**
 *   `body`        Párrafos. Añade o quita los que quieras.
 *   `facts`       Datos sueltos que se muestran como fichas. Los que valgan
 *                 «—» no se imprimen en la hoja de vida.
 *
 * **proyectos** — la escena coloca UN MONOLITO POR PROYECTO. Entre 6 y 12 se
 *   ve bien; con más, el círculo se aprieta.
 *   `url`         Opcional. En `null` no se pinta enlace.
 *   `poster`      Semilla y tono del cartel procedural que flota sobre el
 *                 monolito. Dos proyectos con la misma semilla llevan el mismo
 *                 cartel, así que conviene que no se repitan.
 *
 * **habilidades** — una runa por habilidad.
 *   `level`       De 0 a 1: controla el tamaño y el brillo de la runa. En la
 *                 hoja de vida no se dibuja, pero ORDENA cada familia.
 *   `family`      Agrupa las runas en anillos concéntricos.
 *
 * **trayectoria** — un mojón por entrada, **de la más antigua a la más
 *   reciente**. El camino de la escena asciende hacia el presente, así que el
 *   orden importa. La hoja de vida la da la vuelta ella sola, que en papel se
 *   lee al revés.
 *
 * **contacto**
 *   `links`       `href` en null deja el enlace desactivado y apagado.
 *   `endpoint`    Si pones aquí una dirección (Formspree, Basin, tu propio
 *                 servidor…) el altar enviará de verdad. Con null sólo simula
 *                 el envío.
 */

// El atributo `with { type: 'json' }` no es adorno: sin él, Node se niega a
// importar este fichero —`ERR_IMPORT_ATTRIBUTE_MISSING`—, y `content.js` se
// importa desde Node en las herramientas de comprobación. Vite lo admite
// igual, así que se pone y funcionan los dos.
import datos from './contenido.json' with { type: 'json' };

export const IDENTITY = datos.identidad;
export const ABOUT = datos.perfil;
export const PROJECTS = datos.proyectos;
export const SKILLS = datos.habilidades;
export const EXPERIENCE = datos.trayectoria;
export const CONTACT = datos.contacto;

/**
 * Todo junto, con las claves tal y como se guardan.
 *
 * Lo usa el panel, que necesita el documento entero para editarlo y volver a
 * escribirlo. El resto del proyecto sigue tirando de los seis de arriba.
 */
export const CONTENIDO = datos;
