/**
 * Panel del editor: la parte que se lee y se escribe con los dedos.
 *
 * DOM a mano, sin dependencias. El resto del portafolio hace lo mismo y no
 * merece la pena traerse un framework para cuatro listas y ocho casillas.
 *
 * Dos cosas que no son obvias:
 *
 *  - **Las casillas numéricas existen porque el gizmo no basta.** Arrastrar es
 *    cómodo para aproximar y pésimo para «bájalo exactamente diez centímetros».
 *    Las dos vías escriben en el mismo sitio y se refrescan la una a la otra.
 *  - **El material se edita por FAMILIA.** Al tocar «roca» cambian las
 *    doscientas piedras de la isla, y eso es lo que se quiere: son la misma
 *    piedra. Ver `registro.js` para por qué la familia es una lista.
 */

import {
  aplicarAjusteMaterial,
  ajusteActual,
  anotarMaterial,
  estadoEscena,
  listaMateriales,
} from './registro.js';

const EJES = ['x', 'y', 'z'];

/** @param {import('./Editor.js').Editor} editor */
export function crearPanel(editor) {
  const raiz = document.createElement('aside');
  raiz.className = 'ed';
  raiz.innerHTML = `
    <header class="ed__cabecera">
      <span class="ed__punto" data-sucio="false"></span>
      <span class="ed__titulo">Editor</span>
      <button class="ed__boton ed__boton--principal" data-accion="guardar">Guardar</button>
    </header>
    <div class="ed__cuerpo">
      <section class="ed__seccion">
        <p class="ed__rotulo">Piezas</p>
        <input class="ed__buscar" type="text" placeholder="Filtrar por nombre…" data-buscar>
        <div class="ed__lista" data-lista></div>
      </section>

      <section class="ed__seccion" data-transformacion hidden>
        <p class="ed__rotulo" data-nombre>—</p>
        <div class="ed__fila"><b>P</b>
          <input type="number" step="0.05" data-t="pos" data-eje="0">
          <input type="number" step="0.05" data-t="pos" data-eje="1">
          <input type="number" step="0.05" data-t="pos" data-eje="2"></div>
        <div class="ed__fila"><b>R</b>
          <input type="number" step="1" data-t="rot" data-eje="0">
          <input type="number" step="1" data-t="rot" data-eje="1">
          <input type="number" step="1" data-t="rot" data-eje="2"></div>
        <div class="ed__fila"><b>T</b>
          <input type="number" step="0.02" data-t="esc" data-eje="0">
          <input type="number" step="0.02" data-t="esc" data-eje="1">
          <input type="number" step="0.02" data-t="esc" data-eje="2"></div>
        <div class="ed__botones">
          <button class="ed__boton" data-modo="translate" aria-pressed="true">Mover</button>
          <button class="ed__boton" data-modo="rotate">Rotar</button>
          <button class="ed__boton" data-modo="scale">Tamaño</button>
        </div>
        <div class="ed__botones">
          <button class="ed__boton" data-accion="posar">Posar en el suelo</button>
          <button class="ed__boton" data-accion="ocultar">Ocultar</button>
          <button class="ed__boton" data-accion="restablecer">Restablecer</button>
        </div>
      </section>

      <section class="ed__seccion">
        <p class="ed__rotulo">Material</p>
        <select data-material></select>
        <div data-material-cuerpo hidden>
          <div class="ed__fila" style="grid-template-columns:56px 1fr">
            <b>Color</b><input type="color" data-m="color">
          </div>
          <div class="ed__fila" style="grid-template-columns:56px 1fr">
            <b>Rugoso</b><input type="range" min="0" max="1" step="0.02" data-m="rugosidad">
          </div>
          <div class="ed__fila" style="grid-template-columns:56px 1fr">
            <b>Relieve</b><input type="range" min="0" max="3" step="0.05" data-m="relieve">
          </div>
          <div class="ed__fila" style="grid-template-columns:56px 1fr">
            <b>Repet.</b><input type="number" min="0.1" step="0.5" data-m="repeticion">
          </div>
          <div class="ed__soltar" data-soltar>
            Arrastra una imagen aquí<br>o pulsa para elegirla
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-fichero>
          </div>
          <div class="ed__botones">
            <button class="ed__boton" data-accion="sin-textura">Volver a la textura generada</button>
          </div>
        </div>
      </section>
    </div>
    <p class="ed__aviso" data-aviso></p>
    <div class="ed__ayuda">
      <kbd>G</kbd> mover · <kbd>R</kbd> rotar · <kbd>E</kbd> tamaño · <kbd>X</kbd> local/mundo<br>
      <kbd>P</kbd> posar en el suelo · <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer · <kbd>Ctrl</kbd>+<kbd>S</kbd> guardar
    </div>
  `;
  document.body.appendChild(raiz);

  const $ = (sel) => raiz.querySelector(sel);
  const punto = $('.ed__punto');
  const lista = $('[data-lista]');
  const buscar = $('[data-buscar]');
  const seccionT = $('[data-transformacion]');
  const nombre = $('[data-nombre]');
  const aviso = $('[data-aviso]');
  const selectorMat = $('[data-material]');
  const cuerpoMat = $('[data-material-cuerpo]');
  const zonaSoltar = $('[data-soltar]');
  const entradaFichero = $('[data-fichero]');

  let piezas = [];
  let seleccion = null;
  let familiaMat = null;

  // El panel no puede robarle los eventos al lienzo, pero tampoco dejar que un
  // clic dentro se lea como «deseleccionar».
  raiz.addEventListener('pointerdown', (e) => e.stopPropagation());
  raiz.addEventListener('pointerup', (e) => e.stopPropagation());

  // -------------------------------------------------------------------- lista

  function pintarLista() {
    const filtro = buscar.value.trim().toLowerCase();
    const visibles = piezas.filter((p) => !filtro || p.ruta.toLowerCase().includes(filtro));
    lista.innerHTML = '';
    if (!visibles.length) {
      lista.innerHTML = '<p class="ed__vacio" style="padding:8px">Nada con ese nombre.</p>';
      return;
    }
    for (const pieza of visibles.slice(0, 400)) {
      const b = document.createElement('button');
      b.className = 'ed__item';
      b.type = 'button';
      const corte = pieza.ruta.lastIndexOf('/');
      b.innerHTML =
        corte > 0
          ? `${pieza.ruta.slice(corte + 1)} <span>${pieza.ruta.slice(0, corte)}</span>`
          : pieza.ruta;
      b.setAttribute('aria-selected', String(seleccion?.ruta === pieza.ruta));
      b.addEventListener('click', () => {
        const elegida = editor.seleccionar(pieza.ruta);
        editor.enfocar(elegida);
      });
      lista.appendChild(b);
    }
    if (visibles.length > 400) {
      const p = document.createElement('p');
      p.className = 'ed__vacio';
      p.style.padding = '6px 8px';
      p.textContent = `…y ${visibles.length - 400} más. Afina el filtro.`;
      lista.appendChild(p);
    }
  }

  buscar.addEventListener('input', pintarLista);

  // ----------------------------------------------------------- transformación

  const casillas = [...raiz.querySelectorAll('[data-t]')];
  for (const casilla of casillas) {
    casilla.addEventListener('change', () => {
      if (!seleccion) return;
      const tipo = casilla.dataset.t;
      const valores = casillas
        .filter((c) => c.dataset.t === tipo)
        .map((c) => Number(c.value) || 0);
      // La rotación se enseña en grados porque nadie piensa en radianes.
      editor.aplicar({ [tipo]: tipo === 'rot' ? valores.map((g) => (g * Math.PI) / 180) : valores });
    });
  }

  function refrescarTransformacion() {
    const o = seleccion?.objeto;
    if (!o) return;
    for (const casilla of casillas) {
      const i = Number(casilla.dataset.eje);
      const eje = EJES[i];
      if (casilla.dataset.t === 'pos') casilla.value = o.position[eje].toFixed(2);
      if (casilla.dataset.t === 'rot') casilla.value = ((o.rotation[eje] * 180) / Math.PI).toFixed(1);
      if (casilla.dataset.t === 'esc') casilla.value = o.scale[eje].toFixed(3);
    }
    const botonOcultar = $('[data-accion="ocultar"]');
    botonOcultar.textContent = o.visible ? 'Ocultar' : 'Mostrar';
  }

  function marcarSeleccion(pieza) {
    seleccion = pieza;
    seccionT.hidden = !pieza;
    if (pieza) {
      nombre.textContent = pieza.ruta;
      refrescarTransformacion();
    }
    for (const b of lista.querySelectorAll('.ed__item')) {
      b.setAttribute('aria-selected', String(b.textContent.includes(pieza?.ruta ?? ' ')));
    }
    pintarLista();
  }

  function marcarModo(modo, espacio) {
    for (const b of raiz.querySelectorAll('[data-modo]')) {
      b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
    }
    avisar(`Gizmo: ${modo} · espacio ${espacio}`);
  }

  for (const b of raiz.querySelectorAll('[data-modo]')) {
    b.addEventListener('click', () => {
      editor.gizmo.setMode(b.dataset.modo);
      marcarModo(b.dataset.modo, editor.gizmo.space);
    });
  }

  // ------------------------------------------------------------------ acciones

  raiz.addEventListener('click', (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (!accion) return;
    if (accion === 'guardar') return editor.guardar();
    if (accion === 'posar') return editor.posarEnSuelo();
    if (accion === 'restablecer') return editor.restablecer();
    if (accion === 'ocultar') {
      if (!seleccion) return;
      return editor.aplicar({ oculto: seleccion.objeto.visible });
    }
    if (accion === 'sin-textura') return ponerTextura('');
  });

  // ------------------------------------------------------------------ material

  function refrescarMateriales() {
    const familias = listaMateriales().sort((a, b) => a.nombre.localeCompare(b.nombre));
    selectorMat.innerHTML = '<option value="">— elige un material —</option>';
    for (const { nombre: n, familia } of familias) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = familia.length > 1 ? `${n} (${familia.length})` : n;
      selectorMat.appendChild(opt);
    }
  }

  selectorMat.addEventListener('change', () => {
    const familias = Object.fromEntries(listaMateriales().map((m) => [m.nombre, m.familia]));
    familiaMat = familias[selectorMat.value] ?? null;
    cuerpoMat.hidden = !familiaMat;
    if (!familiaMat) return;
    // El primero de la familia manda: todos se dibujan igual por definición.
    const actual = { ...ajusteActual(familiaMat[0]), ...(estadoEscena().materiales[selectorMat.value] ?? {}) };
    $('[data-m="color"]').value = actual.color;
    $('[data-m="rugosidad"]').value = actual.rugosidad;
    $('[data-m="relieve"]').value = actual.relieve;
    $('[data-m="repeticion"]').value = actual.repeticion;
  });

  for (const control of raiz.querySelectorAll('[data-m]')) {
    control.addEventListener('input', () => {
      if (!familiaMat) return;
      const clave = control.dataset.m;
      const valor = clave === 'color' ? control.value : Number(control.value);
      const ajuste = { [clave]: valor };
      // La repetición solo tiene sentido con una textura de fichero puesta.
      if (clave === 'repeticion') {
        const guardado = estadoEscena().materiales[selectorMat.value] ?? {};
        if (guardado.textura) ajuste.textura = guardado.textura;
      }
      for (const m of familiaMat) aplicarAjusteMaterial(m, ajuste);
      anotarMaterial(selectorMat.value, ajuste);
      editor.marcarSucio();
    });
  }

  function ponerTextura(ruta) {
    if (!familiaMat) return;
    const repeticion = Number($('[data-m="repeticion"]').value) || 1;
    for (const m of familiaMat) aplicarAjusteMaterial(m, { textura: ruta, repeticion });
    anotarMaterial(selectorMat.value, { textura: ruta, repeticion });
    editor.marcarSucio();
    avisar(ruta ? `Textura aplicada: ${ruta}` : 'De vuelta a la textura generada.');
  }

  async function subirImagen(fichero) {
    if (!fichero) return;
    if (!familiaMat) return avisar('Elige antes un material.', true);
    try {
      const datos = await new Promise((cumplir, fallar) => {
        const lector = new FileReader();
        lector.onload = () => cumplir(lector.result);
        lector.onerror = () => fallar(lector.error);
        lector.readAsDataURL(fichero);
      });
      const respuesta = await fetch('/__editor/textura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: fichero.name.replace(/\.[^.]+$/, ''), datos }),
      });
      const salida = await respuesta.json();
      if (!salida.ok) throw new Error(salida.error ?? 'error desconocido');
      ponerTextura(salida.ruta);
    } catch (e) {
      avisar(`No se ha podido subir: ${e.message}`, true);
    }
  }

  zonaSoltar.addEventListener('click', () => entradaFichero.click());
  entradaFichero.addEventListener('change', () => subirImagen(entradaFichero.files?.[0]));
  for (const evento of ['dragenter', 'dragover']) {
    zonaSoltar.addEventListener(evento, (e) => {
      e.preventDefault();
      zonaSoltar.dataset.encima = 'true';
    });
  }
  for (const evento of ['dragleave', 'drop']) {
    zonaSoltar.addEventListener(evento, (e) => {
      e.preventDefault();
      zonaSoltar.dataset.encima = 'false';
    });
  }
  zonaSoltar.addEventListener('drop', (e) => subirImagen(e.dataTransfer?.files?.[0]));

  // --------------------------------------------------------------------- varios

  function avisar(texto, error = false) {
    aviso.textContent = texto;
    aviso.dataset.error = String(error);
  }

  function marcarSucio(sucio) {
    punto.dataset.sucio = String(sucio);
  }

  refrescarMateriales();
  avisar('Pulsa una pieza en la escena o búscala en la lista.');

  return {
    refrescarLista(nuevas) {
      piezas = nuevas;
      pintarLista();
      avisar(`${piezas.length} piezas editables.`);
    },
    refrescarTransformacion,
    marcarSeleccion,
    marcarModo,
    marcarSucio,
    avisar,
    destruir() {
      raiz.remove();
    },
  };
}
