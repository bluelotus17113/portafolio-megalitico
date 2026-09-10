/**
 * El retrato del currículo, desde el panel publicado.
 *
 * Mismo trato que el contenido: sesión, comprobación y commit. Y el mismo
 * cuidado con la ruta — el nombre del fichero se compone AQUÍ a partir del tipo
 * de imagen, nunca de lo que mande el cliente. Aceptar un nombre de fichero de
 * fuera es aceptar `../../algo`.
 *
 * Nombre fijo: un retrato se sustituye, no se colecciona. Con nombres distintos
 * quedaría en `public/` un rastro de fotos viejas que se publican con el sitio
 * sin que nadie se acuerde de ellas.
 */

import { cuerpoJSON, sinPaso } from './_auth.js';

const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const CARPETA = 'public';
const BASE = 'retrato';
/** Cuatro megas. Una foto de carné son doscientos kilos. */
const TOPE = 4 * 1024 * 1024;

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
  return { ok: res.ok, estado: res.status, cuerpo: await res.json().catch(() => ({})) };
}

/** Borra `public/retrato.<ext>` si existe. Devuelve si borró algo. */
async function borrar(repo, rama, ext) {
  const ruta = `${CARPETA}/${BASE}.${ext}`;
  const hay = await github(`/repos/${repo}/contents/${ruta}?ref=${encodeURIComponent(rama)}`);
  if (!hay.ok) return false;
  const fuera = await github(`/repos/${repo}/contents/${ruta}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: 'Retrato retirado', sha: hay.cuerpo.sha, branch: rama }),
  });
  return fuera.ok;
}

export default async function handler(req, res) {
  if (sinPaso(req, res)) return;

  const repo = process.env.GITHUB_REPO;
  const rama = process.env.GITHUB_BRANCH || 'main';
  if (!process.env.GITHUB_TOKEN || !repo) {
    return res.status(503).json({ error: 'Falta configurar el acceso al repositorio.' });
  }

  if (req.method === 'DELETE') {
    let alguno = false;
    for (const ext of Object.values(TIPOS)) alguno = (await borrar(repo, rama, ext)) || alguno;
    return res.status(200).json({ ok: true, borrado: alguno });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Sólo POST o DELETE.' });
  }

  const { datos } = await cuerpoJSON(req);
  const trozos = /^data:([^;]+);base64,(.+)$/.exec(String(datos ?? ''));
  if (!trozos) return res.status(400).json({ error: 'Se esperaba una imagen en base64.' });

  const ext = TIPOS[trozos[1]];
  if (!ext) return res.status(415).json({ error: 'Sólo JPG, PNG o WEBP.' });

  const binario = Buffer.from(trozos[2], 'base64');
  if (binario.length > TOPE) {
    return res.status(413).json({
      error: `Pesa ${(binario.length / 1024 / 1024).toFixed(1)} MB. Recórtala: una foto de carné basta con 300 kB.`,
    });
  }

  // Primero fuera los otros formatos: si había un .png y ahora entra un .jpg,
  // dejar los dos hace que la hoja cargue el que le dé la gana.
  for (const otra of Object.values(TIPOS)) if (otra !== ext) await borrar(repo, rama, otra);

  const ruta = `${CARPETA}/${BASE}.${ext}`;
  const previo = await github(`/repos/${repo}/contents/${ruta}?ref=${encodeURIComponent(rama)}`);
  const puesto = await github(`/repos/${repo}/contents/${ruta}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Retrato actualizado desde el panel',
      content: trozos[2],
      branch: rama,
      ...(previo.ok ? { sha: previo.cuerpo.sha } : {}),
    }),
  });
  if (!puesto.ok) return res.status(502).json({ error: `No se pudo guardar (${puesto.estado}).` });

  return res.status(200).json({ ok: true, ruta: `${BASE}.${ext}` });
}
