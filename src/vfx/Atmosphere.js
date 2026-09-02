/**
 * Partículas de ambiente: polen, esporas y pavesas arrastradas por el viento.
 *
 * Un único sistema de puntos con el movimiento resuelto en el vertex shader.
 * No hay simulación en CPU: cada partícula tiene una órbita determinista a
 * partir de su semilla, así que 3000 motas cuestan lo mismo que 30.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE, WORLD } from '../config.js';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uWind;
  attribute vec3 aSeed;     // fase, radio de órbita, velocidad
  attribute float aScale;
  attribute vec3 aColor;
  varying float vTwinkle;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec3 p = position;

    // Deriva: la mota flota en una órbita elíptica lenta mientras el viento
    // la empuja en una dirección dominante.
    float t = uTime * aSeed.z;
    p.x += sin( t + aSeed.x ) * aSeed.y;
    p.z += cos( t * 0.83 + aSeed.x * 1.7 ) * aSeed.y;
    p.y += sin( t * 0.61 + aSeed.x * 2.3 ) * aSeed.y * 0.55;
    p += uWind * mod( uTime * 0.35 + aSeed.x * 9.0, 24.0 );

    // Reciclado: se envuelve dentro de una caja para no perderse en el mar.
    p.x = mod( p.x + 420.0, 840.0 ) - 420.0;
    p.z = mod( p.z + 420.0, 840.0 ) - 420.0;

    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    // Tope al tamaño: una mota que pasa cerca de la cámara se convertía en
    // un disco blanco de doscientos píxeles que el bloom remataba.
    gl_PointSize = min(
      uSize * aScale * uPixelRatio * ( 90.0 / max( vDepth, 1.0 ) ),
      26.0 * uPixelRatio
    );

    vTwinkle = 0.45 + 0.55 * sin( uTime * 2.1 + aSeed.x * 5.0 );
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length( c );
    if ( d > 0.5 ) discard;
    float core = smoothstep( 0.5, 0.0, d );
    float halo = pow( core, 3.5 );
    // Se apaga muy cerca (molestaría en el objetivo) y muy lejos (ruido).
    float near = smoothstep( 6.0, 26.0, vDepth );
    float far = 1.0 - smoothstep( 200.0, 420.0, vDepth );
    float a = ( halo * 0.85 + core * 0.25 ) * vTwinkle * uOpacity * near * far;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vColor * ( 1.0 + halo ), a );
  }
`;

/**
 * @param {import('../world/Terrain.js').TerrainField} field
 */
export function createMotes(field, { count = 2600, seed = 7 } = {}) {
  const random = makeRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const warm = new THREE.Color(PALETTE.gold);
  const cool = new THREE.Color(PALETTE.arcane);
  const pale = new THREE.Color(0xd8e6e2);
  const tmp = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard++;
    // Distribución sesgada al centro: donde está lo que hay que mirar.
    const r = Math.pow(random(), 0.62) * WORLD.radius * 1.25;
    const a = random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const ground = field.height(x, z);
    if (ground < WORLD.seaLevel + 1) continue;

    const i = placed;
    positions[i * 3] = x;
    positions[i * 3 + 1] = ground + 0.6 + Math.pow(random(), 1.7) * 34;
    positions[i * 3 + 2] = z;

    seeds[i * 3] = random() * Math.PI * 2;
    seeds[i * 3 + 1] = 0.6 + random() * 3.4;
    seeds[i * 3 + 2] = 0.12 + random() * 0.45;

    scales[i] = 0.45 + Math.pow(random(), 2.2) * 1.9;

    const pick = random();
    if (pick < 0.55) tmp.copy(pale);
    else if (pick < 0.85) tmp.copy(warm);
    else tmp.copy(cool);
    tmp.multiplyScalar(0.8 + random() * 0.5);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;

    placed++;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, placed * 3), 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds.subarray(0, placed * 3), 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales.subarray(0, placed), 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors.subarray(0, placed * 3), 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: 5.5 },
    uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
    uWind: { value: new THREE.Vector3(0.16, 0.012, 0.09) },
    uOpacity: { value: 0.85 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  registerClock(uniforms);

  const points = new THREE.Points(geometry, material);
  points.name = 'motes';
  points.frustumCulled = false;
  points.userData.uniforms = uniforms;
  return points;
}

/**
 * Gaviotas: siluetas oscuras que planean en círculo sobre el acantilado.
 * Cuestan cuatro triángulos y meten mucha vida en el plano general.
 */
export function createBirds({ count = 14, seed = 21 } = {}) {
  const random = makeRandom(seed);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.instanceCount = count;
  // Un ala a cada lado, dos triángulos.
  const verts = new Float32Array([
    0, 0, 0, -1, 0.05, -0.35, -1, 0.05, 0.35,
    0, 0, 0, 1, 0.05, 0.35, 1, 0.05, -0.35,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x1b232a) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec4 aOrbit;  // radio, altura, velocidad, fase
      attribute vec2 aCenter;
      varying float vFlap;
      void main() {
        float t = uTime * aOrbit.z + aOrbit.w;
        vec3 center = vec3(
          aCenter.x + cos( t ) * aOrbit.x,
          aOrbit.y + sin( t * 1.7 ) * 3.0,
          aCenter.y + sin( t ) * aOrbit.x
        );
        // Orientación: mirando en la dirección de vuelo.
        vec3 fwd = normalize( vec3( -sin( t ), 0.0, cos( t ) ) );
        vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), fwd ) );
        float flap = sin( uTime * 7.5 + aOrbit.w * 3.0 );
        vFlap = flap;
        vec3 local = position;
        local.y += abs( local.x ) * flap * 0.55;
        vec3 world = center + right * local.x * 1.6 + vec3( 0.0, local.y * 1.6, 0.0 ) + fwd * local.z * 1.6;
        gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vFlap;
      void main() {
        gl_FragColor = vec4( uColor, 0.55 + abs( vFlap ) * 0.2 );
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  registerClock(uniforms);

  const orbits = new Float32Array(count * 4);
  const centers = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    orbits[i * 4] = 40 + random() * 130;
    orbits[i * 4 + 1] = 55 + random() * 70;
    orbits[i * 4 + 2] = (random() > 0.5 ? 1 : -1) * (0.05 + random() * 0.09);
    orbits[i * 4 + 3] = random() * Math.PI * 2;
    centers[i * 2] = (random() - 0.5) * 260;
    centers[i * 2 + 1] = (random() - 0.5) * 260;
  }
  geometry.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbits, 4));
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 90, 0), 500);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'birds';
  mesh.userData.uniforms = uniforms;
  return mesh;
}
