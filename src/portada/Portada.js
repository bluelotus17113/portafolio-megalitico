/**
 * La puerta de entrada: PANEL o ISLA.
 *
 * Antes el portafolio decidía solo por el visitante —detectaba el equipo y
 * servía una de las dos versiones—, y era una decisión que no le tocaba tomar:
 * quien llega a un portafolio no viene a que le administren el ancho de banda,
 * viene a mirar. Preguntar cuesta un segundo y además cuenta que hay dos cosas
 * que ver, que es información que antes se perdía entera.
 *
 * Vive en el bundle de entrada y NO en un trozo aparte, con `import` estático
 * desde `main.js`. Es lo primero que se pinta: hacerla esperar a un `import()`
 * sería añadirle un viaje de red a la pantalla cuya única virtud es aparecer
 * enseguida. Cabe en tres kilobytes porque no trae nada — las runas y el ogham
 * salen de módulos que ya viajan en el trozo compartido.
 *
 * Nada de three, claro: elegir PANEL no puede costar el motor.
 */

import { IDENTITY } from '../content.js';
import { esc } from '../utils/html.js';
import { runaSVG, oghamSVG } from '../utils/glifos.js';
import { haySoporteWebGL, LIGERO, PLENO, recordar } from '../modo.js';
import './portada.css';

/**
 * Las doce runas del mosaico de PANEL.
 *
 * Elegidas a mano y no al azar: puestas en rejilla, las que son casi una línea
 * recta —isaz, naudiz— dejan huecos que se leen como un fallo de carga, y dos
 * runas muy parecidas seguidas parecen la misma repetida. Estas doce llenan su
 * casilla y no se confunden entre sí.
 */
const MOSAICO = [
  'ansuz', 'berkanan', 'dagaz', 'ehwaz',
  'gebo', 'hagalaz', 'ingwaz', 'jera',
  'raidho', 'sowilo', 'thurisaz', 'algiz',
];

/**
 * La isla, en alzado: horizonte, un trilito y dos menhires bajo la luna.
 *
 * Dibujada a mano y no derivada de la escena a propósito. Sacarla del terreno
 * real habría exigido el campo de alturas, que vive del lado de three —el
 * icono de «ver el 3D» habría obligado a descargar el 3D para poder pintarlo.
 */
const ISLA = `
  <svg viewBox="0 0 120 96" width="100%" height="100%" aria-hidden="true" fill="none"
       stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="93" cy="21" r="8.5" opacity="0.45"/>
    <path d="M2 76 C20 63 33 57 46 57 C63 57 76 63 94 72 C105 77 113 80 118 81" opacity="0.7"/>
    <!-- El trilito: dos ortostatos y un dintel. Con cuadriláteros y no con
         líneas — un palo de un píxel no es una piedra de tres metros, y a este
         tamaño la diferencia entre «megalito» y «andamio» está justo ahí. -->
    <path d="M36.5 57 L35.5 35.5 L41.5 34.5 L42.5 56.5 Z"/>
    <path d="M60 56.5 L59.5 34 L65.5 33.5 L66 56 Z"/>
    <path d="M33 34.5 L68.5 31.5 L69 37 L33.5 40 Z"/>
    <!-- Dos menhires sueltos, uno a cada lado y de distinto porte. -->
    <path d="M19 67 L17.5 50.5 L23.5 49 L25 66 Z" opacity="0.8"/>
    <path d="M86 69 L84.5 56 L89.5 55 L91 68 Z" opacity="0.62"/>
    <path d="M2 86 C28 79 55 81 78 87 C96 91 111 93 118 93" opacity="0.3"/>
  </svg>`;

export class Portada {
  /**
   * @param {HTMLElement} root  el `#portada` de `index.html`
   * @param {(modo: 'ligero'|'pleno') => void} alElegir
   */
  constructor(root, alElegir) {
    this.root = root;
    this.alElegir = alElegir;
  }

  mostrar({ preferido = null } = {}) {
    document.documentElement.classList.add('portada-activa');
    document.body.classList.add('portada-activa');
    document.title = `${IDENTITY.name} · Portafolio`;

    this.root.innerHTML = this._html(preferido);
    this.root.hidden = false;

    this._bind();
  }

  ocultar() {
    document.documentElement.classList.remove('portada-activa');
    document.body.classList.remove('portada-activa');
    this.root.dataset.saliendo = 'true';
    // Se retira del DOM al terminar la transición, no antes: es `position:
    // fixed` a pantalla completa, y quedarse ahí invisible taparía la página
    // que hay debajo sin dejar ninguna señal de que lo está haciendo.
    setTimeout(() => this.root.remove(), 700);
  }

  // ------------------------------------------------------------------ marcado

  /**
   * @param {'ligero'|'pleno'|null} preferido  el que se sugiere, no el elegido
   */
  _html(preferido) {
    const runas = MOSAICO.map(
      (r, i) => `<span class="pt-runa" style="--i:${i}">${runaSVG(r, { tam: 30, grosor: 1.5 })}</span>`
    ).join('');

    /**
     * La sugerencia se marca con una etiqueta, no llevando el foco.
     *
     * Enfocar por programa dispara `:focus-visible`, y con él el cuadrado se
     * enciende entero: pintado igual que si el ratón estuviera encima, deja de
     * parecer una sugerencia y parece la opción ya elegida. Un rótulo dice lo
     * mismo sin mentir sobre el estado, y además deja el teclado donde estaba.
     */
    const marca = (modo) =>
      modo === preferido ? '<span class="pt-op__marca">Sugerido</span>' : '';

    return `
      <div class="pt-fondo" aria-hidden="true">
        <span class="pt-fondo__luz"></span>
      </div>

      <div class="pt-marco">
        <header class="pt-cab">
          <span class="pt-cab__ogham">${oghamSVG(IDENTITY.oghamMotto || 'ainm', { alto: 92, grosor: 1.2 })}</span>
          <div>
            <p class="pt-cab__kicker">Portafolio</p>
            <h1 class="pt-cab__nombre">${esc(IDENTITY.name)}</h1>
            <p class="pt-cab__rol">${esc(IDENTITY.role)}</p>
          </div>
        </header>

        <div class="pt-opciones" role="group" aria-label="Cómo quieres verlo">
          <button class="pt-op pt-op--panel" type="button" data-elige="${LIGERO}">
            <span class="pt-op__lamina">
              <span class="pt-op__runas">${runas}</span>
            </span>
            <span class="pt-op__pie">
              <span class="pt-op__num">I${marca(LIGERO)}</span>
              <span class="pt-op__nombre">Panel</span>
              <span class="pt-op__desc">Léelo. Una página, sin 3D, en cualquier equipo.</span>
            </span>
          </button>

          <button class="pt-op pt-op--isla" type="button" data-elige="${PLENO}">
            <span class="pt-op__lamina">
              <span class="pt-op__isla">${ISLA}</span>
            </span>
            <span class="pt-op__pie">
              <span class="pt-op__num">II${marca(PLENO)}</span>
              <span class="pt-op__nombre">Isla</span>
              <span class="pt-op__desc">Recórrelo. Un promontorio megalítico en 3D.</span>
            </span>
          </button>
        </div>

        <p class="pt-nota">${this._nota()}</p>
      </div>
    `;
  }

  /**
   * El pie dice lo que hay que saber ANTES de elegir, no después.
   *
   * Si el navegador no puede con la escena se avisa aquí: enterarse al pulsar,
   * tras esperar una carga, es peor que saberlo antes. Y se avisa sin
   * desactivar el botón — la detección puede equivocarse, y una puerta cerrada
   * con llave no se puede empujar para comprobarlo.
   */
  _nota() {
    if (!haySoporteWebGL()) {
      return 'Este navegador no puede dibujar en 3D: le falta WebGL, casi siempre por ' +
        'tener desactivada la aceleración por hardware. La Isla se puede intentar igual.';
    }
    return 'Se puede cambiar de una a otra en cualquier momento.';
  }

  // ---------------------------------------------------------------- conducta

  _bind() {
    for (const boton of this.root.querySelectorAll('[data-elige]')) {
      boton.addEventListener('click', () => {
        const modo = boton.dataset.elige;
        recordar(modo);
        this.ocultar();
        this.alElegir(modo);
      });
    }

    // Con teclado: 1 y 2 eligen, las flechas mueven entre los dos cuadrados.
    this._onKey = (e) => {
      if (e.key === '1' || e.key === '2') {
        const i = Number(e.key) - 1;
        this.root.querySelectorAll('[data-elige]')[i]?.click();
        return;
      }
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const botones = [...this.root.querySelectorAll('[data-elige]')];
      const actual = botones.indexOf(document.activeElement);
      const paso = e.key === 'ArrowRight' ? 1 : -1;
      botones[(actual + paso + botones.length) % botones.length]?.focus();
    };
    window.addEventListener('keydown', this._onKey);
    // El listener muere con la portada: si sobrevive, el «1» que salta a la
    // primera sección dentro de la escena volvería a elegir aquí.
    this.root.addEventListener('transitionend', () => window.removeEventListener('keydown', this._onKey), {
      once: true,
    });
  }
}
