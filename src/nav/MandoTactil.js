/**
 * Mando a pie para pantallas táctiles.
 *
 * El paseo por la isla estaba escrito para un teclado y para un ratón con el
 * puntero bloqueado, y en un móvil no hay ninguna de las dos cosas:
 * `requestPointerLock` no se concede, sin él `movementX` no llega y la cabeza
 * no gira, y sin teclas no se anda. El modo a pie no es que se viera mal en un
 * teléfono: es que no se podía abrir, porque además la única forma de entrar
 * era la tecla C.
 *
 * Esto pone lo que faltaba y nada más:
 *
 *  - una **palanca** abajo a la izquierda, que escribe en `rig.palanca`;
 *  - una **salida** visible, porque tampoco hay Esc.
 *
 * Mirar se arrastra con el dedo por el resto de la pantalla, y de eso se
 * ocupa el propio `CameraRig`: aquí solo está el mando.
 */

/**
 * ¿Manda el dedo en este aparato?
 *
 * `pointer: coarse` es «el puntero principal es basto», o sea táctil. No vale
 * `maxTouchPoints`: un portátil con pantalla táctil y ratón lo cumple, y ahí
 * el mando sobra —tiene teclado y el bloqueo del puntero funciona—.
 *
 * `?tactil` lo fuerza. Existe para poder probar el mando en un escritorio, que
 * es donde se desarrolla, y lo usa `tools/tactil-check.mjs`.
 */
export function esTactil() {
  try {
    if (new URLSearchParams(location.search).has('tactil')) return true;
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Captura un puntero sin romperse si no se puede.
 *
 * `setPointerCapture` lanza `InvalidPointerId` con un identificador que no
 * corresponde a un dedo de verdad, que es justo el caso de los eventos
 * sintéticos con los que se prueba esto. Sin captura el mando funciona igual
 * mientras el dedo no se salga del aro, así que el fallo no vale un error.
 *
 * @param {Element} el
 * @param {number} id
 */
export function capturar(el, id) {
  try {
    el.setPointerCapture?.(id);
  } catch {
    /* sin captura: el arrastre vale mientras no se salga del elemento */
  }
}

export class MandoTactil {
  /**
   * @param {import('./CameraRig.js').CameraRig} rig
   * @param {{onSalir?: () => void}} callbacks
   */
  constructor(rig, { onSalir } = {}) {
    this.rig = rig;
    this.onSalir = onSalir;
    this.el = null;
    /** Identificador del dedo que lleva la palanca; null si no hay ninguno. */
    this._dedo = null;
    this._centro = { x: 0, y: 0 };
    this._radio = 48;
  }

  /** @param {HTMLElement} padre */
  montar(padre) {
    const el = document.createElement('div');
    el.className = 'mando';
    el.hidden = true;
    el.innerHTML = `
      <div class="mando__base">
        <span class="mando__aro" aria-hidden="true"></span>
        <span class="mando__pomo" aria-hidden="true"></span>
        <span class="sr-only">Palanca para andar</span>
      </div>
      <button class="mando__salir" type="button">Salir</button>`;
    padre.appendChild(el);

    this.el = el;
    this.base = el.querySelector('.mando__base');
    this.pomo = el.querySelector('.mando__pomo');

    this._onDown = (e) => {
      if (this._dedo !== null) return;
      this._dedo = e.pointerId;
      // La captura es lo que hace que la palanca no se quede pegada: con ella
      // el `pointerup` llega aquí aunque el dedo haya salido del aro.
      capturar(this.base, e.pointerId);
      const caja = this.base.getBoundingClientRect();
      this._centro = { x: caja.left + caja.width / 2, y: caja.top + caja.height / 2 };
      this._radio = caja.width * 0.38;
      this._mover(e);
    };
    this._onMove = (e) => {
      if (e.pointerId === this._dedo) this._mover(e);
    };
    this._onUp = (e) => {
      if (e.pointerId !== this._dedo) return;
      this._dedo = null;
      this._soltar();
    };

    this.base.addEventListener('pointerdown', this._onDown);
    this.base.addEventListener('pointermove', this._onMove);
    this.base.addEventListener('pointerup', this._onUp);
    this.base.addEventListener('pointercancel', this._onUp);
    el.querySelector('.mando__salir').addEventListener('click', () => this.onSalir?.());

    return this;
  }

  _mover(e) {
    const dx = e.clientX - this._centro.x;
    const dy = e.clientY - this._centro.y;
    const distancia = Math.hypot(dx, dy);
    // Fuera del aro la palanca no crece: se queda tope, que es correr.
    const k = distancia > 0 ? Math.min(1, distancia / this._radio) / distancia : 0;
    const x = dx * k;
    const y = dy * k;
    this.pomo.style.transform = `translate(${x * this._radio}px, ${y * this._radio}px)`;
    this.rig.palanca.x = x;
    this.rig.palanca.y = y;
  }

  _soltar() {
    this.rig.palanca.x = 0;
    this.rig.palanca.y = 0;
    this.pomo.style.transform = '';
  }

  /**
   * Mide la barra de estado y se la cuenta al CSS.
   *
   * La palanca va justo encima de esa barra, y la barra no mide siempre lo
   * mismo: en un teléfono el aviso se parte en dos líneas y los momentos del
   * día bajan a una fila propia. Con un número fijo la palanca acababa encima
   * de los botones, que es peor que no tenerla.
   *
   * Se mide en el fotograma siguiente porque el aviso se pone DESPUÉS de
   * cambiar de modo: medir ahora mismo daría la barra sin él.
   */
  _medirBarra() {
    requestAnimationFrame(() => {
      if (!this.el || this.el.hidden) return;
      const barra = document.querySelector('.statusbar');
      if (!barra) return;
      this.el.style.setProperty('--alto-barra', `${Math.round(barra.getBoundingClientRect().height)}px`);
    });
  }

  /** @param {boolean} visible */
  mostrar(visible) {
    if (!this.el) return;
    this.el.hidden = !visible;
    if (visible) {
      this._medirBarra();
      // Y otra vez si gira el teléfono: en horizontal la barra vuelve a caber
      // en una línea y la palanca tiene que bajar con ella.
      this._onResize ??= () => this._medirBarra();
      window.addEventListener('resize', this._onResize);
    } else if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    // Al esconderlo hay que soltar la palanca a mano: si se sale del modo a
    // pie con el dedo puesto, el `pointerup` nunca llega y el visitante se
    // queda andando solo la próxima vez que entre.
    if (!visible) {
      this._dedo = null;
      this._soltar();
    }
  }

  dispose() {
    if (!this.el) return;
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.base.removeEventListener('pointerdown', this._onDown);
    this.base.removeEventListener('pointermove', this._onMove);
    this.base.removeEventListener('pointerup', this._onUp);
    this.base.removeEventListener('pointercancel', this._onUp);
    this.el.remove();
    this.el = null;
  }
}
