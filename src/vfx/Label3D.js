/**
 * Rótulos flotantes en el mundo.
 *
 * Texto pintado en canvas y mostrado como sprite. Se dibuja al doble de
 * resolución y se desvanece por distancia para que a lo lejos no ensucie el
 * paisaje, que es justo lo que pasa cuando se dejan todos encendidos.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';

const DPR = 2;

function textTexture(text, {
  font = '600 96px "Cinzel", "Trajan Pro", Georgia, serif',
  color = '#f3f7f6',
  glowColor = '#4fe6d8',
  padding = 48,
  letterSpacing = 10,
} = {}) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;

  // El letter-spacing se aplica a mano: canvas no lo soporta en todos lados.
  const chars = [...text];
  const widths = chars.map((c) => measure.measureText(c).width);
  const textWidth = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
  const metrics = measure.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || 72;
  const descent = metrics.actualBoundingBoxDescent || 24;
  const textHeight = ascent + descent;

  const w = Math.ceil((textWidth + padding * 2) * DPR);
  const h = Math.ceil((textHeight + padding * 2) * DPR);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';

  const draw = (fill, blur, alpha, dx = 0, dy = 0) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = blur;
    ctx.fillStyle = fill;
    let x = padding + dx;
    const y = padding + ascent + dy;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x, y);
      x += widths[i] + letterSpacing;
    }
    ctx.restore();
  };

  // Sombra dura primero: separa el texto del cielo claro.
  draw('rgba(8,16,20,0.85)', 0, 1, 1.5, 2);
  draw(glowColor, 34, 0.55);
  draw(color, 10, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { texture: tex, aspect: w / h };
}

/**
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.height   Altura del rótulo en unidades de mundo.
 * @param {number} opts.fadeNear Distancia a la que está a pleno.
 * @param {number} opts.fadeFar  Distancia a la que desaparece.
 */
export function createLabel(text, {
  height = 6,
  /**
   * Ancho máximo en unidades de mundo. Es el control que importa: la altura
   * de la letra es la misma para todas las secciones, pero "TRAYECTORIA"
   * ocupa el triple que "CONTACTO" y sin este tope se comía la pantalla.
   */
  maxWidth = Infinity,
  color = '#f3f7f6',
  glowColor = '#4fe6d8',
  font = '600 96px "Cinzel", Georgia, serif',
  letterSpacing = 10,
  fadeNear = 30,
  fadeFar = 340,
  minDistance = 12,
} = {}) {
  const { texture, aspect } = textTexture(text, { color, glowColor, font, letterSpacing });

  const uniforms = {
    uMap: { value: texture },
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uFadeNear: { value: fadeNear },
    uFadeFar: { value: fadeFar },
    uMinDistance: { value: minDistance },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUvL;
      varying float vDist;
      void main() {
        vUvL = uv;
        // Sprite manual: la posición del objeto define el centro y el quad
        // se orienta al plano de cámara.
        vec4 mv = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        vDist = -mv.z;
        vec3 scale = vec3(
          length( modelMatrix[ 0 ].xyz ),
          length( modelMatrix[ 1 ].xyz ),
          1.0
        );
        // Flotación suave, para que no parezca clavado en el aire.
        mv.y += sin( uTime * 0.9 + mv.x * 0.15 ) * 0.16;
        mv.xy += position.xy * scale.xy;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uFadeNear;
      uniform float uFadeFar;
      uniform float uMinDistance;
      varying vec2 vUvL;
      varying float vDist;
      void main() {
        vec4 texel = texture2D( uMap, vUvL );
        float far = 1.0 - smoothstep( uFadeFar * 0.55, uFadeFar, vDist );
        float near = smoothstep( uMinDistance * 0.4, uMinDistance, vDist );
        float a = texel.a * uOpacity * far * near;
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( texel.rgb, a );
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  registerClock(uniforms);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  const finalHeight = Math.min(height, maxWidth / aspect);
  mesh.scale.set(finalHeight * aspect, finalHeight, 1);
  mesh.renderOrder = 900;
  mesh.frustumCulled = false;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
