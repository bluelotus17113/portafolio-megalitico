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
  varying vec3 vNormalW;
  void main() {
    vUvL = uv;
    // La normal en el mundo. Es lo que deja que el brillo salga de la CRESTA
    // del tubo, que es por donde una veta enterrada asomaría luz.
    vNormalW = normalize( mat3( modelMatrix ) * normal );
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
  varying vec3 vNormalW;

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

    // El brillo sale por la CRESTA y se apaga en los costados.
    //
    // Antes esto se sacaba de uv.y, que en un tubo recorre la CIRCUNFERENCIA:
    // encendía una franja a lo largo de un costado y dejaba la costura del UV
    // apagada, o sea una raya de luz colocada al azar respecto al suelo. Con la
    // normal, lo que brilla es lo que mira hacia arriba, que es por donde una
    // veta enterrada asomaría. Es lo que la hacía leerse como un tubo de
    // plástico tumbado en la hierba en vez de como luz saliendo de la tierra.
    float arriba = clamp( vNormalW.y, 0.0, 1.0 );

    // NÚCLEO Y HALO, y hacen falta los dos.
    //
    // Con una sola caída, la veta se leía como un tubo de plástico: un borde
    // limpio contra la hierba y el interior parejo. Lo que le faltaba no era
    // ser más fina ni más apagada —eso ya se probó y seguía pareciendo un
    // tubo— sino que la luz se DERRAMASE fuera de ella. El núcleo es una raya
    // estrecha sobre la cresta; el halo, una falda ancha y tenue que llega
    // hasta el canto y apaga la silueta.
    float nucleo = pow( arriba, 7.0 );
    float halo = pow( arriba, 1.3 ) * 0.22;

    float a = ( base + pulses * 0.34 ) * ( nucleo + halo ) * uIntensity * ( 0.6 + uActive * 0.8 );
    // El núcleo del pulso se aclara, pero la veta en reposo conserva su
    // color: si no, todas las líneas se leen blancas y pierden el código
    // cromático que identifica a cada santuario. Medido antes de bajarlo: el
    // 5 % más brillante quedaba en una saturación de 0,34 — gris.
    vec3 col = mix( uColor, vec3( 1.0 ), clamp( pulses * 0.26, 0.0, 0.34 ) );
    gl_FragColor = vec4( col * ( 1.0 + pulses * 0.22 ), a );
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
  // Más fina y más hundida que antes (0,42 y 0,24). Con aquellos números la
  // cresta del tubo quedaba a 0,67 m sobre la hierba, que es la altura de una
  // tubería tumbada; ahora asoma 0,40 y con los costados apagados se lee como
  // una veta en la tierra.
  width = 0.42,
  intensity = 1.0,
  speed = 0.16,
  arc = 0.18,
  samples = 96,
  // A ras: el tubo queda enterrado hasta su eje y lo que asoma es media caña,
  // una loma de 0,42 m. Con `lift` a 0,24 —como estaba— el cilindro entero
  // quedaba por encima de la hierba y se leía como una tubería tumbada.
  lift = 0,
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
  // Diez lados y no cinco. La caída del brillo se calcula con la normal, y con
  // cinco lados la normal sólo tiene cinco valores por vuelta: el degradado
  // salía a trozos y el contorno, poligonal. Diez lados son doscientos
  // vértices más por veta, que no se notan en ninguna medida.
  const geometry = new THREE.TubeGeometry(curve, segments, width, 10, closed);

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
    // Inerte, pero se deja dicho: un `ShaderMaterial` crudo no recibe el
    // fragmento de mapeo de tonos de three, así que esta bandera no hace nada
    // aquí. Se probó a ponerla en `true` buscando bajar el brillo y no movió
    // ni un punto la medida. Lo que enciende esta veta es su propio shader,
    // no la exposición de la escena.
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
  width = 0.46,
  segments = 220,
  lift = 0,
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
