/**
 * Faro de santuario: haz vertical de luz que marca cada sección desde lejos.
 *
 * Es un cilindro invertido con blending aditivo. Se ve desde cualquier punto
 * del promontorio y se apaga cuando la cámara está encima, que es cuando
 * estorbaría en vez de orientar.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';

export function createBeacon({
  radius = 3.2,
  height = 42,
  color = 0x4fe6d8,
  intensity = 0.55,
  segments = 28,
} = {}) {
  const geometry = new THREE.CylinderGeometry(radius * 1.3, radius * 0.72, height, segments, 8, true);
  geometry.translate(0, height / 2, 0);

  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uHeight: { value: height },
    uActive: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      varying float vY;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vNormalW = normalize( mat3( modelMatrix ) * normal );
        vViewDirW = normalize( cameraPosition - world.xyz );
        vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uHeight;
      uniform float uActive;
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      varying float vY;

      void main() {
        float t = clamp( vY / uHeight, 0.0, 1.0 );
        // Desvanecido arriba y en la base: el haz nace y muere en el aire.
        float vertical = ( 1.0 - pow( t, 0.75 ) ) * smoothstep( 0.0, 0.06, t );
        // Silueta: el borde del cilindro brilla más que el centro.
        float rim = pow( 1.0 - abs( dot( normalize( vNormalW ), normalize( vViewDirW ) ) ), 2.6 );
        // Ondas que suben por el haz.
        float wave = 0.72 + 0.28 * sin( t * 14.0 - uTime * 1.7 );
        // uActive multiplica, no suma: sumándolo, el haz seguía encendido
        // aunque la intensidad estuviera a cero, y se plantaba en mitad del
        // encuadre justo al enfocar la sección.
        float a = vertical * rim * wave * uIntensity * ( 1.0 + uActive * 0.8 );
        gl_FragColor = vec4( uColor * ( 1.0 + uActive * 0.5 ), a );
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
  mesh.name = 'beacon';
  mesh.renderOrder = 3;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/**
 * Anillos que se expanden desde el suelo. Marcan que un santuario "responde"
 * cuando el visitante lo enfoca.
 */
export function createPulseRings({
  radius = 12,
  color = 0x4fe6d8,
  count = 3,
  speed = 0.32,
  intensity = 0.9,
} = {}) {
  const geometry = new THREE.RingGeometry(0.02, 1, 96, 1);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uRadius: { value: radius },
    uCount: { value: count },
    uSpeed: { value: speed },
    uIntensity: { value: intensity },
    uActive: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uRadius;
      varying vec2 vLocal;
      void main() {
        vLocal = position.xz;
        vec3 p = position * vec3( uRadius, 1.0, uRadius );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uCount;
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uActive;
      varying vec2 vLocal;

      void main() {
        float r = length( vLocal );
        if ( r > 1.0 ) discard;
        float acc = 0.0;
        for ( int i = 0; i < 4; i++ ) {
          if ( float( i ) >= uCount ) break;
          float phase = fract( uTime * uSpeed + float( i ) / uCount );
          float ring = 1.0 - smoothstep( 0.0, 0.045, abs( r - phase ) );
          // Se debilita al alejarse del centro: la onda pierde fuerza.
          acc += ring * ( 1.0 - phase ) * ( 1.0 - phase );
        }
        float a = acc * uIntensity * uActive;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( uColor, a );
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
  mesh.name = 'pulse-rings';
  mesh.renderOrder = 4;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
