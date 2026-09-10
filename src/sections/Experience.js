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
import { createIslaFlotante, islaWalkways, ISLA_RADIO } from '../models/IslaFlotante.js';
import {
  createEscalinataIsla,
  escalinataCurva,
  escalinataWalkways,
  ENTRADA,
  U_DESPEGUE,
} from '../models/EscalinataIsla.js';
import { RUNES, runeFor } from '../utils/runes.js';
import { EXPERIENCE } from '../content.js';
import { PALETTE, SEED } from '../config.js';
import { damp, makeRandom } from '../utils/noise.js';

// El largo del recorrido lo manda ahora `escalinataCurva`; aquí sólo queda el
// ancho, que es lo que separa los mojones del borde de los peldaños.
const PATH_WIDTH = 3.2;

/** Cuánto vuela la cubierta de la isla sobre el prado del final del camino. */
const ISLA_VUELO = 30;

/**
 * Desplazamiento de la isla más allá del final del tramo de tierra.
 *
 * Lo mandan dos cosas. La pendiente: con la isla a seis metros del prado había
 * que subir veintiún metros en seis de avance, una escalera de setenta grados,
 * que no es una escalera.
 *
 * Y que se despegue de la isla grande. A treinta y siete metros la peña quedaba
 * pegada al acantilado y se leía como un saliente del promontorio, no como algo
 * que flota. Lo que hace que una isla flotante flote no es su altura: es que
 * haya cielo alrededor y por debajo, y para eso hay que sacarla del contorno de
 * la otra. A sesenta hay mar entre las dos.
 */
const ISLA_AVANCE = ISLA_RADIO + 44;

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
  // Delega en la de la escalinata y no duplica los puntos.
  //
  // Tenerlos dos veces parecía inocente y no lo era: `SplineCurve` interpola
  // por Catmull-Rom, así que añadir los cuatro puntos del vuelo CAMBIA la curva
  // en el tramo de tierra que comparten —la tangente del último punto ya no es
  // la misma— y el veto del arbolado y los mojones se habrían quedado unos
  // metros al lado de los peldaños que dicen proteger.
  return escalinataCurva(ISLA_AVANCE);
}

/** El final del tramo que pisa tierra, en local. */
export function finDeTierra() {
  return escalinataCurva(ISLA_AVANCE).getPoint(U_DESPEGUE);
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
    // Todo el recorrido, vuelo incluido: bajo los peldaños que van por el aire
    // tampoco puede crecer un roble que los tape desde abajo.
    const p = curve.getPoint(i / samples);
    zonas.push({
      x: def.anchor[0] + cos * p.x + sin * p.y,
      z: def.anchor[2] - sin * p.x + cos * p.y,
      radius,
    });
  }
  return zonas;
}

/**
 * El claro bajo la isla.
 *
 * Los árboles se plantan sobre el terreno y la isla vuela veintiún metros por
 * encima, así que sobre el papel no se estorban. En pantalla sí: un carballo de
 * quince metros justo debajo se mete entre la cámara y la isla y la parte por
 * la mitad, y desde el suelo tapa entera la única pieza del portafolio que está
 * en el aire.
 *
 * Dejar el claro hace además que la isla se lea como lo que es. Una sombra
 * redonda sobre la hierba vacía dice «hay algo ahí arriba» mejor que la isla
 * misma.
 */
export function islaKeepOut(def, { radius = ISLA_RADIO + 4 } = {}) {
  const p = finDeTierra();
  const cos = Math.cos(def.facing);
  const sin = Math.sin(def.facing);
  const lx = p.x;
  const lz = p.y + ISLA_AVANCE;
  return [
    {
      x: def.anchor[0] + cos * lx + sin * lz,
      z: def.anchor[2] - sin * lx + cos * lz,
      radius,
    },
  ];
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

    // ---- La escalinata ----------------------------------------------------
    //
    // Antes esto eran 354 losas instanciadas siguiendo el terreno. Se van con
    // el sendero: lo que sube ahora es una escalinata de peldaños de altura
    // constante que, pasado el último mojón, se despega del suelo y trepa hasta
    // la cubierta de la isla. La geometría y el porqué, en `EscalinataIsla.js`.
    const finTierra = curve2d.getPoint(U_DESPEGUE);
    const cotaCubierta = this.groundAt(finTierra.x, finTierra.y) + ISLA_VUELO;
    const { grupo: escalinata, plan: planEscalinata } = createEscalinataIsla({
      groundAt: (x, z) => this.groundAt(x, z),
      alturaCubierta: cotaCubierta,
      avanceIsla: ISLA_AVANCE,
      centroIsla: { x: finTierra.x, z: finTierra.y + ISLA_AVANCE },
      radioIsla: ISLA_RADIO,
      seed: SEED + 2600,
    });
    this.group.add(escalinata);
    this.escalinata = escalinata;
    this.planEscalinata = planEscalinata;

    // ---- Mojones ----------------------------------------------------------
    this.milestones = [];
    const n = EXPERIENCE.length;

    EXPERIENCE.forEach((entry, i) => {
      // Se reparten por el tramo útil del camino, dejando aire al principio.
      // Repartidos por el tramo de tierra, no por toda la curva: con el vuelo
      // dentro, el mojón de la etapa actual se plantaba en el aire.
      const t = (n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.82) * U_DESPEGUE;
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

    // ---- La veta de luz, por el eje de la escalinata ----------------------
    //
    // Antes se construía en mundo porque seguía el terreno real. Ya no puede:
    // la mitad de la escalinata va por el aire, y una veta pegada al campo de
    // alturas se quedaría en el prado mientras los peldaños se van al cielo.
    //
    // Se traza sobre los peldaños ya calculados —el mismo perfil, un palmo por
    // encima de la huella— y vive DENTRO del grupo del santuario, en local, que
    // es donde vive la escalinata. Colgarla de `detached` la habría dejado en
    // coordenadas de mundo, girada respecto a lo que quiere iluminar.
    const veta = planEscalinata.peldanos.map((e) => new THREE.Vector3(e.x, e.y + 0.16, e.z));
    this.trailLine = createLeyLine(null, null, null, {
      color: PALETTE.arcane,
      width: 0.5,
      intensity: 0.85,
      speed: 0.13,
      points: veta,
    });
    this.group.add(this.trailLine);

    // Y dos hilos por los bordes, más finos y más apagados.
    //
    // Con la veta central sola, de frente la escalinata era una cinta de piedra
    // con una raya en medio; el dibujo de la referencia es la ESCALERA la que
    // brilla, no una línea pintada encima. Los bordes son los que dan el canto
    // de luz que la recorta contra el cielo en el tramo volado.
    this.trailEdges = [];
    for (const lado of [-1, 1]) {
      const hilo = planEscalinata.peldanos.map((e, i) => {
        const sig = planEscalinata.peldanos[Math.min(i + 1, planEscalinata.peldanos.length - 1)];
        const dx = sig.x - e.x;
        const dz = sig.z - e.z;
        const l = Math.hypot(dx, dz) || 1;
        return new THREE.Vector3(e.x + (dz / l) * lado * 2.0, e.y + 0.1, e.z - (dx / l) * lado * 2.0);
      });
      const linea = createLeyLine(null, null, null, {
        color: PALETTE.arcane,
        width: 0.24,
        intensity: 0.45,
        speed: 0.1,
        points: hilo,
      });
      this.group.add(linea);
      this.trailEdges.push(linea);
    }

    // Portal de salida en lo alto del camino: el presente.
    const crown = stoneMesh(
      createStone({ width: 2.6, height: 8.5, depth: 1.5, seed: SEED + 2400, detail: 4, roundness: 0.32, erosion: 0.10, taper: 0.12 })
    );
    const crownP = curve2d.getPoint(U_DESPEGUE);
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

    // ---- La isla flotante: adónde lleva el camino -------------------------
    //
    // El sendero subía 11 m y se acababa en el prado. La isla es su destino, y
    // va DETRÁS del menhir del presente y por encima: se ve desde abajo durante
    // todo el ascenso, que es la mitad de lo que hace que se quiera subir.
    //
    // No es terreno y no puede serlo —el campo de alturas guarda una elevación
    // por (x, z)— así que es un modelo suelto. Ver la nota de `IslaFlotante.js`.
    const isla = createIslaFlotante({ base: cotaCubierta, entrada: ENTRADA });
    isla.position.x = finTierra.x;
    isla.position.z = finTierra.y + ISLA_AVANCE;
    this.group.add(isla);
    this.isla = isla;
    this.islaLocal = { x: isla.position.x, z: isla.position.z };
    this.cotaCubierta = cotaCubierta;

    // La cámara enfoca el primer tercio: desde ahí el sendero se ve
    // alejarse y subir, que es lo que cuenta la sección. Enfocando el punto
    // medio, el estrado de arranque se quedaba fuera de cuadro.
    const focus = curve2d.getPoint(0.52 * U_DESPEGUE);
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
  /**
   * Lo que se puede pisar de esta sección, en coordenadas de MUNDO.
   *
   * Va aquí y no en el mundo porque el trazado lo calcula el santuario, y va en
   * mundo porque el campo de alturas no sabe de santuarios.
   */
  walkways() {
    if (!this.planEscalinata) return [];
    const aMundo = (x, z) => this.localToWorldXZ(x, z);
    // `localToWorldXZ` sólo convierte la planta; la altura la lleva el propio
    // grupo, y hay que sumarla a mano o las pasarelas quedan bajo tierra.
    const dy = this.group.position.y;
    const centro = aMundo(this.islaLocal.x, this.islaLocal.z);
    return [
      ...escalinataWalkways(this.planEscalinata, aMundo, { dy }),
      ...islaWalkways(centro, this.cotaCubierta + dy),
    ];
  }

  pathWorldPoints(samples = 24) {
    if (!this.pathCurve) return [];
    const points = [];
    for (let i = 0; i <= samples; i++) {
      const p = this.pathCurve.getPoint((i / samples) * U_DESPEGUE);
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
    for (const l of this.trailEdges ?? []) l.userData.uniforms.uActive.value = 0.22 + activation * 0.6;
    if (this.crownGlyph) this.crownGlyph.userData.glyph.uIntensity.value = 0.72 + activation * 0.5;
  }
}
