/**
 * V — El Altar de Mensajes (Contacto).
 *
 * Un dolmen con el brasero encendido bajo la tapa, y alrededor una piedra por
 * canal de contacto. El fuego es el único punto cálido del promontorio: todo
 * lo demás brilla en turquesa, así que el altar se localiza de un vistazo.
 */

import * as THREE from 'three';
import { Shrine } from './Shrine.js';
import { createStone, createSlab, stoneMesh, rockMaterial } from '../models/StoneFactory.js';
import { createDolmen, createBasin } from '../models/Megaliths.js';
import { createFire, createSmoke } from '../vfx/Fire.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { createLabel } from '../vfx/Label3D.js';
import { RUNES, runeFor, knotRing } from '../utils/runes.js';
import { CONTACT } from '../content.js';
import { PALETTE, SEED } from '../config.js';
import { damp } from '../utils/noise.js';

export class ContactShrine extends Shrine {
  build() {
    this.buildBase({
      motif: 'knot',
      beaconHeight: 42,
      beaconRadius: 2.8,
      labelHeight: 3.6,
      labelY: 14,
      seed: 33,
    });

    // El faro del altar es cálido, no turquesa.
    this.beacon.userData.uniforms.uColor.value.set(PALETTE.ember);

    // ---- Dolmen -----------------------------------------------------------
    const dolmen = createDolmen({
      height: 4.0,
      spread: 3.1,
      capWidth: 8.4,
      capDepth: 6.2,
      capThickness: 1.25,
      legs: 4,
      seed: SEED + 91,
    });
    dolmen.position.y = 0.3;
    this.group.add(dolmen);
    this.dolmen = dolmen;

    // ---- Brasero ----------------------------------------------------------
    const basin = createBasin({ radius: 1.55, height: 1.0, seed: SEED + 93 });
    basin.position.set(0, 0.3, 0);
    this.group.add(basin);

    this.fire = createFire({ count: 260, rise: 3.4, radius: 0.6, spread: 1.3, seed: SEED + 95 });
    this.fire.position.set(0, 1.15, 0);
    this.group.add(this.fire);

    this.smoke = createSmoke({ count: 70, rise: 9, radius: 0.8, seed: SEED + 97 });
    this.smoke.position.set(0, 2.4, 0);
    this.group.add(this.smoke);

    // Zona de contacto del altar: cilindro invisible que envuelve el brasero.
    const altarTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 5, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    altarTarget.position.set(0, 2.2, 0);
    this.group.add(altarTarget);
    this.addHotspot(altarTarget, {
      id: 'contact-form',
      title: CONTACT.title,
      kind: 'contact',
      payload: CONTACT,
    });

    // ---- Piedras de canal -------------------------------------------------
    this.channels = [];
    const links = CONTACT.links ?? [];
    links.forEach((link, i) => {
      const a = (i / Math.max(1, links.length)) * Math.PI * 2 + Math.PI * 0.25;
      const r = 7.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const facing = Math.atan2(-x, -z) + Math.PI;
      const height = 3.4 + (i % 2) * 0.6;

      const stone = stoneMesh(
        createStone({
          width: 1.5,
          height,
          depth: 0.95,
          seed: SEED + 3000 + i * 13,
          detail: 3,
          roundness: 0.36,
          erosion: 0.13,
          taper: 0.12,
        }),
        { name: `canal-${link.label}` }
      );
      stone.position.set(x, 0.3, z);
      stone.rotation.y = facing;
      this.group.add(stone);

      const runeName = link.rune && RUNES[link.rune] ? link.rune : runeFor(link.label);
      const enabled = Boolean(link.href);
      const glyph = glyphDecal(RUNES[runeName], {
        size: 1.35,
        color: enabled ? PALETTE.ember : 0x6d7c7a,
        intensity: enabled ? 0.7 : 0.24,
        pulse: 0.3,
        speed: 0.6 + i * 0.13,
        lineWidth: 0.04,
        glow: 0.06,
      });
      glyph.position.set(
        x - Math.sin(facing) * 0.62,
        height * 0.58 + 0.3,
        z - Math.cos(facing) * 0.62
      );
      glyph.rotation.y = facing;
      this.group.add(glyph);

      const label = createLabel(link.label, {
        height: 0.85,
        maxWidth: 4,
        glowColor: enabled ? '#ffb46a' : '#8fa3a0',
        font: '600 52px "Cinzel", Georgia, serif',
        letterSpacing: 4,
        fadeFar: 180,
        minDistance: 5,
      });
      label.position.set(x, height + 1.3, z);
      label.userData.uniforms.uOpacity.value = 0.4;
      this.group.add(label);

      const target = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, height + 1.6, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      target.position.set(x, height / 2 + 0.3, z);
      this.group.add(target);

      const channel = { link, stone, glyph, label, target, hover: 0, enabled };
      this.channels.push(channel);

      this.addHotspot(target, {
        id: `contact-${link.label}`,
        title: link.label,
        kind: 'link',
        payload: link,
        channel,
      });
    });

    // ---- Losa de ofrendas -------------------------------------------------
    const offering = new THREE.Mesh(
      createSlab({ width: 4.6, height: 0.65, depth: 2.0, seed: SEED + 99 }),
      rockMaterial()
    );
    offering.position.set(0, 0.3, 6.0);
    offering.castShadow = true;
    offering.receiveShadow = true;
    this.group.add(offering);

    const seal = glyphDecal(knotRing({ lobes: 4, radius: 0.4, inner: 0.13 }), {
      size: 2.2,
      color: PALETTE.ember,
      intensity: 0.45,
      pulse: 0.3,
      speed: 0.55,
      lineWidth: 0.02,
      glow: 0.04,
    });
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(0, 1.0, 6.0);
    this.group.add(seal);

    // Aquí había un cerco de cantos sueltos, uno por santuario. La intención era
    // que el prado no quedase barrido, pero al repartirlos a radio casi constante
    // desde el estrado salía justo lo contrario: un anillo regular, legible desde
    // arriba como un segundo borde concéntrico rodeando cada zona. Lo que ensucia
    // el suelo de verdad es el pedregal de la isla (`World._scatterRocks`), que
    // siembra al azar y esquiva enlosados y caminos; ese sigue ahí.

    this.focusOffset.set(0, 4.5, 0);
    return this;
  }

  onUpdate(dt, ctx, activation) {
    this.fire.userData.update(ctx.elapsed);
    // El fuego prende más cuando alguien se acerca al altar.
    const d = ctx.camera.position.distanceTo(this.group.position);
    const near = 1 - THREE.MathUtils.smoothstep(d, 22, 90);
    this.fire.userData.setIntensity(0.55 + near * 0.25 + activation * 0.2);

    const hovered = ctx.hovered?.userData?.hotspot?.channel ?? null;
    for (const c of this.channels) {
      const want = hovered === c ? 1 : 0;
      c.hover = damp(c.hover, want, 8, dt);
      const base = c.enabled ? 0.68 : 0.24;
      c.glyph.userData.glyph.uIntensity.value = base + c.hover * 1.8 + activation * 0.4;
      c.label.userData.uniforms.uOpacity.value = damp(
        c.label.userData.uniforms.uOpacity.value,
        Math.max(0.35 + activation * 0.4, c.hover),
        7,
        dt
      );
    }
  }
}
