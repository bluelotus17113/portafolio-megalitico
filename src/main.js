/**
 * Punto de entrada y reparto entre las dos versiones.
 *
 * Este fichero no importa `three` ni nada que lo importe, y esa es su única
 * regla dura. Los `import()` de abajo son dinámicos a propósito: así el motor
 * viaja en un trozo aparte que sólo se descarga si de verdad se va a dibujar el
 * promontorio. Con un `import` estático de `Experience`, la versión ligera se
 * tragaría los 635 kB del motor antes de pintar la primera línea — que es
 * exactamente lo que venía a evitar.
 *
 * Quién decide, por orden:
 *
 *   1. La URL. `?modo=ligero` o `?modo=3d` van derechos, sin preguntar: son
 *      enlaces que alguien ha compartido apuntando a algo concreto.
 *   2. Nadie. Sin parámetro se enseña la puerta —PANEL o ISLA— y elige el
 *      visitante. Lo elegido la última vez llega enfocado, no aplicado.
 *
 * Si la escena revienta a media carga tampoco se deja al visitante mirando una
 * pantalla negra: se le enseña el portafolio entero en su versión ligera.
 */

// Las caras antes que los estilos que las usan: así el navegador ya tiene la
// declaración cuando se encuentra el primer `font-family`.
import './ui/fuentes.css';
import './ui/base.css';
import { haySoporteWebGL, LIGERO, modoPedido, modoRecordado, PLENO } from './modo.js';
import { Portada } from './portada/Portada.js';

async function mostrarLigero(aviso) {
  document.getElementById('loader')?.remove();
  document.getElementById('ui').hidden = true;
  // Y fuera el lienzo, que aquí no dibuja nada pero sigue tapando la página.
  //
  // Es `position: fixed` a pantalla completa, así que se pone por delante de
  // todo lo que no esté posicionado. Y no se nota, porque es transparente: lo
  // único que delata que está ahí es que los botones de debajo dejan de
  // responder. Se salvaban los de la cabecera —`sticky`, y por tanto
  // posicionada— y todo lo que cuelga de `.lg-secciones`, mientras que la
  // portada y el pie quedaban muertos sin ninguna señal.
  document.getElementById('scene')?.remove();
  const { Ligero } = await import('./ligero/Ligero.js');
  new Ligero(document.getElementById('ligero')).montar({ aviso });
}

async function mostrarEscena() {
  document.getElementById('loader').hidden = false;
  const { Experience } = await import('./core/Experience.js');
  const experience = new Experience(document.getElementById('scene'));

  // Expuesto para depurar desde la consola del navegador.
  window.__portfolio = experience;

  try {
    await experience.boot();
  } catch (error) {
    console.error('[portafolio] no se pudo arrancar la escena', error);
    await mostrarLigero(
      `La escena 3D no ha podido arrancar en este navegador (${error.message}). ` +
        'Esta es la versión ligera del portafolio.'
    );
  }
}

/**
 * Se llega aquí sin haberlo pedido: o sin WebGL, o porque la escena reventó.
 * El aviso dice de quién es el problema — «falta WebGL» a secas se lee como
 * «este portafolio está roto», y lo que hay que decir es que el promontorio
 * existe y que es este navegador el que no llega a él.
 */
function avisoSinWebGL() {
  return (
    'Este navegador no puede dibujar en 3D: le falta WebGL, casi siempre por tener ' +
    'desactivada la aceleración por hardware. El portafolio en 3D sigue ahí — se ve ' +
    'abriendo esta misma dirección en otro navegador.'
  );
}

function entrar(modo) {
  // La dirección se queda apuntando a lo elegido, sin recargar. Así el enlace
  // que alguien copie de la barra lleva a lo que estaba viendo, y volver atrás
  // desde una sección no devuelve a la puerta.
  const url = new URL(location.href);
  url.searchParams.set('modo', modo === LIGERO ? LIGERO : '3d');
  history.replaceState(null, '', url);

  if (modo === LIGERO) return mostrarLigero();
  return mostrarEscena();
}

function arrancar() {
  const pedido = modoPedido();

  if (pedido === LIGERO) return mostrarLigero(haySoporteWebGL() ? undefined : avisoSinWebGL());
  if (pedido === PLENO) return mostrarEscena();

  // Sin nada pedido: la puerta.
  const portada = new Portada(document.getElementById('portada'), (modo) => entrar(modo));
  portada.mostrar({ preferido: modoRecordado() });
}

arrancar();
