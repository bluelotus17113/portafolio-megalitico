/**
 * Cerradura del panel: contraseña, sesión y el peaje de cada escritura.
 *
 * ── Por qué esto vive en el servidor ───────────────────────────────────────
 *
 * Podría parecer más simple comprobar la contraseña en el navegador y enseñar
 * el panel si acierta. No lo es: sería teatro. El código del cliente lo lee
 * cualquiera con F12, y una comprobación que se ejecuta en la máquina del que
 * quiere saltársela no es una comprobación. Lo único que protege de verdad es
 * que el ENDPOINT QUE ESCRIBE exija la sesión, y por eso la cerradura está aquí
 * y no en el panel.
 *
 * ── Ni la contraseña ni su hash están en el repositorio ────────────────────
 *
 * El repositorio es público. Un hash de scrypt no revela la contraseña, pero
 * publicarlo regala la posibilidad de atacarlo sin límite y sin que nadie se
 * entere: en local no hay ni cortafuegos ni registro. Por eso `ADMIN_HASH` es
 * variable de entorno de Vercel y aquí sólo está el mecanismo.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE = 'sesion';
const DURACION = 8 * 60 * 60; // segundos

/** Igualdad en tiempo constante, tolerando longitudes distintas. */
function igual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) {
    // `timingSafeEqual` exige el mismo largo, así que se compara contra sí
    // mismo para gastar el mismo tiempo y no delatar la diferencia por el reloj.
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/**
 * Comprueba la contraseña contra `ADMIN_HASH`.
 *
 * El formato lleva sus propios parámetros dentro —`scrypt$N$r$p$sal$hash`— para
 * que subir el coste dentro de un año no invalide el hash de hoy: cada uno se
 * verifica con los parámetros con los que se creó.
 */
export function claveCorrecta(clave) {
  const guardado = process.env.ADMIN_HASH;
  if (!guardado) return false;
  const [algo, n, r, p, salB64, hashB64] = guardado.split('$');
  if (algo !== 'scrypt') return false;
  const sal = Buffer.from(salB64, 'base64');
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = scryptSync(String(clave ?? ''), sal, esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  });
  return igual(calculado, esperado);
}

function firmar(carga) {
  return createHmac('sha256', process.env.SESSION_SECRET ?? '')
    .update(carga)
    .digest('base64url');
}

/** Crea el testigo de sesión: cuándo caduca, y una firma que lo sella. */
export function nuevaSesion() {
  const carga = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + DURACION, n: randomBytes(8).toString('base64url') })
  ).toString('base64url');
  return `${carga}.${firmar(carga)}`;
}

export function sesionValida(testigo) {
  if (!testigo || !process.env.SESSION_SECRET) return false;
  const [carga, firma] = String(testigo).split('.');
  if (!carga || !firma) return false;
  // Primero la firma y sólo después el contenido: leer un JSON que aún no se
  // ha probado auténtico es hacerle caso a un desconocido.
  if (!igual(firma, firmar(carga))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(carga, 'base64url').toString());
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function galletaDeSesion(testigo) {
  // `HttpOnly` para que ningún script pueda leerla —ni el mío ni uno inyectado—,
  // `Secure` para que no viaje en claro y `Strict` para que no se envíe desde
  // otra web, que es lo que impide que alguien te haga guardar cambios desde
  // una página suya mientras tienes la sesión abierta.
  return `${COOKIE}=${testigo}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACION}`;
}

export const galletaVacia = () =>
  `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

export function testigoDe(req) {
  const crudo = req.headers?.cookie ?? '';
  for (const trozo of crudo.split(';')) {
    const [k, ...v] = trozo.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/** Cierra la puerta a quien no tenga sesión. Devuelve `true` si ya respondió. */
export function sinPaso(req, res) {
  if (sesionValida(testigoDe(req))) return false;
  res.status(401).json({ error: 'Sesión no válida o caducada.' });
  return true;
}

export async function cuerpoJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let crudo = '';
  for await (const trozo of req) crudo += trozo;
  try {
    return JSON.parse(crudo || '{}');
  } catch {
    return {};
  }
}
