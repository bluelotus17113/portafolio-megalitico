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

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
 * @param {object} opciones
 * @param {string} opciones.escena     Ruta del JSON de anulaciones, desde la raíz.
 * @param {string} opciones.texturas   Carpeta donde caen las imágenes subidas.
 */
export function editorPlugin({
  escena = 'src/editor/escena.json',
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
            // El JSON de la escena NO dispara recarga.
            //
            // El editor ya ha aplicado el cambio en vivo antes de guardar, así
            // que recargar solo sirve para perder la selección y volver a
            // construir el mundo entero. Se invalida el módulo a mano (ver
            // más abajo) para que la SIGUIENTE carga completa lo lea del disco
            // en vez de servir la copia que Vite tiene cacheada.
            ignored: [`**/${escena}`],
          },
        },
      };
    },

    configResolved(config) {
      raiz = config.root;
    },

    configureServer(server) {
      const rutaEscena = resolve(raiz, escena);
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
