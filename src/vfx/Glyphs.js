/**
 * Glifos luminosos: espirales, nudos y runas grabadas.
 *
 * Dos representaciones, según para qué:
 *  - `glyphDecal`: plano con textura dibujada en canvas, aditivo. Para lo que
 *    va pegado a una superficie (espirales en las losas, runas en un menhir).
 *  - `glyphTubes`: geometría de tubo real. Para lo que flota en el aire y
 *    tiene que leerse como volumen desde cualquier ángulo.
 */

import * as THREE from 'three';
import { arcaneMaterial, registerClock } from './materials.js';

/**
 * Dibuja polilíneas (coordenadas -0.5..0.5) sobre un canvas con halo.
 * @param {number[][][]} paths
 */
export function glyphTexture(paths, {
  size = 512,
  color = '#7ef2e6',
  lineWidth = 0.028,
  glow = 0.055,
  closed = false,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const toPx = (p) => [(p[0] + 0.5) * size, (0.5 - p[1]) * size];

  const trace = () => {
    for (const path of paths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      const [x0, y0] = toPx(path[0]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < path.length; i++) {
        const [x, y] = toPx(path[i]);
        ctx.lineTo(x, y);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
    }
  };

  // Cuatro pasadas: halo ancho, halo medio, trazo y un filo blanco fino.
  // Los valores son deliberadamente bajos: la textura se multiplica luego
  // por la intensidad del material y pasa por el bloom, así que subirlos
  // aquí satura a blanco todo el grabado y se pierde el dibujo.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.14;
  ctx.lineWidth = (lineWidth + glow * 2) * size;
  trace();
  ctx.globalAlpha = 0.30;
  ctx.lineWidth = (lineWidth + glow) * size;
  trace();
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = lineWidth * size;
  trace();
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.40;
  ctx.lineWidth = lineWidth * size * 0.34;
  trace();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Plano con el glifo, aditivo y con latido propio. Se coloca ligeramente
 * separado de la superficie para no pelearse con el z-buffer.
 */
export function glyphDecal(paths, {
  size = 4,
  color = 0x4fe6d8,
  intensity = 1.5,
  pulse = 0.35,
  speed = 1.0,
  lineWidth = 0.028,
  glow = 0.055,
  texSize = 512,
} = {}) {
  const tex = glyphTexture(paths, {
    size: texSize,
    color: `#${new THREE.Color(color).getHexString()}`,
    lineWidth,
    glow,
  });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uPulse: { value: pulse },
      uSpeed: { value: speed },
      uPhase: { value: Math.random() * Math.PI * 2 },
      uReveal: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUvG;
      void main() {
        vUvG = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uPulse;
      uniform float uSpeed;
      uniform float uPhase;
      uniform float uReveal;
      varying vec2 vUvG;

      void main() {
        vec4 texel = texture2D( uMap, vUvG );
        // Latido lento + parpadeo rápido: la luz de una brasa, no un LED.
        float beat = 1.0 + uPulse * sin( uTime * uSpeed + uPhase );
        float flicker = 1.0 + 0.06 * sin( uTime * 11.3 + uPhase * 3.1 );
        // Revelado radial: la inscripción se enciende desde el centro.
        float r = length( vUvG - 0.5 ) * 2.0;
        float mask = smoothstep( uReveal + 0.12, uReveal - 0.06, r );
        float a = texel.a * mask;
        if ( a < 0.004 ) discard;
        vec3 col = mix( uColor, vec3( 1.0 ), texel.r * 0.55 ) * texel.rgb;
        gl_FragColor = vec4( col * uIntensity * beat * flicker, a );
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  registerClock(material.uniforms);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.userData.glyph = material.uniforms;
  mesh.renderOrder = 5;
  return mesh;
}

/**
 * Tubos 3D siguiendo las polilíneas. Los usa la sección de habilidades:
 * las runas tienen que tener cuerpo cuando la cámara las rodea.
 */
export function glyphTubes(paths, {
  scale = 1,
  radius = 0.045,
  color = 0x4fe6d8,
  intensity = 1.8,
  radialSegments = 6,
  tubularSegmentsPerUnit = 26,
} = {}) {
  const group = new THREE.Group();
  const material = arcaneMaterial({ color, intensity });

  for (const path of paths) {
    if (path.length < 2) continue;
    const points = path.map(([x, y]) => new THREE.Vector3(x * scale, y * scale, 0));
    const curve =
      points.length > 2
        ? new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02)
        : new THREE.LineCurve3(points[0], points[1]);
    const length = curve.getLength();
    const segments = Math.max(6, Math.round(length * tubularSegmentsPerUnit));
    const geo = new THREE.TubeGeometry(curve, segments, radius * scale, radialSegments, false);
    const mesh = new THREE.Mesh(geo, material);
    group.add(mesh);

    // Tapas en los extremos: sin ellas los trazos se ven huecos de canto.
    const capGeo = new THREE.SphereGeometry(radius * scale, radialSegments, radialSegments >> 1);
    const start = new THREE.Mesh(capGeo, material);
    start.position.copy(curve.getPoint(0));
    const end = new THREE.Mesh(capGeo, material);
    end.position.copy(curve.getPoint(1));
    group.add(start, end);
  }

  group.userData.material = material;
  return group;
}
