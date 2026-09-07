/**
 * El sonido de la isla, generado por código.
 *
 * No hay un solo fichero de audio en el proyecto y no lo va a haber. Todo sale
 * de ruido filtrado y de osciladores, sembrado desde `SEED` como la geometría,
 * porque un portafolio que presume de ser procedural no puede traerse el
 * ambiente en un .mp3 de dos megas. Y hay un motivo práctico además del
 * estético: **la pantalla de carga lleva desde el primer día recomendando
 * auriculares** y hasta ahora no sonaba absolutamente nada.
 *
 * Cinco voces, y cada una existe porque contesta a algo que se ve:
 *
 *  - **El mar** — sube según lo cerca que estés de la orilla, no según dónde
 *    estés en el mapa. Es la diferencia entre un bucle de fondo y un sitio: en
 *    mitad del promontorio se oye lejos, en la calzada del islote te rodea.
 *  - **El viento** — sube con la altura y con la estación. En la cima del
 *    escarpe en invierno es otra isla que en la plaza en verano.
 *  - **Los pasos** — atados al MISMO vaivén de cabeza que ya mueve la cámara,
 *    así que el pie suena cuando la cabeza baja. Y cambian de timbre según lo
 *    que se pisa: hierba o piedra.
 *  - **El fuego** del altar — con caída por distancia y estéreo, para que se
 *    pueda encontrar de oído.
 *  - **Los espíritus** — una nota cuando uno se te acerca. Es la única voz que
 *    no es ambiente: es información.
 *
 * ── Sobre el bucle ─────────────────────────────────────────────────────────
 *
 * Un buffer de ruido en bucle se delata en cuanto dura poco: el oído pilla el
 * patrón a la tercera vuelta. Aquí se combate por dos vías. Los buffers son
 * largos (diez segundos) y con las costuras fundidas (`_cerrarBucle`), y cada
 * voz suena en DOS copias del mismo buffer a velocidades inconmensurables
 * (1 y 0,73), así que el periodo compuesto no es de diez segundos sino de
 * varios minutos. Sale gratis: es el mismo buffer leído dos veces.
 */

import { SECTIONS, WORLD, daisOuterRadius } from '../config.js';
import { clamp, damp, makeRandom } from '../utils/noise.js';

/** Segundos de ruido por buffer. Ver la nota del cabecero sobre el bucle. */
const LARGO_RUIDO = 10;
/** Costura fundida al cerrar el bucle, en segundos. */
const COSTURA = 0.06;

/** Hasta dónde se busca la orilla, en metros. */
const ALCANCE_ORILLA = 210;
/** Rumbos del barrido que busca la orilla. Ver `_orilla`. */
const RUMBOS = 8;
/** Paso del barrido, en metros. */
const PASO_SONDEO = 7;

/**
 * Cuánto viento hace en cada estación, de 0 a 1.
 *
 * No es meteorología, es lo mismo que hace el resto del módulo de estaciones:
 * en invierno la isla tiene que sonar dura y en verano quieta. El valor entra
 * multiplicando a la ganancia, no sustituyéndola, así que nunca hay silencio.
 */
const VIENTO_ESTACION = { primavera: 0.55, verano: 0.4, otonio: 0.82, invierno: 1 };

/**
 * Escala pentatónica de las notas de los espíritus, en Hz.
 *
 * Pentatónica y no cromática por lo de siempre: cualquier par de notas de una
 * pentatónica suena bien junto, así que dos espíritus que se acerquen a la vez
 * no pueden producir un intervalo feo. Con doce notas disponibles sí podían.
 */
const NOTAS = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

export class Sonido {
  /**
   * @param {object} opciones
   * @param {import('../world/Terrain.js').TerrainField} opciones.field
   * @param {() => ({x:number,y:number,z:number}|null)} [opciones.fuego]
   *   Dónde arde el brasero, en coordenadas de mundo. Es una función y no un
   *   punto porque el santuario de Contacto se construye por etapas y cuando
   *   esto se crea puede no existir todavía.
   */
  constructor({ field, fuego = () => null } = {}) {
    this.field = field;
    this._fuego = fuego;

    this.ctx = null;
    this.listo = false;
    /** Silenciado por el visitante. Se recuerda entre visitas. */
    this.mudo = leerPreferencia();

    // Estado suavizado. Se amortigua AQUÍ, en JS, y no con rampas del audio:
    // así una teleportación —las pruebas hacen unas cuantas— no da un chasquido
    // y el valor que se lee en `medir()` es el que de verdad está sonando.
    this.g = { mar: 0, espuma: 0, viento: 0, silbo: 0, fuego: 0 };

    /** Distancia a la orilla, cacheada; ver `_orilla`. */
    this._orillaCache = { x: 1e9, z: 1e9, d: ALCANCE_ORILLA };
    /** Lo que mide cada rumbo del barrido, y cuántos quedan por refrescar. */
    this._rumbos = new Float32Array(RUMBOS).fill(ALCANCE_ORILLA);
    this._pendientes = 0;
    /** Fase del vaivén de cabeza en el último fotograma, para detectar el paso. */
    this._vaivenPrevio = 0;
    this._enSueloPrevio = true;
    this._proximoChasquido = 0;
    /** Espíritus que ya han sonado, hasta que se alejen del todo. */
    this._sonaron = new Set();

    this._rnd = makeRandom(9137);

    // Los discos enlosados, para saber qué se pisa. Sale de `DAIS`, que es la
    // fuente única del tamaño de los estrados: si alguien agranda uno, el
    // sonido del pie se agranda con él sin tocar nada aquí.
    this.enlosados = [{ x: 0, z: 0, r: daisOuterRadius('plaza') }];
    for (const s of SECTIONS) {
      const r = daisOuterRadius(s.id);
      if (r > 0) this.enlosados.push({ x: s.anchor[0], z: s.anchor[2], r });
    }

    this._onVisibilidad = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else if (!this.mudo) this.ctx.resume?.();
    };
    document.addEventListener('visibilitychange', this._onVisibilidad);
  }

  // ------------------------------------------------------------------ arranque

  /**
   * Enciende el audio. **Tiene que llamarse dentro de un gesto del visitante**
   * —el clic de Explorar— o el navegador crea el contexto en `suspended` y no
   * suena nada sin que falle nada, que es la peor forma de fallar.
   */
  arrancar() {
    if (this.ctx) {
      if (!this.mudo) this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return; // Sin Web Audio la isla sigue funcionando, muda.

    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;

    this.maestro = ctx.createGain();
    this.maestro.gain.value = 0;

    // Un analizador entre el maestro y la salida. No es depuración que se
    // quede colgada: es el único modo de PROBAR que esto suena, porque desde
    // fuera un `GainNode` con el valor correcto y un grafo desconectado se ven
    // exactamente igual. `tools/sonido-check.mjs` lee de aquí.
    this.analizador = ctx.createAnalyser();
    this.analizador.fftSize = 1024;
    this.analizador.smoothingTimeConstant = 0.4;
    this._espectro = new Float32Array(this.analizador.frequencyBinCount);
    this._onda = new Float32Array(this.analizador.fftSize);

    this.maestro.connect(this.analizador);
    this.analizador.connect(ctx.destination);

    this.ruido = bufferRuido(ctx, LARGO_RUIDO, 4211);
    this.chispa = bufferRuido(ctx, 0.5, 8803);

    this._construirMar();
    this._construirViento();
    this._construirFuego();

    this.listo = true;
    this.aplicarMudo();
  }

  /**
   * Para cuando no hay gesto que gastar.
   *
   * Se entra sin clic en un caso real: quien viene de pulsar «Ver en 3D» en la
   * versión ligera llega después de una recarga, y la recarga se comió la
   * activación. Aquí se deja armado el primer toque o la primera tecla, que es
   * lo que el navegador acepta como permiso.
   */
  armarPrimerGesto() {
    if (this.ctx) return;
    const abrir = () => {
      quitar();
      this.arrancar();
    };
    const quitar = () => {
      window.removeEventListener('pointerdown', abrir);
      window.removeEventListener('keydown', abrir);
    };
    window.addEventListener('pointerdown', abrir, { once: true });
    window.addEventListener('keydown', abrir, { once: true });
  }

  /** Dos capas del mismo ruido: el fondo grave y la espuma que rompe. */
  _construirMar() {
    const ctx = this.ctx;

    this.gMar = ctx.createGain();
    this.gMar.gain.value = 0;
    const graveFiltro = ctx.createBiquadFilter();
    graveFiltro.type = 'lowpass';
    graveFiltro.frequency.value = 480;
    graveFiltro.Q.value = 0.7;
    graveFiltro.connect(this.gMar);
    this.gMar.connect(this.maestro);
    bucle(ctx, this.ruido, graveFiltro, 1);
    bucle(ctx, this.ruido, graveFiltro, 0.73);

    this.gEspuma = ctx.createGain();
    this.gEspuma.gain.value = 0;
    const espumaFiltro = ctx.createBiquadFilter();
    espumaFiltro.type = 'bandpass';
    espumaFiltro.frequency.value = 1750;
    espumaFiltro.Q.value = 0.55;
    espumaFiltro.connect(this.gEspuma);
    this.gEspuma.connect(this.maestro);
    bucle(ctx, this.ruido, espumaFiltro, 1.31);
    bucle(ctx, this.ruido, espumaFiltro, 0.91);

    // El oleaje. Tres osciladores lentísimos sumados sobre la ganancia de la
    // espuma: el mar respira. Los periodos son primos entre sí a propósito
    // —12,7 s, 8,5 s y 4,7 s— para que la ola grande nunca caiga dos veces en
    // el mismo sitio. Va con osciladores y no con un seno calculado en JS
    // porque así corre en el hilo de audio: no le afectan los tirones ni que
    // la pestaña baje a 30 fps.
    this.oleaje = [];
    for (const [hz, prof] of [
      [0.0787, 0.55],
      [0.1176, 0.3],
      [0.2128, 0.15],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = prof;
      osc.connect(g);
      // Sobre la espuma con toda su profundidad y sobre el fondo con un tercio:
      // lo que sube y baja al romper una ola es el silbido, no el retumbe.
      g.connect(this._modulador(this.gEspuma, 1));
      g.connect(this._modulador(this.gMar, 0.3));
      osc.start();
      this.oleaje.push(osc);
    }
  }

  /**
   * Devuelve un nodo cuya salida se suma a la ganancia de `destino`.
   *
   * Un `AudioParam` suma todo lo que se le conecta AL VALOR automatizado, así
   * que la modulación y el valor base conviven sin pisarse. Pero la modulación
   * tiene que escalar con el volumen o el mar late a tope aunque esté lejos:
   * de ahí el rodeo — se guarda el nodo y su ganancia se ajusta cada fotograma
   * en proporción a la ganancia base.
   */
  _modulador(destino, escala) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(destino.gain);
    (this._moduladores ??= []).push({ nodo: g, destino, escala });
    return g;
  }

  _construirViento() {
    const ctx = this.ctx;

    this.gViento = ctx.createGain();
    this.gViento.gain.value = 0;
    this.vientoFiltro = ctx.createBiquadFilter();
    this.vientoFiltro.type = 'bandpass';
    this.vientoFiltro.frequency.value = 520;
    this.vientoFiltro.Q.value = 1.4;
    this.vientoFiltro.connect(this.gViento);
    this.gViento.connect(this.maestro);
    bucle(ctx, this.ruido, this.vientoFiltro, 0.55);
    bucle(ctx, this.ruido, this.vientoFiltro, 0.41);

    // La racha: la frecuencia del filtro pasea sola entre 320 y 900 Hz. Sin
    // esto el viento es un siseo plano, que es exactamente como suena el ruido
    // rosa de un tutorial y no como suena el aire.
    const racha = ctx.createOscillator();
    racha.frequency.value = 0.063;
    const rachaG = ctx.createGain();
    rachaG.gain.value = 290;
    racha.connect(rachaG);
    rachaG.connect(this.vientoFiltro.frequency);
    racha.start();
    this.racha = racha;

    // Y el silbo de altura: una resonancia estrecha que solo aparece arriba.
    // Es lo que separa estar en la plaza de estar en el escarpe.
    this.gSilbo = ctx.createGain();
    this.gSilbo.gain.value = 0;
    const silboFiltro = ctx.createBiquadFilter();
    silboFiltro.type = 'bandpass';
    silboFiltro.frequency.value = 1580;
    silboFiltro.Q.value = 7;
    silboFiltro.connect(this.gSilbo);
    this.gSilbo.connect(this.maestro);
    bucle(ctx, this.ruido, silboFiltro, 0.83);
  }

  _construirFuego() {
    const ctx = this.ctx;

    this.panFuego = ctx.createStereoPanner();
    this.panFuego.connect(this.maestro);

    this.gFuego = ctx.createGain();
    this.gFuego.gain.value = 0;
    this.gFuego.connect(this.panFuego);

    const rugido = ctx.createBiquadFilter();
    rugido.type = 'lowpass';
    rugido.frequency.value = 300;
    rugido.Q.value = 1.1;
    rugido.connect(this.gFuego);
    bucle(ctx, this.ruido, rugido, 1.17);
  }

  // -------------------------------------------------------------------- mudo

  alternarMudo() {
    this.mudo = !this.mudo;
    guardarPreferencia(this.mudo);
    this.aplicarMudo();
    return this.mudo;
  }

  aplicarMudo() {
    if (!this.ctx) return;
    const ahora = this.ctx.currentTime;
    // Un segundo y medio para entrar y un cuarto para salir. Asimétrico a
    // propósito: al encender, el ambiente tiene que aparecer sin que se note
    // el momento; al silenciar, quien lo pulsa quiere silencio ya.
    const objetivo = this.mudo ? 0 : 0.55;
    this.maestro.gain.cancelScheduledValues(ahora);
    this.maestro.gain.setValueAtTime(this.maestro.gain.value, ahora);
    this.maestro.gain.linearRampToValueAtTime(objetivo, ahora + (this.mudo ? 0.25 : 1.5));
    if (!this.mudo) this.ctx.resume?.();
  }

  // ------------------------------------------------------------------ update

  /**
   * @param {number} dt
   * @param {object} ctx
   * @param {THREE.Camera} ctx.camera
   * @param {string} ctx.modo            Modo de la cámara: orbit / free / walk.
   * @param {object} [ctx.walk]          El estado a pie del rig, tal cual.
   * @param {string} [ctx.estacion]      Id de la estación, para el viento.
   * @param {object} [ctx.espiritus]     La nube de espíritus, para las notas.
   */
  update(dt, { camera, modo = 'orbit', walk = null, estacion = 'verano', espiritus = null } = {}) {
    if (!this.listo || !camera) return;
    // Con el audio suspendido —pestaña oculta— no se programa nada: los
    // chasquidos del fuego se acumularían y sonarían todos de golpe al volver.
    if (this.ctx.state !== 'running') return;

    const p = camera.position;
    const paso = Math.min(dt, 0.1);

    // ── Mar ────────────────────────────────────────────────────────────────
    //
    // Manda la distancia a la orilla, no la posición. Y la altura resta: desde
    // el mirador a ciento noventa metros el mar es un fondo, no un vecino.
    const orilla = this._orilla(p.x, p.z);
    const cerca = 1 - clamp(orilla / 120, 0, 1);
    const altura = 1 - clamp((p.y - 12) / 90, 0, 0.75);
    this.g.mar = damp(this.g.mar, (0.1 + 0.34 * cerca * cerca) * altura, 1.6, paso);
    this.g.espuma = damp(this.g.espuma, 0.055 + 0.2 * Math.pow(cerca, 2.4) * altura, 1.6, paso);

    // ── Viento ─────────────────────────────────────────────────────────────
    const estacional = VIENTO_ESTACION[estacion] ?? 0.7;
    const arriba = clamp((p.y - 4) / 52, 0, 1);
    this.g.viento = damp(this.g.viento, (0.07 + 0.2 * arriba) * (0.55 + 0.65 * estacional), 1.2, paso);
    this.g.silbo = damp(this.g.silbo, 0.055 * Math.pow(arriba, 2) * estacional, 1.2, paso);

    // ── Fuego ──────────────────────────────────────────────────────────────
    const brasero = this._fuego();
    if (brasero) {
      const dx = brasero.x - p.x;
      const dz = brasero.z - p.z;
      const d = Math.hypot(dx, dz, brasero.y - p.y);
      // Caída inversa con radio de gracia: dentro de tres metros no crece más
      // —si no, asomarse al brasero revienta— y a treinta ya no se oye.
      const cae = clamp(1 - (d - 3) / 27, 0, 1);
      this.g.fuego = damp(this.g.fuego, 0.26 * cae * cae, 3, paso);
      this.panFuego.pan.value = this._pan(camera, dx, dz);
      if (cae > 0.02) this._chasquidos(cae);
    } else {
      this.g.fuego = damp(this.g.fuego, 0, 3, paso);
    }

    this._aplicar();

    // ── Pasos ──────────────────────────────────────────────────────────────
    if (modo === 'walk' && walk) this._pasos(walk, p);
    else this._vaivenPrevio = walk?.vaiven ?? 0;

    // ── Espíritus ──────────────────────────────────────────────────────────
    if (espiritus) this._sidhe(espiritus, camera);
  }

  /** Vuelca el estado suavizado a los nodos, incluida la profundidad del oleaje. */
  _aplicar() {
    const t = this.ctx.currentTime;
    // `setTargetAtTime` y no asignación directa: la constante es corta (30 ms)
    // así que sigue al valor de JS sin retraso audible, pero elimina el escalón
    // de un fotograma a otro, que a volumen alto se oye como un roce.
    const k = 0.03;
    this.gMar.gain.setTargetAtTime(this.g.mar, t, k);
    this.gEspuma.gain.setTargetAtTime(this.g.espuma, t, k);
    this.gViento.gain.setTargetAtTime(this.g.viento, t, k);
    this.gSilbo.gain.setTargetAtTime(this.g.silbo, t, k);
    this.gFuego.gain.setTargetAtTime(this.g.fuego, t, k);

    for (const m of this._moduladores) {
      const base = m.destino === this.gEspuma ? this.g.espuma : this.g.mar;
      m.nodo.gain.setTargetAtTime(base * m.escala, t, k);
    }
  }

  /**
   * Distancia horizontal a la orilla más cercana.
   *
   * Búsqueda radial: ocho rumbos, marchando de siete en siete metros hasta dar
   * agua. No es exacta —puede errar hasta tres metros y medio— y da igual:
   * alimenta una ganancia, no una colisión.
   *
   * Lo caro es que `field.height` es ruido de varias octavas: los doscientos
   * cuarenta sondeos de un barrido completo se midieron en **2,3 ms**, o sea
   * un séptimo del fotograma. Cacheándolo cada tres metros la media salía bien
   * (0,05 ms) pero el pico seguía ahí: un fotograma largo por segundo yendo a
   * pie, que es exactamente el tirón que nadie sabe de dónde viene.
   *
   * Así que se hacen las dos cosas. Se refresca cada tres metros —andando, una
   * vez por segundo— y ese refresco se REPARTE en ocho fotogramas, uno por
   * rumbo. El pico baja a treinta sondeos y la media no se mueve. Mientras se
   * barre se sigue usando el valor anterior, que tiene ocho fotogramas de
   * antigüedad: trece centésimas de segundo y medio metro de camino.
   */
  _orilla(x, z) {
    const c = this._orillaCache;
    if (this._pendientes === 0 && Math.hypot(x - c.x, z - c.z) >= 3) {
      // El barrido entero se mide desde el MISMO punto, el de ahora. Midiendo
      // cada rumbo desde donde estuviera el oyente en ese fotograma, los ocho
      // números no describirían ningún sitio.
      c.x = x;
      c.z = z;
      this._pendientes = RUMBOS;
    }
    if (this._pendientes > 0) {
      const i = RUMBOS - this._pendientes;
      const ang = (i / RUMBOS) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      let d = ALCANCE_ORILLA;
      for (let r = 0; r < ALCANCE_ORILLA; r += PASO_SONDEO) {
        if (this.field.height(c.x + dx * r, c.z + dz * r) < WORLD.seaLevel) {
          d = r;
          break;
        }
      }
      this._rumbos[i] = d;
      if (--this._pendientes === 0) {
        let m = ALCANCE_ORILLA;
        for (let k = 0; k < RUMBOS; k++) m = Math.min(m, this._rumbos[k]);
        c.d = m;
      }
    }
    return c.d;
  }

  /** Estéreo: −1 a la izquierda, +1 a la derecha, según hacia dónde se mira. */
  _pan(camera, dx, dz) {
    // El vector «derecha» de la cámara sobre el plano. Se saca del cuaternión
    // como en el rig, y con el mismo cuidado: `adelante × arriba` es (−z, 0, x)
    // para Y arriba, no (z, 0, −x). Con el signo cambiado el fuego suena a la
    // izquierda cuando arde a la derecha.
    const q = camera.quaternion;
    // adelante = (0,0,−1) rotado por q, componentes x y z.
    const fx = -2 * (q.x * q.z + q.w * q.y);
    const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const rx = -fz;
    const rz = fx;
    const n = Math.hypot(dx, dz) || 1;
    return clamp((rx * dx + rz * dz) / n, -1, 1) * 0.8;
  }

  /**
   * Un pie cada vez que la cabeza toca abajo.
   *
   * Se cuelga del vaivén QUE YA EXISTE (`walk.vaiven`, radianes de camino
   * andado, un ciclo cada 1,1 m) en vez de llevar su propio reloj. Es la
   * diferencia entre que el sonido acompañe a la imagen y que vayan cada uno
   * por su lado: el mínimo de `sin(vaiven)` es el instante en que la cámara
   * está más baja, y ahí es donde cae el pie.
   */
  _pasos(w, p) {
    const previo = this._vaivenPrevio;
    const actual = w.vaiven;
    this._vaivenPrevio = actual;

    // Aterrizaje: pisada fuerte, aunque no toque por fase.
    if (w.enSuelo && !this._enSueloPrevio) this._pisar(p, 1.5);
    this._enSueloPrevio = w.enSuelo;
    if (!w.enSuelo) return;

    // ¿Se ha cruzado algún mínimo (3π/2 + 2πk) entre los dos fotogramas?
    const k0 = Math.floor((previo - Math.PI * 1.5) / (Math.PI * 2));
    const k1 = Math.floor((actual - Math.PI * 1.5) / (Math.PI * 2));
    if (k1 <= k0) return;

    const rapidez = Math.hypot(w.velocity.x, w.velocity.z);
    this._pisar(p, clamp(rapidez / w.paso, 0.35, 1.35));
  }

  /** @param {number} fuerza  1 es un paso normal andando. */
  _pisar(p, fuerza) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const piedra = this._esPiedra(p.x, p.z, p.y);
    const r = this._rnd;

    const src = ctx.createBufferSource();
    src.buffer = this.chispa;
    // Cada paso con su velocidad: sin esto son veinte disparos idénticos por
    // minuto y suena a metralleta, que es el defecto clásico de los pasos.
    src.playbackRate.value = (piedra ? 1.5 : 1) * (0.85 + r() * 0.3);

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    // La piedra es un golpe seco y agudo; la hierba, un roce ancho y sordo.
    filtro.frequency.value = piedra ? 900 + r() * 500 : 1900 + r() * 900;
    filtro.Q.value = piedra ? 1.6 : 0.7;

    const g = ctx.createGain();
    const pico = (piedra ? 0.15 : 0.1) * fuerza;
    const cola = piedra ? 0.1 : 0.16;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pico, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cola);

    src.connect(filtro);
    filtro.connect(g);
    g.connect(this.maestro);
    src.start(t);
    src.stop(t + cola + 0.02);
    // Los nodos de un disparo se recogen solos cuando la fuente termina, pero
    // solo si nadie los referencia: por eso no se guardan en ninguna lista.
  }

  /**
   * ¿Se está pisando piedra?
   *
   * Dos fuentes, y hacen falta las dos. `enFabrica` cubre lo que está
   * declarado como obra en el campo de alturas —la calzada del islote, la
   * pasarela de la escalinata, la galería del pasadizo—, y los discos de
   * `DAIS` cubren los estrados enlosados, que no son pasarelas sino explanadas
   * y por tanto no aparecen ahí.
   */
  _esPiedra(x, z, y) {
    if (this.field.enFabrica(x, z, y)) return true;
    for (const d of this.enlosados) {
      if (Math.hypot(x - d.x, z - d.z) < d.r) return true;
    }
    return false;
  }

  /** Chasquidos del brasero: ráfagas cortas a intervalos irregulares. */
  _chasquidos(cerca) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t < this._proximoChasquido) return;
    // Entre 60 y 260 ms, más seguidos cuanto más cerca: de lejos solo llegan
    // los golpes fuertes, que es lo que hace el aire de verdad.
    this._proximoChasquido = t + 0.06 + this._rnd() * 0.2 * (1.4 - cerca);

    const r = this._rnd;
    const src = ctx.createBufferSource();
    src.buffer = this.chispa;
    src.playbackRate.value = 1.6 + r() * 1.8;

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 700 + r() * 2600;
    filtro.Q.value = 2 + r() * 6;

    const g = ctx.createGain();
    const pico = 0.05 * cerca * (0.3 + r() * r() * 1.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pico, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + r() * 0.05);

    src.connect(filtro);
    filtro.connect(g);
    g.connect(this.panFuego);
    src.start(t);
    src.stop(t + 0.16);
  }

  /**
   * La nota de un espíritu que se acerca.
   *
   * Con histéresis: suena al entrar en nueve metros y no vuelve a sonar hasta
   * que ese mismo espíritu sale de dieciséis. Sin el segundo umbral, uno que
   * se quede rondando el borde dispara una nota por fotograma.
   */
  _sidhe(espiritus, camera) {
    const cerca = espiritus.masCercano?.(camera.position);
    if (!cerca) return;
    const { indice, distancia } = cerca;

    if (distancia > 16) this._sonaron.delete(indice);
    if (distancia > 9 || this._sonaron.has(indice)) return;
    this._sonaron.add(indice);

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const r = this._rnd;
    const base = NOTAS[Math.floor(r() * NOTAS.length)];

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);

    const pan = ctx.createStereoPanner();
    const b = espiritus.bichos?.[indice];
    if (b) pan.pan.value = this._pan(camera, b.pos.x - camera.position.x, b.pos.z - camera.position.z);
    g.connect(pan);
    pan.connect(this.maestro);

    // Dos senos: la nota y su quinta, la segunda a un tercio. Un seno solo
    // suena a pitido de test; con la quinta suena a campana.
    for (const [mult, vol] of [
      [1, 1],
      [1.5, 0.33],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * mult;
      const gv = ctx.createGain();
      gv.gain.value = vol;
      osc.connect(gv);
      gv.connect(g);
      osc.start(t);
      osc.stop(t + 2);
    }
  }

  // ------------------------------------------------------------------ medida

  /**
   * Lo que está sonando de verdad, para `tools/sonido-check.mjs`.
   *
   * Devuelve las ganancias —que prueban la lógica— y además la energía real
   * del analizador repartida en tres bandas, que es lo único que prueba que el
   * grafo está conectado. Las dos cosas, porque en un navegador sin tarjeta de
   * sonido la segunda puede salir a cero sin que nada esté roto.
   */
  medir() {
    if (!this.listo) return null;
    this.analizador.getFloatTimeDomainData(this._onda);
    let suma = 0;
    for (let i = 0; i < this._onda.length; i++) suma += this._onda[i] * this._onda[i];

    this.analizador.getFloatFrequencyData(this._espectro);
    const nyq = this.ctx.sampleRate / 2;
    const bin = (hz) => Math.min(this._espectro.length - 1, Math.round((hz / nyq) * this._espectro.length));
    const banda = (a, b) => {
      let s = 0;
      let n = 0;
      for (let i = bin(a); i <= bin(b); i++, n++) s += this._espectro[i];
      return n ? s / n : -140;
    };

    return {
      estado: this.ctx.state,
      mudo: this.mudo,
      maestro: this.maestro.gain.value,
      rms: Math.sqrt(suma / this._onda.length),
      graves: banda(40, 400),
      medios: banda(400, 2000),
      agudos: banda(2000, 8000),
      ganancias: { ...this.g },
      orilla: this._orillaCache.d,
    };
  }

  dispose() {
    document.removeEventListener('visibilitychange', this._onVisibilidad);
    try {
      this.ctx?.close();
    } catch {
      /* cerrar un contexto ya cerrado no es un problema */
    }
    this.ctx = null;
    this.listo = false;
  }
}

// ─────────────────────────────────────────────────────────────── utilidades

/** Una fuente en bucle del buffer dado, ya arrancada. */
function bucle(ctx, buffer, destino, velocidad) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = velocidad;
  src.connect(destino);
  // Arranque desfasado: dos copias del mismo ruido empezando en la misma
  // muestra son la misma señal amplificada, no dos capas.
  src.start(0, Math.random() * buffer.duration);
  return src;
}

/**
 * Ruido rosa determinista, con el bucle cerrado.
 *
 * Rosa y no blanco porque el blanco tiene tanta energía en agudos que suena a
 * televisor sin señal; el rosa reparte igual por octava, que es como reparten
 * el mar, el viento y el fuego. El filtro es el de Paul Kellet, siete polos,
 * que es el estándar de facto para esto.
 */
function bufferRuido(ctx, segundos, semilla) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * segundos);
  const extra = Math.floor(sr * COSTURA);
  const total = n + extra;

  const crudo = new Float32Array(total);
  const r = makeRandom(semilla);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let pico = 1e-6;
  for (let i = 0; i < total; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    crudo[i] = v;
    if (Math.abs(v) > pico) pico = Math.abs(v);
  }

  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const k = 0.9 / pico;
  for (let i = 0; i < n; i++) d[i] = crudo[i] * k;

  // Cerrar la costura: las `extra` muestras que sobran son la continuación
  // natural del final, y se funden sobre el principio. Así la muestra n−1
  // enlaza con la 0 sin escalón y el bucle no da el chasquido de cada vuelta,
  // que es lo que delata un buffer corto antes incluso que el patrón.
  for (let i = 0; i < extra; i++) {
    const t = i / extra;
    d[i] = d[i] * t + crudo[n + i] * k * (1 - t);
  }
  return buf;
}

const CLAVE = 'portafolio:sonido';

function leerPreferencia() {
  try {
    return localStorage.getItem(CLAVE) === 'mudo';
  } catch {
    return false; // Sin almacenamiento se arranca con sonido, como todos.
  }
}

function guardarPreferencia(mudo) {
  try {
    localStorage.setItem(CLAVE, mudo ? 'mudo' : 'suena');
  } catch {
    /* modo privado: la preferencia dura lo que la visita */
  }
}
