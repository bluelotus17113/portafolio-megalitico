/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EDITA ESTE FICHERO Y NADA MÁS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todo el texto del portafolio vive aquí. Los datos que trae ahora son
 * marcadores de posición: cambia los valores y la escena 3D se reconstruye
 * sola (número de monolitos, de runas, de hitos del camino…).
 *
 * Reglas prácticas:
 *  - Proyectos: la escena coloca un monolito por proyecto. Entre 6 y 12 se ve
 *    bien; con más, el círculo se aprieta.
 *  - Habilidades: una runa por habilidad, agrupadas por `family`.
 *  - Trayectoria: un mojón por entrada, ordenadas de la más antigua a la más
 *    reciente (el camino sube hacia el presente).
 */

export const IDENTITY = {
  /** Se muestra en la cabecera y en la pantalla de carga. */
  name: 'TU NOMBRE',
  /** Una línea. Aparece bajo el nombre en la pantalla de entrada. */
  role: 'Perfil profesional',
  /** Se graba en ogham en la estela. Solo letras latinas; sin números. */
  oghamMotto: 'ainm',
};

export const ABOUT = {
  title: 'Sobre mí',
  subtitle: 'La Estela de Inscripciones',
  /** Párrafos. Añade o quita los que quieras. */
  body: [
    'Marcador de posición. Aquí va el texto de presentación: quién eres, a qué te dedicas y qué tipo de trabajo buscas. Dos o tres párrafos cortos funcionan mejor que uno largo.',
    'Segundo párrafo de ejemplo. Sirve para el enfoque, la forma de trabajar o aquello que te distingue. Sustituye este texto por el tuyo.',
  ],
  /** Datos sueltos que se muestran como fichas. */
  facts: [
    { label: 'Ubicación', value: '—' },
    { label: 'Disponibilidad', value: '—' },
    { label: 'Idiomas', value: '—' },
    { label: 'Enfoque', value: '—' },
  ],
};

export const PROJECTS = [
  {
    id: 'p1',
    title: 'Proyecto uno',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto en una o dos frases. Qué era, qué problema resolvía y cuál fue tu papel.',
    stack: ['Herramienta', 'Herramienta', 'Herramienta'],
    /** Opcional: enlace externo. Déjalo en null si no hay. */
    url: null,
    /** Semilla del cartel procedural que flota sobre el monolito. */
    poster: { seed: 101, hue: 186 },
  },
  {
    id: 'p2',
    title: 'Proyecto dos',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 202, hue: 42 },
  },
  {
    id: 'p3',
    title: 'Proyecto tres',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 303, hue: 268 },
  },
  {
    id: 'p4',
    title: 'Proyecto cuatro',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta'],
    url: null,
    poster: { seed: 404, hue: 12 },
  },
  {
    id: 'p5',
    title: 'Proyecto cinco',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 505, hue: 152 },
  },
  {
    id: 'p6',
    title: 'Proyecto seis',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 606, hue: 320 },
  },
  {
    id: 'p7',
    title: 'Proyecto siete',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta'],
    url: null,
    poster: { seed: 707, hue: 210 },
  },
  {
    id: 'p8',
    title: 'Proyecto ocho',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 808, hue: 88 },
  },
  {
    id: 'p9',
    title: 'Proyecto nueve',
    tag: 'Categoría',
    year: '20XX',
    summary: 'Descripción breve del proyecto. Sustituye este texto.',
    stack: ['Herramienta', 'Herramienta'],
    url: null,
    poster: { seed: 909, hue: 340 },
  },
];

/**
 * `level` de 0 a 1: controla el tamaño y el brillo de la runa.
 * `family` agrupa las runas en anillos concéntricos.
 */
export const SKILLS = [
  { name: 'Habilidad A', family: 'Núcleo', level: 0.95 },
  { name: 'Habilidad B', family: 'Núcleo', level: 0.90 },
  { name: 'Habilidad C', family: 'Núcleo', level: 0.82 },
  { name: 'Habilidad D', family: 'Núcleo', level: 0.75 },
  { name: 'Habilidad E', family: 'Oficio', level: 0.88 },
  { name: 'Habilidad F', family: 'Oficio', level: 0.80 },
  { name: 'Habilidad G', family: 'Oficio', level: 0.72 },
  { name: 'Habilidad H', family: 'Oficio', level: 0.65 },
  { name: 'Habilidad I', family: 'Oficio', level: 0.60 },
  { name: 'Habilidad J', family: 'Herramientas', level: 0.78 },
  { name: 'Habilidad K', family: 'Herramientas', level: 0.70 },
  { name: 'Habilidad L', family: 'Herramientas', level: 0.62 },
  { name: 'Habilidad M', family: 'Herramientas', level: 0.55 },
  { name: 'Habilidad N', family: 'Herramientas', level: 0.50 },
];

/** De la más antigua a la más reciente: el camino asciende hacia el presente. */
export const EXPERIENCE = [
  {
    period: '20XX — 20XX',
    role: 'Puesto o etapa',
    org: 'Organización',
    detail: 'Una o dos frases sobre lo que hiciste y qué dejaste hecho.',
  },
  {
    period: '20XX — 20XX',
    role: 'Puesto o etapa',
    org: 'Organización',
    detail: 'Una o dos frases. Sustituye este texto.',
  },
  {
    period: '20XX — 20XX',
    role: 'Puesto o etapa',
    org: 'Organización',
    detail: 'Una o dos frases. Sustituye este texto.',
  },
  {
    period: '20XX — 20XX',
    role: 'Puesto o etapa',
    org: 'Organización',
    detail: 'Una o dos frases. Sustituye este texto.',
  },
  {
    period: '20XX — hoy',
    role: 'Puesto actual',
    org: 'Organización',
    detail: 'Una o dos frases. Sustituye este texto.',
  },
];

export const CONTACT = {
  title: 'Contacto',
  subtitle: 'El Altar de Mensajes',
  intro: 'Marcador de posición. Aquí va la invitación a escribirte y por qué canal prefieres que lo hagan.',
  /** `href` en null deja el enlace desactivado y visualmente apagado. */
  links: [
    { label: 'Correo', value: 'tu@correo', href: null, rune: 'ansuz' },
    { label: 'GitHub', value: 'usuario', href: null, rune: 'gebo' },
    { label: 'LinkedIn', value: 'usuario', href: null, rune: 'mannaz' },
    { label: 'Web', value: 'tudominio', href: null, rune: 'ingwaz' },
  ],
  /**
   * Formulario: si pones aquí un endpoint (Formspree, Basin, tu backend…) el
   * altar lo enviará de verdad. Con null solo simula el envío.
   */
  endpoint: null,
};
