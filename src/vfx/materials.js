/**
 * Materiales arcanos y el reloj compartido que los anima.
 *
 * Cualquier material con un uniform `uTime` se registra aquí; `tickMaterials`
 * los avanza todos de una vez desde el bucle principal. Así ningún módulo
 * tiene que acordarse de actualizar su propio reloj.
 */

import * as THREE from 'three';

const clocked = new Set();

/** Registra un objeto de uniforms que tenga `uTime`. */
export function registerClock(uniforms) {
  if (uniforms?.uTime) clocked.add(uniforms);
  return uniforms;
}

export function unregisterClock(uniforms) {
  clocked.delete(uniforms);
}

export function tickMaterials(dt) {
  for (const u of clocked) u.uTime.value += dt;
}

const arcaneVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec3 vObjPos;

  void main() {
    vObjPos = position;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vNormalW = normalize( mat3( modelMatrix ) * normal );
    vViewDirW = normalize( cameraPosition - world.xyz );
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const arcaneFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uPulse;
  uniform float uSpeed;
  uniform float uPhase;
  uniform float uRim;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;
  varying vec3 vObjPos;

  void main() {
    float fresnel = pow( 1.0 - clamp( dot( normalize( vNormalW ), normalize( vViewDirW ) ), 0.0, 1.0 ), 2.4 );
    float beat = 1.0 + uPulse * sin( uTime * uSpeed + uPhase );
    // Onda que recorre el trazo: la energía circula, no está quieta.
    float flow = 0.5 + 0.5 * sin( vObjPos.y * 3.4 - uTime * 2.1 + uPhase );

    vec3 core = mix( uColor, vec3( 1.0 ), 0.45 + flow * 0.25 );
    vec3 col = core * uIntensity * beat;
    col += uColor * fresnel * uRim * uIntensity;

    gl_FragColor = vec4( col, 1.0 );
  }
`;

/**
 * Material emisivo con borde de fresnel y latido. No recibe luz: es la luz.
 */
export function arcaneMaterial({
  color = 0x4fe6d8,
  intensity = 1.8,
  pulse = 0.16,
  speed = 1.6,
  rim = 1.4,
  phase = Math.random() * Math.PI * 2,
} = {}) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uPulse: { value: pulse },
    uSpeed: { value: speed },
    uPhase: { value: phase },
    uRim: { value: rim },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: arcaneVertex,
    fragmentShader: arcaneFragment,
    toneMapped: false,
  });
  material.userData.uniforms = uniforms;
  registerClock(uniforms);
  return material;
}

/**
 * Cáscara de halo: se pinta alrededor de un objeto emisivo, mirando hacia
 * dentro, para que el bloom tenga algo que agarrar aunque el objeto sea fino.
 */
export function haloMaterial({ color = 0x4fe6d8, intensity = 0.9, power = 3.0 } = {}) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uPower: { value: power },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vNormalW = normalize( mat3( modelMatrix ) * normal );
        vViewDirW = normalize( cameraPosition - world.xyz );
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vNormalW;
      varying vec3 vViewDirW;
      void main() {
        float f = pow( 1.0 - abs( dot( normalize( vNormalW ), normalize( vViewDirW ) ) ), uPower );
        float beat = 0.88 + 0.12 * sin( uTime * 1.3 );
        gl_FragColor = vec4( uColor * f * uIntensity * beat, f );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  material.userData.uniforms = uniforms;
  registerClock(uniforms);
  return material;
}
