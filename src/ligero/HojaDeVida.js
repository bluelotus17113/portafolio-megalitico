/**
 * La hoja de vida: el portafolio impreso en papel.
 *
 * Se descarga desde la versión ligera con el botón «Hoja de vida (PDF)», que
 * no hace más que abrir el diálogo de imprimir del navegador. El PDF lo genera
 * él, y esa es toda la gracia del asunto: sin jsPDF, sin html2canvas, sin un
 * servicio que lo renderice fuera. Un PDF de navegador sale con **texto de
 * verdad** —seleccionable, copiable, indexable por los filtros de currículos—
 * y con los enlaces vivos. Uno hecho con html2canvas es una foto de un texto,
 * y en un proceso de selección eso es la diferencia entre que te lean y que no.
 *
 * ── Por qué es un documento aparte y no la página maquillada ───────────────
 *
 * Se puede imprimir la propia versión ligera con `@media print` reordenando lo
 * que hay. Sale mal, y no por la maquetación: **un currículo y un portafolio
 * no cuentan lo mismo en el mismo orden**. El portafolio abre con un nombre a
 * pantalla completa, se recrea en las láminas de los proyectos y deja el
 * contacto para el final, que es lo que hay que hacer cuando alguien está
 * paseando. Un currículo abre con el contacto en la primera línea —es lo que
 * el que lo lee necesita antes que nada—, pone la experiencia arriba y no
 * gasta ni un centímetro en decoración. Así que este fichero arma su propio
 * documento.
 *
 * Lo que NO cambia es de dónde salen los datos: `content.js`, el mismo sitio
 * que amuebla el promontorio y que rellena la versión ligera. Se sigue
 * escribiendo el contenido una vez.
 *
 * ── Lo que se deja fuera a propósito ───────────────────────────────────────
 *
 * Los medidores de nivel de las habilidades se convierten en listas. Una barra
 * al 62 % en pantalla es un gesto simpático; impresa en un currículo es una
 * afirmación numérica sobre uno mismo que nadie sabe leer y que en gris sobre
 * blanco además no se ve. El nivel sí se usa: **ordena** cada familia de más a
 * menos, que es la información que de verdad llevaba dentro.
 *
 * Y las fichas con `—` no se imprimen. En `content.js` los datos vienen con un
 * guion como marcador de posición, y «Ubicación: —» en un papel no es un hueco
 * elegante, es un descuido.
 */

import { ABOUT, CONTACT, EXPERIENCE, IDENTITY, PROJECTS, SKILLS } from '../content.js';
import { esc } from '../utils/html.js';

/** ¿Este valor dice algo? Los marcadores de posición de `content.js` no. */
const tieneValor = (v) => Boolean(v) && v.trim() !== '' && v.trim() !== '—' && v.trim() !== '-';

/** Nombre que el navegador propondrá para el fichero. */
export function tituloHoja() {
  return `${IDENTITY.name} — Hoja de vida`;
}

/**
 * El documento entero. En pantalla no se ve (`display: none` en la hoja de
 * estilos); sólo existe al imprimir.
 */
export function hojaDeVidaHTML() {
  return `
    <article class="cv" id="hoja-de-vida" aria-hidden="true">
      ${cabecera()}
      ${perfil()}
      ${experiencia()}
      ${habilidades()}
      ${proyectos()}
      ${pie()}
    </article>`;
}

/**
 * Nombre, oficio y cómo localizarte, en ese orden y en la primera pulgada.
 *
 * Los canales van con su `href` cuando lo tienen: en el PDF quedan pinchables,
 * que es la mitad de para qué sirve mandar un currículo por correo. Y se
 * escribe también el valor en texto, porque la otra mitad de las veces se
 * imprime en papel y ahí un enlace no es nada.
 */
function cabecera() {
  const canales = (CONTACT.links ?? [])
    .filter((l) => tieneValor(l.value))
    .map((l) => {
      const texto = `${esc(l.label)} <span class="cv__valor">${esc(l.value)}</span>`;
      return l.href
        ? `<li><a href="${esc(l.href)}">${texto}</a></li>`
        : `<li>${texto}</li>`;
    })
    .join('');

  return `
    <header class="cv__cab">
      <h1 class="cv__nombre">${esc(IDENTITY.name)}</h1>
      <p class="cv__rol">${esc(IDENTITY.role)}</p>
      ${canales ? `<ul class="cv__canales">${canales}</ul>` : ''}
    </header>`;
}

function perfil() {
  const parrafos = (ABOUT.body ?? []).map((p) => `<p>${esc(p)}</p>`).join('');
  const fichas = (ABOUT.facts ?? [])
    .filter((f) => tieneValor(f.value))
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('');
  if (!parrafos && !fichas) return '';

  return bloque(
    'Perfil',
    `${parrafos}${fichas ? `<dl class="cv__fichas">${fichas}</dl>` : ''}`
  );
}

/**
 * De lo más reciente a lo más antiguo.
 *
 * `content.js` guarda la trayectoria al revés —de la más antigua a la más
 * reciente— porque el sendero de la escena ASCIENDE hacia el presente. En
 * papel manda la otra convención, la de siempre: lo primero que se lee es
 * dónde estás ahora.
 */
function experiencia() {
  if (!EXPERIENCE?.length) return '';
  const hitos = [...EXPERIENCE]
    .reverse()
    .map(
      (e) => `
      <li class="cv__hito">
        <p class="cv__periodo">${esc(e.period)}</p>
        <div>
          <h3 class="cv__puesto">${esc(e.role)}${e.org ? ` <span class="cv__org">· ${esc(e.org)}</span>` : ''}</h3>
          ${e.detail ? `<p>${esc(e.detail)}</p>` : ''}
        </div>
      </li>`
    )
    .join('');
  return bloque('Experiencia', `<ol class="cv__hitos">${hitos}</ol>`);
}

/** Una línea por familia, ordenada de más fuerte a menos. Ver el cabecero. */
function habilidades() {
  if (!SKILLS?.length) return '';
  const familias = [...new Set(SKILLS.map((s) => s.family))];
  const filas = familias
    .map((familia) => {
      const nombres = SKILLS.filter((s) => s.family === familia)
        .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
        .map((s) => esc(s.name))
        .join(' · ');
      return `<div class="cv__familia"><dt>${esc(familia)}</dt><dd>${nombres}</dd></div>`;
    })
    .join('');
  return bloque('Habilidades', `<dl class="cv__habilidades">${filas}</dl>`);
}

function proyectos() {
  if (!PROJECTS?.length) return '';
  const fichas = PROJECTS.map((p) => {
    const meta = [p.tag, p.year].filter(tieneValor).map(esc).join(' · ');
    const pila = p.stack?.length ? `<p class="cv__pila">${p.stack.map(esc).join(' · ')}</p>` : '';
    // El enlace se escribe con la dirección visible y no con un «Ver proyecto»:
    // impreso, un texto que oculta su destino no lleva a ninguna parte.
    const enlace = p.url
      ? `<p class="cv__enlace"><a href="${esc(p.url)}">${esc(sinProtocolo(p.url))}</a></p>`
      : '';
    return `
      <li class="cv__proyecto">
        <h3 class="cv__titulo">${esc(p.title)}${meta ? ` <span class="cv__meta">${meta}</span>` : ''}</h3>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
        ${pila}
        ${enlace}
      </li>`;
  }).join('');
  return bloque('Proyectos', `<ul class="cv__proyectos">${fichas}</ul>`);
}

/**
 * El pie lleva la dirección del portafolio, y hace falta.
 *
 * Este documento vive dentro de una isla megalítica en 3D, y en el PDF no
 * queda ni rastro de eso. La línea de abajo es lo único que le dice a quien lo
 * tiene delante que hay algo más y dónde está.
 */
function pie() {
  return `
    <footer class="cv__pie">
      <span>Portafolio interactivo:</span>
      <a href="" data-cv-url>—</a>
    </footer>`;
}

function bloque(titulo, contenido) {
  return `
    <section class="cv__bloque">
      <h2>${esc(titulo)}</h2>
      ${contenido}
    </section>`;
}

const sinProtocolo = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
