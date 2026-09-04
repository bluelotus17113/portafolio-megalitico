/**
 * Aos sí: la gente del cerro.
 *
 * En la tradición irlandesa los sídhe no son mariposas con vestido — eso es
 * victoriano. Son la gente de los túmulos: viven DENTRO de los montículos
 * neolíticos, salen al anochecer y se dejan ver como luces que se mueven con
 * intención por el campo. Esta isla ya tiene su túmulo (el souterrain), así que
 * lo único que faltaba era la gente.
 *
 * Por qué NO son un ala con textura ni un cuerpecillo modelado:
 *
 *  - En todo el proyecto no hay un solo personaje. Meter un bicho con miembros
 *    aquí sería el único objeto de la isla que no se puede generar por código,
 *    y encima a la altura de la órbita mediría dos píxeles.
 *  - Un espíritu se lee por cómo se MUEVE, no por su anatomía. Lo que separa a
 *    uno de una luciérnaga es que tiene proa y tiene intención: se estira en
 *    cometa cuando corre, deja estela, se para a mirarte y se espanta si te
 *    acercas demasiado. Todo eso es comportamiento, y el comportamiento sí se
 *    escribe.
 *
 * Ya había motas de ambiente (`Atmosphere.js`), y a propósito no se tocan: una
 * mota es polen —deriva y no decide nada, resuelta entera en el vertex shader
 * sin una línea de CPU—. Estos deciden. Son veintiséis, así que pensar por
 * ellos en CPU cuesta menos que el propio dibujado.
 *
 * ── Cuándo salen ────────────────────────────────────────────────────────
 *
 * Dos cosas mandan sobre cuántos hay despiertos, y las dos son folclore, no
 * gusto:
 *
 *  - LA HORA. Los sídhe son del crepúsculo y de la noche. El mediodía es la
 *    hora de los humanos. Eso viene de `PHASES[].sidhe`.
 *  - LA ESTACIÓN. En Samhain (finales de octubre) el velo entre los dos mundos
 *    está más fino que nunca, y en Beltane (primeros de mayo) se abre por el
 *    otro lado del año. Las dos fiestas liminales caen en otoño y primavera, y
 *    por eso son las estaciones con MÁS espíritus — no las más templadas. Eso
 *    viene de `ESTACIONES[].velo`.
 *
 * O sea que un otoño de noche es el pico del año, y un mediodía de invierno el
 * fondo. Que es exactamente lo que diría cualquiera que se lo hubiera contado
 * su abuela.
 */

import * as THREE from 'three';
import { registerClock } from './materials.js';
import { makeRandom } from '../utils/noise.js';
import { PALETTE, WORLD } from '../config.js';

/** Ranuras de estela por espíritu. */
const LARGO = 16;

/**
 * Cada cuánto se guarda una posición en la estela, en segundos.
 *
 * Por dieciséis ranuras salen 1,1 s de cola, que a velocidad de crucero son
 * unos ocho metros. Con 0,045 eran cinco, y desde el mirador eso no se lee
 * como estela: se lee como un guion.
 */
const PASO_ESTELA = 0.07;

/** Estados. Números y no cadenas: se comparan cientos de veces por segundo. */
const DORMIDA = 0;
const VAGANDO = 1;
const POSADA = 2;
const CURIOSA = 3;
const ESQUIVA = 4;

/** A qué distancia de la cámara se fija en ti, se acerca y se espanta. */
const R_REPARA = 34;
const R_COMODA = 12;
const R_ESPANTO = 7;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

const cuerpoVertex = /* glsl */ `
  uniform float uTime;
  uniform float uTam;
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute vec2 aRasgo;   // fase del palpitar, escala
  attribute float aBrillo;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vBrillo;
  varying float vDist;

  void main() {
    vec4 mv = modelViewMatrix * vec4( aPos, 1.0 );
    vDist = -mv.z;

    // La cartela se orienta con la VELOCIDAD proyectada en pantalla, no con
    // el eje Y. Es lo que hace que la llama apunte a donde va: alineada con
    // la vertical, el bicho se movía de lado como un cangrejo ardiendo.
    vec3 velVista = ( modelViewMatrix * vec4( aVel, 0.0 ) ).xyz;
    vec2 eje = length( velVista.xy ) > 0.001 ? normalize( velVista.xy ) : vec2( 0.0, 1.0 );
    vec2 lado = vec2( -eje.y, eje.x );

    // Cuanto más corre, más se estira en cometa. Con tope: una espantada a
    // veintidós metros por segundo dibujaba una raya de pantalla entera.
    float estira = 1.0 + min( length( aVel ) * 0.075, 1.1 );
    float palpito = 0.88 + 0.12 * sin( uTime * 3.1 + aRasgo.x * 6.283 );
    float tam = uTam * aRasgo.y * palpito;

    vec2 local = position.xy * tam;
    mv.xy += lado * local.x + eje * local.y * estira;

    vUv = position.xy + 0.5;
    vColor = aColor;
    vBrillo = aBrillo;
    gl_Position = projectionMatrix * mv;
  }
`;

const cuerpoFragment = /* glsl */ `
  uniform float uOpacidad;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vBrillo;
  varying float vDist;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;

    // Llama: cabeza redonda delante y cola que se estrecha detrás. Un disco
    // simétrico es una luciérnaga; esto tiene proa.
    float ancho = 0.20 + 0.50 * smoothstep( -1.0, 0.45, p.y );
    float cola = exp( -( p.x * p.x ) / ( ancho * ancho ) )
               * smoothstep( -1.0, -0.42, p.y )
               * smoothstep( 1.0, 0.50, p.y );

    vec2 c = p - vec2( 0.0, 0.30 );
    float nucleo = exp( -dot( c, c ) * 7.0 );

    float a = clamp( cola * 0.40 + nucleo, 0.0, 1.0 );
    // De lejos son un píxel y solo aportan ruido; se apagan antes de llegar.
    a *= vBrillo * uOpacidad * ( 1.0 - smoothstep( 240.0, 460.0, vDist ) );
    if ( a < 0.004 ) discard;

    // El núcleo tira a blanco. Un punto de luz saturado no parece luz: parece
    // una pegatina de color.
    vec3 col = mix( vColor, vec3( 1.0 ), nucleo * 0.72 );
    gl_FragColor = vec4( col * ( 1.0 + nucleo * 1.4 ), a );
  }
`;

const estelaVertex = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uCursor;
  attribute float aRanura;
  attribute vec3 aColor;
  attribute float aBrillo;
  varying float vEdad;
  varying vec3 vColor;
  varying float vBrillo;

  void main() {
    // La estela es un búfer circular: la edad de una ranura es lo que dista
    // del cursor hacia atrás. Así no hay que mover un solo byte para que la
    // cola envejezca — solo avanza el cursor.
    vEdad = mod( ${LARGO}.0 + uCursor - aRanura, ${LARGO}.0 ) / ${LARGO}.0;
    vColor = aColor;
    vBrillo = aBrillo;

    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mv;
    float s = uPixelRatio * ( 1.0 - vEdad ) * 9.5 * ( 90.0 / max( -mv.z, 1.0 ) );
    gl_PointSize = clamp( s, 0.0, 22.0 * uPixelRatio );
  }
`;

const estelaFragment = /* glsl */ `
  uniform float uOpacidad;
  varying float vEdad;
  varying vec3 vColor;
  varying float vBrillo;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length( c );
    if ( d > 0.5 ) discard;
    float halo = pow( smoothstep( 0.5, 0.0, d ), 2.2 );
    float desvanece = ( 1.0 - vEdad ) * ( 1.0 - vEdad );
    float a = halo * desvanece * vBrillo * uOpacidad * 0.7;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vColor, a );
  }
`;

export class Espiritus {
  /**
   * @param {import('../world/Terrain.js').TerrainField} field
   * @param {object} opciones
   * @param {number} opciones.count    Cuántos como mucho.
   * @param {THREE.Vector3} opciones.hogar   La boca del túmulo: de ahí salen.
   * @param {Array<{id: string, pos: THREE.Vector3}>} opciones.anclas
   */
  constructor(field, { count = 26, seed = 1101, hogar, anclas = [] } = {}) {
    this.field = field;
    this.count = count;
    this.hogar = hogar.clone();
    this.anclas = anclas;
    this._rnd = makeRandom(seed);

    this.cursor = 0;
    this._acumulado = 0;
    this._presencia = 0.35;

    // ── Estado, uno por espíritu ──────────────────────────────────────
    this.bichos = [];
    for (let i = 0; i < count; i++) {
      const r = this._rnd;
      this.bichos.push({
        pos: this.hogar.clone().add(new THREE.Vector3((r() - 0.5) * 12, 2 + r() * 6, (r() - 0.5) * 12)),
        vel: new THREE.Vector3(),
        destino: this.hogar.clone(),
        estado: VAGANDO,
        // El reloj de cada uno arranca desfasado: con todos a cero, los
        // veintiséis cambiaban de estado el mismo fotograma y la isla entera
        // daba un respingo cada seis segundos.
        reloj: r() * 6,
        altura: 2.2 + r() * 7,
        orbita: 3 + r() * 7,
        fase: r() * Math.PI * 2,
        brillo: 0,
        ancla: null,
      });
    }

    this.group = new THREE.Group();
    this.group.name = 'espiritus';
    this._construirCuerpos();
    this._construirEstelas();
  }

  // ------------------------------------------------------------------ malla

  _construirCuerpos() {
    const n = this.count;
    const geo = new THREE.InstancedBufferGeometry();
    geo.instanceCount = n;

    // La cartela se escribe a mano, sin indexar y sin `PlaneGeometry`.
    //
    // La primera versión compartía los atributos de una `PlaneGeometry` y
    // luego la desechaba, y no se dibujaba NADA: ni con el tamaño a treinta,
    // ni con el fragment forzado a magenta opaco, ni con la posición clavada
    // delante de la cámara. La llamada de dibujado salía —`onBeforeRender`
    // contaba cincuenta y ocho— y el primitivo llegaba degenerado.
    //
    // Seis vértices sueltos, que es exactamente lo que hace `createBirds` en
    // `Atmosphere.js` y lleva ahí funcionando desde el principio. Doce floats
    // no valen una dependencia con una geometría que se destruye.
    const cuad = new Float32Array([
      -0.5, -0.5, 0,  0.5, -0.5, 0,  0.5, 0.5, 0,
      -0.5, -0.5, 0,  0.5,  0.5, 0, -0.5, 0.5, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(cuad, 3));

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aBrillo = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const colores = new Float32Array(n * 3);
    const rasgos = new Float32Array(n * 2);

    // Casi todos del cian arcano de la isla; unos pocos dorados y algún ascua.
    // La mezcla desigual es a propósito: cuatro luces iguales son un sistema
    // de partículas, cuatro luces distintas son cuatro individuos.
    const paleta = [
      new THREE.Color(PALETTE.arcane),
      new THREE.Color(PALETTE.arcane),
      new THREE.Color(PALETTE.arcane),
      new THREE.Color(PALETTE.gold),
      new THREE.Color(PALETTE.ember),
    ];
    this.colores = [];
    for (let i = 0; i < n; i++) {
      const c = paleta[Math.floor(this._rnd() * paleta.length)].clone();
      c.multiplyScalar(0.85 + this._rnd() * 0.4);
      this.colores.push(c);
      colores[i * 3] = c.r;
      colores[i * 3 + 1] = c.g;
      colores[i * 3 + 2] = c.b;
      rasgos[i * 2] = this._rnd();
      rasgos[i * 2 + 1] = 0.7 + Math.pow(this._rnd(), 1.6) * 0.8;
    }

    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aBrillo', this.aBrillo);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colores, 3));
    geo.setAttribute('aRasgo', new THREE.InstancedBufferAttribute(rasgos, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

    const uniforms = {
      uTime: { value: 0 },
      uTam: { value: 4.2 },
      uOpacidad: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: cuerpoVertex,
      fragmentShader: cuerpoFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    registerClock(uniforms);

    const malla = new THREE.Mesh(geo, material);
    malla.frustumCulled = false;
    malla.renderOrder = 3;
    this.cuerpos = malla;
    this.uniformesCuerpo = uniforms;
    this.group.add(malla);
  }

  _construirEstelas() {
    const n = this.count;
    const total = n * LARGO;
    const geo = new THREE.BufferGeometry();

    // Toda la historia arranca clavada en la posición inicial: si arrancara en
    // el origen, el primer fotograma dibujaba veintiséis rayas desde el centro
    // del mar hasta el cerro.
    const pos = new Float32Array(total * 3);
    const ranuras = new Float32Array(total);
    const colores = new Float32Array(total * 3);
    for (let i = 0; i < n; i++) {
      const b = this.bichos[i];
      const c = this.colores[i];
      for (let k = 0; k < LARGO; k++) {
        const j = i * LARGO + k;
        pos[j * 3] = b.pos.x;
        pos[j * 3 + 1] = b.pos.y;
        pos[j * 3 + 2] = b.pos.z;
        ranuras[j] = k;
        colores[j * 3] = c.r;
        colores[j * 3 + 1] = c.g;
        colores[j * 3 + 2] = c.b;
      }
    }

    this.posEstela = new THREE.BufferAttribute(pos, 3);
    this.brilloEstela = new THREE.BufferAttribute(new Float32Array(total), 1);
    geo.setAttribute('position', this.posEstela);
    geo.setAttribute('aRanura', new THREE.BufferAttribute(ranuras, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colores, 3));
    geo.setAttribute('aBrillo', this.brilloEstela);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 900);

    const uniforms = {
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
      uCursor: { value: 0 },
      uOpacidad: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: estelaVertex,
      fragmentShader: estelaFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const puntos = new THREE.Points(geo, material);
    puntos.frustumCulled = false;
    puntos.renderOrder = 2;
    this.estelas = puntos;
    this.uniformesEstela = uniforms;
    this.group.add(puntos);
  }

  // ----------------------------------------------------------- comportamiento

  /** Un ancla al azar, sesgada a la sección abierta si hay alguna. */
  _elegirAncla(activa) {
    if (activa && this._rnd() < 0.62) {
      const a = this.anclas.find((x) => x.id === activa);
      if (a) return a;
    }
    return this.anclas[Math.floor(this._rnd() * this.anclas.length)];
  }

  /** Pone destino nuevo según en qué anda. */
  _replantear(b, activa) {
    const r = this._rnd;
    if (b.estado === VAGANDO) {
      b.ancla = this._elegirAncla(activa);
      const ang = r() * Math.PI * 2;
      const rad = 6 + r() * 16;
      b.destino.set(
        b.ancla.pos.x + Math.cos(ang) * rad,
        0,
        b.ancla.pos.z + Math.sin(ang) * rad
      );
      b.reloj = 4 + r() * 7;
    } else if (b.estado === POSADA) {
      b.reloj = 3 + r() * 6;
    }
    this._alSuelo(b.destino, b.altura);
  }

  /** Sube un punto del plano XZ a su altura de vuelo sobre el terreno. */
  _alSuelo(p, altura) {
    // Fuera del disco no hay terreno que consultar, solo mar: se recoge el
    // destino hacia dentro antes de preguntar la cota.
    const d = Math.hypot(p.x, p.z);
    const tope = WORLD.radius * 0.94;
    if (d > tope) {
      p.x *= tope / d;
      p.z *= tope / d;
    }
    p.y = this.field.height(p.x, p.z) + altura;
    return p;
  }

  /**
   * @param {number} dt
   * @param {object} ctx
   * @param {THREE.Camera} ctx.camera
   * @param {string|null} ctx.activeSection
   * @param {number} ctx.presencia  Cuántos están despiertos, de 0 a ~1,35.
   */
  update(dt, { camera, activeSection = null, presencia = 0.35 } = {}) {
    // Un tirón —o una pestaña que vuelve del segundo plano— no los teletransporta.
    const paso = Math.min(dt, 0.05);
    this._presencia += (presencia - this._presencia) * (1 - Math.exp(-dt * 0.6));

    // Siempre queda alguno. Un mediodía de invierno con la isla literalmente
    // vacía de espíritus se lee como que la función está rota, no como folclore.
    const p = Math.max(0.12, Math.min(1, this._presencia));
    const despiertos = Math.round(this.count * p);
    this.uniformesCuerpo.uOpacidad.value = Math.min(1.25, Math.max(0.5, this._presencia));
    this.uniformesEstela.uOpacidad.value = this.uniformesCuerpo.uOpacidad.value;

    const cam = camera?.position;
    const posArr = this.aPos.array;
    const velArr = this.aVel.array;
    const briArr = this.aBrillo.array;

    for (let i = 0; i < this.count; i++) {
      const b = this.bichos[i];
      const vivo = i < despiertos;

      if (!vivo) {
        // A dormir: se hunden en el cerro, que es de donde salieron.
        if (b.estado !== DORMIDA) {
          b.estado = DORMIDA;
          b.destino.copy(this.hogar);
          b.destino.y = this.field.height(this.hogar.x, this.hogar.z) - 5;
        }
      } else if (b.estado === DORMIDA) {
        b.estado = VAGANDO;
        this._replantear(b, activeSection);
      } else {
        b.reloj -= paso;

        // La cámara manda sobre todo lo demás. Y el orden importa: primero el
        // espanto, porque quien está a cinco metros no se queda a mirar.
        const cerca = cam ? b.pos.distanceTo(cam) : Infinity;
        if (cerca < R_ESPANTO && b.estado !== ESQUIVA) {
          b.estado = ESQUIVA;
          b.reloj = 1.6 + this._rnd() * 1.4;
          _v.subVectors(b.pos, cam).normalize();
          b.destino.copy(b.pos).addScaledVector(_v, 34);
          this._alSuelo(b.destino, b.altura + 6);
        } else if (b.estado === ESQUIVA && b.reloj <= 0) {
          b.estado = VAGANDO;
          this._replantear(b, activeSection);
        } else if (b.estado !== ESQUIVA && cerca < R_REPARA) {
          // Curiosidad: se planta a una distancia cómoda y te mira. No se
          // acerca más — la gente del cerro es curiosa, no mansa.
          b.estado = CURIOSA;
          _v.subVectors(b.pos, cam).normalize();
          b.destino.copy(cam).addScaledVector(_v, R_COMODA);
          b.destino.y = Math.max(
            this.field.height(b.destino.x, b.destino.z) + 1.4,
            cam.y + Math.sin(b.fase + b.reloj * 0.7) * 2.2
          );
        } else if (b.estado === CURIOSA) {
          b.estado = VAGANDO;
          this._replantear(b, activeSection);
        } else if (b.reloj <= 0) {
          b.estado = b.estado === VAGANDO ? POSADA : VAGANDO;
          this._replantear(b, activeSection);
        } else if (b.estado === POSADA && b.ancla) {
          // Posada: gira despacio alrededor del monumento, como una vela que
          // alguien hubiera dejado dando vueltas.
          const t = b.fase + b.reloj * 0.55;
          b.destino.set(
            b.ancla.pos.x + Math.cos(t) * b.orbita,
            0,
            b.ancla.pos.z + Math.sin(t) * b.orbita
          );
          this._alSuelo(b.destino, b.altura + Math.sin(t * 1.7) * 1.2);
        }
      }

      // ── Movimiento ────────────────────────────────────────────────
      const crucero =
        b.estado === ESQUIVA ? 22 : b.estado === CURIOSA ? 9 : b.estado === POSADA ? 3.5 : 7;
      const agilidad = b.estado === ESQUIVA ? 3.2 : 1.5;

      _w.subVectors(b.destino, b.pos);
      const dist = _w.length();
      if (dist > 0.001) _w.multiplyScalar(crucero / dist);
      // Frena al llegar, para no orbitar el destino como una polilla.
      if (dist < 4) _w.multiplyScalar(dist / 4);
      b.vel.lerp(_w, 1 - Math.exp(-agilidad * paso));
      b.pos.addScaledVector(b.vel, paso);

      // El vagar sale de aquí, no de un ruido añadido: el destino está lejos y
      // el amortiguado nunca llega a clavarlo, así que la trayectoria ya sale
      // curva. Solo hace falta impedir que se meta bajo tierra.
      if (b.estado !== DORMIDA) {
        const suelo = this.field.height(b.pos.x, b.pos.z) + 1.2;
        if (b.pos.y < suelo) {
          b.pos.y = suelo;
          if (b.vel.y < 0) b.vel.y = 0;
        }
      }

      if (b.estado === VAGANDO && dist < 3.5) {
        b.estado = POSADA;
        this._replantear(b, activeSection);
      }

      b.brillo += ((vivo ? 1 : 0) - b.brillo) * (1 - Math.exp(-paso * 1.4));

      posArr[i * 3] = b.pos.x;
      posArr[i * 3 + 1] = b.pos.y;
      posArr[i * 3 + 2] = b.pos.z;
      velArr[i * 3] = b.vel.x;
      velArr[i * 3 + 1] = b.vel.y;
      velArr[i * 3 + 2] = b.vel.z;
      briArr[i] = b.brillo;
    }

    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aBrillo.needsUpdate = true;

    // ── Estela ────────────────────────────────────────────────────────
    // A intervalo fijo, no por fotograma: si no, la cola mide el doble en un
    // equipo que va a 120 que en uno que va a 60.
    this._acumulado += dt;
    if (this._acumulado >= PASO_ESTELA) {
      this._acumulado %= PASO_ESTELA;
      this.cursor = (this.cursor + 1) % LARGO;
      const ep = this.posEstela.array;
      const eb = this.brilloEstela.array;
      for (let i = 0; i < this.count; i++) {
        const b = this.bichos[i];
        const j = i * LARGO + this.cursor;
        ep[j * 3] = b.pos.x;
        ep[j * 3 + 1] = b.pos.y;
        ep[j * 3 + 2] = b.pos.z;
        eb[j] = b.brillo;
      }
      this.posEstela.needsUpdate = true;
      this.brilloEstela.needsUpdate = true;
      this.uniformesEstela.uCursor.value = this.cursor;
    }
  }
}
