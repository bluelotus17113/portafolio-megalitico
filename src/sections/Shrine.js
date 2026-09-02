/**
 * Base común de los cinco santuarios.
 *
 * Cada sección hereda de aquí y solo tiene que construir su monumento: el
 * estrado, el faro, los anillos de pulso, el rótulo y el registro de puntos
 * interactivos ya vienen resueltos. Así los cinco comparten lenguaje visual
 * sin repetir código.
 */

import * as THREE from 'three';
import { createDais } from '../models/Dais.js';
import { createBeacon, createPulseRings } from '../vfx/Beacon.js';
import { createLabel } from '../vfx/Label3D.js';
import { damp } from '../utils/noise.js';
import { DAIS } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Shrine {
  /**
   * @param {object} ctx
   * @param {import('../config.js').SECTIONS[0]} ctx.def
   * @param {import('../world/Terrain.js').TerrainField} ctx.field
   */
  constructor({ def, field }) {
    this.def = def;
    this.id = def.id;
    this.field = field;

    const [x, , z] = def.anchor;
    this.groundY = field.height(x, z);

    this.group = new THREE.Group();
    this.group.name = `shrine-${def.id}`;
    this.group.position.set(x, this.groundY, z);
    this.group.rotation.y = def.facing;

    /** @type {Array<{object: THREE.Object3D, id: string, title: string, kind: string, payload: any}>} */
    this.hotspots = [];
    /** Objetos que hay que resaltar cuando el santuario está activo. */
    this.glow = [];

    this.active = false;
    this._activation = 0;
    this._labelOpacity = 1;

    /** Punto al que apunta la cámara al enfocar la sección. */
    this.focusOffset = new THREE.Vector3(0, 6, 0);
  }

  /** Estrado + faro + pulsos + rótulo. Llamar desde `build()` de la subclase. */
  buildBase({
    motif = 'triskel',
    beaconHeight = 46,
    beaconRadius = 3.0,
    labelHeight = 3.4,
    labelY = 20,
    seed = 1,
  } = {}) {
    const color = this.def.color;
    // Las medidas del estrado salen de config.DAIS, no de cada sección: la
    // hierba y el arbolado leen esa misma tabla para no invadirlo.
    const { radius: daisRadius, steps, stepWidth } = DAIS[this.def.id];

    this.dais = createDais({
      radius: daisRadius,
      steps,
      stepWidth,
      color,
      motif,
      seed,
      // El estrado necesita saber dónde está el suelo para cerrar su muro
      // contra él. Es lo único que sabe el santuario y no sabe el estrado.
      groundAt: (lx, lz) => this.groundAt(lx, lz),
    });
    this.group.add(this.dais);
    this._motifBase = this.dais.userData.motif?.userData.glyph.uIntensity.value ?? 1;

    this.beacon = createBeacon({
      radius: beaconRadius,
      height: beaconHeight,
      color,
      intensity: 0.34,
    });
    this.beacon.position.y = 0.3;
    this.group.add(this.beacon);

    this.rings = createPulseRings({
      radius: daisRadius + steps * stepWidth + 4,
      color,
      count: 3,
      speed: 0.24,
      intensity: 0.34,
    });
    this.rings.position.y = -steps * 0.55 + 0.05;
    this.group.add(this.rings);

    this.label = createLabel(this.def.label.toUpperCase(), {
      height: labelHeight,
      maxWidth: 11,
      glowColor: `#${new THREE.Color(color).getHexString()}`,
      fadeFar: 460,
      minDistance: 24,
    });
    // El rótulo va en un hijo sin rotar: debe leerse igual mire donde mire.
    this.labelHolder = new THREE.Group();
    this.labelHolder.rotation.y = -this.def.facing;
    this.labelHolder.position.y = labelY;
    this.labelHolder.add(this.label);
    this.group.add(this.labelHolder);

    // Luz propia del santuario: tiñe la piedra de alrededor.
    this.light = new THREE.PointLight(color, 0, 46, 2);
    this.light.position.set(0, 4.5, 0);
    this.group.add(this.light);

    return this;
  }

  /**
   * Registra un objeto como interactivo.
   * @param {THREE.Object3D} object
   * @param {{id: string, title: string, kind?: string, payload?: any, radius?: number}} data
   */
  addHotspot(object, data) {
    object.userData.hotspot = { shrine: this.id, ...data };
    this.hotspots.push({ object, ...data });
    return object;
  }

  /**
   * Convierte un punto del plano local del santuario a coordenadas de mundo.
   * Hace falta antes de añadir el grupo a la escena, cuando `localToWorld`
   * todavía no serviría.
   */
  localToWorldXZ(lx, lz) {
    const c = Math.cos(this.def.facing);
    const s = Math.sin(this.def.facing);
    return {
      x: this.def.anchor[0] + lx * c + lz * s,
      z: this.def.anchor[2] - lx * s + lz * c,
    };
  }

  /**
   * Altura del terreno en un punto local, relativa a la base del santuario.
   *
   * `meshHeight` y no `height`: la superficie que se ve es la malla, y en una
   * loma su interpolación queda por debajo de la altura analítica.
   */
  groundAt(lx, lz) {
    const { x, z } = this.localToWorldXZ(lx, lz);
    return this.field.meshHeight(x, z) - this.groundY;
  }

  /**
   * Posa un objeto sobre el terreno, en coordenadas locales del santuario.
   *
   * Existe para que no haya que acordarse. Todo lo que va dentro de un santuario
   * hereda la altura de su ancla, y mientras la pieza esté sobre el enlosado eso
   * es correcto — el estrado ES plano. En cuanto algo se sale al prado deja de
   * serlo: el terreno se separa del plano del ancla, y una pieza con la Y local
   * fija se queda flotando tanto más cuanto más lejos esté. Pasó al sacar los
   * cantos sueltos fuera del enlosado, que es justo el sitio donde el defecto se
   * nota.
   *
   * `align` inclina la pieza con la ladera, que es la otra mitad de «que caiga
   * sola»: una piedra apoyada en una cuesta no se queda a plomo.
   *
   * @param {number} sink  Cuánto se entierra, en metros.
   * @param {number} align 0 = a plomo, 1 = perpendicular a la ladera.
   */
  settle(object, lx, lz, { sink = 0, align = 0, spin = 0 } = {}) {
    object.position.set(lx, this.groundAt(lx, lz) - sink, lz);
    if (align > 0) {
      const { x, z } = this.localToWorldXZ(lx, lz);
      const n = this.field.normal(x, z);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, n);
      object.quaternion.slerp(q, align);
      if (spin) object.rotateY(spin);
    }
    return object;
  }

  /** Punto de interés en coordenadas de mundo. */
  get focusPoint() {
    return this.group.localToWorld(this.focusOffset.clone());
  }

  /** Punto por donde entra la línea ley, en coordenadas de mundo. */
  get leyPoint() {
    return new THREE.Vector3(this.def.anchor[0], 0, this.def.anchor[2]);
  }

  setActive(active) {
    this.active = active;
  }

  /** Sobrescribible: animación propia del monumento. */
  onUpdate() {}

  update(dt, ctx) {
    const targetActivation = this.active ? 1 : 0;
    this._activation = damp(this._activation, targetActivation, 3.2, dt);
    const a = this._activation;

    if (this.beacon) {
      this.beacon.userData.uniforms.uActive.value = a;
      // El faro orienta desde lejos y estorba de cerca: se apaga por
      // proximidad y también al enfocar la sección, que es justo cuando
      // se plantaba en mitad del encuadre.
      const d = ctx.camera.position.distanceTo(this.group.position);
      const near = THREE.MathUtils.smoothstep(d, 55, 120);
      this.beacon.userData.uniforms.uIntensity.value = 0.34 * near * (1 - a * 0.85);
    }
    if (this.rings) this.rings.userData.uniforms.uActive.value = 0.35 + a * 0.9;
    if (this.light) this.light.intensity = 6 + a * 26;
    if (this.dais?.userData.motif) {
      // Se escala sobre la intensidad con la que nació el estrado, que ya
      // depende de su tamaño; fijar aquí un valor absoluto se cargaba ese
      // ajuste y devolvía la mancha turquesa del suelo.
      const glyph = this.dais.userData.motif.userData.glyph;
      glyph.uIntensity.value = this._motifBase * (1 + a * 0.7);
    }
    if (this.label) {
      // El rótulo se desvanece al entrar: dentro manda el panel de texto.
      const d = ctx.camera.position.distanceTo(this.group.position);
      const want = THREE.MathUtils.smoothstep(d, 26, 60) * (1 - a * 0.55);
      this._labelOpacity = damp(this._labelOpacity, want, 4, dt);
      this.label.userData.uniforms.uOpacity.value = this._labelOpacity;
    }

    this.onUpdate(dt, ctx, a);
  }
}
