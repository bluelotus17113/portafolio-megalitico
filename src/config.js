/**
 * Configuración global de la experiencia.
 *
 * Todo lo que se ajusta a ojo (paleta, escala del mundo, posición de cada
 * santuario) vive aquí para no tener que bucear por los módulos.
 */

export const SEED = 20260818;

/**
 * Paleta de fondo pintado.
 *
 * Los verdes y el azul de sombra vienen medidos de los .blend de referencia
 * de estilo anime (ver `src/vfx/toon.js`); el resto se ha llevado a esa misma
 * familia. La regla que los une es la de siempre en este estilo: **la sombra
 * cambia de tono, no solo de brillo** — todo lo que no da al sol se va al azul
 * verdoso, sea hierba, piedra o corteza.
 */
export const PALETTE = {
  // Cielo y atmósfera
  skyTop: 0x2b6fc4,
  // Cian de verdad, no un blanco azulado. Medido sobre la captura: con
  // #dcf0f7 el horizonte salía a (182,195,197) — o sea, gris — porque de tan
  // pálido no le quedaba croma que defender contra los verdes del prado.
  skyHorizon: 0x9fd4ea,
  sunColor: 0xfff4dc,
  // La bruma es EXACTAMENTE el color del horizonte del cielo, no un pariente.
  //
  // Es lo que hace desaparecer el borde del mundo: el mar se apaga hacia este
  // color y, cuando se acaba la lámina de agua, lo que hay detrás es el mismo
  // color. Con dos tonos distintos, por parecidos que fueran, quedaba una raya
  // recta a lo ancho de la pantalla donde terminaba el plano del océano.
  fogColor: 0x9fd4ea,
  cloudLight: 0xfdfdf8,
  cloudShade: 0xa9c2da,
  // Terreno
  grassDark: 0x1b5d31,
  grassLight: 0x73bd42,
  rock: 0xcfd0c4,
  rockDark: 0x9aa39d,
  // Tierra vista del terreno. Va aparte del color de los megalitos: usando el
  // mismo gris de piedra, los afloramientos y las laderas peladas salían de un
  // caqui apagado que competía con el verde en vez de acompañarlo. El ocre
  // cálido es el color con el que se pintan los caminos en este estilo.
  earth: 0xa08a6b,
  lichen: 0x8fb355,
  sand: 0xd8cba6,
  // Mar
  oceanDeep: 0x14496e,
  oceanShallow: 0x3fa8b4,
  // Turquesa del bajío cristalino, entre los hilos de cáustica.
  oceanClear: 0x4fd3d8,
  // El hilo de la red de cáusticas: blanco con un punto de cian, no blanco
  // puro — sobre el turquesa, el blanco puro se lee como espuma.
  caustic: 0xdffbff,
  foam: 0xf2fbfd,
  // Luz arcana
  arcane: 0x4fe6d8,
  arcaneDeep: 0x1a8f9c,
  ember: 0xffa441,
  emberDeep: 0xd4451a,
  gold: 0xf2c66d,
};

/**
 * Huella de cada estrado enlosado, en unidades de mundo.
 *
 * Es la ÚNICA fuente de verdad del tamaño de las plataformas. La leen tres
 * cosas que tienen que coincidir sí o sí: el propio santuario al construirse,
 * el arbolado para no plantar encima, y la hierba para no brotar a través de
 * las losas. Teniéndola en tres sitios distintos, la hierba acababa
 * atravesando el enlosado en cuanto alguien tocaba un radio.
 */
export const DAIS = {
  plaza: { radius: 24, steps: 3, stepWidth: 2.6 },
  about: { radius: 11, steps: 2, stepWidth: 3.2 },
  projects: { radius: 17, steps: 3, stepWidth: 3.2 },
  skills: { radius: 15, steps: 3, stepWidth: 3.2 },
  experience: { radius: 8.5, steps: 2, stepWidth: 3.2 },
  contact: { radius: 11.5, steps: 2, stepWidth: 3.2 },
};

/** Radio exterior del escalón más bajo, incluido el bordillo de cantos. */
export function daisOuterRadius(id) {
  const d = DAIS[id];
  return d ? d.radius + d.steps * d.stepWidth + 1.6 : 0;
}

export const WORLD = {
  /** Radio del disco de terreno navegable. */
  radius: 168,
  /**
   * Altura de la meseta sobre el nivel del mar.
   *
   * El promontorio se lee como una mesa alzada sobre el Atlántico: cuanto más
   * alta, más se nota el acantilado y más presencia tiene la isla desde el
   * mirador.
   */
  plateau: 44,
  /** Nivel del mar en Y. */
  seaLevel: 0,
  /** Radio del círculo central de losas. Espejo de DAIS.plaza. */
  plazaRadius: DAIS.plaza.radius,
  /**
   * Dirección (en radianes, medida como atan2(z, x)) hacia la que sube el
   * interior. El lado opuesto es mar abierto. Toda la composición depende de
   * este ángulo: la cámara de bienvenida se coloca perpendicular a él para
   * dejar el mar a la izquierda y las colinas a la derecha.
   */
  inlandDirection: -2.24,
};

/**
 * Los cinco santuarios.
 *
 * `anchor` es dónde se planta el monumento; `facing` la dirección a la que
 * mira (su +Z local); `view` desde dónde lo enfoca la cámara: distancia
 * horizontal, altura sobre el punto de interés y azimut absoluto.
 *
 * Las posiciones no son arbitrarias: están repartidas alrededor de la plaza
 * de modo que, desde la vista de bienvenida, "Sobre mí" y "Contacto" caigan
 * a la izquierda contra el mar, y "Proyectos", "Habilidades" y "Trayectoria"
 * a la derecha sobre las colinas. Cambiar una obliga a revisar el conjunto.
 */
/**
 * El islote y su calzada.
 *
 * La dirección está MEDIDA, no elegida. Se lanza un rayo desde el mirador a la
 * cima para cada rumbo y se mira cuánto lo corta la isla; contando también el
 * arbolado, que es lo que decide. El primer intento fue 2,47 —justo hacia
 * donde apunta la cámara— y era el sitio equivocado: la vista salía limpia
 * mientras el rayo solo miraba el terreno, y con las copas puestas el islote
 * caía dos dedos por debajo de la línea de árboles del borde. Existía, se
 * proyectaba al centro del cuadro y no se veía.
 *
 * A 2,60 el rayo va tapado un 2 % contra el 8-21 % de todos los demás rumbos,
 * y no es casualidad: ahí la costa se retira a 162 en vez de a 175. Es una
 * ensenada, o sea el único hueco por el que de verdad se ve el mar abierto
 * desde donde aterriza el visitante.
 *
 * El radio y la distancia están topados por la malla del terreno, que es una
 * baldosa de 520 × 520. Con el centro a 250 el islote ocupa x ∈ [-230, -162],
 * z ∈ [122, 190]: dentro con holgura, así que lo tesela la malla que ya
 * existe y no hace falta una segunda.
 */
export const ISLOTE = {
  /** Hacia dónde, en radianes. Medido, no elegido a ojo. */
  rumbo: 2.75,
  /** A qué distancia del centro de la isla grande. La costa está en 174. */
  distancia: 240,
  radius: 30,
  /**
   * Cota de la cima.
   *
   * Empezó en 21 y no se veía, y el motivo es puramente geométrico: desde el
   * mirador se mira desde 88 m de altura y ligeramente hacia abajo, así que un
   * islote bajo a ochenta metros de la orilla se proyecta EN la banda de copas
   * del propio borde de la isla. Medido: caía en y≈224 de un cuadro de 660, y
   * ahí lo que hay son árboles. Da igual el rumbo — se probaron los veintisiete
   * que caben en el encuadre y los veintisiete daban en verde.
   *
   * Subirlo a 42 tampoco era la respuesta: con radio 30 sale un cono de
   * paredes rectas —una pantalla de lámpara— y la calzada tiene que trepar
   * ocho metros para tocarlo. La respuesta es el SITIO, no la altura: a 2,75
   * hay un hueco por el que se ve mar abierto entre las copas, medido
   * proyectando cada rumbo candidato sobre una captura real y mirando qué
   * píxel hay ahí. Sobre ese hueco un islote de veintidós metros se ve entero.
   */
  altura: 22,
  /** Ancho del bajío por el que va la calzada, y a qué profundidad lo deja. */
  bajio: { halfWidth: 8, blend: 11, depth: -3.0 },
  /** Ancho de la losa de la calzada y cada cuánto va una pila. */
  calzada: { ancho: 4.6, tramo: 5.2 },
};

export const SECTIONS = [
  {
    id: 'about',
    label: 'Sobre mí',
    kicker: 'I',
    subtitle: 'La Estela de Inscripciones',
    lore: 'Una piedra ogham en pie. Cada muesca del canto es una letra; el conjunto, una vida grabada a cincel.',
    anchor: [24, 0, 40],
    facing: -2.601,
    color: PALETTE.arcane,
    view: { distance: 17, height: 8.5, azimuth: -2.601 },
  },
  {
    id: 'projects',
    label: 'Proyectos',
    kicker: 'II',
    subtitle: 'El Círculo de Monolitos',
    lore: 'Piedras erguidas en corro. En el aire sobre cada una se proyecta la obra que custodia.',
    anchor: [-68, 0, 11],
    facing: 1.731,
    color: PALETTE.gold,
    view: { distance: 42, height: 25, azimuth: 1.731 },
  },
  {
    id: 'skills',
    label: 'Habilidades',
    kicker: 'III',
    subtitle: 'Las Runas Místicas',
    lore: 'Un anillo de runas suspendidas. Cada glifo arde con la intensidad del oficio que nombra.',
    anchor: [-24, 0, -78],
    facing: 0.297,
    color: PALETTE.arcaneDeep,
    view: { distance: 30, height: 15, azimuth: 0.297 },
  },
  {
    id: 'experience',
    label: 'Trayectoria',
    kicker: 'IV',
    subtitle: 'El Camino del Viajero',
    lore: 'Un sendero de mojones que asciende. Cada hito marca un tramo andado y el año en que se anduvo.',
    anchor: [-34, 0, -34],
    // Mira hacia el interior: el camino sale del estrado y sube a las colinas.
    facing: -2.47,
    color: PALETTE.lichen,
    // De través al sendero: los mojones se alinean en el cuadro y se lee
    // como una línea de tiempo que sube. Mirando en la dirección de marcha
    // se tapaban unos a otros.
    view: { distance: 42, height: 24, azimuth: -0.90 },
  },
  {
    id: 'contact',
    label: 'Contacto',
    kicker: 'V',
    subtitle: 'El Altar de Mensajes',
    lore: 'Un dolmen con brasero encendido. Lo que se escribe aquí viaja con el humo.',
    anchor: [51, 0, 10],
    facing: -1.765,
    color: PALETTE.ember,
    view: { distance: 20, height: 9.5, azimuth: -1.765 },
  },
];

/**
 * Vista de bienvenida.
 *
 * Perpendicular a `WORLD.inlandDirection`, a media altura y cerca: se busca
 * el encuadre de una fotografía a pie de acantilado, no un mapa desde el
 * cielo. El círculo central queda en el centro del cuadro con el mar
 * abriéndose a la izquierda.
 */
export const HOME_VIEW = {
  position: [72, 88, -57],
  // El punto de interés sube ocho metros para levantar el encuadre.
  //
  // Con el objetivo a 48 la línea del horizonte caía al 94 % de la altura del
  // cuadro: no quedaba cielo, y en un fondo pintado el cielo es medio cuadro.
  // A 56 el horizonte baja al 77 % y entra una franja de celeste y nubes.
  target: [0, 56, 0],
};

export const QUALITY = {
  /** Se recalcula en runtime según el dispositivo. */
  pixelRatioCap: 2,
  // Subido desde 42.000. A ese número salían 0,47 briznas por metro cuadrado
  // y de cerca se veían de una en una, como alfileres. La brizna nueva son 16
  // triángulos y siguen cabiendo todas en un solo draw call sin sombras.
  grassBlades: 110000,
  motes: 2600,
  // Aos sí. Son pocos a propósito: cada uno piensa por su cuenta y lo que los
  // hace leerse como seres es que se les pueda seguir uno. Con doscientos
  // vuelven a ser un sistema de partículas.
  espiritus: 26,
};
