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

import { CONTENIDO } from '../content.js';
import { esc } from '../utils/html.js';
import './admin.css';

const RUTA = '/__editor/contenido';

const SECCIONES = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'perfil', label: 'Perfil' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'habilidades', label: 'Habilidades' },
  { id: 'trayectoria', label: 'Trayectoria' },
  { id: 'contacto', label: 'Contacto' },
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
      case 'perfil':
        return this._perfil();
      case 'proyectos':
        return this._proyectos();
      case 'habilidades':
        return this._habilidades();
      case 'trayectoria':
        return this._trayectoria();
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
      ]
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
          etiqueta: 'Texto',
          valor: (d.body ?? []).join('\n\n'),
          filas: 10,
          ayuda: 'Una línea en blanco separa un párrafo del siguiente.',
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
        area({ ruta: `proyectos.${i}.summary`, etiqueta: 'Resumen', valor: p.summary, filas: 3 }),
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

    this.caja.addEventListener('click', (e) => {
      const boton = e.target.closest('button');
      if (!boton) return;

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
        return;
      }
      if (boton.dataset.ver) return this._ver(boton.dataset.ver);
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

  _resumenDe(item) {
    const ruta = item.dataset.lista;
    const i = Number(item.dataset.indice);
    const dato = sacar(this.datos, ruta)[i];
    if (ruta === 'proyectos') return dato.title || 'Sin título';
    if (ruta === 'habilidades') return dato.name || 'Sin nombre';
    if (ruta === 'trayectoria') return `${dato.period || '—'} · ${dato.role || 'Sin puesto'}`;
    if (ruta === 'contacto.links') return `${dato.label}: ${dato.value || '—'}`;
    return '';
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.datos),
      });
      const cuerpo = await res.json();
      if (!res.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? `HTTP ${res.status}`);
      this.sucio = false;
      this.aviso = null;
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
    const url =
      cual === '3d' ? '?modo=3d' : cual === 'hoja' ? '?modo=ligero&imprimir' : '?modo=ligero';
    const ventana = window.open(url, 'portafolio-previsualizacion');
    ventana?.focus();
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
  d.identidad = { name: '', role: '', oghamMotto: '', ...d.identidad };
  d.perfil = { title: '', subtitle: '', body: [], facts: [], ...d.perfil };
  d.contacto = { title: '', subtitle: '', intro: '', links: [], endpoint: null, ...d.contacto };
  d.proyectos = (d.proyectos ?? []).map((p, i) => ({
    id: p.id ?? `p${i + 1}`,
    title: '',
    tag: '',
    year: '',
    summary: '',
    stack: [],
    url: null,
    ...p,
    poster: { seed: 100 + i * 11, hue: (i * 47) % 360, ...p.poster },
  }));
  d.habilidades = (d.habilidades ?? []).map((s) => ({ name: '', family: '', level: 0.5, ...s }));
  d.trayectoria = (d.trayectoria ?? []).map((e) => ({ period: '', role: '', org: '', detail: '', ...e }));
  d.perfil.facts = (d.perfil.facts ?? []).map((f) => ({ label: '', value: '', ...f }));
  d.contacto.links = (d.contacto.links ?? []).map((l) => ({ label: '', value: '', href: null, ...l }));
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
        stack: [],
        url: null,
        // Semilla distinta de todas las que ya hay: dos carteles iguales en el
        // círculo se leen como un fallo de dibujado.
        poster: { seed: 1 + Math.max(0, ...arr.map((p) => p.poster?.seed ?? 0)), hue: (arr.length * 47) % 360 },
      };
    case 'habilidades':
      // Hereda la familia de la última: se añaden a rachas, por grupos.
      return { name: '', family: arr.at(-1)?.family ?? 'Núcleo', level: 0.6 };
    case 'trayectoria':
      return { period: '', role: '', org: '', detail: '' };
    case 'contacto.links':
      return { label: '', value: '', href: null, rune: 'ansuz' };
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
