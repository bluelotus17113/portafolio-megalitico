/**
 * Perfiles de la hoja de vida: la misma vida contada para cada oferta.
 *
 * Quien busca trabajo no escribe un currículo por puesto: escribe uno y elige
 * qué enseñar de él. Para una vacante de Unity se destacan los juegos; para una
 * de front, la web y el WebGL. Los hechos no cambian — cambia qué se pone
 * delante y cómo se encabeza.
 *
 * ── Un perfil SELECCIONA, no copia ─────────────────────────────────────────
 *
 * Es la decisión que sostiene todo lo demás, y la alternativa es peor de lo que
 * parece. Con perfiles-copia, cada uno sería un `contenido.json` entero: el día
 * que cambias de correo tienes que acordarte de corregirlo en cinco sitios, y
 * los cuatro que olvides mandan a los reclutadores a una dirección muerta. Un
 * currículo desactualizado no avisa de que lo está.
 *
 * Aquí los hechos viven UNA vez y el perfil dice cuáles entran y en qué orden.
 * Añadir un proyecto lo pone a disposición de todos los perfiles; corregir una
 * fecha la corrige en todos. Lo único que un perfil tiene propio es lo que de
 * verdad cambia entre candidaturas: el oficio de la cabecera, el resumen y el
 * enfoque.
 *
 * ── El orden es parte de la selección ──────────────────────────────────────
 *
 * Las listas no son conjuntos: el orden en que se guardan es el orden en que
 * salen en el PDF. Poner primero el proyecto que más se parece a la vacante es
 * la mitad de adaptar un currículo, y sale gratis si se respeta el orden.
 *
 * ── Ausente no es lo mismo que vacío ───────────────────────────────────────
 *
 * `null` o el campo sin poner significa **todo**; una lista significa
 * exactamente eso y en ese orden, incluida la lista vacía, que significa
 * ninguno. Así un perfil recién creado hereda el currículo entero y se trabaja
 * QUITANDO, que es como se adapta de verdad: se parte de lo que hay y se poda.
 */

/** El perfil que no filtra nada. Existe siempre y no se puede borrar. */
export const PERFIL_COMPLETO = {
  id: 'completa',
  nombre: 'Completa',
  role: null,
  resumen: null,
  enfoque: null,
  proyectos: null,
  habilidades: null,
  trayectoria: null,
};

/**
 * Identificador estable de una etapa de la trayectoria.
 *
 * La trayectoria no traía `id` —los proyectos sí— y un perfil no puede
 * seleccionar por índice: reordenar una etapa cambiaría en silencio lo que
 * enseña cada currículo. Se deriva del periodo y la organización, que es lo que
 * identifica a una etapa para quien la vivió.
 */
export function idEtapa(e, i) {
  if (e.id) return e.id;
  const babosa = `${e.period ?? ''}-${e.org ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Una etapa sin periodo ni organización no da babosa: cae al índice, que no
  // es estable pero es lo único que queda.
  return babosa || `etapa-${i}`;
}

/** Ordena `lista` según los identificadores de `elegidos`, y descarta el resto. */
function elegir(lista, elegidos, clave) {
  if (!Array.isArray(elegidos)) return lista;
  const porClave = new Map(lista.map((x, i) => [clave(x, i), x]));
  // Se recorre `elegidos` y no `lista`: así el orden lo manda el perfil. Y se
  // filtran los que ya no existen, que es lo que pasa al borrar un proyecto
  // que algún perfil todavía nombraba.
  return elegidos.map((id) => porClave.get(id)).filter(Boolean);
}

/**
 * Aplica un perfil a los datos y devuelve una copia lista para maquetar.
 *
 * No muta nada: el portafolio —la isla y la versión ligera— sigue enseñando
 * todo el contenido, siempre. Los perfiles son de la hoja de vida y sólo de
 * ella; un portafolio que se recorta según a qué se opta deja de ser un
 * portafolio.
 *
 * @param {object} datos     El contenido completo.
 * @param {object|null} perfil
 */
export function aplicarPerfil(datos, perfil) {
  const p = perfil ?? PERFIL_COMPLETO;
  const salida = {
    ...datos,
    identidad: { ...datos.identidad },
    perfil: { ...datos.perfil },
  };

  if (p.role) salida.identidad.role = p.role;
  if (Array.isArray(p.resumen) && p.resumen.length) salida.perfil.body = p.resumen;

  if (p.enfoque) {
    // El enfoque es una ficha más, y se reemplaza o se añade. Es el dato que
    // más se adapta a la vacante después del oficio, y no tenerlo por perfil
    // obligaba a reescribirlo a mano antes de cada envío.
    const fichas = (datos.perfil.facts ?? []).map((f) =>
      /enfoque/i.test(f.label ?? '') ? { ...f, value: p.enfoque } : f
    );
    if (!fichas.some((f) => /enfoque/i.test(f.label ?? ''))) {
      fichas.push({ label: 'Enfoque', value: p.enfoque });
    }
    salida.perfil.facts = fichas;
  }

  salida.proyectos = elegir(datos.proyectos ?? [], p.proyectos, (x) => x.id);
  salida.habilidades = elegir(datos.habilidades ?? [], p.habilidades, (x) => x.name);
  salida.trayectoria = elegir(datos.trayectoria ?? [], p.trayectoria, idEtapa);
  return salida;
}

/** Busca un perfil por id entre los guardados. Sin id, o sin match, el completo. */
export function perfilPorId(perfiles, id) {
  if (!id || id === PERFIL_COMPLETO.id) return PERFIL_COMPLETO;
  return (perfiles ?? []).find((p) => p.id === id) ?? PERFIL_COMPLETO;
}

/** Todos los perfiles disponibles, con el completo siempre el primero. */
export function listaPerfiles(perfiles) {
  return [PERFIL_COMPLETO, ...(perfiles ?? [])];
}
