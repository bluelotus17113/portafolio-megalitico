/**
 * Hora del día.
 *
 * Cuatro momentos —amanecer, mediodía, atardecer y noche— que no se limitan a
 * mover el sol: cambian la paleta entera. En un fondo pintado el momento del
 * día NO es una cuestión de intensidad de luz sino de qué colores se usan, y
 * por eso cada fase trae su cielo, su bruma, su mar y sus tintes de banda.
 *
 * El sombreado cel de este proyecto no integra la luz: la usa como índice de
 * una rampa fija. Así que aquí no sirve de nada bajar la intensidad del sol —
 * hay que teñir las bandas. `TOON_TIME` lleva dos multiplicadores, uno para la
 * banda iluminada y otro para la de sombra, y se aplican por separado: de noche
 * la luz baja mucho y además se va al azul, mientras que en el atardecer la luz
 * se va al ámbar pero la sombra se vuelve MÁS fría, no menos. Ese divorcio
 * entre las dos es lo que hace la hora.
 *
 * OJO CON LAS UNIDADES: estos multiplicadores operan sobre radiancia LINEAL y
 * el fotograma se codifica a sRGB después, así que la caída que se ve en
 * pantalla es la raíz 2,2 de la que se escribe aquí. La primera versión de la
 * noche llevaba 0,40 creyendo que dejaría la isla al 40 %, y 0,40^(1/2,2) = 0,66
 * — el prado se quedaba a dos tercios de un mediodía bajo un cielo estrellado.
 * Medido: el cielo caía a 0,34 y el suelo a 0,67. Para una caída de X en
 * pantalla hay que escribir X^2,2 aquí.
 *
 * La transición se interpola con suavizado exponencial, así que cambiar de fase
 * es un amanecer de dos segundos y no un corte.
 */

import * as THREE from 'three';
import { TOON_SUN, TOON_TIME, TOON_ESTACION, setToonSun } from '../vfx/toon.js';
import { ESTACIONES } from './Estaciones.js';

/** Direcciones y paletas de cada momento. */
export const PHASES = [
  {
    id: 'amanecer',
    label: 'Amanecer',
    sun: [0.74, 0.24, -0.63],
    sunColor: 0xffd9a8,
    skyTop: 0x3f74b8,
    skyHorizon: 0xf7c9a0,
    fog: 0xe8c6a8,
    fogDensity: 0.00115,
    cloudLight: 0xfff0dd,
    cloudShade: 0xb59ab0,
    cloudCut: 0.42,
    // En pantalla: luz al 86 % de un mediodía, sombra al 54 %.
    toonLight: [0.80, 0.72, 0.60],
    toonShade: [0.22, 0.26, 0.40],
    oceanDeep: 0x1b4a70,
    oceanShallow: 0x4a9fb0,
    oceanClear: 0x6fd0cf,
    caustic: 0xffe6cc,
    foam: 0xffeede,
    grassShadow: 0x123a56,
    stars: 0.12,
    // El alba es liminal por el otro lado: se están retirando.
    sidhe: 0.55,
    bloom: 0.52,
    exposure: 1.02,
  },
  {
    id: 'dia',
    label: 'Mediodía',
    sun: [0.42, 0.70, -0.58],
    sunColor: 0xfff4dc,
    skyTop: 0x2b6fc4,
    skyHorizon: 0x9fd4ea,
    fog: 0x9fd4ea,
    fogDensity: 0.00105,
    cloudLight: 0xfdfdf8,
    cloudShade: 0xa9c2da,
    cloudCut: 0.40,
    toonLight: [1.0, 1.0, 1.0],
    toonShade: [1.0, 1.0, 1.0],
    oceanDeep: 0x14496e,
    oceanShallow: 0x3fa8b4,
    oceanClear: 0x4fd3d8,
    caustic: 0xdffbff,
    foam: 0xf2fbfd,
    grassShadow: 0x00344b,
    stars: 0,
    // El mediodía es de los humanos. Queda alguno rezagado a la sombra.
    sidhe: 0.10,
    bloom: 0.40,
    exposure: 1.0,
  },
  {
    id: 'tarde',
    label: 'Atardecer',
    sun: [-0.70, 0.27, 0.66],
    sunColor: 0xffc07a,
    skyTop: 0x3a63a8,
    skyHorizon: 0xffbe86,
    fog: 0xf0b98a,
    fogDensity: 0.00125,
    cloudLight: 0xffe3c4,
    cloudShade: 0xa07f9c,
    cloudCut: 0.38,
    // En pantalla: luz al 82 %, sombra al 50 %. La luz se va al ámbar y la
    // sombra al violeta — es la separación, no la caída, lo que hace la tarde.
    toonLight: [0.86, 0.62, 0.40],
    toonShade: [0.17, 0.20, 0.35],
    oceanDeep: 0x173f66,
    oceanShallow: 0x3f92a8,
    oceanClear: 0x63c2c8,
    caustic: 0xffdcb4,
    foam: 0xffe9d2,
    grassShadow: 0x1a2f52,
    stars: 0.22,
    // Su hora. Ni de día ni de noche, que es de lo que va todo esto.
    sidhe: 0.85,
    bloom: 0.62,
    exposure: 1.05,
  },
  {
    id: 'noche',
    label: 'Noche',
    // La luna hace de sol: alta, para que las sombras sigan teniendo sentido.
    sun: [-0.34, 0.66, 0.67],
    sunColor: 0xa9c6f2,
    skyTop: 0x08132e,
    skyHorizon: 0x1d3355,
    fog: 0x1b3050,
    fogDensity: 0.00090,
    cloudLight: 0x8ea4c8,
    cloudShade: 0x2b3f60,
    cloudCut: 0.46,
    // En pantalla: luz al 40 %, sombra al 26 %. El cielo nocturno medido cae al
    // 34 %, así que la isla queda apenas por encima de él — que es lo que hace
    // que se lea como noche y no como un prado de mediodía bajo un cielo negro.
    toonLight: [0.105, 0.140, 0.250],
    toonShade: [0.038, 0.052, 0.100],
    oceanDeep: 0x061428,
    oceanShallow: 0x123a52,
    oceanClear: 0x1c5c6e,
    caustic: 0x9fd8ff,
    foam: 0x9dbfd4,
    grassShadow: 0x081a33,
    stars: 1.0,
    sidhe: 1.0,
    // El bloom baja al oscurecerse la isla: florece sobre lo que ya hay, y con
    // la escena tres veces más oscura la misma fuerza pesa el triple.
    bloom: 0.72,
    exposure: 1.04,
  },
];

const COLOR_KEYS = [
  'sunColor', 'skyTop', 'skyHorizon', 'fog', 'cloudLight', 'cloudShade',
  'oceanDeep', 'oceanShallow', 'oceanClear', 'caustic', 'foam', 'grassShadow',
];
const NUMBER_KEYS = ['fogDensity', 'cloudCut', 'stars', 'bloom', 'exposure', 'sidhe'];

/**
 * Qué momento del día es AHORA donde está quien mira.
 *
 * Cuatro fases y un reloj, que es todo lo que hay. Calcular el orto y el ocaso
 * de verdad pediría la latitud, y pedirle la ubicación a alguien que acaba de
 * entrar a ver un portafolio cuesta mucho más de lo que valen los veinte
 * minutos de precisión que se ganan. Los tramos son los de un día templado,
 * que es donde aciertan más veces.
 *
 * Se lee el reloj DEL VISITANTE, no un huso fijo: `getHours` devuelve la hora
 * local del navegador, así que la isla amanece a la vez que amanece fuera de
 * su ventana.
 *
 * @param {Date} fecha
 * @returns {string} id de fase
 */
export function faseDeLaHora(fecha = new Date()) {
  const hora = fecha.getHours() + fecha.getMinutes() / 60;
  if (hora >= 5 && hora < 9) return 'amanecer';
  if (hora >= 9 && hora < 18) return 'dia';
  if (hora >= 18 && hora < 21) return 'tarde';
  return 'noche';
}

export class TimeOfDay {
  /**
   * @param {object} parts  Las piezas a las que hay que repartir la paleta.
   */
  constructor({ sky, ocean, grass, scene, sun, renderer, postfx, inicial, estacion }) {
    this.sky = sky;
    this.ocean = ocean;
    this.grass = grass;
    this.scene = scene;
    this.sunLight = sun;
    this.renderer = renderer;
    this.postfx = postfx;

    // La fase inicial se aplica de golpe en el constructor, antes del primer
    // fotograma: si se pusiera con `set()` después, quien entrase de noche
    // vería la isla amanecer y ponerse a oscuras delante de él.
    this.phase = PHASES.find((p) => p.id === inicial) ?? PHASES[1];
    this.target = this.phase;

    // Estado interpolado: arranca clavado en la fase inicial.
    this.value = {
      sun: new THREE.Vector3(...this.phase.sun).normalize(),
      toonLight: new THREE.Vector3(...this.phase.toonLight),
      toonShade: new THREE.Vector3(...this.phase.toonShade),
    };
    for (const k of COLOR_KEYS) this.value[k] = new THREE.Color(this.phase[k]);
    for (const k of NUMBER_KEYS) this.value[k] = this.phase[k];

    // La estación, igual: clavada de entrada, sin transición. Si se pusiera
    // después, quien entra en otoño vería la isla reverdecer y volver a
    // dorarse delante de él.
    this.estacion = ESTACIONES.find((e) => e.id === estacion) ?? ESTACIONES[1];
    this.estacionObjetivo = this.estacion;
    this.estacionValor = {
      hoja: new THREE.Vector3(...this.estacion.hoja),
      hierba: new THREE.Vector3(...this.estacion.hierba),
      tierra: new THREE.Vector3(...this.estacion.tierra),
      flor: this.estacion.flor,
      seco: this.estacion.seco,
      bruma: this.estacion.bruma,
      velo: this.estacion.velo,
    };

    this._apply();
  }

  /** Momento actual, por id. */
  get current() {
    return this.target.id;
  }

  /** Estación actual, por id. */
  get estacionId() {
    return this.estacionObjetivo.id;
  }

  /**
   * @param {string} id       Id de estación.
   * @param {boolean} instant Sin transición.
   */
  setEstacion(id, instant = false) {
    const estacion = ESTACIONES.find((e) => e.id === id);
    if (!estacion) return false;
    this.estacionObjetivo = estacion;
    if (instant) {
      const v = this.estacionValor;
      v.hoja.set(...estacion.hoja);
      v.hierba.set(...estacion.hierba);
      v.tierra.set(...estacion.tierra);
      v.flor = estacion.flor;
      v.seco = estacion.seco;
      v.bruma = estacion.bruma;
      v.velo = estacion.velo;
      this._apply();
    }
    return true;
  }

  /**
   * @param {string} id       Id de fase.
   * @param {boolean} instant Sin transición.
   */
  set(id, instant = false) {
    const phase = PHASES.find((p) => p.id === id);
    if (!phase) return false;
    this.target = phase;
    if (instant) {
      this.value.sun.set(...phase.sun).normalize();
      this.value.toonLight.set(...phase.toonLight);
      this.value.toonShade.set(...phase.toonShade);
      for (const k of COLOR_KEYS) this.value[k].setHex(phase[k]);
      for (const k of NUMBER_KEYS) this.value[k] = phase[k];
      this._apply();
    }
    return true;
  }

  update(dt) {
    const t = this.target;
    // Suavizado exponencial: independiente de los fotogramas por segundo.
    const k = 1 - Math.exp(-dt * 1.6);
    if (k <= 0) return;

    const targetSun = _tmpVec.set(...t.sun).normalize();
    // Por el arco más corto, no en línea recta: interpolando los componentes,
    // el sol atraviesa el centro de la esfera al pasar de este a oeste y la
    // escena se queda un instante iluminada desde ninguna parte.
    this.value.sun.lerp(targetSun, k).normalize();

    this.value.toonLight.lerp(_tmpVec.set(...t.toonLight), k);
    this.value.toonShade.lerp(_tmpVec.set(...t.toonShade), k);
    for (const key of COLOR_KEYS) this.value[key].lerp(_tmpColor.setHex(t[key]), k);
    for (const key of NUMBER_KEYS) this.value[key] += (t[key] - this.value[key]) * k;

    // La estación va MÁS DESPACIO que la hora, y a propósito: cambiar de
    // momento del día es un amanecer, un fenómeno de minutos que se acepta
    // comprimido en dos segundos. Un bosque no se pone dorado en dos segundos.
    // A la mitad de velocidad se lee como un cambio de estado de la isla y no
    // como un botón que conmuta un filtro.
    const e = this.estacionObjetivo;
    const ke = 1 - Math.exp(-dt * 0.8);
    const v = this.estacionValor;
    v.hoja.lerp(_tmpVec.set(...e.hoja), ke);
    v.hierba.lerp(_tmpVec.set(...e.hierba), ke);
    v.tierra.lerp(_tmpVec.set(...e.tierra), ke);
    v.flor += (e.flor - v.flor) * ke;
    v.seco += (e.seco - v.seco) * ke;
    v.bruma += (e.bruma - v.bruma) * ke;
    v.velo += (e.velo - v.velo) * ke;

    this._apply();
  }

  _apply() {
    const v = this.value;
    const e = this.estacionValor;

    setToonSun(v.sun);
    TOON_TIME.light.value.copy(v.toonLight);
    TOON_TIME.shade.value.copy(v.toonShade);

    TOON_ESTACION.hoja.value.copy(e.hoja);
    TOON_ESTACION.hierba.value.copy(e.hierba);
    TOON_ESTACION.tierra.value.copy(e.tierra);
    TOON_ESTACION.flor.value = e.flor;
    TOON_ESTACION.seco.value = e.seco;

    if (this.sky) {
      const u = this.sky.uniforms;
      u.uSunDir.value.copy(v.sun);
      u.uSunColor.value.copy(v.sunColor);
      u.uTop.value.copy(v.skyTop);
      u.uHorizon.value.copy(v.skyHorizon);
      u.uCloudLight.value.copy(v.cloudLight);
      u.uCloudShade.value.copy(v.cloudShade);
      u.uCloudCut.value = v.cloudCut;
      u.uStars.value = v.stars;
    }

    if (this.ocean) {
      const u = this.ocean.uniforms;
      u.uSunDir.value.copy(v.sun);
      u.uSunColor.value.copy(v.sunColor);
      u.uSkyColor.value.copy(v.skyHorizon);
      u.uDeep.value.copy(v.oceanDeep);
      u.uShallow.value.copy(v.oceanShallow);
      u.uCausticShallow.value.copy(v.oceanClear);
      u.uCausticColor.value.copy(v.caustic);
      u.uFoam.value.copy(v.foam);
    }

    if (this.grass) {
      const u = this.grass.userData.uniforms;
      u.uSunDir.value.copy(v.sun);
      u.uShadowColor.value.copy(v.grassShadow);
      u.uTimeLight.value.copy(v.toonLight);
      u.uTimeShade.value.copy(v.toonShade);
    }

    if (this.scene?.fog) {
      this.scene.fog.color.copy(v.fog);
      // Aquí es donde se ve la idea entera: la hora pone la densidad, la
      // estación la multiplica. Un amanecer de invierno es el amanecer de
      // siempre con media isla más de bruma, y no una quinta paleta escrita a
      // mano que habría que corregir cada vez que se toca el amanecer.
      this.scene.fog.density = v.fogDensity * e.bruma;
    }

    // La direccional solo existe ya para proyectar sombras: el color y la
    // intensidad los decide la rampa cel, no ella.
    if (this.sunLight) {
      this.sunLight.position.copy(v.sun).multiplyScalar(200).add(this.sunLight.target.position);
    }

    if (this.postfx) this.postfx.bloom.strength = v.bloom;
    if (this.renderer) this.renderer.toneMappingExposure = v.exposure;
  }
}

const _tmpVec = new THREE.Vector3();
const _tmpColor = new THREE.Color();
