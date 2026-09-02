/**
 * Mar: olas de Gerstner con normales analíticas y espuma de orilla.
 *
 * La espuma sale de un mapa de alturas del terreno horneado a baja resolución
 * en el arranque, así que la rompiente sigue de verdad la línea de costa en
 * vez de dibujarse a ojo.
 */

import * as THREE from 'three';
import { PALETTE, WORLD } from '../config.js';

// La lámina llega mucho más lejos de lo que la bruma deja ver. Su borde ya no
// se alcanza a distinguir, pero se deja holgura: desde el vuelo libre se puede
// subir, y cuanto más alta la cámara, más lejos se ve el canto del plano.
const EXTENT = 4600;
const SEGMENTS = 320;
const BAKE_SIZE = 256;
const BAKE_EXTENT = 560;

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec2 vUvW;

  // Tres olas direccionales sumadas. Solo desplazamiento vertical: el
  // arrastre horizontal de Gerstner completo no compensa a esta escala.
  float waveHeight( vec2 p, float t ) {
    float h = 0.0;
    h += sin( dot( p, vec2( 0.86, 0.51 ) ) * 0.055 + t * 0.95 ) * 1.05;
    h += sin( dot( p, vec2( -0.42, 0.91 ) ) * 0.089 + t * 1.35 ) * 0.62;
    h += sin( dot( p, vec2( 0.28, -0.96 ) ) * 0.167 + t * 1.85 ) * 0.28;
    return h;
  }

  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    world.y += waveHeight( world.xz, uTime );
    vWorldPos = world.xyz;
    vUvW = world.xz;
    vec4 mvPosition = viewMatrix * world;
    #include <fog_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform sampler2D uLand;
  uniform float uBakeExtent;
  uniform float uSeaLevel;
  uniform vec3 uCausticColor;
  uniform vec3 uCausticShallow;
  uniform vec3 uSandColor;
  uniform float uCaustic;
  varying vec3 vWorldPos;
  varying vec2 vUvW;

  float hash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }

  float valueNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash( i );
    float b = hash( i + vec2( 1.0, 0.0 ) );
    float c = hash( i + vec2( 0.0, 1.0 ) );
    float d = hash( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }

  vec2 hash22( vec2 p ) {
    p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
    return fract( sin( p ) * 43758.5453 );
  }

  /**
   * Red de cáusticas: distancia al borde entre celdas de Worley (F2 - F1).
   *
   * Es la forma del agua cristalina de un fondo pintado: no un brillo difuso,
   * sino una MALLA de hilos blancos que separa celdas de turquesa. El truco
   * está en devolver F2-F1 en vez de F1 — F1 da manchas redondas, la
   * diferencia da la red. Los núcleos orbitan con el tiempo, y eso es lo que
   * hace que la malla se retuerza en vez de limitarse a desplazarse.
   */
  float causticEdge( vec2 p, float t ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    float d1 = 8.0;
    float d2 = 8.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 o = hash22( i + g );
        o = 0.5 + 0.42 * sin( t * 0.85 + 6.2831 * o );
        float d = length( g + o - f );
        if ( d < d1 ) { d2 = d1; d1 = d; }
        else if ( d < d2 ) { d2 = d; }
      }
    }
    return d2 - d1;
  }

  // Derivadas analíticas de las mismas olas del vertex shader.
  vec3 waveNormal( vec2 p, float t ) {
    vec2 d = vec2( 0.0 );
    d += vec2( 0.86, 0.51 ) * 0.055 * cos( dot( p, vec2( 0.86, 0.51 ) ) * 0.055 + t * 0.95 ) * 1.05;
    d += vec2( -0.42, 0.91 ) * 0.089 * cos( dot( p, vec2( -0.42, 0.91 ) ) * 0.089 + t * 1.35 ) * 0.62;
    d += vec2( 0.28, -0.96 ) * 0.167 * cos( dot( p, vec2( 0.28, -0.96 ) ) * 0.167 + t * 1.85 ) * 0.28;

    // Rizado fino: sin él el mar parece plástico en los planos cercanos.
    float e = 0.9;
    vec2 rp = p * 0.42 + vec2( t * 0.55, -t * 0.35 );
    float n0 = valueNoise( rp );
    float nx = valueNoise( rp + vec2( e, 0.0 ) );
    float nz = valueNoise( rp + vec2( 0.0, e ) );
    d += vec2( nx - n0, nz - n0 ) * 0.55;

    return normalize( vec3( -d.x, 1.0, -d.y ) );
  }

  void main() {
    vec3 viewDir = normalize( cameraPosition - vWorldPos );
    vec3 n = waveNormal( vUvW, uTime );

    // Profundidad estimada a partir del terreno horneado.
    vec2 landUv = vWorldPos.xz / uBakeExtent + 0.5;
    float landHeight = texture2D( uLand, clamp( landUv, 0.001, 0.999 ) ).r * 300.0 - 150.0;
    float depth = clamp( ( uSeaLevel - landHeight ) / 46.0, 0.0, 1.0 );
    if ( landUv.x < 0.0 || landUv.x > 1.0 || landUv.y < 0.0 || landUv.y > 1.0 ) depth = 1.0;

    // Profundidad en tres escalones, no continua.
    //
    // El agua pintada de un fondo de animación se resuelve en franjas de color
    // plano paralelas a la costa: turquesa claro en el bajío, azul medio, azul
    // profundo. Un degradado continuo se lee como render, no como pintura.
    //
    // El color va por su propia curva, aparte de la profundidad física. Con la
    // profundidad cruda, la primera banda cubría solo los siete metros más
    // someros de una repisa de cincuenta y cinco: había turquesa, pero no daba
    // ni para una línea de píxeles desde el mirador. El exponente reparte el
    // bajío por las dos primeras bandas y deja el azul profundo para el fondo
    // de verdad. La variable depth sigue cruda para la espuma, la arena y las
    // cáusticas, que sí quieren la profundidad real.
    // El exponente reparte la repisa costera entre las dos primeras bandas: a
    // 1,6 el turquesa era un hilo de un par de píxeles desde el mirador. Solo
    // afecta a la repisa: mar adentro la profundidad vale 1 y el azul profundo
    // se queda como está.
    float shade = pow( depth, 2.05 );
    float depthBand = floor( shade * 3.0 + 0.5 ) / 3.0;
    shade = mix( shade, depthBand, 0.78 );
    vec3 color = mix( uShallow, uDeep, shade );

    // Fresnel: el mar refleja el cielo en rasante y muestra su color a plomo.
    float fresnel = pow( 1.0 - clamp( dot( viewDir, n ), 0.0, 1.0 ), 4.0 );
    // El reflejo del cielo va corto a propósito.
    //
    // Visto desde un mirador, casi todo el mar se mira en rasante y el fresnel
    // se dispara: con la mezcla al 58 % el Atlántico entero se convertía en un
    // espejo del horizonte, es decir, en una plancha gris. El mar pintado
    // conserva su turquesa hasta la línea del horizonte.
    color = mix( color, uSkyColor, clamp( fresnel * 0.34, 0.0, 0.30 ) );

    // Especular del sol.
    vec3 halfDir = normalize( normalize( uSunDir ) + viewDir );
    float spec = pow( max( dot( n, halfDir ), 0.0 ), 220.0 );
    color += uSunColor * spec * 2.6;
    float sheen = pow( max( dot( n, halfDir ), 0.0 ), 18.0 );
    color += uSunColor * sheen * 0.16;

    // Marejada pintada: pinceladas largas paralelas a la cresta.
    //
    // Mar adentro una ola mide menos de un píxel y el Atlántico se queda en una
    // plancha lisa de azul. Un fondo pintado no resuelve el mar abierto con
    // olas sino con PINCELADAS: trazos alargados de azul más claro tendidos en
    // la dirección del oleaje. Se consigue estirando el ruido casi diez a uno
    // sobre el eje de la ola dominante. Se apaga en el bajío, donde ya están la
    // rompiente y las cáusticas dando dibujo de sobra.
    {
      vec2 sw = vec2( 0.86, 0.51 );
      vec2 sp = vec2(
        dot( vUvW, vec2( -sw.y, sw.x ) ) * 0.021,
        dot( vUvW, sw ) * 0.185 + uTime * 0.20
      );
      float streak = valueNoise( sp ) * 0.66 + valueNoise( sp * 2.4 + 17.0 ) * 0.34;
      // Recorte con borde: la pincelada tiene canto, como todo lo demás.
      streak = smoothstep( 0.52, 0.74, streak );
      color = mix( color, mix( color, uShallow, 0.44 ), streak * depth * 0.62 );
    }

    // Espuma: en la orilla y en las crestas.
    // La franja de rompiente se mide sobre la nueva escala de profundidad: con
    // el umbral viejo, la repisa entera quedaba dentro y el bajío se cubría de
    // espuma en lugar de dejar ver el fondo.
    float shore = 1.0 - smoothstep( 0.0, 0.17, depth );
    float ripple = valueNoise( vUvW * 0.35 + vec2( uTime * 0.30, uTime * 0.11 ) );
    // La rompiente tiene además otro trabajo: la malla del terreno mide 1,35 m
    // por cuadro y la línea de agua la corta en diagonal, así que sin espuma la
    // orilla se ve escalonada. La franja blanca tapa ese dentado.
    float band = smoothstep( 0.28, 0.86, shore * ( 0.68 + ripple * 0.72 ) );
    float crest = smoothstep( 0.55, 0.95, 1.0 - n.y ) * 0.9;
    // Recorte duro: la espuma pintada tiene contorno. Difuminada se convierte
    // en una neblina blanca sobre el agua y pierde el dibujo de la rompiente.
    float foam = clamp( band + crest, 0.0, 1.0 );
    foam = smoothstep( 0.42, 0.56, foam );
    color = mix( color, uFoam, foam * 0.92 );

    // Camino de luz: las chispas se juntan en la vertical del sol.
    //
    // Moduladas por el fresnel, las chispas caían por igual sobre todo el mar y
    // a distancia se leían como nieve de televisión. Modulándolas por el lóbulo
    // ANCHO del especular se concentran donde el agua ya devuelve el sol, que
    // es justo donde un mar pintado lleva su reguero de luz; el resto del mar
    // se queda liso y el reguero se gana el brillo.
    float glint = pow( valueNoise( vUvW * 1.7 + vec2( uTime * 0.8, uTime * 0.5 ) ), 9.0 );
    color += uSunColor * glint * ( 0.08 + sheen * 6.5 ) * 0.55;

    // ---- Cáusticas -------------------------------------------------------
    //
    // Dos escalas de la misma red, una girada respecto a la otra: la grande da
    // el dibujo y la pequeña lo rompe para que no se lea el patrón. Solo actúan
    // donde el agua es somera — el sol no llega al fondo mar adentro, y una red
    // de cáusticas hasta el horizonte delata el truco al instante.
    float clarity = 1.0 - smoothstep( 0.05, 0.72, depth );
    if ( clarity > 0.004 ) {
      // Escala: una celda mide unos tres metros. A 0.085 medían doce, y una
      // retícula de doce metros no se lee como agua — se lee como una malla
      // dibujada encima del mar.
      vec2 cp = vUvW * 0.34 + vec2( uTime * 0.055, uTime * 0.028 );
      float e1 = causticEdge( cp, uTime );
      float e2 = causticEdge( cp * 2.6 + vec2( 31.7, -12.3 ), uTime * 1.35 );
      float net = ( 1.0 - smoothstep( 0.0, 0.085, e1 ) ) * 0.70
                + ( 1.0 - smoothstep( 0.0, 0.062, e2 ) ) * 0.36;
      net = clamp( net, 0.0, 1.0 );

      // La celda entre hilos también se aclara: el agua cristalina deja ver el
      // fondo iluminado, no solo la retícula.
      float cell = smoothstep( 0.08, 0.30, e1 ) * 0.40;

      color = mix( color, uCausticShallow, clarity * cell );
      color += uCausticColor * net * clarity * uCaustic;
    }

    // Transparencia del bajío: el fondo de arena asoma bajo la lámina.
    color = mix( color, uSandColor, ( 1.0 - smoothstep( 0.02, 0.34, depth ) ) * 0.30 );

    gl_FragColor = vec4( color, 1.0 );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Hornea la altura del terreno a una textura para la espuma de orilla. */
function bakeLandHeight(field) {
  const canvas = document.createElement('canvas');
  canvas.width = BAKE_SIZE;
  canvas.height = BAKE_SIZE;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(BAKE_SIZE, BAKE_SIZE);
  const data = image.data;
  for (let y = 0; y < BAKE_SIZE; y++) {
    for (let x = 0; x < BAKE_SIZE; x++) {
      const wx = (x / (BAKE_SIZE - 1) - 0.5) * BAKE_EXTENT;
      const wz = (y / (BAKE_SIZE - 1) - 0.5) * BAKE_EXTENT;
      // Se codifica [-150, 150] en 0..255: con la meseta a 44 m y las lomas
      // sumando otros 46, el rango anterior de +-100 se saturaba tierra adentro.
      const h = Math.max(0, Math.min(1, (field.baseHeight(wx, wz) + 150) / 300));
      const i = (y * BAKE_SIZE + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = h * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Ocean {
  constructor(field, sunDirection) {
    const geometry = new THREE.PlaneGeometry(EXTENT, EXTENT, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    this.uniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(PALETTE.oceanDeep) },
      uShallow: { value: new THREE.Color(PALETTE.oceanShallow) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uSunDir: { value: sunDirection.clone() },
      uSunColor: { value: new THREE.Color(PALETTE.sunColor) },
      uSkyColor: { value: new THREE.Color(PALETTE.skyHorizon) },
      uCausticColor: { value: new THREE.Color(PALETTE.caustic) },
      uCausticShallow: { value: new THREE.Color(PALETTE.oceanClear) },
      uSandColor: { value: new THREE.Color(PALETTE.sand) },
      uCaustic: { value: 0.40 },
      uLand: { value: bakeLandHeight(field) },
      uBakeExtent: { value: BAKE_EXTENT },
      uSeaLevel: { value: WORLD.seaLevel },
      ...THREE.UniformsLib.fog,
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      fog: true,
      toneMapped: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'ocean';
    this.mesh.position.y = WORLD.seaLevel;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
  }
}
