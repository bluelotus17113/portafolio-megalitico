/**
 * Sombreado cel al gusto de fondo pintado de animación japonesa.
 *
 * No está inventado a ojo: las rampas salen de medir dos ficheros .blend de
 * referencia (`AnimeGrass_Demo_3.0` y `AnimeTree_GooEngine`), cuyos materiales
 * comparten siempre el mismo esqueleto:
 *
 *     Diffuse BSDF  →  Shader to RGB  →  ColorRamp  →  color
 *
 * Es decir: la luz no se integra, se *mide* y se usa como índice de una rampa
 * de colores pintados a mano. De ahí salen las tres propiedades que definen
 * el estilo y que este módulo reproduce:
 *
 *  1. El corte entre luz y sombra es DURO. En el material del suelo de la
 *     referencia las dos paradas de la rampa están en la misma posición
 *     (0.455): un escalón perfecto, sin degradado.
 *  2. La sombra no es el color oscurecido: cambia de tono y se va al azul
 *     verdoso. Medido en el follaje, la banda oscura es #17303d contra un
 *     verde iluminado #539e43. Eso es lo que hace que se lea como pintura.
 *  3. Entre medias hay MESETAS planas. La rampa del follaje repite el mismo
 *     color entre 0.045 y 0.426, y otra vez entre 0.498 y 0.894.
 *
 * Se aplica sobre `MeshStandardMaterial` en vez de sustituirlo para no perder
 * el mapa de normales ni las sombras proyectadas, pero la ecuación de luz se
 * reemplaza entera: de la iluminación PBR solo sobrevive la dirección del sol
 * y el mapa de sombras.
 */

import * as THREE from 'three';

/** Dirección del sol en el mundo. La comparten todos los materiales cel. */
export const TOON_SUN = { value: new THREE.Vector3(0.42, 0.55, -0.72).normalize() };

/**
 * Tinte de la hora del día.
 *
 * Dos multiplicadores separados: uno para la banda iluminada y otro para la de
 * sombra. Van por separado a propósito — es lo que distingue un atardecer de un
 * mediodía con menos luz. Al atardecer la banda iluminada SUBE y se va al
 * ámbar, mientras que la de sombra baja y se va al azul; con un único
 * multiplicador global solo se puede apagar o encender la escena entera, que es
 * exactamente el aspecto de una imagen a la que le han bajado el brillo.
 */
export const TOON_TIME = {
  light: { value: new THREE.Vector3(1, 1, 1) },
  shade: { value: new THREE.Vector3(1, 1, 1) },
};

/**
 * Tinte de la estación.
 *
 * Va aparte del de la hora y por debajo de él: la hora tiñe la LUZ —la banda
 * iluminada y la de sombra por separado— y la estación tiñe la COSA, el verde
 * propio de la hoja y de la brizna. Una copa dorada sigue estando dorada de
 * noche, solo que iluminada por una luna azul. Mezclándolos en un único
 * multiplicador el otoño se comía el atardecer y viceversa.
 *
 * Tres canales porque son tres cosas que no viran juntas —la hoja se va al oro
 * mucho antes que el prado, y la tierra apenas se mueve— y dos escalares:
 *
 *  - `flor`  cuánta flor asoma en la hierba. Cero en invierno.
 *  - `seco`  cuánto croma se le quita a la vegetación, hacia su propio gris.
 *
 * `seco` existe porque un multiplicador NO puede desaturar. Multiplicando un
 * verde por lo que sea sale otro verde, más claro o más oscuro; para que el
 * invierno se lea hay que quitarle el croma, y eso es una mezcla hacia la
 * luminancia, no un producto. El primer invierno se hizo solo con el
 * multiplicador y salió un prado verde oscuro — o sea, un prado de noche.
 *
 * El neutro (todo a 1, `seco` a 0) es EL VERANO: la isla que ya estaba
 * calibrada. Así ninguna de las paletas medidas hasta ahora se toca, y cada
 * estación se define por lo que se aparta de ella.
 */
export const TOON_ESTACION = {
  hoja: { value: new THREE.Vector3(1, 1, 1) },
  hierba: { value: new THREE.Vector3(1, 1, 1) },
  tierra: { value: new THREE.Vector3(1, 1, 1) },
  flor: { value: 1 },
  seco: { value: 0 },
};

/** GLSL compartido: apaga el croma y luego tiñe. Ese orden, no el contrario. */
export const GLSL_ESTACION = /* glsl */ `
  uniform vec3 uEstacionTinte;
  uniform float uEstacionSeco;

  vec3 estacionar( vec3 c ) {
    // Rec.709: el gris al que se va un verde tiene que ser el gris que ese
    // verde pesa, no la media de sus canales — si no, la hoja se apaga a un
    // tono más claro que la corteza que tiene detrás y flota.
    float luma = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    return mix( c, vec3( luma ), uEstacionSeco ) * uEstacionTinte;
  }
`;

/** Actualiza el sol de todo el sombreado cel de una vez. */
export function setToonSun(direction) {
  TOON_SUN.value.copy(direction).normalize();
}

/**
 * Sombras de nube.
 *
 * Manchas grandes y blandas que cruzan el paisaje al ritmo del cielo. Es el
 * rasgo que más rápido delata un fondo pintado de animación: sin ellas, una
 * pradera iluminada por igual de un extremo a otro se lee como una maqueta.
 *
 * Se resuelve muestreando el MISMO mapa de nubes que dibuja la cúpula, así que
 * lo que pasa por el suelo se corresponde con lo que hay arriba, y cuesta una
 * lectura de textura. Los uniforms se comparten: se ajustan una vez desde el
 * mundo y valen para todos los materiales cel.
 */
export const TOON_CLOUDS = {
  map: { value: null },
  time: { value: 0 },
  /** Metros por unidad de textura. Cuanto menor, más grandes las manchas. */
  scale: { value: 0.0016 },
  drift: { value: new THREE.Vector2(0.0042, 0.0016) },
};

export function setToonCloudMap(texture) {
  TOON_CLOUDS.map.value = texture;
}

export function tickToonClouds(dt) {
  TOON_CLOUDS.time.value += dt;
}

/** Multiplicador de color (razón, NO un color: no se gestiona como sRGB). */
function ratio(r, g, b) {
  return new THREE.Vector3(r, g, b);
}

/** Color absoluto en sRGB convertido al espacio lineal de trabajo. */
export function tone(hex) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

/**
 * Paleta medida en los .blend de referencia, en sRGB.
 *
 * Los valores del fichero están en lineal; aquí se guardan ya convertidos a
 * hexadecimal sRGB porque es la forma en que se pueden comparar de un vistazo
 * con una captura.
 */
export const ANIME = {
  // AnimeTree_GooEngine, material 'Foliage', ColorRamp.003 (cara a la luz).
  foliage: {
    shadow: 0x306e5a,
    deep: 0x357d44,
    mid: 0x539e43,
    highlight: 0x9fcb68,
  },
  // ColorRamp.004: la mitad de la copa que da la espalda al sol.
  foliageDark: {
    shadow: 0x17303d,
    mid: 0x265e55,
  },
  // AnimeGrass_Demo_3.0, material 'Grass'.
  grass: {
    base: 0x007059,
    tip: 0x8ac200,
    shadow: 0x00344b,
  },
  // Material 'Material.002' del tronco.
  bark: {
    shadow: 0x312e2b,
    mid: 0x4d463a,
    light: 0x6b604a,
  },
};

/**
 * Preajustes por tipo de superficie.
 *
 * `mode: 'multiply'` conserva la textura y solo la tiñe por bandas — es lo
 * que quiere la piedra, cuyo grano es la mitad del trabajo. `mode: 'replace'`
 * tira el color de la textura y pinta la rampa medida, que es lo que hace la
 * referencia con el follaje: allí la textura solo aporta el recorte.
 */
export const TOON_PRESETS = {
  /** Prado y roca del terreno. */
  terrain: {
    bands: 3,
    edge: 0.035,
    wrap: 0.46,
    // La sombra se va al azul verdoso en lugar de limitarse a oscurecer. Es la
    // firma del estilo: en el .blend la sombra del follaje es #17303d contra un
    // verde iluminado #539e43, un salto de TONO, no solo de brillo.
    shadow: ratio(0.32, 0.45, 0.60),
    mid: ratio(0.84, 0.90, 0.84),
    light: ratio(1.32, 1.29, 1.14),
  },
  /** Megalitos, cantos y bordillos. */
  stone: {
    bands: 3,
    edge: 0.035,
    wrap: 0.42,
    shadow: ratio(0.33, 0.42, 0.55),
    mid: ratio(0.76, 0.77, 0.78),
    light: ratio(1.26, 1.21, 1.08),
    rim: 0.16,
    rimColor: tone(0xd8ecf2),
  },
  /**
   * Enlosado de los estrados.
   *
   * Tres bandas, no dos. Con dos, el enlosado se quedaba en dos tonos planos y
   * el relieve de la cantería —el asiento de cada losa, el bordón del canto— no
   * tenía escalón donde caer: todo el estrado aterrizaba en la misma banda y se
   * leía como una tapa lisa.
   *
   * Y la banda iluminada va FRÍA. La piedra a cielo abierto la ilumina el azul
   * del cielo, no solo el sol; con la razón cálida de antes, el granito salía
   * tostado y, sumado a las juntas largas, acababa pareciendo madera.
   */
  paving: {
    bands: 3,
    edge: 0.045,
    wrap: 0.44,
    shadow: ratio(0.40, 0.50, 0.63),
    mid: ratio(0.80, 0.83, 0.86),
    light: ratio(1.14, 1.18, 1.22),
  },
  /** Corteza: razones sacadas de la rampa medida (0.21× / 0.50× / 1×). */
  bark: {
    bands: 3,
    edge: 0.04,
    wrap: 0.40,
    shadow: ratio(0.30, 0.32, 0.40),
    mid: ratio(0.62, 0.57, 0.49),
    light: ratio(1.24, 1.14, 0.95),
  },
};

/**
 * Convierte un `MeshStandardMaterial` en cel shading.
 *
 * @param {THREE.MeshStandardMaterial} material
 * @param {object} opts
 * @param {'multiply'|'replace'} opts.mode  Teñir la textura o sustituirla.
 * @param {number} opts.bands   Escalones de la rampa. 2 = luz/sombra a secas.
 * @param {number} opts.edge    Anchura del corte. 0 = escalón perfecto.
 * @param {number} opts.wrap    Difuso envolvente: cuánto se mete la luz por
 *                              detrás del terminador antes de cortar.
 * @param {THREE.Vector3} opts.shadow|mid|light  Las tres paradas.
 * @param {number} opts.rim     Brillo de contorno.
 * @param {string} opts.key     Sufijo de la clave de caché de programa.
 * @param {string} opts.extraFragment  GLSL propio inyectado antes del cálculo.
 * @param {string} opts.extraShade     GLSL que puede tocar `toonT` (0..1) antes
 *                                     de cuantizar. Es el sitio para oscurecer
 *                                     sin salirse de la paleta pintada:
 *                                     multiplicar el color de la rampa se va a
 *                                     negro, bajar el nivel cae en la banda de
 *                                     sombra y ahí se queda.
 * @param {object} opts.uniforms       Uniforms adicionales.
 * @param {'hoja'|'hierba'|'tierra'|null} opts.estacion  Canal de tinte de la
 *                              estación, o null para no virar con ella. Es
 *                              opt-in a propósito: la estación es cosa de lo
 *                              que crece y del suelo. Un menhir de granito no
 *                              se pone dorado en octubre, y aplicándolo a todo
 *                              «porque queda cohesionado» se pierde justo el
 *                              contraste entre la piedra y lo que la rodea,
 *                              que es lo que esta isla enseña.
 */
export function applyToonShading(material, {
  mode = 'multiply',
  bands = 3,
  edge = 0.04,
  wrap = 0.45,
  shadow = ratio(0.35, 0.45, 0.56),
  mid = ratio(0.80, 0.82, 0.80),
  light = ratio(1.20, 1.16, 1.04),
  rim = 0,
  rimColor = tone(0xcfe6ee),
  cloudShadow = 0,
  key = 'toon',
  extraFragment = '',
  extraShade = '',
  extraFinal = '',
  estacion = null,
  uniforms: extraUniforms = {},
} = {}) {
  const uniforms = {
    uToonSun: TOON_SUN,
    uToonShadow: { value: shadow },
    uToonMid: { value: mid },
    uToonLight: { value: light },
    uToonBands: { value: bands },
    uToonEdge: { value: edge },
    uToonWrap: { value: wrap },
    uToonRim: { value: rim },
    uToonRimColor: { value: rimColor },
    uTimeLight: TOON_TIME.light,
    uTimeShade: TOON_TIME.shade,
    ...extraUniforms,
  };
  if (cloudShadow > 0) {
    Object.assign(uniforms, {
      uCloudMap: TOON_CLOUDS.map,
      uCloudTime: TOON_CLOUDS.time,
      uCloudScale: TOON_CLOUDS.scale,
      uCloudDrift: TOON_CLOUDS.drift,
      uCloudShadow: { value: cloudShadow },
    });
  }
  if (estacion) {
    Object.assign(uniforms, {
      uEstacionTinte: TOON_ESTACION[estacion],
      uEstacionSeco: TOON_ESTACION.seco,
    });
  }

  material.userData.toon = uniforms;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    if (cloudShadow > 0) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vToonWorld;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vToonWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
           #else
             vToonWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
           #endif`
        );
    }

    shader.fragmentShader = shader.fragmentShader
      // La máscara de sombra vive en `shadowmask_pars_fragment`, que el
      // material físico NO incluye: solo aplica la sombra dentro del bucle de
      // luces, donde ya no se puede tocar. Se inyecta detrás de
      // `shadowmap_pars_fragment` porque necesita `getShadow` ya declarado.
      .replace(
        '#include <shadowmap_pars_fragment>',
        `#include <shadowmap_pars_fragment>
         #include <shadowmask_pars_fragment>

         uniform vec3 uToonSun;
         uniform vec3 uToonShadow;
         uniform vec3 uToonMid;
         uniform vec3 uToonLight;
         uniform float uToonBands;
         uniform float uToonEdge;
         uniform float uToonWrap;
         uniform float uToonRim;
         uniform vec3 uToonRimColor;
         uniform vec3 uTimeLight;
         uniform vec3 uTimeShade;

         ${cloudShadow > 0 ? `
         uniform sampler2D uCloudMap;
         uniform float uCloudTime;
         uniform float uCloudScale;
         uniform vec2 uCloudDrift;
         uniform float uCloudShadow;
         varying vec3 vToonWorld;

         /**
          * Sombra de nube en un punto del mundo.
          *
          * Se muestrea el mismo mapa que dibuja la cúpula, en planta y a escala
          * de cientos de metros, para que la mancha que cruza el prado sea la
          * de la nube que va por arriba. Devuelve 1 a pleno sol y baja hasta
          * 1 - uCloudShadow bajo la nube.
          */
         float cloudShadowAt( vec3 worldPos ) {
           vec2 uv = worldPos.xz * uCloudScale + uCloudDrift * uCloudTime;
           float c = texture2D( uCloudMap, uv ).r;
           // Mismo doble umbral que la cúpula: la mancha tiene contorno.
           float mask = smoothstep( 0.46, 0.60, c );
           return 1.0 - mask * uCloudShadow;
         }` : ''}

         /**
          * Cuantiza la luz en escalones planos.
          *
          * La meseta es plana y todo el cambio ocurre en una franja de anchura
          * \`uToonEdge\` alrededor del centro de cada escalón. Con el borde a
          * cero el corte es el escalón duro del material del suelo de la
          * referencia; subiéndolo se ablanda sin dejar de leerse como banda.
          */
         float toonBand( float t ) {
           float q = t * uToonBands;
           float f = floor( q );
           float s = smoothstep( 0.5 - uToonEdge, 0.5 + uToonEdge, fract( q ) );
           return clamp( ( f + s ) / uToonBands, 0.0, 1.0 );
         }

         vec3 toonRamp( float t ) {
           vec3 c = t < 0.5
             ? mix( uToonShadow, uToonMid, t * 2.0 )
             : mix( uToonMid, uToonLight, t * 2.0 - 1.0 );
           // La hora del día tiñe la banda de luz y la de sombra por separado.
           return c * mix( uTimeShade, uTimeLight, t );
         }

         ${estacion ? GLSL_ESTACION : ''}

         ${extraFragment}`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         {
           // El sol se pasa en coordenadas de mundo para no depender del orden
           // en que three ordene el array de luces: con dos direccionales en
           // escena, el índice 0 no siempre es el sol.
           vec3 toonN = normalize( inverseTransformDirection( geometryNormal, viewMatrix ) );
           float ndl = dot( toonN, normalize( uToonSun ) );
           float toonT = clamp( ndl * ( 1.0 - uToonWrap ) + uToonWrap, 0.0, 1.0 );
           // La sombra proyectada empuja al escalón más bajo en vez de
           // multiplicar: así cae dentro de la misma banda que el resto de la
           // sombra propia y el dibujo se lee como una sola mancha pintada.
           // Y se endurece antes: el PCF la entrega con el borde difuminado,
           // y una sombra pintada tiene contorno.
           toonT = min( toonT, smoothstep( 0.28, 0.60, getShadowMask() ) );

           ${cloudShadow > 0 ? 'toonT *= cloudShadowAt( vToonWorld );' : ''}

           ${extraShade}

           float toonLevel = toonBand( toonT );
           vec3 toonTint = toonRamp( toonLevel );

           float toonRimAmount = 0.0;
           if ( uToonRim > 0.0 ) {
             float facing = 1.0 - clamp( dot( geometryViewDir, geometryNormal ), 0.0, 1.0 );
             toonRimAmount = smoothstep( 0.52, 0.94, facing ) * uToonRim * max( toonLevel, 0.2 );
           }

           ${mode === 'replace'
             ? `// El color lo pone la rampa, no la textura: en la referencia el
                // mapa del follaje solo aporta el recorte alfa.
                vec3 toonBase = toonTint;`
             : `vec3 toonBase = diffuseColor.rgb * toonTint;`}

           ${extraFinal}

           ${estacion
             ? `// Al final del todo, no antes: así vira también el contraluz que
                // la hoja se añade a sí misma más arriba. Una copa dorada tiene
                // que encenderse dorada a contraluz, y una hoja seca casi no
                // encenderse.
                toonBase = estacionar( toonBase );`
             : ''}

           reflectedLight.directDiffuse = toonBase;
           reflectedLight.indirectDiffuse = vec3( 0.0 );
           reflectedLight.directSpecular = uToonRimColor * toonRimAmount * uTimeLight;
           reflectedLight.indirectSpecular = vec3( 0.0 );
         }`
      );
  };

  // Clave propia: sin ella three reutiliza el programa del material base y el
  // cel shading no llega a compilarse nunca.
  // La estación entra en la clave porque cambia el CÓDIGO del shader, no solo
  // un uniform: dos materiales con la misma `key` y distinto canal de tinte
  // compartirían programa y uno de los dos se quedaría sin virar.
  material.customProgramCacheKey = () =>
    `toon-${key}-${mode}-${cloudShadow > 0 ? 'c' : 'n'}-${estacion ?? 'x'}-v2`;
  return material;
}
