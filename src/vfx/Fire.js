/**
 * Fuego del brasero.
 *
 * Tres capas: pavesas que suben, un núcleo de llama y una luz que parpadea.
 * Las pavesas se mueven enteras en el vertex shader — cada una repite su vida
 * en bucle según su semilla, así que no hay estado que actualizar en CPU.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE } from '../config.js';

const emberVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uRise;
  uniform float uSpread;
  uniform float uIntensity;
  attribute vec4 aSeed;   // fase, radio, velocidad, tamaño
  varying float vLife;
  varying float vSize;

  void main() {
    // Vida normalizada 0..1, desfasada por partícula.
    float life = fract( uTime * aSeed.z * 0.35 + aSeed.x );
    vLife = life;

    float angle = aSeed.x * 6.2831 + life * 2.6;
    float radius = aSeed.y * ( 0.35 + life * uSpread );
    // Serpenteo: la pavesa no sube recta, la arrastran las corrientes.
    float wobble = sin( life * 9.0 + aSeed.x * 12.0 ) * 0.22 * life;

    vec3 p = vec3(
      cos( angle ) * radius + wobble,
      life * uRise,
      sin( angle ) * radius + wobble * 0.7
    );

    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    vSize = aSeed.w;
    gl_PointSize = min(
      aSeed.w * 0.7 * uPixelRatio * ( 120.0 / max( -mv.z, 1.0 ) ) * ( 1.0 - life * 0.55 ) * uIntensity,
      34.0 * uPixelRatio
    );
  }
`;

const emberFragment = /* glsl */ `
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uIntensity;
  varying float vLife;
  varying float vSize;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length( c );
    if ( d > 0.5 ) discard;
    float core = pow( smoothstep( 0.5, 0.0, d ), 2.2 );

    // Rampa: blanco-amarillo abajo, naranja arriba, se apaga al final.
    vec3 col = mix( uHot, uCool, smoothstep( 0.0, 0.55, vLife ) );
    col = mix( vec3( 1.0, 0.95, 0.82 ), col, smoothstep( 0.0, 0.18, vLife ) );

    float fade = ( 1.0 - smoothstep( 0.55, 1.0, vLife ) ) * smoothstep( 0.0, 0.06, vLife );
    float a = core * fade * uIntensity * 0.30;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( col * ( 1.0 + core ), a );
  }
`;

/**
 * @param {object} opts
 * @param {number} opts.count   Número de pavesas.
 * @param {number} opts.rise    Altura que alcanzan.
 * @param {number} opts.radius  Radio del brasero.
 */
export function createFire({
  count = 320,
  rise = 4.2,
  radius = 0.7,
  spread = 1.5,
  seed = 3,
  intensity = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = 'fire';
  const random = makeRandom(seed);

  // ---- Pavesas ------------------------------------------------------------
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = random();
    seeds[i * 4 + 1] = radius * (0.2 + random() * 0.8);
    seeds[i * 4 + 2] = 0.55 + random() * 0.9;
    seeds[i * 4 + 3] = 1.2 + Math.pow(random(), 2.6) * 4.0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rise / 2, 0), rise);

  const emberUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
    uRise: { value: rise },
    uSpread: { value: spread },
    uIntensity: { value: intensity },
    uHot: { value: new THREE.Color(PALETTE.ember) },
    uCool: { value: new THREE.Color(PALETTE.emberDeep) },
  };
  const embers = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: emberUniforms,
      vertexShader: emberVertex,
      fragmentShader: emberFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  registerClock(emberUniforms);
  embers.frustumCulled = false;
  group.add(embers);

  // ---- Núcleo de llama ----------------------------------------------------
  // Cono invertido con ruido: da masa a la llama, que solo con puntos
  // parecería un surtidor de chispas.
  const coreUniforms = {
    uTime: { value: 0 },
    uHot: { value: new THREE.Color(0xfff0c4) },
    uMid: { value: new THREE.Color(PALETTE.ember) },
    uCool: { value: new THREE.Color(PALETTE.emberDeep) },
    uIntensity: { value: intensity },
  };
  const coreGeo = new THREE.ConeGeometry(radius * 1.15, rise * 0.62, 20, 12, true);
  coreGeo.translate(0, rise * 0.31, 0);
  const core = new THREE.Mesh(
    coreGeo,
    new THREE.ShaderMaterial({
      uniforms: coreUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vT;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vT = uv.y;
          vec3 p = position;
          // La llama ondea: desplazamiento lateral creciente con la altura.
          float sway = sin( uTime * 3.1 + uv.y * 5.0 ) * 0.16 + sin( uTime * 5.7 + uv.x * 9.0 ) * 0.07;
          p.x += sway * uv.y * uv.y;
          p.z += cos( uTime * 2.6 + uv.y * 4.2 ) * 0.13 * uv.y * uv.y;
          p.xz *= 1.0 - uv.y * 0.35;
          vec4 world = modelMatrix * vec4( p, 1.0 );
          vNormalW = normalize( mat3( modelMatrix ) * normal );
          vViewDirW = normalize( cameraPosition - world.xyz );
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uHot;
        uniform vec3 uMid;
        uniform vec3 uCool;
        uniform float uIntensity;
        varying float vT;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float rim = pow( 1.0 - abs( dot( normalize( vNormalW ), normalize( vViewDirW ) ) ), 1.5 );
          vec3 col = mix( uHot, uMid, smoothstep( 0.0, 0.45, vT ) );
          col = mix( col, uCool, smoothstep( 0.45, 1.0, vT ) );
          float flick = 0.82 + 0.18 * sin( uTime * 13.0 ) * sin( uTime * 7.3 + 1.7 );
          float a = rim * ( 1.0 - smoothstep( 0.35, 1.0, vT ) ) * flick * uIntensity * 0.65;
          gl_FragColor = vec4( col * ( 1.0 + rim ), a );
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  registerClock(coreUniforms);
  group.add(core);

  // ---- Luz ---------------------------------------------------------------
  const light = new THREE.PointLight(PALETTE.ember, 16, 28, 2);
  light.position.y = rise * 0.28;
  light.castShadow = false;
  group.add(light);

  group.userData.update = (elapsed) => {
    // Parpadeo con dos frecuencias: ni regular ni ruido puro.
    const f =
      0.78 +
      0.14 * Math.sin(elapsed * 9.3) +
      0.08 * Math.sin(elapsed * 23.1 + 1.3) +
      0.06 * Math.sin(elapsed * 3.7);
    light.intensity = 15 * f * intensity;
  };
  group.userData.light = light;
  group.userData.embers = embers;
  group.userData.setIntensity = (v) => {
    emberUniforms.uIntensity.value = v;
    coreUniforms.uIntensity.value = v;
  };

  return group;
}

/**
 * Humo: pluma tenue sobre la llama. Se ve sobre todo a contraluz.
 */
export function createSmoke({ count = 90, rise = 14, radius = 0.9, seed = 9 } = {}) {
  const random = makeRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = random();
    seeds[i * 4 + 1] = radius * (0.3 + random() * 0.9);
    seeds[i * 4 + 2] = 0.16 + random() * 0.2;
    seeds[i * 4 + 3] = 5 + random() * 11;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rise / 2, 0), rise);

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
    uRise: { value: rise },
    uSpread: { value: 3.2 },
    uIntensity: { value: 1 },
    uWind: { value: new THREE.Vector2(0.9, 0.5) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uRise;
      uniform float uSpread;
      uniform vec2 uWind;
      attribute vec4 aSeed;
      varying float vLife;
      void main() {
        float life = fract( uTime * aSeed.z * 0.12 + aSeed.x );
        vLife = life;
        float angle = aSeed.x * 6.2831;
        float radius = aSeed.y * ( 0.4 + life * uSpread );
        vec3 p = vec3(
          cos( angle ) * radius + uWind.x * life * life * 5.0,
          life * uRise,
          sin( angle ) * radius + uWind.y * life * life * 5.0
        );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(
          aSeed.w * uPixelRatio * ( 120.0 / max( -mv.z, 1.0 ) ) * ( 0.5 + life * 1.6 ),
          70.0 * uPixelRatio
        );
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length( c );
        if ( d > 0.5 ) discard;
        float soft = pow( smoothstep( 0.5, 0.0, d ), 1.5 );
        float fade = smoothstep( 0.0, 0.2, vLife ) * ( 1.0 - smoothstep( 0.4, 1.0, vLife ) );
        float a = soft * fade * 0.055;
        if ( a < 0.003 ) discard;
        gl_FragColor = vec4( vec3( 0.62, 0.60, 0.58 ), a );
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  registerClock(uniforms);

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'smoke';
  return points;
}
