/**
 * Entrada al panel.
 *
 * Un solo dato de vuelta —entraste o no— y el mismo mensaje para «no hay
 * contraseña puesta», «la contraseña es otra» y «te has equivocado»: distinguir
 * los casos le cuenta a quien prueba en qué punto está.
 */

import { claveCorrecta, cuerpoJSON, galletaDeSesion, nuevaSesion } from './_auth.js';

/**
 * Freno a la fuerza bruta.
 *
 * Vive en memoria del proceso, y hay que decir lo que eso significa: Vercel
 * levanta y tira instancias, así que este contador se pierde y se puede eludir
 * repartiendo los intentos. NO es la defensa — la defensa es que cada intento
 * cuesta 145 ms de scrypt y que la contraseña sea larga. Esto sólo encarece el
 * caso fácil: mil intentos seguidos desde la misma IP contra la misma
 * instancia.
 */
const intentos = new Map();
const VENTANA = 15 * 60 * 1000;
const TOPE = 8;

function deQuien(req) {
  const cabecera = req.headers['x-forwarded-for'];
  return (Array.isArray(cabecera) ? cabecera[0] : cabecera || '').split(',')[0].trim() || 'desconocido';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Sólo POST.' });
  }
  if (!process.env.ADMIN_HASH || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'El panel no está configurado en este despliegue.' });
  }

  const quien = deQuien(req);
  const ahora = Date.now();
  const registro = intentos.get(quien);
  if (registro && ahora - registro.desde < VENTANA && registro.veces >= TOPE) {
    const faltan = Math.ceil((VENTANA - (ahora - registro.desde)) / 60000);
    return res.status(429).json({ error: `Demasiados intentos. Prueba en ${faltan} min.` });
  }

  const { clave } = await cuerpoJSON(req);
  const vale = claveCorrecta(clave);

  if (!vale) {
    const base = registro && ahora - registro.desde < VENTANA ? registro : { desde: ahora, veces: 0 };
    base.veces += 1;
    intentos.set(quien, base);
    // Suelo de tiempo para que fallar no salga más barato que acertar.
    await new Promise((r) => setTimeout(r, 500));
    return res.status(401).json({ error: 'No es la contraseña.' });
  }

  intentos.delete(quien);
  res.setHeader('Set-Cookie', galletaDeSesion(nuevaSesion()));
  return res.status(200).json({ ok: true });
}
