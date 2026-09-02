/**
 * Interacción: qué hay bajo el puntero y qué pasa al pulsarlo.
 *
 * El raycast solo se lanza cuando el puntero se ha movido o la cámara ha
 * cambiado, y contra una lista corta de objetos-diana registrados por cada
 * santuario. Lanzarlo contra la escena entera cada frame costaría más que
 * dibujarla, con 200 piedras y 40.000 briznas de hierba.
 */

import * as THREE from 'three';

export class Interaction {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} dom
   * @param {THREE.Object3D[]} targets
   */
  constructor(camera, dom, targets) {
    this.camera = camera;
    this.dom = dom;
    this.targets = targets;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 400;
    this.pointer = new THREE.Vector2(-2, -2);
    this.hovered = null;
    this.enabled = true;
    this._dirty = true;
    this._downAt = null;
    this._pointerInside = false;

    /** @type {Set<(hotspot: object, object: THREE.Object3D) => void>} */
    this.onSelect = new Set();
    this.onHoverChange = new Set();

    this._bind();
  }

  _bind() {
    const dom = this.dom;

    this._onMove = (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._pointerInside = true;
      this._dirty = true;
    };
    this._onLeave = () => {
      this._pointerInside = false;
      this.pointer.set(-2, -2);
      this._dirty = true;
    };
    this._onDown = (e) => {
      this._downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    this._onUp = (e) => {
      if (!this._downAt || !this.enabled) return;
      const moved = Math.hypot(e.clientX - this._downAt.x, e.clientY - this._downAt.y);
      const held = performance.now() - this._downAt.t;
      this._downAt = null;
      // Un arrastre de cámara no debe abrir nada.
      if (moved > 6 || held > 600) return;
      // En táctil no hay hover previo: hay que resolver el toque aquí. Con
      // ratón se respeta lo que ya estaba señalado, porque los monolitos y
      // sus láminas flotan: repetir el raycast en el instante del clic podía
      // devolver un objeto distinto del que anunciaba la etiqueta.
      if (!this.hovered) {
        this._onMove(e);
        this._raycast();
      }
      if (this.hovered) {
        const hotspot = this.hovered.userData.hotspot;
        for (const cb of this.onSelect) cb(hotspot, this.hovered);
      }
    };

    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerleave', this._onLeave);
    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointerup', this._onUp);
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointermove', this._onMove);
    dom.removeEventListener('pointerleave', this._onLeave);
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('pointerup', this._onUp);
  }

  /** Marca que hay que volver a resolver (la cámara se movió). */
  invalidate() {
    this._dirty = true;
  }

  _raycast() {
    if (!this.enabled || !this._pointerInside) {
      this._setHovered(null);
      return;
    }
    // Con el puntero bloqueado se apunta con el CENTRO de la pantalla: es la
    // mirilla de la primera persona. El puntero real no se mueve mientras está
    // bloqueado, así que sin esto se seguiría apuntando a donde estuviera el
    // ratón la última vez que se vio.
    if (document.pointerLockElement) this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, false);
    this._setHovered(hits.length ? hits[0].object : null);
  }

  _setHovered(object) {
    if (object === this.hovered) return;
    this.hovered = object;
    this.dom.style.cursor = object ? 'pointer' : '';
    for (const cb of this.onHoverChange) cb(object);
  }

  update() {
    if (!this._dirty) return;
    this._dirty = false;
    this._raycast();
  }
}
