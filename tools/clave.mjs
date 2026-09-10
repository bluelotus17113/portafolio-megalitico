/**
 * Genera el hash de la contraseña del panel.
 *
 * La contraseña se teclea aquí, en tu máquina, y NO SALE DE ELLA: no se
 * imprime, no se guarda en fichero, no se queda en el historial del shell —por
 * eso se pide por teclado y no como argumento— y no viaja a ningún sitio. Lo
 * único que sale es el hash, que es lo que se pega en Vercel.
 *
 * De un hash de scrypt no se saca la contraseña: para probar una hay que
 * gastarse el mismo cómputo que costó crearlo, y con estos parámetros eso son
 * ~100 ms POR INTENTO. Un diccionario de un millón de palabras tarda un día de
 * máquina. Eso es lo que compra el coste: no que sea imposible, sino que salga
 * caro. Por eso la contraseña tiene que ser larga; contra "Perro123" cien
 * milisegundos no protegen de nada.
 *
 *   node tools/clave.mjs
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

/** Coste de scrypt. N a 2^15 son ~100 ms por intento en un portátil. */
const N = 32768;
const R = 8;
const P = 1;
const LARGO = 64;
/**
 * Node limita scrypt a 32 MB por defecto y estos parámetros piden justo eso
 * —128·N·r = 32 MiB— así que sin declararlo revienta con «memory limit
 * exceeded». Se pide el doble para tener holgura.
 */
const MAXMEM = 64 * 1024 * 1024;

function preguntar(texto) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // Sin eco: la contraseña no se dibuja en la terminal ni queda en el scroll.
    const escribir = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = function (s) {
      if (s.includes(texto)) escribir?.(s);
    };
    rl.question(texto, (v) => {
      rl.close();
      stdout.write('\n');
      resolve(v);
    });
  });
}

const clave = await preguntar('Contraseña nueva (no se verá al teclear): ');
if (clave.length < 12) {
  console.error('\n  Demasiado corta. Doce caracteres es el mínimo aquí, y no por');
  console.error('  formalismo: el coste de scrypt sólo compra tiempo, y contra una');
  console.error('  contraseña corta ese tiempo no alcanza. Usa una frase.\n');
  process.exit(1);
}
const otra = await preguntar('Otra vez: ');
if (clave !== otra) {
  console.error('\n  No coinciden.\n');
  process.exit(1);
}

const sal = randomBytes(16);
const hash = scryptSync(clave, sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM });
const ADMIN_HASH = `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
const SESSION_SECRET = randomBytes(48).toString('base64');

console.log('\n  Pega estas dos en Vercel → Settings → Environment Variables.');
console.log('  No las guardes en el repositorio ni me las mandes: no me hacen falta.\n');
console.log('  ADMIN_HASH');
console.log('  ' + ADMIN_HASH + '\n');
console.log('  SESSION_SECRET');
console.log('  ' + SESSION_SECRET + '\n');
console.log('  (SESSION_SECRET firma la cookie de sesión. Si la cambias, se cierran');
console.log('   todas las sesiones abiertas, que es justo lo que quieres si alguna vez');
console.log('   sospechas que alguien entró.)\n');
