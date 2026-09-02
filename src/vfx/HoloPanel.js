/**
 * Lámina proyectada: la "pantalla" que flota sobre cada monolito.
 *
 * Es un plano con la imagen del proyecto y un tratamiento de proyección
 * arcana — marco encendido, barrido vertical, parpadeo y esquinas marcadas.
 * El revelado va por uniform, así que la lámina puede aparecer y esfumarse
 * sin tocar la escena.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  varying vec2 vUvP;
  void main() {
    vUvP = uv;
    vec3 p = position;
    // Ondulación leve: la proyección no está del todo estable.
    p.z += sin( uv.y * 9.0 + uTime * 1.4 ) * 0.018 * uReveal;
    p.z += sin( uv.x * 6.0 - uTime * 0.9 ) * 0.012 * uReveal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uReveal;   // 0..1 aparición
  uniform float uHover;    // 0..1 puntero encima
  uniform float uActive;   // 0..1 sección enfocada
  uniform float uAspect;
  varying vec2 vUvP;

  float hash21( vec2 p ) {
    p = fract( p * vec2( 233.34, 851.73 ) );
    p += dot( p, p + 23.45 );
    return fract( p.x * p.y );
  }

  // Rectángulo con esquinas redondeadas, en unidades de UV corregidas.
  float roundedBox( vec2 uv, vec2 halfSize, float r ) {
    vec2 d = abs( uv ) - halfSize + r;
    return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ) - r;
  }

  void main() {
    vec2 uv = vUvP;
    vec2 centered = ( uv - 0.5 ) * vec2( uAspect, 1.0 );
    vec2 halfSize = vec2( 0.5 * uAspect, 0.5 ) - 0.012;

    float d = roundedBox( centered, halfSize, 0.055 );
    if ( d > 0.0 ) discard;

    // Revelado: barrido de abajo arriba. El frente avanza con uReveal y el
    // margen extra garantiza que a 0 no se vea nada y a 1 se vea todo — con
    // el rango justo, la lámina se quedaba invisible incluso revelada.
    float front = uReveal * 1.3 - 0.15;
    float wipe = smoothstep( uv.y - 0.10, uv.y + 0.02, front );
    if ( wipe < 0.004 ) discard;

    vec3 image = texture2D( uMap, uv ).rgb;

    // Barrido horizontal de líneas: proyección, no pantalla LCD.
    float scan = 0.94 + 0.06 * sin( uv.y * 420.0 );
    float sweep = smoothstep( 0.0, 0.06, abs( fract( uv.y * 0.5 - uTime * 0.09 ) - 0.5 ) );
    image *= scan * ( 0.86 + sweep * 0.2 );

    // Tinte arcano y realce al pasar el puntero.
    image = mix( image, image * uColor * 1.9, 0.22 );
    image *= 1.05 + uActive * 0.30 + uHover * 0.40;

    // Marco: línea encendida pegada al borde.
    float frame = smoothstep( -0.016, -0.004, d );
    vec3 col = mix( image, uColor * ( 2.2 + uHover * 2.2 ), frame );

    // Esquinas marcadas: pequeñas escuadras que refuerzan el encuadre.
    vec2 c = abs( centered );
    float corner = step( halfSize.x - 0.13, c.x ) * step( halfSize.y - 0.13, c.y );
    col += uColor * corner * frame * 2.4;

    // Parpadeo y grano de proyección.
    float flicker = 0.96 + 0.04 * sin( uTime * 23.0 + hash21( vec2( floor( uTime * 12.0 ) ) ) * 6.0 );
    col *= flicker;
    col += ( hash21( uv * 700.0 + uTime ) - 0.5 ) * 0.045;

    float alpha = ( 0.90 + uHover * 0.1 ) * wipe;
    gl_FragColor = vec4( col, alpha );
  }
`;

/**
 * @param {THREE.Texture} texture
 * @param {object} opts
 * @param {number} opts.width   Ancho en unidades de mundo.
 * @param {number} opts.aspect  Relación de aspecto de la imagen.
 */
export function createHoloPanel(texture, {
  width = 6,
  aspect = 1.5,
  color = 0x4fe6d8,
  reveal = 1,
} = {}) {
  const uniforms = {
    uMap: { value: texture },
    uColor: { value: new THREE.Color(color) },
    uTime: { value: Math.random() * 40 },
    uReveal: { value: reveal },
    uHover: { value: 0 },
    uActive: { value: 0 },
    uAspect: { value: aspect },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  registerClock(uniforms);

  const geometry = new THREE.PlaneGeometry(width, width / aspect, 24, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'holo-panel';
  mesh.renderOrder = 6;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/**
 * Haz que sale del monolito hacia la lámina: explica de dónde viene la
 * proyección. Sin él las láminas parecen pegadas en el aire.
 */
export function createProjectorBeam({ length = 4, radius = 0.55, color = 0x4fe6d8 } = {}) {
  const geometry = new THREE.ConeGeometry(radius, length, 20, 1, true);
  geometry.translate(0, length / 2, 0);

  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uIntensity: { value: 0.5 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      varying float vT;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vNormalW = normalize( mat3( modelMatrix ) * normal );
        vViewDirW = normalize( cameraPosition - world.xyz );
        vT = uv.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      varying float vT;
      void main() {
        float rim = pow( 1.0 - abs( dot( normalize( vNormalW ), normalize( vViewDirW ) ) ), 1.7 );
        float fade = ( 1.0 - vT ) * smoothstep( 0.0, 0.15, vT );
        float wave = 0.75 + 0.25 * sin( vT * 18.0 - uTime * 3.0 );
        gl_FragColor = vec4( uColor, rim * fade * wave * uIntensity );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  registerClock(uniforms);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 5;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
