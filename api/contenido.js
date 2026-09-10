/**
 * Guarda el contenido desde el panel publicado, commiteándolo al repositorio.
 *
 * ── Por qué a git y no a una base de datos ─────────────────────────────────
 *
 * Porque el repositorio ya es la verdad: la web se construye desde
 * `src/contenido.json`, y guardar en otro sitio crearía un segundo original.
 * Con dos, el día que edites desde el panel y luego toques el fichero en local
 * —o al revés— uno de los dos cambios desaparece sin avisar, y no se nota hasta
 * que alguien lee un currículo con un dato viejo.
 *
 * El precio es que el cambio tarda lo que tarde el redespliegue, medio minuto.
 * A cambio: cada edición queda en el historial con su fecha, se puede ver qué
 * cambió y se puede deshacer. Un panel que escribe en una base de datos no te
 * deja volver atrás.
 *
 * ── Lo que este endpoint NO se cree ────────────────────────────────────────
 *
 * Nada de lo que llega. Comprueba la sesión, comprueba la forma y sólo entonces
 * escribe, y siempre en el mismo fichero: la ruta no viene en la petición, está
 * escrita aquí. Un endpoint que acepta a qué ruta escribir es un endpoint que
 * escribe donde le digan.
 */

import { cuerpoJSON, sinPaso } from './_auth.js';
import { revisarContenido } from '../src/contenido-forma.js';

/** El único fichero que este endpoint puede tocar. */
const FICHERO = 'src/contenido.json';

async function github(ruta, opciones = {}) {
  const res = await fetch(`https://api.github.com${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });
  const cuerpo = await res.json().catch(() => ({}));
  return { ok: res.ok, estado: res.status, cuerpo };
}

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Sólo PUT.' });
  }
  if (sinPaso(req, res)) return;

  const repo = process.env.GITHUB_REPO;
  const rama = process.env.GITHUB_BRANCH || 'main';
  if (!process.env.GITHUB_TOKEN || !repo) {
    return res.status(503).json({ error: 'Falta configurar el acceso al repositorio.' });
  }

  const datos = await cuerpoJSON(req);
  const problema = revisarContenido(datos);
  if (problema) return res.status(400).json({ error: `Contenido rechazado: ${problema}.` });

  // El `sha` del fichero actual: sin él GitHub no deja sobrescribir, y con él
  // se evita pisar un cambio que haya entrado entre medias — si alguien tocó el
  // fichero después de que el panel lo cargara, el commit se rechaza en vez de
  // borrarlo por encima.
  const actual = await github(`/repos/${repo}/contents/${FICHERO}?ref=${encodeURIComponent(rama)}`);
  if (!actual.ok) {
    return res.status(502).json({ error: `No se pudo leer el fichero (${actual.estado}).` });
  }

  const texto = `${JSON.stringify(datos, null, 2)}\n`;
  const guardado = await github(`/repos/${repo}/contents/${FICHERO}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Contenido actualizado desde el panel',
      content: Buffer.from(texto, 'utf8').toString('base64'),
      sha: actual.cuerpo.sha,
      branch: rama,
    }),
  });
  if (!guardado.ok) {
    const porQue = guardado.estado === 409 ? 'alguien lo cambió mientras editabas' : `error ${guardado.estado}`;
    return res.status(502).json({ error: `No se pudo guardar: ${porQue}.` });
  }

  return res.status(200).json({
    ok: true,
    commit: guardado.cuerpo.commit?.sha?.slice(0, 7) ?? null,
    aviso: 'Guardado. El cambio se verá cuando termine el redespliegue, en medio minuto.',
  });
}
