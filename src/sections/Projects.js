/**
 * II — El Círculo de Monolitos (Proyectos).
 *
 * Un monolito por proyecto, en corro sobre un estrado grande. Cada piedra
 * proyecta su lámina hacia el centro, así que desde dentro del círculo se ven
 * todas a la vez, que es la postal de la referencia.
 */

import * as THREE from 'three';
import { Shrine } from './Shrine.js';
import { createStone, stoneMesh } from '../models/StoneFactory.js';
import { createTrilithon } from '../models/Megaliths.js';
import { createHoloPanel, createProjectorBeam } from '../vfx/HoloPanel.js';
import { createLabel } from '../vfx/Label3D.js';
import { posterCanvas, POSTER_ASPECT } from '../utils/posters.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { triskelion } from '../utils/runes.js';
import { PROJECTS } from '../content.js';
import { PALETTE, SEED } from '../config.js';
import { damp } from '../utils/noise.js';

/**
 * El cartel generativo, envuelto para pegarlo en un monolito.
 *
 * Son cuatro líneas y viven aquí en vez de en `utils/posters.js` porque son
 * las únicas que necesitan three: dejándolas allí, la página ligera —que pinta
 * los mismos carteles en sus fichas— se descargaba el motor entero para nada.
 */
function posterTexture(options) {
  const tex = new THREE.CanvasTexture(posterCanvas(options));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const CIRCLE_RADIUS = 14.5;
const MONOLITH_HEIGHT = 10.2;

export class ProjectsShrine extends Shrine {
  build() {
    this.buildBase({
      motif: 'triskel',
      beaconHeight: 58,
      beaconRadius: 4.2,
      labelHeight: 4.2,
      labelY: 26,
      seed: 8,
    });

    this.stations = [];
    const count = PROJECTS.length;

    for (let i = 0; i < count; i++) {
      const project = PROJECTS[i];
      // El hueco de la entrada queda libre: el corro se abre hacia el trilito.
      const a = (i / count) * Math.PI * 2 + Math.PI / count + Math.PI;
      const x = Math.cos(a) * CIRCLE_RADIUS;
      const z = Math.sin(a) * CIRCLE_RADIUS;
      // Mirando al centro.
      const facing = Math.atan2(-x, -z);

      const height = MONOLITH_HEIGHT * (0.86 + ((i * 37) % 11) / 34);
      const monolith = stoneMesh(
        createStone({
          width: 3.2,
          height,
          depth: 2.0,
          seed: SEED + 600 + i * 13,
          detail: 3,
          // Ortostato de cantera: canto recogido pero recto, paños marcados y
          // apenas estrechamiento. El corro tiene que leerse como piedra
          // levantada por alguien, no como un diente.
          roundness: 0.26,
          erosion: 0.13,
          taper: 0.09,
          lean: (((i % 3) - 1) * 0.012),
        }),
        { name: `monolito-${project.id}` }
      );
      monolith.position.set(x, 0.3, z);
      monolith.rotation.y = facing + (((i * 17) % 7) - 3) * 0.02;
      this.group.add(monolith);

      // Lámina proyectada, inclinada hacia el centro del círculo.
      const texture = posterTexture(project.poster ?? { seed: 100 + i * 11, hue: (i * 47) % 360 });
      const panel = createHoloPanel(texture, {
        width: 6.2,
        aspect: POSTER_ASPECT,
        color: PALETTE.arcane,
        reveal: 0,
      });
      const panelHolder = new THREE.Group();
      panelHolder.position.set(x * 0.86, height + 4.4, z * 0.86);
      panelHolder.rotation.y = facing;
      panel.rotation.x = -0.16;
      panelHolder.add(panel);
      this.group.add(panelHolder);

      // Haz desde la punta del monolito hasta la lámina.
      const beam = createProjectorBeam({ length: 5.0, radius: 1.5, color: PALETTE.arcane });
      beam.position.set(x, height + 0.2, z);
      beam.lookAt(panelHolder.position.clone().setY(panelHolder.position.y));
      beam.rotateX(Math.PI / 2);
      this.group.add(beam);

      // Rótulo del proyecto: apagado hasta que el puntero se acerca.
      const title = createLabel(project.title, {
        height: 1.35,
        maxWidth: 7,
        glowColor: '#7ef2e6',
        font: '600 64px "Cinzel", Georgia, serif',
        letterSpacing: 6,
        fadeFar: 260,
        minDistance: 8,
      });
      title.position.set(x * 0.86, height + 1.1, z * 0.86);
      title.userData.uniforms.uOpacity.value = 0;
      this.group.add(title);

      // Espiral en la base del monolito: numera la estación del círculo.
      const mark = glyphDecal(triskelion({ arms: 3, turns: 1.6 + (i % 3) * 0.5, radius: 0.4 }), {
        size: 3.0,
        color: PALETTE.arcane,
        intensity: 0.34,
        pulse: 0.35,
        speed: 0.4 + (i % 5) * 0.12,
        lineWidth: 0.014,
        glow: 0.03,
      });
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x * 0.86, 0.34, z * 0.86);
      this.group.add(mark);

      const station = {
        project,
        monolith,
        panel,
        panelHolder,
        beam,
        title,
        mark,
        hover: 0,
        reveal: 0,
        baseY: panelHolder.position.y,
        phase: i * 0.7,
      };
      this.stations.push(station);

      // Toda la estación responde: la piedra y la lámina son el mismo botón.
      const data = {
        id: `project-${project.id}`,
        title: project.title,
        kind: 'project',
        payload: project,
        station,
      };
      this.addHotspot(monolith, data);
      this.addHotspot(panel, data);
    }

    // ---- Puerta de entrada ------------------------------------------------
    const gate = createTrilithon({ height: 9.5, gap: 4.2, postWidth: 2.2, postDepth: 1.6, seed: SEED + 71 });
    gate.position.set(0, 0.3, CIRCLE_RADIUS + 4.0);
    this.group.add(gate);
    this.gate = gate;

    // ---- Piedras caídas ---------------------------------------------------
    // Aquí había un cerco de cantos sueltos, uno por santuario. La intención era
    // que el prado no quedase barrido, pero al repartirlos a radio casi constante
    // desde el estrado salía justo lo contrario: un anillo regular, legible desde
    // arriba como un segundo borde concéntrico rodeando cada zona — y en esta
    // sección, además, doblaba al propio círculo de menhires. Lo que ensucia el
    // suelo de verdad es el pedregal de la isla (`World._scatterRocks`), que
    // siembra al azar y esquiva enlosados y caminos; ese sigue ahí.

    // Una piedra derribada, para que el círculo no se vea recién construido.
    const fallen = stoneMesh(
      createStone({ width: 2.4, height: 7.0, depth: 1.5, seed: SEED + 777, detail: 3, roundness: 0.3, erosion: 0.11 }),
      { name: 'monolito-caido' }
    );
    fallen.position.set(-CIRCLE_RADIUS * 0.72, 0.9, CIRCLE_RADIUS * 0.72);
    fallen.rotation.set(Math.PI / 2 - 0.08, 0.9, 0.12);
    this.group.add(fallen);

    this.focusOffset.set(0, 11, 0);
    return this;
  }

  /** Marca una estación como resaltada por el puntero. */
  setHovered(object) {
    this._hovered = object;
  }

  onUpdate(dt, ctx, activation) {
    const hovered = ctx.hovered?.userData?.hotspot?.station ?? null;

    for (const s of this.stations) {
      // Las láminas se revelan al acercarse. El umbral es generoso: desde
      // el mirador de bienvenida el círculo ya tiene que leerse como una
      // galería, no como un montón de piedras con rayas encima.
      const d = ctx.camera.position.distanceTo(this.group.position);
      const wantReveal = activation > 0.05 ? 1 : 1 - THREE.MathUtils.smoothstep(d, 190, 280);
      s.reveal = damp(s.reveal, Math.max(activation, wantReveal), 2.2, dt);
      s.panel.userData.uniforms.uReveal.value = s.reveal;
      s.panel.userData.uniforms.uActive.value = activation;

      const wantHover = hovered === s ? 1 : 0;
      s.hover = damp(s.hover, wantHover, 9, dt);
      s.panel.userData.uniforms.uHover.value = s.hover;
      s.title.userData.uniforms.uOpacity.value = Math.max(s.hover, activation * 0.35);

      // La lámina encara siempre a quien mira, girando solo en Y. Orientada
      // de forma fija hacia el centro del corro, desde fuera se veía de canto
      // y quedaba reducida a una raya.
      const camLocal = this.group.worldToLocal(ctx.camera.position.clone());
      const want = Math.atan2(
        camLocal.x - s.panelHolder.position.x,
        camLocal.z - s.panelHolder.position.z
      );
      let delta = want - s.panelHolder.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      s.panelHolder.rotation.y = damp(
        s.panelHolder.rotation.y,
        s.panelHolder.rotation.y + delta,
        4.5,
        dt
      );

      // Flotación individual y avance hacia el centro al resaltarse.
      const t = ctx.elapsed + s.phase;
      s.panelHolder.position.y = s.baseY + Math.sin(t * 0.7) * 0.22 + s.hover * 0.9;
      s.panelHolder.scale.setScalar(1 + s.hover * 0.10);
      s.beam.userData.uniforms.uIntensity.value = 0.35 + s.hover * 0.9 + activation * 0.3;
      s.mark.userData.glyph.uIntensity.value = 0.32 + s.hover * 0.8 + activation * 0.25;
    }
  }
}
