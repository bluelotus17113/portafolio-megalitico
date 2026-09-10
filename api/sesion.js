/**
 * ¿Sigue abierta la sesión?
 *
 * Lo pregunta el panel al cargar, para no enseñar el formulario de entrada a
 * quien ya entró hace diez minutos. No devuelve nada más que sí o no: una
 * respuesta con la fecha de caducidad o el nombre del dueño sería regalar
 * información a quien sólo está tanteando.
 */
import { sesionValida, testigoDe } from './_auth.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ dentro: sesionValida(testigoDe(req)) });
}
