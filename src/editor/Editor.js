/**
 * Modo edición: colocar piezas con el ratón y guardar al proyecto.
 *
 * Se entra con `?editor` y solo existe en desarrollo. La idea es cerrar el
 * bucle: mover una piedra, verla donde la dejas y que al recargar siga ahí, sin
 * pasar por el código. Lo que se guarda no es la escena entera —eso serían mil
 * doscientos nodos calculados— sino la DIFERENCIA respecto a lo que generó la
 * semilla, que suele caber en unas pocas líneas.
 *
 * Tres decisiones que conviene no deshacer:
 *
 *  1. **El gizmo apaga la cámara mientras arrastra.** `CameraRig` y
 *     `TransformControls` escuchan los mismos eventos de puntero, así que sin
 *     esto arrastrar una piedra orbita la cámara a la vez y la pieza «huye».
 *  2. **Seleccionar es pulsar sin arrastrar.** El mismo criterio que usa
 *     `Interaction` para los puntos interactivos: si el puntero se ha movido más
 *     de unos píxeles, era una órbita, no un clic.
 *  3. **Deshacer guarda la transformación entera**, no el incremento. Un gizmo
 *     emite decenas de eventos por arrastre; apilar cada uno llenaría la pila de
 *     pasos de medio milímetro. Se apila una vez por arrastre, al soltar.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { crearPanel } from './panel.js';
import './editor.css';
import {
  anotarPieza,
  estadoEscena,
  listaPiezas,
  piezaDe,
  piezaPorId,
} from './registro.js';

/** Umbral de arrastre para distinguir un clic de una órbita, en píxeles. */
const CLIC = 5;

export class Editor {
  /** @param {import('../core/Experience.js').Experience} experiencia */
  constructor(experiencia) {
    this.exp = experiencia;
    this.escena = experiencia.scene;
    this.camara = experiencia.camera;
    this.lienzo = experiencia.canvas;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 900;
    this.puntero = new THREE.Vector2();

    /** @type {ReturnType<typeof piezaPorId>} */
    this.seleccion = null;
    this.pila = [];
    this.sucio = false;
    this._antesDelArrastre = null;
  }

  montar() {
    this.gizmo = new TransformControls(this.camara, this.lienzo);
    this.gizmo.setSize(0.85);
    this.ayudante = this.gizmo.getHelper();
    // Nombre reservado: `registro.js` lo excluye para que el propio gizmo no
    // acabe apareciendo en la lista de piezas editables.
    this.ayudante.name = 'editor-gizmo';
    this.escena.add(this.ayudante);

    this.gizmo.addEventListener('dragging-changed', (e) => {
      // La cámara se calla mientras se arrastra, o se orbita y se mueve la
      // pieza a la vez.
      this.exp.rig.enabled = !e.value;
      if (e.value) this._antesDelArrastre = this._instantanea();
      else this._cerrarArrastre();
    });
    this.gizmo.addEventListener('objectChange', () => {
      this.panel?.refrescarTransformacion();
    });

    this.panel = crearPanel(this);
    this._bindRaton();
    this._bindTeclas();
    this.panel.refrescarLista(listaPiezas());
    return this;
  }

  // ------------------------------------------------------------------ selección

  _bindRaton() {
    this._onDown = (e) => {
      this._desde = { x: e.clientX, y: e.clientY };
    };
    this._onUp = (e) => {
      if (!this._desde) return;
      const movido = Math.hypot(e.clientX - this._desde.x, e.clientY - this._desde.y);
      this._desde = null;
      if (movido > CLIC) return;      // era una órbita
      if (this.gizmo.dragging) return; // era el propio gizmo
      this._elegirBajoPuntero(e);
    };
    this.lienzo.addEventListener('pointerdown', this._onDown);
    this.lienzo.addEventListener('pointerup', this._onUp);
  }

  _elegirBajoPuntero(e) {
    const r = this.lienzo.getBoundingClientRect();
    this.puntero.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.puntero.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.puntero, this.camara);

    // Contra la escena entera: aquí sí interesa poder pinchar cualquier cosa, y
    // pasa una vez por clic, no una vez por fotograma.
    const impactos = this.raycaster.intersectObjects(this.escena.children, true);
    for (const impacto of impactos) {
      if (this._esDelGizmo(impacto.object)) continue;
      const pieza = piezaDe(impacto.object);
      if (pieza) return this.seleccionar(pieza.ruta);
    }
    this.seleccionar(null);
  }

  _esDelGizmo(objeto) {
    let n = objeto;
    while (n) {
      if (n === this.ayudante) return true;
      n = n.parent;
    }
    return false;
  }

  seleccionar(id) {
    const pieza = id ? piezaPorId(id) : null;
    this.seleccion = pieza;
    if (pieza) this.gizmo.attach(pieza.objeto);
    else this.gizmo.detach();
    this.panel.marcarSeleccion(pieza);
    return pieza;
  }

  /** Lleva la cámara delante de una pieza. */
  enfocar(pieza) {
    if (!pieza) return;
    const caja = new THREE.Box3().setFromObject(pieza.objeto);
    if (caja.isEmpty()) return;
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = Math.max(2.5, caja.getSize(new THREE.Vector3()).length() * 0.5);
    this.exp.rig.setMode('orbit');
    this.exp.rig.travelTo({
      target: centro,
      distance: radio * 3.4,
      height: radio * 1.6,
      azimuth: this.exp.rig.smooth?.azimuth ?? 0,
      duration: 0.8,
    });
  }

  // ------------------------------------------------------------- modificaciones

  _instantanea() {
    const o = this.seleccion?.objeto;
    if (!o) return null;
    return {
      id: this.seleccion.ruta,
      pos: o.position.toArray(),
      rot: [o.rotation.x, o.rotation.y, o.rotation.z],
      esc: o.scale.toArray(),
      oculto: !o.visible,
    };
  }

  /** Cierra un arrastre: una sola entrada en la pila y una sola anotación. */
  _cerrarArrastre() {
    const despues = this._instantanea();
    const antes = this._antesDelArrastre;
    this._antesDelArrastre = null;
    if (!antes || !despues) return;
    if (JSON.stringify(antes) === JSON.stringify(despues)) return;
    this.pila.push({ antes, despues });
    if (this.pila.length > 200) this.pila.shift();
    this._anotar(despues);
  }

  /** Aplica un cambio hecho desde el panel (casillas numéricas, botones). */
  aplicar(cambio) {
    const antes = this._instantanea();
    const o = this.seleccion?.objeto;
    if (!o) return;
    if (cambio.pos) o.position.fromArray(cambio.pos);
    if (cambio.rot) o.rotation.fromArray(cambio.rot);
    if (cambio.esc) o.scale.fromArray(cambio.esc);
    if (cambio.oculto !== undefined) o.visible = !cambio.oculto;
    o.updateMatrixWorld(true);
    const despues = this._instantanea();
    this.pila.push({ antes, despues });
    this._anotar(despues);
    this.panel.refrescarTransformacion();
  }

  _anotar(estado) {
    const pieza = piezaPorId(estado.id);
    if (!pieza) return;

    // Nada que anotar si la pieza está donde la puso su función.
    //
    // Sin esto, cualquier roce con el gizmo —o pulsar una casilla numérica sin
    // cambiar el número— deja una entrada en `escena.json` que no cambia nada.
    // El fichero se llena de anulaciones vacías y deja de poder leerse para
    // saber qué se ha tocado a mano, que es justo para lo que existe.
    const iguales = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
    if (
      !estado.oculto &&
      iguales(estado.pos.map(redondear), pieza.pos0) &&
      iguales(estado.rot.map(redondear), pieza.rot0) &&
      iguales(estado.esc.map(redondear), pieza.esc0)
    ) {
      anotarPieza(estado.id, null);
      this.marcarSucio();
      return;
    }

    anotarPieza(estado.id, {
      pos: estado.pos.map(redondear),
      rot: estado.rot.map(redondear),
      esc: estado.esc.map(redondear),
      oculto: estado.oculto || undefined,
      // La posición con la que NACIÓ la pieza. Al cargar se compara con la
      // actual: si no coinciden, el identificador ha derivado y más vale avisar
      // que mover la pieza equivocada en silencio.
      pos0: pieza.pos0,
    });
    this.marcarSucio();
  }

  /** Posa la pieza sobre el terreno dibujado, respetando su padre. */
  posarEnSuelo() {
    const pieza = this.seleccion;
    if (!pieza) return;
    const mundo = pieza.objeto.getWorldPosition(new THREE.Vector3());
    // `meshHeight` y no `height`: lo que se ve del terreno es la malla, y en una
    // loma su interpolación queda por debajo de la altura analítica. Es el mismo
    // motivo por el que las piedras del prado se posaban flotando.
    mundo.y = this.exp.world.field.meshHeight(mundo.x, mundo.z);
    const local = pieza.objeto.parent.worldToLocal(mundo.clone());
    this.aplicar({ pos: local.toArray() });
  }

  restablecer() {
    const pieza = this.seleccion;
    if (!pieza) return;
    anotarPieza(pieza.ruta, null);
    this.marcarSucio();
    this.panel.avisar('Se aplica al recargar: la pieza vuelve a lo que calcule la semilla.');
  }

  deshacer() {
    const paso = this.pila.pop();
    if (!paso) return;
    const pieza = piezaPorId(paso.antes.id);
    if (!pieza) return;
    pieza.objeto.position.fromArray(paso.antes.pos);
    pieza.objeto.rotation.fromArray(paso.antes.rot);
    pieza.objeto.scale.fromArray(paso.antes.esc);
    pieza.objeto.visible = !paso.antes.oculto;
    pieza.objeto.updateMatrixWorld(true);
    this.seleccionar(paso.antes.id);
    this._anotar(paso.antes);
    // `_anotar` vuelve a apilar; se quita para que deshacer no sea un bucle.
    this.pila.pop();
    this.panel.refrescarTransformacion();
  }

  marcarSucio() {
    this.sucio = true;
    this.panel?.marcarSucio(true);
  }

  // ---------------------------------------------------------------- guardado

  async guardar() {
    try {
      const respuesta = await fetch('/__editor/escena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estadoEscena()),
      });
      const datos = await respuesta.json();
      if (!datos.ok) throw new Error(datos.error ?? 'error desconocido');
      this.sucio = false;
      this.panel.marcarSucio(false);
      this.panel.avisar(`Guardado · ${datos.piezas} piezas en src/editor/escena.json`);
    } catch (e) {
      this.panel.avisar(`No se ha podido guardar: ${e.message}`, true);
    }
  }

  // ----------------------------------------------------------------- teclado

  _bindTeclas() {
    this._onKey = (e) => {
      const etiqueta = document.activeElement?.tagName;
      if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        return this.guardar();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        return this.deshacer();
      }
      if (e.ctrlKey || e.metaKey) return;

      const tecla = e.key.toLowerCase();
      if (tecla === 'g') return this._modo('translate', e);
      if (tecla === 'r') return this._modo('rotate', e);
      if (tecla === 'e') return this._modo('scale', e);
      if (tecla === 'x') {
        e.stopPropagation();
        this.gizmo.setSpace(this.gizmo.space === 'local' ? 'world' : 'local');
        return this.panel.marcarModo(this.gizmo.mode, this.gizmo.space);
      }
      if (tecla === 'p') {
        e.stopPropagation();
        return this.posarEnSuelo();
      }
      // Escape se atiende ANTES que el resto de la aplicación, que lo usa para
      // salir de la sección: con algo seleccionado, lo que se espera es soltarlo.
      if (e.key === 'Escape' && this.seleccion) {
        e.stopPropagation();
        return this.seleccionar(null);
      }
    };
    // En captura: hay que llegar antes que el manejador de la aplicación.
    window.addEventListener('keydown', this._onKey, true);
  }

  _modo(modo, evento) {
    evento.stopPropagation();
    this.gizmo.setMode(modo);
    this.panel.marcarModo(modo, this.gizmo.space);
  }

  desmontar() {
    window.removeEventListener('keydown', this._onKey, true);
    this.lienzo.removeEventListener('pointerdown', this._onDown);
    this.lienzo.removeEventListener('pointerup', this._onUp);
    this.gizmo.detach();
    this.gizmo.dispose();
    this.escena.remove(this.ayudante);
    this.panel?.destruir();
  }
}

function redondear(v) {
  return Number(v.toFixed(4));
}
