/**
 * Que ninguna dirección del contenido pueda ejecutar nada.
 *
 * Nació de un agujero real: `esc()` escapa `<`, `>` y comillas, que es lo que
 * impide romper un atributo, pero `javascript:alert(document.cookie)` no lleva
 * ninguno de esos caracteres. Atravesaba el escapado intacto y quedaba como
 * `href="javascript:..."` en seis sitios distintos.
 *
 * Y no era teórico desde que el panel se abre por internet: ahí la cookie es
 * `HttpOnly` y no se puede leer, pero el guion corre EN la página con la sesión
 * abierta, así que puede llamar a `/api/contenido` en nombre del dueño. No hace
 * falta robar la cookie cuando se puede usar.
 *
 * Se comprueban las dos barreras, porque protegen de cosas distintas: sanear al
 * pintar cubre los sitios que hoy existen, y rechazar al guardar cubre los que
 * se escriban mañana.
 *
 *   node tools/enlaces-check.mjs
 */

import { readFileSync } from 'node:fs';
import { hrefSeguro, imagenSegura, urlSegura } from '../src/utils/enlaces.js';
import { revisarContenido } from '../src/contenido-forma.js';

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

console.log('\n── Direcciones que no pueden ejecutar ─────────────────────────\n');

console.log('  el saneador');
const PELIGROSAS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  '\tjavascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  '//evil.com/x',
  'file:///etc/passwd',
];
for (const mala of PELIGROSAS) {
  comprobar(urlSegura(mala) === null, `rechaza ${JSON.stringify(mala)}`);
}
comprobar(hrefSeguro('javascript:alert(1)') === '#', 'y en un atributo cae a «#», nunca a vacío');

console.log('\n  y no rompe lo legítimo');
for (const buena of [
  'https://github.com/bluelotus17113',
  'http://ejemplo.org',
  'mailto:alguien@ejemplo.com',
  'retrato.jpg',
  '/assets/x.png',
]) {
  comprobar(urlSegura(buena) === buena, `deja pasar ${JSON.stringify(buena)}`);
}

console.log('\n  el retrato se mide con vara más estrecha');
comprobar(imagenSegura('retrato.jpg') === 'retrato.jpg', 'un fichero del propio sitio vale');
comprobar(
  imagenSegura('https://ejemplo.com/foto.jpg') === null,
  'y uno externo no: sería un chivato de quién abre el currículo'
);

console.log('\n  la segunda barrera: no se puede ni guardar');
const base = JSON.parse(readFileSync('src/contenido.json', 'utf8'));
const con = (f) => {
  const c = structuredClone(base);
  f(c);
  return revisarContenido(c);
};
comprobar(revisarContenido(base) === null, 'el contenido de verdad pasa', revisarContenido(base) ?? '');
comprobar(
  typeof con((c) => (c.proyectos[0].url = 'javascript:alert(1)')) === 'string',
  'un javascript: en un proyecto se rechaza al guardar'
);
comprobar(
  typeof con((c) => (c.contacto.links[0].href = 'JaVaScRiPt:alert(1)')) === 'string',
  'y en un canal de contacto también'
);
comprobar(
  typeof con((c) => (c.identidad.foto = 'https://evil.com/pixel.gif')) === 'string',
  'y un retrato externo también'
);
comprobar(
  con((c) => (c.proyectos[0].url = 'https://github.com/x/y')) === null,
  'mientras que una dirección normal se guarda sin quejas'
);

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
