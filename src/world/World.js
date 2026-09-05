/**
 * Montaje del mundo.
 *
 * Orden importante: primero se reservan las explanadas en el campo de alturas
 * (`addPad`), y solo después se teselan terreno, hierba y santuarios. Si se
 * hiciera al revés, la malla no sabría que hay que aplanar y los estrados
 * quedarían flotando o enterrados.
 */

import * as THREE from 'three';
import { TerrainField, buildTerrain } from './Terrain.js';
import { Ocean } from './Ocean.js';
import { Sky } from './Sky.js';
import { createGrass } from './Grass.js';
import { createMotes, createBirds } from '../vfx/Atmosphere.js';
import { Espiritus } from '../vfx/Espiritus.js';
import { Forest, forestKeepOut } from './Forest.js';
import { createLeyLine, createLeyRing } from '../vfx/LeyLines.js';
import { pathRoute, polarRoute, pathKeepOut, createPaths, createPathKerb, routeClimb } from './Paths.js';
import { setToonSun, setToonCloudMap, tickToonClouds } from '../vfx/toon.js';
import { TimeOfDay, PHASES } from './TimeOfDay.js';
import { createCalzada, createEscalinata, calzadaKeepOut } from './Calzada.js';
import { createDolmen, DOLMEN_RADIO } from '../models/Dolmen.js';
import { ESTACIONES } from './Estaciones.js';
import { createDais } from '../models/Dais.js';
import { createTrilithon } from '../models/Megaliths.js';
import { createStone, createBoulder, stoneMesh, rockMaterial } from '../models/StoneFactory.js';
import { AboutShrine } from '../sections/About.js';
import { ProjectsShrine } from '../sections/Projects.js';
import { SkillsShrine } from '../sections/Skills.js';
import { ExperienceShrine, travellerKeepOut } from '../sections/Experience.js';
import { ContactShrine } from '../sections/Contact.js';
import {
  createSouterrain,
  souterrainCuts,
  souterrainKeepOut,
  souterrainMound,
  souterrainMouths,
  souterrainTunnel,
} from '../models/Souterrain.js';
import {
  createStairway,
  stairwayCuts,
  stairwayKeepOut,
  stairwayWalkways,
} from '../models/Stairway.js';
import { runeStone, RUNE_MOTIFS } from '../models/Carving.js';
import { HOME_VIEW, ISLOTE, PALETTE, SECTIONS, SEED, WORLD, QUALITY, DAIS, daisOuterRadius } from '../config.js';
import { makeRandom } from '../utils/noise.js';
import { cloudTexture } from '../utils/textures.js';

const SHRINE_CLASSES = {
  about: AboutShrine,
  projects: ProjectsShrine,
  skills: SkillsShrine,
  experience: ExperienceShrine,
  contact: ContactShrine,
};

/**
 * Cuánto se mete el empedrado por debajo del canto del estrado.
 *
 * `daisOuterRadius` es el radio nominal, pero la PIEDRA del estrado acaba 1,6 m
 * antes. Con el remetido anterior de 1,5 el camino moría justo un decímetro por
 * fuera de la piedra: no llegaba a tocar nada por ninguno de los dos extremos y
 * quedaba un retal de adoquín flotando en el prado con un palmo de hierba a cada
 * lado. Con 3,6 el empedrado pasa dos metros por debajo de la losa y el enlace
 * se lee como tal.
 */
const TUCK = 3.6;

/**
 * Radio que hay que aplanar bajo cada santuario.
 *
 * Sale de `DAIS`, no de una tabla a mano: la explanada tiene que cubrir por lo
 * menos la piedra del estrado más un margen, o los peldaños exteriores acaban al
 * borde de la zona aplanada y cuelgan en cuanto el terreno se mueve. Cuatro de
 * los cinco valores escritos a mano se quedaban CORTOS respecto a su propio
 * estrado — Trayectoria aplanaba 13 m para una plataforma de 14,9.
 */
const PAD_RADIUS = Object.fromEntries(
  Object.entries(DAIS).map(([id, d]) => [id, d.radius + d.steps * d.stepWidth + 0.5])
);

/**
 * Anchura del degradado de cada explanada.
 *
 * Corta a propósito. Con los 24 m de antes, la explanada de un santuario llegaba
 * de lleno hasta la del vecino: la de Trayectoria —17 m más alta— levantaba siete
 * metros el centro de la plaza, y la de la plaza hundía dos metros y medio la de
 * Habilidades. No es un problema de mezcla sino de sitio: entre la plaza y
 * Trayectoria hay 48 m y sus discos llanos suman 51. No caben, y no hay reparto
 * de pesos que los haga caber.
 *
 * Lo que sí hay es que el terreno entre las dos SEA un escarpe, porque lo es, y
 * que cada plataforma lo resuelva con su muro de contención.
 */
const PAD_BLEND = 10;

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.shrines = [];
    this.hotspotObjects = [];
    this.elapsed = 0;
  }

  /**
   * Construcción por etapas: cada llamada a `next()` devuelve el porcentaje
   * hecho, para que la pantalla de carga pueda avanzar de verdad en vez de
   * fingir una barra.
   * @returns {Array<{label: string, run: () => void}>}
   */
  buildSteps() {
    return [
      { label: 'Trazando el promontorio', run: () => this._buildField() },
      { label: 'Levantando el acantilado', run: () => this._buildTerrain() },
      { label: 'Llamando a la marea', run: () => this._buildOceanAndSky() },
      { label: 'Sembrando el prado', run: () => this._buildGrass() },
      { label: 'Alzando el círculo central', run: () => this._buildPlaza() },
      { label: 'Empedrando los caminos', run: () => this._buildPaths() },
      { label: 'Grabando la estela', run: () => this._buildShrine('about') },
      { label: 'Ordenando los monolitos', run: () => this._buildShrine('projects') },
      { label: 'Encendiendo las runas', run: () => this._buildShrine('skills') },
      { label: 'Abriendo el camino', run: () => this._buildShrine('experience') },
      { label: 'Prendiendo el altar', run: () => this._buildShrine('contact') },
      { label: 'Abriendo el pasadizo', run: () => this._buildSouterrain() },
      { label: 'Labrando la escalinata', run: () => this._buildStairway() },
      { label: 'Grabando las piedras', run: () => this._buildRuneStones() },
      { label: 'Plantando el arbolado', run: () => this._buildForest() },
      { label: 'Tendiendo las líneas ley', run: () => this._buildLeyLines() },
      { label: 'Echando la calzada al islote', run: () => this._buildIslote() },
      { label: 'Soltando el viento', run: () => this._buildAtmosphere() },
      { label: 'Despertando a la gente del cerro', run: () => this._buildEspiritus() },
      { label: 'Ajustando la luz', run: () => this._buildLights() },
    ];
  }

  // ------------------------------------------------------------------ etapas

  _buildField() {
    this.field = new TerrainField(SEED);
    // Explanada central y la de cada santuario, antes de teselar nada.
    // +9 para cubrir también los peldaños exteriores del estrado central.
    this.field.addPad(0, 0, PAD_RADIUS.plaza, PAD_BLEND);
    for (const def of SECTIONS) {
      this.field.addPad(def.anchor[0], def.anchor[2], PAD_RADIUS[def.id] ?? 16, PAD_BLEND);
    }

    // El cerro del pasadizo y sus dos trincheras. Van AQUÍ, antes de teselar
    // nada: el terreno, la hierba y el arbolado leen el campo de alturas una
    // sola vez, así que un cerro registrado más tarde saldría con el prado
    // sembrado a la altura antigua y las matas flotando.
    const cerro = souterrainMound();
    this.field.addMound(cerro.x, cerro.z, cerro.radius, cerro.height);
    for (const c of souterrainCuts(this.field)) {
      this.field.addCut(c.ax, c.az, c.bx, c.bz, c);
    }
    const galeria = souterrainTunnel();
    this.field.addTunnel(galeria.ax, galeria.az, galeria.bx, galeria.bz, galeria);

    // La escalinata a Habilidades. Va después del cerro y de las explanadas
    // —lee el talud ya aplanado por los estrados— y antes de teselar, por lo
    // mismo que el pasadizo: su desmonte tiene que existir cuando la hierba y
    // el arbolado consulten el campo de alturas.
    for (const c of stairwayCuts(this.field)) {
      this.field.addCut(c.ax, c.az, c.bx, c.bz, c);
    }
    for (const w of stairwayWalkways(this.field)) {
      this.field.addWalkway(w.ax, w.az, w.bx, w.bz, w);
    }

    // El islote y el bajío por el que va la calzada. Aquí por lo mismo que el
    // cerro: el campo de alturas se lee UNA vez, y una segunda tierra
    // registrada después saldría en el andar pero no en la malla — se podría
    // caminar sobre agua.
    const c = Math.cos(ISLOTE.rumbo);
    const s = Math.sin(ISLOTE.rumbo);
    this.isloteCentro = new THREE.Vector2(c * ISLOTE.distancia, s * ISLOTE.distancia);
    this.isloteRadio = ISLOTE.radius;
    this.field.addIsla(
      this.isloteCentro.x,
      this.isloteCentro.y,
      ISLOTE.radius,
      ISLOTE.altura,
      SEED % 977
    );
    // La barra arranca dentro de la isla grande, no en la orilla: naciendo
    // justo en la costa, el bajío empieza donde el fondo ya está cayendo y el
    // primer vano de la calzada se quedaba con nueve metros de agua debajo.
    const costa = this.field.coastRadius(ISLOTE.rumbo);
    this.field.addBajio(
      c * (costa - 14),
      s * (costa - 14),
      this.isloteCentro.x,
      this.isloteCentro.y,
      ISLOTE.bajio
    );

    // Desmonte para la escalinata, ANTES de teselar y antes de la explanada.
    //
    // No basta con posar peldaños sobre la ladera: `walkHeight` devuelve el
    // MÁXIMO entre el terreno y la pasarela —una pasarela por debajo del suelo
    // abriría una zanja invisible—, así que unos peldaños tendidos sobre una
    // ladera que sube más deprisa que ellos quedan enterrados y no los pisa
    // nadie. Medido: la escalera iba a 9,5 donde el terreno estaba a 10,85.
    // Hay que EXCAVAR el corredor, que es lo mismo que hace la escalinata de
    // Habilidades con `stairwayCuts`.
    const pieD = (() => {
      // Dónde pisa tierra quien acaba de cruzar: primer punto del islote por
      // encima de la cota a la que llega la calzada.
      for (let d = ISLOTE.distancia - ISLOTE.radius - 8; d < ISLOTE.distancia; d += 0.5) {
        if (this.field.baseHeight(c * d, s * d) > 4.4) return d;
      }
      return ISLOTE.distancia - ISLOTE.radius;
    })();
    const cimaD = ISLOTE.distancia - 5;
    const cimaY = this.field.baseHeight(c * cimaD, s * cimaD);
    this.escalinataPlan = { pieD, cimaD, pieY: 4.4, cimaY };
    this.field.addCut(c * pieD, s * pieD, c * cimaD, s * cimaD, {
      halfWidth: 3.0,
      blend: 6.0,
      floorA: 4.4,
      floorB: cimaY,
    });

    // Explanada bajo el dolmen, a la MISMA cota a la que llega la escalinata.
    //
    // Con la explanada resuelta por su cuenta —`addPad` sin cota— quedaba un
    // palmo de terreno natural entre el último peldaño y la plataforma, y ahí
    // la tangente salía a 0,63 contra el 0,62 que admite el modo a pie: el
    // último metro antes del dolmen era infranqueable. Dándole a la explanada
    // la cota de llegada de la escalera, las dos casan y no hay costura. Lo mismo que llevan los cinco santuarios, y
    // por lo mismo: medido, el terreno del islote sube dos metros en los cinco
    // de huella del dolmen, así que la jamba de atrás quedaba enterrada 1,79 de
    // sus 1,94 y del monumento solo asomaba la cubierta tirada en la hierba.
    // Un megalito se planta a nivel — es lo primero que hace quien lo levanta.
    this.field.addPad(this.isloteCentro.x, this.isloteCentro.y, 9, 13, cimaY);

    this._traceRoutes();
  }

  /**
   * Trazado de la red de caminos.
   *
   * Va aquí, con las explanadas ya reservadas, y no en el paso que las
   * empiedra: la hierba se siembra tres etapas antes y necesita saber por
   * dónde pasan para no brotar entre los adoquines.
   *
   * La red tiene dos clases de tramo, y la razón es la geometría del sitio:
   *
   *  - **Radios**, del círculo central a cada estrado. Salen cortos —dos o
   *    tres metros— porque los estrados están pegados al círculo. Son enlaces,
   *    no caminos, y así se leen.
   *  - **Arcos**, entre santuarios contiguos por ángulo. Estos son los que se
   *    ven: rodean la plaza por fuera en vez de cruzarla y llegan a medir cien
   *    metros. Son los que hacen que los cinco círculos se lean como una red.
   */
  _traceRoutes() {
    const anchorOf = (def) => new THREE.Vector3(def.anchor[0], 0, def.anchor[2]);
    const plazaOuter = daisOuterRadius('plaza');

    // Radios.
    const spokes = SECTIONS.map((def) => {
      const anchor = anchorOf(def);
      const dir = anchor.clone().normalize();
      const from = dir.clone().multiplyScalar(plazaOuter - TUCK);
      const to = anchor.clone().sub(dir.clone().multiplyScalar(daisOuterRadius(def.id) - TUCK));
      // Con dos metros entre extremos no hacen falta noventa muestras.
      const samples = Math.max(8, Math.round(from.distanceTo(to) * 1.2));
      return pathRoute(this.field, from, to, { arc: 0.06, samples });
    });

    // Arcos entre contiguos, ordenados por ángulo alrededor de la isla.
    const ordered = [...SECTIONS].sort(
      (a, b) => Math.atan2(a.anchor[2], a.anchor[0]) - Math.atan2(b.anchor[2], b.anchor[0])
    );
    const arcs = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % ordered.length];
      const pa = anchorOf(a);
      const pb = anchorOf(b);
      const dir = pb.clone().sub(pa).normalize();
      const from = pa.clone().addScaledVector(dir, daisOuterRadius(a.id) - TUCK);
      const to = pb.clone().addScaledVector(dir, -(daisOuterRadius(b.id) - TUCK));
      arcs.push(polarRoute(this.field, from, to, {
        bulge: 0.07,
        samples: 96,
        // Nunca por dentro del círculo central.
        minRadius: plazaOuter + 4,
      }));
    }

    // Ningún camino trepa el escarpe.
    //
    // El trazado se dibuja en planta y la altura se le pega después, así que un
    // ramal puede acabar subiendo una pared sin que nada lo impida. Aquí pasaba
    // en tres: el arco Habilidades→Contacto cruzaba veintinueve metros de cuesta
    // con puntas del 192 % —sesenta grados—, y otros dos hacían lo propio con
    // el mismo escarpe.
    //
    // Se intentó primero salvarlo moviendo la panza del arco, que es el único
    // grado de libertad que tiene la ruta. No sirve, y merece quedar escrito:
    // barriendo la panza de −0,30 a +0,55 el mejor caso seguía siendo de 22 m
    // de cuesta al 100 %. El escarpe es un murallón CONTINUO entre las dos
    // mesetas, no un bulto que se pueda rodear. Por eso el paso entre ellas es
    // ahora el pasadizo excavado (`Souterrain`) y no un empedrado imposible.
    const descartados = [];

    /**
     * Metros de camino que se VEN: los que caen fuera de todo estrado.
     *
     * Es la medida que importa y no el largo total. Los radios salen cortos
     * porque los estrados están pegados al círculo central, y lo que decide si
     * un ramal se lee como enlace o como retal es cuánto adoquín queda a la
     * vista entre dos plataformas — no cuánto mide contando lo que va enterrado
     * debajo de ellas.
     */
    // El radio que tapa es el de la PIEDRA, no el nominal: `daisOuterRadius`
    // añade 1,6 m de holgura que en realidad es prado. Midiendo contra el
    // nominal menos el remetido, los dos metros de empedrado que van bajo la
    // losa contaban como visibles y un arco de once metros pasaba el corte.
    const PIEDRA = 1.6;
    const bordes = [
      { x: 0, z: 0, r: plazaOuter - PIEDRA },
      ...SECTIONS.map((d) => ({ x: d.anchor[0], z: d.anchor[2], r: daisOuterRadius(d.id) - PIEDRA })),
    ];
    const largoVisible = (ruta) => {
      let l = 0;
      for (let i = 1; i < ruta.length; i++) {
        const p = ruta[i];
        const q = ruta[i - 1];
        const dentro = bordes.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.r);
        if (!dentro) l += Math.hypot(p.x - q.x, p.z - q.z);
      }
      return l;
    };

    const transitable = (ruta, nombre) => {
      // Diez metros a la vista. Con siete todavía pasaba el arco Contacto→Sobre
      // mí, y sigue leyéndose como un gancho suelto: sus dos extremos SÍ se
      // meten bajo la piedra del estrado, pero el estrado sobresale del prado,
      // así que el empedrado desaparece detrás de su canto en vez de verse
      // llegar. Lo que queda a la vista es una tira en medio del prado sin
      // principio ni final.
      const visible = largoVisible(ruta);
      if (visible < 10) {
        descartados.push(`${nombre} (solo ${visible.toFixed(1)} m a la vista: retal)`);
        return false;
      }
      const { empinado, maxima } = routeClimb(ruta);
      if (empinado <= 8) return true;
      descartados.push(`${nombre} (${empinado.toFixed(0)} m al ${(maxima * 100).toFixed(0)} %)`);
      return false;
    };

    this.routes = [
      ...spokes.filter((r, i) => transitable(r, `radio ${SECTIONS[i].id}`)),
      ...arcs.filter((r, i) => transitable(r, `arco ${ordered[i].id}→${ordered[(i + 1) % ordered.length].id}`)),
    ];
    this.routesDropped = descartados;
  }

  _buildTerrain() {
    // El mapa de nubes se registra ANTES de teselar el terreno.
    //
    // El terreno lo lee para proyectar las manchas que cruzan el prado, y su
    // material se compila en el primer fotograma — que llega antes de que se
    // construya el cielo, un par de etapas más tarde. `cloudTexture` cachea por
    // clave, así que la cúpula reutiliza esta misma textura y lo que pasa por
    // el suelo se corresponde con lo que hay arriba.
    setToonCloudMap(cloudTexture({ seed: 91, size: 512 }));

    this.terrain = buildTerrain(this.field);
    this.scene.add(this.terrain);
  }

  _buildOceanAndSky() {
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.ocean = new Ocean(this.field, this.sky.sunDirection);
    this.scene.add(this.ocean.mesh);


    // Densidad calculada para que el mar esté apagado al 84 % cuando se acaba
    // la lámina de agua, a 1300 unidades: exp(-(0.00105·1300)²) = 0.16. En la
    // isla, cuyo punto más lejano queda a unas 340 unidades, la bruma se queda
    // en un 12 % — suficiente para dar perspectiva aérea sin lavar el prado.
    this.scene.fog = new THREE.FogExp2(PALETTE.fogColor, 0.00105);
  }

  _buildGrass() {
    const count = this.quality === 'high' ? QUALITY.grassBlades : Math.round(QUALITY.grassBlades * 0.42);
    this.grass = createGrass(this.field, this.sky.sunDirection, {
      count,
      keepOut: this.paveKeepOut(),
    });
    this.scene.add(this.grass);
  }

  /**
   * Círculos de enlosado, sacados de `config.DAIS`. La hierba y el arbolado
   * los comparten para no invadir las plataformas.
   */
  paveKeepOut() {
    return [
      { x: 0, z: 0, radius: daisOuterRadius('plaza') },
      ...SECTIONS.map((def) => ({
        x: def.anchor[0],
        z: def.anchor[2],
        radius: daisOuterRadius(def.id),
      })),
      // Los caminos, como cadena de círculos: 2.1 de radio cada 2 muestras de
      // ruta cubre una banda de 3.3 m, justo la anchura del empedrado. Más
      // radio dejaría una calva de hierba a los lados; menos, briznas
      // asomando entre los adoquines.
      ...pathKeepOut(this.routes ?? [], 2.1, 2.0),
      // La escalinata del Camino del Viajero. No sale de `routes` porque no la
      // traza el mundo sino el propio santuario, cuatro etapas más tarde: sin
      // esto, la hierba y el arbolado no se enteran de que existe.
      ...travellerKeepOut(SECTIONS.find((d) => d.id === 'experience')),
      // Y el pasadizo: ni hierba ni árboles sobre las bocas ni sobre la trinchera
      // de acceso, que si no la entrada queda tapada por una mata.
      ...souterrainKeepOut(),
      // Y la escalinata a Habilidades, por lo mismo: cuarenta metros de peldaños
      // con matorral creciendo entre ellos no se leen como obra.
      ...stairwayKeepOut(this.field),
      // El arranque de la calzada. La hierba se para en `WORLD.radius * 1.02`
      // y el estribo cae justo ahí: sin esto, las últimas briznas brotan a
      // través de la primera losa.
      ...calzadaKeepOut(this.field, ISLOTE),
      // Y el dolmen, que está en el islote y por tanto fuera del alcance de la
      // hierba — pero el pedregal sí llega, y una tumba con cuatro bolos
      // dentro de la cámara no se lee como una tumba.
      {
        x: Math.cos(ISLOTE.rumbo) * ISLOTE.distancia,
        z: Math.sin(ISLOTE.rumbo) * ISLOTE.distancia,
        radius: DOLMEN_RADIO,
      },
    ];
  }

  /**
   * Plaza central: el corro grande de trilitos donde aterriza el visitante.
   * Es el nodo del que salen todas las líneas ley.
   */
  _buildPlaza() {
    const group = new THREE.Group();
    group.name = 'plaza';
    group.position.y = this.field.height(0, 0);

    const dais = createDais({
      radius: WORLD.plazaRadius,
      steps: 3,
      stepWidth: 2.6,
      color: PALETTE.arcane,
      motif: 'triskel',
      seed: 101,
      // La plaza está en el llano, así que su muro apenas asoma; se le pasa
      // igualmente para que no dependa de dónde acabe si se mueve la semilla.
      groundAt: (lx, lz) => this.field.meshHeight(lx, lz) - this.field.height(0, 0),
    });
    group.add(dais);
    this.plazaOuterRadius = WORLD.plazaRadius + 3 * 2.6 + 1;

    // Anillo de trilitos, con un hueco abierto hacia el mar.
    const count = 8;
    const radius = WORLD.plazaRadius - 8;
    const random = makeRandom(SEED + 12);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.22;
      // Hueco: se salta el trilito que da al mirador de entrada.
      if (i === 2) continue;
      const trilithon = createTrilithon({
        height: 7.4 + random() * 1.4,
        gap: 3.0,
        postWidth: 1.8,
        postDepth: 1.35,
        seed: SEED + 400 + i * 7,
      });
      trilithon.position.set(Math.cos(a) * radius, 0.3, Math.sin(a) * radius);
      trilithon.rotation.y = -a + Math.PI / 2;
      group.add(trilithon);
    }

    // Anillo interior de piedras bajas.
    const inner = radius - 7;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.1;
      const stone = stoneMesh(
        createStone({
          width: 1.5,
          height: 2.4 + (i % 3) * 0.5,
          depth: 0.95,
          seed: SEED + 500 + i,
          detail: 2,
          roundness: 0.36,
          erosion: 0.15,
          taper: 0.14,
        })
      );
      stone.position.set(Math.cos(a) * inner, 0.3, Math.sin(a) * inner);
      stone.rotation.y = -a;
      group.add(stone);
    }

    // Altar central bajo, para que el centro no quede vacío.
    const centre = stoneMesh(
      createStone({
        width: 3.6,
        height: 1.1,
        depth: 3.6,
        seed: SEED + 611,
        detail: 3,
        roundness: 0.55,
        erosion: 0.08,
        taper: -0.06,
      })
    );
    centre.position.y = 0.3;
    group.add(centre);

    this.scene.add(group);
    this.plaza = group;
    this.plazaCenter = new THREE.Vector3(0, this.field.height(0, 0), 0);

    // Piedras sueltas repartidas por el promontorio: rompen el prado vacío.
    this._scatterRocks();
  }

  /** Caminos empedrados entre el círculo central y cada santuario. */
  _buildPaths() {
    const group = new THREE.Group();
    group.name = 'caminos';
    group.add(createPaths(this.field, this.routes, { width: 3.4 }));
    group.add(createPathKerb(this.field, this.routes, { width: 3.4 }));
    this.scene.add(group);
    this.paths = group;
  }

  /**
   * Pedregal: bolos grandes repartidos por el promontorio y una capa densa de
   * guijarros a ras de suelo.
   *
   * Va instanciado. Antes era una malla suelta por piedra: 190 llamadas de
   * dibujo solo para el pedregal, más que todo el arbolado junto.
   */
  _scatterRocks() {
    const random = makeRandom(SEED + 808);
    const group = new THREE.Group();
    group.name = 'pedregal';

    const upright = new THREE.Vector3(0, 1, 0);
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scaleV = new THREE.Vector3();

    // El pedregal también respeta por dónde se anda.
    //
    // Antes solo miraba la plaza y las explanadas de los santuarios, así que
    // sembraba cantos sobre los caminos y —lo más visible— en mitad de la
    // escalinata del Camino del Viajero, que además ya lleva su propio bordillo
    // de piedras: la suma se leía como un desprendimiento sobre los peldaños.
    const vetos = this.paveKeepOut();

    /** ¿Está libre este punto de plaza, santuarios y enlosados? */
    const clear = (x, z, margin) => {
      if (Math.hypot(x, z) < (this.plazaOuterRadius ?? WORLD.plazaRadius) + margin) return false;
      if (SECTIONS.some(
        (d) => Math.hypot(x - d.anchor[0], z - d.anchor[2]) < (PAD_RADIUS[d.id] ?? 16) + margin
      )) return false;
      return !vetos.some((v) => Math.hypot(x - v.x, z - v.z) < v.radius + 0.6);
    };

    /**
     * @param {string} label
     * @param {number[]} radii     Rango de radio de la piedra.
     * @param {number} count
     * @param {number} minHeight   Altura mínima sobre el mar.
     * @param {boolean} shadows
     */
    const layer = (label, radii, count, minHeight, margin, scaleRange, shadows, variants, detail) => {
      const geos = [];
      for (let i = 0; i < variants; i++) {
        geos.push(createBoulder({
          radius: radii[0] + random() * (radii[1] - radii[0]),
          seed: SEED + 5000 + label.length * 97 + i,
          detail,
        }));
      }
      const buckets = geos.map(() => []);

      let placed = 0;
      let guard = 0;
      while (placed < count && guard < count * 26) {
        guard++;
        const r = Math.sqrt(random()) * WORLD.radius * 1.05;
        const a = random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        // `meshHeight`, no `height`: lo que se ve del terreno es la malla, y en
        // una loma la interpolación de la malla queda por DEBAJO de la altura
        // analítica. Apoyando el canto en la analítica, en cuanto el suelo se
        // curva la piedra se queda flotando unos decímetros — y sobre un camino,
        // que además va levantado, se ve a la legua.
        const y = this.field.meshHeight(x, z);
        if (y < WORLD.seaLevel + minHeight) continue;
        if (!clear(x, z, margin)) continue;
        buckets[placed % geos.length].push({ x, y, z, n: this.field.normal(x, z) });
        placed++;
      }

      geos.forEach((geo, i) => {
        const list = buckets[i];
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geo, rockMaterial({ dark: true }), list.length);
        mesh.name = `${label}-${i}`;
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        list.forEach((s, k) => {
          position.set(s.x, s.y - 0.25, s.z);
          // En pendiente la piedra se asienta con el terreno; en llano gira libre.
          if (s.n.y < 0.9) quat.setFromUnitVectors(upright, s.n);
          else quat.setFromEuler(new THREE.Euler(
            random() * 0.4 - 0.2, random() * Math.PI * 2, random() * 0.4 - 0.2
          ));
          scaleV.setScalar(scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]));
          matrix.compose(position, quat, scaleV);
          mesh.setMatrixAt(k, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      });
      return placed;
    };

    // Bolos: los que ya había, ahora instanciados.
    this.boulderCount = layer('bolo', [0.7, 2.4], 190, 3, 5, [0.6, 2.1], true, 10, 2);
    // Guijarros: capa densa y baja que quita la sensación de suelo liso.
    this.pebbleCount = layer('guijarro', [0.16, 0.4], 900, 6, 2, [0.5, 1.3], false, 6, 1);

    this.scene.add(group);
    this.scatter = group;
  }

  _buildShrine(id) {
    const def = SECTIONS.find((s) => s.id === id);
    const Klass = SHRINE_CLASSES[id];
    const shrine = new Klass({ def, field: this.field }).build();
    this.scene.add(shrine.group);
    for (const extra of shrine.detached ?? []) this.scene.add(extra);
    this.shrines.push(shrine);
    for (const h of shrine.hotspots) this.hotspotObjects.push(h.object);
    return shrine;
  }

  /** El pasadizo bajo el cerro. El terreno ya viene perforado de `_buildField`. */
  _buildSouterrain() {
    this.souterrain = createSouterrain(this.field);
    this.scene.add(this.souterrain);
  }

  /**
   * La escalinata de la plaza a Habilidades. El desmonte ya está excavado en
   * `_buildField`; aquí solo se levanta la cantería.
   */
  _buildStairway() {
    this.stairway = createStairway(this.field);
    this.scene.add(this.stairway);
  }

  /**
   * Piedras grabadas repartidas por la isla.
   *
   * No son decoración suelta: van donde hay algo que señalar — junto a las
   * bocas del pasadizo, al pie de la escalinata de Trayectoria y en los altos
   * desde donde se ve el conjunto. Una piedra con runas en mitad de la nada se
   * lee como atrezo; puesta donde el visitante ya está mirando, se lee como una
   * señal, que es lo que era.
   *
   * Se plantan de una en una y a mano —son ocho— en vez de esparcirlas al azar:
   * cada emplazamiento tiene una razón y ninguna es «cayó ahí».
   */
  _buildRuneStones() {
    const group = new THREE.Group();
    group.name = 'piedras-runadas';
    const random = makeRandom(SEED + 6600);
    const [bocaA, bocaB] = souterrainMouths();
    const experience = SECTIONS.find((d) => d.id === 'experience');

    const sitios = [
      // Las dos bocas ya llevan su losa de umbral dentro de `createSouterrain`;
      // estas son las que se ven ANTES de llegar, desde lejos, y las que hacen
      // que se busque la entrada.
      { x: bocaA.x - 13, z: bocaA.y - 7, motif: 'espirales', escala: 1.15 },
      { x: bocaB.x + 11, z: bocaB.y + 9, motif: 'nudo', escala: 1.05 },
      // Al pie de la escalinata, mirando cuesta arriba.
      { x: experience.anchor[0] + 14, z: experience.anchor[2] + 10, motif: 'runa', escala: 0.95 },
      { x: experience.anchor[0] - 12, z: experience.anchor[2] + 16, motif: 'roseta', escala: 0.9 },
      // Hitos en la meseta, a media distancia entre santuarios.
      { x: -46, z: -18, motif: 'espirales', escala: 1.2 },
      { x: 6, z: -52, motif: 'nudo', escala: 1.0 },
      { x: 40, z: 34, motif: 'roseta', escala: 1.1 },
      { x: -16, z: 62, motif: 'runa', escala: 0.95 },
    ];

    let puestas = 0;
    sitios.forEach((s, i) => {
      const y = this.field.height(s.x, s.z);
      // Ni en el agua ni en una pared: una estela solo se sostiene en suelo.
      if (y < WORLD.seaLevel + 20 || this.field.slope(s.x, s.z) > 0.32) return;
      const piedra = runeStone({
        width: 2.5 * s.escala,
        height: 3.1 * s.escala,
        depth: 1.05 * s.escala,
        motif: s.motif,
        seed: SEED + 6700 + i * 31,
        color: PALETTE.arcane,
        glow: 0.40,
      });
      piedra.position.set(s.x, y - 0.25, s.z);
      // Mirando al centro de la isla: es de donde viene quien las lee.
      piedra.rotation.y = Math.atan2(-s.x, -s.z) + (random() - 0.5) * 0.5;
      group.add(piedra);
      puestas++;
    });

    group.userData.count = puestas;
    this.runeStones = group;
    this.scene.add(group);
  }

  /**
   * Arbolado. Va después de los santuarios porque necesita el trazado del
   * sendero de Trayectoria para plantar a sus lados.
   */
  _buildForest() {
    const experience = this.getShrine('experience');
    const dense = this.quality === 'high';
    this.forest = new Forest(this.field, {
      pathPoints: experience?.pathWorldPoints(28) ?? [],
      keepOut: forestKeepOut({
        padRadius: PAD_RADIUS,
        homeView: HOME_VIEW.position,
        shrines: this.shrines,
        corridors: [
          ...travellerKeepOut(SECTIONS.find((d) => d.id === 'experience'), { radius: 10 }),
          ...souterrainKeepOut().map((z) => ({ ...z, radius: z.radius + 5 })),
          // La escalinata necesita MÁS holgura que la que la protege de que le
          // brote hierba encima. El veto de enlosado deja el árbol a cuatro
          // metros del murete, y a cuatro metros un carballo de esta isla te
          // cierra la copa sobre los peldaños: cuarenta metros de cantería
          // debajo de un túnel de hojas no se ven desde ningún sitio.
          ...stairwayKeepOut(this.field).map((z) => ({ ...z, radius: z.radius + 6 })),
        ],
      }),
      paveKeepOut: this.paveKeepOut(),
      trees: dense ? 150 : 78,
      pathTrees: dense ? 16 : 10,
      shrubs: dense ? 620 : 280,
      ferns: dense ? 260 : 110,
    });
    this.scene.add(this.forest.group);
  }

  _buildLeyLines() {
    const group = new THREE.Group();
    group.name = 'ley';

    const ring = createLeyRing(this.field, new THREE.Vector3(0, 0, 0), WORLD.plazaRadius + 4.5, {
      color: PALETTE.arcane,
      width: 0.20,
      intensity: 0.40,
    });
    group.add(ring);
    this.leyRing = ring;

    this.leyLines = [];
    for (const shrine of this.shrines) {
      // La veta va por su cuenta, del anillo de la plaza al monumento.
      //
      // Llegó a compartir trazado con el camino empedrado, pero los radios de
      // la red física miden dos metros —los estrados están pegados al círculo
      // central— y la veta se quedaba en un muñón. La energía puede cruzar el
      // enlosado; el camino no.
      const to = shrine.leyPoint;
      const dir = to.clone().normalize();
      const from = dir.multiplyScalar(WORLD.plazaRadius + 4.5);
      const line = createLeyLine(this.field, from, to, {
        color: shrine.def.color,
        width: 0.20,
        intensity: 0.40,
        speed: 0.12,
        arc: 0.10,
        samples: 90,
      });
      line.userData.shrineId = shrine.id;
      group.add(line);
      this.leyLines.push(line);
    }

    this.scene.add(group);
    this.ley = group;
  }

  /**
   * La calzada y lo que hay al otro lado.
   *
   * Va después del arbolado porque no lo necesita para nada, y antes de los
   * espíritus porque el dolmen es un ancla más a la que acudir.
   */
  _buildIslote() {
    this.calzada = createCalzada(this.field, {
      rumbo: ISLOTE.rumbo,
      distancia: ISLOTE.distancia,
      ancho: ISLOTE.calzada.ancho,
      tramo: ISLOTE.calzada.tramo,
    });
    this.scene.add(this.calzada);

    // Y la escalinata desde el desembarco hasta la explanada del dolmen. Ver
    // `createEscalinata`: sin ella se cruza el puente y no se puede subir, que
    // es peor que no tener puente.
    const plan = this.escalinataPlan;
    this.escalinata = createEscalinata(this.field, {
      rumbo: ISLOTE.rumbo,
      desdeD: plan.pieD,
      hastaD: plan.cimaD,
      cotaSalida: plan.pieY,
      cotaLlegada: plan.cimaY,
    });
    this.scene.add(this.escalinata);

    // El dolmen, en la cima. Mira hacia la calzada: la boca de una cámara da
    // a donde llega la gente, no al mar abierto.
    const centro = this.isloteCentro;
    const cima = this.field.height(centro.x, centro.y);
    this.dolmen = createDolmen({ rumbo: ISLOTE.rumbo + Math.PI, escala: 1.15, seed: SEED % 733 });
    this.dolmen.position.set(centro.x, cima, centro.y);
    this.scene.add(this.dolmen);

    // Cuatro bolos sueltos por la ladera. El islote queda fuera del radio de
    // la hierba y del arbolado —los dos se paran en `WORLD.radius`— así que es
    // roca pelada, y eso está bien: contrasta con el prado y dice que ahí no
    // vive nadie. Pero pelado del todo se lee como terreno sin terminar.
    const rnd = makeRandom(SEED % 401);
    for (let i = 0; i < 4; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = ISLOTE.radius * (0.30 + rnd() * 0.42);
      const x = centro.x + Math.cos(ang) * r;
      const z = centro.y + Math.sin(ang) * r;
      const y = this.field.height(x, z);
      if (y < 1.2) continue;
      const bolo = createBoulder({ radius: 0.9 + rnd() * 1.5, seed: SEED + 500 + i, detail: 3 });
      const malla = stoneMesh(bolo, { dark: rnd() > 0.5, name: `islote-bolo-${i}` });
      // Por la base, como todo lo que sale de `StoneFactory`. Un cuarto de
      // metro enterrado para que no se vea flotar el canto.
      malla.position.set(x, y - 0.3, z);
      malla.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
      this.scene.add(malla);
    }
  }

  _buildAtmosphere() {
    const count = this.quality === 'high' ? QUALITY.motes : Math.round(QUALITY.motes * 0.5);
    this.motes = createMotes(this.field, { count });
    this.scene.add(this.motes);

    this.birds = createBirds({ count: this.quality === 'high' ? 16 : 8 });
    this.scene.add(this.birds);
  }

  /**
   * Los aos sí.
   *
   * Va después de los santuarios Y del souterrain, y no es un capricho del
   * orden: necesitan las dos cosas. Las anclas por las que se reparten son los
   * monumentos, y el hogar del que salen es la boca del pasadizo — un síd ES
   * un túmulo, así que la casa de la gente del cerro tenía que ser el cerro
   * que ya había.
   */
  _buildEspiritus() {
    const [boca] = souterrainMouths();
    const hogar = new THREE.Vector3(boca.x, this.field.height(boca.x, boca.y) + 2, boca.y);

    const anclas = this.shrines.map((s) => ({ id: s.id, pos: s.group.position.clone() }));
    anclas.push({ id: 'cerro', pos: hogar.clone() });
    anclas.push({ id: 'plaza', pos: new THREE.Vector3(0, this.field.height(0, 0) + 2, 0) });

    const count =
      this.quality === 'high' ? QUALITY.espiritus : Math.round(QUALITY.espiritus * 0.5);
    this.espiritus = new Espiritus(this.field, { count, hogar, anclas });
    this.scene.add(this.espiritus.group);
  }

  _buildLights() {
    const sunDir = this.sky.sunDirection;

    // El cel shading no lee el array de luces: con dos direccionales en escena
    // el índice 0 no siempre es el sol. Toma la dirección de aquí, en mundo.
    setToonSun(sunDir);

    this.sun = new THREE.DirectionalLight(PALETTE.sunColor, 3.3);
    this.sun.position.copy(sunDir).multiplyScalar(180);
    this.sun.castShadow = true;
    const shadowSize = this.quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 460;
    // Área acotada: la sombra sigue al visitante para no repartir la
    // resolución por 600 unidades de prado que nadie está mirando.
    const extent = 95;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // El rebote del suelo va en oliva apagado, no en el verde del prado: con
    // el verde puro toda la piedra vertical se teñía y los menhires parecían
    // arbustos.
    this.hemi = new THREE.HemisphereLight(PALETTE.skyHorizon, 0x64604a, 1.35);
    this.scene.add(this.hemi);

    // Rebote frío desde el mar: rellena las caras en sombra del acantilado.
    this.bounce = new THREE.DirectionalLight(PALETTE.oceanShallow, 0.55);
    this.bounce.position.set(-sunDir.x * 120, 30, -sunDir.z * 120);
    this.scene.add(this.bounce);
  }

  /**
   * Enchufa el ciclo de día. Se llama desde la experiencia porque necesita el
   * renderizador y la cadena de post-proceso, que el mundo no conoce.
   */
  attachTimeOfDay({ renderer, postfx, inicial, estacion }) {
    this.time = new TimeOfDay({
      inicial,
      estacion,
      sky: this.sky,
      ocean: this.ocean,
      grass: this.grass,
      scene: this.scene,
      sun: this.sun,
      renderer,
      postfx,
    });
    return this.time;
  }

  /** Ids y etiquetas de los momentos disponibles. */
  static get phases() {
    return PHASES.map((p) => ({ id: p.id, label: p.label }));
  }

  /** Ids y etiquetas de las estaciones disponibles. */
  static get seasons() {
    return ESTACIONES.map((e) => ({ id: e.id, label: e.label }));
  }

  // ------------------------------------------------------------------ ciclo

  update(dt, ctx) {
    this.elapsed += dt;
    const context = { ...ctx, elapsed: this.elapsed };

    this.sky?.update(dt, ctx.camera);
    this.ocean?.update(dt);
    this.time?.update(dt);
    tickToonClouds(dt);

    for (const shrine of this.shrines) shrine.update(dt, context);

    // Cuántos hay despiertos sale de multiplicar la hora por la estación, y las
    // dos ya vienen interpoladas por `TimeOfDay`: al cambiar de momento o de
    // estación, salen o se meten en el cerro solos, sin un caso especial aquí.
    if (this.espiritus) {
      const sidhe = this.time?.value.sidhe ?? 0.35;
      const velo = this.time?.estacionValor.velo ?? 1;
      this.espiritus.update(dt, {
        camera: ctx.camera,
        activeSection: ctx.activeSection,
        presencia: sidhe * velo,
      });
    }

    // La sombra acompaña al punto que mira la cámara.
    if (this.sun) {
      const focus = ctx.focus ?? ctx.camera.position;
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.sky.sunDirection, 200);
    }

    // Las líneas ley se encienden hacia el santuario activo.
    if (this.leyLines) {
      for (const line of this.leyLines) {
        const active = line.userData.shrineId === ctx.activeSection;
        const u = line.userData.uniforms;
        u.uActive.value += ((active ? 1.2 : 0.3) - u.uActive.value) * Math.min(1, dt * 3);
      }
    }
  }

  /** Devuelve el santuario por id. */
  getShrine(id) {
    return this.shrines.find((s) => s.id === id);
  }

  setActiveSection(id) {
    for (const shrine of this.shrines) shrine.setActive(shrine.id === id);
  }
}
