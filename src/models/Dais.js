/**
 * El estrado: la plataforma enlosada sobre la que se levanta cada santuario.
 *
 * Es la pieza que más se repite en la referencia — anillos concéntricos de
 * losas con un motivo grabado en el centro — así que se construye una vez y
 * se parametriza por radio, número de peldaños y color de la energía.
 */

import * as THREE from 'three';
import { flagstone, radialPaving } from '../utils/textures.js';
import { createSlab, rockMaterial } from './StoneFactory.js';
import { glyphDecal } from '../vfx/Glyphs.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { triskelion, knotRing } from '../utils/runes.js';
import { SimplexNoise, smoothstep } from '../utils/noise.js';
import { SEED } from '../config.js';

/**
 * Perfil de altura del enlosado, en función del radio normalizado.
 *
 * Un estrado no es un disco liso con un dibujo pintado: es cantería. Tiene un
 * bordón que remata el canto, una junta rehundida entre cada anillo de losas y
 * un medallón en resalte en el centro. Todo eso se resuelve con relieve de
 * verdad porque el sombreado cel aplana lo que cae dentro de una misma banda —
 * un dibujo plano en la textura se pierde en cuanto le da el sol de frente,
 * mientras que un canto que cambia de orientación salta de banda y se ve
 * siempre.
 *
 * @param {number} t      Radio normalizado, 0 en el centro y 1 en el borde.
 * @param {number} rings  Anillos concéntricos de losas.
 */
function daisProfile(t, rings) {
  let h = 0;

  // Junta entre anillos: surco fino donde muere una hilada y empieza la otra.
  //
  // Va MUY poco marcado a propósito. Este surco es el único relieve que corre
  // en una sola dirección, y con él a 0,055 el estrado entero se leía como una
  // pana de anillos concéntricos —un disco de vinilo— en vez de como un
  // enlosado. Lo que separa las losas no es este surco sino el asiento
  // individual de cada pieza, que va en `daisTopGeometry`.
  const along = t * rings;
  const seam = Math.abs(along - Math.round(along)) * 2;   // 0 en la junta
  h -= (1 - smoothstep(0.10, 0.42, seam)) * 0.024;

  // Medallón central en resalte, con su filete alrededor.
  h += smoothstep(0.30, 0.22, t) * 0.11;
  h -= (1 - smoothstep(0.0, 0.035, Math.abs(t - 0.315))) * 0.05;

  // Bordón exterior: el canto del estrado se levanta y luego cae al escalón.
  h += smoothstep(0.885, 0.945, t) * 0.15;
  h -= smoothstep(0.955, 1.0, t) * 0.09;

  return h;
}

/**
 * Disco teselado en anillos, desplazado por `daisProfile`.
 *
 * `paving` es el MISMO ruido con el que `radialPaving` ondula sus juntas. Hace
 * falta: la textura no dibuja círculos perfectos —un enlosado antiguo no los
 * tiene— y si el surco tallado va recto mientras la junta pintada serpentea, se
 * cruzan una y otra vez y el suelo se lee como vetas de madera en lugar de como
 * hiladas de piedra.
 */
function daisTopGeometry(radius, rings, noise, paving, pavingSeed) {
  // Resolución angular: la manda el número de losas del anillo exterior, no el
  // tamaño del estrado. El asiento por losa es un escalón, y un escalón necesita
  // vértices a los dos lados para verse recto — con 160 radiales tocaban a tres
  // por losa y el canto salía dentado. Se piden seis.
  const outerSlabs = Math.max(6, Math.round(rings * 5.5));
  const radial = Math.min(432, Math.max(160, Math.ceil(outerSlabs * 6 / 8) * 8));
  // Tres anillos de vértices por hilada de losas: uno para la junta y dos para
  // el cuerpo. Con menos, el surco se pierde entre vértices.
  const steps = Math.max(24, rings * 4);

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const r = t * radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // La misma ondulación de radio que usa la textura, en las mismas
      // coordenadas normalizadas.
      const wobble = paving.fbm(Math.cos(a) * 2.2, Math.sin(a) * 2.2, t * 3.5, 3, 2.1, 0.5) * 0.012;
      // Desgaste: la piedra no está recién cortada.
      const wear = noise.noise3(x * 0.7, 4.1, z * 0.7) * 0.010;

      // Asiento de cada losa: cada pieza reposa a su propia altura.
      //
      // Es lo que convierte el disco en cantería. Un enlosado de siglos no
      // tiene la cara continua: cada losa se ha hundido lo suyo, y ese
      // escaloncito entre vecinas es lo que las separa a la vista. Importa
      // especialmente aquí porque el sombreado cel salta de banda con la
      // orientación, así que un desnivel de tres centímetros basta para que
      // dos losas contiguas se pinten distinto.
      //
      // El identificador de losa se calcula igual que en `radialPaving` —mismo
      // ruido, misma semilla, mismas fórmulas— para que el escalón caiga
      // exactamente donde la textura pinta la junta.
      const rr = t + wobble;
      const ringIndex = Math.floor(rr * rings);
      const slabs = Math.max(6, Math.round((ringIndex + 1) * 5.5));
      const offset = paving.noise2(ringIndex * 3.1, pavingSeed) * Math.PI;
      const slabIndex = Math.floor(((a + Math.PI + offset) / (Math.PI * 2)) * slabs);
      const settle = paving.noise3(ringIndex * 2.3, slabIndex * 1.9, 7.7) * 0.055;

      positions.push(x, daisProfile(rr, rings) + wear + settle, z);
      // Las UV son las mismas del disco original: la textura ya es radial.
      uvs.push(0.5 + (x / radius) * 0.5, 0.5 + (z / radius) * 0.5);
    }
  }

  const row = radial + 1;
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * row + i;
      const b = a + row;
      // Sentido antihorario visto DESDE ARRIBA. Con el orden contrario la cara
      // frontal del disco mira hacia abajo: el enlosado se lo comía el descarte
      // de caras traseras y por el agujero se veía el terreno. No se notaba
      // porque la tapa del cilindro del peldaño superior lo cubría entero.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Muro de contención: la falda que cierra el estrado contra el terreno.
 *
 * Un estrado es una plataforma RÍGIDA y el prado no lo es. Mientras el terreno
 * de alrededor esté a nivel no se nota, pero en cuanto el santuario cae en una
 * ladera el peldaño exterior se queda colgando por el lado de abajo. Aquí pasaba
 * en Trayectoria y en Habilidades, que están las dos al borde del escarpe.
 *
 * Y no se arregla aplanando más terreno. Trayectoria está a 48 m de la plaza y
 * 17 m por encima: para que las dos plataformas queden llanas harían falta 51 m
 * de radio sumados, y solo hay 48. Sencillamente no caben.
 *
 * Lo que sí hay es la respuesta que lleva usándose desde que se construye en
 * ladera: un muro que baja del canto de la plataforma hasta encontrar el suelo,
 * más alto por el lado de abajo y enterrado por el de arriba. El borde inferior
 * se muestrea ángulo a ángulo, así que cierra exactamente contra el terreno sin
 * dejar aire ni asomar donde no toca.
 *
 * @param {(lx: number, lz: number) => number} groundAt  Altura del terreno en
 *        coordenadas locales del estrado. Sin ella no se dibuja muro.
 */
function daisSkirtGeometry(radius, topY, groundAt, segmentos = 96) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let perimetro = 0;
  let anterior = null;

  for (let i = 0; i <= segmentos; i++) {
    const a = (i / segmentos) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    if (anterior) perimetro += Math.hypot(x - anterior[0], z - anterior[1]);
    anterior = [x, z];
    // Medio metro por debajo del suelo: el muro se hinca, no se apoya.
    const abajo = Math.min(topY - 0.15, groundAt(x, z) - 0.5);
    positions.push(x, topY, z, x, abajo, z);
    uvs.push(perimetro / 2.4, 0, perimetro / 2.4, (topY - abajo) / 2.4);
  }

  for (let i = 0; i < segmentos; i++) {
    const a = i * 2;
    // Antihorario visto DESDE FUERA, que es de donde se mira un muro.
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Huella de un peldaño: anillo enlosado entre dos radios.
 *
 * Existe porque la tapa del cilindro NO vale. Un `CylinderGeometry` cerrado trae
 * su tapa con las UV en abanico —la textura sale del centro y se abre como los
 * radios de una rueda—, así que el enlosado se estiraba en cuñas cada vez más
 * anchas hacia fuera. Sobre un estrado de veinticinco metros de radio eso se lee
 * exactamente como un entarimado de duelas, y no hay retoque de la textura que
 * lo arregle: el problema es el mapeado, no el dibujo.
 *
 * Aquí las UV son las mismas que las del disco superior —radiales, centradas—,
 * así que la hilada del peldaño continúa el trazado del enlosado en vez de
 * inventarse otro.
 *
 * El borde exterior va MELLADO. Un estrado con la circunferencia perfecta se lee
 * como recién construido; lo que dice «ruina» no es la suciedad sino que al
 * monumento le falten piezas y el prado se le esté comiendo el canto.
 *
 * @param {number} rInterior  Radio donde arranca la huella.
 * @param {number} rExterior  Radio nominal del canto.
 * @param {number} mellado    Metros de vuelo que puede llevarse el bocado.
 *                            0 = canto limpio. Solo el peldaño más bajo lo lleva.
 */
function daisTreadGeometry(rInterior, rExterior, rings, noise, paving, pavingSeed, mellado) {
  const slabs = Math.max(10, Math.round(rExterior * 2.0));
  const radial = Math.min(432, Math.max(120, Math.ceil((slabs * 6) / 8) * 8));
  const anillos = Math.max(2, Math.round((rExterior - rInterior) / 1.4));
  const pasos = anillos * 3;

  const positions = [];
  const uvs = [];
  const indices = [];
  const vivo = [];          // ¿existe la losa en este vértice?

  for (let j = 0; j <= pasos; j++) {
    const t = j / pasos;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      // Mordiscos del canto: el radio exterior deja de ser una circunferencia.
      // Van a dos escalas — la ondulación general y algún bocado más hondo —
      // porque un canto comido de forma pareja vuelve a leerse como un borde
      // hecho a propósito.
      //
      // El mordisco se come un VUELO que sobra, nunca la huella misma. Es la
      // diferencia entre un canto roto y un agujero: mordiendo hacia dentro
      // desde el radio de la contrahuella, la huella se separaba de ella y por
      // el hueco se veía el interior del cilindro y el prado de debajo — medias
      // lunas de hierba entre anillo y anillo. Aquí la huella vuela `mordisco`
      // metros más allá de la contrahuella y el bocado se lo lleva de ese vuelo,
      // así que en el peor caso el canto queda justo sobre la contrahuella.
      const onda = paving.fbm(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 5.4, 3, 2.1, 0.5) * 0.5 + 0.5;
      const bocado = smoothstep(0.34, 0.78, paving.fbm(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 19.7, 2, 2.2, 0.5) * 0.5 + 0.5);
      const recorte = mellado ? Math.min(mellado, onda * 0.34 * mellado + bocado * 0.78 * mellado) : 0;
      const rFin = rExterior - recorte;
      const r = rInterior + (rFin - rInterior) * t;

      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // Identificador de losa, con las mismas fórmulas que `radialPaving`: el
      // asiento tiene que caer donde la textura pinta la junta.
      const anillo = Math.floor(t * anillos);
      const offset = paving.noise2(anillo * 3.1 + rInterior, pavingSeed) * Math.PI;
      const indice = Math.floor(((a + Math.PI + offset) / (Math.PI * 2)) * slabs);
      const asiento = paving.noise3(anillo * 2.3 + rInterior, indice * 1.9, 7.7) * 0.06;
      // Alguna losa hundida de más: es lo que hace que la hilada no sea plana.
      const hundida = smoothstep(0.62, 0.88, Math.abs(paving.noise3(indice * 0.7, anillo * 1.3, 31.2)));
      const desgaste = noise.noise3(x * 0.7, 4.1, z * 0.7) * 0.012;

      positions.push(x, asiento - hundida * 0.10 + desgaste, z);
      // UV radiales referidas al canto nominal, como el disco de arriba.
      uvs.push(0.5 + (x / rExterior) * 0.5, 0.5 + (z / rExterior) * 0.5);
      vivo.push(true);
    }
  }

  const fila = radial + 1;
  for (let j = 0; j < pasos; j++) {
    for (let i = 0; i < radial; i++) {
      const a0 = j * fila + i;
      const b0 = a0 + fila;
      // Antihorario visto DESDE ARRIBA. Con el orden contrario la cara frontal
      // mira al suelo y el descarte de caras traseras se come la huella entera.
      indices.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * @param {object} opts
 * @param {number} opts.radius     Radio de la losa superior.
 * @param {number} opts.steps      Peldaños concéntricos hacia fuera.
 * @param {number} opts.stepDrop   Cuánto baja cada peldaño.
 * @param {number} opts.color      Color de la energía grabada.
 * @param {string} opts.motif      'triskel' | 'knot' | 'none'
 * @param {number} opts.seed
 */
export function createDais({
  radius = 14,
  steps = 3,
  stepWidth = 3.2,
  stepDrop = DAIS_STEP_DROP,
  color = 0x4fe6d8,
  motif = 'triskel',
  seed = 1,
  groundAt = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'dais';
  const noise = new SimplexNoise(seed);

  const paving = flagstone({ seed: SEED + seed, repeat: 1 });

  // Enlosado de las huellas: la misma textura radial que la cara superior, con
  // más hiladas porque el anillo de peldaños cubre bastante más superficie.
  const rExteriorTotal = radius + steps * stepWidth;
  const treadSeed = SEED + seed * 7 + 131;
  const treadNoise = new SimplexNoise(treadSeed);
  const treadTex = radialPaving({
    seed: treadSeed,
    size: rExteriorTotal >= 24 ? 2048 : 1024,
    rings: Math.max(6, Math.round(rExteriorTotal * 0.40)),
  });
  const treadMat = new THREE.MeshStandardMaterial({
    map: treadTex.map,
    normalMap: treadTex.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    color: 0xaab2b0,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  treadMat.name = 'estrado-huella';
  applyToonShading(treadMat, { ...TOON_PRESETS.paving, key: 'paving-tread' });

  // Peldaños: del más externo (abajo) al superior.
  for (let s = steps; s >= 0; s--) {
    const r = radius + s * stepWidth;
    const y = -s * stepDrop;
    // Cilindro ABIERTO. Con tapa, ese disco es lo que se veía del peldaño —y no
    // el enlosado— porque viene con las UV en abanico.
    const geo = new THREE.CylinderGeometry(r, r + 0.35, stepDrop + 0.5, 72, 1, true);
    const mat = new THREE.MeshStandardMaterial({
      map: paving.map,
      normalMap: paving.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0xc0bbaa,
      roughness: 0.92,
      metalness: 0,
    });
    // Repeticiones proporcionales al tamaño REAL de la contrahuella, en las dos
    // direcciones. El 1,2 vertical fijo estiraba la losa a lo largo de todo el
    // canto —55 cm de alto pintados con una losa entera— y el resultado era una
    // banda de vetas horizontales que se leía como madera, el mismo defecto que
    // tenía la tapa. Con 2,4 m por baldosa, la piedra sale a su escala.
    const baldosa = 2.4;
    mat.map = paving.map.clone();
    mat.map.repeat.set(
      Math.max(4, Math.round((2 * Math.PI * r) / baldosa)),
      Math.max(1, Math.round((stepDrop + 0.5) / baldosa * 4) / 4)
    );
    mat.map.needsUpdate = true;
    mat.normalMap = paving.normalMap.clone();
    mat.normalMap.repeat.copy(mat.map.repeat);
    mat.normalMap.needsUpdate = true;
    // Un material por peldaño y por estrado: la repetición de la textura
    // depende del radio. Comparten nombre a propósito — el editor los trata
    // como una familia y los cambia todos a la vez.
    mat.name = 'estrado-peldano';
    applyToonShading(mat, { ...TOON_PRESETS.paving, key: 'paving-step' });

    const mesh = new THREE.Mesh(geo, mat);
    // El tambor se hunde lo justo para que su TAPA quede por debajo del punto
    // más bajo del enlosado.
    //
    // La tapa del cilindro superior estaba a 0,25 y la cara enlosada oscila
    // entre 0,15 y 0,46: la tapa cortaba el enlosado por la mitad y, como es
    // plana, ganaba en todo lo que el enlosado baja —juntas, asientos, el
    // rebaje del canto—. Lo que se veía de la plaza no era la cantería sino esa
    // tapa, con la textura de losa repetida trece veces sobre un disco, que da
    // un abanico de duelas: el estrado parecía un entarimado. Y por eso mismo
    // ningún retoque del enlosado se notaba, porque el enlosado no se estaba
    // viendo.
    mesh.position.y = y - (stepDrop + 0.5) / 2 + 0.03;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);

    // Huella: el anillo enlosado que corona esta contrahuella. El peldaño 0 no
    // lleva porque su huella es la cara superior del estrado, que va aparte.
    if (s === 0) continue;
    const tread = new THREE.Mesh(
      daisTreadGeometry(
        radius + (s - 1) * stepWidth - 0.15,
        // El canto del peldaño más bajo vuela un metro sobre la contrahuella
        // para que el bocado tenga de dónde comer sin abrir hueco.
        s === steps ? r + 1.0 : r,
        Math.max(2, Math.round(stepWidth / 1.4)),
        noise,
        treadNoise,
        treadSeed + s * 97,
        s === steps ? 1.0 : 0
      ),
      treadMat
    );
    tread.position.y = y + 0.04;
    tread.receiveShadow = true;
    group.add(tread);
  }

  // Muro de contención contra el terreno. Ver `daisSkirtGeometry`.
  if (groundAt) {
    const rMuro = radius + steps * stepWidth + 0.35;
    const skirt = new THREE.Mesh(
      daisSkirtGeometry(rMuro, -steps * stepDrop + 0.04, groundAt),
      new THREE.MeshStandardMaterial({
        map: paving.map,
        normalMap: paving.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        color: 0xb4b0a2,
        roughness: 0.94,
        metalness: 0,
        side: THREE.DoubleSide,
      })
    );
    skirt.material.name = 'estrado-muro';
    applyToonShading(skirt.material, { ...TOON_PRESETS.paving, key: 'paving-skirt' });
    skirt.name = 'estrado-muro';
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    group.add(skirt);
  }

  // Cara superior: enlosado radial con relieve real.
  const rings = Math.max(5, Math.round(radius * 0.42));
  const pavingSeed = SEED + seed * 7;
  const topGeo = daisTopGeometry(radius - 0.05, rings, noise, new SimplexNoise(pavingSeed), pavingSeed);
  // La resolución sube con el tamaño del estrado. La plaza tiene 48 m de
  // diámetro: a 1024 px salían 21 píxeles por metro y de cerca se veía
  // emborronada. El coste solo lo paga el estrado grande.
  const radial = radialPaving({
    seed: pavingSeed,
    size: radius >= 20 ? 2048 : 1024,
    rings,
  });
  const topMat = new THREE.MeshStandardMaterial({
    map: radial.map,
    normalMap: radial.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    // Piedra fría, no madera. El taupe cálido de antes, sumado a las hiladas
    // concéntricas, dejaba el estrado con aire de entarimado.
    color: 0xaab2b0,
    roughness: 0.88,
    metalness: 0,
  });
  topMat.name = 'estrado-losa';
  applyToonShading(topMat, { ...TOON_PRESETS.paving, key: 'paving-top' });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 0.26;
  top.receiveShadow = true;
  group.add(top);

  // Motivo grabado en el centro.
  if (motif !== 'none') {
    const paths = motif === 'knot'
      ? knotRing({ lobes: 7, radius: 0.42, inner: 0.09 })
      : triskelion({ arms: 3, turns: 2.4, radius: 0.44 });
    // El motivo se atenúa conforme crece el estrado: en la plaza central,
    // que mide el doble, la misma intensidad convertía el suelo en una
    // mancha turquesa que se comía toda la composición.
    const decal = glyphDecal(paths, {
      // Ocupa el corazón del estrado, no toda su superficie: el enlosado
      // radial tiene que seguir leyéndose alrededor.
      size: radius * 0.78,
      color,
      intensity: 0.22 * Math.min(1, 14 / radius),
      pulse: 0.30,
      speed: 0.75,
      lineWidth: 0.0085,
      glow: 0.022,
      texSize: 1024,
    });
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.30 + 0.11;
    group.add(decal);
    group.userData.motif = decal;
  }

  // Aquí iba una GUARDIA DE ESTELAS: un corro de piedras hincadas rodeando el
  // escalón exterior, con la runa encendida en unas cuantas. Está retirada, y
  // conviene saber por qué antes de volver a proponerla.
  //
  // Nació como remate del canto del estrado y pasó por dos formas —cantos
  // rodados primero, estelas después— porque el problema que se veía era el
  // MATERIAL: un canto rodado es piedra que ha traído el agua, lo que menos
  // pinta alrededor de un monumento levantado a propósito. Cambiarlo a estela
  // hincada arregló el lenguaje y dejó intacto el defecto de fondo, que es la
  // DISPOSICIÓN: N piezas repartidas por ángulo a radio constante son un anillo,
  // se hagan de lo que se hagan. Desde el prado se leía como una valla de
  // hormigón siguiendo la curva del estrado, y desde arriba como un segundo
  // borde concéntrico. Es el mismo error que el cerco de cantos de las secciones
  // —ver el README—, cometido dos veces en dos sistemas distintos.
  //
  // El canto del estrado ya se remata solo: el muro de contención (`daisSkirt`)
  // le da grosor y el peldaño más bajo va mellado. No necesita corro.
  //
  // Las runas de la isla NO dependían de esto: viven en las piedras rúnicas
  // sueltas de `World._buildRuneStones()`, que siguen en pie.

  group.userData.radius = radius;
  group.userData.outerRadius = radius + steps * stepWidth;
  return group;
}

/**
 * Cuánto baja cada peldaño concéntrico del estrado.
 *
 * Se exporta porque no está en `config.DAIS` y hay quien necesita saber a qué
 * cota acaba la piedra: la escalinata a Habilidades entrega en el peldaño más
 * bajo, y para eso tiene que calcularlo, no adivinarlo.
 */
export const DAIS_STEP_DROP = 0.55;

// Aquí vivía `createSteps`, «peldaños de aproximación: conectan el terreno con
// el estrado». Nunca llegó a usarse. Cuando por fin hizo falta esa pieza —para
// que la escalinata a Habilidades entregue en la losa rehundida en vez de morir
// en el prado— resultó no servir: hace losas SUELTAS, sin costados, y cuatro
// piedras flotando sobre la hierba no se leen como una escalera aunque sus cotas
// sean exactas. Lo que se usa está en `Stairway.js`: se sintetiza un plan recto
// de cuatro peldaños y se pasa por las mismas funciones que construyen el cuerpo
// de la escalinata, así que sale con sus muretes y su misma piedra.
