/**
 * Prueba del panel de contenido.
 *
 * Lo que se comprueba es el CICLO ENTERO, porque es donde está el riesgo: se
 * escribe en un formulario, se guarda en el disco, y eso tiene que aparecer en
 * la versión ligera, en la hoja de vida y en la escena. Cada tramo por
 * separado puede estar bien y el conjunto no llevar a ninguna parte — un
 * guardado que escribe en el sitio equivocado, o un Vite que sigue sirviendo
 * la copia cacheada del JSON, no fallan: simplemente no cambian nada.
 *
 * **Esta prueba escribe en `src/contenido.json` de verdad.** Se hace copia al
 * empezar y se restaura al acabar, pase lo que pase. No hay forma honesta de
 * probar esto sin escribir: un guardado simulado prueba el simulador.
 *
 * Y comprueba lo contrario también, que es la mitad importante: que el panel
 * NO viaja a la web publicada. Un panel de administración en un sitio estático
 * sin autenticación sería un problema de verdad; aquí no lo es porque las dos
 * mitades —la pantalla y la ruta que escribe— son de desarrollo, y eso hay que
 * verificarlo, no confiarlo.
 *
 *   node tools/admin-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const BASE = process.env.URL ?? 'http://127.0.0.1:5173/';
const JSON_RUTA = 'src/contenido.json';
/**
 * La copia de seguridad NO va en `/tmp`.
 *
 * Aquí `/tmp` es tmpfs, o sea RAM: un reinicio a mitad de prueba —y esta
 * máquina ya se ha reiniciado sola dos veces trabajando en este proyecto— se
 * lleva la copia y deja `src/contenido.json` con la marca de prueba dentro.
 * Con el contenido de verdad escrito, eso es perder el texto del portafolio.
 * `node_modules/.cache` está ignorado por git y sobrevive al reinicio.
 */
const COPIA = 'node_modules/.cache/contenido-check.json';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};
const leerDisco = () => JSON.parse(readFileSync(JSON_RUTA, 'utf8'));

// Copia de seguridad ANTES de abrir nada.
mkdirSync('node_modules/.cache', { recursive: true });
copyFileSync(JSON_RUTA, COPIA);
const original = readFileSync(JSON_RUTA, 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errores.push(m.text().slice(0, 200));
  });

  await page.goto(`${BASE}?admin`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('.ad__hoja', { timeout: 30000 });

  console.log('\n── Panel de contenido ─────────────────────────────────────────\n');

  // ── 1. Las seis secciones se pintan ─────────────────────────────────────
  const secciones = await page.evaluate(async () => {
    const salida = {};
    // Cada botón se vuelve a buscar por selector en cada vuelta. Guardando la
    // lista de antes, el primer clic la deja huérfana y los cinco siguientes
    // no hacen nada: la prueba medía seis veces la misma sección y pasaba sin
    // comprobar nada.
    const ids = [...document.querySelectorAll('[data-seccion]')].map((b) => b.dataset.seccion);
    for (const id of ids) {
      document.querySelector(`[data-seccion="${id}"]`).click();
      await new Promise((r) => setTimeout(r, 30));
      salida[id] = document.querySelectorAll('[data-ruta]').length;
    }
    return salida;
  });
  // «Hojas de vida» es una sección de LISTA y arranca vacía: sin perfiles
  // guardados no tiene ni un campo, y eso es correcto. Lo que hay que exigirle
  // es el botón de añadir; los campos aparecen con la primera hoja, y de eso se
  // encarga `perfiles-check`, que crea una y la poda.
  // «Candidaturas» además NO edita `contenido.json`: sus datos viven en la
  // tabla de career-ops, en otro fichero y con otro botón de guardar. Contarle
  // campos de contenido es medir lo que no tiene — y con el registro vacío
  // tendría cero legítimamente, igual que «Hojas de vida».
  const deLista = new Set(['perfiles', 'candidaturas']);
  const vacias = Object.entries(secciones)
    .filter(([id, n]) => n < 3 && !deLista.has(id))
    .map(([id]) => id);
  const distintas = new Set(
    Object.entries(secciones).filter(([id]) => !deLista.has(id)).map(([, n]) => n)
  ).size;
  comprobar(vacias.length === 0, 'Cada sección de contenido trae campos', JSON.stringify(secciones));

  // Y a las de lista se les exige lo suyo: que se pueda empezar a llenarlas.
  const listas = await page.evaluate(async () => {
    const salida = {};
    for (const id of ['perfiles', 'candidaturas']) {
      document.querySelector(`[data-seccion="${id}"]`)?.click();
      // La de candidaturas lee su fichero: hay que darle tiempo a llegar.
      await new Promise((r) => setTimeout(r, 900));
      salida[id] = Boolean(
        document.querySelector('[data-accion="anadir"]') ||
          document.querySelector('[data-cand-anadir]')
      );
    }
    return salida;
  });
  for (const [id, tiene] of Object.entries(listas)) {
    comprobar(tiene, `  «${id}» deja empezar a llenarla`);
  }
  const hayAlta = await page.evaluate(async () => {
    document.querySelector('[data-seccion="perfiles"]').click();
    await new Promise((r) => setTimeout(r, 60));
    return Boolean(document.querySelector('[data-accion="anadir"][data-lista="perfiles"]'));
  });
  comprobar(hayAlta, 'Y «Hojas de vida», aunque esté vacía, deja crear una');
  // Y no son la misma seis veces, que es lo que pasaba cuando el clic dejaba
  // huérfanos los botones: seis cuentas idénticas no prueban nada.
  comprobar(distintas >= 4, 'Y cada una es distinta de las demás', `${distintas} tamaños distintos`);

  // El editor de escena, al alcance desde aquí. Los dos son hermanos —escriben
  // en el proyecto por el mismo plugin de Vite y sólo existen en desarrollo—
  // y hasta ahora había que saberse la dirección de memoria. Aquí se editan los
  // textos; allí, dónde está cada piedra.
  const alEditor = await page.evaluate(() => {
    const b = document.querySelector('[data-ver="editor"]');
    if (!b) return null;
    let abierta = null;
    const original = window.open;
    window.open = (url, nombre) => {
      abierta = { url, nombre };
      return { focus() {} };
    };
    b.click();
    window.open = original;
    return { texto: b.textContent.trim(), enElLateral: Boolean(b.closest('.ad__lado-pie')), abierta };
  });
  comprobar(Boolean(alEditor), 'Hay un botón que lleva al editor de escena', alEditor?.texto ?? 'no existe');
  comprobar(
    alEditor?.abierta?.url === '?modo=3d&editor',
    'Y abre la escena en modo edición',
    alEditor?.abierta?.url ?? ''
  );
  // En su propia ventana: mover piedras es una sesión larga, y perderla porque
  // se pulsó «Ver la isla» encima sería el peor momento para reusar pestaña.
  comprobar(
    alEditor?.abierta?.nombre === 'portafolio-editor',
    'En una ventana propia, no en la de previsualización',
    alEditor?.abierta?.nombre ?? ''
  );

  // ── 1b. La página se puede desplazar ────────────────────────────────────
  //
  // Con nueve proyectos el formulario mide cuatro pantallas. `base.css` le
  // quita el desplazamiento al documento para que la escena ocupe la ventana,
  // y devolvérselo sólo a `body` dejaba la página SORDA A LA RUEDA y sin
  // barra: medido, `scrollY` se quedaba en 0 con 3591 px de contenido en una
  // ventana de 900, y del tercer proyecto en adelante no se llegaba a los
  // campos. No es un detalle de estilo: era la mitad del panel inalcanzable.
  await page.evaluate(async () => {
    document.querySelector('[data-seccion="proyectos"]').click();
    await new Promise((r) => setTimeout(r, 60));
    window.scrollTo(0, 0);
  });
  await page.mouse.move(800, 500);
  await page.mouse.wheel({ deltaY: 1200 });
  await new Promise((r) => setTimeout(r, 250));
  const desplazamiento = await page.evaluate(() => ({
    conRueda: Math.round(window.scrollY),
    alto: document.documentElement.scrollHeight,
    ventana: document.documentElement.clientHeight,
    htmlOverflow: getComputedStyle(document.documentElement).overflowY,
    barraArriba: Math.round(document.querySelector('.ad__barra').getBoundingClientRect().top),
  }));
  comprobar(
    desplazamiento.alto > desplazamiento.ventana * 2,
    'El formulario de proyectos es más largo que la ventana',
    `${desplazamiento.alto} px en ${desplazamiento.ventana}`
  );
  comprobar(
    desplazamiento.conRueda > 900,
    'Y la rueda del ratón lo desplaza',
    `scrollY ${desplazamiento.conRueda}`
  );
  comprobar(
    desplazamiento.htmlOverflow !== 'hidden',
    'El documento no está bloqueado, así que el navegador pinta su barra',
    desplazamiento.htmlOverflow
  );
  comprobar(
    desplazamiento.barraArriba === 0,
    'Y la barra superior se queda pegada arriba al bajar',
    `${desplazamiento.barraArriba} px`
  );

  // Cambiar de sección devuelve arriba: si no, se aterriza en mitad de la
  // sección nueva sin haber visto su título ni la nota que la explica.
  const vuelta = await page.evaluate(async () => {
    document.querySelector('[data-seccion="habilidades"]').click();
    await new Promise((r) => setTimeout(r, 120));
    return Math.round(window.scrollY);
  });
  comprobar(vuelta === 0, 'Cambiar de sección vuelve arriba del todo', `scrollY ${vuelta}`);

  // ── 2. Escribir no repinta ──────────────────────────────────────────────
  //
  // El defecto clásico de estos paneles: cada tecla vuelve a pintar el
  // formulario, el elemento con el foco deja de existir y el cursor salta al
  // principio. Se escribe en medio de una palabra y se mira dónde quedó.
  const foco = await page.evaluate(async () => {
    document.querySelector('[data-seccion="identidad"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const campo = document.querySelector('[data-ruta="identidad.name"]');
    campo.focus();
    campo.setSelectionRange(2, 2);
    // Se guarda el valor de PARTIDA en vez de darlo por sabido: la prueba
    // esperaba «TU NOMBRE» y empezó a fallar en cuanto el panel se usó para lo
    // que es. Una comprobación que depende del contenido no comprueba el panel.
    return { mismo: document.activeElement === campo, cursor: campo.selectionStart, antes: campo.value };
  });
  await page.type('[data-ruta="identidad.name"]', 'XY');
  const trasEscribir = await page.evaluate(() => {
    const campo = document.querySelector('[data-ruta="identidad.name"]');
    return {
      sigueConFoco: document.activeElement === campo,
      cursor: campo.selectionStart,
      valor: campo.value,
    };
  });
  comprobar(foco.mismo && trasEscribir.sigueConFoco, 'Escribir no le quita el foco a la casilla');
  const esperado = `${foco.antes.slice(0, 2)}XY${foco.antes.slice(2)}`;
  comprobar(
    trasEscribir.cursor === 4 && trasEscribir.valor === esperado,
    'Y el cursor se queda donde estaba, no salta al final',
    `«${trasEscribir.valor}» con el cursor en ${trasEscribir.cursor}`
  );

  // ── 3. Los tipos se sanean al entrar ────────────────────────────────────
  const tipos = await page.evaluate(async () => {
    const admin = document.querySelector('.ad');
    const escribir = (sel, texto) => {
      const el = admin.querySelector(sel);
      el.value = texto;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.querySelector('[data-seccion="habilidades"]').click();
    await new Promise((r) => setTimeout(r, 30));
    escribir('[data-ruta="habilidades.0.level"]', 'no es un número');
    const basura = window.__admin.datos.habilidades[0].level;
    escribir('[data-ruta="habilidades.0.level"]', '5');
    const pasado = window.__admin.datos.habilidades[0].level;

    document.querySelector('[data-seccion="proyectos"]').click();
    await new Promise((r) => setTimeout(r, 30));
    escribir('[data-ruta="proyectos.0.url"]', '   ');
    const url = window.__admin.datos.proyectos[0].url;
    escribir('[data-ruta="proyectos.0.stack"]', ' uno , dos ,, tres ');
    const pila = window.__admin.datos.proyectos[0].stack;

    document.querySelector('[data-seccion="perfil"]').click();
    await new Promise((r) => setTimeout(r, 30));
    escribir('[data-ruta="perfil.body"]', 'Primero.\n\n\nSegundo.');
    const parrafos = window.__admin.datos.perfil.body;
    return { basura, pasado, url, pila, parrafos };
  });
  comprobar(tipos.basura === 0, 'Un nivel con letras no se cuela como NaN', String(tipos.basura));
  comprobar(tipos.pasado === 1, 'Y un nivel de 5 se recorta a 1', String(tipos.pasado));
  comprobar(tipos.url === null, 'Un enlace en blanco se guarda como null, no como cadena vacía');
  comprobar(
    JSON.stringify(tipos.pila) === '["uno","dos","tres"]',
    'Las herramientas se parten por comas y sin huecos',
    JSON.stringify(tipos.pila)
  );
  comprobar(
    JSON.stringify(tipos.parrafos) === '["Primero.","Segundo."]',
    'Una línea en blanco separa párrafos',
    JSON.stringify(tipos.parrafos)
  );

  // ── 4. Añadir, mover y borrar ───────────────────────────────────────────
  const estructura = await page.evaluate(async () => {
    document.querySelector('[data-seccion="proyectos"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const d = window.__admin.datos.proyectos;
    const antes = d.length;
    const semillas = d.map((p) => p.poster.seed);

    document.querySelector('[data-accion="anadir"][data-lista="proyectos"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const nueva = window.__admin.datos.proyectos.at(-1).poster.seed;

    const primero = window.__admin.datos.proyectos[0].title;
    document.querySelector('[data-accion="bajar"][data-lista="proyectos"][data-indice="0"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const trasBajar = window.__admin.datos.proyectos[1].title;

    document.querySelector('[data-accion="borrar"][data-lista="proyectos"][data-indice="0"]').click();
    await new Promise((r) => setTimeout(r, 30));
    return {
      antes,
      trasAnadir: antes + 1,
      ahora: window.__admin.datos.proyectos.length,
      semillaRepetida: semillas.includes(nueva),
      movio: primero === trasBajar,
    };
  });
  comprobar(estructura.ahora === estructura.antes, 'Añadir, mover y borrar dejan la lista cuadrada', `${estructura.antes} → ${estructura.ahora}`);
  comprobar(!estructura.semillaRepetida, 'El proyecto nuevo trae una semilla de cartel sin usar');
  comprobar(estructura.movio, 'Bajar un proyecto lo baja de verdad');

  // ── 5. El ciclo completo: panel → disco → las tres salidas ──────────────
  const MARCA = `Prueba ${Date.now().toString(36).toUpperCase()}`;
  const guardado = await page.evaluate(async (marca) => {
    document.querySelector('[data-seccion="identidad"]').click();
    await new Promise((r) => setTimeout(r, 30));
    const campo = document.querySelector('[data-ruta="identidad.name"]');
    campo.value = marca;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-guardar]').click();
    // Esperar a que el estado deje de decir «Guardando…».
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const t = document.querySelector('[data-estado]').textContent;
      if (!t.includes('Guardando')) return { estado: t, sucio: window.__admin.sucio };
    }
    return { estado: 'agotado el tiempo', sucio: true };
  }, MARCA);
  comprobar(!guardado.sucio, 'El panel guarda y deja de estar sucio', guardado.estado);

  const enDisco = leerDisco();
  comprobar(enDisco.identidad.name === MARCA, 'Y el cambio está en src/contenido.json', enDisco.identidad.name);
  comprobar(
    enDisco.proyectos.length === estructura.antes && enDisco.proyectos[0].url === null,
    'Con el resto de las ediciones dentro',
    `${enDisco.proyectos.length} proyectos`
  );

  const ligera = await browser.newPage();
  await ligera.goto(`${BASE}?modo=ligero`, { waitUntil: 'networkidle2', timeout: 120000 });
  await ligera.waitForSelector('.lg-portada__nombre', { timeout: 30000 });
  const enLigera = await ligera.evaluate(() => ({
    nombre: document.querySelector('.lg-portada__nombre').textContent.trim(),
    hoja: document.querySelector('.cv__nombre')?.textContent.trim(),
  }));
  comprobar(enLigera.nombre === MARCA, 'La versión ligera enseña lo guardado', enLigera.nombre);
  comprobar(enLigera.hoja === MARCA, 'Y la hoja de vida también', enLigera.hoja);

  // ── 6. `?imprimir` abre el diálogo ──────────────────────────────────────
  const imprimir = await browser.newPage();
  await imprimir.evaluateOnNewDocument(() => {
    window.__imprimio = 0;
    window.print = () => {
      window.__imprimio++;
    };
  });
  await imprimir.goto(`${BASE}?modo=ligero&imprimir`, { waitUntil: 'networkidle2', timeout: 120000 });
  await imprimir.waitForFunction(() => window.__imprimio > 0, { timeout: 20000 }).catch(() => {});
  const veces = await imprimir.evaluate(() => window.__imprimio);
  comprobar(veces === 1, 'El enlace ?imprimir suelta el diálogo de impresión una vez', `${veces}`);
  await imprimir.close();
  await ligera.close();

  // La consola se juzga AQUÍ y no al final: la prueba siguiente provoca un 400
  // a propósito, y el navegador lo escribe como error de red. Contarlo sería
  // suspender por haber comprobado algo.
  comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

  // ── 7. El servidor no se traga cualquier cosa ───────────────────────────
  const antesDelIntento = readFileSync(JSON_RUTA, 'utf8');
  const rechazo = await page.evaluate(async () => {
    const res = await fetch('/__editor/contenido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identidad: { name: 'roto' }, proyectos: 'esto no es una lista' }),
    });
    return { estado: res.status, cuerpo: await res.json() };
  });
  comprobar(rechazo.estado === 400, 'Un contenido con la forma mal se rechaza', `HTTP ${rechazo.estado}`);
  comprobar(
    readFileSync(JSON_RUTA, 'utf8') === antesDelIntento,
    'Y el fichero se queda como estaba',
    rechazo.cuerpo.error ?? ''
  );

  // ── 8. Qué puede y qué no puede llegar a la web publicada ───────────────
  //
  // Esto decía «el panel no aparece en dist/», y era la comprobación correcta
  // mientras el panel fuera sólo de local: la puerta era `import.meta.env.DEV`
  // y consistía en que el formulario no existiera.
  //
  // Ya no. El panel viaja a propósito, porque hace falta editar desde otro
  // sitio, y la puerta se mudó al servidor. Así que lo que hay que vigilar
  // cambió, y no es que el panel no esté:
  //
  //   · que la ruta de escritura DEL SERVIDOR DE DESARROLLO no viaje, porque
  //     esa no pide nada a nadie;
  //   · que ningún secreto se haya horneado en el paquete;
  //   · y que quien escribe de verdad rechace sin sesión.
  //
  // Se mira el `dist/` que haya. Si no lo hay, se dice: es peor dar por bueno
  // un `dist` que no existe que no comprobarlo.
  if (existsSync('dist')) {
    const { execSync } = await import('node:child_process');
    const buscar = (patron) =>
      execSync(`grep -rl "${patron}" dist/ || true`, { encoding: 'utf8' }).trim();

    comprobar(
      buscar('__editor/contenido\\|__editor/retrato\\|__editor/escena') === '',
      'Las rutas de escritura del servidor de desarrollo no viajan',
      buscar('__editor/')
    );

    // Un secreto horneado en el paquete es público aunque esté en una variable
    // de entorno: Vite sustituye `import.meta.env.X` por su VALOR al compilar.
    const secretos = buscar('ADMIN_HASH\\|SESSION_SECRET\\|GITHUB_TOKEN\\|scrypt\\$');
    comprobar(secretos === '', 'Ningún secreto se ha horneado en el paquete', secretos);

    comprobar(
      buscar('ad__pestania') !== '',
      'Y el panel sí viaja, que es lo que permite entrar desde otro sitio'
    );
  } else {
    comprobar(false, 'Hay un dist/ que mirar (ejecuta `npx vite build`)');
  }

  // ── 9. Quien escribe en producción no se fía de nadie ───────────────────
  //
  // Se llama al manejador de verdad, no a una imitación: es la única forma de
  // que esta comprobación siga valiendo cuando alguien toque el endpoint.
  {
    const { default: guardar } = await import('../api/contenido.js');
    const respuesta = (m) => {
      const r = { codigo: 0, cuerpo: null };
      return [
        { method: m, headers: {}, body: {} },
        {
          status(c) { r.codigo = c; return this; },
          json(j) { r.cuerpo = j; return this; },
          setHeader() {},
        },
        r,
      ];
    };
    const [reqA, resA, rA] = respuesta('PUT');
    await guardar(reqA, resA);
    comprobar(rA.codigo === 401, 'Sin sesión, guardar en producción rebota', `HTTP ${rA.codigo}`);

    const [reqB, resB, rB] = respuesta('GET');
    await guardar(reqB, resB);
    comprobar(rB.codigo === 405, 'Y sólo acepta PUT', `HTTP ${rB.codigo}`);

    const [reqC, resC, rC] = respuesta('PUT');
    reqC.headers.cookie = 'sesion=falsificada.aqui';
    await guardar(reqC, resC);
    comprobar(rC.codigo === 401, 'Una cookie inventada tampoco pasa', `HTTP ${rC.codigo}`);
  }
} finally {
  await browser.close();
  // Pase lo que pase, el contenido vuelve a estar como estaba.
  copyFileSync(COPIA, JSON_RUTA);
  rmSync(COPIA, { force: true });
  const vuelto = readFileSync(JSON_RUTA, 'utf8') === original;
  console.log(`\n${vuelto ? 'src/contenido.json restaurado.' : '⚠ NO se pudo restaurar src/contenido.json'}`);
  if (!vuelto) fallos++;
}

console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
