/**
 * El registro de candidaturas: leer, escribir y sacarlo a Excel.
 *
 * ── Por qué una tabla markdown y no una base de datos ──────────────────────
 *
 * Porque no es nuestra. career-ops guarda aquí su seguimiento y la tabla es SU
 * fuente de verdad —su SQLite es un índice derivado que se reconstruye y se
 * puede borrar— así que escribir en este formato es lo que permite que las dos
 * herramientas compartan un solo registro en vez de llevar cada una el suyo.
 *
 * Dos registros es la peor opción posible: el día que anotes una entrevista en
 * uno y no en el otro, el que consultes te dará una respuesta y no sabrás cuál.
 *
 * Las columnas y los estados son los suyos, no unos propios que se parezcan.
 *
 * ── Y el Excel ────────────────────────────────────────────────────────────
 *
 * Sale CSV, no `.xlsx`. Excel lo abre igual haciendo doble clic, y a cambio no
 * entra ni una dependencia en el proyecto para escribir un formato que por
 * dentro es un zip de XML. Lleva las dos cosas que hacen que un CSV se abra
 * bien en un Excel español y sin las cuales no se abre: la marca de orden de
 * bytes, para que los acentos no salgan rotos, y la línea `sep=;`, porque en
 * esta configuración regional la coma es el separador decimal y Excel mete
 * toda la fila en la primera columna.
 *
 *   node tools/candidaturas.mjs listar
 *   node tools/candidaturas.mjs excel [salida.csv]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const RUTA = 'carrera/candidaturas.md';

/** Las columnas de career-ops, en su orden. No se reordenan ni se renombran. */
export const COLUMNAS = ['#', 'Date', 'Company', 'Role', 'Score', 'Status', 'PDF', 'Report', 'Notes'];

/** Los estados que su `set-status` admite. */
export const ESTADOS = [
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
];

const esSeparador = (linea) => /^\|[\s:|-]+\|$/.test(linea.trim());

/** Parte una fila de tabla en celdas, respetando las barras escapadas. */
function celdas(linea) {
  const dentro = linea.trim().replace(/^\|/, '').replace(/\|$/, '');
  return dentro.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Lee el fichero y devuelve `{ cabecera, filas }`. */
export function leer(ruta = RUTA) {
  if (!existsSync(ruta)) return { preambulo: '', filas: [] };
  const texto = readFileSync(ruta, 'utf8');
  const lineas = texto.split('\n');
  const iCab = lineas.findIndex((l) => l.trim().startsWith('| #'));
  if (iCab < 0) return { preambulo: texto.replace(/\s*$/, ''), filas: [] };

  const nombres = celdas(lineas[iCab]);
  const filas = [];
  for (let i = iCab + 1; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l.trim().startsWith('|')) continue;
    if (esSeparador(l)) continue;
    const c = celdas(l);
    const fila = {};
    nombres.forEach((n, j) => (fila[n] = c[j] ?? ''));
    filas.push(fila);
  }
  return { preambulo: lineas.slice(0, iCab).join('\n').replace(/\s*$/, ''), filas };
}

/** Devuelve el fichero entero como texto, listo para escribir. */
export function componer({ preambulo, filas }) {
  const linea = (vals) => `| ${vals.map((v) => String(v ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
  const cuerpo = filas.map((f) => linea(COLUMNAS.map((c) => f[c] ?? '')));
  return [
    preambulo,
    '',
    linea(COLUMNAS),
    `|${COLUMNAS.map(() => '---').join('|')}|`,
    ...cuerpo,
    '',
  ].join('\n');
}

export function escribir(datos, ruta = RUTA) {
  writeFileSync(ruta, componer(datos));
}

/**
 * El siguiente número de informe.
 *
 * career-ops identifica cada fila por su `#`, no por la empresa —la empresa es
 * dato de pantalla y puede cambiar cuando una agencia revela al cliente— así
 * que el número no se reutiliza aunque se borre una fila.
 */
export function siguienteNumero(filas) {
  const nums = filas.map((f) => Number(f['#'])).filter((n) => Number.isFinite(n));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

/** CSV que Excel abre bien: marca de bytes y separador declarado. */
export function aCSV({ filas }) {
  const escapa = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    'sep=;',
    COLUMNAS.join(';'),
    ...filas.map((f) => COLUMNAS.map((c) => escapa(f[c])).join(';')),
  ];
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

// ── Línea de órdenes ───────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const [orden, arg] = process.argv.slice(2);
  const datos = leer();
  if (orden === 'listar') {
    if (!datos.filas.length) {
      console.log('\n  Todavía no hay ninguna candidatura apuntada.\n');
    } else {
      console.log('');
      for (const f of datos.filas) {
        console.log(`  #${f['#']}  ${f.Date}  ${f.Company} — ${f.Role}  [${f.Status}]`);
      }
      console.log(`\n  ${datos.filas.length} en total.\n`);
    }
  } else if (orden === 'excel') {
    const salida = arg || 'carrera/candidaturas.csv';
    writeFileSync(salida, aCSV(datos));
    console.log(`\n  ${datos.filas.length} fila(s) en ${salida}`);
    console.log('  Ábrelo con doble clic: Excel lo reconoce como hoja de cálculo.\n');
  } else {
    console.log('\n  node tools/candidaturas.mjs listar');
    console.log('  node tools/candidaturas.mjs excel [salida.csv]\n');
  }
}
