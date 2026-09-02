/**
 * Registro del editor: qué se puede tocar y cómo se le llama.
 *
 * Este mundo no está colocado, está CALCULADO. No hay una lista de piezas con
 * su transformación esperando a que alguien la edite: hay funciones que sueltan
 * 1262 nodos, de los cuales 1113 son mallas y 48 son instanciados. Así que lo
 * primero que hace falta no es un gizmo sino una respuesta a dos preguntas:
 * **qué es una pieza** y **cómo se le llama de forma que el nombre siga
 * valiendo mañana**.
 *
 * ## Qué es una pieza
 *
 * Regla única: **una pieza es un nodo con `.name`**, fuera de las familias
 * excluidas y que no sea un `InstancedMesh`.
 *
 * Sale bien porque el proyecto ya nombra lo que tiene identidad —`trilithon`,
 * `mojon-2`, `escalinata-jamba-0-mar`, `piedra-runada`— y deja sin nombre lo que
 * es relleno generado. En el Camino del Viajero eso separa los 5 mojones de las
 * 490 losas del sendero, que son una cinta, no cinco mojones más. De ~1262 nodos
 * quedan unos 165 editables, que es una lista que se puede leer.
 *
 * Y da una palanca clara: **si quieres que algo sea editable, ponle nombre.**
 *
 * ## Cómo se le llama
 *
 * `contenedor/nombre#n`, donde `#n` solo aparece si hay hermanos que se llaman
 * igual. La plaza tiene siete `trilithon` y quince `stone`, así que el índice
 * hace falta; pero contar SOLO entre los del mismo nombre significa que añadir
 * un canto nuevo no renumera los trilitos.
 *
 * Aun así un identificador puede derivar si se reordena la construcción, y por
 * eso cada anulación guarda también la posición de origen (`pos0`): al aplicar,
 * si la pieza que hay ahora no nació donde decía el fichero, se avisa por
 * consola en vez de mover la pieza equivocada en silencio.
 */

import * as THREE from 'three';
import escenaGuardada from './escena.json';

/**
 * Familias que no se editan pieza a pieza.
 *
 * No es una lista de cosas «poco importantes»: es que en todas ellas la pieza
 * individual no significa nada. La hierba son 110.000 briznas en un solo
 * atributo, el pedregal y el arbolado son instanciados —una malla, cientos de
 * matrices—, y las líneas ley y el terreno son superficies que se recalculan a
 * partir del campo de alturas. Mover una brizna no es una edición, es un error.
 */
const EXCLUIDAS = new Set([
  'terrain',
  'sky',
  'ocean',
  'grass',
  'forest',
  'pedregal',
  'ley',
  'ley-line',
  'ley-ring',
  'motes',
  'birds',
  'sombras-arboles',
  // El propio gizmo del editor: se añade a la escena como cualquier otro nodo y
  // sin esto aparecería en su propia lista de piezas editables.
  'editor-gizmo',
]);

/** @type {Map<string, {objeto: THREE.Object3D, ruta: string, familia: string, pos0: number[]}>} */
const piezas = new Map();
/**
 * Materiales por FAMILIA, no por instancia.
 *
 * Cada entrada es una lista y tiene que serlo. `rockMaterial` devuelve siempre
 * el mismo objeto —una sola entrada para doscientas piedras— pero el estrado
 * fabrica un material por peldaño y por santuario, así que «estrado-peldano»
 * son veinticuatro objetos distintos que se dibujan igual. Guardando solo el
 * último, retocar el color cambiaría un peldaño de un estrado y parecería que
 * el editor no funciona.
 *
 * @type {Map<string, THREE.Material[]>}
 */
const materiales = new Map();

const redondear = (v) => Number(v.toFixed(4));

/** Sufijo `#n` solo cuando hay hermanos homónimos. */
function segmentos(padre) {
  const cuenta = new Map();
  const repes = new Map();
  for (const h of padre.children) {
    if (!h.name) continue;
    repes.set(h.name, (repes.get(h.name) ?? 0) + 1);
  }
  const salida = new Map();
  for (const h of padre.children) {
    if (!h.name) continue;
    const n = cuenta.get(h.name) ?? 0;
    cuenta.set(h.name, n + 1);
    salida.set(h, repes.get(h.name) > 1 ? `${h.name}#${n}` : h.name);
  }
  return salida;
}

/**
 * Recorre la escena y devuelve el catálogo de piezas y materiales editables.
 *
 * Se llama UNA vez, con el mundo ya construido. No modifica nada: solo etiqueta
 * (`userData.editorId`) para que el ratón pueda ir de un triángulo a la pieza a
 * la que pertenece sin volver a recorrer nada.
 *
 * @param {THREE.Scene} escena
 */
export function catalogar(escena) {
  piezas.clear();
  materiales.clear();

  // `movible` se apaga al entrar en una familia excluida y ya no se vuelve a
  // encender. Mover NO es lo mismo que texturizar: el arbolado no se coloca
  // pieza a pieza —son instanciados— pero su corteza y su hoja sí se retocan, y
  // saltarse la rama entera dejaba esos dos materiales fuera del editor.
  const visitar = (nodo, ruta, familia, movible) => {
    const etiquetas = segmentos(nodo);
    for (const hijo of nodo.children) {
      const dentro = movible && !EXCLUIDAS.has(hijo.name);
      const trozo = etiquetas.get(hijo) ?? null;
      const rutaHijo = trozo ? (ruta ? `${ruta}/${trozo}` : trozo) : ruta;

      if (dentro && trozo && !hijo.isInstancedMesh) {
        hijo.userData.editorId = rutaHijo;
        piezas.set(rutaHijo, {
          objeto: hijo,
          ruta: rutaHijo,
          familia: familia ?? hijo.name,
          // La transformación con la que NACIÓ la pieza. Sirve para dos cosas:
          // detectar que un identificador ha derivado, y saber si lo que el
          // editor va a guardar cambia algo de verdad.
          pos0: hijo.position.toArray().map(redondear),
          rot0: [hijo.rotation.x, hijo.rotation.y, hijo.rotation.z].map(redondear),
          esc0: hijo.scale.toArray().map(redondear),
        });
      }

      const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
      for (const m of mats) {
        if (!m?.name) continue;
        const lista = materiales.get(m.name) ?? [];
        if (!lista.includes(m)) lista.push(m);
        materiales.set(m.name, lista);
      }

      visitar(hijo, rutaHijo, familia ?? hijo.name, dentro);
    }
  };

  // El primer nivel son contenedores: `plaza`, `escalinata`, `shrine-*`… Sus
  // hijos son las piezas, así que la raíz arranca con ruta vacía.
  visitar(escena, '', null, true);
  return { piezas, materiales };
}

export function listaPiezas() {
  return [...piezas.values()];
}

export function listaMateriales() {
  return [...materiales.entries()].map(([nombre, familia]) => ({ nombre, familia }));
}

export function piezaPorId(id) {
  return piezas.get(id) ?? null;
}

/** De un impacto del ratón a la pieza a la que pertenece. */
export function piezaDe(objeto) {
  let n = objeto;
  while (n) {
    if (n.userData?.editorId) return piezas.get(n.userData.editorId) ?? null;
    n = n.parent;
  }
  return null;
}

// ------------------------------------------------------------------ anulaciones

/** Copia de trabajo: lo guardado en disco más lo que se lleve tocado en vivo. */
let estado = estructuraValida(escenaGuardada);

function estructuraValida(datos) {
  return {
    version: 1,
    objetos: { ...(datos?.objetos ?? {}) },
    materiales: { ...(datos?.materiales ?? {}) },
  };
}

export function estadoEscena() {
  return estado;
}

/** Anotación de una pieza movida. `null` borra la anulación. */
export function anotarPieza(id, datos) {
  if (datos === null) delete estado.objetos[id];
  else estado.objetos[id] = datos;
}

export function anotarMaterial(nombre, datos) {
  if (datos === null) delete estado.materiales[nombre];
  else estado.materiales[nombre] = { ...(estado.materiales[nombre] ?? {}), ...datos };
}

const cargador = new THREE.TextureLoader();

/**
 * Aplica una textura de fichero a un material.
 *
 * Aquí es donde el proyecto deja de ser «cero ficheros de asset». Se hace con
 * los ojos abiertos: la imagen sustituye al mapa procedural pero NO al resto del
 * material —el sombreado cel, la rugosidad y la proyección triplanar de la roca
 * siguen siendo los mismos—, así que una foto de granito entra en el estilo en
 * vez de pelearse con él.
 */
export function aplicarTextura(material, ruta, { repeticion = 1 } = {}) {
  if (!material) return null;
  if (!ruta) {
    // Volver a lo procedural: se restaura el mapa con el que nació.
    if (material.userData.mapaOriginal !== undefined) {
      material.map = material.userData.mapaOriginal;
      material.needsUpdate = true;
    }
    return null;
  }
  if (material.userData.mapaOriginal === undefined) {
    material.userData.mapaOriginal = material.map ?? null;
  }
  material.userData.rutaTextura = ruta;
  const textura = cargador.load(ruta);
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.repeat.set(repeticion, repeticion);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  material.map = textura;
  material.needsUpdate = true;
  return textura;
}

/** Aplica un ajuste a UN material. La familia entera se recorre fuera. */
export function aplicarAjusteMaterial(material, ajuste) {
  if (!material) return;
  if (ajuste.color) material.color.set(ajuste.color);
  if (ajuste.rugosidad !== undefined) material.roughness = ajuste.rugosidad;
  if (ajuste.relieve !== undefined && material.normalScale) {
    material.normalScale.set(ajuste.relieve, ajuste.relieve);
  }
  if (ajuste.textura !== undefined) {
    aplicarTextura(material, ajuste.textura, { repeticion: ajuste.repeticion ?? 1 });
  }
  material.needsUpdate = true;
}

/** Los valores con los que nació un material, para poder volver a ellos. */
export function ajusteActual(material) {
  return {
    color: `#${material.color?.getHexString?.() ?? 'ffffff'}`,
    rugosidad: material.roughness ?? 1,
    relieve: material.normalScale?.x ?? 1,
    textura: material.userData?.rutaTextura ?? '',
    repeticion: material.map?.repeat?.x ?? 1,
  };
}

/**
 * Vuelca las anulaciones sobre la escena ya construida.
 *
 * Va DESPUÉS de construir, no antes, y no puede ser de otra manera: casi todo
 * este mundo se deriva del campo de alturas, así que las piezas tienen que
 * existir —en su sitio calculado— para poder corregirlas. Lo que aquí se mueve
 * es la pieza, no el terreno bajo ella.
 */
export function aplicarEscena({ avisar = true } = {}) {
  let puestas = 0;
  const derivados = [];

  for (const [id, ajuste] of Object.entries(estado.objetos)) {
    const pieza = piezas.get(id);
    if (!pieza) {
      derivados.push(`${id} (ya no existe)`);
      continue;
    }
    if (ajuste.pos0 && pieza.pos0.some((v, i) => Math.abs(v - ajuste.pos0[i]) > 0.01)) {
      derivados.push(`${id} (nació en otro sitio: el identificador ha derivado)`);
      continue;
    }
    if (ajuste.pos) pieza.objeto.position.fromArray(ajuste.pos);
    if (ajuste.rot) pieza.objeto.rotation.fromArray(ajuste.rot);
    if (ajuste.esc) pieza.objeto.scale.fromArray(ajuste.esc);
    if (ajuste.oculto !== undefined) pieza.objeto.visible = !ajuste.oculto;
    pieza.objeto.updateMatrixWorld(true);
    puestas++;
  }

  for (const [nombre, ajuste] of Object.entries(estado.materiales)) {
    const familia = materiales.get(nombre);
    if (!familia) {
      derivados.push(`material ${nombre} (no está en la escena)`);
      continue;
    }
    for (const material of familia) aplicarAjusteMaterial(material, ajuste);
    puestas++;
  }

  if (avisar && derivados.length) {
    console.warn(
      `[editor] ${derivados.length} anulaciones no se han podido aplicar:\n  ${derivados.join('\n  ')}`
    );
  }
  return { puestas, derivados };
}
