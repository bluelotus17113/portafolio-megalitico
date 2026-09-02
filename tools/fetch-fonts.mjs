/**
 * Trae las tipografías al proyecto.
 *
 * Se ejecuta a mano, no en cada build: las fuentes no cambian, y depender de
 * una descarga para poder compilar es cambiar un problema de red en el
 * navegador del visitante por el mismo problema en el de quien publica.
 *
 * Qué se trae y qué se deja fuera:
 *
 *  - Sólo los subconjuntos **latin y latin-ext**. Google parte cada familia
 *    por rangos Unicode y sirve además cirílico, griego y vietnamita; un
 *    portafolio en español no toca ni un carácter de esos. El navegador
 *    tampoco los descargaba —sólo pide el subconjunto cuyo `unicode-range`
 *    encaja con lo que hay escrito—, pero alojándolos aquí quien decide qué se
 *    publica somos nosotros.
 *
 *  - Las **variables**, un fichero por familia en vez de uno por peso. La
 *    página usa Inter en 300, 400, 500 y 600 y Cinzel en 400, 500 y 600: siete
 *    ficheros estáticos contra dos variables que además cubren cualquier peso
 *    que se quiera usar mañana. El 700 de Cinzel que pedía el enlace de Google
 *    no lo usaba nadie.
 *
 *   node tools/fetch-fonts.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const DESTINO_FUENTES = 'public/fuentes';
const DESTINO_CSS = 'src/ui/fuentes.css';

/** Los rangos que se quedan. El resto se descarta al vuelo. */
const SUBCONJUNTOS = ['latin', 'latin-ext'];

/**
 * Google devuelve woff2 sólo si el agente de usuario lo admite; con el que
 * pone Node por defecto contesta con ttf, que pesa el triple.
 */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const PETICION =
  'https://fonts.googleapis.com/css2' +
  '?family=Cinzel:wght@400..600' +
  '&family=Inter:wght@300..600' +
  '&display=swap';

const css = await (await fetch(PETICION, { headers: { 'User-Agent': UA } })).text();

// El formato es siempre `/* subconjunto */` seguido de su `@font-face`.
const bloques = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g)];
if (!bloques.length) throw new Error('no he sabido leer la respuesta de Google Fonts');

await mkdir(DESTINO_FUENTES, { recursive: true });

const reglas = [];
let bytes = 0;

for (const [, subconjunto, bloque] of bloques) {
  if (!SUBCONJUNTOS.includes(subconjunto)) continue;

  const familia = /font-family: '([^']+)'/.exec(bloque)?.[1];
  const pesos = /font-weight: ([^;]+);/.exec(bloque)?.[1];
  const rango = /unicode-range: ([^;]+);/.exec(bloque)?.[1];
  const origen = /src: url\(([^)]+)\)/.exec(bloque)?.[1];
  if (!familia || !origen) continue;

  const archivo = `${familia.toLowerCase()}-${subconjunto}.woff2`;
  const datos = Buffer.from(await (await fetch(origen, { headers: { 'User-Agent': UA } })).arrayBuffer());
  await writeFile(`${DESTINO_FUENTES}/${archivo}`, datos);
  bytes += datos.length;
  console.log(`  ${archivo.padEnd(26)} ${(datos.length / 1024).toFixed(1)} kB   ← ${basename(origen)}`);

  reglas.push(`/* ${familia} · ${subconjunto} */
@font-face {
  font-family: '${familia}';
  font-style: normal;
  font-weight: ${pesos};
  font-display: swap;
  src: url('/fuentes/${archivo}') format('woff2');
  unicode-range: ${rango};
}`);
}

const cabecera = `/* ═══════════════════════════════════════════════════════════════════════════
   Tipografías, alojadas aquí.
                        GENERADO POR tools/fetch-fonts.mjs — NO EDITAR A MANO.

   Antes venían de Google Fonts, y eso costaba tres cosas a la vez: dos
   servidores más que resolver y saludar, una cadena de tres viajes —el HTML
   pide un CSS a googleapis, que nombra unos ficheros en gstatic— antes de que
   una sola letra se dibuje con su letra, y la dirección IP de cada visitante
   entregada a un tercero sin que nadie se lo pregunte.

   Sirviéndolas desde el mismo origen se cae un eslabón entero de la cadena:
   el navegador ya tiene la conexión abierta y los ficheros están nombrados en
   una hoja de estilos que ya se estaba descargando. Los dos que hacen falta
   para la primera pantalla van precargados desde \`index.html\`.

   Se quedan latin y latin-ext, en variable. Los detalles, en el generador.
   ═══════════════════════════════════════════════════════════════════════════ */

`;

await writeFile(DESTINO_CSS, cabecera + reglas.join('\n\n') + '\n');

console.log(`\n  ${reglas.length} caras · ${(bytes / 1024).toFixed(1)} kB en total`);
console.log(`  → ${DESTINO_FUENTES}/  y  ${DESTINO_CSS}\n`);
