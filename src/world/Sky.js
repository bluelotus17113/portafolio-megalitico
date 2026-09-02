/**
 * Cielo: cúpula con degradado, disco solar y capa de nubes en movimiento.
 *
 * No usamos el Sky de los addons (Preetham) porque queremos un cielo
 * atlántico cargado, con nubes concretas y un sol bajo que recorta el
 * horizonte — más cerca de la referencia que de un cielo azul limpio.
 */

import * as THREE from 'three';
import { PALETTE } from '../config.js';
import { cloudTexture } from '../utils/textures.js';

const vertexShader = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorldDir = normalize( world.xyz - cameraPosition );
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w; // siempre al fondo del depth buffer
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform sampler2D uClouds;
  uniform vec3 uCloudLight;
  uniform vec3 uCloudShade;
  uniform float uCloudCut;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vWorldDir;

  // Proyección de la dirección de vista sobre un plano de nubes alto.
  vec2 cloudUv( vec3 dir, float height, float scale ) {
    float t = height / max( dir.y, 0.035 );
    return dir.xz * t * scale;
  }

  void main() {
    vec3 dir = normalize( vWorldDir );
    float h = clamp( dir.y, -1.0, 1.0 );

    // Degradado vertical.
    //
    // El azul sube deprisa: a veinte grados sobre el horizonte ya manda el
    // celeste. Con la curva anterior el blanco del horizonte llegaba hasta
    // media cúpula y, desde un mirador que mira hacia abajo, el cielo visible
    // era todo esa franja lechosa — o sea, gris. El cielo pintado tiene la
    // banda pálida pegada al mar y nada más.
    float grad = pow( clamp( h * 2.4 + 0.10, 0.0, 1.0 ), 0.85 );
    vec3 sky = mix( uHorizon, uTop, grad );

    // Bruma marina justo sobre el mar.
    sky = mix( sky, uHorizon * 1.04, smoothstep( 0.06, -0.05, h ) );

    // Sol: núcleo + halo amplio.
    float sun = max( dot( dir, normalize( uSunDir ) ), 0.0 );
    sky += uSunColor * pow( sun, 720.0 ) * 6.0;
    sky += uSunColor * pow( sun, 12.0 ) * 0.30;
    sky += uSunColor * pow( sun, 3.0 ) * 0.09;

    // Dos capas de nubes a distinta altura y deriva: da paralaje.
    //
    // La franja de arranque empieza bien por encima del horizonte. Proyectar
    // un plano de nubes sobre una dirección casi horizontal estira el téxel
    // hasta el infinito, y con el arranque en -0.05 salían regueros verticales
    // colgando sobre el mar.
    float up = smoothstep( 0.035, 0.22, h );
    vec2 uv1 = cloudUv( dir, 1.0, 0.055 ) + vec2( uTime * 0.0035, uTime * 0.0012 );
    vec2 uv2 = cloudUv( dir, 1.0, 0.019 ) + vec2( uTime * -0.0018, uTime * 0.0009 );
    float c1 = texture2D( uClouds, uv1 ).r;
    float c2 = texture2D( uClouds, uv2 ).r;
    float field = c1 * 0.55 + c2 * 0.80;

    // Nube recortada, no bruma.
    //
    // La nube de un fondo pintado tiene CONTORNO: se resuelve con dos umbrales
    // sobre el mismo campo de ruido — uno para la silueta y otro, más adentro,
    // para el cogollo que da el sol. Entre los dos queda la panza en un gris
    // azulado plano. Difuminando el borde, que es lo que hacía antes, el cielo
    // se convierte en una mancha lechosa y el estilo se pierde entero.
    float clouds = smoothstep( uCloudCut, uCloudCut + 0.055, field ) * up;
    float crest = smoothstep( uCloudCut + 0.09, uCloudCut + 0.19, field );

    vec3 cloudCol = mix( uCloudShade, uCloudLight, crest );
    // El lado que mira al sol se enciende entero.
    cloudCol = mix( cloudCol, uCloudLight, pow( sun, 2.2 ) * 0.55 );
    cloudCol += uSunColor * pow( sun, 8.0 ) * 0.45;
    sky = mix( sky, cloudCol, clouds * 0.95 );

    // Estrellas.
    //
    // Una rejilla de celdas en la dirección de vista, con una estrella en las
    // pocas celdas cuyo hash pasa el umbral. Es lo que da un cielo estrellado
    // sin textura ni geometría: la posición sale del propio hash, así que no
    // se mueven, y el parpadeo va desfasado estrella a estrella.
    if ( uStars > 0.001 ) {
      vec3 g = dir * 96.0;
      vec3 cellId = floor( g );
      float h = fract( sin( dot( cellId, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
      if ( h > 0.974 ) {
        vec3 centre = cellId + 0.5 + 0.38 * vec3(
          fract( h * 31.7 ) - 0.5,
          fract( h * 57.3 ) - 0.5,
          fract( h * 91.1 ) - 0.5
        );
        float d2 = length( g - centre );
        float star = exp( -d2 * d2 * 24.0 );
        float twinkle = 0.62 + 0.38 * sin( uTime * 2.1 + h * 41.0 );
        // Se apagan hacia el horizonte, donde la bruma se las come, y bajo las
        // nubes.
        sky += vec3( 0.86, 0.91, 1.0 ) * star * twinkle * uStars * up * ( 1.0 - clouds );
      }
    }

    gl_FragColor = vec4( sky, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  constructor() {
    const geometry = new THREE.SphereGeometry(1, 48, 32);
    this.uniforms = {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uSunColor: { value: new THREE.Color(PALETTE.sunColor) },
      // Sol alto y por detrás del hombro derecho del visitante en la vista de
      // bienvenida: ilumina las laderas que se ven en vez de dejarlas a
      // contraluz.
      //
      // La elevación subió de 27° a 45°. Con el sol bajo, el prado llano daba
      // ndl ≈ 0.46 y caía justo en el escalón intermedio de la rampa cel: la
      // isla entera se quedaba en penumbra. A 45° el suelo llano entra de
      // lleno en la banda iluminada, que es donde tiene que estar un mediodía.
      uSunDir: { value: new THREE.Vector3(0.42, 0.70, -0.58).normalize() },
      uClouds: { value: cloudTexture({ seed: 91, size: 512 }) },
      uCloudLight: { value: new THREE.Color(PALETTE.cloudLight) },
      uCloudShade: { value: new THREE.Color(PALETTE.cloudShade) },
      // Umbral de silueta. Subirlo deja el cielo despejado; bajarlo lo cubre.
      uCloudCut: { value: 0.40 },
      uStars: { value: 0 },
      uTime: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1);
  }

  /** Dirección del sol en coordenadas de mundo (hacia el sol). */
  get sunDirection() {
    return this.uniforms.uSunDir.value;
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    // La cúpula viaja con la cámara: el cielo nunca se alcanza.
    this.mesh.position.copy(camera.position);
  }
}
