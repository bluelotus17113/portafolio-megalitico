/**
 * Hierba instanciada, al estilo de fondo pintado de animación japonesa.
 *
 * Reproduce las cinco piezas del esquema de la referencia
 * (`AnimeGrass_Demo_3.0.blend` y su lámina explicativa):
 *
 *   1. Sombra pintada a mano: el corte entre luz y sombra es un escalón, no un
 *      degradado, y la sombra cambia de TONO — se va al azul (#00344b medido
 *      en el material del .blend), no simplemente se oscurece.
 *   2. Variación de color: cada brizna elige un par base/punta de una paleta
 *      corta, repartido por manchas grandes en vez de al azar por brizna.
 *   3. Sincronía con el terreno: el par por defecto es el mismo verde que pinta
 *      la textura del prado, así que a media distancia hierba y suelo son el
 *      mismo campo y no dos capas distintas.
 *   4. Capa de flores: una fracción de las briznas remata en flor.
 *   5. Viento: además de doblar la brizna, la aclara al tensarse — el «color
 *      change» del esquema.
 *
 * La brizna son exactamente 16 triángulos, como en la referencia, pero doblada
 * en V en lugar de plana: el pliegue central es lo que le da un canto
 * iluminado y otro en sombra, y sin él 42.000 tiras planas se leen como una
 * moqueta. Sigue siendo un solo draw call.
 */

import * as THREE from 'three';
import { registerClock } from '../vfx/materials.js';
import { makeRandom, SimplexNoise } from '../utils/noise.js';
import { ANIME, TOON_CLOUDS, TOON_TIME } from '../vfx/toon.js';
import { WORLD } from '../config.js';

const BLADE_SEGMENTS = 4;

/**
 * Brizna: tira que se afila hacia la punta y va doblada en V a lo largo.
 *
 * Tres columnas (izquierda, nervio, derecha) por cinco filas: 4 segmentos × 4
 * triángulos = 16 triángulos. `uv.x` dice en qué columna estamos y sirve al
 * shader para inclinar la normal a un lado o al otro del pliegue.
 */
function bladeGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= BLADE_SEGMENTS; i++) {
    const t = i / BLADE_SEGMENTS;
    const halfWidth = (1 - t * t) * 0.5;
    // El nervio se adelanta: ese es el pliegue.
    const fold = halfWidth * 0.62;
    positions.push(-halfWidth, t, 0);
    positions.push(0, t, fold);
    positions.push(halfWidth, t, 0);
    uvs.push(0, t, 0.5, t, 1, t);
  }
  for (let i = 0; i < BLADE_SEGMENTS; i++) {
    const a = i * 3;
    const b = a + 3;
    // Mitad izquierda y mitad derecha, dos triángulos cada una.
    indices.push(a, a + 1, b, a + 1, b + 1, b);
    indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>

  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;

  attribute vec3 aOffset;    // posición en el mundo
  attribute vec4 aParams;    // altura, anchura, giro, rigidez
  attribute vec3 aColor;     // color de la base
  attribute vec4 aTip;       // color de la punta + cantidad de flor
  attribute vec3 aNormal;    // normal del terreno bajo la brizna

  varying vec3 vBase;
  varying vec4 vTip;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vWind;
  varying vec3 vWorld;

  void main() {
    float h = aParams.x;

    // LOD por distancia: la brizna se encoge hasta desaparecer. A partir de
    // cierta distancia mide menos de un píxel y solo aporta centelleo; el
    // color del prado ya lo pone la textura del terreno, que usa la misma
    // paleta justamente para que el relevo no se note.
    float camDist = length( cameraPosition - aOffset );
    h *= 1.0 - smoothstep( 95.0, 175.0, camDist );
    if ( h < 0.01 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
    float w = aParams.y;
    float yaw = aParams.z;
    float stiff = aParams.w;

    vec3 local = position;
    local.x *= w;
    local.z *= w;
    local.y *= h;

    float t = uv.y;

    // Viento en tres escalas.
    //
    //  1. Frente de racha: una onda muy larga y lenta que recorre el prado.
    //     Es lo que hace que se vea *pasar* el viento en vez de ondear todo a
    //     la vez.
    //  2. Ondulación media: el vaivén propio de la brizna.
    //  3. Aleteo: temblor corto de la punta.
    float along = dot( aOffset.xz, uWindDir );
    float front = sin( uTime * 0.38 - along * 0.013 );
    float gustStrength = 0.45 + 0.55 * front * front;

    float phase = along * 0.045;
    float gust = sin( uTime * 0.85 - phase ) * 0.62 + sin( uTime * 2.1 - phase * 2.3 ) * 0.28;
    float flutter = sin( uTime * 7.2 + aOffset.x * 0.9 + aOffset.z * 0.7 ) * 0.14;
    float bend = ( gust * gustStrength + flutter ) * uWindStrength * ( 1.0 - stiff );

    // La curvatura crece con el cuadrado de la altura: la base no se mueve.
    float curve = bend * t * t;
    // Arqueo en reposo. Va alto a propósito: la brizna de la referencia mide
    // 0.6 de alto y se desplaza 0.4 de lado, o sea que cae casi en cuarto de
    // círculo. Una brizna recta se lee como una púa.
    curve += ( 1.0 - stiff ) * 0.42 * t * t;

    vec3 windVec = vec3( uWindDir.x, 0.0, uWindDir.y );
    float cy = cos( yaw );
    float sy = sin( yaw );
    vec3 rotated = vec3(
      local.x * cy - local.z * sy,
      local.y,
      local.x * sy + local.z * cy
    );
    rotated += windVec * curve * h;
    rotated.y -= curve * curve * h * 0.45; // se acorta al doblarse

    vec3 world = aOffset + rotated;

    // Normal del pliegue: uv.x dice de qué lado del nervio estamos, así que
    // cada mitad de la V mira hacia fuera. Es lo que da el canto iluminado.
    //
    // Domina la componente vertical. Una brizna vista desde arriba es una
    // superficie iluminada con un canto en sombra, no una pared: con la normal
    // casi horizontal, ndl se quedaba corto en la mitad de las briznas y el
    // prado entero caía en la banda de sombra — 88.000 cerdas azul marino
    // clavadas en un césped verde.
    float side = uv.x * 2.0 - 1.0;
    vec3 faceN = vec3( sy, 0.0, cy );
    vec3 sideN = vec3( cy, 0.0, -sy );
    vec3 bladeNormal = normalize( faceN * 0.45 + sideN * side * 0.62 + vec3( 0.0, 1.0, 0.0 ) );
    // Un poco de la normal del terreno: la mata se tumba con la ladera.
    vNormalW = normalize( mix( bladeNormal, aNormal, 0.22 ) + windVec * curve * 0.35 );

    vBase = aColor;
    vTip = aTip;
    vWorld = world;
    vHeight = t;
    vWind = clamp( abs( bend ), 0.0, 1.0 );

    vec4 worldPosition = vec4( world, 1.0 );
    #include <shadowmap_vertex>

    vec4 mvPosition = viewMatrix * worldPosition;
    #include <fog_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  uniform vec3 uSunDir;
  uniform vec3 uShadowColor;
  uniform vec3 uFlowerA;
  uniform vec3 uFlowerB;
  uniform vec3 uFlowerC;
  uniform float uTerminator;
  uniform float uEdge;
  uniform float uRimLight;
  uniform sampler2D uCloudMap;
  uniform float uCloudTime;
  uniform float uCloudScale;
  uniform vec2 uCloudDrift;
  uniform float uCloudShadow;
  uniform vec3 uTimeLight;
  uniform vec3 uTimeShade;

  varying vec3 vBase;
  varying vec4 vTip;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vWind;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize( vNormalW );

    // Color propio de la brizna: de la base a la punta.
    //
    // El verde de base se queda en el tercio inferior, que es donde la brizna
    // está entre otras briznas. Por encima manda la punta. Con el exponente
    // alto que llevaba antes, casi toda la brizna era el verde azulado de la
    // base y la mata se leía oscura sobre el prado en vez de encenderlo.
    vec3 blade = mix( vBase, vTip.rgb, pow( vHeight, 0.85 ) );

    // Flor: remata el tallo. Tres colores, elegidos por brizna.
    //
    // La cabeza ocupa solo la punta. Cubriendo el tercio superior, y siendo
    // los pétalos casi blancos, cada brizna florida se leía como un tallo de
    // paja: a ras de suelo el prado parecía un rastrojo. Y el pétalo se
    // ensucia con el verde de la brizna para que no sea un punto de tiza.
    if ( vTip.w > 0.0 ) {
      float pick = fract( vTip.w * 7.0 );
      vec3 petal = pick < 0.34 ? uFlowerA : ( pick < 0.67 ? uFlowerB : uFlowerC );
      petal = mix( petal, blade, 0.22 );
      float head = smoothstep( 0.80, 0.94, vHeight );
      blade = mix( blade, petal, head );
    }

    // La punta se aclara al tensarse con la racha: el «color change» del
    // esquema de la referencia. Es sutil, pero es lo que hace que el prado
    // parezca respirar en vez de limitarse a moverse.
    blade = mix( blade, vTip.rgb, vWind * 0.30 * vHeight );

    // Escalón duro. En el material del suelo de la referencia las dos paradas
    // de la rampa están en la MISMA posición: un corte perfecto. Aquí se deja
    // un borde de un par de centésimas para que no haga escalera de píxeles.
    float ndl = dot( n, normalize( uSunDir ) );
    float t = clamp( ndl * 0.5 + 0.5, 0.0, 1.0 );
    // La sombra proyectada entra por el mismo sitio, así que la sombra de un
    // árbol sobre el prado cae en la misma banda azul que su propia sombra y
    // se lee como una sola mancha pintada. Se endurece el borde: el PCF la
    // entrega difuminada y aquí queremos contorno.
    t = min( t, smoothstep( 0.28, 0.60, getShadowMask() ) );
    // Sombra de nube: la misma que barre el terreno, del mismo mapa y a la
    // misma escala. Si solo la llevara el suelo, el prado se partiría en dos
    // capas en cuanto pasara una nube.
    {
      vec2 cuv = vWorld.xz * uCloudScale + uCloudDrift * uCloudTime;
      t *= 1.0 - smoothstep( 0.46, 0.60, texture2D( uCloudMap, cuv ).r ) * uCloudShadow;
    }
    // Oclusión de mata: la base de la brizna está siempre entre hierba.
    t *= mix( 0.62, 1.0, pow( vHeight, 0.8 ) );
    float lit = smoothstep( uTerminator - uEdge, uTerminator + uEdge, t );

    // La sombra conserva bastante del tono de la brizna: el azul medido en la
    // referencia (#00344b) es el de una pradera densa vista en masa. Aplicado
    // a una brizna suelta y visible entera, la pinta de azul marino.
    vec3 shaded = mix( uShadowColor, blade * 0.52, 0.5 );
    // La hora del día tiñe luz y sombra por separado, igual que en el resto
    // del sombreado cel: el prado tiene que virar con la escena o se queda
    // verde mediodía bajo un cielo de noche.
    vec3 color = mix( shaded * uTimeShade, blade * uTimeLight, lit );

    // Contraluz en el filo de la punta: la brizna se enciende por dentro.
    float back = clamp( -ndl, 0.0, 1.0 );
    color += vTip.rgb * uTimeLight * pow( back, 2.2 ) * uRimLight * pow( vHeight, 2.0 );

    gl_FragColor = vec4( color, 1.0 );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Pares base/punta.
 *
 * El primero está medido sobre el material `Grass` del .blend de referencia
 * (base #007059, punta #8ac200). Los demás son variaciones sobre él, no
 * paletas sueltas: el esquema insiste en «choose the right pair» justamente
 * porque lo que estropea el efecto es mezclar verdes que no comparten familia.
 */
const PAIRS = [
  // La punta se ha traído hacia el verde del suelo desde el #8ac200 medido.
  //
  // En la referencia la brizna y el terreno son el MISMO material, así que ese
  // amarillo verdoso casa con lo que tiene debajo. Aquí el suelo es una
  // textura de prado que, iluminada, da un #4da63d: contra ese fondo el
  // #8ac200 tiene casi el doble de rojo y cada brizna se leía como una espiga
  // de paja clavada en el césped. La base sí conserva el azulado medido, que
  // es lo que le da el tono a la mata.
  [0x0a6a52, 0x6cb02c],
  [0x0b5c46, 0x5c9d28],
  [0x17604a, 0x86c03a],
  [0x3f6448, 0x93ae5c],   // rodal agostado
];

/** Blanco, ámbar y rosa: las tres muestras de flor del esquema. */
const FLOWERS = [0xf4f1e8, 0xf0b93f, 0xe86fae];

/**
 * @param {import('./Terrain.js').TerrainField} field
 * @param {THREE.Vector3} sunDirection
 * @param {object} opts
 * @param {Array<{x:number,z:number,radius:number}>} opts.keepOut
 *   Círculos donde NO se siembra. Sin ellos la hierba brota a través de las
 *   losas de los estrados, que están al mismo nivel que el terreno aplanado.
 */
export function createGrass(field, sunDirection, {
  count = 42000,
  radius = WORLD.radius * 1.02,
  keepOut = [],
  seed = 13,
} = {}) {
  const random = makeRandom(seed);
  const noise = new SimplexNoise(seed + 5);
  const geometry = bladeGeometry();

  const offsets = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const tips = new Float32Array(count * 4);
  const normals = new Float32Array(count * 3);

  const pairs = PAIRS.map(([a, b]) => [new THREE.Color(a), new THREE.Color(b)]);
  const tmpBase = new THREE.Color();
  const tmpTip = new THREE.Color();

  let placed = 0;
  let guard = 0;
  let flowers = 0;
  while (placed < count && guard < count * 30) {
    guard++;
    const r = Math.sqrt(random()) * radius;
    const a = random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    // Ni sobre el enlosado ni sobre los caminos: una brizna de un metro
    // atraviesa la losa.
    //
    // Distancia al cuadrado, no `Math.hypot`. Con los caminos, la lista pasó de
    // seis círculos a casi doscientos, y esta prueba se corre para cada uno de
    // los cientos de miles de candidatos: es el bucle más caliente del arranque
    // entero. La raíz cuadrada no aporta nada aquí.
    let blocked = false;
    for (const zone of keepOut) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz < zone.radius * zone.radius) { blocked = true; break; }
    }
    if (blocked) continue;

    const y = field.height(x, z);
    if (y < WORLD.seaLevel + 5) continue;      // ni en el agua ni en la playa
    const normal = field.normal(x, z);
    if (normal.y < 0.72) continue;             // ni en las paredes de roca

    // Ni sobre los afloramientos que el terreno ya pinta como piedra: es la
    // misma función, así que hierba y color coinciden siempre.
    const rocky = field.rockiness(x, z);
    if (rocky > 0.55 && random() < rocky) continue;

    // Densidad por manchas: la hierba crece a rodales, no repartida.
    const density = noise.fbm(x * 0.02, z * 0.02, 4.4, 3, 2.1, 0.5) * 0.5 + 0.5;
    if (random() > 0.42 + density * 0.78) continue;

    const i = placed;
    offsets[i * 3] = x;
    offsets[i * 3 + 1] = y - 0.08;
    offsets[i * 3 + 2] = z;

    const height = (0.30 + Math.pow(random(), 1.7) * 0.72) * (0.75 + density * 0.6);
    params[i * 4] = height;
    // Brizna ancha y baja: la de un fondo pintado tiene cuerpo y forma mata.
    // Estrecha y alta se lee como aguja, sobre todo con una densidad de una
    // brizna por metro cuadrado, que es la que cabe sin salirse del presupuesto.
    params[i * 4 + 1] = 0.095 + random() * 0.105;
    params[i * 4 + 2] = random() * Math.PI * 2;
    params[i * 4 + 3] = 0.12 + random() * 0.55;

    // Par de color por MANCHA, no por brizna.
    //
    // Repartir el par al azar por brizna da un ruido de sal y pimienta que a
    // media distancia se promedia a un verde plano. Repartirlo por regiones
    // grandes es lo que produce esas vetas de tono que tiene el prado pintado.
    const region = noise.fbm(x * 0.0075, z * 0.0075, 61.7, 3, 2.2, 0.5) * 0.5 + 0.5;
    // La cuarta pareja, la agostada, se reserva a lo alto y expuesto.
    const exposure = Math.min(1, Math.max(0, (y - WORLD.plateau + 12) / 46));
    let pair = Math.min(PAIRS.length - 2, Math.floor(region * (PAIRS.length - 1)));
    if (exposure > 0.62 && random() < (exposure - 0.62) * 2.2) pair = PAIRS.length - 1;

    const jitter = 0.86 + random() * 0.28;
    tmpBase.copy(pairs[pair][0]).multiplyScalar(jitter);
    tmpTip.copy(pairs[pair][1]).multiplyScalar(jitter);
    colors[i * 3] = tmpBase.r;
    colors[i * 3 + 1] = tmpBase.g;
    colors[i * 3 + 2] = tmpBase.b;
    tips[i * 4] = tmpTip.r;
    tips[i * 4 + 1] = tmpTip.g;
    tips[i * 4 + 2] = tmpTip.b;

    // Capa de flores: en claros, y agrupadas. Un 4 % repartido al azar no se
    // ve; un 4 % en corros sí, que es como salen en el campo y en la lámina.
    const bloom = noise.fbm(x * 0.055, z * 0.055, 12.9, 2, 2.3, 0.5) * 0.5 + 0.5;
    if (bloom > 0.70 && random() < (bloom - 0.70) * 1.7) {
      // Se guarda un valor distinto de cero que además elige el pétalo.
      tips[i * 4 + 3] = 0.15 + random() * 0.8;
      flowers++;
    } else {
      tips[i * 4 + 3] = 0;
    }

    normals[i * 3] = normal.x;
    normals[i * 3 + 1] = normal.y;
    normals[i * 3 + 2] = normal.z;

    placed++;
  }

  geometry.instanceCount = placed;
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets.subarray(0, placed * 3), 3));
  geometry.setAttribute('aParams', new THREE.InstancedBufferAttribute(params.subarray(0, placed * 4), 4));
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors.subarray(0, placed * 3), 3));
  geometry.setAttribute('aTip', new THREE.InstancedBufferAttribute(tips.subarray(0, placed * 4), 4));
  geometry.setAttribute('aNormal', new THREE.InstancedBufferAttribute(normals.subarray(0, placed * 3), 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.4);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
      uWindStrength: { value: 0.62 },
      uSunDir: { value: new THREE.Vector3() },
      uShadowColor: { value: new THREE.Color(ANIME.grass.shadow) },
      uFlowerA: { value: new THREE.Color(FLOWERS[0]) },
      uFlowerB: { value: new THREE.Color(FLOWERS[1]) },
      uFlowerC: { value: new THREE.Color(FLOWERS[2]) },
      // Terminador y borde: el corte cae por debajo de la mitad para que el
      // prado se lea mayormente iluminado y la sombra sea una mancha decidida.
      uTerminator: { value: 0.40 },
      uEdge: { value: 0.045 },
      uRimLight: { value: 0.30 },
      uCloudShadow: { value: 0.42 },
      uTimeLight: { value: new THREE.Vector3(1, 1, 1) },
      uTimeShade: { value: new THREE.Vector3(1, 1, 1) },
    },
  ]);
  // `UniformsUtils.merge` clona por valor: hay que volver a poner los objetos
  // que se comparten o se actualizan desde fuera.
  uniforms.uWindDir.value = new THREE.Vector2(0.82, 0.57).normalize();
  uniforms.uSunDir.value = sunDirection.clone().normalize();
  // Compartidos con el resto del sombreado cel: se actualizan desde el mundo.
  uniforms.uCloudMap = TOON_CLOUDS.map;
  uniforms.uCloudTime = TOON_CLOUDS.time;
  uniforms.uCloudScale = TOON_CLOUDS.scale;
  uniforms.uCloudDrift = TOON_CLOUDS.drift;
  uniforms.uTimeLight = TOON_TIME.light;
  uniforms.uTimeShade = TOON_TIME.shade;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    lights: true,
    fog: true,
    toneMapped: true,
  });
  registerClock(uniforms);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'grass';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  mesh.userData.bladeCount = placed;
  mesh.userData.flowerCount = flowers;
  return mesh;
}
