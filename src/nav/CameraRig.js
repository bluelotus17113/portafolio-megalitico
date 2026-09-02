/**
 * Cámara: órbita amortiguada, viajes cinemáticos, vuelo libre y paseo a pie.
 *
 * Todo se guarda en coordenadas esféricas alrededor de un punto de interés
 * (`target`, `distance`, `azimuth`, `polar`). Tener una sola representación
 * hace que un viaje cinemático sea interpolar cuatro números, y que salir del
 * vuelo libre sea reconstruir esos cuatro números desde la pose actual.
 *
 * Los tres modos:
 *
 *  - **`orbit`** — el de siempre. Se gira alrededor de un monumento.
 *  - **`free`** — vuelo de dron, sin gravedad ni cuerpo. Es una herramienta:
 *    con él se han hecho todas las capturas de la documentación.
 *  - **`walk`** — primera persona con los pies en el suelo. No es `free` con la
 *    Y bloqueada: tiene altura de ojos, cuerpo que choca contra la piedra y —lo
 *    que de verdad cambia el sitio— **límite de pendiente**. Por el escarpe de
 *    veintiún metros no se sube, así que para llegar a Habilidades hay que dar
 *    con la escalinata. La isla deja de ser un decorado y pasa a tener rutas.
 *
 * `free` y `walk` comparten el estado de mirada y de teclas (`this.free`),
 * porque el ratón y el teclado se leen igual en los dos.
 */

import * as THREE from 'three';
import { clamp, damp } from '../utils/noise.js';
import { WORLD } from '../config.js';

const MIN_POLAR = 0.16;
const MAX_POLAR = Math.PI / 2 - 0.045; // nunca por debajo del horizonte
const MIN_DISTANCE = 6;
const MAX_DISTANCE = 320;
const GROUND_CLEARANCE = 2.6;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera, domElement, field) {
    this.camera = camera;
    this.dom = domElement;
    this.field = field;

    this.target = new THREE.Vector3(0, 22, -10);
    this.distance = 190;
    this.azimuth = Math.PI / 2;
    this.polar = 1.05;

    // Valores suavizados: lo que la cámara usa de verdad cada frame.
    this.smooth = {
      target: this.target.clone(),
      distance: this.distance,
      azimuth: this.azimuth,
      polar: this.polar,
    };

    this.mode = 'orbit';
    this.enabled = true;
    this.idleDrift = true;
    this.idleTimer = 0;

    this.travel = null;

    // Vuelo libre. Guarda también la mirada y las teclas del modo a pie: los
    // dos son primera persona y leen la entrada igual.
    this.free = {
      yaw: 0,
      pitch: 0,
      velocity: new THREE.Vector3(),
      keys: new Set(),
      speed: 34,
      boost: 2.6,
      pointerLocked: false,
    };

    // A pie.
    this.walk = {
      /** De los pies a los ojos. */
      ojos: 1.72,
      /**
       * Metros por segundo andando; con Mayús se multiplica.
       *
       * Estaba en 5,4 y 2,0, o sea 5,18 m/s medidos andando y 10,35 corriendo:
       * dieciocho y treinta y siete kilómetros por hora. Andar era ya correr y
       * correr era más rápido que un plusmarquista, y con la isla midiendo 336
       * metros de lado a lado se cruzaba en medio minuto. De ahí venía la
       * sensación de patinar en vez de andar.
       *
       * 3,4 es un paso vivo y 6,0 una carrera de verdad; el promontorio se
       * sigue cruzando en menos de un minuto, que es lo que se necesitaba.
       */
      paso: 3.4,
      carrera: 1.75,
      velocity: new THREE.Vector3(),
      /**
       * Caída en curso, m/s. Se acumula con la gravedad mientras no haya suelo
       * bajo los pies y se pone a cero al tocarlo.
       */
      caida: 0,
      /** Radio del cuerpo para chocar con la piedra. */
      radio: 0.45,
      /**
       * Tangente de la pendiente máxima que se sube.
       *
       * 0,62 es el número que hace que la isla tenga rutas. La escalinata a
       * Habilidades está al 52 %, así que pasa; el escarpe que tiene al lado
       * ronda el 90 % y no. Subirlo por encima de 0,9 volvería la escalinata
       * decorativa — se podría trepar el talud pelado que hay al lado y no
       * habría hecho falta construirla.
       */
      pendienteMax: 0.62,
      /**
       * Cuánto se sube de golpe sin preguntar por la pendiente.
       *
       * Hace falta o la escalinata queda intransitable: una contrahuella de
       * 36 cm es, localmente, un salto vertical, y cualquier prueba de
       * pendiente la lee como una pared. Con 0,55 se suben los peldaños y los
       * escalones del estrado, y sigue sin poder escalarse un talud.
       */
      escalon: 0.55,
      /** Fase del vaivén de la cabeza, en radianes de camino andado. */
      vaiven: 0,
      /** Desfase vertical que aporta el vaivén ahora mismo, en metros. */
      bamboleo: 0,
      colisionadores: null,
    };

    this._pointers = new Map();
    this._pinchDistance = 0;
    this._dragging = false;
    this._panning = false;

    this._bind();
  }

  // ---------------------------------------------------------------- entrada

  _bind() {
    const dom = this.dom;
    dom.style.touchAction = 'none';

    this._onPointerDown = (e) => {
      if (!this.enabled) return;
      if (this.enPrimeraPersona) {
        // Red de seguridad: el bloqueo del puntero se pierde solo —al cambiar
        // de pestaña, al pulsar Esc, o si el navegador no lo concedió en su
        // momento— y sin él el ratón deja de girar la cabeza. Un clic en la
        // escena lo recupera, que es lo que cualquiera intenta primero.
        if (!this.free.pointerLocked) dom.requestPointerLock?.();
        return;
      }
      dom.setPointerCapture?.(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._dragging = true;
      this._panning = e.button === 2 || e.shiftKey;
      this._cancelTravel();
      this.idleTimer = 0;
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    this._onPointerMove = (e) => {
      if (this.enPrimeraPersona) {
        if (!this.free.pointerLocked) return;
        this.free.yaw -= e.movementX * 0.0022;
        this.free.pitch = clamp(this.free.pitch - e.movementY * 0.0022, -1.35, 1.35);
        return;
      }
      if (!this._dragging || !this._pointers.has(e.pointerId)) return;

      const prev = this._pointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.idleTimer = 0;

      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDistance > 0) {
          this.distance = clamp(this.distance * (this._pinchDistance / d), MIN_DISTANCE, MAX_DISTANCE);
        }
        this._pinchDistance = d;
        return;
      }

      if (this._panning) {
        this._pan(dx, dy);
      } else {
        const speed = 0.0042;
        this.azimuth -= dx * speed;
        this.polar = clamp(this.polar - dy * speed, MIN_POLAR, MAX_POLAR);
      }
    };

    this._onPointerUp = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) {
        this._dragging = false;
        this._panning = false;
        this._pinchDistance = 0;
      }
    };

    this._onWheel = (e) => {
      if (!this.enabled || this.enPrimeraPersona) return;
      e.preventDefault();
      this._cancelTravel();
      this.idleTimer = 0;
      const factor = Math.exp(clamp(e.deltaY, -220, 220) * 0.0012);
      this.distance = clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    };

    this._onContextMenu = (e) => e.preventDefault();

    this._onKeyDown = (e) => {
      this.free.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.free.keys.add('Shift');
    };
    this._onKeyUp = (e) => {
      this.free.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.free.keys.delete('Shift');
    };
    this._onBlur = () => this.free.keys.clear();

    this._onPointerLockChange = () => {
      this.free.pointerLocked = document.pointerLockElement === this.dom;
      if (!this.free.pointerLocked && this.enPrimeraPersona) this.setMode('orbit');
    };

    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }

  _pan(dx, dy) {
    const scale = this.distance * 0.0016;
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dx * scale);
    this.target.addScaledVector(forward, -dy * scale);
    this._clampTarget();
  }

  _clampTarget() {
    const limit = WORLD.radius * 1.5;
    const d = Math.hypot(this.target.x, this.target.z);
    if (d > limit) {
      this.target.x *= limit / d;
      this.target.z *= limit / d;
    }
    const ground = this.field.height(this.target.x, this.target.z);
    this.target.y = clamp(this.target.y, ground - 4, ground + 90);
  }

  // ----------------------------------------------------------------- viajes

  /**
   * Vuelo cinemático a una vista. `height` es cuánto se eleva la cámara
   * sobre el punto de interés a la distancia horizontal indicada.
   */
  travelTo({ target, distance, height, azimuth, duration = 2.4, onArrive = null }) {
    const to = {
      target: target.clone(),
      distance: Math.hypot(distance, height),
      azimuth,
      polar: clamp(Math.atan2(distance, height), MIN_POLAR, MAX_POLAR),
    };

    // Toma el camino corto en azimut; si no, la cámara da la vuelta larga.
    const from = {
      target: this.smooth.target.clone(),
      distance: this.smooth.distance,
      azimuth: this.smooth.azimuth,
      polar: this.smooth.polar,
    };
    let delta = to.azimuth - from.azimuth;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    to.azimuth = from.azimuth + delta;

    // Arco de subida: la cámara se eleva a medio camino, como un dron.
    const travelDistance = from.target.distanceTo(to.target);
    const lift = clamp(travelDistance * 0.28, 0, 70);

    this.travel = { from, to, t: 0, duration, lift, onArrive };
    return this.travel;
  }

  /**
   * Coloca la cámara en una vista sin animación.
   *
   * Lo usan tres cosas: `prefers-reduced-motion` (a quien le marea el vuelo
   * no debería tragárselo), los enlaces directos a una sección, y la
   * herramienta de capturas, que necesita un encuadre determinista.
   */
  snapTo({ target, distance, height, azimuth }) {
    this._cancelTravel();
    this.target.copy(target);
    this.distance = Math.hypot(distance, height);
    this.azimuth = azimuth;
    this.polar = clamp(Math.atan2(distance, height), MIN_POLAR, MAX_POLAR);
    this.smooth.target.copy(this.target);
    this.smooth.distance = this.distance;
    this.smooth.azimuth = this.azimuth;
    this.smooth.polar = this.polar;
    this.idleTimer = 0;
    this._applyOrbit();
  }

  _cancelTravel() {
    if (this.travel) {
      this.travel = null;
    }
  }

  isTravelling() {
    return this.travel !== null;
  }

  // ------------------------------------------------------------------ modos

  /** `free` y `walk` son los dos modos de primera persona. */
  get enPrimeraPersona() {
    return this.mode === 'free' || this.mode === 'walk';
  }

  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'free' || mode === 'walk') {
      this._cancelTravel();
      // Reconstruye yaw/pitch desde la pose actual para no dar un salto.
      const dir = new THREE.Vector3().subVectors(this.target, this.camera.position).normalize();
      this.free.yaw = Math.atan2(-dir.x, -dir.z);
      this.free.pitch = Math.asin(clamp(dir.y, -1, 1));
      this.free.velocity.set(0, 0, 0);
      this.walk.velocity.set(0, 0, 0);
      if (mode === 'walk') {
        // Al ponerse de pie la mirada se endereza: entrar a pie mirando al
        // cielo o a los pies desorienta, y el visitante no ha pedido ese
        // encuadre — venía de una órbita.
        this.free.pitch = clamp(this.free.pitch, -0.35, 0.2);
        this._posarEnSuelo();
      }
      this.dom.requestPointerLock?.();
    } else {
      document.exitPointerLock?.();
      // Reconstruye la órbita mirando hacia delante desde donde quedó.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.distance = clamp(this.distance, MIN_DISTANCE, MAX_DISTANCE);
      this.target.copy(this.camera.position).addScaledVector(forward, this.distance);
      this._clampTarget();
      this.azimuth = Math.atan2(this.camera.position.x - this.target.x, this.camera.position.z - this.target.z);
      const dy = this.camera.position.y - this.target.y;
      const dh = Math.hypot(this.camera.position.x - this.target.x, this.camera.position.z - this.target.z);
      this.polar = clamp(Math.atan2(dh, dy), MIN_POLAR, MAX_POLAR);
      this.smooth.target.copy(this.target);
      this.smooth.distance = this.distance;
      this.smooth.azimuth = this.azimuth;
      this.smooth.polar = this.polar;
    }
    this.mode = mode;
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    if (!this.enabled) return;
    if (this.mode === 'free') {
      this._updateFree(dt);
      return;
    }
    if (this.mode === 'walk') {
      this._updateWalk(dt);
      return;
    }

    if (this.travel) {
      const tr = this.travel;
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      const e = easeInOutCubic(tr.t);
      this.target.lerpVectors(tr.from.target, tr.to.target, e);
      this.distance = THREE.MathUtils.lerp(tr.from.distance, tr.to.distance, e);
      this.azimuth = THREE.MathUtils.lerp(tr.from.azimuth, tr.to.azimuth, e);
      this.polar = THREE.MathUtils.lerp(tr.from.polar, tr.to.polar, e);
      // La elevación extra sube y baja: describe un arco, no una recta.
      this.distance += Math.sin(e * Math.PI) * tr.lift * 0.5;
      this.target.y += Math.sin(e * Math.PI) * tr.lift * 0.35;

      // Durante el viaje seguimos la trayectoria sin amortiguación extra.
      this.smooth.target.copy(this.target);
      this.smooth.distance = this.distance;
      this.smooth.azimuth = this.azimuth;
      this.smooth.polar = this.polar;

      if (tr.t >= 1) {
        const cb = tr.onArrive;
        this.travel = null;
        // El estado se queda en el destino limpio, sin el arco.
        this.target.copy(tr.to.target);
        this.distance = tr.to.distance;
        this.azimuth = tr.to.azimuth;
        this.polar = tr.to.polar;
        cb?.();
      }
    } else {
      this.idleTimer += dt;
      // Deriva lenta cuando nadie toca nada: la escena nunca está muerta.
      if (this.idleDrift && this.idleTimer > 6) {
        this.azimuth += dt * 0.012 * Math.min(1, (this.idleTimer - 6) / 3);
      }
      const k = 7.5;
      this.smooth.target.x = damp(this.smooth.target.x, this.target.x, k, dt);
      this.smooth.target.y = damp(this.smooth.target.y, this.target.y, k, dt);
      this.smooth.target.z = damp(this.smooth.target.z, this.target.z, k, dt);
      this.smooth.distance = damp(this.smooth.distance, this.distance, k, dt);
      this.smooth.azimuth = damp(this.smooth.azimuth, this.azimuth, k, dt);
      this.smooth.polar = damp(this.smooth.polar, this.polar, k, dt);
    }

    this._applyOrbit();
  }

  _applyOrbit() {
    const s = this.smooth;
    const sinP = Math.sin(s.polar);
    const pos = new THREE.Vector3(
      s.target.x + s.distance * sinP * Math.sin(s.azimuth),
      s.target.y + s.distance * Math.cos(s.polar),
      s.target.z + s.distance * sinP * Math.cos(s.azimuth)
    );

    // No atravesar el suelo: si la órbita mete la cámara bajo tierra, sube.
    const ground = this.field.height(pos.x, pos.z) + GROUND_CLEARANCE;
    if (pos.y < ground) pos.y = ground;

    this.camera.position.copy(pos);
    this.camera.lookAt(s.target);
  }

  // ------------------------------------------------------------------- a pie

  /** Deja la cámara con los pies en el suelo, donde esté. */
  _posarEnSuelo() {
    const p = this.camera.position;
    p.y = this._suelo(p.x, p.z, p.y) + this.walk.ojos;
  }

  /**
   * Cota del suelo transitable.
   *
   * `walkHeight` y no `height`, y esto es justo para lo que se escribió: dentro
   * del pasadizo el suelo es el de la galería y no el del cerro que tiene
   * encima, y sobre la escalinata es la huella del peldaño y no la ladera
   * excavada que hay debajo.
   */
  _suelo(x, z, y) {
    return this.field.walkHeight(x, z, y);
  }

  /**
   * Coloca al visitante de pie en un punto, mirando en una dirección.
   *
   * @param {number} x
   * @param {number} z
   * @param {number} rumbo  Radianes; 0 mira hacia −Z.
   */
  plantar(x, z, rumbo = 0) {
    const y = this._suelo(x, z, 1e4) + this.walk.ojos;
    this.camera.position.set(x, y, z);
    this.free.yaw = rumbo;
    this.free.pitch = -0.05;
    this.free.velocity.set(0, 0, 0);
    this.walk.velocity.set(0, 0, 0);
    this.walk.vaiven = 0;
    this._cancelTravel();
    this.mode = 'walk';
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.free.pitch, rumbo, 0, 'YXZ'));
  }

  /**
   * ¿Se puede pasar de un punto a otro andando?
   *
   * **Donde hay obra manda la obra; donde solo hay tierra manda la pendiente.**
   *
   * Esa es toda la regla, y hace falta escribirla así porque la versión
   * evidente no funciona. La primera fue «si lo que sube cabe en un escalón, se
   * pasa; si no, que decida la pendiente», y con ella se escalaba el escarpe
   * entero sin despeinarse: andando a 5,4 m/s con pasos de 50 ms se avanzan
   * 27 cm por fotograma, así que **por una ladera del 90 % se suben 24 cm por
   * paso** — por debajo de la tolerancia de escalón de 55 cm. El permiso del
   * escalón se concedía siempre y la prueba de pendiente no llegaba a
   * ejecutarse nunca. Un límite que no se alcanza no es un límite.
   *
   * Lo que distingue un peldaño de un talud no es cuánto suben, es qué son. Un
   * peldaño es fábrica, y la fábrica está DECLARADA en el campo de alturas
   * (`enFabrica`): la escalinata registra su pasarela y el pasadizo su galería.
   * Se pregunta por la declaración y no comparando `walkHeight` con `height`,
   * que parece equivalente y no lo es — al pie de la escalinata no hay nada que
   * excavar ni que terraplenar, las dos alturas coinciden, y con el atajo esos
   * primeros metros dejaban de contar como escalera: no se podía ni empezar a
   * subir.
   *
   * Sobre tierra virgen decide la normal del terreno, no la diferencia de
   * alturas entre fotogramas: dividir la subida por lo andado en un fotograma
   * ata la física a los fps, y en un equipo lento el paso es más largo, el
   * cociente sale menor y se escalan taludes que en otro equipo eran pared.
   */
  _sePuedePisar(x, z, sueloActual, y) {
    const suelo = this._suelo(x, z, y);
    // Bajar siempre se puede. Lo que se está decidiendo es si se TREPA.
    if (suelo <= sueloActual) return suelo;

    // ¿Hay obra bajo los pies? Entonces es un peldaño, no una cuesta.
    if (this.field.enFabrica(x, z, y)) {
      return suelo - sueloActual <= this.walk.escalon ? suelo : null;
    }

    const n = this.field.normal(x, z);
    const tangente = Math.hypot(n.x, n.z) / Math.max(1e-4, n.y);
    return tangente <= this.walk.pendienteMax ? suelo : null;
  }

  _updateWalk(dt) {
    const f = this.free;
    const w = this.walk;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);

    // Adelante y derecha APLANADOS: se anda por el suelo, no hacia donde se
    // mira. Mirando al cielo, con el vector sin aplanar, avanzar te frena.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    const wish = new THREE.Vector3();
    if (f.keys.has('KeyW') || f.keys.has('ArrowUp')) wish.add(forward);
    if (f.keys.has('KeyS') || f.keys.has('ArrowDown')) wish.sub(forward);
    if (f.keys.has('KeyD') || f.keys.has('ArrowRight')) wish.add(right);
    if (f.keys.has('KeyA') || f.keys.has('ArrowLeft')) wish.sub(right);

    const andando = wish.lengthSq() > 0;
    const velocidad = w.paso * (f.keys.has('Shift') ? w.carrera : 1);
    if (andando) wish.normalize().multiplyScalar(velocidad);

    // Arranque y frenada con algo de peso, pero mucho más secos que en vuelo:
    // un cuerpo no derrapa.
    w.velocity.x = damp(w.velocity.x, wish.x, 11, dt);
    w.velocity.z = damp(w.velocity.z, wish.z, 11, dt);

    const pos = this.camera.position;
    const sueloActual = this._suelo(pos.x, pos.z, pos.y);

    // Los dos ejes se prueban por separado: así, al chocar de refilón contra
    // una cuesta, se resbala a lo largo de ella en vez de quedarse clavado.
    const paso = new THREE.Vector3(w.velocity.x * dt, 0, w.velocity.z * dt);
    let suelo = sueloActual;
    const intentar = (dx, dz) => {
      const nx = pos.x + dx;
      const nz = pos.z + dz;
      const destino = this._sePuedePisar(nx, nz, suelo, pos.y);
      if (destino === null) return false;
      pos.x = nx;
      pos.z = nz;
      suelo = destino;
      return true;
    };
    if (paso.x !== 0 && !intentar(paso.x, 0)) w.velocity.x = 0;
    if (paso.z !== 0 && !intentar(0, paso.z)) w.velocity.z = 0;

    // Cuerpo contra la cantería.
    if (w.colisionadores?.resolver(pos, w.radio, w.ojos)) {
      suelo = this._suelo(pos.x, pos.z, pos.y);
    }

    // No salirse de la isla.
    const limite = WORLD.radius * 1.02;
    const d = Math.hypot(pos.x, pos.z);
    if (d > limite) {
      pos.x *= limite / d;
      pos.z *= limite / d;
      suelo = this._suelo(pos.x, pos.z, pos.y);
    }

    // El bamboleo del fotograma anterior se deshace ANTES de mirar el suelo.
    //
    // Si no, se realimenta: la altura se amortigua hacia el suelo partiendo de
    // una posición que ya lleva el bamboleo dentro, así que el bamboleo se
    // mezcla con el seguimiento del terreno y ninguna de las dos cosas mide lo
    // que dice medir. Quitándolo y volviéndolo a poner, `pos.y` es siempre la
    // altura real de los ojos y el bamboleo es sólo lo que se ve.
    pos.y -= w.bamboleo;

    // ── Altura: subir se suaviza, bajar se cae ──────────────────────────────
    //
    // Antes las dos cosas eran la misma amortiguación exponencial, y eso da
    // dos defectos a la vez. Subiendo, la cámara se quedaba hasta 2,15 m por
    // debajo del suelo cuando el terreno pegaba un salto —al pisar la
    // escalinata, al entrar en un enlosado— y se veía nadar. Y bajando, una
    // exponencial no cae: se posa, cada vez más despacio, como un ascensor.
    // Nadie ha bajado nunca un escalón así.
    const objetivo = suelo + w.ojos;

    if (objetivo >= pos.y) {
      // Subiendo. Se suaviza deprisa —un peldaño tiene que leerse como un
      // peldaño, no como una rampa— y con un tope al retraso: si el suelo da
      // un salto grande, la cámara lo sigue en vez de quedarse enterrada.
      pos.y = damp(pos.y, objetivo, 30, dt);
      if (objetivo - pos.y > 0.45) pos.y = objetivo - 0.45;
      w.caida = 0;
    } else {
      // Cayendo. Gravedad de videojuego, más viva que la real: con 9,8 m/s²
      // los saltitos de veinte centímetros de la cantería se sienten lunares.
      w.caida = Math.min(w.caida + 22 * dt, 26);
      pos.y = Math.max(objetivo, pos.y - w.caida * dt);
      if (pos.y - objetivo < 1e-4) {
        pos.y = objetivo;
        w.caida = 0;
      }
    }

    // ── Vaivén de la cabeza ─────────────────────────────────────────────────
    //
    // Atado a los METROS ANDADOS, no al tiempo. Antes avanzaba con `ritmo`
    // —velocidad relativa— por una constante, y a 5,18 m/s daba 1,51 Hz: una
    // zancada de tres metros y medio, de gigante. Contando por distancia, un
    // ciclo cada 1,1 m es un paso de persona vaya uno rápido o despacio.
    const rapidez = Math.hypot(w.velocity.x, w.velocity.z);
    w.vaiven += (rapidez * dt * Math.PI * 2) / 1.1;
    const fuerza = Math.min(1, rapidez / w.paso);
    w.bamboleo = Math.sin(w.vaiven) * 0.045 * fuerza;
    pos.y += w.bamboleo;

    // Y un balanceo a la mitad de frecuencia, como ALABEO de la vista y no
    // como desplazamiento.
    //
    // El vertical solo bota; es el lateral —uno por zancada, no uno por pie—
    // el que se lee como andar. Desplazando la cámara de lado no valía: la
    // posición es la que se arrastra al fotograma siguiente, así que cada
    // bandazo se sumaba al anterior y el caminante se iba en espiral. Un
    // alabeo se ve igual y no toca dónde se está.
    const alabeo = Math.sin(w.vaiven * 0.5) * 0.011 * fuerza;
    this.camera.quaternion.setFromEuler(new THREE.Euler(f.pitch, f.yaw, alabeo, 'YXZ'));

    this.idleTimer = 0;
  }

  _updateFree(dt) {
    const f = this.free;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const wish = new THREE.Vector3();
    if (f.keys.has('KeyW') || f.keys.has('ArrowUp')) wish.add(forward);
    if (f.keys.has('KeyS') || f.keys.has('ArrowDown')) wish.sub(forward);
    if (f.keys.has('KeyD') || f.keys.has('ArrowRight')) wish.add(right);
    if (f.keys.has('KeyA') || f.keys.has('ArrowLeft')) wish.sub(right);
    if (f.keys.has('Space')) wish.y += 1;
    if (f.keys.has('KeyC') || f.keys.has('ControlLeft')) wish.y -= 1;

    const speed = f.speed * (f.keys.has('Shift') ? f.boost : 1);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    // Inercia: acelerar y frenar con peso, no teletransporte.
    f.velocity.x = damp(f.velocity.x, wish.x, 6.5, dt);
    f.velocity.y = damp(f.velocity.y, wish.y, 6.5, dt);
    f.velocity.z = damp(f.velocity.z, wish.z, 6.5, dt);
    this.camera.position.addScaledVector(f.velocity, dt);

    // Límites del mundo y del suelo. (vuelo libre)
    const limit = WORLD.radius * 2.2;
    const d = Math.hypot(this.camera.position.x, this.camera.position.z);
    if (d > limit) {
      this.camera.position.x *= limit / d;
      this.camera.position.z *= limit / d;
    }
    // `walkHeight` y no `height`: dentro del pasadizo el suelo es el de la
    // galería, no el del cerro que tiene encima. Con `height`, el tope empujaba
    // la cámara hacia arriba antes de llegar a la puerta y el túnel quedaba
    // inaccesible por construcción.
    const ground =
      this.field.walkHeight(this.camera.position.x, this.camera.position.z, this.camera.position.y) +
      GROUND_CLEARANCE;
    if (this.camera.position.y < ground) {
      this.camera.position.y = ground;
      f.velocity.y = Math.max(0, f.velocity.y);
    }
    this.camera.position.y = Math.min(this.camera.position.y, 260);
  }
}
