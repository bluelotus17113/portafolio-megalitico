/**
 * IV — El Camino del Viajero (Trayectoria).
 *
 * A diferencia del resto, esta sección no es un punto sino un recorrido: un
 * sendero enlosado que asciende con un mojón por etapa. Las losas siguen la
 * altura real del terreno, así que el camino sube de verdad y no simula subir.
 *
 * Se lee de la etapa más antigua (abajo) a la actual (arriba).
 */

import * as THREE from 'three';
import { Shrine } from './Shrine.js';
import { createStone, createSlab, createBoulder, stoneMesh, rockMaterial } from '../models/StoneFactory.js';
import { carvedPanel } from '../models/Carving.js';
import { createCairn } from '../models/Megaliths.js';
import { createLabel } from '../vfx/Label3D.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { createLeyLine } from '../vfx/LeyLines.js';
import { RUNES, runeFor } from '../utils/runes.js';
import { EXPERIENCE } from '../content.js';
import { PALETTE, SEED } from '../config.js';
import { damp, makeRandom } from '../utils/noise.js';

const PATH_LENGTH = 42;
const PATH_WIDTH = 3.2;

/**
 * Trazado del sendero, en coordenadas LOCALES del santuario.
 *
 * Vive fuera de la clase porque hay dos cosas que necesitan saber por dónde
 * pasa y solo una de ellas es el propio sendero: la otra es el mundo, que tiene
 * que dejar de sembrar hierba y de plantar árboles encima.
 *
 * Ese era el fallo. El prado y el arbolado se construyen CUATRO etapas antes
 * que los santuarios y solo conocen los círculos de `paveKeepOut`, así que el
 * sendero —que no es un círculo y ni siquiera existe todavía— no les constaba.
 * Resultado: un carballo plantado en mitad de la escalinata y briznas creciendo
 * entre las losas.
 */
export function travellerCurve() {
  const controls = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    controls.push(new THREE.Vector2(Math.sin(t * Math.PI * 1.15) * 11 - 1, 8 + t * PATH_LENGTH));
  }
  return new THREE.SplineCurve(controls);
}

/**
 * El mismo sendero en coordenadas de MUNDO, como cadena de círculos vedados.
 *
 * El radio va holgado respecto al ancho del empedrado: no basta con no plantar
 * sobre las losas, hay que dejar libre también el bordillo de cantos y el hueco
 * por el que se anda. Con el radio justo, el árbol no pisaba la losa pero sí
 * dejaba caer la copa encima.
 *
 * @param {import('../config.js').SECTIONS[0]} def
 */
export function travellerKeepOut(def, { radius = 4.6, samples = 40 } = {}) {
  const curve = travellerCurve();
  const cos = Math.cos(def.facing);
  const sin = Math.sin(def.facing);
  const zonas = [];
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPoint(i / samples);
    zonas.push({
      x: def.anchor[0] + cos * p.x + sin * p.y,
      z: def.anchor[2] - sin * p.x + cos * p.y,
      radius,
    });
  }
  return zonas;
}

export class ExperienceShrine extends Shrine {
  build() {
    this.buildBase({
      motif: 'triskel',
      beaconHeight: 44,
      beaconRadius: 2.6,
      labelHeight: 3.6,
      labelY: 18,
      seed: 21,
    });

    const random = makeRandom(SEED + 505);

    // ---- Trazado del sendero ---------------------------------------------
    // Curva en S suave: un camino recto no invita a recorrerlo. La define
    // `travellerCurve`, que es también la que consulta el mundo para no sembrar
    // encima: una sola fuente de verdad, o el prado y las losas se separan.
    const curve2d = travellerCurve();
    this.pathCurve = curve2d;

    // Losas del sendero, siguiendo el terreno.
    //
    // Instanciadas, no sueltas. Son 354 losas que comparten siete geometrías y
    // un material, y como mallas independientes eran 354 llamadas de dibujo por
    // fotograma —con el bordillo, la mitad del coste de CPU de toda la isla—
    // sin que ninguna sea una pieza con identidad: el sendero es una cinta.
    // Instanciadas por geometría son siete llamadas.
    //
    // El azar se consume en EL MISMO ORDEN que antes (desplazamiento, giro,
    // escala, losa a losa). Esa es la única condición para que el camino salga
    // colocado exactamente donde estaba: aquí el mundo no está guardado, está
    // calculado, y cualquier número de más o de menos lo mueve entero.
    const slabCount = 118;
    const slabMat = rockMaterial();
    const slabGeos = [];
    for (let i = 0; i < 7; i++) {
      slabGeos.push(createSlab({ width: 1.5, height: 0.34, depth: 1.15, seed: SEED + 2000 + i, erosion: 0.09 }));
    }
    const slabLotes = slabGeos.map(() => []);
    for (let i = 0; i < slabCount; i++) {
      const t = i / (slabCount - 1);
      const p = curve2d.getPoint(t);
      const tangent = curve2d.getTangent(t);
      const angle = Math.atan2(tangent.x, tangent.y);
      // Dos o tres losas por travesaño, con junta irregular.
      const lanes = 3;
      for (let l = 0; l < lanes; l++) {
        const offset = (l - (lanes - 1) / 2) * (PATH_WIDTH / lanes) + (random() - 0.5) * 0.22;
        const lx = p.x + Math.cos(angle) * offset;
        const lz = p.y - Math.sin(angle) * offset;
        slabLotes[(i * 3 + l) % slabGeos.length].push({
          posicion: new THREE.Vector3(lx, this.groundAt(lx, lz) - 0.14, lz),
          giro: new THREE.Euler(0, angle + (random() - 0.5) * 0.25, 0),
          escala: new THREE.Vector3(1, 0.85 + random() * 0.4, 1),
        });
      }
    }
    this._sembrarInstanciado(slabLotes, slabGeos, slabMat, 'sendero-losas', { sombra: false });

    // Bordillo de cantos a los lados del sendero.
    const kerbMat = rockMaterial({ dark: true });
    const kerbGeos = [];
    for (let i = 0; i < 5; i++) kerbGeos.push(createBoulder({ radius: 0.42, seed: SEED + 2100 + i, detail: 1 }));
    const kerbLotes = kerbGeos.map(() => []);
    for (let i = 0; i < 70; i++) {
      const t = i / 69;
      const p = curve2d.getPoint(t);
      const tangent = curve2d.getTangent(t);
      const angle = Math.atan2(tangent.x, tangent.y);
      for (const side of [-1, 1]) {
        if (random() < 0.28) continue;
        const offset = side * (PATH_WIDTH / 2 + 0.55 + random() * 0.35);
        const lx = p.x + Math.cos(angle) * offset;
        const lz = p.y - Math.sin(angle) * offset;
        kerbLotes[i % kerbGeos.length].push({
          posicion: new THREE.Vector3(lx, this.groundAt(lx, lz) - 0.1, lz),
          giro: new THREE.Euler(random() * 0.3, random() * Math.PI, random() * 0.3),
          escala: new THREE.Vector3().setScalar(0.6 + random() * 0.55),
        });
      }
    }
    this._sembrarInstanciado(kerbLotes, kerbGeos, kerbMat, 'sendero-cantos', { sombra: true, colisiona: true });

    // ---- Mojones ----------------------------------------------------------
    this.milestones = [];
    const n = EXPERIENCE.length;

    EXPERIENCE.forEach((entry, i) => {
      // Se reparten por el tramo útil del camino, dejando aire al principio.
      const t = n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.82;
      const p = curve2d.getPoint(t);
      const tangent = curve2d.getTangent(t);
      const angle = Math.atan2(tangent.x, tangent.y);
      const side = i % 2 === 0 ? 1 : -1;
      const offset = side * (PATH_WIDTH / 2 + 2.6);

      const lx = p.x + Math.cos(angle) * offset;
      const lz = p.y - Math.sin(angle) * offset;
      const ly = this.groundAt(lx, lz);

      // Los mojones crecen conforme se avanza: la trayectoria progresa.
      const height = 5.0 + (i / Math.max(1, n - 1)) * 3.8;
      const stone = stoneMesh(
        createStone({
          width: 2.4,
          height,
          depth: 1.45,
          seed: SEED + 2200 + i * 19,
          detail: 3,
          roundness: 0.26,
          erosion: 0.17,
          facetSharpness: 0.66,
          taper: 0.13,
          lean: side * 0.02,
          dressedFace: 0.85,
        }),
        { name: `mojon-${i}` }
      );
      stone.position.set(lx, ly, lz);
      // Mirando al sendero.
      const facing = Math.atan2(-Math.cos(angle) * side, Math.sin(angle) * side);
      stone.rotation.y = facing;
      this.group.add(stone);

      // Paño labrado en la cara que da al camino: el mojón está trabajado,
      // no es un canto plantado de pie.
      const panel = carvedPanel({
        width: 2.4 * 0.74,
        height: height * 0.56,
        relief: 0.07,
        seed: 2200 + i * 19,
        motif: 'triskel',
        oghamText: '',
        marks: 0,
        segments: 56,
      });
      const panelY = ly + height * 0.56;
      const panelZ = 1.45 * 0.5 + 0.02;
      panel.position.set(lx - Math.sin(facing) * panelZ, panelY, lz - Math.cos(facing) * panelZ);
      panel.rotation.y = facing;
      this.group.add(panel);

      // Runa encendida en el hueco del medallón, no delante de la piedra.
      const anchor = panel.userData.anchors.medallion;
      const runeZ = panelZ + panel.userData.relief * 0.55;
      const rune = glyphDecal(RUNES[runeFor(entry.role + entry.period)], {
        size: anchor.size * 0.80,
        color: PALETTE.lichen,
        intensity: 0.5,
        pulse: 0.3,
        speed: 0.5 + i * 0.1,
        lineWidth: 0.038,
        glow: 0.055,
      });
      rune.position.set(
        lx - Math.sin(facing) * runeZ,
        panelY + anchor.y,
        lz - Math.cos(facing) * runeZ
      );
      rune.rotation.y = facing;
      this.group.add(rune);

      // Periodo flotando sobre el mojón.
      const label = createLabel(entry.period, {
        height: 1.4,
        maxWidth: 6,
        glowColor: '#c3e08a',
        font: '600 56px "Cinzel", Georgia, serif',
        letterSpacing: 5,
        fadeFar: 220,
        minDistance: 6,
      });
      label.position.set(lx, ly + height + 1.5, lz);
      label.userData.uniforms.uOpacity.value = 0.55;
      this.group.add(label);

      // Túmulo al pie: marca el hito también desde lejos y a ras de suelo.
      const cairn = createCairn({ radius: 1.5, height: 2.1, count: 24, seed: SEED + 2300 + i });
      const cx = p.x + Math.cos(angle) * (-side) * (PATH_WIDTH / 2 + 1.5);
      const cz = p.y - Math.sin(angle) * (-side) * (PATH_WIDTH / 2 + 1.5);
      cairn.position.set(cx, this.groundAt(cx, cz), cz);
      this.group.add(cairn);

      // Zona de contacto generosa: el mojón es estrecho.
      const target = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.0, height + 2, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      target.position.set(lx, ly + height / 2, lz);
      this.group.add(target);

      const milestone = { entry, stone, rune, label, target, hover: 0, index: i };
      this.milestones.push(milestone);

      this.addHotspot(target, {
        id: `experience-${i}`,
        title: `${entry.period} · ${entry.role}`,
        kind: 'experience',
        payload: entry,
        milestone,
      });
    });

    // ---- Veta de energía por el eje del sendero --------------------------
    // Se construye en coordenadas de mundo porque sigue el terreno real.
    const start = curve2d.getPoint(0);
    const end = curve2d.getPoint(1);
    const startW = this.localToWorldXZ(start.x, start.y);
    const endW = this.localToWorldXZ(end.x, end.y);
    this.trailLine = createLeyLine(
      this.field,
      new THREE.Vector3(startW.x, 0, startW.z),
      new THREE.Vector3(endW.x, 0, endW.z),
      {
        color: PALETTE.lichen,
        width: 0.20,
        intensity: 0.5,
        speed: 0.10,
        arc: 0.10,
        samples: 110,
        lift: 0.22,
      }
    );
    // Va en mundo: se cuelga fuera del grupo del santuario.
    this.detached = [this.trailLine];

    // Portal de salida en lo alto del camino: el presente.
    const crown = stoneMesh(
      createStone({ width: 2.6, height: 8.5, depth: 1.5, seed: SEED + 2400, detail: 4, roundness: 0.32, erosion: 0.10, taper: 0.12 })
    );
    const crownP = curve2d.getPoint(1);
    crown.position.set(crownP.x, this.groundAt(crownP.x, crownP.y), crownP.y + 3.5);
    this.group.add(crown);

    const crownGlyph = glyphDecal(RUNES.dagaz, {
      size: 2.4,
      color: PALETTE.gold,
      intensity: 0.75,
      pulse: 0.32,
      speed: 0.7,
      lineWidth: 0.03,
      glow: 0.05,
    });
    crownGlyph.position.set(crownP.x, this.groundAt(crownP.x, crownP.y) + 5.0, crownP.y + 2.7);
    this.group.add(crownGlyph);
    this.crownGlyph = crownGlyph;

    // La cámara enfoca el primer tercio: desde ahí el sendero se ve
    // alejarse y subir, que es lo que cuenta la sección. Enfocando el punto
    // medio, el estrado de arranque se quedaba fuera de cuadro.
    const focus = curve2d.getPoint(0.52);
    this.focusOffset.set(focus.x, this.groundAt(focus.x, focus.y) + 5, focus.y);
    return this;
  }

  /**
   * Siembra un lote de transformaciones como mallas instanciadas.
   *
   * Una malla por geometría, porque lo que cuenta el renderizador no son las
   * piedras sino las FORMAS distintas: `InstancedMesh` dibuja muchas copias de
   * una sola malla en una sola llamada, así que 454 piedras repartidas entre
   * doce formas cuestan doce llamadas y no 454.
   *
   * A cambio se pierde el descarte por frustum pieza a pieza —o se dibuja el
   * sendero entero o ninguno—, que aquí no importa: el camino mide cuarenta
   * metros y casi siempre se ve completo.
   *
   * @param {Array<Array<{posicion: THREE.Vector3, giro: THREE.Euler, escala: THREE.Vector3}>>} lotes
   * @param {THREE.BufferGeometry[]} geometrias
   * @param {THREE.Material} material
   * @param {string} nombre
   * @param {{sombra: boolean}} opciones
   */
  _sembrarInstanciado(lotes, geometrias, material, nombre, { sombra, colisiona = false }) {
    const matriz = new THREE.Matrix4();
    const giro = new THREE.Quaternion();
    lotes.forEach((lote, i) => {
      if (!lote.length) return;
      const malla = new THREE.InstancedMesh(geometrias[i], material, lote.length);
      malla.name = `${nombre}-${i}`;
      lote.forEach((t, j) => {
        malla.setMatrixAt(j, matriz.compose(t.posicion, giro.setFromEuler(t.giro), t.escala));
      });
      malla.instanceMatrix.needsUpdate = true;
      malla.castShadow = sombra;
      malla.receiveShadow = true;
      // Lo lee `construirColisionadores`: sin esto, instanciar una piedra es
      // también quitarle el cuerpo.
      malla.userData.colisionaPorInstancia = colisiona;
      this.group.add(malla);
    });
  }

  /**
   * Eje del sendero en coordenadas de mundo. Lo usa el arbolado para plantar
   * a los lados sin tener que conocer la geometría interna de la sección.
   * @param {number} samples
   * @returns {Array<{x: number, z: number}>}
   */
  pathWorldPoints(samples = 24) {
    if (!this.pathCurve) return [];
    const points = [];
    for (let i = 0; i <= samples; i++) {
      const p = this.pathCurve.getPoint(i / samples);
      points.push(this.localToWorldXZ(p.x, p.y));
    }
    return points;
  }

  onUpdate(dt, ctx, activation) {
    const hovered = ctx.hovered?.userData?.hotspot?.milestone ?? null;
    for (const m of this.milestones) {
      const want = hovered === m ? 1 : 0;
      m.hover = damp(m.hover, want, 8, dt);
      m.rune.userData.glyph.uIntensity.value = 0.48 + m.hover * 0.9 + activation * 0.25;
      m.label.userData.uniforms.uOpacity.value = damp(
        m.label.userData.uniforms.uOpacity.value,
        Math.max(0.3 + activation * 0.4, m.hover),
        7,
        dt
      );
    }
    if (this.trailLine) this.trailLine.userData.uniforms.uActive.value = 0.35 + activation * 0.9;
    if (this.crownGlyph) this.crownGlyph.userData.glyph.uIntensity.value = 0.72 + activation * 0.5;
  }
}
