/**
 * Alimenta career-ops desde el contenido del portafolio.
 *
 * career-ops necesita dos ficheros para trabajar: `cv.md`, tu currículo en
 * markdown, y `config/profile.yml`, quién eres y a qué apuntas. Escribirlos a
 * mano significaría tener tus datos en dos sitios — y el día que corrijas un
 * empleo en uno y no en el otro, el currículo que salga adaptado a una oferta
 * llevará el dato viejo sin que nada avise.
 *
 * Así que salen de `contenido.json`, que ya es la única verdad del portafolio.
 *
 * ── Los dos no se tratan igual, y es a propósito ───────────────────────────
 *
 * `cv.md` se REGENERA siempre: todo lo que lleva se deriva del contenido, así
 * que reescribirlo no pierde nada.
 *
 * `profile.yml` NO. Lleva cosas que el portafolio no sabe y que sólo escribes
 * tú —el rango salarial que pides, el mínimo por debajo del cual dices que no,
 * el preaviso— y regenerarlo cada vez las borraría. Se escribe una vez, y a
 * partir de ahí hay que pedirlo con `--forzar` sabiendo lo que se pierde.
 *
 * ── Las cabeceras van en inglés y el contenido en español ──────────────────
 *
 * No es un descuido. Los scripts de career-ops buscan `## Work Experience`,
 * `## Education`, `## Skills` para trocear el fichero; traducirlas deja su
 * parser sin nada que reconocer. Lo que sale del molde lo traduce él con
 * `language.output`.
 *
 *   node tools/career-ops.mjs            # ver qué haría
 *   node tools/career-ops.mjs escribir   # escribirlo
 *   node tools/career-ops.mjs escribir --forzar
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const DESTINO =
  process.env.CAREER_OPS_DIR ?? join(homedir(), 'Documents', 'career-ops', 'career-ops');

const c = JSON.parse(readFileSync('src/contenido.json', 'utf8'));

/** Lo que el portafolio no puede saber. Se marca, no se inventa. */
const FALTA = '# TODO: sólo lo sabes tú';

const enlace = (etiqueta) =>
  (c.contacto.links ?? []).find((l) => l.label === etiqueta && l.href)?.value ?? '';

const cita = (v) => `"${String(v ?? '').replace(/"/g, '\\"')}"`;

// ── cv.md ──────────────────────────────────────────────────────────────────

function cvMarkdown() {
  const L = [];
  L.push(`# CV -- ${c.identidad.name}`, '');
  L.push(`**${c.identidad.role}**`, '');

  const canales = [
    enlace('Correo'),
    enlace('GitHub') && `github.com/${enlace('GitHub')}`,
    enlace('LinkedIn') && `linkedin.com/in/${enlace('LinkedIn')}`,
    enlace('Web'),
    (c.perfil.facts ?? []).find((f) => /ubicaci/i.test(f.label))?.value,
  ].filter(Boolean);
  L.push(canales.join(' · '), '');

  L.push('## Professional Summary', '');
  const resumen = c.perfil.resumenHoja?.length ? c.perfil.resumenHoja : c.perfil.body;
  L.push(...(resumen ?? []).flatMap((p) => [p, '']));

  L.push('## Work Experience', '');
  // De la más reciente a la más antigua, como se lee un currículo: el array
  // del portafolio va al revés porque en la isla el sendero asciende.
  for (const e of [...(c.trayectoria ?? [])].reverse()) {
    L.push(`### ${e.role} -- ${e.org}`);
    L.push(`*${e.period}*`, '');
    if (e.detail) L.push(`- ${e.detail}`, '');
  }

  L.push('## Projects', '');
  for (const p of c.proyectos ?? []) {
    const linea = p.cv?.trim() || (p.summary ?? '').match(/^.*?[.:](?=\s|$)/)?.[0] || p.summary || '';
    const meta = [p.year, (p.stack ?? []).join(', ')].filter(Boolean).join(' · ');
    L.push(`- **${p.title}**${meta ? ` (${meta})` : ''} -- ${linea.trim()}${p.url ? ` ${p.url}` : ''}`);
  }
  L.push('');

  L.push('## Education', '');
  for (const e of [...(c.formacion ?? [])].reverse()) {
    L.push(`- **${e.role}** -- ${e.org || '—'} (${e.period})`);
  }
  L.push('');

  L.push('## Skills', '');
  const familias = new Map();
  for (const h of c.habilidades ?? []) {
    if (!familias.has(h.family)) familias.set(h.family, []);
    familias.get(h.family).push(h.name);
  }
  for (const [f, lista] of familias) L.push(`- **${f}:** ${lista.join(', ')}`);
  L.push('');

  const idiomas = (c.perfil.facts ?? []).find((f) => /idioma/i.test(f.label))?.value;
  if (idiomas) L.push('## Languages', '', `- ${idiomas}`, '');

  return L.join('\n');
}

// ── profile.yml ────────────────────────────────────────────────────────────

function profileYaml() {
  const ubicacion = (c.perfil.facts ?? []).find((f) => /ubicaci/i.test(f.label))?.value ?? '';
  const [ciudad, pais] = ubicacion.split(',').map((s) => s.trim());

  const arquetipos = (c.perfiles ?? []).map(
    (p, i) => `    - name: ${cita(p.role || p.nombre)}
      level: "Junior/Mid"
      fit: "${i === 0 ? 'primary' : 'secondary'}"`
  );

  const pruebas = (c.proyectos ?? [])
    .filter((p) => p.url)
    .slice(0, 4)
    .map(
      (p) => `    - name: ${cita(p.title)}
      url: ${cita(p.url)}
      hero_metric: ${cita((p.stack ?? []).slice(0, 3).join(', '))}`
    );

  return `# Generado por tools/career-ops.mjs desde src/contenido.json.
# Lo que lleva TODO no se edita aquí: se edita en el portafolio y se vuelve a
# generar, o los dos se separan. Lo marcado con TODO sí es sólo tuyo.

candidate:
  full_name: ${cita(c.identidad.name)}
  email: ${cita(enlace('Correo'))}
  phone: ""                      ${FALTA}
  location: ${cita(ubicacion)}
  linkedin: ${cita(enlace('LinkedIn') ? `linkedin.com/in/${enlace('LinkedIn')}` : '')}
  portfolio_url: ${cita(enlace('Web') ? `https://${enlace('Web')}` : '')}
  github: ${cita(enlace('GitHub') ? `github.com/${enlace('GitHub')}` : '')}

target_roles:
  primary:
    - ${cita(c.identidad.role)}
  archetypes:
${arquetipos.join('\n') || '    []'}

narrative:
  headline: ${cita(c.identidad.role)}
  exit_story: ""                 ${FALTA}
  superpowers:
${(c.habilidades ?? [])
  .slice()
  .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
  .slice(0, 3)
  .map((h) => `    - ${cita(h.name)}`)
  .join('\n')}
  proof_points:
${pruebas.join('\n') || '    []'}

compensation:
  target_range: ""               ${FALTA}
  currency: "COP"
  minimum: ""                    ${FALTA}
  location_flexibility: ""       ${FALTA}

location:
  country: ${cita(pais || '')}
  city: ${cita(ciudad || '')}
  timezone: "America/Bogota"
  # Esto se deduce de la ubicación, no hace falta preguntarlo: quien vive y
  # trabaja en su propio país no necesita que nadie le patrocine nada.
  visa_status: ${cita(`Ciudadano de ${pais || 'su país'}; autorizado para trabajar allí sin patrocinio`)}
  authorized_in: [${cita(pais || '')}]
  # FALSO, no verdadero. Lo tenía al revés y no es un detalle: en verdadero,
  # career-ops marca cada oferta local como «necesita patrocinio» y las puntúa
  # peor o las descarta. Una casilla mal puesta que descarta ofertas buenas sin
  # decir por qué es peor que un hueco vacío, porque el hueco se ve.
  needs_sponsorship: false

language:
  output: es

spend_tier: standard

cv:
  output_format: "html"

cover_letter:
  notice_period_days: 15         ${FALTA}
  primary_domain: ${cita(c.identidad.role)}
`;
}

// ── Órdenes ────────────────────────────────────────────────────────────────

const [orden, ...resto] = process.argv.slice(2);
const forzar = resto.includes('--forzar');
const rutaCv = join(DESTINO, 'cv.md');
const rutaPerfil = join(DESTINO, 'config', 'profile.yml');

const huecos = (t) => (t.match(/TODO: sólo lo sabes tú/g) ?? []).length;

if (!existsSync(DESTINO)) {
  console.error(`\n  No encuentro career-ops en ${DESTINO}.`);
  console.error('  Define CAREER_OPS_DIR si lo tienes en otro sitio.\n');
  process.exit(1);
}

const cv = cvMarkdown();
const perfil = profileYaml();

if (orden !== 'escribir') {
  console.log(`\n  Destino: ${DESTINO}\n`);
  console.log(`  cv.md           ${cv.length} caracteres · ${cv.split('\n').length} líneas`);
  console.log(`                  ${existsSync(rutaCv) ? 'se REESCRIBE (todo se deriva del contenido)' : 'nuevo'}`);
  console.log(`  profile.yml     ${huecos(perfil)} hueco(s) que sólo sabes tú`);
  console.log(
    `                  ${existsSync(rutaPerfil) ? (forzar ? 'se REESCRIBE y pierdes lo que hayas puesto a mano' : 'ya existe: NO se toca sin --forzar') : 'nuevo'}`
  );
  console.log('\n  Para escribirlo:  node tools/career-ops.mjs escribir\n');
  process.exit(0);
}

mkdirSync(dirname(rutaPerfil), { recursive: true });
writeFileSync(rutaCv, cv);
console.log(`\n  cv.md escrito · ${cv.split('\n').length} líneas`);

if (existsSync(rutaPerfil) && !forzar) {
  console.log('  profile.yml ya existe y NO se toca: lleva cosas que sólo sabes tú');
  console.log('  (rango salarial, mínimo, preaviso). Con --forzar se reescribe.');
} else {
  writeFileSync(rutaPerfil, perfil);
  console.log(`  profile.yml escrito · ${huecos(perfil)} hueco(s) marcados con TODO`);
}
console.log('\n  Y apunta career-ops al registro compartido:');
console.log(`  export CAREER_OPS_TRACKER=${join(process.cwd(), 'carrera', 'candidaturas.md')}\n`);
