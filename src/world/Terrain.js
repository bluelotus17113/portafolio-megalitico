/**
 * El promontorio: campo de alturas procedural + malla.
 *
 * `TerrainField` es la fuente de verdad de la altura del mundo. La usan la
 * malla, la colocación de piedras y hierba, y la cámara para no meterse bajo
 * tierra. Por eso la función de altura vive separada de la geometría.
 */

import * as THREE from 'three';
import { SimplexNoise, clamp, lerp, smoothstep } from '../utils/noise.js';
import { turf, granite } from '../utils/textures.js';
import { applyToonShading, TOON_PRESETS } from '../vfx/toon.js';
import { PALETTE, SEED, WORLD } from '../config.js';

/**
 * La baldosa del terreno y su teselado.
 *
 * Subidos de 520/384 para que quepa mar adentro una segunda tierra a la que
 * SE LA VEA desde el mirador. Con 520 el borde caía en ±260 y eso topaba las
 * tres cosas a la vez: cuánto se puede alejar el islote, cuánto puede medir y
 * por tanto qué silueta admite. Se probaron veintisiete rumbos y tres alturas
 * dentro de ese límite y ninguno asomaba por encima del cinturón de árboles
 * del borde de la isla grande — la única forma de conseguirlo era un farallón
 * de cuarenta metros con radio treinta, que sale como una pantalla de lámpara.
 *
 * El paso se mantiene en 1,354 m por cuadro (700/517), y no por comodidad: la
 * rasa mareal de `_rasa` existe justamente porque a ese paso la pared del
 * acantilado se dibujaba como una escalera de peldaños de seis metros. Bajar
 * la resolución para ahorrar vértices reabriría ese problema.
 *
 * Y sale barato: el terreno pasa de 148k vértices a 268k, pero la escena
 * entera tiene 3.656k —la manda la hierba, con 110.000 briznas— así que son
 * tres puntos porcentuales sobre el total. Medido: 59,8 fps antes y después.
 */
const TILE = 700;
const SEGMENTS = 517;

export class TerrainField {
  constructor(seed = SEED) {
    this.noise = new SimplexNoise(seed);
    this.detail = new SimplexNoise(seed + 991);
    /** Zonas aplanadas para que los santuarios se asienten. */
    this.pads = [];
    /** Cerros añadidos a mano. Ver `addMound`. */
    this.mounds = [];
    /** Trincheras: rebajan el terreno a lo largo de un segmento. */
    this.cuts = [];
    /** Galerías bajo tierra por las que se puede pasar. Ver `walkHeight`. */
    this.tunnels = [];
    /** Fábrica por encima del terreno sobre la que se anda. Ver `walkHeight`. */
    this.walkways = [];
    /** Segundas tierras mar adentro. Ver `addIsla`. */
    this.islas = [];
    /** Bajíos: barras sumergidas que levantan el fondo. Ver `addBajio`. */
    this.bajios = [];
  }

  /**
   * Cerro postizo.
   *
   * El ruido de este promontorio hace lomas ANCHAS y tendidas —es lo que se
   * buscaba, un prado atlántico— y eso significa que no produce cerros con
   * falda. Barriendo la isla entera con la condición de que hubiera cinco
   * metros de roca sobre el techo de una galería y que las dos bocas salieran a
   * terreno continuo, aparecieron cuatro sitios en toda la meseta, y el mejor
   * daba 3,3 m: un montículo tan suave que por fuera no se leería como algo
   * perforable.
   *
   * Antes que meter el pasadizo en un mal sitio, se levanta el cerro. Es tan
   * procedural como el resto y deja el control donde tiene que estar: la
   * cobertura de la galería se sabe por construcción en vez de depender de que
   * el ruido tenga a bien poner un bulto donde hace falta.
   */
  addMound(x, z, radius, height) {
    this.mounds.push({ x, z, radius, height });
    return this;
  }

  /**
   * Trinchera: rebaja el terreno a lo largo de un segmento, nunca lo levanta.
   *
   * Es lo que deja a la vista la boca de la galería. Un campo de alturas no
   * puede tener un agujero —para cada (x, z) hay una sola altura—, así que una
   * puerta excavada en la ladera es imposible tal cual: el terreno pasaría por
   * delante del vano. La salida es la misma que en un desmonte de ferrocarril:
   * se abre una zanja de paredes casi verticales que llega hasta la portada, y
   * la portada se planta al fondo, ya con roca suficiente encima.
   */
  addCut(ax, az, bx, bz, { halfWidth = 3.2, blend = 4.5, floorA, floorB } = {}) {
    this.cuts.push({ ax, az, bx, bz, halfWidth, blend, floorA, floorB });
    return this;
  }

  /**
   * Galería transitable. No toca la superficie: solo apunta dónde hay hueco
   * bajo tierra para que la cámara pueda meterse. Ver `walkHeight`.
   */
  addTunnel(ax, az, bx, bz, { halfWidth = 2.0, floor, height = 4.2 } = {}) {
    this.tunnels.push({ ax, az, bx, bz, halfWidth, floor, height });
    return this;
  }

  /**
   * Pasarela: fábrica por encima del terreno por la que se anda.
   *
   * La contraria de una galería. `addTunnel` dice «aquí el suelo está más BAJO
   * de lo que parece»; esto dice «más ALTO». Hace falta para la escalinata: es
   * una obra de cantería, no un accidente del terreno, y en los tramos que van
   * sobre terraplén sus huellas quedan metros por encima de la ladera. Sin
   * declararlo, la cámara sube por dentro del muro de contención en vez de por
   * encima de los escalones.
   *
   * No toca `height`: la superficie del terreno sigue siendo la que es, y el
   * desmonte y el muro son los que resuelven cómo se ve. Esto solo cambia por
   * dónde se puede andar.
   */
  addWalkway(ax, az, bx, bz, { halfWidth = 2.5, floorA = 0, floorB = 0 } = {}) {
    this.walkways.push({ ax, az, bx, bz, halfWidth, floorA, floorB });
    return this;
  }

  /** Proyección de (x, z) sobre un segmento: devuelve [t, distancia]. */
  _onSegment(x, z, s) {
    const vx = s.bx - s.ax;
    const vz = s.bz - s.az;
    const len2 = vx * vx + vz * vz || 1;
    const t = clamp(((x - s.ax) * vx + (z - s.az) * vz) / len2, 0, 1);
    return [t, Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t))];
  }

  /**
   * Radio de la costa en un ángulo dado. Deforma el círculo con ruido para
   * que el promontorio tenga entrantes y salientes, no un borde de compás.
   */
  coastRadius(angle) {
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    // Dos escalas: bahías y cabos.
    //
    // La tercera octava, de frecuencia alta, se quitó: como el radio solo
    // depende del ángulo y no de la altura, cualquier detalle fino se extruye
    // hacia abajo y convierte el acantilado en una pared acanalada. El detalle
    // del corte lo pone `cliffLedges`, que sí varía con la altura.
    const wobble =
      this.noise.fbm(cx * 1.35, cz * 1.35, 5.5, 4, 2.1, 0.5) * 0.26 +
      this.noise.fbm(cx * 3.6, cz * 3.6, 12.1, 3, 2.4, 0.5) * 0.055;
    return WORLD.radius * (1 + wobble);
  }

  /** El promontorio a secas: la isla grande y su fondo. */
  _promontorio(x, z) {
    const d = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const edge = this.coastRadius(angle);

    // 1 tierra adentro, 0 mar afuera. La franja de transición es corta y la
    // potencia baja concentra casi todo el desnivel en ella: eso es lo que
    // produce una pared de acantilado en vez de una playa en pendiente.
    const land = Math.pow(smoothstep(edge + 3, edge - 30, d), 0.26);

    // Ondulación de la meseta: lomas amplias y limpias.
    //
    // El ruido de alta frecuencia va deliberadamente bajo: picaba las laderas
    // y a media distancia se leía como grano sucio, no como relieve. El
    // volumen lo tienen que dar las lomas grandes, no el picado.
    const rolling = this.noise.fbm(x * 0.0068, z * 0.0068, 1.7, 4, 2.05, 0.5);
    const ridges = this.noise.ridged(x * 0.0135, z * 0.0135, 8.3, 3, 2.3, 0.42);
    const micro = this.detail.fbm(x * 0.035, z * 0.035, 3.3, 2, 2.4, 0.45);

    // Un lado sube a colinas y el opuesto se abre al mar. Sin esta asimetría
    // el promontorio se lee como una isla-tortita vista desde cualquier
    // ángulo, que es justo lo que no queremos.
    const towardInland = Math.cos(angle - WORLD.inlandDirection);
    const inland = smoothstep(14, 165, d) * smoothstep(-0.1, 1.0, towardInland);

    let h = WORLD.plateau;
    h += rolling * 15;
    h += ridges * 3.2;
    h += micro * 0.35;
    h += inland * 46;

    // Plataforma litoral: el fondo se queda a poca profundidad en una franja
    // ancha antes de caer.
    //
    // Sin ella el acantilado bajaba de golpe a cuarenta metros y TODO el mar
    // visible era agua profunda: no había bajío donde el sol llegase al fondo,
    // así que ni el turquesa ni las cáusticas tenían dónde ocurrir. Ahora hay
    // unos noventa metros de repisa alrededor de la isla — que es también lo
    // que dibuja la orla clara que se ve desde el mirador.
    const shelf = lerp(-3.0, -46, smoothstep(edge + 4, edge + 96, d));
    const seabed = shelf - smoothstep(edge + 96, edge + 240, d) * 40;
    const surface = lerp(seabed, h, land);

    // Repisas del acantilado: solo actúan en la franja de caída, donde
    // `land * (1 - land)` es máximo. Rompen la extrusión limpia en cornisas y
    // salientes, que es lo que hace que un corte de roca parezca roca.
    const cliffBand = land * (1 - land) * 4;
    if (cliffBand < 0.01) return this._rasa(surface, d, edge);
    // Estratos, no acanaladuras.
    //
    // La frecuencia horizontal va deliberadamente muy baja y la vertical alta:
    // así el relieve son bandas que rodean el corte, como los estratos de un
    // acantilado sedimentario. Con las dos frecuencias parejas, el ruido creaba
    // columnas regulares y la pared se leía como tubos de órgano — que es el
    // mismo defecto que ya tenía por el ruido de la línea de costa, reaparecido
    // por otra vía.
    const ledges =
      this.noise.fbm(x * 0.006, surface * 0.155, z * 0.006, 3, 2.1, 0.5) * 0.74 +
      this.detail.fbm(x * 0.019, surface * 0.40, z * 0.019, 2, 2.3, 0.5) * 0.26;
    // La banda se ensancha para que los estratos cubran toda la pared en vez
    // de concentrarse en una franja a media altura.
    return this._rasa(surface + ledges * Math.pow(cliffBand, 0.55) * 10, d, edge);
  }

  /**
   * Rasa mareal: el rellano que el oleaje labra al pie del acantilado.
   *
   * No es un adorno geológico. Sin ella, `pow(land, 0.26)` levanta veinte
   * metros en menos de cuatro unidades horizontales, y la malla —1,35 m por
   * cuadro— dibuja esa pared como una escalera de peldaños de seis metros
   * recortada contra el agua. La rasa hace que el terreno cruce el nivel del
   * mar en HORIZONTAL en vez de en vertical, y ahí se acaba el dentado.
   *
   * Va al final, después de los estratos, porque si no el ruido de las repisas
   * abría boquetes en el rellano y volvía a meter roca bajo el agua.
   *
   * @param {number} y     Altura ya calculada, estratos incluidos.
   * @param {number} d     Distancia al centro de la isla.
   * @param {number} edge  Radio de la costa en ese ángulo.
   */
  _rasa(y, d, edge) {
    const inner = edge - 20;
    // El rellano sube despacio: apenas asoma junto al agua y gana altura hacia
    // el pie del acantilado.
    const height = lerp(0.8, 4.5, smoothstep(edge + 2, inner, d));
    // Manda mientras el terreno quede por encima; tierra adentro vuelve a
    // mandar el relieve de siempre.
    const blend = smoothstep(inner, inner - 24, d);
    return lerp(Math.min(y, height), y, blend);
  }

  /**
   * Segunda tierra mar adentro.
   *
   * Se compone con MÁXIMO sobre el promontorio, que es lo único que significa
   * «hay dos islas»: cada punto del mundo se queda con la más alta de las dos
   * superficies. Nada más hace falta — y como todo lo demás de este proyecto
   * pregunta la cota por `height()`, el islote existe de golpe para la malla,
   * para quien camina, para la hierba y para los espíritus, sin tocar ni uno
   * de esos ficheros.
   *
   * OJO CON EL SITIO: la malla del terreno es una baldosa de 520 × 520, o sea
   * de -260 a 260. Un islote que se salga de ahí no se teselaría y quedaría
   * un bulto en el campo de alturas que se puede pisar pero no se ve.
   */
  addIsla(x, z, radius, height, seed = 17) {
    this.islas.push({ x, z, radius, height, seed });
    return this;
  }

  /**
   * Bajío: una barra sumergida que levanta el fondo a lo largo de un segmento.
   *
   * Existe por la calzada. Entre el promontorio y el islote el fondo cae a
   * treinta y tantos metros, y una calzada megalítica sobre pilas de treinta
   * metros no es una calzada megalítica: es un viaducto. Con la barra el agua
   * del cruce se queda en tres metros —turquesa, con cáusticas, porque el
   * shader del mar ya sabe hacer bajío— y las pilas miden lo que mide un
   * hombre. Es además el motivo por el que alguien construiría ahí y no en
   * otro sitio.
   *
   * Se queda SIEMPRE bajo el agua: si asomara sería un istmo, y entonces la
   * calzada sobra.
   */
  addBajio(ax, az, bx, bz, { halfWidth = 7, blend = 9, depth = -3.2 } = {}) {
    this.bajios.push({ ax, az, bx, bz, halfWidth, blend, depth });
    return this;
  }

  /** Altura sin tener en cuenta las explanadas. */
  baseHeight(x, z) {
    const y = this._promontorio(x, z);
    if (this.islas.length === 0 && this.bajios.length === 0) return y;
    return Math.max(y, this._islotes(x, z), this._barras(x, z));
  }

  /**
   * Perfil de los islotes.
   *
   * NO es la receta del promontorio en pequeño, y ese fue el primer intento:
   * copiar `land` + `_rasa` con los mismos números daba un champiñón. La rasa
   * de la isla grande labra un rellano de veinte metros, que sobre un radio de
   * 168 es un detalle de orilla y sobre uno de 34 es media isla — salía un ala
   * plana de quince metros con un cono encima, como un sombrero.
   *
   * Aquí manda una CÚPULA: `1 - dn²` elevado a un exponente, que es una peña
   * redondeada de una pieza. El exponente decide de qué va el islote — por
   * debajo de 1 sale una aguja, por encima de 1,4 una loma— y con 1,15 sale una
   * peña de paredes francas y una plataforma pequeña arriba, que es donde cabe
   * el dolmen.
   */
  _islotes(x, z) {
    let mejor = -Infinity;
    for (const i of this.islas) {
      const d = Math.hypot(x - i.x, z - i.z);
      if (d > i.radius * 2.15) continue;
      const dn = d / i.radius;

      const domo = Math.pow(Math.max(0, 1 - dn * dn), 1.15);
      // El relieve se apaga hacia el borde: con amplitud constante, el ruido
      // abría boquetes por debajo del agua justo en la línea de costa y el
      // islote salía mordido.
      const relieve =
        (this.noise.fbm(x * 0.026, z * 0.026, i.seed, 3, 2.1, 0.5) * 0.22 +
          this.detail.fbm(x * 0.075, z * 0.075, i.seed + 3, 2, 2.3, 0.45) * 0.07) *
        i.height *
        (0.25 + 0.75 * domo);

      let y = i.height * domo + relieve;

      // Falda: fuera del islote se hunde por debajo del lecho, para perder
      // siempre el máximo contra el fondo de verdad. Ver `baseHeight`.
      //
      // Se tiende hasta dn = 1,9 y no hasta 1,45. Cayendo deprisa, la malla
      // —1,35 m por cuadro— dibujaba esa pared casi vertical como un anillo
      // plano justo bajo la superficie, y el islote se leía como un champiñón
      // recortado posado en el agua en vez de como una peña que sale del
      // fondo. Tendida, el apron llega a -36 a cuarenta y cinco metros y se
      // funde con el lecho de verdad, que anda por -45.
      y -= smoothstep(0.96, 1.9, dn) * 70;

      if (y > mejor) mejor = y;
    }
    return mejor;
  }

  /** Perfil de los bajíos. */
  _barras(x, z) {
    let mejor = -Infinity;
    for (const b of this.bajios) {
      const [, d] = this._onSegment(x, z, b);
      if (d > b.halfWidth + b.blend) continue;
      const k = smoothstep(b.halfWidth + b.blend, b.halfWidth, d);
      // Un rizo para que no sea una cinta recta de fondo de piscina.
      const rizo = this.detail.fbm(x * 0.032, z * 0.032, 41.7, 2, 2.2, 0.5) * 1.15;
      const y = lerp(-42, b.depth + rizo, k);
      if (y > mejor) mejor = y;
    }
    return mejor;
  }

  /**
   * Registra una explanada. Se resuelve su altura con `baseHeight` para que
   * el santuario se apoye en el terreno real y no flote ni se hunda.
   */
  addPad(x, z, radius, blend = 22, heightOverride = null) {
    const height = heightOverride ?? this.baseHeight(x, z);
    this.pads.push({ x, z, radius, blend, height });
    return height;
  }

  height(x, z) {
    let h = this.baseHeight(x, z);

    // Los cerros van ANTES que las explanadas, no después.
    //
    // Las explanadas existen para que los santuarios se asienten a nivel, así
    // que tienen que ser lo último que manda sobre su huella. Aplicando el cerro
    // encima, un bulto de radio 38 en (-64,-63) —a 43 m de Habilidades, o sea
    // solapado con su estrado— levantaba dos metros y medio bajo un borde del
    // enlosado y dejaba la plataforma en cuesta.
    for (const m of this.mounds) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d >= m.radius) continue;
      const t = 1 - d / m.radius;
      // Campana suave, deformada con ruido para que no se lea como una cúpula.
      // Sin el ruido el cerro canta a bulto puesto a mano desde cualquier lado.
      const bulto = t * t * (3 - 2 * t);
      h += m.height * bulto * (0.86 + this.detail.fbm(x * 0.045, z * 0.045, 5.1, 2, 2.1, 0.5) * 0.34);
    }

    // Explanadas.
    //
    // Se mezclan TODAS A LA VEZ, con peso normalizado, en vez de aplicarse una
    // detrás de otra. Encadenando lerps gana siempre la última que se procesa,
    // y con degradados de 24 m dos santuarios vecinos se pisan: Habilidades se
    // aplana a 65,8, pero la explanada de Trayectoria —a 48 m y 4,7 m más
    // abajo— le llegaba de refilón con peso 0,85 y le hundía la plataforma
    // hasta 61,9. Sus peldaños quedaban colgados dos metros y medio en el aire
    // por ese lado.
    //
    // El exponente inclina la mezcla hacia la explanada dominante sin llegar a
    // imponerla: subirlo lo suficiente para que una plataforma quede PLANA del
    // todo hace que su influencia se desvanezca en un metro, y entonces aparece
    // un cortado alrededor de cada santuario. Lo que sobra después de esto lo
    // resuelve el muro de contención del estrado, que es la respuesta correcta:
    // Trayectoria está al borde del escarpe, a 48 m de la plaza y 17 m por
    // encima, y las dos explanadas necesitarían 51 m de radio llano sumados. No
    // caben, y ninguna mezcla de terreno va a hacer que quepan.
    let hPad = 0;
    let sumaPesos = 0;
    let mando = 0;
    for (const pad of this.pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      const t = 1 - smoothstep(pad.radius, pad.radius + pad.blend, d);
      if (t <= 0) continue;
      const w = t * t * (3 - 2 * t);
      hPad += pad.height * w;
      sumaPesos += w;
      mando = Math.max(mando, w);
    }
    if (sumaPesos > 0) {
      // Un pelín de textura dentro de la explanada: plano perfecto = falso.
      const ripple = this.detail.fbm(x * 0.09, z * 0.09, 21.2, 2, 2, 0.5) * 0.16;
      h = lerp(h, hPad / sumaPesos + ripple, mando);
    }

    // Las trincheras van al final y solo restan: si una pudiera sumar, un
    // desmonte cuyo fondo quedara por encima del terreno se convertiría en un
    // terraplén y taparía justo lo que viene a destapar.
    for (const cut of this.cuts) {
      const [t, d] = this._onSegment(x, z, cut);
      if (d >= cut.halfWidth + cut.blend) continue;
      const w = 1 - smoothstep(cut.halfWidth, cut.halfWidth + cut.blend, d);
      const fondo = lerp(cut.floorA, cut.floorB, t);
      if (fondo < h) h = lerp(h, fondo, w);
    }
    return h;
  }

  /**
   * Altura del suelo para quien se mueve por el mundo, galerías incluidas.
   *
   * `height` describe la SUPERFICIE, y la cámara la usa para no colarse bajo
   * tierra. Con eso solo, un pasadizo es inaccesible por definición: el techo
   * de la galería está por debajo de la superficie, así que el tope empuja a la
   * cámara hacia arriba antes de que pueda entrar por la puerta.
   *
   * Aquí se comprueba si el punto cae dentro del volumen de alguna galería
   * —en planta y en altura— y, si cae, se devuelve el suelo de la galería en vez
   * del de la superficie. Por encima del cerro sigue mandando el terreno, que es
   * lo que evita que el pasadizo abra un pozo por el que se cuele quien pase por
   * arriba.
   *
   * @param {number} y Altura actual de quien pregunta.
   */
  walkHeight(x, z, y) {
    const h = this.height(x, z);
    for (const t of this.tunnels) {
      const [, d] = this._onSegment(x, z, t);
      if (d >= t.halfWidth) continue;
      if (y > t.floor + t.height || y < t.floor - 8) continue;
      return t.floor;
    }
    // Pasarelas: manda el tramo MÁS CERCANO, no el más alto.
    //
    // La primera versión hacía `max` sobre todos los tramos que cubrían el
    // punto, y está mal por una razón puramente geométrica: una pasarela es una
    // cadena de tramos cortos —uno por metro de escalinata— dentro de un
    // corredor ancho —2,3 m a cada lado—, así que un punto cae dentro de CINCO
    // tramos a la vez. `_onSegment` recorta la proyección a [0,1], de modo que
    // el tramo que empieza dos metros más adelante devuelve su cota de arranque
    // entera; con el máximo, ese es el que gana. Resultado: el suelo de la
    // escalinata iba un metro y pico por encima de donde toca y daba saltos de
    // 0,64 m al andar, que el modo a pie leía —correctamente— como un muro.
    //
    // Lo que se busca es la cota de la pasarela BAJO los pies, y eso es el tramo
    // cuya perpendicular pasa más cerca. Con tramos consecutivos casi alineados
    // hay empates, así que desempata el que tiene el punto más «dentro».
    let mejor = null;
    for (const w of this.walkways) {
      const [t, d] = this._onSegment(x, z, w);
      if (d >= w.halfWidth) continue;
      const dentro = 0.5 - Math.abs(t - 0.5);
      if (!mejor || d < mejor.d - 1e-4 || (d < mejor.d + 1e-4 && dentro > mejor.dentro)) {
        mejor = { d, dentro, piso: lerp(w.floorA, w.floorB, t) };
      }
    }
    // Y suben el suelo, nunca lo bajan: una pasarela por debajo del terreno
    // abriría una zanja invisible por la que colarse.
    return mejor ? Math.max(h, mejor.piso) : h;
  }

  /**
   * ¿Este punto cae sobre obra por la que se pasa —pasarela o galería?
   *
   * Lo pregunta el modo a pie para saber si un desnivel es un PELDAÑO o una
   * cuesta. Y se responde con la DECLARACIÓN, no comparando `walkHeight` con
   * `height`: ese atajo parece equivalente y no lo es, porque hay tramos de
   * escalinata que van a ras de terreno —al pie no hay nada que excavar ni que
   * terraplenar— y ahí las dos alturas coinciden. Con el atajo, los primeros
   * metros de la escalinata dejaban de contar como escalera y el límite de
   * pendiente los cerraba: no se podía ni empezar a subir.
   *
   * @param {number} y Altura de quien pregunta; solo la miran las galerías.
   */
  enFabrica(x, z, y = 0) {
    for (const w of this.walkways) {
      const [, d] = this._onSegment(x, z, w);
      if (d < w.halfWidth) return true;
    }
    for (const t of this.tunnels) {
      const [, d] = this._onSegment(x, z, t);
      if (d < t.halfWidth && y > t.floor - 8 && y < t.floor + t.height) return true;
    }
    return false;
  }

  /** Normal por diferencias finitas. Se usa para orientar piedras y hierba. */
  normal(x, z, eps = 1.2) {
    const hL = this.height(x - eps, z);
    const hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps);
    const hU = this.height(x, z + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  }

  /** Pendiente 0 = llano, 1 = pared. Sirve para decidir hierba vs roca. */
  slope(x, z) {
    return 1 - clamp(this.normal(x, z).y, 0, 1);
  }

  /**
   * Cuánta roca desnuda asoma en un punto (0 = prado, 1 = piedra viva).
   *
   * Vive aquí y no en el constructor de la malla porque la usan tres cosas
   * que tienen que coincidir: el color del terreno, dónde NO sembrar hierba
   * y dónde soltar cantos. Si cada una lo calculara a su manera, saldrían
   * matas de hierba creciendo sobre el afloramiento.
   */
  rockiness(x, z) {
    const bySlope = smoothstep(0.12, 0.34, this.slope(x, z));
    const h = this.height(x, z);
    const byShore = 1 - smoothstep(4, 18, h - WORLD.seaLevel);
    // Afloramientos: manchas de roca en pleno prado, como en la costa real.
    //
    // El umbral va alto. Con el anterior, la tierra vista cubría laderas
    // enteras y, en cuanto se le puso el ocre cálido que pide el estilo, el
    // promontorio se leía más como un secarral que como un prado: la mancha
    // parda pesa mucho más que el verde aunque ocupe lo mismo.
    const outcrop = smoothstep(
      0.58,
      0.82,
      this.detail.fbm(x * 0.028, z * 0.028, 13.1, 4, 2.2, 0.5) * 0.5 + 0.5
    );
    return clamp(Math.max(bySlope, byShore * 0.92, outcrop * 0.70), 0, 1);
  }

  /**
   * Altura de la SUPERFICIE DIBUJADA, no la analítica.
   *
   * El terreno se tesela como una rejilla de 384×384 sobre 520 unidades: la
   * malla solo toca `height()` en los vértices, y entre ellos su superficie es
   * la interpolación de los cuatro de la esquina. En una loma esa
   * interpolación queda por DEBAJO de la altura analítica; en una vaguada, por
   * encima. Con cuadros de 1,35 m la diferencia llega a varios decímetros.
   *
   * Cualquier cosa que tenga que apoyarse sobre el terreno dibujado —el
   * empedrado de los caminos, sin ir más lejos— tiene que preguntar por aquí.
   * Usando `height()`, la cinta se hundía bajo el suelo en medio recorrido y
   * solo asomaba en los tramos convexos.
   */
  meshHeight(x, z) {
    const step = TILE / SEGMENTS;
    const gx = (x + TILE / 2) / step;
    const gz = (z + TILE / 2) / step;
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gz);
    const fx = gx - i0;
    const fz = gz - j0;
    const at = (i, j) => this.height(i * step - TILE / 2, j * step - TILE / 2);
    const h00 = at(i0, j0);
    const h10 = at(i0 + 1, j0);
    const h01 = at(i0, j0 + 1);
    const h11 = at(i0 + 1, j0 + 1);
    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  /** ¿Hay suelo firme por encima del agua en este punto? */
  isLand(x, z, margin = 2) {
    return this.height(x, z) > WORLD.seaLevel + margin;
  }
}

/**
 * Malla del terreno. Mezcla dos juegos de texturas (césped y granito) según
 * la pendiente y la altura, con la mezcla precalculada por vértice.
 */
export function buildTerrain(field) {
  const geo = new THREE.PlaneGeometry(TILE, TILE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const rock = new Float32Array(pos.count);
  const tint = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = field.height(x, z);
    pos.setY(i, h);

    const byShore = 1 - smoothstep(4, 18, h - WORLD.seaLevel);
    rock[i] = field.rockiness(x, z);

    // El color de vértice MODULA la textura, no la sustituye: la textura ya
    // trae el verde de la hierba. Multiplicar aquí otro verde oscuro fue el
    // motivo de que el promontorio saliera casi negro.
    const exposure = smoothstep(WORLD.plateau - 10, WORLD.plateau + 40, h);
    const patch = field.detail.fbm(x * 0.011, z * 0.011, 77.3, 3, 2.2, 0.5) * 0.5 + 0.5;
    const light = lerp(0.72, 1.22, exposure * 0.62 + patch * 0.38);

    // Modulación casi neutra: el croma lo pone la textura. Con un tinte muy
    // verde encima, el prado se va a color de campo de golf.
    let r = light * 1.04;
    let g = light * lerp(1.02, 0.97, exposure);
    let b = light * 0.94;

    // Cerca del agua la hierba cede a arena y roca lavada: tono más cálido.
    if (byShore > 0.3) {
      const k = (byShore - 0.3) * 1.1;
      r = lerp(r, r * 1.22, k);
      g = lerp(g, g * 1.06, k);
      b = lerp(b, b * 0.94, k);
    }

    tint[i * 3] = r;
    tint[i * 3 + 1] = g;
    tint[i * 3 + 2] = b;
  }

  geo.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  geo.computeVertexNormals();

  const grassTex = turf({ seed: SEED + 4, repeat: 46 });
  // Poco liquen: en la pared del acantilado el verde del musgo ganaba a la
  // piedra y el corte se leía como una ladera de hierba en vertical.
  const rockTex = granite({ seed: SEED + 8, repeat: 34, lichen: 0.12 });

  const material = new THREE.MeshStandardMaterial({
    map: grassTex.map,
    normalMap: grassTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.96,
    metalness: 0,
    vertexColors: true,
    dithering: true,
  });
  material.name = 'terreno';

  material.userData.uniforms = {
    uRockMap: { value: rockTex.map },
    uRockNormal: { value: rockTex.normalMap },
    uRockColor: { value: new THREE.Color(PALETTE.earth) },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aRock;
         varying float vRock;
         varying vec3 vTerrainPos;
         varying vec3 vTerrainNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vRock = aRock;
         vTerrainPos = position;
         vTerrainNormal = normal;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uRockMap;
         uniform sampler2D uRockNormal;
         uniform vec3 uRockColor;
         varying float vRock;
         varying vec3 vTerrainPos;
         varying vec3 vTerrainNormal;

         /**
          * Muestreo triplanar de la roca.
          *
          * El césped se proyecta en planta y va bien porque el prado es casi
          * horizontal. La pared del acantilado no: proyectada en planta, cada
          * téxel se estira en vertical y el corte sale a rayas, como pana.
          * Mezclando las tres proyecciones por el peso de la normal, la piedra
          * mantiene su grano sea cual sea la inclinación.
          */
         vec4 rockTriplanar( sampler2D tex, float scale ) {
           vec3 n = normalize( vTerrainNormal );
           vec3 w = pow( abs( n ), vec3( 3.0 ) );
           w /= max( w.x + w.y + w.z, 1e-4 );
           return texture2D( tex, vTerrainPos.zy * scale ) * w.x
                + texture2D( tex, vTerrainPos.xz * scale ) * w.y
                + texture2D( tex, vTerrainPos.xy * scale ) * w.z;
         }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>

         // Rotura del mosaico del césped.
         //
         // La textura se repite cada 11 m y a ras de suelo se ve el patrón
         // repetirse como una tela de camuflaje. Se vuelve a muestrear a una
         // escala mucho mayor y girada, y se usa como modulación normalizada
         // alrededor de 1: rompe la repetición sin cambiar el color medio.
         // La ganancia está calibrada para que la luminancia media del prado
         // dé 1: así el remuestreo rompe la repetición sin cambiar el color
         // medio. Con la ganancia vieja (pensada para el verde apagado
         // anterior) el prado nuevo se oscurecía un tercio de forma constante.
         vec2 macroUv = vMapUv * 0.113 + vec2( 0.37, -0.21 );
         vec3 macro = texture2D( map, macroUv ).rgb;
         float macroLum = dot( macro, vec3( 0.2126, 0.7152, 0.0722 ) );
         diffuseColor.rgb *= mix( 1.0, macroLum * 4.2, 0.38 );

         // La roca se muestrea a otra escala para romper la del césped.
         vec4 rockTexel = rockTriplanar( uRockMap, 0.075 );
         rockTexel.rgb *= uRockColor * 1.10;
         diffuseColor.rgb = mix( diffuseColor.rgb, rockTexel.rgb, vRock );

         // Roca mojada de la rasa.
         //
         // Por debajo de la línea de pleamar la piedra está húmeda, y la piedra
         // húmeda es más oscura y más FRÍA, no más parda. Con el ocre de tierra
         // llegando hasta el agua, el rellano al pie del acantilado se leía
         // como una playa de barro pegada a un mar turquesa.
         float wet = 1.0 - smoothstep( 1.2, 7.5, vTerrainPos.y );
         diffuseColor.rgb = mix(
           diffuseColor.rgb,
           diffuseColor.rgb * vec3( 0.50, 0.60, 0.70 ),
           wet * max( vRock, 0.55 )
         );`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix( roughnessFactor, 0.78, vRock );`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
           vec3 grassN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
           vec3 rockN = rockTriplanar( uRockNormal, 0.075 ).xyz * 2.0 - 1.0;
           vec3 mapN = mix( grassN, rockN, vRock );
           mapN.xy *= normalScale;
           normal = normalize( tbn * mapN );
         #endif`
      );
  };

  // Cel shading encima de la mezcla césped/roca. Va después de asignar el
  // `onBeforeCompile` de arriba: `applyToonShading` encadena el que encuentre.
  // El suelo vira poco —la tabla de estaciones apenas lo mueve— pero tiene que
  // virar: con el prado pardo y el terreno verde de julio, el borde donde
  // acaba la hierba instanciada se convierte en una raya.
  applyToonShading(material, {
    ...TOON_PRESETS.terrain,
    cloudShadow: 0.42,
    key: 'terrain-macro',
    estacion: 'tierra',
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
