/**
 * III — Las Runas Místicas (Habilidades).
 *
 * Cada habilidad es una runa del futhark antiguo suspendida sobre el estrado.
 * Orbitan en anillos por familia y giran sobre el eje Y para encarar siempre
 * a quien mira: una runa de canto no se lee.
 *
 * El nivel de la habilidad no se escribe en ninguna parte — se ve: runa más
 * grande, más brillo y órbita más alta.
 */

import * as THREE from 'three';
import { Shrine } from './Shrine.js';
import { createStone, stoneMesh } from '../models/StoneFactory.js';
import { glyphTubes, glyphDecal } from '../vfx/Glyphs.js';
import { arcaneMaterial, haloMaterial } from '../vfx/materials.js';
import { createLabel } from '../vfx/Label3D.js';
import { RUNES, runeFor, triskelion } from '../utils/runes.js';
import { SKILLS } from '../content.js';
import { PALETTE, SEED } from '../config.js';
import { damp, lerp } from '../utils/noise.js';

export class SkillsShrine extends Shrine {
  build() {
    this.buildBase({
      motif: 'knot',
      beaconHeight: 50,
      beaconRadius: 3.4,
      labelHeight: 3.6,
      labelY: 16.5,
      seed: 14,
    });

    // ---- Núcleo: cristal suspendido --------------------------------------
    const coreMat = arcaneMaterial({
      color: PALETTE.arcane,
      intensity: 0.62,
      pulse: 0.25,
      speed: 1.1,
      rim: 2.0,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), coreMat);
    this.core.position.set(0, 9.5, 0);
    this.group.add(this.core);

    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 2),
      haloMaterial({ color: PALETTE.arcane, intensity: 0.38, power: 2.9 })
    );
    halo.position.copy(this.core.position);
    this.group.add(halo);
    this.coreHalo = halo;

    this.coreLight = new THREE.PointLight(PALETTE.arcane, 18, 40, 2);
    this.coreLight.position.copy(this.core.position);
    this.group.add(this.coreLight);

    // ---- Runas por familia ------------------------------------------------
    const families = [...new Set(SKILLS.map((s) => s.family))];
    this.runes = [];

    families.forEach((family, fi) => {
      const members = SKILLS.filter((s) => s.family === family);
      const radius = 5.0 + fi * 3.6;
      const height = 6.0 + fi * 1.9;
      const direction = fi % 2 === 0 ? 1 : -1;

      members.forEach((skill, i) => {
        const angle = (i / members.length) * Math.PI * 2 + fi * 0.4;
        const runeName = runeFor(skill.name + family);
        const scale = lerp(0.9, 1.6, skill.level);
        const color = fi === 0 ? PALETTE.arcane : fi === 1 ? PALETTE.gold : PALETTE.arcaneDeep;

        const rune = glyphTubes(RUNES[runeName], {
          scale,
          radius: 0.055,
          color,
          intensity: lerp(0.70, 1.35, skill.level),
          radialSegments: 6,
        });

        const holder = new THREE.Group();
        holder.add(rune);

        // Zona de contacto: los tubos son finos y no se acierta con el ratón.
        const target = new THREE.Mesh(
          new THREE.SphereGeometry(scale * 0.78, 10, 8),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        holder.add(target);

        const glowShell = new THREE.Mesh(
          new THREE.SphereGeometry(scale * 0.95, 16, 12),
          haloMaterial({ color, intensity: 0.16 + skill.level * 0.22, power: 3.4 })
        );
        holder.add(glowShell);

        this.group.add(holder);

        const label = createLabel(skill.name, {
          height: 0.95,
          maxWidth: 4.5,
          glowColor: `#${new THREE.Color(color).getHexString()}`,
          font: '600 56px "Cinzel", Georgia, serif',
          letterSpacing: 4,
          fadeFar: 200,
          minDistance: 6,
        });
        label.position.y = -scale * 0.95;
        label.userData.uniforms.uOpacity.value = 0;
        holder.add(label);

        const entry = {
          skill,
          holder,
          rune,
          glowShell,
          label,
          angle,
          radius,
          height,
          direction,
          speed: 0.055 * direction * (1 + fi * 0.18),
          bob: 0.5 + (i % 3) * 0.22,
          phase: i * 1.3 + fi * 2.1,
          hover: 0,
          baseIntensity: lerp(0.70, 1.35, skill.level),
          color,
        };
        this.runes.push(entry);

        this.addHotspot(target, {
          id: `skill-${skill.name}`,
          title: skill.name,
          kind: 'skill',
          payload: { ...skill, rune: runeName },
          entry,
        });
      });
    });

    // ---- Piedras rúnicas de fondo ----------------------------------------
    // El arco de menhires con la runa grabada cierra la composición y da
    // escala a lo que flota.
    const backCount = Math.min(7, Math.max(4, Math.ceil(families.length * 2)));
    for (let i = 0; i < backCount; i++) {
      const a = -Math.PI * 0.42 + (i / (backCount - 1)) * Math.PI * 0.84;
      const r = 17.5;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const height = 5.4 + ((i * 29) % 13) / 6;
      const stone = stoneMesh(
        createStone({
          width: 2.2,
          height,
          depth: 1.3,
          seed: SEED + 1200 + i * 17,
          detail: 3,
          roundness: 0.33,
          erosion: 0.12,
          taper: 0.11,
        })
      );
      const facing = Math.atan2(-x, -z);
      stone.position.set(x, 0.3, z);
      stone.rotation.y = facing;
      this.group.add(stone);

      const skill = SKILLS[i % SKILLS.length];
      const carved = glyphDecal(RUNES[runeFor(skill.name + 'stone')], {
        size: 2.2,
        color: PALETTE.arcaneDeep,
        intensity: 0.42,
        pulse: 0.3,
        speed: 0.45 + (i % 4) * 0.12,
        lineWidth: 0.035,
        glow: 0.05,
      });
      carved.position.set(x - Math.sin(facing) * 0.8, height * 0.55, z - Math.cos(facing) * 0.8);
      carved.rotation.y = facing;
      this.group.add(carved);
    }

    // Nudo grabado grande delante del estrado.
    const seal = glyphDecal(triskelion({ arms: 3, turns: 2.0, radius: 0.42 }), {
      size: 6.5,
      color: PALETTE.arcane,
      intensity: 0.38,
      pulse: 0.25,
      speed: 0.35,
      lineWidth: 0.008,
      glow: 0.02,
      texSize: 1024,
    });
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(0, 0.33, 8.5);
    this.group.add(seal);

    // Aquí había un cerco de cantos sueltos, uno por santuario. La intención era
    // que el prado no quedase barrido, pero al repartirlos a radio casi constante
    // desde el estrado salía justo lo contrario: un anillo regular, legible desde
    // arriba como un segundo borde concéntrico rodeando cada zona. Lo que ensucia
    // el suelo de verdad es el pedregal de la isla (`World._scatterRocks`), que
    // siembra al azar y esquiva enlosados y caminos; ese sigue ahí.

    this.focusOffset.set(0, 8, 0);
    return this;
  }

  onUpdate(dt, ctx, activation) {
    const t = ctx.elapsed;
    const hoveredEntry = ctx.hovered?.userData?.hotspot?.entry ?? null;

    // El núcleo respira y gira despacio sobre dos ejes.
    this.core.rotation.y += dt * 0.22;
    this.core.rotation.x += dt * 0.09;
    const breathe = 1 + Math.sin(t * 0.9) * 0.05 + activation * 0.12;
    this.core.scale.setScalar(breathe);
    this.coreHalo.scale.setScalar(breathe * (1 + activation * 0.15));
    this.coreLight.intensity = 14 + activation * 16 + Math.sin(t * 1.7) * 3;

    for (const r of this.runes) {
      r.angle += dt * r.speed;
      const hoverWant = hoveredEntry === r ? 1 : 0;
      r.hover = damp(r.hover, hoverWant, 8, dt);

      // Al resaltarse, la runa sale de la órbita hacia fuera y sube.
      const radius = r.radius + r.hover * 1.4;
      const y = r.height + Math.sin(t * r.bob + r.phase) * 0.45 + r.hover * 1.1;
      r.holder.position.set(Math.cos(r.angle) * radius, y, Math.sin(r.angle) * radius);

      // Encarar a la cámara girando solo en Y: la runa nunca se tumba.
      const camLocal = this.group.worldToLocal(ctx.camera.position.clone());
      const dx = camLocal.x - r.holder.position.x;
      const dz = camLocal.z - r.holder.position.z;
      const want = Math.atan2(dx, dz);
      r.holder.rotation.y = damp(r.holder.rotation.y, r.holder.rotation.y + wrapAngle(want - r.holder.rotation.y), 6, dt);

      r.holder.scale.setScalar(1 + r.hover * 0.22 + activation * 0.06);

      const mat = r.rune.userData.material;
      mat.userData.uniforms.uIntensity.value = r.baseIntensity * (1 + activation * 0.35 + r.hover * 0.9);
      r.glowShell.material.userData.uniforms.uIntensity.value = 0.14 + r.hover * 0.55 + activation * 0.12;
      r.label.userData.uniforms.uOpacity.value = damp(
        r.label.userData.uniforms.uOpacity.value,
        Math.max(r.hover, activation * 0.45),
        7,
        dt
      );
    }
  }
}

/** Devuelve el ángulo equivalente en (-π, π]. Evita el giro largo. */
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
