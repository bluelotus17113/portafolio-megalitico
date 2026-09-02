/**
 * Líneas ley: vetas de energía que corren por el suelo uniendo los santuarios.
 *
 * Cumplen dos funciones a la vez — decorativa y de navegación: son la pista
 * visual de que los cinco puntos del promontorio forman un mismo sistema, y
 * el pulso viaja siempre desde el centro hacia fuera, así que también indican
 * hacia dónde ir.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';

const vertexShader = /* glsl */ `
  varying vec2 vUvL;
  void main() {
    vUvL = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform float uPhase;
  uniform float uActive;
  varying vec2 vUvL;

  void main() {
    // uv.x recorre la línea de principio a fin.
    float base = 0.075 + 0.045 * sin( vUvL.x * 34.0 - uTime * 0.8 + uPhase );

    // Tres pulsos separados corriendo hacia el santuario.
    float pulses = 0.0;
    for ( int i = 0; i < 3; i++ ) {
      float head = fract( uTime * uSpeed + uPhase * 0.31 + float( i ) * 0.333 );
      float d = vUvL.x - head;
      // Estela por detrás de la cabeza del pulso.
      float trail = exp( -max( -d, 0.0 ) * 26.0 ) * step( d, 0.0 );
      float front = exp( -max( d, 0.0 ) * 90.0 );
      pulses += max( trail, front );
    }
    // Acotado: tres pulsos solapados sumaban hasta 3 y saturaban a blanco.
    pulses = min( pulses, 1.0 );

    // El brillo cae hacia los bordes del tubo: parece una veta encendida.
    float across = 1.0 - abs( vUvL.y - 0.5 ) * 2.0;
    float edge = pow( clamp( across, 0.0, 1.0 ), 0.6 );

    float a = ( base + pulses * 0.55 ) * edge * uIntensity * ( 0.6 + uActive * 0.8 );
    // El núcleo del pulso se aclara, pero la veta en reposo conserva su
    // color: si no, todas las líneas se leen blancas y pierden el código
    // cromático que identifica a cada santuario.
    vec3 col = mix( uColor, vec3( 1.0 ), clamp( pulses * 0.42, 0.0, 0.55 ) );
    gl_FragColor = vec4( col * ( 1.0 + pulses * 0.45 ), a );
  }
`;

/**
 * Traza una línea ley entre dos puntos, pegada al terreno.
 *
 * @param {import('../world/Terrain.js').TerrainField} field
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 */
export function createLeyLine(field, from, to, {
  color = 0x4fe6d8,
  width = 0.42,
  intensity = 1.0,
  speed = 0.16,
  arc = 0.18,
  samples = 96,
  lift = 0.24,
  points: given = null,
} = {}) {
  // Con `points` la veta se pega a un trazado ya calculado — el del camino
  // empedrado— en vez de inventarse el suyo.
  if (given) {
    const path = given.map((p) => new THREE.Vector3(p.x, p.y + lift, p.z));
    return buildLey(path, path.length - 1, { color, width, intensity, speed, closed: false });
  }

  const points = [];
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  // Desvío lateral: una curva se lee mucho mejor que una recta en un plano.
  const side = new THREE.Vector3().subVectors(to, from);
  const length = side.length();
  side.set(-side.z, 0, side.x).normalize().multiplyScalar(length * arc);
  mid.add(side);

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    // Bézier cuadrática entre from, mid y to.
    const a = new THREE.Vector3().lerpVectors(from, mid, t);
    const b = new THREE.Vector3().lerpVectors(mid, to, t);
    const p = a.lerp(b, t);
    p.y = field.height(p.x, p.z) + lift;
    points.push(p);
  }

  return buildLey(points, samples, { color, width, intensity, speed, closed: false });
}

/** Malla y material comunes a la veta y al anillo. */
function buildLey(points, segments, { color, width, intensity, speed, closed }) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.5);
  const geometry = new THREE.TubeGeometry(curve, segments, width, 5, closed);

  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uSpeed: { value: speed },
    uPhase: { value: closed ? 0 : Math.random() },
    uActive: { value: closed ? 0.5 : 0.35 },
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

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = closed ? 'ley-ring' : 'ley-line';
  mesh.renderOrder = 4;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/**
 * Anillo de energía que rodea la plaza central, del que salen las líneas.
 */
export function createLeyRing(field, center, radius, {
  color = 0x4fe6d8,
  width = 0.5,
  segments = 220,
  lift = 0.26,
  intensity = 0.9,
} = {}) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = center.x + Math.cos(a) * radius;
    const z = center.z + Math.sin(a) * radius;
    points.push(new THREE.Vector3(x, field.height(x, z) + lift, z));
  }
  return buildLey(points, segments, { color, width, intensity, speed: 0.07, closed: true });
}
