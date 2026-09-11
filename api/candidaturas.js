/**
 * El registro de candidaturas desde el panel publicado.
 *
 * Mismo trato que el contenido —sesión, comprobación, commit— y la misma razón
 * de fondo: no hay disco donde escribir, y el repositorio ya es la verdad.
 *
 * Aquí se guarda la tabla en el formato de career-ops, no en uno propio. Es lo
 * que permite que las dos herramientas compartan un solo registro; dos
 * registros es la peor opción posible, porque el día que apuntes una entrevista
 * en uno y no en el otro, el que consultes te dará una respuesta y no sabrás
 * cuál es la buena.
 *
 * Se commitean los DOS ficheros —la tabla y el CSV— en la misma operación. Con
 * el CSV a mano, el día que lo abras estará viejo y no lo sabrás.
 */

import { cuerpoJSON, sinPaso } from './_auth.js';

const TABLA = 'carrera/candidaturas.md';
const HOJA = 'carrera/candidaturas.csv';

const COLUMNAS = ['#', 'Date', 'Company', 'Role', 'Score', 'Status', 'PDF', 'Report', 'Notes'];
const ESTADOS = new Set([
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
]);

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

const escapar = (v) => String(v ?? '').replace(/\|/g, '\\|');

function componer(preambulo, filas) {
  const linea = (vals) => `| ${vals.join(' | ')} |`;
  return [
    preambulo.replace(/\s*$/, ''),
    '',
    linea(COLUMNAS),
    `|${COLUMNAS.map(() => '---').join('|')}|`,
    ...filas.map((f) => linea(COLUMNAS.map((c) => escapar(f[c])))),
    '',
  ].join('\n');
}

function aCSV(filas) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Marca de bytes y separador declarado: sin las dos, un Excel español abre
  // los acentos rotos y mete la fila entera en la primera columna.
  return (
    '﻿' +
    ['sep=;', COLUMNAS.join(';'), ...filas.map((f) => COLUMNAS.map((c) => esc(f[c])).join(';'))].join(
      '\r\n'
    ) +
    '\r\n'
  );
}

export default async function handler(req, res) {
  if (sinPaso(req, res)) return;

  const repo = process.env.GITHUB_REPO;
  const rama = process.env.GITHUB_BRANCH || 'main';
  if (!process.env.GITHUB_TOKEN || !repo) {
    return res.status(503).json({ error: 'Falta configurar el acceso al repositorio.' });
  }

  const traer = (ruta) =>
    github(`/repos/${repo}/contents/${ruta}?ref=${encodeURIComponent(rama)}`);

  if (req.method === 'GET') {
    const actual = await traer(TABLA);
    if (!actual.ok) return res.status(502).json({ error: `No se pudo leer (${actual.estado}).` });
    const texto = Buffer.from(actual.cuerpo.content ?? '', 'base64').toString('utf8');
    const lineas = texto.split('\n');
    const iCab = lineas.findIndex((l) => l.trim().startsWith('| #'));
    const filas = [];
    for (let i = iCab + 1; iCab >= 0 && i < lineas.length; i++) {
      const l = lineas[i].trim();
      if (!l.startsWith('|') || /^\|[\s:|-]+\|$/.test(l)) continue;
      const c = l.replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((x) => x.trim());
      const fila = {};
      COLUMNAS.forEach((n, j) => (fila[n] = (c[j] ?? '').replace(/\\\|/g, '|')));
      filas.push(fila);
    }
    return res.status(200).json({
      ok: true,
      preambulo: iCab >= 0 ? lineas.slice(0, iCab).join('\n') : texto,
      filas,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Sólo GET o POST.' });
  }

  const { filas, preambulo } = await cuerpoJSON(req);
  if (!Array.isArray(filas)) {
    return res.status(400).json({ error: '«filas» tiene que ser una lista.' });
  }
  // El estado se valida porque career-ops lo consulta: uno inventado no rompe
  // la tabla, pero deja la fila fuera de su embudo sin decir nada.
  const malo = filas.find((f) => f.Status && !ESTADOS.has(f.Status));
  if (malo) {
    return res.status(400).json({
      error: `«${malo.Status}» no es un estado de career-ops. Son: ${[...ESTADOS].join(', ')}.`,
    });
  }

  const previoTabla = await traer(TABLA);
  const previoHoja = await traer(HOJA);
  const texto = componer(
    preambulo || Buffer.from(previoTabla.cuerpo?.content ?? '', 'base64').toString('utf8').split('| #')[0],
    filas
  );

  const guardar = (ruta, contenido, sha) =>
    github(`/repos/${repo}/contents/${ruta}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Candidaturas actualizadas desde el panel',
        content: Buffer.from(contenido, 'utf8').toString('base64'),
        branch: rama,
        ...(sha ? { sha } : {}),
      }),
    });

  const a = await guardar(TABLA, texto, previoTabla.ok ? previoTabla.cuerpo.sha : null);
  if (!a.ok) return res.status(502).json({ error: `No se pudo guardar la tabla (${a.estado}).` });
  const b = await guardar(HOJA, aCSV(filas), previoHoja.ok ? previoHoja.cuerpo.sha : null);

  return res.status(200).json({
    ok: true,
    filas: filas.length,
    csv: b.ok,
    aviso: 'Guardado. career-ops lo verá tras un `git pull`.',
  });
}
