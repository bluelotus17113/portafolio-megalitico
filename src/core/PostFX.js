/**
 * Cadena de post-proceso.
 *
 *   RenderPass → Bloom → OutputPass (tonemap + sRGB) → Grade → SMAA
 *
 * El "grade" va después del OutputPass a propósito: viñeta, grano y
 * aberración cromática se ven mejor aplicados sobre la imagen ya expuesta,
 * igual que en un revelado fotográfico.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    // Revelado casi transparente.
    //
    // Estos tres valores estaban puestos para una foto: viñeta fuerte, grano
    // marcado y aberración cromática visible. Sobre un fondo pintado los tres
    // trabajan en contra. La viñeta era la peor con diferencia — al 1.05
    // apagaba las esquinas al 37 % y convertía un cielo celeste en una franja
    // gris, que es lo que hacía parecer que la paleta no se había aplicado.
    uVignette: { value: 0.30 },
    uGrain: { value: 0.012 },
    uAberration: { value: 0.0005 },
    uLift: { value: new THREE.Vector3(0.004, 0.008, 0.018) },
    uGain: { value: new THREE.Vector3(1.03, 1.02, 1.0) },
    uSaturation: { value: 1.16 },
    uFade: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSaturation;
    uniform float uFade;
    varying vec2 vUv;

    float hash21( vec2 p ) {
      p = fract( p * vec2( 233.34, 851.73 ) );
      p += dot( p, p + 23.45 );
      return fract( p.x * p.y );
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float r2 = dot( center, center );

      // Aberración cromática: crece hacia los bordes, como una lente real.
      vec2 offset = center * uAberration * ( 0.35 + r2 * 2.6 );
      vec3 color;
      color.r = texture2D( tDiffuse, uv + offset ).r;
      color.g = texture2D( tDiffuse, uv ).g;
      color.b = texture2D( tDiffuse, uv - offset ).b;

      // Lift/gain: sombras frías azuladas, luces cálidas. Aire atlántico.
      color = color * uGain + uLift * ( 1.0 - color );

      // Curva en S suave: recupera el cuerpo que el mapeo de tonos aplana.
      color = color * color * ( 3.0 - 2.0 * color ) * 0.35 + color * 0.65;

      float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( luma ), color, uSaturation );

      // Viñeta suave.
      float vig = 1.0 - uVignette * r2 * ( 0.75 + r2 * 0.9 );
      color *= clamp( vig, 0.0, 1.0 );

      // Grano animado, más presente en las sombras.
      float grain = hash21( uv * vec2( 1920.0, 1080.0 ) + fract( uTime ) * 137.0 ) - 0.5;
      color += grain * uGrain * ( 1.15 - luma );

      color = mix( color, vec3( 0.0 ), clamp( uFade, 0.0, 1.0 ) );

      gl_FragColor = vec4( color, 1.0 );
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera, { quality = 'high' } = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    // Sin multimuestreo a propósito.
    //
    // Un objetivo half-float con `samples > 0` se dibuja bien, pero Firefox
    // no resuelve ese búfer a textura: cada pase leía negro del anterior y
    // la escena entera salía en negro con solo el grano del último pase
    // encima. Chromium sí lo resuelve, así que el fallo no aparecía en las
    // capturas de verificación.
    //
    // El antialiasing lo hace el SMAA del final de la cadena, que además
    // cuesta menos que MSAA 4× a pantalla completa.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      quality === 'high' ? 0.40 : 0.32, // fuerza
      0.62, // radio
      0.92 // umbral: solo lo verdaderamente brillante florece
    );
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    // El SMAA va en las dos calidades: es el único antialiasing que queda.
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);

    this.enabled = true;
  }

  get uniforms() {
    return this.grade.uniforms;
  }

  /** 0 = imagen normal, 1 = fundido a negro. Lo usa el arranque. */
  setFade(v) {
    this.grade.uniforms.uFade.value = v;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  render(dt) {
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
