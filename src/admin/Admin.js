/**
 * El panel: editar el contenido del portafolio sin tocar el código.
 *
 * Se abre con `?admin` y **sólo existe en desarrollo**. La mitad de servidor
 * —la que escribe en el disco— es una ruta del plugin de Vite marcado
 * `apply: 'serve'`, así que la web publicada no la tiene y sigue siendo
 * estática y de sólo lectura. Es el mismo trato que ya tenía el editor de
 * escena, y no es casualidad: es la única forma de tener panel de
 * administración sin tener servidor que mantener ni contraseña que se filtre.
 *
 * Lo que se edita es `contenido.json`, que alimenta las DOS versiones del
 * portafolio y también la hoja de vida. Se escribe una vez y sale en tres
 * sitios.
 *
 * ── Tres decisiones que conviene no deshacer ──────────────────────────────
 *
 * 1. **Escribir no vuelve a pintar.** Los `input` van directos al estado por
 *    su ruta (`proyectos.3.title`) y no disparan un redibujado; sólo lo hacen
 *    los cambios de ESTRUCTURA —añadir, borrar, subir, bajar—. Repintando en
 *    cada tecla se pierde el foco y el cursor salta al final de la casilla a
 *    mitad de palabra, que es el defecto clásico de estos paneles.
 *
 * 2. **Los números se saneaán al entrar, no al guardar.** Un `level` vacío o
 *    con letras se convierte en `NaN`, y un `NaN` viaja hasta una anchura de
 *    CSS y a la escala de una runa sin quejarse por el camino. Se recorta a
 *    [0, 1] en el propio evento, así que en el estado nunca hay basura.
 *
 * 3. **Guardar no bloquea por avisos.** Los huecos —un proyecto sin resumen,
 *    un canal sin dirección— se enseñan arriba y se guarda igual. Es su
 *    fichero y está versionado en git; un panel que se niega a guardar a
 *    medias obliga a inventarse texto para poder cerrar el portátil.
 */

import { CONTENIDO, ESTADOS } from '../content.js';
import { imagenSegura } from '../utils/enlaces.js';
import { idEtapa, PERFIL_COMPLETO } from '../perfiles.js';
import { esc } from '../utils/html.js';
import './admin.css';

/**
 * A dónde se guarda, que no es el mismo sitio en los dos mundos.
 *
 * En local escribe el complemento de Vite directamente en el fichero. En la web
 * publicada no hay fichero que escribir —Vercel no tiene disco— así que guardar
 * es commitear al repositorio a través de una función, y esa función exige
 * sesión. Por eso también cambia el verbo: `POST` a una ruta de desarrollo,
 * `PUT` a un recurso que existe.
 */
const RUTA = import.meta.env.DEV ? '/__editor/contenido' : '/api/contenido';
const METODO = import.meta.env.DEV ? 'POST' : 'PUT';
const RUTA_RETRATO = import.meta.env.DEV ? '/__editor/retrato' : '/api/retrato';
const RUTA_CANDIDATURAS = import.meta.env.DEV ? '/__editor/candidaturas' : '/api/candidaturas';

/** Los estados de career-ops, no unos propios que se les parezcan. */
const ESTADOS_CANDIDATURA = [
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
];

const SECCIONES = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'perfiles', label: 'Hojas de vida' },
  { id: 'perfil', label: 'Perfil' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'trayectoria', label: 'Trayectoria' },
  { id: 'formacion', label: 'Formación' },
  { id: 'contacto', label: 'Contacto' },
  { id: 'candidaturas', label: 'Candidaturas' },
];

export class Admin {
  /** @param {HTMLElement} raiz */
  constructor(raiz) {
    this.raiz = raiz;
    // Copia propia: hasta que no se pulsa Guardar, el fichero del disco no se
    // entera de nada.
    this.datos = estructurar(CONTENIDO);
    this.seccion = 'identidad';
    this.sucio = false;
    this.aviso = null;
  }

  montar() {
    document.title = 'Panel · Portafolio';
    // La clase va en `html` Y en `body`: `base.css` le quita el desplazamiento
    // a los dos, y devolvérselo a uno solo deja la página sin barra y sorda a
    // la rueda. Ver la nota de `admin.css`.
    document.documentElement.classList.add('admin-activo');
    this.raiz.classList.add('admin-activo');
    this.caja = document.createElement('div');
    this.caja.className = 'ad';
    this.raiz.appendChild(this.caja);
    this._pintar();
    this._enlazar();

    // Salir con cambios sin guardar tiene que costar una confirmación: aquí lo
    // que se pierde es texto escrito a mano, no un estado recuperable.
    window.addEventListener('beforeunload', (e) => {
      if (!this.sucio) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // ------------------------------------------------------------------ pintar

  _pintar() {
    this.caja.innerHTML = `
      ${this._barra()}
      <div class="ad__cuerpo">
        <nav class="ad__lado">
          ${SECCIONES.map(
            (s) => `
            <button class="ad__pestania" type="button" data-seccion="${s.id}"
                    aria-current="${s.id === this.seccion}">
              <span>${esc(s.label)}</span>
              <span class="ad__cuenta">${this._cuenta(s.id)}</span>
            </button>`
          ).join('')}
          <div class="ad__lado-pie">
            <button class="ad__enlace" type="button" data-ver="ligero">Ver la versión ligera ↗</button>
            <button class="ad__enlace" type="button" data-ver="hoja">Ver la hoja de vida ↗</button>
            <button class="ad__enlace" type="button" data-ver="3d">Ver la isla ↗</button>
            <button class="ad__enlace ad__enlace--editor" type="button" data-ver="editor">
              Editar la escena ↗
            </button>
          </div>
        </nav>
        <main class="ad__hoja" data-hoja>${this._seccion()}</main>
      </div>`;
    this._pintarEstado();
  }

  /** Sólo el panel de la derecha: lo que cambia al añadir o quitar cosas. */
  _repintarHoja() {
    this.caja.querySelector('[data-hoja]').innerHTML = this._seccion();
    for (const b of this.caja.querySelectorAll('[data-seccion]')) {
      b.querySelector('.ad__cuenta').textContent = this._cuenta(b.dataset.seccion);
    }
  }

  _cuenta(id) {
    const v = this.datos[id];
    if (Array.isArray(v)) return String(v.length);
    if (id === 'perfil') return String(v.body?.length ?? 0);
    // Los canales que HAY, no los que tienen dirección: con los cuatro de
    // ejemplo en null, el contador decía «0» y se leía como que no había nada.
    if (id === 'contacto') return String((v.links ?? []).length);
    if (id === 'perfiles') return String((this.datos.perfiles ?? []).length + 1);
    return '';
  }

  _barra() {
    return `
      <header class="ad__barra">
        <div>
          <p class="ad__kicker">Panel de contenido · sólo en desarrollo</p>
          <h1 class="ad__titulo">${esc(this.datos.identidad.name || 'Sin nombre')}</h1>
        </div>
        <p class="ad__estado" data-estado></p>
        <div class="ad__acciones">
          <button class="ad__boton ad__boton--linea" type="button" data-exportar>Exportar</button>
          <button class="ad__boton ad__boton--linea" type="button" data-importar>Importar</button>
          <button class="ad__boton" type="button" data-guardar>Guardar</button>
        </div>
      </header>`;
  }

  _pintarEstado() {
    const estado = this.caja.querySelector('[data-estado]');
    const guardar = this.caja.querySelector('[data-guardar]');
    if (!estado) return;
    const huecos = this._huecos();
    estado.className = `ad__estado${this.aviso?.mal ? ' ad__estado--mal' : ''}`;
    estado.textContent =
      this.aviso?.texto ??
      (this.sucio
        ? 'Sin guardar · Ctrl+S'
        : huecos.length
          ? `Guardado. Quedan huecos: ${huecos.join(', ')}`
          : 'Guardado');
    guardar.disabled = !this.sucio;
  }

  /** Lo que está vacío y se va a notar. Avisa; no impide guardar. */
  _huecos() {
    const h = [];
    if (!this.datos.identidad.name?.trim()) h.push('el nombre');
    if (!this.datos.perfil.body?.some((p) => p.trim())) h.push('la presentación');
    const sinTitulo = this.datos.proyectos.filter((p) => !p.title?.trim()).length;
    if (sinTitulo) h.push(`${sinTitulo} proyecto(s) sin título`);
    const sinPuesto = this.datos.trayectoria.filter((e) => !e.role?.trim()).length;
    if (sinPuesto) h.push(`${sinPuesto} etapa(s) sin puesto`);
    return h;
  }

  // --------------------------------------------------------------- secciones

  _seccion() {
    switch (this.seccion) {
      case 'identidad':
        return this._identidad();
      case 'perfiles':
        return this._perfiles();
      case 'perfil':
        return this._perfil();
      case 'proyectos':
        return this._proyectos();
      case 'habilidades':
        return this._habilidades();
      case 'trayectoria':
        return this._trayectoria();
      case 'formacion':
        return this._formacion();
      case 'candidaturas':
        return this._candidaturas();
      default:
        return this._contacto();
    }
  }

  _identidad() {
    const d = this.datos.identidad;
    return grupo(
      'Identidad',
      'Lo que se ve en la cabecera, en la pantalla de carga y grabado en la estela.',
      [
        campo({ ruta: 'identidad.name', etiqueta: 'Nombre', valor: d.name }),
        campo({ ruta: 'identidad.role', etiqueta: 'Oficio', valor: d.role, ayuda: 'Una línea, bajo el nombre.' }),
        campo({
          ruta: 'identidad.oghamMotto',
          etiqueta: 'Lema en ogham',
          valor: d.oghamMotto,
          ayuda: 'Se talla en la estela. Sólo letras latinas: el ogham no tiene cifras y lo que no sabe transcribir lo deja en blanco.',
        }),
        this._campoFoto(d.foto),
      ]
    );
  }

  /**
   * Las hojas de vida a medida.
   *
   * Un perfil SELECCIONA sobre el contenido, no lo copia; el porqué está en
   * `perfiles.js`. Aquí eso se traduce en una regla de interfaz: las casillas
   * empiezan TODAS marcadas y se trabaja quitando. Adaptar un currículo a una
   * vacante es podar lo que no viene al caso, no volver a montarlo.
   */
  /**
   * El retrato de la hoja de vida.
   *
   * Sólo lo usa el currículo: ni la isla ni la versión ligera enseñan una foto,
   * y no por olvido — el portafolio es la obra, y la cara sobra ahí. En un
   * currículo, en cambio, es lo primero que se mira en media Europa y en
   * Latinoamérica.
   *
   * Se guarda con nombre fijo en `public/`. Un retrato se sustituye, no se
   * colecciona: con nombres distintos quedaría en la carpeta un rastro de fotos
   * viejas que se publican con el sitio sin que nadie se acuerde de ellas.
   */
  _campoFoto(actual) {
    // La marca de tiempo rompe la caché del navegador. Con el nombre fijo, sin
    // ella, sustituir la foto no cambiaba nada en pantalla y parecía que la
    // subida había fallado.
    const src = actual ? `${actual}?v=${this._fotoVersion ?? 0}` : '';
    return `
      <label class="ad__campo ad__campo--ancho">
        <span class="ad__etiqueta">Foto para la hoja de vida</span>
        <div class="ad__foto" data-foto>
          ${
            actual
              ? `<img src="${esc(imagenSegura(src) ?? '')}" alt="Retrato" />`
              : '<span class="ad__foto-vacia">Arrastra un JPG aquí o pulsa para elegirlo</span>'
          }
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-foto-fichero />
        </div>
        <span class="ad__pista">
          Va sólo en el currículo, nunca en la isla ni en la versión ligera.
          Cada hoja de vida puede llevarla o no.
          ${actual ? '<button type="button" class="ad__quitar-foto" data-quitar-foto>Quitar la foto</button>' : ''}
        </span>
      </label>`;
  }

  _perfiles() {
    const perfiles = this.datos.perfiles ?? [];
    const bloques = perfiles
      .map((p, i) => {
        const marcas = (titulo, ruta, items, clave, etiqueta) => {
          const elegidos = p[ruta];
          const todos = !Array.isArray(elegidos);
          const filas = items
            .map((x, j) => {
              const id = clave(x, j);
              const marcado = todos || elegidos.includes(id);
              return `
                <label class="ad__marca">
                  <input type="checkbox" data-perfil="${i}" data-lista="${ruta}" value="${esc(id)}"
                         ${marcado ? 'checked' : ''} />
                  <span>${esc(etiqueta(x))}</span>
                </label>`;
            })
            .join('');
          const cuantos = todos ? items.length : elegidos.filter((id) => items.some((x, j) => clave(x, j) === id)).length;
          return `
            <div class="ad__campo ad__campo--ancho">
              <span class="ad__etiqueta">${esc(titulo)}
                <span class="ad__cuenta">${cuantos}/${items.length}</span></span>
              <div class="ad__marcas">${filas}</div>
            </div>`;
        };

        return `
          <li class="ad__item" data-lista="perfiles" data-indice="${i}">
            <div class="ad__item-cab">
              <span class="ad__indice">${String(i + 1).padStart(2, '0')}</span>
              <span class="ad__resumen" data-resumen>${esc(p.nombre || 'Sin nombre')}</span>
              <span class="ad__mandos">
                <button type="button" data-descargar="${i}" title="Descargar su PDF">⤓</button>
                <button type="button" data-accion="subir" data-lista="perfiles" data-indice="${i}"
                        title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-accion="bajar" data-lista="perfiles" data-indice="${i}"
                        title="Bajar" ${i === perfiles.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" data-accion="borrar" data-lista="perfiles" data-indice="${i}"
                        title="Borrar" class="ad__borrar">✕</button>
              </span>
            </div>
            <div class="ad__campos">
              ${campo({ ruta: `perfiles.${i}.nombre`, etiqueta: 'Nombre', valor: p.nombre, ancho: 'corto' })}
              ${campo({
                ruta: `perfiles.${i}.role`,
                tipo: 'nulo',
                etiqueta: 'Oficio para esta hoja',
                valor: p.role ?? '',
                ayuda: 'Vacío = el de Identidad.',
              })}
              ${campo({
                ruta: `perfiles.${i}.enfoque`,
                tipo: 'nulo',
                etiqueta: 'Enfoque',
                valor: p.enfoque ?? '',
                ancho: 'corto',
              })}
              <label class="ad__campo ad__campo--corto">
                <span class="ad__etiqueta">Foto</span>
                <label class="ad__marca">
                  <input type="checkbox" data-perfil-foto="${i}" ${p.foto === false ? '' : 'checked'} />
                  <span>Incluir el retrato</span>
                </label>
                <span class="ad__pista">Quítala para el mundo anglosajón: allí una foto en el currículo se desaconseja.</span>
              </label>
              ${area({
                ruta: `perfiles.${i}.resumen`,
                tipo: 'parrafos',
                etiqueta: 'Resumen para esta hoja',
                valor: (p.resumen ?? []).join('\n\n'),
                filas: 5,
                ayuda: 'Vacío = el de Perfil. Una línea en blanco separa párrafos.',
              })}
              ${marcas('Proyectos', 'proyectos', this.datos.proyectos, (x) => x.id, (x) => x.title || x.id)}
              ${marcas('Trayectoria', 'trayectoria', this.datos.trayectoria, idEtapa, (x) => `${x.period} · ${x.role}`)}
              ${marcas('Habilidades', 'habilidades', this.datos.habilidades, (x) => x.name, (x) => x.name)}
            </div>
          </li>`;
      })
      .join('');

    return (
      grupo(
        'Hojas de vida a medida',
        'Cada perfil es una SELECCIÓN sobre el mismo contenido, no una copia: los hechos se escriben una vez y aquí sólo se elige cuáles entran, en qué orden y con qué encabezado. Así, cambiar tu correo lo cambia en todas.',
        [
          `<p class="ad__pista ad__campo--ancho">La hoja «${esc(PERFIL_COMPLETO.nombre)}» existe siempre y lo enseña todo; no se puede borrar. Los perfiles sólo afectan al currículo — la isla y la versión ligera siguen enseñando el portafolio entero.</p>`,
        ]
      ) +
      `<section class="ad__grupo">
        <ol class="ad__lista">${bloques}</ol>
        <button class="ad__boton ad__boton--linea" type="button"
                data-accion="anadir" data-lista="perfiles" data-indice="-1">Añadir una hoja</button>
      </section>`
    );
  }

  _perfil() {
    const d = this.datos.perfil;
    return (
      grupo('Presentación', 'Sale en «Sobre mí» y encabeza la hoja de vida.', [
        campo({ ruta: 'perfil.title', etiqueta: 'Título del panel', valor: d.title, ancho: 'corto' }),
        campo({
          ruta: 'perfil.subtitle',
          etiqueta: 'Subtítulo',
          valor: d.subtitle,
          ayuda: 'El nombre del monumento en la escena.',
        }),
        area({
          ruta: 'perfil.body',
          tipo: 'parrafos',
          etiqueta: 'Texto (isla y web)',
          valor: (d.body ?? []).join('\n\n'),
          filas: 10,
          ayuda: 'Una línea en blanco separa un párrafo del siguiente.',
        }),
        area({
          ruta: 'perfil.resumenHoja',
          tipo: 'parrafos',
          etiqueta: 'Texto para la hoja de vida',
          valor: (d.resumenHoja ?? []).join('\n\n'),
          filas: 5,
          ayuda:
            'La versión corta, sólo para el PDF. En la isla quien lee ya se ha parado; en un currículo se barre, y cada párrafo de más empuja la experiencia a la página siguiente. Vacío = se usa el de arriba.',
        }),
      ]) +
      lista({
        titulo: 'Fichas',
        ayuda: 'Datos sueltos. Los que se queden en «—» no se imprimen en la hoja de vida.',
        ruta: 'perfil.facts',
        items: d.facts ?? [],
        fila: (f, i) => [
          campo({ ruta: `perfil.facts.${i}.label`, etiqueta: 'Etiqueta', valor: f.label, ancho: 'corto' }),
          campo({ ruta: `perfil.facts.${i}.value`, etiqueta: 'Valor', valor: f.value }),
        ],
      })
    );
  }

  _proyectos() {
    return lista({
      titulo: 'Proyectos',
      ayuda:
        'La escena coloca un monolito por proyecto: entre 6 y 12 se ve bien, con más el círculo se aprieta. El orden es el del círculo y el de la hoja de vida.',
      ruta: 'proyectos',
      items: this.datos.proyectos,
      resumen: (p) => p.title || 'Sin título',
      fila: (p, i) => [
        campo({ ruta: `proyectos.${i}.title`, etiqueta: 'Título', valor: p.title }),
        campo({ ruta: `proyectos.${i}.tag`, etiqueta: 'Categoría', valor: p.tag, ancho: 'corto' }),
        campo({ ruta: `proyectos.${i}.year`, etiqueta: 'Año', valor: p.year, ancho: 'corto' }),
        seleccion({
          ruta: `proyectos.${i}.estado`,
          etiqueta: 'Estado',
          valor: p.estado,
          opciones: ESTADOS,
          ancho: 'corto',
        }),
        area({ ruta: `proyectos.${i}.summary`, etiqueta: 'Resumen', valor: p.summary, filas: 3 }),
        campo({
          ruta: `proyectos.${i}.cv`,
          etiqueta: 'Una línea para la hoja de vida',
          valor: p.cv,
          ayuda: 'Vacío = se usa la primera frase del resumen.',
        }),
        campo({
          ruta: `proyectos.${i}.stack`,
          tipo: 'lista',
          etiqueta: 'Herramientas',
          valor: (p.stack ?? []).join(', '),
          ayuda: 'Separadas por comas.',
        }),
        campo({
          ruta: `proyectos.${i}.url`,
          tipo: 'nulo',
          etiqueta: 'Enlace',
          valor: p.url ?? '',
          ayuda: 'Vacío = sin enlace.',
        }),
        campo({
          ruta: `proyectos.${i}.poster.seed`,
          tipo: 'entero',
          etiqueta: 'Semilla del cartel',
          valor: p.poster?.seed ?? 0,
          ancho: 'corto',
          ayuda: 'Dos proyectos con la misma semilla llevan el mismo cartel.',
        }),
        campo({
          ruta: `proyectos.${i}.poster.hue`,
          tipo: 'entero',
          etiqueta: 'Tono',
          valor: p.poster?.hue ?? 0,
          ancho: 'corto',
          ayuda: '0 a 360.',
        }),
      ],
    });
  }

  _habilidades() {
    return lista({
      titulo: 'Habilidades',
      ayuda:
        'Una runa por habilidad, agrupadas por familia en anillos concéntricos. El nivel manda el tamaño y el brillo de la runa; en la hoja de vida no se dibuja, pero ordena cada familia.',
      ruta: 'habilidades',
      items: this.datos.habilidades,
      compacta: true,
      resumen: (s) => s.name || 'Sin nombre',
      fila: (s, i) => [
        campo({ ruta: `habilidades.${i}.name`, etiqueta: 'Nombre', valor: s.name }),
        campo({ ruta: `habilidades.${i}.family`, etiqueta: 'Familia', valor: s.family, ancho: 'corto' }),
        campo({
          ruta: `habilidades.${i}.level`,
          tipo: 'nivel',
          etiqueta: 'Nivel',
          valor: s.level,
          ancho: 'corto',
          ayuda: '0 a 1.',
        }),
      ],
    });
  }

  _trayectoria() {
    return lista({
      titulo: 'Trayectoria',
      ayuda:
        'De la más ANTIGUA a la más reciente: el sendero de la escena asciende hacia el presente. La hoja de vida le da la vuelta ella sola, que en papel se lee al revés.',
      ruta: 'trayectoria',
      items: this.datos.trayectoria,
      resumen: (e) => `${e.period || '—'} · ${e.role || 'Sin puesto'}`,
      fila: (e, i) => [
        campo({ ruta: `trayectoria.${i}.period`, etiqueta: 'Periodo', valor: e.period, ancho: 'corto' }),
        campo({ ruta: `trayectoria.${i}.role`, etiqueta: 'Puesto', valor: e.role }),
        campo({ ruta: `trayectoria.${i}.org`, etiqueta: 'Organización', valor: e.org }),
        area({ ruta: `trayectoria.${i}.detail`, etiqueta: 'Detalle', valor: e.detail, filas: 3 }),
      ],
    });
  }

  _formacion() {
    return lista({
      titulo: 'Formación',
      ayuda:
        'De la más ANTIGUA a la más reciente, igual que la trayectoria. En «Puesto» va el título obtenido y en «Organización» el centro.',
      ruta: 'formacion',
      items: this.datos.formacion,
      resumen: (e) => `${e.period || '—'} · ${e.role || 'Sin título'}`,
      fila: (e, i) => [
        campo({ ruta: `formacion.${i}.period`, etiqueta: 'Periodo', valor: e.period, ancho: 'corto' }),
        campo({ ruta: `formacion.${i}.role`, etiqueta: 'Título', valor: e.role }),
        campo({ ruta: `formacion.${i}.org`, etiqueta: 'Centro', valor: e.org }),
        area({ ruta: `formacion.${i}.detail`, etiqueta: 'Detalle', valor: e.detail, filas: 2 }),
      ],
    });
  }

  /**
   * Dónde has echado el currículo.
   *
   * Estos datos NO viven en `contenido.json`: viven en la tabla de career-ops,
   * y se escriben en su formato a propósito. Es lo que permite que las dos
   * herramientas compartan un solo registro en vez de llevar cada una el suyo
   * — y dos registros es la peor opción posible, porque el día que apuntes una
   * entrevista en uno y no en el otro, el que consultes te dará una respuesta y
   * no sabrás cuál.
   *
   * Por eso también tienen su propio botón de guardar: son otro fichero, y un
   * guardado que mezclara las dos cosas commitearía contenido del portafolio
   * cada vez que cambias el estado de una candidatura.
   */
  _candidaturas() {
    if (!this.candidaturas) {
      this._cargarCandidaturas();
      return grupo('Candidaturas', 'Leyendo el registro…', []);
    }
    const filas = this.candidaturas;
    const opciones = (actual) =>
      ESTADOS_CANDIDATURA.map(
        (e) => `<option value="${e}"${e === actual ? ' selected' : ''}>${e}</option>`
      ).join('');

    const cuerpo = filas.length
      ? filas
          .map(
            (f, i) => `
        <tr>
          <td class="ad__cnum">${esc(f['#'])}</td>
          <td><input type="date" data-cand="${i}" data-col="Date" value="${esc(f.Date)}" /></td>
          <td><input data-cand="${i}" data-col="Company" value="${esc(f.Company)}" placeholder="Empresa" /></td>
          <td><input data-cand="${i}" data-col="Role" value="${esc(f.Role)}" placeholder="Puesto" /></td>
          <td><select data-cand="${i}" data-col="Status">${opciones(f.Status)}</select></td>
          <td><input data-cand="${i}" data-col="Notes" value="${esc(f.Notes)}" placeholder="Notas" /></td>
          <td><button type="button" class="ad__quitar" data-cand-borrar="${i}" title="Quitar">✕</button></td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="7" class="ad__vacio">Todavía no has apuntado ninguna.</td></tr>`;

    return `
      <section class="ad__grupo">
        <h2 class="ad__titulo">Candidaturas</h2>
        <p class="ad__ayuda">
          El mismo registro que lee career-ops. Se guarda aparte del contenido del
          portafolio, y cada vez que guardas se regenera también
          <code>carrera/candidaturas.csv</code>, que Excel abre con doble clic.
        </p>
        <div class="ad__tablaenv">
          <table class="ad__tabla">
            <thead>
              <tr><th>#</th><th>Fecha</th><th>Empresa</th><th>Puesto</th><th>Estado</th><th>Notas</th><th></th></tr>
            </thead>
            <tbody>${cuerpo}</tbody>
          </table>
        </div>
        <div class="ad__acciones">
          <button type="button" class="ad__boton" data-cand-anadir>Apuntar una candidatura</button>
          <button type="button" class="ad__boton ad__boton--fuerte" data-cand-guardar>Guardar el registro</button>
          <span class="ad__nota" data-cand-nota></span>
        </div>
      </section>`;
  }

  async _cargarCandidaturas() {
    try {
      const res = await fetch(RUTA_CANDIDATURAS);
      const cuerpo = await res.json();
      this.candidaturas = Array.isArray(cuerpo.filas) ? cuerpo.filas : [];
    } catch {
      this.candidaturas = [];
    }
    if (this.seccion === 'candidaturas') this._repintarHoja();
  }

  _contacto() {
    const d = this.datos.contacto;
    return (
      grupo('Contacto', 'El altar de mensajes, y el encabezado de la hoja de vida.', [
        campo({ ruta: 'contacto.title', etiqueta: 'Título del panel', valor: d.title, ancho: 'corto' }),
        campo({ ruta: 'contacto.subtitle', etiqueta: 'Subtítulo', valor: d.subtitle }),
        area({ ruta: 'contacto.intro', etiqueta: 'Invitación', valor: d.intro, filas: 3 }),
        campo({
          ruta: 'contacto.endpoint',
          tipo: 'nulo',
          etiqueta: 'Dirección del formulario',
          valor: d.endpoint ?? '',
          ayuda: 'Formspree, Basin, tu propio servidor… Vacío = el altar sólo simula el envío.',
        }),
      ]) +
      lista({
        titulo: 'Canales',
        ayuda: 'Sin dirección, el canal se pinta apagado y no se puede pulsar.',
        ruta: 'contacto.links',
        items: d.links ?? [],
        compacta: true,
        resumen: (l) => `${l.label}: ${l.value || '—'}`,
        fila: (l, i) => [
          campo({ ruta: `contacto.links.${i}.label`, etiqueta: 'Canal', valor: l.label, ancho: 'corto' }),
          campo({ ruta: `contacto.links.${i}.value`, etiqueta: 'Texto visible', valor: l.value }),
          campo({
            ruta: `contacto.links.${i}.href`,
            tipo: 'nulo',
            etiqueta: 'Dirección',
            valor: l.href ?? '',
            ayuda: 'Con `mailto:` para el correo.',
          }),
        ],
      })
    );
  }

  // --------------------------------------------------------------- conducta

  _enlazar() {
    // Escribir: al estado y punto. Ver la nota 1 del cabecero.
    // Las celdas del registro escriben directamente en su lista, sin repintar:
    // repintar mientras escribes te quita el foco del campo a cada letra.
    const celda = (e) => {
      const el = e.target.closest('[data-cand]');
      if (!el || !this.candidaturas) return false;
      const fila = this.candidaturas[Number(el.dataset.cand)];
      if (fila) fila[el.dataset.col] = el.value;
      return true;
    };
    this.caja.addEventListener('input', (e) => celda(e));
    this.caja.addEventListener('change', (e) => celda(e));

    this.caja.addEventListener('input', (e) => {
      const el = e.target.closest('[data-ruta]');
      if (!el) return;
      poner(this.datos, el.dataset.ruta, leerCampo(el));
      this._marcarSucio();
      if (el.dataset.ruta === 'identidad.name') {
        this.caja.querySelector('.ad__titulo').textContent = el.value || 'Sin nombre';
      }
      const res = el.closest('.ad__item')?.querySelector('[data-resumen]');
      if (res) res.textContent = this._resumenDe(el.closest('.ad__item'));
    });

    // Las marcas de un perfil. Van por `change` y no por `input` porque una
    // casilla se marca de golpe: no hay estado intermedio que preservar, y sí
    // hay que repintar para que el contador «3/7» diga la verdad.
    // ── El retrato ────────────────────────────────────────────────────────
    this.caja.addEventListener('click', (e) => {
      if (e.target.closest('[data-quitar-foto]')) {
        e.preventDefault();
        this._quitarFoto();
        return;
      }
      const zona = e.target.closest('[data-foto]');
      if (zona) zona.querySelector('[data-foto-fichero]').click();
    });
    this.caja.addEventListener('change', (e) => {
      const f = e.target.closest('[data-foto-fichero]');
      if (f) this._subirFoto(f.files?.[0]);
    });
    for (const evento of ['dragenter', 'dragover']) {
      this.caja.addEventListener(evento, (e) => {
        if (!e.target.closest('[data-foto]')) return;
        e.preventDefault();
        e.target.closest('[data-foto]').dataset.encima = 'true';
      });
    }
    for (const evento of ['dragleave', 'drop']) {
      this.caja.addEventListener(evento, (e) => {
        const zona = e.target.closest('[data-foto]');
        if (!zona) return;
        e.preventDefault();
        zona.dataset.encima = 'false';
        if (evento === 'drop') this._subirFoto(e.dataTransfer?.files?.[0]);
      });
    }

    this.caja.addEventListener('change', (e) => {
      const marca = e.target.closest('[data-perfil-foto]');
      if (!marca) return;
      const p = this.datos.perfiles[Number(marca.dataset.perfilFoto)];
      // `null` = heredar la foto que haya; `false` = esta hoja va sin ella.
      // Nunca `true`: un perfil no puede PONER una foto que no existe.
      p.foto = marca.checked ? null : false;
      this._marcarSucio();
    });

    this.caja.addEventListener('change', (e) => {
      const marca = e.target.closest('[data-perfil][data-lista]');
      if (!marca) return;
      const p = this.datos.perfiles[Number(marca.dataset.perfil)];
      const ruta = marca.dataset.lista;
      const todos = this._todosDe(ruta);
      // `null` significa «todos», así que en cuanto se desmarca uno hay que
      // materializar la lista completa y quitar de ahí. Sin esto, el primer
      // clic no haría nada visible: seguiría siendo «todos».
      const actual = Array.isArray(p[ruta]) ? [...p[ruta]] : [...todos];
      const i = actual.indexOf(marca.value);
      if (marca.checked && i < 0) {
        // Se reinserta en el ORDEN del contenido, no al final: al volver a
        // marcar algo, lo natural es que recupere su sitio.
        const orden = todos.indexOf(marca.value);
        const antes = actual.filter((id) => todos.indexOf(id) < orden);
        actual.splice(antes.length, 0, marca.value);
      } else if (!marca.checked && i >= 0) {
        actual.splice(i, 1);
      }
      // Si quedan todos y en su orden, se vuelve a `null`: un perfil que no
      // filtra nada no debe guardar una lista de siete elementos.
      p[ruta] = actual.length === todos.length && actual.every((id, k) => id === todos[k]) ? null : actual;
      this._marcarSucio();
      this._repintarHoja();
    });

    this.caja.addEventListener('click', (e) => {
      const boton = e.target.closest('button');
      if (!boton) return;

      if (boton.dataset.descargar !== undefined) {
        const p = this.datos.perfiles[Number(boton.dataset.descargar)];
        if (!p?.id) return;
        // Se abre la ligera con ese perfil y `?imprimir`, que ya suelta el
        // diálogo en cuanto cargan las tipografías. Sin guardar antes no
        // serviría de nada: el PDF sale del fichero, no de este formulario.
        if (this.sucio) {
          this.aviso = { mal: true, texto: 'Guarda primero: el PDF sale del fichero, no de la pantalla.' };
          this._pintarEstado();
          return;
        }
        window.open(`?modo=ligero&imprimir&perfil=${encodeURIComponent(p.id)}`, `hoja-${p.id}`)?.focus();
        return;
      }

      if (boton.dataset.seccion) {
        this.seccion = boton.dataset.seccion;
        // Sólo la hoja de la derecha. Rehaciendo el panel entero se reemplazan
        // también las pestañas —incluida la que se acaba de pulsar—, y quien
        // guarde una referencia a ese botón se queda con un nodo huérfano que
        // ya no está en el documento.
        for (const p of this.caja.querySelectorAll('[data-seccion]')) {
          p.setAttribute('aria-current', String(p.dataset.seccion === this.seccion));
        }
        this._repintarHoja();
        // Y arriba del todo. Ahora que la página se desplaza, cambiar de
        // sección estando abajo dejaba al que edita en mitad de la sección
        // nueva, sin haber visto ni su título ni la nota que la explica.
        window.scrollTo({ top: 0 });
        return;
      }
      if (boton.dataset.ver) return this._ver(boton.dataset.ver);
      // ── Candidaturas: otro fichero, otro botón de guardar ──────────────
      if (boton.hasAttribute('data-cand-anadir')) {
        const nums = (this.candidaturas ?? []).map((f) => Number(f['#'])).filter(Number.isFinite);
        this.candidaturas.push({
          '#': String((nums.length ? Math.max(...nums) : 0) + 1),
          Date: new Date().toISOString().slice(0, 10),
          Company: '',
          Role: '',
          Score: '—',
          Status: 'Applied',
          PDF: '—',
          Report: '—',
          Notes: '',
        });
        return this._repintarHoja();
      }
      if (boton.hasAttribute('data-cand-borrar')) {
        this.candidaturas.splice(Number(boton.dataset.candBorrar), 1);
        return this._repintarHoja();
      }
      if (boton.hasAttribute('data-cand-guardar')) return this._guardarCandidaturas();

      if (boton.hasAttribute('data-guardar')) return this._guardar();
      if (boton.hasAttribute('data-exportar')) return this._exportar();
      if (boton.hasAttribute('data-importar')) return this._importar();

      const accion = boton.dataset.accion;
      if (!accion) return;
      const { lista: ruta, indice } = boton.dataset;
      const arr = sacar(this.datos, ruta);
      const i = Number(indice);

      if (accion === 'anadir') arr.push(nuevoDe(ruta, arr));
      else if (accion === 'borrar') arr.splice(i, 1);
      else if (accion === 'subir' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
      else if (accion === 'bajar' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
      else return;

      this._marcarSucio();
      this._repintarHoja();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._guardar();
      }
    });
  }

  /** Los identificadores de una lista del contenido, en su orden. */
  _todosDe(ruta) {
    if (ruta === 'proyectos') return this.datos.proyectos.map((x) => x.id);
    if (ruta === 'habilidades') return this.datos.habilidades.map((x) => x.name);
    if (ruta === 'trayectoria') return this.datos.trayectoria.map(idEtapa);
    return [];
  }

  _resumenDe(item) {
    const ruta = item.dataset.lista;
    const i = Number(item.dataset.indice);
    const dato = sacar(this.datos, ruta)[i];
    if (ruta === 'proyectos') return dato.title || 'Sin título';
    if (ruta === 'habilidades') return dato.name || 'Sin nombre';
    if (ruta === 'trayectoria') return `${dato.period || '—'} · ${dato.role || 'Sin puesto'}`;
    if (ruta === 'formacion') return `${dato.period || '—'} · ${dato.role || 'Sin título'}`;
    if (ruta === 'contacto.links') return `${dato.label}: ${dato.value || '—'}`;
    if (ruta === 'perfiles') return dato.nombre || 'Sin nombre';
    return '';
  }

  async _guardarCandidaturas() {
    const nota = this.caja.querySelector('[data-cand-nota]');
    if (nota) nota.textContent = 'Guardando…';
    try {
      const res = await fetch(RUTA_CANDIDATURAS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: this.candidaturas }),
      });
      const cuerpo = await res.json();
      if (!res.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? `HTTP ${res.status}`);
      if (nota) nota.textContent = `Guardado · ${cuerpo.filas} candidatura(s) · CSV al día`;
    } catch (e) {
      if (nota) nota.textContent = `No se ha podido guardar: ${e.message}`;
    }
  }

  _marcarSucio() {
    this.sucio = true;
    this.aviso = null;
    this._pintarEstado();
  }

  async _guardar() {
    if (!this.sucio) return;
    this.aviso = { texto: 'Guardando…' };
    this._pintarEstado();
    try {
      const res = await fetch(RUTA, {
        method: METODO,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.datos),
      });
      const cuerpo = await res.json();
      if (res.status === 401) {
        // La sesión caduca a las ocho horas, y lo hace mientras editas. Decirlo
        // como «HTTP 401» deja al que edita creyendo que perdió el trabajo:
        // sigue en pantalla y sin guardar, que es lo que hay que contarle.
        throw new Error('la sesión ha caducado; vuelve a entrar y guarda otra vez');
      }
      if (!res.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? `HTTP ${res.status}`);
      this.sucio = false;
      this.aviso = cuerpo.aviso ? { texto: cuerpo.aviso } : null;
    } catch (e) {
      // Sin ruta de guardado no hay panel: pasa si se abre la build en vez del
      // servidor de desarrollo. Se dice, y se ofrece la salida que sí queda.
      this.aviso = {
        mal: true,
        texto: `No se ha podido guardar (${e.message}). Con «Exportar» te llevas el JSON.`,
      };
    }
    this._pintarEstado();
  }

  /**
   * Abre la previsualización SIEMPRE EN LA MISMA pestaña, por su nombre. Al
   * segundo guardado no se acumulan diez pestañas del portafolio: la que ya
   * estaba se recarga y enseña lo recién escrito.
   */
  _ver(cual) {
    // `?imprimir` abre la versión ligera y suelta el diálogo de impresión en
    // cuanto están las tipografías. Vale también como enlace público: es una
    // dirección que lleva directo al PDF de la hoja de vida.
    const rutas = {
      '3d': '?modo=3d',
      hoja: '?modo=ligero&imprimir',
      // El editor de escena. Es el hermano de este panel —los dos escriben en
      // el proyecto a través del mismo plugin de Vite, los dos sólo existen en
      // desarrollo— y hasta ahora había que saberse la dirección de memoria.
      // Aquí se editan los textos; ahí, dónde está cada piedra.
      editor: '?modo=3d&editor',
    };
    // El editor en su propia ventana y no en la de previsualización: mover
    // piedras es una sesión larga, y perderla porque se pulsó «Ver la isla»
    // encima sería el peor momento posible para reutilizar una pestaña.
    const ventana = window.open(
      rutas[cual] ?? '?modo=ligero',
      cual === 'editor' ? 'portafolio-editor' : 'portafolio-previsualizacion'
    );
    ventana?.focus();
  }

  async _subirFoto(fichero) {
    if (!fichero) return;
    if (!/^image\/(jpeg|png|webp)$/.test(fichero.type)) {
      this.aviso = { mal: true, texto: `«${fichero.type || 'eso'}» no es una imagen que sirva. JPG, PNG o WebP.` };
      this._pintarEstado();
      return;
    }
    // Cuatro megas. Una foto de currículo son doscientos kilos; de aquí para
    // arriba es una foto sin recortar que va a viajar entera en cada carga del
    // sitio y a engordar el PDF sin que se note en la calidad impresa.
    if (fichero.size > 4 * 1024 * 1024) {
      this.aviso = {
        mal: true,
        texto: `Pesa ${(fichero.size / 1024 / 1024).toFixed(1)} MB. Recórtala: una foto de carné basta con 300 kB.`,
      };
      this._pintarEstado();
      return;
    }
    try {
      const datos = await new Promise((cumplir, fallar) => {
        const lector = new FileReader();
        lector.onload = () => cumplir(lector.result);
        lector.onerror = () => fallar(new Error('no se ha podido leer el fichero'));
        lector.readAsDataURL(fichero);
      });
      const res = await fetch(RUTA_RETRATO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datos }),
      });
      const cuerpo = await res.json();
      if (!res.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? `HTTP ${res.status}`);
      this.datos.identidad.foto = cuerpo.ruta;
      this._fotoVersion = Date.now();
      this._marcarSucio();
      this._repintarHoja();
      this.aviso = { texto: 'Foto puesta. Guarda para que entre en la hoja de vida.' };
      this._pintarEstado();
    } catch (e) {
      this.aviso = { mal: true, texto: `No se ha podido subir: ${e.message}` };
      this._pintarEstado();
    }
  }

  async _quitarFoto() {
    try {
      await fetch(RUTA_RETRATO, { method: 'DELETE' });
    } catch {
      /* si el servidor no responde, al menos se quita de los datos */
    }
    this.datos.identidad.foto = null;
    this._fotoVersion = Date.now();
    this._marcarSucio();
    this._repintarHoja();
  }

  _exportar() {
    const blob = new Blob([`${JSON.stringify(this.datos, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'contenido.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _importar() {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'application/json,.json';
    entrada.addEventListener('change', async () => {
      const fichero = entrada.files?.[0];
      if (!fichero) return;
      try {
        const datos = JSON.parse(await fichero.text());
        if (!datos?.identidad || !Array.isArray(datos?.proyectos)) {
          throw new Error('no parece un contenido de portafolio');
        }
        this.datos = estructurar(datos);
        this._marcarSucio();
        this._pintar();
      } catch (e) {
        this.aviso = { mal: true, texto: `No se ha podido importar: ${e.message}` };
        this._pintarEstado();
      }
    });
    entrada.click();
  }
}

// ─────────────────────────────────────────────────────────────── utilidades

/**
 * Copia profunda con los huecos rellenos.
 *
 * Lo segundo importa tanto como lo primero: un `contenido.json` escrito a mano
 * puede traer un proyecto sin `poster` o una ficha sin `value`, y el panel
 * escribiría en `undefined.seed` al primer tecleo. Aquí se le da forma una vez
 * y el resto del fichero puede dar por hecho que los campos existen.
 */
function estructurar(origen) {
  const d = structuredClone(origen);
  d.identidad = { name: '', role: '', oghamMotto: '', foto: null, ...d.identidad };
  d.perfil = { title: '', subtitle: '', body: [], resumenHoja: [], facts: [], ...d.perfil };
  d.contacto = { title: '', subtitle: '', intro: '', links: [], endpoint: null, ...d.contacto };
  d.proyectos = (d.proyectos ?? []).map((p, i) => ({
    id: p.id ?? `p${i + 1}`,
    title: '',
    tag: '',
    year: '',
    summary: '',
    stack: [],
    url: null,
    estado: 'progreso',
    ...p,
    poster: { seed: 100 + i * 11, hue: (i * 47) % 360, ...p.poster },
  }));
  d.habilidades = (d.habilidades ?? []).map((s) => ({ name: '', family: '', level: 0.5, ...s }));
  d.trayectoria = (d.trayectoria ?? []).map((e) => ({ period: '', role: '', org: '', detail: '', ...e }));
  d.formacion = (d.formacion ?? []).map((e) => ({ period: '', role: '', org: '', detail: '', ...e }));
  d.perfil.facts = (d.perfil.facts ?? []).map((f) => ({ label: '', value: '', ...f }));
  d.contacto.links = (d.contacto.links ?? []).map((l) => ({ label: '', value: '', href: null, ...l }));
  d.perfiles = (d.perfiles ?? []).map((p, i) => ({
    id: p.id ?? `hoja-${i}`,
    nombre: '',
    role: null,
    resumen: null,
    enfoque: null,
    foto: null,
    proyectos: null,
    habilidades: null,
    trayectoria: null,
    ...p,
  }));
  return d;
}

const sacar = (obj, ruta) => ruta.split('.').reduce((o, k) => o?.[k], obj);

function poner(obj, ruta, valor) {
  const partes = ruta.split('.');
  let o = obj;
  for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]];
  o[partes.at(-1)] = valor;
}

/** Del control al estado, con el tipo ya bueno. Ver la nota 2 del cabecero. */
function leerCampo(el) {
  const bruto = el.value;
  switch (el.dataset.tipo) {
    case 'parrafos':
      // Una línea en blanco separa párrafos; los espacios sobrantes se van.
      return bruto
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
    case 'lista':
      return bruto
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    case 'nulo':
      return bruto.trim() || null;
    case 'nivel': {
      const n = Number(bruto);
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
    }
    case 'entero': {
      const n = Math.round(Number(bruto));
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return bruto;
  }
}

/** Qué se añade al pulsar «Añadir» en cada lista. */
function nuevoDe(ruta, arr) {
  switch (ruta) {
    case 'proyectos':
      return {
        id: `p${Date.now().toString(36)}`,
        title: 'Proyecto nuevo',
        tag: '',
        year: '',
        summary: '',
        cv: '',
        stack: [],
        url: null,
        // Un proyecto se añade cuando se empieza, no cuando se acaba.
        estado: 'progreso',
        // Semilla distinta de todas las que ya hay: dos carteles iguales en el
        // círculo se leen como un fallo de dibujado.
        poster: { seed: 1 + Math.max(0, ...arr.map((p) => p.poster?.seed ?? 0)), hue: (arr.length * 47) % 360 },
      };
    case 'habilidades':
      // Hereda la familia de la última: se añaden a rachas, por grupos.
      return { name: '', family: arr.at(-1)?.family ?? 'Núcleo', level: 0.6 };
    case 'trayectoria':
    case 'formacion':
      return { period: '', role: '', org: '', detail: '' };
    case 'contacto.links':
      return { label: '', value: '', href: null, rune: 'ansuz' };
    case 'perfiles':
      // Nace heredándolo TODO —los campos en null— y se poda desde ahí. Ver
      // la nota de `perfiles.js` sobre por qué ausente no es vacío.
      return {
        id: `hoja-${Date.now().toString(36)}`,
        nombre: 'Hoja nueva',
        role: null,
        resumen: null,
        enfoque: null,
        foto: null,
        proyectos: null,
        habilidades: null,
        trayectoria: null,
      };
    default:
      return { label: '', value: '' };
  }
}

function grupo(titulo, ayuda, campos) {
  return `
    <section class="ad__grupo">
      <h2>${esc(titulo)}</h2>
      ${ayuda ? `<p class="ad__ayuda">${esc(ayuda)}</p>` : ''}
      <div class="ad__campos">${campos.join('')}</div>
    </section>`;
}

function campo({ ruta, etiqueta, valor, tipo = '', ayuda = '', ancho = '' }) {
  return `
    <label class="ad__campo${ancho ? ` ad__campo--${ancho}` : ''}">
      <span class="ad__etiqueta">${esc(etiqueta)}</span>
      <input type="text" value="${esc(String(valor ?? ''))}"
             data-ruta="${ruta}" ${tipo ? `data-tipo="${tipo}"` : ''} spellcheck="false" />
      ${ayuda ? `<span class="ad__pista">${esc(ayuda)}</span>` : ''}
    </label>`;
}

/**
 * Desplegable. Se usa para el estado y no una casilla de texto por lo obvio:
 * escrito a mano, «En Progreso» y «en progreso» son dos estados distintos y el
 * portafolio no reconocería ninguno de los dos.
 */
function seleccion({ ruta, etiqueta, valor, opciones, ancho = '' }) {
  const items = Object.entries(opciones)
    .map(([id, texto]) => `<option value="${id}"${id === valor ? ' selected' : ''}>${esc(texto)}</option>`)
    .join('');
  return `
    <label class="ad__campo${ancho ? ` ad__campo--${ancho}` : ''}">
      <span class="ad__etiqueta">${esc(etiqueta)}</span>
      <select data-ruta="${ruta}">${items}</select>
    </label>`;
}

function area({ ruta, etiqueta, valor, tipo = '', filas = 4, ayuda = '' }) {
  return `
    <label class="ad__campo ad__campo--ancho">
      <span class="ad__etiqueta">${esc(etiqueta)}</span>
      <textarea rows="${filas}" data-ruta="${ruta}" ${tipo ? `data-tipo="${tipo}"` : ''}>${esc(
        String(valor ?? '')
      )}</textarea>
      ${ayuda ? `<span class="ad__pista">${esc(ayuda)}</span>` : ''}
    </label>`;
}

function lista({ titulo, ayuda, ruta, items, fila, resumen = null, compacta = false }) {
  const filas = items
    .map(
      (item, i) => `
      <li class="ad__item${compacta ? ' ad__item--compacta' : ''}" data-lista="${ruta}" data-indice="${i}">
        <div class="ad__item-cab">
          <span class="ad__indice">${String(i + 1).padStart(2, '0')}</span>
          <span class="ad__resumen" data-resumen>${esc(resumen ? resumen(item) : '')}</span>
          <span class="ad__mandos">
            <button type="button" data-accion="subir" data-lista="${ruta}" data-indice="${i}"
                    title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-accion="bajar" data-lista="${ruta}" data-indice="${i}"
                    title="Bajar" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" data-accion="borrar" data-lista="${ruta}" data-indice="${i}"
                    title="Borrar" class="ad__borrar">✕</button>
          </span>
        </div>
        <div class="ad__campos">${fila(item, i).join('')}</div>
      </li>`
    )
    .join('');

  return `
    <section class="ad__grupo">
      <h2>${esc(titulo)} <span class="ad__cuenta">${items.length}</span></h2>
      ${ayuda ? `<p class="ad__ayuda">${esc(ayuda)}</p>` : ''}
      <ol class="ad__lista">${filas}</ol>
      <button class="ad__boton ad__boton--linea" type="button"
              data-accion="anadir" data-lista="${ruta}" data-indice="-1">Añadir</button>
    </section>`;
}
