/** Cierra la sesión borrando la cookie. No necesita sesión válida para hacerlo. */
import { galletaVacia } from './_auth.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', galletaVacia());
  return res.status(200).json({ ok: true });
}
