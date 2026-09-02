/**
 * Qué versión del portafolio se sirve.
 *
 * Hay dos y son la misma obra: el promontorio tridimensional y una página
 * normal que se lee del tirón. Las dos se dibujan desde `content.js`, así que
 * el texto se escribe una sola vez y se rellena en las dos a la vez.
 *
 * Quién decide, por este orden: lo que pide la URL, lo que el visitante eligió
 * la última vez, y sólo si no hay nada de eso, lo que el equipo puede sostener.
 * La elección manual gana siempre a la detección: quien pide la escena a
 * sabiendas en un equipo justo tiene derecho a verla ir mal.
 */

export const PLENO = 'pleno';
export const LIGERO = 'ligero';

const CLAVE = 'portafolio:modo';
const PARAMETRO = 'modo';

/**
 * WebGL 2 disponible. Esto no es una preferencia: sin ello la escena no puede
 * existir, y el único desenlace posible es la versión ligera.
 *
 * Se pregunta una vez y se guarda la respuesta, y el contexto de prueba se
 * suelta en cuanto se ha mirado. Las dos cosas por el mismo motivo: un
 * contexto WebGL es un recurso contado —Chromium avisa por consola («Too many
 * active WebGL contexts») y mata el más antiguo para hacer sitio—, y esta
 * función se llama desde varios puntos de la página. Sondear tres veces y
 * quedarse los tres contextos es dejar puesta una trampa para que, el día que
 * se llame desde un cuarto sitio, el que se muera sea el de la escena.
 */
let _soporte = null;

export function haySoporteWebGL() {
  if (_soporte !== null) return _soporte;
  try {
    if (!window.WebGL2RenderingContext) return (_soporte = false);
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    // Devolverlo en cuanto se sabe la respuesta: es lo único que se quería.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return (_soporte = Boolean(gl));
  } catch {
    return (_soporte = false);
  }
}

/**
 * Equipo que probablemente no va a poder con la escena.
 *
 * Deliberadamente estrecho, y en contra de la tentación. Un móvil corriente
 * aguanta el promontorio de sobra, y el móvil es justo donde más se comparte
 * un enlace: mandar a la versión ligera por el mero hecho de ser táctil sería
 * regalar lo único que distingue este portafolio de los demás. Así que sólo se
 * degrada de oficio cuando el propio navegador declara que va justo —memoria,
 * núcleos— o cuando el visitante ha pedido ahorro de datos, que es una
 * instrucción suya y no una medida.
 */
function equipoJusto() {
  const conexion = navigator.connection;
  if (conexion?.saveData) return true;
  if ((navigator.deviceMemory ?? 8) <= 2) return true;
  if ((navigator.hardwareConcurrency ?? 4) <= 2) return true;
  return false;
}

function guardado() {
  try {
    const valor = localStorage.getItem(CLAVE);
    return valor === PLENO || valor === LIGERO ? valor : null;
  } catch {
    // Navegación privada con el almacenamiento cerrado: no es un error, sólo
    // significa que no hay memoria de la visita anterior.
    return null;
  }
}

export function recordar(modo) {
  try {
    localStorage.setItem(CLAVE, modo);
  } catch {
    /* sin almacenamiento: manda la URL, que también viaja en el enlace */
  }
}

/**
 * Marca de «vengo de pulsar Ver en 3D», que sobrevive a la recarga.
 *
 * En `sessionStorage` y no en la URL a propósito: lo que hay que distinguir no
 * es a qué dirección se llega, sino de dónde se viene. Quien pulsa el botón ya
 * ha dicho que quiere entrar y hacerle pulsar «Explorar» otra vez es cobrarle
 * dos clics por una decisión. Quien abre un enlace `?modo=3d` que le han
 * pasado, en cambio, no ha decidido nada todavía: a ese la portada le sirve de
 * presentación y de aviso de que aquí se carga un mundo. Con la intención en
 * la URL los dos casos serían el mismo.
 *
 * Se lee una sola vez: consultarla la consume, para que un F5 posterior vuelva
 * a enseñar la portada.
 */
const ENTRAR = 'portafolio:entrar';

function pedirEntradaDirecta() {
  try {
    sessionStorage.setItem(ENTRAR, '1');
  } catch {
    /* sin almacenamiento se entra por la portada, que tampoco es un drama */
  }
}

export function seVieneDePulsarEntrar() {
  try {
    const si = sessionStorage.getItem(ENTRAR) === '1';
    sessionStorage.removeItem(ENTRAR);
    return si;
  } catch {
    return false;
  }
}

/**
 * Lo que pide la URL, o `null` si no pide nada.
 *
 * Nada de detección aquí: esto contesta sólo a lo que está escrito en la
 * dirección. Sin nada escrito, `main.js` enseña la puerta y elige el visitante
 * — la decisión de si un portafolio se mira o se lee no es del portafolio.
 *
 * Y pedir la escena a las claras se respeta aunque la sonda de WebGL diga que
 * no. Antes se desviaba a la ligera «por su bien», y eso convertía un falso
 * negativo en una condena sin apelación: quien sabe que su equipo puede no
 * tenía forma de insistir. Si de verdad no hay WebGL, el renderizador revienta
 * al arrancar y `main.js` lo recoge y lo cuenta. Fallar diciendo por qué es
 * mejor que negarse en silencio.
 *
 * @returns {'pleno'|'ligero'|null}
 */
export function modoPedido() {
  const p = new URLSearchParams(location.search);
  const pedido = p.get(PARAMETRO);
  if (pedido === LIGERO) return LIGERO;
  if (pedido === '3d' || pedido === PLENO) return PLENO;

  // `instant` y `editor` sólo existen para la escena: quien los escribe está
  // pidiendo la isla aunque no lo diga. Sin esto, las herramientas de captura
  // y de prueba se quedarían mirando la puerta.
  if (p.has('instant') || p.has('editor')) return PLENO;

  return null;
}

/**
 * Qué opción llega marcada en la puerta. No decide: sólo sugiere.
 *
 * Primero lo que el visitante eligió la última vez. Si es su primera visita,
 * lo que el equipo aguante — y esa detección es deliberadamente estrecha, ver
 * `equipoJusto()`. En ningún caso se salta la puerta: sugerir es poner la mano
 * en un picaporte, no abrirlo.
 *
 * @returns {'pleno'|'ligero'}
 */
export function modoRecordado() {
  if (!haySoporteWebGL()) return LIGERO;
  return guardado() ?? (equipoJusto() ? LIGERO : PLENO);
}

/**
 * Cambiar de versión recarga la página.
 *
 * Es a propósito y no una rendición. Ir de la escena a la ligera obligaría a
 * desmontar el renderizador, el mundo, los colisionadores y el bucle; ir al
 * revés, a montarlo todo con la barra de carga que ya existe. Una recarga hace
 * las dos cosas bien por definición, tarda menos que el vuelo de entrada, y de
 * regalo deja en la barra de direcciones una URL que se puede compartir: el
 * enlace ligero es un enlace de verdad.
 */
export function cambiarModo(modo) {
  recordar(modo);
  if (modo !== LIGERO) pedirEntradaDirecta();
  const url = new URL(location.href);
  url.searchParams.set(PARAMETRO, modo === LIGERO ? LIGERO : '3d');
  location.href = url.toString();
}
