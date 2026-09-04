/**
 * Orquestador: monta el render, construye el mundo por etapas y conecta la
 * interfaz con la cámara.
 *
 * El bucle principal vive aquí y es el único sitio donde se avanza el tiempo.
 * Todo lo demás recibe `dt` — así una pausa o un cambio de velocidad se hace
 * en un solo punto.
 */

import * as THREE from 'three';
// La interfaz del promontorio viaja con el motor: quien elige PANEL no la
// descarga. Los cimientos comunes están en `ui/base.css`, que carga `main.js`.
import '../ui/escena.css';
import { PostFX } from './PostFX.js';
import { World } from '../world/World.js';
import { CameraRig } from '../nav/CameraRig.js';
import { Interaction } from '../nav/Interaction.js';
import { esTactil, MandoTactil } from '../nav/MandoTactil.js';
import { construirColisionadores } from '../nav/Colliders.js';
import { Overlay } from '../ui/Overlay.js';
import { tickMaterials } from '../vfx/materials.js';
import { aplicarEscena, catalogar } from '../editor/registro.js';
import { seVieneDePulsarEntrar } from '../modo.js';
import { HOME_VIEW, SECTIONS, QUALITY, WORLD } from '../config.js';
import { clamp } from '../utils/noise.js';

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

export class Experience {
  constructor(canvas) {
    this.canvas = canvas;
    // Reloj propio en vez de THREE.Clock, que está marcado como obsoleto y
    // avisa por consola en cada carga. Solo hacen falta dos líneas.
    this._lastTime = 0;
    this.running = false;
    this.activeSection = null;
    this.elapsed = 0;

    this._frameTimes = [];
    this._perfTimer = 0;
    this._autoQualityChecked = false;
  }

  // ------------------------------------------------------------------ inicio

  async boot() {
    this.quality = this._detectQuality();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const parametros = new URLSearchParams(location.search);
    /** Sin animación de cámara. Lo activa la herramienta de capturas. */
    this.instantCamera = parametros.has('instant');
    /**
     * Modo edición: gizmo, panel y guardado al proyecto.
     *
     * Solo en desarrollo, y no por prudencia sino por definición: guardar
     * necesita el servidor de Vite escuchando. En la build el `import.meta.env.DEV`
     * es una constante falsa, así que el editor entero —incluido
     * `TransformControls`— se cae del bundle en vez de viajar de acompañante.
     */
    this.editMode = import.meta.env.DEV && parametros.has('editor');

    this.overlay = new Overlay({
      onEnter: () => this.enter(),
      onNavigate: (id) => this.goTo(id),
      onToggleFree: () => this.toggleFreeFlight(),
      onToggleWalk: () => this.toggleWalk(),
      onPanelClose: () => this.clearSelection(),
      onTimeOfDay: (id) => this.world?.time?.set(id),
    });

    // Aquí ya no se comprueba WebGL: si esta clase se ha llegado a importar es
    // porque `modo.js` decidió la versión plena, y esa decisión incluye
    // comprobarlo. Preguntarlo dos veces era tener dos sitios que podían
    // discrepar sobre qué se puede dibujar.
    this._setupRenderer();

    // Las fuentes tienen que estar cargadas antes de pintar los rótulos:
    // si no, los canvas salen con la serif del sistema y ya no se rehacen.
    try {
      await document.fonts.ready;
    } catch {
      /* sin API de fuentes: se usa la de respaldo y seguimos */
    }

    await this._buildWorld();
    this._setupNavigation();
    this._bindKeys();
    if (this.editMode) await this._setupEditor();

    // Un clic, no dos. Quien viene de pulsar «Ver en 3D» en la versión ligera
    // ya ha pedido entrar: enseñarle la portada con un botón «Explorar» es
    // hacerle repetir la decisión que acaba de tomar.
    //
    // Y se consulta ANTES de `ready()`, no después: `ready()` destapa el botón
    // y le da el foco, así que entrar a continuación lo dejaría aparecer y
    // desaparecer en el mismo fotograma. Un parpadeo pequeño, pero justo en el
    // sitio donde el visitante está mirando.
    const entrarSolo = seVieneDePulsarEntrar();
    if (!entrarSolo) this.overlay.ready();
    this.start();
    // El vuelo lo avanza el bucle, así que esto va después de `start()`.
    if (entrarSolo) this.enter({ gesto: false });

    return true;
  }

  /**
   * El editor se carga a la carta.
   *
   * `import()` dinámico y no estático: así el gizmo, el panel y su hoja de
   * estilos solo se descargan cuando de verdad se va a editar, y en la build ni
   * siquiera existen.
   */
  async _setupEditor() {
    // La guarda envuelve al PROPIO `import()`, no solo a la llamada.
    //
    // Con el `if` fuera, `this.editMode` es una propiedad y Rollup no puede
    // demostrar que siempre es falsa, así que emitía igualmente el trozo del
    // editor en `dist/` — no llegaba a descargarse nunca, pero ahí estaba.
    // Aquí `import.meta.env.DEV` es la constante `false` en la build, la
    // condición se pliega y el editor entero desaparece del bundle.
    if (!import.meta.env.DEV) return;
    const { Editor } = await import('../editor/Editor.js');
    this.editor = new Editor(this);
    this.editor.montar();
  }

  /** Calidad inicial a partir del dispositivo; luego se corrige midiendo. */
  _detectQuality() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const cores = navigator.hardwareConcurrency ?? 4;
    const lowMemory = (navigator.deviceMemory ?? 8) <= 4;
    if ((coarse && small) || cores <= 4 || lowMemory) return 'low';
    return 'high';
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // el antialiasing lo hace el SMAA del composer
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    // Mapeado lineal, no ACES.
    //
    // ACES es una curva en S: comprime las luces altas y desatura al subir de
    // nivel. Eso es justo lo contrario de lo que pide un fondo pintado — las
    // bandas planas del cel shading dejan de ser planas y el verde se lava en
    // cuanto le da el sol. El fichero de referencia trabaja con la vista
    // «Standard» de Blender por el mismo motivo. Lineal solo escala y recorta,
    // así que una banda plana sigue plana.
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    // PCFSoft está marcado como obsoleto en three 0.185 y cae a PCF igual.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.5,
      3200
    );
    this.camera.position.set(...HOME_VIEW.position);
    this.camera.lookAt(new THREE.Vector3(...HOME_VIEW.target));

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, {
      quality: this.quality,
    });

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    // Si se pierde el contexto (cambio de GPU, pestaña dormida) hay que
    // recuperarlo o el lienzo se queda en negro para siempre.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.running = false;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.running = true;
      this._lastTime = performance.now();
    });
  }

  _pixelRatio() {
    const cap = this.quality === 'high' ? QUALITY.pixelRatioCap : 1.25;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  /**
   * Construcción por etapas cediendo el hilo entre una y otra: así la barra
   * de carga avanza de verdad y el navegador no marca la pestaña como colgada.
   */
  async _buildWorld() {
    this.world = new World(this.scene, { quality: this.quality });
    const steps = this.world.buildSteps();

    for (let i = 0; i < steps.length; i++) {
      this.overlay.setProgress(i / steps.length, steps[i].label);
      // Dos frames: uno para pintar la barra, otro para que se vea.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      steps[i].run();
    }
    // El ciclo de día se engancha con el mundo ya montado: necesita el cielo,
    // el mar y la hierba construidos, y además el renderizador y el
    // post-proceso, que el mundo no conoce.
    const time = this.world.attachTimeOfDay({ renderer: this.renderer, postfx: this.postfx });
    this.overlay.setTimePhases(World.phases, time.current);

    // Catálogo de piezas y anulaciones guardadas.
    //
    // Va aquí y no antes porque casi todo este mundo se DERIVA del campo de
    // alturas: las piezas tienen que existir, en el sitio que les calculó su
    // función, para poder corregirlas. Y va siempre, no solo en modo edición —
    // lo que se guardó una vez tiene que verse también en la web publicada.
    this.catalogo = catalogar(this.scene);
    aplicarEscena();

    this.overlay.setProgress(1, 'Listo');

    // Compilar aquí evita el tirón de un segundo la primera vez que cada
    // material entra en cuadro.
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  _setupNavigation() {
    this.rig = new CameraRig(this.camera, this.canvas, this.world.field);
    // Cuerpo contra la piedra, solo para el modo a pie. Se construye DESPUÉS de
    // aplicar las anulaciones del editor: si una piedra se ha movido a mano, se
    // choca donde está ahora y no donde la dejó la semilla.
    this.rig.walk.colisionadores = construirColisionadores(this.scene);
    this.rig.snapTo(this.homeView);
    this.rig.enabled = false; // hasta que se pulse "Explorar"

    // El mando a pie, solo donde manda el dedo. Se cuelga de `#ui` para que
    // desaparezca con el resto de la interfaz, y se enseña y se esconde con
    // el aviso de cambio de modo del propio rig: así da igual por dónde se
    // entre o se salga —la tecla C, el menú, Esc o el botón Salir—, que hay
    // un solo sitio que decide si el mando se ve.
    if (esTactil()) {
      this.mando = new MandoTactil(this.rig, { onSalir: () => this.toggleWalk() });
      this.mando.montar(this.overlay.ui);
      this.rig.onModo = (modo) => this.mando.mostrar(modo === 'walk');
    }

    this.interaction = new Interaction(this.camera, this.canvas, this.world.hotspotObjects);
    this.interaction.enabled = false;
    this.interaction.onSelect.add((hotspot) => this._onSelect(hotspot));
    this.interaction.onHoverChange.add((object) => {
      const hotspot = object?.userData?.hotspot;
      this.overlay.setTooltip(hotspot ? hotspot.title : null);
    });
  }

  _bindKeys() {
    this._onKey = (e) => {
      // No robar el teclado mientras se escribe en el formulario.
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (this.overlay.helpOpen) return this.overlay.toggleHelp(false);
        if (this.overlay.panelOpen) {
          this.overlay.close();
          return this.clearSelection();
        }
        if (this.rig.enPrimeraPersona) {
          this.overlay.setTooltip(null);
          return this.rig.setMode('orbit');
        }
        return this.goTo(null);
      }
      if (e.key === '?' || (e.key === 'h' && !e.ctrlKey && !e.metaKey)) {
        return this.overlay.toggleHelp(!this.overlay.helpOpen);
      }
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
        return this.toggleFreeFlight();
      }
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        return this.toggleWalk();
      }
      const index = Number(e.key);
      if (Number.isInteger(index) && index >= 1 && index <= SECTIONS.length) {
        return this.goTo(SECTIONS[index - 1].id);
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  // ------------------------------------------------------------------- flujo

  /**
   * Mueve la cámara a una vista. Un solo sitio decide si se vuela o se salta,
   * para que `prefers-reduced-motion` no haya que recordarlo en cada llamada.
   */
  _moveCamera(view, duration, onArrive) {
    if (this.reducedMotion || this.instantCamera) {
      this.rig.snapTo(view);
      onArrive?.();
      return;
    }
    this.rig.travelTo({ ...view, duration, onArrive });
  }

  /** La vista del mirador, a la que se vuelve con Esc o pulsando el logo. */
  get homeView() {
    const home = new THREE.Vector3(...HOME_VIEW.position);
    const target = new THREE.Vector3(...HOME_VIEW.target);
    const flat = Math.hypot(home.x - target.x, home.z - target.z);
    return {
      target,
      distance: flat,
      height: home.y - target.y,
      azimuth: Math.atan2(home.x - target.x, home.z - target.z),
    };
  }

  /**
   * Rumbo con el que se aterriza en la plaza: tierra adentro.
   *
   * Sale de `WORLD.inlandDirection` y no de un número a mano, que es la misma
   * regla que sigue la vista de bienvenida. Mirando al otro lado solo hay mar:
   * de espaldas a la isla, el primer fotograma a pie no cuenta nada.
   */
  get rumboDeEntrada() {
    return Math.atan2(-Math.cos(WORLD.inlandDirection), -Math.sin(WORLD.inlandDirection));
  }

  /**
   * Dónde se pone el pie al aterrizar: dentro del corro, pero NO en el centro.
   *
   * En el centro exacto está el altar, y con la cámara a altura de ojos su losa
   * se come media pantalla — el primer fotograma del portafolio era un primer
   * plano de una piedra. Retrasando el punto once metros contra la dirección de
   * tierra adentro, el visitante sigue dentro del círculo, tiene el altar
   * delante a media distancia y por encima de él ve el escarpe, Trayectoria y la
   * escalinata. Que es lo que hay que enseñar.
   */
  get puntoDeEntrada() {
    // Once metros dejaban una piedra del corro interior —que va a radio ocho—
    // justo delante y a tres metros: media pantalla de granito liso. A catorce
    // queda a seis, que es la distancia a la que una piedra de tres metros se
    // lee como piedra y no como pared.
    const r = 14;
    return {
      x: Math.cos(WORLD.inlandDirection + Math.PI) * r,
      z: Math.sin(WORLD.inlandDirection + Math.PI) * r,
    };
  }

  /**
   * Entrada desde la pantalla de carga: vuelo de presentación que ACABA de pie.
   *
   * El vuelo no se quita. Enseña el promontorio entero, que es lo que ninguna
   * vista a ras de suelo puede hacer, y al terminar deja al visitante plantado
   * en el centro del corro de trilitos. Descender hasta posarse dentro del
   * círculo es lo que convierte la presentación en una llegada.
   *
   * El bloqueo del puntero se pide AQUÍ, dentro del gesto del clic, y no al
   * final del vuelo: es un permiso con caducidad: a los cinco segundos el
   * navegador ya no lo concede y el ratón no giraría la cabeza.
   *
   * @param {object} opts
   * @param {boolean} [opts.gesto] ¿Se está entrando desde un clic? Cuando se
   *   entra solo —porque el visitante venía de pulsar «Ver en 3D» en la versión
   *   ligera— no hay gesto que gastar: la recarga se comió la activación. Pedir
   *   el puntero ahí no es que falle discretamente, es que el navegador lo
   *   rechaza y escribe el rechazo en la consola.
   */
  enter({ gesto = true } = {}) {
    this.overlay.enter();
    this.rig.enabled = true;
    this.interaction.enabled = true;
    this.overlay.setActive(null);

    // En modo captura se entra como siempre: las seis vistas guionizadas y las
    // herramientas de vuelo dependen de la órbita.
    if (this.instantCamera) {
      this.rig.snapTo(this.homeView);
      return;
    }

    const plantar = () => {
      const p = this.puntoDeEntrada;
      this.rig.plantar(p.x, p.z, this.rumboDeEntrada);
      // Sin puntero capturado, lo primero que hay que decir es cómo mirar: sin
      // eso el visitante aterriza, mueve el ratón y no pasa nada.
      this.overlay.setTooltip(
        gesto
          ? 'A pie · W A S D · Mayús para correr · Esc para salir'
          : 'Pulsa para mirar alrededor · W A S D para andar · Esc para salir'
      );
    };

    if (this.reducedMotion) {
      plantar();
      return;
    }

    if (gesto) this.canvas.requestPointerLock?.();

    const view = this.homeView;
    // Arranca alto y lejos y desciende: el promontorio se presenta entero antes
    // de que el visitante se meta dentro.
    this.rig.snapTo({
      target: view.target,
      distance: view.distance * 2.4,
      height: view.height * 3.4,
      azimuth: view.azimuth - 0.62,
    });
    this.rig.travelTo({
      target: new THREE.Vector3(0, this.world.field.height(0, 0), 0),
      distance: 13,
      height: 6,
      azimuth: this.rumboDeEntrada + Math.PI,
      duration: 4.6,
      onArrive: plantar,
    });
  }

  /** Ponerse de pie / volver a la órbita. */
  toggleWalk() {
    if (!this.rig) return;
    if (this.rig.mode === 'walk') {
      this.rig.setMode('orbit');
      this.overlay.setTooltip(null);
      return;
    }
    this.rig.setMode('walk');
    this.overlay.close();
    this.overlay.setTooltip(
      esTactil()
        ? 'A pie · palanca para andar · arrastra para mirar'
        : 'A pie · W A S D · Mayús para correr · Esc para salir'
    );
  }

  /** @param {string|null} id  null = volver al mirador central. */
  goTo(id) {
    if (!this.rig) return;
    if (this.rig.enPrimeraPersona) this.rig.setMode('orbit');

    if (!id) {
      this.activeSection = null;
      this.world.setActiveSection(null);
      this.overlay.setActive(null);
      this.overlay.close();
      this._moveCamera(this.homeView, 2.8);
      return;
    }

    const def = SECTION_BY_ID[id];
    const shrine = this.world.getShrine(id);
    if (!def || !shrine) return;

    this.activeSection = id;
    this.world.setActiveSection(id);
    this.overlay.setActive(id);

    this._moveCamera(
      {
        target: shrine.focusPoint,
        distance: def.view.distance,
        height: def.view.height,
        azimuth: def.view.azimuth,
      },
      2.6,
      () => this.overlay.open(id)
    );
  }

  toggleFreeFlight() {
    if (!this.rig) return;
    this.rig.setMode(this.rig.mode === 'free' ? 'orbit' : 'free');
    this.overlay.setTooltip(
      this.rig.mode === 'free' ? 'Vuelo libre · W A S D · Esc para salir' : null
    );
    if (this.rig.mode === 'free') this.overlay.close();
  }

  clearSelection() {
    // Cerrar el panel no saca de la sección: solo deja de resaltar la ficha.
  }

  _onSelect(hotspot) {
    if (!hotspot) return;

    // Al pulsar algo, la cámara se acerca a su sección si no estaba ya.
    if (hotspot.shrine && hotspot.shrine !== this.activeSection) {
      const def = SECTION_BY_ID[hotspot.shrine];
      const shrine = this.world.getShrine(hotspot.shrine);
      this.activeSection = hotspot.shrine;
      this.world.setActiveSection(hotspot.shrine);
      this.overlay.setActive(hotspot.shrine);
      this.rig.travelTo({
        target: shrine.focusPoint,
        distance: def.view.distance,
        height: def.view.height,
        azimuth: def.view.azimuth,
        duration: 2.2,
      });
    }

    switch (hotspot.kind) {
      case 'about':
        this.overlay.open('about');
        break;
      case 'project':
        this.overlay.open('project', hotspot.payload);
        break;
      case 'skill':
        this.overlay.open('skill', hotspot.payload);
        break;
      case 'experience':
        this.overlay.open('experience', { index: hotspot.milestone?.index ?? -1 });
        break;
      case 'contact':
        this.overlay.open('contact');
        break;
      case 'link':
        if (hotspot.payload?.href) {
          window.open(hotspot.payload.href, '_blank', 'noopener,noreferrer');
        } else {
          this.overlay.open('contact');
        }
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------- ciclo

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._loop = () => {
      this._frame = requestAnimationFrame(this._loop);
      this.tick();
    };
    this._frame = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._frame);
  }

  tick() {
    if (!this.running) return;
    // Tope al delta: si la pestaña vuelve de estar dormida, un salto de
    // varios segundos dispararía todas las animaciones a la vez. El tope es
    // generoso (100 ms) para que en un equipo lento la escena vaya con menos
    // fluidez pero no a cámara lenta.
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    this.elapsed += dt;

    tickMaterials(dt);
    this.rig?.update(dt);
    this.interaction?.invalidate();
    this.interaction?.update();

    this.world.update(dt, {
      camera: this.camera,
      hovered: this.interaction?.hovered ?? null,
      activeSection: this.activeSection,
      focus: this.rig?.smooth.target,
    });

    this.postfx.render(dt);
    this._trackPerformance(dt);
  }

  /**
   * Vigila el ritmo real y baja la calidad si el equipo no da. Vale más un
   * portafolio fluido y algo más simple que uno bonito a 15 fps.
   */
  _trackPerformance(dt) {
    this._frameTimes.push(dt);
    if (this._frameTimes.length > 90) this._frameTimes.shift();
    this._perfTimer += dt;
    if (this._perfTimer < 0.5) return;
    this._perfTimer = 0;

    const avg = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
    const fps = Math.round(1 / avg);
    this.overlay.setPerf(`${fps} fps`);

    if (!this._autoQualityChecked && this._frameTimes.length >= 90 && this.elapsed > 8) {
      this._autoQualityChecked = true;
      // En modo captura no se degrada: la herramienta corre sobre WebGL
      // por software y siempre daría por malo cualquier equipo.
      if (fps < 34 && this.quality === 'high' && !this.instantCamera) this._downgrade();
    }
  }

  _downgrade() {
    this.quality = 'low';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.15));
    this.postfx.bloom.strength = 0.45;
    this.renderer.shadowMap.enabled = false;
    // Los materiales cacheados hay que recompilarlos para perder la sombra.
    this.scene.traverse((o) => {
      if (o.isMesh && o.material) o.material.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(width, height, false);
    this.postfx.setSize(width, height);
    this.interaction?.invalidate();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    this.rig?.dispose();
    this.interaction?.dispose();
    this.postfx?.dispose();
    this.renderer?.dispose();
  }
}
