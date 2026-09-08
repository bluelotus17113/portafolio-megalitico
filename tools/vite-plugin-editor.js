/**
 * Plugin de Vite: la mitad de servidor del editor dentro del navegador.
 *
 * El editor vive en la página, pero una página no puede escribir en el disco.
 * Este plugin abre dos rutas en el servidor de DESARROLLO para que sí pueda:
 * una guarda las anulaciones de la escena y otra recibe una imagen y la deja en
 * `public/texturas/`.
 *
 * Es deliberadamente `apply: 'serve'`. La web publicada tiene que seguir siendo
 * estática y de solo lectura: aquí no se compila nada que acabe en `dist/`, y un
 * sitio en producción no expone ninguna de estas rutas. Lo único que viaja a la
 * build es el JSON resultante y las imágenes de `public/`, que son ficheros
 * normales.
 *
 * Por qué no la File System Access API del navegador: no está en Firefox, pide
 * un gesto del usuario por cada guardado y deja el fichero fuera del proyecto.
 * Aquí el guardado cae exactamente donde tiene que caer, versionado con el resto.
 */

import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

/** Extensiones de imagen admitidas, y su cabecera de data URL. */
const IMAGENES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/**
 * Nombre de fichero seguro.
 *
 * No es cosmético: esta ruta escribe en el disco a partir de algo que llega por
 * HTTP. Sin esto, un nombre como `../../.ssh/authorized_keys` saldría del
 * proyecto. Se reduce a minúsculas, guiones y dígitos y se le pone la extensión
 * nosotros, así que el nombre de entrada no puede decidir ni el sitio ni el tipo.
 */
function nombreSeguro(texto) {
  const base = String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'textura';
}

/** Lee el cuerpo de la petición como JSON, con tope de tamaño. */
function leerJson(req, limite = 24 * 1024 * 1024) {
  return new Promise((cumplir, fallar) => {
    let total = 0;
    const trozos = [];
    req.on('data', (t) => {
      total += t.length;
      if (total > limite) {
        fallar(new Error(`cuerpo demasiado grande (${total} bytes)`));
        req.destroy();
        return;
      }
      trozos.push(t);
    });
    req.on('end', () => {
      try {
        cumplir(JSON.parse(Buffer.concat(trozos).toString('utf8')));
      } catch (e) {
        fallar(e);
      }
    });
    req.on('error', fallar);
  });
}

function responder(res, codigo, cuerpo) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo));
}

/**
 * ¿Esto que llega por HTTP es un contenido de portafolio?
 *
 * No es paranoia de seguridad —esto sólo corre en el servidor de desarrollo de
 * quien edita— sino de integridad: `contenido.json` es el ÚNICO sitio donde
 * viven los textos del portafolio, y una petición a medias lo dejaría sin
 * proyectos sin que nadie se enterase hasta abrir la web. Se comprueba la
 * forma, no los valores: que falte un `summary` es cosa del que escribe, pero
 * que `proyectos` no sea una lista es un fichero roto.
 */
function revisarContenido(datos) {
  if (!datos || typeof datos !== 'object') return 'se esperaba un objeto';
  for (const clave of ['identidad', 'perfil', 'contacto']) {
    if (!datos[clave] || typeof datos[clave] !== 'object' || Array.isArray(datos[clave])) {
      return `falta el bloque «${clave}»`;
    }
  }
  for (const clave of ['proyectos', 'habilidades', 'trayectoria']) {
    if (!Array.isArray(datos[clave])) return `«${clave}» tiene que ser una lista`;
  }
  if (!Array.isArray(datos.perfil.body)) return '«perfil.body» tiene que ser una lista de párrafos';
  if (typeof datos.identidad.name !== 'string') return '«identidad.name» tiene que ser texto';
  return null;
}

/**
 * @param {object} opciones
 * @param {string} opciones.escena     Ruta del JSON de anulaciones, desde la raíz.
 * @param {string} opciones.texturas   Carpeta donde caen las imágenes subidas.
 */
export function editorPlugin({
  escena = 'src/editor/escena.json',
  contenido = 'src/contenido.json',
  texturas = 'public/texturas',
} = {}) {
  let raiz = process.cwd();

  return {
    name: 'portafolio-editor',
    apply: 'serve',

    config() {
      return {
        server: {
          watch: {
            // Nada se ignora aquí. Los dos JSON que escriben los editores
            // —la escena y el contenido— se vigilan y su recarga se corta en
            // `handleHotUpdate`; ver la nota de ahí. Ignorarlos, que era como
            // estaba, evitaba la recarga pero también dejaba a Vite sirviendo
            // para siempre la copia cacheada: una edición a mano del JSON, o
            // un `git checkout`, no llegaban nunca al navegador.
            ignored: [],
          },
        },
      };
    },

    configResolved(config) {
      raiz = config.root;
    },

    /**
     * El contenido y la escena se vigilan, pero su cambio NO recarga la página.
     *
     * Las dos mitades hacen falta y por motivos distintos. Vigilarlo es lo que
     * hace que una edición a mano del JSON —o un `git checkout`, o cambiar de
     * rama— llegue al navegador: Vite invalida el módulo antes de llamar aquí,
     * así que la siguiente carga lo lee del disco. Ignorarlo del todo, que era
     * la primera versión, dejaba al servidor sirviendo para siempre la copia
     * que tenía cacheada, y eso no falla: enseña contenido viejo en silencio.
     *
     * Y devolver una lista vacía es lo que evita la recarga. Sin ella, cada
     * guardado del panel recarga el propio panel —se pierde la sección y el
     * sitio del formulario— y además compite con la respuesta del guardado:
     * si la recarga gana, salta el aviso de «tienes cambios sin guardar»
     * justo después de haber guardado.
     */
    handleHotUpdate({ file }) {
      if (file !== resolve(raiz, contenido) && file !== resolve(raiz, escena)) return;
      // No hay que invalidar nada a mano: Vite ya lo ha hecho al ver el cambio
      // del fichero, antes de llamar a este gancho. Lo único que aporta esto
      // es la lista vacía, o sea «no hay nada que actualizar en caliente».
      return [];
    },

    configureServer(server) {
      const rutaEscena = resolve(raiz, escena);
      const rutaContenido = resolve(raiz, contenido);
      const rutaTexturas = resolve(raiz, texturas);

      server.middlewares.use('/__editor/escena', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const { readFileSync } = await import('node:fs');
            return responder(res, 200, JSON.parse(readFileSync(rutaEscena, 'utf8')));
          } catch {
            return responder(res, 200, { version: 1, objetos: {}, materiales: {} });
          }
        }
        if (req.method !== 'POST') return next();
        try {
          const datos = await leerJson(req);
          mkdirSync(dirname(rutaEscena), { recursive: true });
          writeFileSync(rutaEscena, `${JSON.stringify(datos, null, 2)}\n`, 'utf8');
          // Que la próxima carga lo lea del disco: el vigilante lo ignora, así
          // que sin esto Vite serviría la versión transformada anterior.
          const modulo = server.moduleGraph.getModuleById(rutaEscena);
          if (modulo) server.moduleGraph.invalidateModule(modulo);
          const piezas = Object.keys(datos?.objetos ?? {}).length;
          server.config.logger.info(`[editor] escena guardada · ${piezas} piezas`);
          return responder(res, 200, { ok: true, piezas });
        } catch (e) {
          return responder(res, 400, { ok: false, error: String(e.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/contenido', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const { readFileSync } = await import('node:fs');
            return responder(res, 200, JSON.parse(readFileSync(rutaContenido, 'utf8')));
          } catch (e) {
            return responder(res, 500, { ok: false, error: String(e.message ?? e) });
          }
        }
        if (req.method !== 'POST') return next();
        try {
          const datos = await leerJson(req);
          const problema = revisarContenido(datos);
          if (problema) throw new Error(problema);

          // Escritura atómica: primero a un fichero al lado y luego un
          // renombrado, que en el mismo sistema de ficheros es una operación
          // indivisible. Escribiendo encima directamente, un fallo a media
          // escritura deja el contenido del portafolio truncado — y es el
          // único sitio donde vive, así que no hay de dónde recuperarlo salvo
          // del último commit.
          const temporal = `${rutaContenido}.tmp`;
          writeFileSync(temporal, `${JSON.stringify(datos, null, 2)}\n`, 'utf8');
          renameSync(temporal, rutaContenido);

          // El vigilante lo ignora, así que sin invalidar el módulo Vite
          // seguiría sirviendo la copia anterior a quien recargue.
          const modulo = server.moduleGraph.getModuleById(rutaContenido);
          if (modulo) server.moduleGraph.invalidateModule(modulo);
          server.config.logger.info(
            `[panel] contenido guardado · ${datos.proyectos.length} proyectos, ` +
              `${datos.habilidades.length} habilidades, ${datos.trayectoria.length} etapas`
          );
          return responder(res, 200, { ok: true });
        } catch (e) {
          return responder(res, 400, { ok: false, error: String(e.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/textura', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const ficheros = readdirSync(rutaTexturas).filter((f) =>
              Object.values(IMAGENES).includes(extname(f).toLowerCase())
            );
            return responder(res, 200, { texturas: ficheros });
          } catch {
            return responder(res, 200, { texturas: [] });
          }
        }
        if (req.method !== 'POST') return next();
        try {
          const { nombre, datos } = await leerJson(req);
          const cabecera = /^data:([^;]+);base64,/.exec(datos ?? '');
          if (!cabecera) throw new Error('se esperaba una data URL en base64');
          const extension = IMAGENES[cabecera[1]];
          if (!extension) throw new Error(`tipo no admitido: ${cabecera[1]}`);

          const fichero = `${nombreSeguro(nombre)}${extension}`;
          mkdirSync(rutaTexturas, { recursive: true });
          writeFileSync(
            join(rutaTexturas, fichero),
            Buffer.from(datos.slice(cabecera[0].length), 'base64')
          );
          server.config.logger.info(`[editor] textura guardada · ${fichero}`);
          // Ruta tal y como la pedirá el navegador: `public/` se sirve en la
          // raíz tanto en desarrollo como en la build.
          return responder(res, 200, { ok: true, ruta: `texturas/${fichero}` });
        } catch (e) {
          return responder(res, 400, { ok: false, error: String(e.message ?? e) });
        }
      });
    },
  };
}
