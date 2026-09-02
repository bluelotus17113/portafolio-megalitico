/**
 * El Pasadizo: una galería excavada bajo un cerro.
 *
 * Un souterrain de verdad —los hay a cientos en Irlanda y Bretaña— es un
 * corredor de ortostatos con losas de cubierta, enterrado, al que se baja por
 * una rampa. Aquí cumple además una función: las dos mesetas del promontorio
 * están separadas por un escarpe que ningún camino puede subir con decencia
 * (ver `World._traceRoutes`), y este es el único paso que no obliga a trepar.
 *
 * TRES COSAS QUE HAY QUE SABER ANTES DE TOCAR NADA AQUÍ:
 *
 * 1. **El cerro se pone a mano.** El ruido del promontorio hace lomas anchas y
 *    tendidas; barriendo la isla entera solo aparecieron cuatro sitios con roca
 *    suficiente sobre el techo, y el mejor daba 3,3 m. Antes que meter la
 *    galería en un mal sitio, se levanta el cerro con `field.addMound`.
 *
 * 2. **Un campo de alturas no admite agujeros.** Para cada (x, z) hay una sola
 *    altura, así que una puerta abierta en la ladera es imposible tal cual: el
 *    terreno pasaría por delante del vano. Por eso cada boca vive al fondo de
 *    una TRINCHERA de paredes casi verticales, como un desmonte de ferrocarril.
 *    La portada se planta al fondo de la zanja, donde ya hay roca encima.
 *
 * 3. **La cámara topa contra la superficie.** El rig se apoya en `field.height`
 *    para no colarse bajo tierra, lo que deja cualquier galería inaccesible por
 *    construcción. Se resuelve en `field.walkHeight`, que devuelve el suelo del
 *    pasadizo cuando el punto cae dentro de su volumen.
 */

import * as THREE from 'three';
import { createStone, createSlab, stoneMesh, rockMaterial } from './StoneFactory.js';
import { runeStone } from './Carving.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { triskelion } from '../utils/runes.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE, SEED } from '../config.js';

/**
 * Todas las medidas del pasadizo, en unidades de mundo.
 *
 * El emplazamiento salió de barrer la isla entera exigiendo que el terreno
 * NATURAL a veinte metros del centro sea el mismo a un lado y al otro. Aquí la
 * diferencia es de 30 cm; en toda la meseta solo hay tres sitios que lo cumplan.
 *
 * Ese criterio es el que faltaba en el primer intento, que puso el cerro en
 * (-64, -63) por ser «la campa más llana cerca de Habilidades» — medida como el
 * desnivel máximo en un disco de 26 m, que allí daba 13,5 m. Con esa tolerancia
 * el sitio estaba en plena ladera: el terreno subía por un lado y caía ocho
 * metros por el otro, así que el tramo con cobertura se alargaba 41 m cuesta
 * arriba y la boca de ese lado acababa asomando a un cortado. Un cerro postizo
 * NO arregla una ladera; solo suma su bulto al desnivel que ya había.
 */
export const SOUTERRAIN = {
  centro: [-32, 82],
  rumbo: 0.262,
  ancho: 3.2,
  alto: 4.2,
  /** Cota del piso de la galería, plana. */
  suelo: 39.4,
  muro: 0.9,
  cerro: { radio: 24, altura: 13 },
  /** Hasta dónde se busca boca a cada lado del centro. */
  alcance: 42,
};

const EJE = new THREE.Vector2(Math.cos(SOUTERRAIN.rumbo), Math.sin(SOUTERRAIN.rumbo));

/** Punto del eje a `s` metros del CENTRO del cerro. Negativo = lado A. */
export function souterrainAt(s) {
  const [cx, cz] = SOUTERRAIN.centro;
  return new THREE.Vector2(cx + EJE.x * s, cz + EJE.y * s);
}

let _plan = null;

/**
 * Dónde cae cada cosa a lo largo del eje, MEDIDO sobre el terreno.
 *
 * Nada de esto se fija a mano, y la razón es una equivocación concreta: con las
 * cotas puestas a ojo, la boca B quedaba a 60 m cuando el piso de la galería
 * está a 66,1 — el corredor salía por esa ladera seis metros en el aire. La
 * barredora que eligió los números no lo vio porque comparaba el MÁXIMO de las
 * dos rampas en vez de cada una por separado, y la rampa buena tapaba a la mala.
 *
 * Se llama después de `addMound` y antes de `addCut`: hace falta el cerro para
 * saber dónde hay cobertura, y hace falta que todavía no estén los desmontes
 * para leer el terreno sin excavar.
 *
 * @param {import('../world/Terrain.js').TerrainField} field
 */
export function souterrainPlan(field) {
  if (_plan) return _plan;
  const { suelo, alto, alcance } = SOUTERRAIN;
  const techo = suelo + alto;
  const h = (s) => { const p = souterrainAt(s); return field.height(p.x, p.y); };

  // Portadas: el tramo continuo alrededor del centro con roca de sobra encima.
  let pA = 0;
  let pB = 0;
  while (pA > -alcance && h(pA - 0.5) - techo >= 1.2) pA -= 0.5;
  while (pB < alcance && h(pB + 0.5) - techo >= 1.2) pB += 0.5;

  // Bocas: saliendo de cada portada, el primer punto donde el terreno natural
  // ya está a la cota del piso. Ahí se acaba el desmonte porque no hay nada que
  // excavar, y ahí es donde se sale al prado sin escalón.
  const buscarBoca = (desde, paso) => {
    let s = desde;
    while (Math.abs(s) < alcance && h(s) > suelo + 0.3) s += paso;
    return s;
  };
  const bA = buscarBoca(pA, -0.5);
  const bB = buscarBoca(pB, 0.5);

  // El corte se apaga con la distancia al segmento, así que sigue rebajando
  // terreno unos metros MÁS ALLÁ de su extremo. Por eso se para ANTES de llegar
  // a la portada, hacia el lado de la boca: la cola del desvanecimiento es justo
  // la que llega a la puerta y deja la pared de roca en la que se abre el vano.
  //
  // Con el signo al revés —parándolo hacia DENTRO— el desmonte se comía la
  // cobertura del propio túnel y dejaba once metros techados de treinta.
  const margen = SOUTERRAIN.ancho * 0.5 + 1.1 + 2.2;
  const entre = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  _plan = {
    portalA: pA,
    portalB: pB,
    bocaA: bA,
    bocaB: bB,
    corteA: entre(pA - margen, bA + 1, pA - 0.5),
    corteB: entre(pB + margen, pB + 0.5, bB - 1),
    techado: pB - pA,
    // Se publican para que las herramientas de diagnóstico no tengan que
    // cablear el emplazamiento: mover el pasadizo dejaba mintiendo al probe.
    centro: SOUTERRAIN.centro,
    rumbo: SOUTERRAIN.rumbo,
    suelo,
    techo,
  };
  return _plan;
}

/** Las dos bocas del corredor, en orden A → B. Requiere `souterrainPlan`. */
export function souterrainMouths() {
  const p = _plan ?? { bocaA: -22, bocaB: 22 };
  return [souterrainAt(p.bocaA), souterrainAt(p.bocaB)];
}

/** El cerro, para `field.addMound`. Se registra ANTES que nada. */
export function souterrainMound() {
  return {
    x: SOUTERRAIN.centro[0],
    z: SOUTERRAIN.centro[1],
    radius: SOUTERRAIN.cerro.radio,
    height: SOUTERRAIN.cerro.altura,
  };
}

/**
 * Los dos desmontes de acceso, para `field.addCut`.
 *
 * Cada uno va de la boca —donde el fondo coincide con el terreno, o sea que no
 * corta nada— hasta cerca de la portada, donde llega a la cota del piso.
 */
export function souterrainCuts(field) {
  const plan = souterrainPlan(field);
  return [
    [plan.bocaA, plan.corteA],
    [plan.bocaB, plan.corteB],
  ].map(([sBoca, sCorte]) => {
    const boca = souterrainAt(sBoca);
    const corte = souterrainAt(sCorte);
    return {
      ax: boca.x,
      az: boca.y,
      bx: corte.x,
      bz: corte.y,
      halfWidth: SOUTERRAIN.ancho * 0.5 + 1.1,
      // Paredes cortas: un desmonte con la falda tendida deja de ser un
      // desmonte y se convierte en un valle, y la portada vuelve a quedar tapada.
      blend: 2.2,
      floorA: field.height(boca.x, boca.y) + 0.1,
      floorB: SOUTERRAIN.suelo,
    };
  });
}

/**
 * El volumen por el que se puede pasar, para `field.addTunnel`.
 *
 * De boca a boca: en el tramo techado el piso es el de la galería y en los
 * desmontes es la rampa excavada, pero la cámara tiene que poder bajar por
 * debajo de la superficie en todo el recorrido. Limitándolo a las portadas, se
 * topaba con la ladera a dos pasos de la puerta y no llegaba a entrar.
 */
export function souterrainTunnel() {
  const p = _plan ?? { bocaA: -22, bocaB: 22 };
  const a = souterrainAt(p.bocaA);
  const b = souterrainAt(p.bocaB);
  return {
    ax: a.x,
    az: a.y,
    bx: b.x,
    bz: b.y,
    halfWidth: SOUTERRAIN.ancho * 0.5 + 0.9,
    floor: SOUTERRAIN.suelo,
    height: SOUTERRAIN.alto,
  };
}

/** Ni hierba ni arbolado en todo el corredor. */
export function souterrainKeepOut() {
  const p = _plan ?? { bocaA: -22, bocaB: 22 };
  const zonas = [];
  for (let s = p.bocaA - 3; s <= p.bocaB + 3; s += 2.5) {
    const q = souterrainAt(s);
    zonas.push({ x: q.x, z: q.y, radius: SOUTERRAIN.ancho * 0.5 + 2.6 });
  }
  return zonas;
}

/**
 * La galería: suelo, ortostatos, losas de cubierta y las dos portadas.
 *
 * @param {import('../world/Terrain.js').TerrainField} field
 */
export function createSouterrain(field) {
  const group = new THREE.Group();
  group.name = 'pasadizo';
  const random = makeRandom(SEED + 7710);
  const { ancho, alto, suelo, muro } = SOUTERRAIN;
  const plan = souterrainPlan(field);
  const { bocaA, bocaB, portalA, portalB } = plan;
  const lado = new THREE.Vector2(-EJE.y, EJE.x);

  /**
   * Cota del piso a `s` metros del centro.
   *
   * Bajo el cerro es la de la galería, plana. En los desmontes es la del propio
   * terreno, que ahí ya viene excavado en rampa — y las dos coinciden en la
   * portada, que es donde se encuentran. Con el piso plano en todo el corredor,
   * las losas de la rampa quedaban enterradas o flotando según el tramo.
   */
  const pisoEn = (s, p) =>
    s > portalA && s < portalB ? suelo : Math.min(suelo, field.height(p.x, p.y));

  // ---- Piso ----------------------------------------------------------------
  const losaMat = rockMaterial();
  const largo = bocaB - bocaA;
  const pasos = Math.max(4, Math.round(largo / 1.6));
  for (let i = 0; i < pasos; i++) {
    const s = bocaA + ((i + 0.5) / pasos) * largo;
    const p = souterrainAt(s);
    const losa = new THREE.Mesh(
      createSlab({ width: ancho + 0.5, height: 0.4, depth: 1.5, seed: SEED + 7800 + i, erosion: 0.05 }),
      losaMat
    );
    losa.position.set(p.x, pisoEn(s, p) - 0.30, p.y);
    losa.rotation.y = -SOUTERRAIN.rumbo + (random() - 0.5) * 0.05;
    losa.receiveShadow = true;
    group.add(losa);
  }

  // ---- Ortostatos y cubierta ----------------------------------------------
  // La losa de cubierta apoya sobre las dos jambas, como en el original: no hay
  // arco ni bóveda porque el megalítico no los conoce. Con arco, el pasadizo se
  // leería como una alcantarilla romana.
  const separacion = 2.6;
  const tramos = Math.max(3, Math.round(largo / separacion));
  for (let i = 0; i <= tramos; i++) {
    const s = bocaA + (i / tramos) * largo;
    const p = souterrainAt(s);
    const piso = pisoEn(s, p);
    const techado = s >= portalA - 0.5 && s <= portalB + 0.5;

    for (const signo of [-1, 1]) {
      const jamba = stoneMesh(
        createStone({
          width: separacion * 1.05,
          height: alto + 1.4,
          depth: muro,
          seed: SEED + 7900 + i * 7 + (signo > 0 ? 3 : 0),
          detail: 3,
          roundness: 0.20,
          erosion: 0.075,
          taper: 0.03,
        }),
        { name: 'pasadizo-ortostato' }
      );
      jamba.position.set(
        p.x + lado.x * signo * (ancho / 2 + muro / 2),
        piso - 0.6,
        p.y + lado.y * signo * (ancho / 2 + muro / 2)
      );
      jamba.rotation.y = -SOUTERRAIN.rumbo;
      jamba.castShadow = true;
      jamba.receiveShadow = true;
      group.add(jamba);
    }

    // Cubierta solo bajo el cerro. Los dos desmontes van a cielo abierto: es
    // justo lo que hace que desde fuera se vea que ahí hay una entrada, en vez
    // de un bulto de hierba con una puerta escondida en la falda.
    if (!techado || i === tramos) continue;
    const q = souterrainAt(s + separacion * 0.5);
    const tapa = stoneMesh(
      createSlab({
        width: ancho + muro * 2 + 0.7,
        height: 0.75,
        depth: separacion * 1.1,
        seed: SEED + 8100 + i,
        erosion: 0.05,
      }),
      { name: 'pasadizo-cubierta' }
    );
    tapa.position.set(q.x, suelo + alto, q.y);
    tapa.rotation.y = -SOUTERRAIN.rumbo + (random() - 0.5) * 0.04;
    tapa.castShadow = true;
    tapa.receiveShadow = true;
    group.add(tapa);
  }

  // ---- Portadas ------------------------------------------------------------
  // Cada portada lleva su dintel y, tumbada delante, la losa del umbral con las
  // espirales — la pieza que en un túmulo de verdad anuncia lo que hay dentro.
  for (const [s, signo, semilla] of [[portalA, -1, 0], [portalB, 1, 1]]) {
    const p = souterrainAt(s);
    const dintel = stoneMesh(
      createSlab({
        width: ancho + muro * 2 + 1.8,
        height: 1.2,
        depth: 1.6,
        seed: SEED + 8300 + semilla,
        erosion: 0.06,
      }),
      { name: 'pasadizo-dintel' }
    );
    dintel.position.set(p.x, suelo + alto + 0.1, p.y);
    dintel.rotation.y = -SOUTERRAIN.rumbo;
    dintel.castShadow = true;
    dintel.receiveShadow = true;
    group.add(dintel);

    const q = souterrainAt(s + 3.0 * signo);
    const umbral = runeStone({
      width: 3.2,
      height: 1.6,
      depth: 1.1,
      motif: 'espirales',
      seed: SEED + 8400 + semilla,
      color: PALETTE.arcane,
      glow: 0.5,
    });
    umbral.position.set(q.x, pisoEn(s + 3.0 * signo, q) - 0.25, q.y);
    umbral.rotation.y = -SOUTERRAIN.rumbo + (signo > 0 ? 0 : Math.PI);
    group.add(umbral);
  }

  // ---- Luz de dentro -------------------------------------------------------
  // Sin nada, el corredor queda a la luz del hemisférico y se lee como un
  // pasillo gris: correcto y muerto. Los glifos no son decoración, son lo que
  // hace que se vea el final del túnel desde la entrada y apetezca entrar.
  const marcas = [];
  for (let s = portalA + 3; s < portalB - 2; s += 5.4) {
    const p = souterrainAt(s);
    for (const signo of [-1, 1]) {
      const glifo = glyphDecal(triskelion({ arms: 3, turns: 1.7 + (Math.abs(s) % 3) * 0.3, radius: 0.4 }), {
        size: 1.5,
        color: PALETTE.arcane,
        intensity: 0.55,
        pulse: 0.5,
        speed: 0.3 + (Math.abs(s) % 5) * 0.08,
        lineWidth: 0.02,
        glow: 0.05,
      });
      glifo.position.set(
        p.x + lado.x * signo * (ancho / 2 - 0.04),
        suelo + 1.9,
        p.y + lado.y * signo * (ancho / 2 - 0.04)
      );
      glifo.rotation.y = -SOUTERRAIN.rumbo + (signo > 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(glifo);
      marcas.push(glifo);
    }
  }

  group.userData.glifos = marcas;
  group.userData.plan = plan;
  return group;
}
