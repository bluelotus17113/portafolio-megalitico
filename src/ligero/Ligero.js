/**
 * La versión ligera: el mismo portafolio, como página que se lee del tirón.
 *
 * No es un plan B ni un volcado de texto. Es la otra mitad del proyecto, para
 * el equipo que no puede con la escena, para el visitante con prisa y para
 * quien prefiere leer a explorar. Se dibuja desde `content.js` —los mismos
 * datos que amueblan el promontorio—, así que rellenar el contenido una vez
 * llena las dos versiones.
 *
 * Aquí no entra nada de three, ni directa ni indirectamente. Es el requisito
 * entero: si el motor viajase de acompañante, un móvil de gama baja se seguiría
 * descargando 635 kB antes de leer la primera línea y esto no serviría de nada.
 * Los `import` de este fichero hay que mirarlos con esa lupa.
 */

import { SECTIONS } from '../config.js';
import { ABOUT, CONTACT, EXPERIENCE, IDENTITY, PROJECTS, SKILLS } from '../content.js';
import { esc, hex } from '../utils/html.js';
import { runeFor } from '../utils/runes.js';
import { oghamSVG, runaSVG } from '../utils/glifos.js';
import { posterCanvas } from '../utils/posters.js';
import { enviarContacto, formularioContacto } from '../ui/contacto.js';
import { cambiarModo, haySoporteWebGL, PLENO } from '../modo.js';
import './ligero.css';

const SECCION = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

/**
 * La runa de cada sección, elegida por lo que significa.
 *
 * El primer intento la sacaba de un hash del identificador, y el resultado se
 * veía enseguida: a «Proyectos» le tocó *isaz*, que es una raya vertical y a
 * veinte píxeles no se lee como runa sino como una marca suelta que alguien se
 * dejó ahí. Un sorteo no puede acertar con algo que se mira de cerca.
 *
 * Estas cinco dicen lo que dice su sección, que es lo que hace que el panel
 * parezca grabado por alguien y no estampado por una máquina:
 *
 *   mannaz   el hombre, la persona          → Sobre mí
 *   ingwaz   la semilla, la obra acabada    → Proyectos
 *   kaunan   la antorcha, el saber          → Habilidades
 *   raidho   el viaje, la cabalgada         → Trayectoria (El Camino del Viajero)
 *   ansuz    la palabra, el mensaje         → Contacto (El Altar de Mensajes)
 */
const RUNA_DE_SECCION = {
  about: 'mannaz',
  projects: 'ingwaz',
  skills: 'kaunan',
  experience: 'raidho',
  contact: 'ansuz',
};

/** La espiral triple de la marca, en línea para no pedir un fichero. */
const ESPIRAL = `
  <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
    <path d="M16 16 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a4 4 0 1 0 4 -4 a6.5 6.5 0 1 1 -6.5 6.5 a9 9 0 1 0 9 -9"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>`;

export class Ligero {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.aviso] Motivo por el que se ha llegado aquí sin
   *   pedirlo (sin WebGL, o la escena reventó). Se muestra arriba del todo.
   */
  montar({ aviso } = {}) {
    // A los dos: `base.css` le quita el desplazamiento al documento entero para
    // la escena, y devolvérselo sólo a `body` deja a `html` de contenedor que
    // no desplaza, con lo que la cabecera fija se queda por el camino.
    document.documentElement.classList.add('ligero-activo');
    document.body.classList.add('ligero-activo');
    document.title = `${IDENTITY.name} · Portafolio`;

    this.root.innerHTML = this._html(aviso);
    this.root.hidden = false;

    this._bind();
    this._laminas();
    this._seguirSeccion();
    this._revelar();
  }

  // ------------------------------------------------------------------ marcado

  /**
   * Las cinco secciones van envueltas y no sueltas: ese envoltorio es el que
   * lleva la línea vertical continua que recorre la página de la que cuelgan
   * todas. Puesta en el `main` cruzaría la portada, que es a ancho completo.
   */
  _html(aviso) {
    return `
      ${this._fondo()}
      ${aviso ? `<p class="lg-aviso" role="status">${esc(aviso)}</p>` : ''}
      ${this._cabecera()}
      <main class="lg-cuerpo">
        ${this._portada()}
        <div class="lg-secciones">
          ${this._sobreMi()}
          ${this._proyectos()}
          ${this._habilidades()}
          ${this._trayectoria()}
          ${this._contacto()}
        </div>
      </main>
      ${this._pie()}
    `;
  }

  /**
   * El fondo que se mueve: dos resplandores a la deriva y una capa de motas
   * que asciende. Tres elementos vacíos y ni una línea de JavaScript.
   *
   * El detalle importante está en la hoja de estilos —sólo se animan
   * `transform` y `opacity`, que el navegador resuelve componiendo capas ya
   * dibujadas— y el motivo es esta versión: una animación que obligue a
   * repintar el fondo en cada fotograma es exactamente lo que no puede
   * permitirse el equipo para el que existe.
   */
  _fondo() {
    return `
      <div class="lg-fondo" aria-hidden="true">
        <span class="lg-fondo__luz lg-fondo__luz--a"></span>
        <span class="lg-fondo__luz lg-fondo__luz--b"></span>
        <span class="lg-fondo__motas"></span>
      </div>`;
  }

  _cabecera() {
    const enlaces = SECTIONS.map(
      (s) => `<a class="lg-nav__enlace" href="#lg-${s.id}" data-nav="${s.id}">${esc(s.label)}</a>`
    ).join('');

    return `
      <header class="lg-cabecera">
        <a class="lg-marca" href="#lg-portada">
          <span class="lg-marca__glifo">${ESPIRAL}</span>
          <span class="lg-marca__nombre">${esc(IDENTITY.name)}</span>
        </a>
        <nav class="lg-nav" aria-label="Secciones">${enlaces}</nav>
        ${this._botonEscena('lg-cabecera__modo')}
        <span class="lg-progreso" aria-hidden="true"></span>
      </header>
    `;
  }

  /**
   * El botón que lleva a la escena. Sólo se pinta si el equipo puede dibujarla:
   * ofrecer un viaje al promontorio a un navegador sin WebGL sería mandarlo a
   * una pantalla negra y de vuelta.
   */
  _botonEscena(clase) {
    if (!haySoporteWebGL()) return '';
    return `
      <button class="${clase}" type="button" data-a-escena>
        <span class="lg-punto" aria-hidden="true"></span>
        Ver en 3D
      </button>`;
  }

  _portada() {
    const datos = (ABOUT.facts ?? [])
      .map(
        (f) => `
        <div class="lg-dato">
          <dt>${esc(f.label)}</dt>
          <dd>${esc(f.value)}</dd>
        </div>`
      )
      .join('');

    return `
      <section class="lg-portada" id="lg-portada">
        <div class="lg-portada__texto">
          <p class="lg-kicker">Portafolio</p>
          <h1 class="lg-portada__nombre">${esc(IDENTITY.name)}</h1>
          <p class="lg-portada__rol">${esc(IDENTITY.role)}</p>
          <div class="lg-portada__acciones">
            <a class="lg-boton" href="#lg-projects">Ver los proyectos</a>
            <a class="lg-boton lg-boton--linea" href="#lg-contact">Escríbeme</a>
          </div>
        </div>
        ${datos ? `<dl class="lg-datos">${datos}</dl>` : ''}
      </section>
    `;
  }

  /**
   * Cabecera de sección. Lleva el mismo número romano, el mismo subtítulo y la
   * misma línea de ambientación que el panel de la escena, y se tiñe del color
   * que `config.js` le da a ese monumento: quien salte de una versión a la otra
   * reconoce dónde está.
   *
   * Va en la columna estrecha de la izquierda y se queda fija mientras se lee
   * la sección. En una sección larga —los nueve proyectos— eso es lo que
   * impide perder de vista dónde está uno: el título deja de ser un rótulo que
   * pasó hace tres pantallas y se convierte en el encabezado de lo que se está
   * mirando.
   */
  _cabeceraSeccion(id) {
    const s = SECCION[id];
    return `
      <header class="lg-seccion__cab">
        <p class="lg-seccion__num">
          <span>${esc(s.kicker)}</span>
          <span class="lg-seccion__runa">${runaSVG(RUNA_DE_SECCION[id] ?? 'algiz', { tam: 22, grosor: 1.5 })}</span>
        </p>
        <h2 class="lg-seccion__titulo">${esc(s.label)}</h2>
        <p class="lg-seccion__sub">${esc(s.subtitle)}</p>
        <p class="lg-seccion__lore">${esc(s.lore)}</p>
      </header>`;
  }

  /**
   * Cada sección lleva su nombre grabado en ogham, en la calle que separa el
   * raíl del contenido.
   *
   * Es lo que convierte la línea vertical en una arista labrada — el *druim*
   * sobre el que se escribe el ogham es justo eso, el canto de la piedra. Y no
   * es adorno con forma de escritura: son las letras del propio título,
   * transcritas por el mismo módulo que talla la estela de la escena. Quien
   * sepa leerlo, lo lee.
   */
  _seccion(id, contenido) {
    const s = SECCION[id];
    return `
      <section class="lg-seccion" id="lg-${id}" style="--acento: ${hex(s.color)}">
        <span class="lg-seccion__ogham" aria-hidden="true">${oghamSVG(s.label, {
          alto: 150,
          grosor: 1.1,
        })}</span>
        ${this._cabeceraSeccion(id)}
        <div class="lg-seccion__cuerpo">${contenido}</div>
      </section>`;
  }

  _sobreMi() {
    const parrafos = ABOUT.body.map((p) => `<p>${esc(p)}</p>`).join('');
    return this._seccion('about', `<div class="lg-prosa">${parrafos}</div>`);
  }

  _proyectos() {
    const fichas = PROJECTS.map((p, i) => {
      const semilla = p.poster?.seed ?? 100 + i * 11;
      const tono = p.poster?.hue ?? (i * 47) % 360;
      const etiquetas = p.stack?.length
        ? `<ul class="tags">${p.stack.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : '';
      const enlace = p.url
        ? `<a class="lg-ficha__enlace" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ver el proyecto ↗</a>`
        : '';

      return `
        <li class="lg-ficha">
          <div class="lg-ficha__lamina" data-lamina data-semilla="${semilla}" data-tono="${tono}"
               role="img" aria-label="Lámina del proyecto ${esc(p.title)}"></div>
          <div class="lg-ficha__cuerpo">
            <p class="lg-ficha__meta">
              <span class="lg-ficha__indice">${String(i + 1).padStart(2, '0')}</span>
              <span>${esc(p.tag)}</span>
              <span class="lg-ficha__ano">${esc(p.year)}</span>
            </p>
            <h3 class="lg-ficha__titulo">${esc(p.title)}</h3>
            <p class="lg-ficha__resumen">${esc(p.summary)}</p>
            ${etiquetas}
            ${enlace}
          </div>
        </li>`;
    }).join('');

    return this._seccion('projects', `<ul class="lg-rejilla">${fichas}</ul>`);
  }

  _habilidades() {
    const familias = [...new Set(SKILLS.map((s) => s.family))];
    const bloques = familias
      .map((familia) => {
        const medidores = SKILLS.filter((s) => s.family === familia)
          .map(
            (s) => `
            <div class="meter">
              <div class="meter__head">
                <span class="meter__name">${esc(s.name)}</span>
                <span class="meter__rune">${esc(runeFor(s.name + s.family))}</span>
              </div>
              <div class="meter__track">
                <span class="meter__fill" style="right: ${(100 - s.level * 100).toFixed(1)}%"></span>
              </div>
            </div>`
          )
          .join('');
        return `
          <div class="lg-familia">
            <h3 class="lg-familia__titulo">${esc(familia)}</h3>
            ${medidores}
          </div>`;
      })
      .join('');

    return this._seccion('skills', `<div class="lg-familias">${bloques}</div>`);
  }

  /**
   * El sendero: un dibujo del propio monumento, al fondo de su sección.
   *
   * En la escena, Trayectoria es «un sendero de mojones que asciende», y aquí
   * es lo mismo en dos dimensiones — una vereda que serpentea hacia arriba con
   * un mojón por etapa. Asciende porque la cronología se lee de lo más
   * reciente a lo más antiguo: arriba está el presente, que es adonde lleva el
   * camino.
   *
   * Va en la banda derecha, que es la única parte de la sección que está
   * vacía: el detalle de cada hito tiene la medida topada en 62 caracteres y
   * deja un palmo libre. Cruzando por detrás del texto, una línea a media
   * opacidad no se lee como marca de agua sino como un fallo de pintado.
   *
   * Todo son LÍNEAS, ninguna forma cerrada. El SVG se estira para llenar el
   * alto de la sección, que depende de cuántas etapas haya, y ese estirado no
   * es igual en los dos ejes: un círculo saldría elipse y un cuadrado, rombo.
   * Una línea sólo cambia de largo, que da igual.
   *
   * Y son TRES trazos y no uno. Una sola raya serpenteando se lee como un
   * garabato; con las dos orillas a los lados pasa a leerse como una vereda
   * pisada, que es lo que se quería decir. El del medio es el que se traza
   * solo —el viaje—; las orillas ya están cuando llega.
   */
  _sendero(etapas) {
    const ALTO = 1000;
    const ANCHO = 120;
    const eje = ANCHO / 2;
    const ORILLA = 9;

    // Una S suave de curvatura alternada: un camino que busca la pendiente, no
    // una diagonal tirada a regla.
    const enX = (t) => eje + Math.sin(t * Math.PI * 1.7 + 0.35) * 34;

    /** Curva suave por los puntos, desplazada `dx` en horizontal. */
    const trazo = (dx) => {
      const pts = [];
      for (let i = 0; i <= etapas * 2; i++) {
        const t = i / (etapas * 2);
        pts.push({ x: enX(t) + dx, y: ALTO * (1 - t) });
      }
      let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const my = (a.y + b.y) / 2;
        d += ` C${a.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }
      return d;
    };

    // Un mojón por etapa: el travesaño que cruza la vereda y la piedra hincada
    // a su lado. Los dos son líneas.
    const mojones = Array.from({ length: etapas }, (_, i) => {
      const t = (i + 0.5) / etapas;
      const x = enX(t);
      const y = ALTO * (1 - t);
      const ultimo = i === etapas - 1;
      const largo = ORILLA + (ultimo ? 13 : 7);
      const alto = ultimo ? 26 : 18;
      // `vector-effect` va en cada línea y no en el grupo: no se hereda, y sin
      // él el grosor del trazo se estira con la caja y los travesaños salen
      // más gordos o más finos según cuántas etapas haya.
      return `<g class="lg-sendero__mojon" style="--i:${i}">
        <line vector-effect="non-scaling-stroke"
              x1="${(x - largo).toFixed(1)}" y1="${y.toFixed(1)}"
              x2="${(x + largo).toFixed(1)}" y2="${y.toFixed(1)}" />
        <line vector-effect="non-scaling-stroke"
              x1="${(x + largo).toFixed(1)}" y1="${y.toFixed(1)}"
              x2="${(x + largo).toFixed(1)}" y2="${(y - alto).toFixed(1)}" />
      </g>`;
    }).join('');

    return `
      <span class="lg-sendero" aria-hidden="true">
        <svg viewBox="0 0 ${ANCHO} ${ALTO}" preserveAspectRatio="none" fill="none"
             stroke="currentColor" stroke-linecap="round">
          <path class="lg-sendero__orilla" d="${trazo(-ORILLA)}" vector-effect="non-scaling-stroke" />
          <path class="lg-sendero__orilla" d="${trazo(ORILLA)}" vector-effect="non-scaling-stroke" />
          <g class="lg-sendero__mojones">${mojones}</g>
          <path class="lg-sendero__vereda" d="${trazo(0)}" vector-effect="non-scaling-stroke" />
        </svg>
      </span>`;
  }

  /**
   * La cronología es el único componente que NO se reutiliza del panel.
   *
   * El del panel apila periodo, puesto y detalle en vertical porque vive en
   * una columna de 380 px, donde no cabe otra cosa. Aquí hay más del doble de
   * ancho, y apilar en vertical algo que se lee como una tabla —fecha a la
   * izquierda, qué pasó a la derecha— desaprovecha el sitio y obliga al ojo a
   * bajar buscando la fecha de cada entrada. Reutilizar por reutilizar habría
   * salido peor que escribir doce líneas.
   */
  _trayectoria() {
    // De la etapa más reciente a la más antigua, igual que el panel de la
    // escena: es el orden en que se lee un currículo, aunque el sendero en 3D
    // se recorra al revés.
    const hitos = [...EXPERIENCE]
      .reverse()
      .map(
        (e) => `
        <li class="lg-hito">
          <p class="lg-hito__periodo">${esc(e.period)}</p>
          <div class="lg-hito__cuerpo">
            <h3 class="lg-hito__puesto">${esc(e.role)}</h3>
            <p class="lg-hito__org">${esc(e.org)}</p>
            <p class="lg-hito__detalle">${esc(e.detail)}</p>
          </div>
        </li>`
      )
      .join('');

    return this._seccion(
      'experience',
      `${this._sendero(EXPERIENCE.length)}<ol class="lg-hitos">${hitos}</ol>`
    );
  }

  _contacto() {
    const canales = (CONTACT.links ?? [])
      .map((link) => {
        const apagado = !link.href;
        return `
          <li>
            <a class="channels__link" href="${esc(link.href ?? '#')}"
               ${apagado ? 'aria-disabled="true" tabindex="-1"' : 'target="_blank" rel="noopener noreferrer"'}>
              <span class="channels__label">${esc(link.label)}</span>
              <span class="channels__value">${esc(link.value)}</span>
            </a>
          </li>`;
      })
      .join('');

    return this._seccion(
      'contact',
      `
      <div class="lg-contacto">
        <div>
          <p class="lg-prosa">${esc(CONTACT.intro)}</p>
          <ul class="channels">${canales}</ul>
        </div>
        ${formularioContacto()}
      </div>`
    );
  }

  /**
   * El pie es también la salida de emergencia.
   *
   * Cuando la sonda dice que no hay WebGL, la cabecera no ofrece el viaje al
   * promontorio: mandar a alguien a una pantalla negra no es amabilidad. Pero
   * quedarse ahí convertía un falso negativo en una condena sin apelación — el
   * visitante que sabe que su equipo puede no tenía ni un sitio donde
   * insistir, y ni siquiera se le decía que existiera algo más. Así que abajo,
   * discreto y con el nombre puesto, hay un botón que lo intenta igualmente.
   * Si de verdad no puede, vuelve aquí con el motivo en la mano.
   */
  _pie() {
    const salida = haySoporteWebGL()
      ? this._botonEscena('lg-boton lg-boton--linea')
      : `<button class="lg-boton lg-boton--linea lg-boton--tenue" type="button" data-a-escena>
           Intentar el 3D de todos modos
         </button>`;

    return `
      <footer class="lg-pie">
        <p>Versión ligera, sin 3D.</p>
        ${salida}
      </footer>`;
  }

  // ---------------------------------------------------------------- conducta

  _bind() {
    for (const boton of this.root.querySelectorAll('[data-a-escena]')) {
      boton.addEventListener('click', () => cambiarModo(PLENO));
    }

    this.root.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-contact-form]');
      if (!form) return;
      e.preventDefault();
      enviarContacto(form);
    });
  }

  /**
   * Las láminas de los proyectos se dibujan al asomar, no al cargar.
   *
   * Cada cartel es un lienzo de 768×512 con varios campos de ruido encima, y
   * hay uno por proyecto. Pintarlos todos de golpe son unas décimas de bloqueo
   * en el hilo principal —justo en el equipo flojo para el que existe esta
   * versión—. Dibujando el que entra en pantalla, el coste se reparte y el que
   * nunca se mira no llega a pagarse.
   */
  _laminas() {
    const huecos = [...this.root.querySelectorAll('[data-lamina]')];

    /**
     * Se dibuja a la resolución a la que se va a ver, y ni un píxel más.
     *
     * La ficha mide unos 270 px de ancho en una ventana normal; el diseño de
     * la lámina son 768. Sin este cálculo se pintaban ocho veces los píxeles
     * que luego se enseñaban. Se multiplica por la densidad de la pantalla
     * —topada en 2, porque a partir de ahí no se distingue— y nunca se pasa de
     * 1, que es el tamaño de diseño.
     */
    const escalaPara = (hueco) => {
      const ancho = hueco.getBoundingClientRect().width;
      if (!ancho) return 0.6; // aún sin maquetar: un valor sensato
      return Math.min(1, (ancho * Math.min(window.devicePixelRatio || 1, 2)) / 768);
    };

    const pintar = (hueco) => {
      if (hueco.dataset.pintada) return;
      hueco.dataset.pintada = 'si';
      const canvas = posterCanvas({
        seed: Number(hueco.dataset.semilla),
        hue: Number(hueco.dataset.tono),
        escala: escalaPara(hueco),
      });
      // El lienzo se cuelga tal cual, sin pasar por `toDataURL`.
      //
      // Convertirlo costaba dos trabajos que no hacían falta: codificar nueve
      // WebP y quedarse en el DOM con 447 kB de texto en base64 que el
      // navegador tiene luego que descodificar otra vez a mapa de bits. El
      // lienzo YA es el mapa de bits.
      canvas.className = 'lg-ficha__canvas';
      hueco.replaceChildren(canvas);
    };

    if (!('IntersectionObserver' in window)) {
      huecos.forEach(pintar);
      return;
    }

    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          pintar(entrada.target);
          vigia.unobserve(entrada.target);
        }
      },
      { rootMargin: '400px' }
    );
    huecos.forEach((h) => vigia.observe(h));
  }

  /**
   * Lo que se dibuja al llegar, se dibuja UNA vez.
   *
   * El sendero se traza cuando su sección asoma y ahí se queda. Sin
   * `unobserve`, subir y bajar lo volvería a lanzar cada vez que cruza el
   * borde, y un adorno que se rehace cada dos por tres deja de ser un detalle
   * y pasa a ser un tic.
   */
  _revelar() {
    const piezas = [...this.root.querySelectorAll('.lg-sendero')];
    if (!piezas.length) return;

    if (!('IntersectionObserver' in window)) {
      piezas.forEach((p) => (p.dataset.visto = 'si'));
      return;
    }

    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          entrada.target.dataset.visto = 'si';
          vigia.unobserve(entrada.target);
        }
      },
      // Un poco antes de que llegue del todo: así el trazado ya está en marcha
      // cuando la sección se planta en pantalla, en vez de arrancar delante de
      // las narices del visitante.
      { rootMargin: '-8% 0px -18% 0px' }
    );
    piezas.forEach((p) => vigia.observe(p));
  }

  /** Marca en la barra superior la sección que se está leyendo. */
  _seguirSeccion() {
    const enlaces = new Map(
      [...this.root.querySelectorAll('[data-nav]')].map((a) => [a.dataset.nav, a])
    );
    const secciones = SECTIONS.map((s) => document.getElementById(`lg-${s.id}`)).filter(Boolean);
    if (!secciones.length || !('IntersectionObserver' in window)) return;

    const visibles = new Set();
    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const id = entrada.target.id.replace('lg-', '');
          if (entrada.isIntersecting) visibles.add(id);
          else visibles.delete(id);
        }
        // La primera en orden de página gana, para que al pasar entre dos no
        // parpadee la marca de un lado a otro.
        const activa = SECTIONS.map((s) => s.id).find((id) => visibles.has(id));
        for (const [id, enlace] of enlaces) {
          enlace.dataset.activo = String(id === activa);
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    secciones.forEach((s) => vigia.observe(s));
  }
}
