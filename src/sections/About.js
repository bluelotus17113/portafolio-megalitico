/**
 * I — La Estela de Inscripciones (Sobre mí).
 *
 * Una piedra ogham en pie sobre un estrado pequeño, flanqueada por dos
 * menhires menores y un banco de lectura. El ogham del canto se genera de
 * verdad a partir del lema en `content.js`: no es un adorno inventado.
 */

import * as THREE from 'three';
import { Shrine } from './Shrine.js';
import { createStone, createSlab, stoneMesh, rockMaterial } from '../models/StoneFactory.js';
import { carvedPanel } from '../models/Carving.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { oghamStrokes } from '../utils/ogham.js';
import { triskelion, rosette } from '../utils/runes.js';
import { IDENTITY, ABOUT } from '../content.js';
import { SEED } from '../config.js';

const STELA = { width: 3.4, height: 11.5, depth: 1.7 };

export class AboutShrine extends Shrine {
  build() {
    this.buildBase({
      motif: 'triskel',
      beaconHeight: 40,
      beaconRadius: 2.4,
      labelY: 17.5,
      seed: 3,
    });

    // ---- Estela principal -------------------------------------------------
    const stelaGeo = createStone({
      ...STELA,
      seed: SEED + 41,
      detail: 4,
      // Cantos vivos y facetas marcadas: la referencia es piedra PARTIDA, con
      // planos de fractura rectos, no un canto rodado. Con la redondez que
      // llevaba, la estela se leía como un guijarro gigante.
      roundness: 0.24,
      erosion: 0.16,
      facetSharpness: 0.72,
      taper: 0.14,
      lean: 0.012,
      // Frente aplanado a cincel: es lo que recibe el paño labrado. El canto y
      // la coronación siguen en bruto, y ese contraste es medio efecto.
      dressedFace: 0.9,
    });
    const stela = stoneMesh(stelaGeo, { name: 'estela' });
    stela.position.set(0, 0.3, -0.4);
    stela.rotation.y = 0.06;
    this.group.add(stela);
    this.stela = stela;

    // ---- Paño labrado -----------------------------------------------------
    const motto = (IDENTITY.oghamMotto || IDENTITY.name || 'ainm').replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ ]/g, '');

    const PANEL = { w: STELA.width * 0.86, h: STELA.height * 0.76 };
    const panel = carvedPanel({
      width: PANEL.w,
      height: PANEL.h,
      relief: 0.11,
      seed: 41,
      motif: 'knot',
      oghamText: motto,
      marks: 2,
    });
    // Centro del paño sobre el fuste, dejando aire arriba y abajo.
    const panelY = STELA.height * 0.50 + 0.3;
    panel.position.set(0, panelY, STELA.depth * 0.5 + 0.02);
    panel.rotation.y = 0.06;
    this.group.add(panel);
    this.panel = panel;

    // ---- Luz arcana DENTRO de los surcos ----------------------------------
    // Las posiciones salen del propio panel, no de una cuenta paralela: así el
    // resplandor sale del hueco tallado en vez de flotar delante de la piedra.
    const anchors = panel.userData.anchors;
    const faceZ = STELA.depth * 0.5 + 0.02 + panel.userData.relief * 0.55;

    const segments = oghamStrokes(motto, {
      length: 0.86,
      stroke: 0.20,
      gap: 0.062,
      space: 0.115,
    });
    const oghamPaths = [
      // El druim: la arista sobre la que se escribe.
      [[0, -0.47], [0, 0.47]],
      ...segments.map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y1]]),
    ];
    const ogham = glyphDecal(oghamPaths, {
      size: anchors.ogham.size,
      color: this.def.color,
      intensity: 0.42,
      pulse: 0.22,
      speed: 0.8,
      lineWidth: 0.0075,
      glow: 0.016,
      texSize: 1024,
    });
    ogham.position.set(0, panelY + anchors.ogham.y, faceZ);
    ogham.rotation.y = 0.06;
    this.group.add(ogham);
    this.ogham = ogham;
    this.glow.push(ogham);

    // La roseta del medallón, encendida en su propio surco. Los parámetros son
    // los MISMOS con los que `carvedPanel` la talla: si se separan, la luz deja
    // de caer dentro del hueco.
    const spiral = glyphDecal(rosette({ arms: 7, radius: 0.40, inner: 0.135, sweep: 1.15 }), {
      size: anchors.medallion.size,
      color: this.def.color,
      intensity: 0.52,
      pulse: 0.3,
      speed: 0.6,
      lineWidth: 0.016,
      glow: 0.034,
    });
    spiral.position.set(0, panelY + anchors.medallion.y, faceZ);
    spiral.rotation.y = 0.06;
    this.group.add(spiral);

    // ---- Menhires flanqueantes -------------------------------------------
    const flankParams = [
      { x: -6.2, z: 2.4, h: 6.4, rot: -0.5, seed: 12 },
      { x: 6.0, z: 2.9, h: 5.6, rot: 0.7, seed: 27 },
    ];
    for (const f of flankParams) {
      const geo = createStone({
        width: 2.0,
        height: f.h,
        depth: 1.2,
        seed: SEED + f.seed,
        detail: 3,
        roundness: 0.28,
        erosion: 0.18,
        facetSharpness: 0.66,
        taper: 0.13,
        lean: (f.x > 0 ? -1 : 1) * 0.03,
        dressedFace: 0.85,
      });
      const mesh = stoneMesh(geo);
      mesh.position.set(f.x, 0.28, f.z);
      mesh.rotation.y = f.rot;
      this.group.add(mesh);

      // Paño labrado sin inscripción: solo el medallón. Los flanqueantes
      // acompañan a la estela, no compiten con ella.
      // Paño más pequeño que el de la estela y con poco vuelo: el menhir se
      // estrecha hacia arriba, y un paño ancho asomaba por el canto de la
      // piedra y se leía como una pegatina con contorno.
      const side = carvedPanel({
        width: 2.0 * 0.60,
        height: f.h * 0.44,
        relief: 0.055,
        seed: f.seed,
        motif: 'triskel',
        oghamText: '',
        marks: 0,
      });
      const sy = f.h * 0.56;
      const sz = 1.2 * 0.5 + 0.02;
      side.position.set(f.x + Math.sin(f.rot) * sz, sy, f.z + Math.cos(f.rot) * sz);
      side.rotation.y = f.rot;
      this.group.add(side);

      const anchor = side.userData.anchors.medallion;
      const glowZ = sz + side.userData.relief * 0.55;
      const knot = glyphDecal(triskelion({ arms: 3, turns: 2.4, radius: 0.42 }), {
        size: anchor.size,
        color: this.def.color,
        intensity: 0.48,
        pulse: 0.35,
        speed: 0.5 + (f.x > 0 ? 0.25 : 0),
        lineWidth: 0.018,
        glow: 0.036,
      });
      knot.position.set(
        f.x + Math.sin(f.rot) * glowZ,
        sy + anchor.y,
        f.z + Math.cos(f.rot) * glowZ
      );
      knot.rotation.y = f.rot;
      this.group.add(knot);
    }

    // ---- Banco de lectura -------------------------------------------------
    const bench = new THREE.Mesh(
      createSlab({ width: 5.4, height: 0.75, depth: 1.5, seed: SEED + 55 }),
      rockMaterial()
    );
    bench.position.set(0, 0.3, 6.4);
    bench.castShadow = true;
    bench.receiveShadow = true;
    this.group.add(bench);

    // Aquí había un cerco de cantos sueltos, uno por santuario. La intención era
    // que el prado no quedase barrido, pero al repartirlos a radio casi constante
    // desde el estrado salía justo lo contrario: un anillo regular, legible desde
    // arriba como un segundo borde concéntrico rodeando cada zona. Lo que ensucia
    // el suelo de verdad es el pedregal de la isla (`World._scatterRocks`), que
    // siembra al azar y esquiva enlosados y caminos; ese sigue ahí.

    // ---- Interacción ------------------------------------------------------
    this.addHotspot(stela, {
      id: 'about',
      title: ABOUT.title,
      kind: 'about',
      payload: ABOUT,
    });

    // Foco propio rasante: la estela es lo que hay que ver, y con solo la
    // luz cenital del sol el grabado se comía la piedra que lo sostiene.
    const key = new THREE.PointLight(0xfff0d6, 22, 26, 2);
    key.position.set(2.6, 7.5, 4.2);
    this.group.add(key);

    this.focusOffset.set(0, 6.5, 1.5);
    return this;
  }

  onUpdate(dt, ctx, activation) {
    // Al enfocar la sección, la inscripción se revela de abajo arriba.
    if (this.ogham) {
      const u = this.ogham.userData.glyph;
      u.uIntensity.value = 0.40 + activation * 0.35;
    }
  }
}
