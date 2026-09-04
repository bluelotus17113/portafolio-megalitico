/**
 * Contra qué choca el visitante cuando va a pie.
 *
 * En órbita y en vuelo libre nadie echa esto de menos: una cámara que atraviesa
 * un menhir se lee como una cámara. En primera persona el mismo atravesamiento
 * rompe la escena de golpe, porque el cuerpo dice «soy alguien de pie aquí» y
 * la piedra dice que no.
 *
 * ## Solo piezas COMPACTAS
 *
 * El volumen envolvente de una malla solo se parece a la malla cuando la pieza
 * es compacta. Un menhir de 2,6 × 1,5 × 8,5 m cabe bien en su caja; el muro de
 * la escalinata, que es una cinta curva de cuarenta metros, tiene una caja de
 * 40 × 3 × 40 que **incluye los propios escalones**: colisionar contra ella
 * cerraría la escalinata entera. Lo mismo el estrado, que mide 66 m de lado a
 * lado y por tanto envuelve a todo el mundo que esté encima.
 *
 * Así que aquí solo entran las piezas cuya caja las describe: piedra hincada,
 * jambas, dólmenes, túmulos. Lo demás —muros, taludes, cortados— lo resuelve el
 * límite de pendiente del modo a pie, que es la herramienta correcta para el
 * terreno: por una ladera del 90 % no se sube, y no hace falta ponerle una caja
 * delante para impedirlo.
 *
 * ## Empuje por el eje de menor penetración
 *
 * Al quedar dentro de una caja se sale por donde menos se ha entrado. Es el
 * comportamiento que se espera: rozar el canto de un menhir te desliza a lo
 * largo de él en vez de escupirte hacia atrás.
 */

import * as THREE from 'three';

/** Ni decorado plano ni efectos: nada de esto tiene cuerpo. */
const SIN_CUERPO = [
  /^talla/, /^canal-/, /^beacon/, /^pulse-rings/, /^ley/, /^smoke/, /^fire/,
  /^terrain/, /^ocean/, /^sky/, /^grass/, /^motes/, /^birds/, /^editor-gizmo/,
  /^sombras-/, /^caminos/, /^bordillos/,
  // Los paneles de proyecto flotan en el aire y son luz, no piedra. Se colaban
  // por tener el tamaño de una losa de pie, y chocar contra un cartel es de las
  // cosas que peor sientan en primera persona.
  /^holo/, /^label/, /^rotulo/,
  // La fábrica de la escalinata es SUELO, no obstáculo: se anda por encima.
  //
  // El cuerpo principal se libraba por tamaño —cuarenta metros de cinta no pasan
  // el filtro de compacidad— pero los dos tramos de entrega miden cuatro metros
  // y sí lo pasaban. Su caja, de 1,2 m de alta, quedaba plantada justo donde
  // acaba la escalinata: el visitante subía los veintiún metros y se topaba con
  // el último tramo como si fuera una tapia. Y el fallo no se distingue del de
  // pendiente mirándolo — de hecho el terreno daba permiso en las ocho
  // direcciones.
  /^escalinata-(escalones|entrega)/,
  // NINGÚN muro es colisionador, y no por descuido.
  //
  // Un murete flanquea un paso; lo que define por dónde se anda es el paso, no
  // el murete. Y además son el peor caso posible para una caja alineada con los
  // ejes: una cinta de cuatro metros y medio, sesenta centímetros de gruesa y
  // puesta en diagonal, tiene un volumen envolvente tres veces más ancho que
  // ella. Los del tramo de entrega a Habilidades quedaban así atravesados en la
  // entrada del estrado — un tope invisible justo después de subir veintiún
  // metros. Lo que impide salirse del paso es el límite de pendiente y la
  // anchura de la pasarela, que sí saben de qué forma es cada cosa.
  /muro/,
];

/** Dimensiones dentro de las que una caja describe de verdad a su pieza. */
const COMPACTA = { anchoMax: 9, altoMin: 1.0, anchoMin: 0.35 };

/**
 * Recorre la escena y devuelve las cajas contra las que se choca.
 *
 * Se llama UNA vez, con el mundo construido y las anulaciones del editor ya
 * aplicadas: si una piedra se ha movido a mano, se choca donde está ahora.
 *
 * @param {THREE.Object3D} escena
 */
export function construirColisionadores(escena) {
  const cajas = [];
  const caja = new THREE.Box3();
  const tamano = new THREE.Vector3();

  // Matrices de mundo al día ANTES de medir nada.
  //
  // `Box3.setFromObject` compone la caja con la matriz de mundo que el objeto
  // tenga guardada, y esa matriz solo se recalcula al dibujar. Aquí se llama
  // antes del primer fotograma, así que sin esto las cajas salen en
  // coordenadas LOCALES: una piedra rúnica de la plaza daba y ∈ [0, 3] en vez
  // de [44,9, 47,9]. El fallo no revienta nada — simplemente ninguna caja
  // coincide nunca con el visitante y se atraviesa la isla entera como si no
  // hubiera colisiones, que es exactamente lo que pasaba.
  escena.updateMatrixWorld(true);

  /** Filtra una caja ya medida y la guarda si de verdad describe un obstáculo. */
  const anadir = (etiqueta) => {
    if (caja.isEmpty()) return;
    caja.getSize(tamano);
    if (tamano.y < COMPACTA.altoMin) return;
    if (tamano.x > COMPACTA.anchoMax || tamano.z > COMPACTA.anchoMax) return;
    if (tamano.x < COMPACTA.anchoMin || tamano.z < COMPACTA.anchoMin) return;

    cajas.push({
      minX: caja.min.x, maxX: caja.max.x,
      minY: caja.min.y, maxY: caja.max.y,
      minZ: caja.min.z, maxZ: caja.max.z,
      // Centro y radio en planta: sirven para descartar rápido.
      cx: (caja.min.x + caja.max.x) * 0.5,
      cz: (caja.min.z + caja.max.z) * 0.5,
      r: Math.hypot(tamano.x, tamano.z) * 0.5,
      etiqueta,
    });
  };

  const matrizInstancia = new THREE.Matrix4();
  const matrizMundo = new THREE.Matrix4();

  escena.traverse((nodo) => {
    if (!nodo.isMesh) return;
    // Los instanciados no se chocan salvo que pidan lo contrario.
    //
    // La regla de siempre es que un `InstancedMesh` es relleno —la hierba, el
    // pedregal, el arbolado— y ahí una caja por copia serían miles de cajas
    // para nada. Pero el bordillo del sendero pasó a instanciarse por
    // rendimiento, y con la regla a secas trece cantos dejaron de existir para
    // quien camina. Así que el que quiera cuerpo lo dice: `colisionaPorInstancia`.
    if (nodo.isInstancedMesh && !nodo.userData.colisionaPorInstancia) return;
    if (!nodo.visible) return;
    // Y tampoco vale con que el NODO sea visible: las zonas de contacto de los
    // puntos interactivos son cilindros con `MeshBasicMaterial({visible:false})`,
    // o sea mallas visibles con material invisible. Miden dos metros de radio y
    // están plantadas justo delante de cada monumento: como colisionadores
    // serían muros transparentes en el peor sitio posible.
    const mats = Array.isArray(nodo.material) ? nodo.material : [nodo.material];
    if (!mats.some((m) => m && m.visible !== false && (m.opacity ?? 1) > 0.05)) return;
    // El nombre de la pieza puede estar en el nodo o en el grupo que lo
    // contiene: un trilito nombra al grupo y deja los postes sin nombre.
    const etiqueta = nodo.name || nodo.parent?.name || '';
    if (SIN_CUERPO.some((r) => r.test(etiqueta))) return;

    // Una caja por copia. Es la misma cuenta que hace `Box3.setFromObject`
    // —la caja de la geometría llevada a mundo—, solo que la matriz de mundo
    // de una copia es la del nodo por la suya propia.
    if (nodo.isInstancedMesh) {
      if (!nodo.geometry.boundingBox) nodo.geometry.computeBoundingBox();
      for (let i = 0; i < nodo.count; i++) {
        nodo.getMatrixAt(i, matrizInstancia);
        matrizMundo.multiplyMatrices(nodo.matrixWorld, matrizInstancia);
        caja.copy(nodo.geometry.boundingBox).applyMatrix4(matrizMundo);
        anadir(etiqueta);
      }
      return;
    }

    caja.setFromObject(nodo);
    anadir(etiqueta);
  });

  return new Colisionadores(cajas);
}

export class Colisionadores {
  constructor(cajas) {
    this.cajas = cajas;
    /**
     * Rejilla en planta: con doscientas cajas bastaría probarlas todas, pero
     * esto se ejecuta en cada fotograma y cuesta menos escribirlo que medirlo.
     */
    this.celda = 24;
    this.rejilla = new Map();
    for (const c of cajas) {
      const i0 = Math.floor((c.cx - c.r) / this.celda);
      const i1 = Math.floor((c.cx + c.r) / this.celda);
      const j0 = Math.floor((c.cz - c.r) / this.celda);
      const j1 = Math.floor((c.cz + c.r) / this.celda);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const clave = `${i},${j}`;
          const lista = this.rejilla.get(clave) ?? [];
          lista.push(c);
          this.rejilla.set(clave, lista);
        }
      }
    }
  }

  /** Cajas que pueden tocar un punto. */
  cerca(x, z) {
    return this.rejilla.get(`${Math.floor(x / this.celda)},${Math.floor(z / this.celda)}`) ?? [];
  }

  /**
   * Saca al visitante de cualquier piedra en la que haya entrado.
   *
   * @param {THREE.Vector3} pos    Posición de los OJOS. Se modifica en el sitio.
   * @param {number} radio         Radio del cuerpo.
   * @param {number} alturaOjos    De los ojos a los pies.
   * @returns {boolean}            Si ha habido que empujar.
   */
  resolver(pos, radio, alturaOjos) {
    const pies = pos.y - alturaOjos;
    const cabeza = pos.y + 0.15;
    let tocado = false;

    for (const c of this.cerca(pos.x, pos.z)) {
      // Fuera en vertical: ni se pasa por encima ni por debajo.
      //
      // El margen de abajo deja subirse a lo que sea más bajo que un escalón
      // cómodo — una losa caída no es un muro, se pisa.
      if (cabeza < c.minY || pies > c.maxY - 0.45) continue;

      const dentroX = pos.x > c.minX - radio && pos.x < c.maxX + radio;
      const dentroZ = pos.z > c.minZ - radio && pos.z < c.maxZ + radio;
      if (!dentroX || !dentroZ) continue;

      // Cuánto habría que moverse por cada lado para salir.
      const salidas = [
        { eje: 'x', v: c.minX - radio - pos.x },
        { eje: 'x', v: c.maxX + radio - pos.x },
        { eje: 'z', v: c.minZ - radio - pos.z },
        { eje: 'z', v: c.maxZ + radio - pos.z },
      ];
      let mejor = salidas[0];
      for (const s of salidas) if (Math.abs(s.v) < Math.abs(mejor.v)) mejor = s;
      pos[mejor.eje] += mejor.v;
      tocado = true;
    }
    return tocado;
  }
}
