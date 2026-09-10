/**
 * La escalinata y la isla flotante: que estén, que se sostengan y que se puedan
 * subir.
 *
 * Cada afirmación de aquí abajo nació de un fallo real, y ninguna se puede
 * comprobar mirando la pantalla:
 *
 *  · Las caras del césped miraban al suelo. La isla se veía con la cubierta de
 *    piedra beige y el material era el correcto: lo que pasaba es que 528 de
 *    572 triángulos estaban bobinados al revés y se recortaban por cara
 *    trasera, dejando ver el interior de la quilla.
 *
 *  · El veto del arbolado estaba en la lista equivocada —`paveKeepOut`, que
 *    sólo consulta el matorral— y seguían plantándose robles debajo de la isla.
 *
 *  · Las pasarelas se registraron con la altura LOCAL del santuario, sesenta y
 *    un metros por debajo de la escalinata que decían describir. En pantalla no
 *    se notaba nada: la obra estaba bien puesta y sólo fallaba el andar.
 *
 *  · La fuente quedó enterrada bajo el césped, con el agua por debajo del
 *    prado.
 *
 *   node tools/isla-check.mjs
 */

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:5173/?instant';
const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No encuentro Chromium. Define CHROME_PATH.');
  process.exit(1);
}

let fallos = 0;
const comprobar = (ok, texto, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? '✓' : '✗'} ${texto}${detalle ? `  ${detalle}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });
const errores = [];
page.on('pageerror', (e) => errores.push(e.message.slice(0, 200)));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 240000 });
await page.waitForFunction(
  () => {
    const el = document.querySelector('.loader__enter');
    return el && !el.hidden;
  },
  { timeout: 240000 }
);
await page.click('.loader__enter');
await new Promise((r) => setTimeout(r, 2000));

const m = await page.evaluate(async () => {
  const ex = window.__portfolio;
  const campo = ex.world.field;
  const o = {};

  let quilla = null;
  let cesped = null;
  let esc = null;
  let isla = null;
  let agua = null;
  let brocal = null;
  ex.scene.traverse((n) => {
    if (n.name === 'isla-quilla') quilla = n;
    if (n.name === 'isla-cesped') cesped = n;
    if (n.name === 'escalinata-isla-cuerpo') esc = n;
    if (n.name === 'isla-flotante') isla = n;
    if (n.name === 'fuente-agua') agua = n;
    if (n.name === 'fuente-brocal') brocal = n;
  });
  o.piezas = {
    quilla: !!quilla,
    cesped: !!cesped,
    escalinata: !!esc,
    isla: !!isla,
    agua: !!agua,
    brocal: !!brocal,
  };
  if (!isla || !esc || !cesped) return o;

  // ── El césped mira arriba ──────────────────────────────────────────────
  {
    const a = cesped.geometry.attributes.position;
    const ix = cesped.geometry.index;
    let arriba = 0;
    let abajo = 0;
    for (let t = 0; t < ix.count; t += 3) {
      const A = [a.getX(ix.getX(t)), a.getY(ix.getX(t)), a.getZ(ix.getX(t))];
      const B = [a.getX(ix.getX(t + 1)), a.getY(ix.getX(t + 1)), a.getZ(ix.getX(t + 1))];
      const C = [a.getX(ix.getX(t + 2)), a.getY(ix.getX(t + 2)), a.getZ(ix.getX(t + 2))];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      if (u[2] * v[0] - u[0] * v[2] > 0) arriba++;
      else abajo++;
    }
    o.cesped = { arriba, abajo };
  }

  // ── El césped vira con la hora, como el prado del mundo ────────────────
  //
  // La comprobación mira la CAUSA y no el síntoma. El síntoma era que de noche
  // la cubierta se quedaba de un verde de rotulador mientras el prado de abajo
  // se apagaba; la causa es que el césped de la isla era el único material que
  // no pasaba por `applyToonShading`, así que no leía los tintes de la hora.
  //
  // Los uniformes de tiempo son objetos COMPARTIDOS: todos los materiales del
  // mundo apuntan a los mismos. Comprobar que son el mismo objeto —y no dos con
  // el mismo valor— es lo que garantiza que no se pueden desincronizar.
  {
    let terreno = null;
    ex.scene.traverse((n) => {
      if (n.isMesh && n.name === 'terrain') terreno = n;
    });
    // `applyToonShading` los deja en `userData.toon`, no en `userData.uniforms`.
    const uC = cesped.material.userData?.toon;
    const uT = terreno?.material?.userData?.toon;
    o.tinte = {
      cespedTiene: Boolean(uC?.uTimeLight && uC?.uTimeShade),
      terrenoTiene: Boolean(uT?.uTimeLight && uT?.uTimeShade),
      mismoObjeto: Boolean(uC && uT && uC.uTimeLight === uT.uTimeLight && uC.uTimeShade === uT.uTimeShade),
    };
  }

  // ── Y la quilla mira hacia fuera ───────────────────────────────────────
  {
    const a = quilla.geometry.attributes.position;
    const ix = quilla.geometry.index;
    let fuera = 0;
    let dentro = 0;
    for (let t = 0; t < ix.count; t += 3) {
      const Q = [0, 1, 2].map((k) => {
        const i = ix.getX(t + k);
        return [a.getX(i), a.getY(i), a.getZ(i)];
      });
      const u = [Q[1][0] - Q[0][0], Q[1][1] - Q[0][1], Q[1][2] - Q[0][2]];
      const v = [Q[2][0] - Q[0][0], Q[2][1] - Q[0][1], Q[2][2] - Q[0][2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const cx = (Q[0][0] + Q[1][0] + Q[2][0]) / 3;
      const cz = (Q[0][2] + Q[1][2] + Q[2][2]) / 3;
      if (n[0] * cx + n[2] * cz > 0) fuera++;
      else dentro++;
    }
    o.quilla = { fuera, dentro };
  }

  // ── La fuente no está enterrada ────────────────────────────────────────
  if (agua && cesped) {
    const a = cesped.geometry.attributes.position;
    let cotaCentro = -Infinity;
    for (let i = 0; i < a.count; i++) {
      if (Math.hypot(a.getX(i), a.getZ(i)) < 2.6) cotaCentro = Math.max(cotaCentro, a.getY(i));
    }
    o.fuente = { agua: +agua.position.y.toFixed(2), cespedEnElCentro: +cotaCentro.toFixed(2) };
  }

  // ── La sección, su plan y sus pasarelas ────────────────────────────────
  const ISLA = await import('/src/models/IslaFlotante.js');
  const sec = Object.values(ex.world.shrines || {}).find((s) => s.planEscalinata);
  if (!sec) {
    o.error = 'no encuentro la sección con escalinata';
    return o;
  }
  const P = sec.planEscalinata.peldanos;
  const dy = sec.group.position.y;
  const enMundo = (i) => {
    const a = sec.localToWorldXZ(P[i].x, P[i].z);
    return { x: a.x, y: P[i].y + dy, z: a.z };
  };

  let salto = 0;
  for (let i = 0; i + 1 < P.length; i++) salto = Math.max(salto, Math.abs(P[i + 1].y - P[i].y));
  o.escalinata = {
    peldanos: P.length,
    contrahuellaPeor: +salto.toFixed(2),
    escalonDelPaseo: ex.rig.walk.escalon,
    pie: +enMundo(0).y.toFixed(1),
    cima: +enMundo(P.length - 1).y.toFixed(1),
  };

  // El campo tiene que devolver la cota del peldaño en el centro de cada uno.
  let peor = 0;
  for (let i = 0; i < P.length; i++) {
    const w = enMundo(i);
    peor = Math.max(peor, Math.abs(campo.walkHeight(w.x, w.z, w.y) - w.y));
  }
  o.escalinata.errorDePasarela = +peor.toFixed(2);

  // ── Que se pueda pisar TODA la huella del tramo VOLADO ─────────────────
  //
  // Es la comprobación que habría cazado el atasco: el corredor pisable iba
  // medio metro más estrecho que la piedra a cada lado, así que había huella
  // que se veía maciza y no tenía suelo. Medido sólo en el eje salía perfecto.
  //
  // Y se mide sólo donde la escalinata vuela. En el tramo de tierra los lados
  // NO tienen por qué coincidir con la huella —la obra está encajada en la
  // cuesta, y dos metros al lado la ladera sube metro y pico— así que exigirlo
  // allí marca noventa y seis faltas que son el monte haciendo de monte. Aquí
  // lo que se busca es el agujero: sitio pisado que no sostiene. Sobre tierra
  // salirse cuesta un tropiezo; sobre el vacío, veinte metros.
  const ANCHO_OBRA = 4.6;
  let sinSuelo = 0;
  let total = 0;
  let peorHueco = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    if (P[i].u <= sec.planEscalinata.uDespegue) continue; // sólo el vuelo
    const A = enMundo(i);
    const B = enMundo(i + 1);
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = dz / l;
    const nz = -dx / l;
    for (const t of [0.15, 0.5, 0.85]) {
      const cy = A.y + (B.y - A.y) * t;
      for (const lado of [-1, -0.5, 0, 0.5, 1]) {
        const off = lado * (ANCHO_OBRA / 2 - 0.25);
        const x = A.x + dx * t + nx * off;
        const z = A.z + dz * t + nz * off;
        total++;
        // Sólo las CAÍDAS: que el suelo esté más alto es la ladera, no un hueco.
        const caida = cy - campo.walkHeight(x, z, cy);
        if (caida > 0.5) {
          sinSuelo++;
          peorHueco = Math.max(peorHueco, caida);
        }
      }
    }
  }
  o.huella = { muestras: total, sinSuelo, peorHueco: +peorHueco.toFixed(1) };

  // ── Y que no atraviese la peña ─────────────────────────────────────────
  //
  // Subiendo hasta el final del recorrido, los últimos peldaños llegaban a la
  // cubierta cuando ya estaban dentro del radio de la roca: la escalinata
  // entraba por la panza y salía por el césped, como un tornillo, y desde fuera
  // se veían tramos incrustados en la peña.
  {
    const cIsla = sec.islaLocal;
    const cubierta = sec.cotaCubierta;
    let dentroDeLaPena = 0;
    for (const e of P) {
      const d = Math.hypot(e.x - cIsla.x, e.z - cIsla.z);
      const prof = cubierta - e.y;
      if (prof <= 0.05 || prof > 23) continue;
      // Radio de la roca a esa profundidad, leído del propio módulo.
      if (d < ISLA.radioEnProfundidad(-prof) * 16) dentroDeLaPena++;
    }
    o.dentroDeLaPena = dentroDeLaPena;
  }

  // ── Y que nada corte el paso ───────────────────────────────────────────
  //
  // El menhir del presente estaba plantado sobre los peldaños: tres metros y
  // medio más allá del despegue medidos A LO LARGO del recorrido, que con el
  // sendero enlosado de antes era el final del camino y con la escalinata es la
  // escalinata. Ocho metros y medio de piedra atravesados en el paso.
  //
  // Se mira contra la lista de COLISIONADORES de verdad —la que usa el paseo—
  // y no contra una lista de piezas escrita a mano: lo que hay que garantizar
  // es que no haya nada que tope, venga de donde venga.
  {
    const cajas = ex.rig?.walk?.colisionadores?.cajas ?? ex.rig?.walk?.colisionadores ?? [];
    const lista = Array.isArray(cajas) ? cajas : [];
    const estorbos = [];
    for (let i = 0; i + 1 < P.length; i++) {
      const A = enMundo(i);
      for (const c of lista) {
        if (c.maxY < A.y - 0.6 || c.minY > A.y + 2.6) continue; // ni bajo los pies ni sobre la cabeza
        const dx = Math.max(c.minX - A.x, 0, A.x - c.maxX);
        const dz = Math.max(c.minZ - A.z, 0, A.z - c.maxZ);
        if (Math.hypot(dx, dz) < 1.0 && !estorbos.some((e) => e.etiqueta === c.etiqueta)) {
          estorbos.push({ etiqueta: c.etiqueta || '(sin nombre)', peldano: i });
        }
      }
    }
    o.estorbos = estorbos;
    o.colisionadores = lista.length;
  }

  // ── La cubierta: suelo dentro, nada fuera ──────────────────────────────
  const c = sec.localToWorldXZ(sec.islaLocal.x, sec.islaLocal.z);
  const cota = sec.cotaCubierta + dy;
  o.cubierta = {
    pedida: +cota.toFixed(2),
    centro: +campo.walkHeight(c.x, c.z, cota).toFixed(2),
    aOnceMetros: +campo.walkHeight(c.x + 11, c.z, cota).toFixed(2),
    aDieciseis: +campo.walkHeight(c.x + 16, c.z, cota).toFixed(2),
    mar: ex.world.WORLD?.seaLevel ?? null,
  };

  // ── El claro bajo la isla ──────────────────────────────────────────────
  let dentro = 0;
  ex.scene.traverse((n) => {
    if (!n.isInstancedMesh || !/arbol|tree|bosque|forest/i.test(n.name || '')) return;
    for (let i = 0; i < n.count; i++) {
      const mm = n.instanceMatrix.array;
      if (Math.hypot(mm[i * 16 + 12] - c.x, mm[i * 16 + 14] - c.z) < 15) dentro++;
    }
  });
  o.arbolesEnElClaro = dentro;

  // ── El manantial se enciende de noche ──────────────────────────────────
  const n = isla.userData?.nocturno;
  if (n) {
    const antes = { luz: n.luz.intensity, brillo: n.agua.material.emissiveIntensity };
    // Se llama a la función de verdad, no se imita: `world.update` pide un
    // contexto entero que aquí no hay, y montarlo a mano probaría el montaje.
    const mod = await import('/src/models/IslaFlotante.js');
    mod.prenderFuente(isla, 1);
    o.noche = {
      luzDeDia: +antes.luz.toFixed(2),
      luzDeNoche: +n.luz.intensity.toFixed(2),
      brilloDeDia: +antes.brillo.toFixed(2),
      brilloDeNoche: +n.agua.material.emissiveIntensity.toFixed(2),
    };
  } else o.noche = null;

  return o;
});

console.log('\n── La escalinata y la isla flotante ───────────────────────────\n');

console.log('  las piezas');
for (const [k, v] of Object.entries(m.piezas ?? {})) comprobar(v, `  está ${k}`);

if (m.error) {
  comprobar(false, m.error);
} else {
  console.log('\n  la cubierta de la isla');
  comprobar(
    m.cesped.abajo === 0,
    'El césped mira ARRIBA, o se ve el interior de la quilla',
    `${m.cesped.arriba} arriba / ${m.cesped.abajo} abajo`
  );
  comprobar(
    m.tinte.cespedTiene && m.tinte.terrenoTiene,
    'El césped de la isla lleva el sombreado de la hora, como el terreno'
  );
  comprobar(
    m.tinte.mismoObjeto,
    'Y lee LOS MISMOS uniformes, no unos propios que puedan desincronizarse'
  );
  comprobar(
    m.quilla.dentro === 0,
    'La quilla mira hacia FUERA, o se ve su cara interior en vez de la roca',
    `${m.quilla.fuera} fuera / ${m.quilla.dentro} dentro`
  );
  comprobar(
    m.fuente.agua > m.fuente.cespedEnElCentro,
    'La lámina de agua asoma sobre el césped, no debajo',
    `agua ${m.fuente.agua} · césped ${m.fuente.cespedEnElCentro}`
  );
  comprobar(m.arbolesEnElClaro === 0, 'Ningún árbol plantado bajo la isla', `${m.arbolesEnElClaro}`);

  console.log('\n  la escalinata');
  const e = m.escalinata;
  comprobar(e.peldanos > 60, 'Tiene peldaños de sobra para el desnivel', `${e.peldanos}`);
  comprobar(
    e.cima - e.pie > 25,
    'Sube del prado a la cubierta',
    `de ${e.pie} a ${e.cima} m`
  );
  comprobar(
    e.contrahuellaPeor < e.escalonDelPaseo,
    'Y ninguna contrahuella pasa del escalón que el paseo sabe subir',
    `${e.contrahuellaPeor} < ${e.escalonDelPaseo}`
  );

  console.log('\n  y se puede andar por ella');
  comprobar(
    e.errorDePasarela < 0.05,
    `El campo de alturas da la cota del peldaño en los ${e.peldanos}, no la del prado`,
    `error máximo ${e.errorDePasarela} m`
  );
  const hu = m.huella;
  comprobar(
    hu.sinSuelo === 0,
    'Y en el vuelo toda la huella tiene suelo, no sólo el eje',
    `${hu.sinSuelo} de ${hu.muestras} muestras al aire${hu.sinSuelo ? ` · hasta ${hu.peorHueco} m` : ''}`
  );

  console.log('\n  y de noche');
  comprobar(m.noche !== null, 'La isla declara qué se enciende');
  if (m.noche) {
    comprobar(
      m.noche.luzDeDia === 0 && m.noche.luzDeNoche > 10,
      'El manantial alumbra de noche y de día no existe',
      `${m.noche.luzDeDia} → ${m.noche.luzDeNoche}`
    );
    comprobar(
      m.noche.brilloDeNoche > m.noche.brilloDeDia + 0.3,
      'Y el agua se enciende con él',
      `${m.noche.brilloDeDia} → ${m.noche.brilloDeNoche}`
    );
  }

  comprobar(
    m.dentroDeLaPena === 0,
    'Y ningún peldaño queda incrustado dentro de la peña',
    `${m.dentroDeLaPena}`
  );

  comprobar(
    m.estorbos.length === 0,
    'Y nada con cuerpo corta el paso por la escalinata',
    m.estorbos.length
      ? m.estorbos.map((e) => `${e.etiqueta} en el ${e.peldano}`).join(', ')
      : `${m.colisionadores} colisionadores mirados`
  );

  const cu = m.cubierta;
  comprobar(
    Math.abs(cu.centro - cu.pedida) < 0.05 && Math.abs(cu.aOnceMetros - cu.pedida) < 0.05,
    'La cubierta da suelo en todo su disco',
    `centro ${cu.centro} · a 11 m ${cu.aOnceMetros}`
  );
  comprobar(
    cu.aDieciseis < cu.pedida - 5,
    'Y fuera del disco no: el borde hace de pretil sin dibujar ninguno',
    `a 16 m ${cu.aDieciseis}`
  );
}

// ── El verde de la cubierta contra el del prado, medido en píxeles ─────────
//
// Que el césped comparta el material y los uniformes de la hora dice que puede
// virar; no dice que el TONO elegido case. Eso sólo se sabe mirando lo que sale
// por pantalla, y no a ojo: el ojo en una captura compara dos verdes con luces
// distintas y se rinde.
//
// Se miden los dos en EL MISMO fotograma, para que compartan sol, exposición y
// posprocesado, y sólo sobre trozos igual de llanos: una ladera vuelta hacia el
// sol es más clara que un llano y no por su color, así que sin igualar la
// inclinación se estaría midiendo la topografía. Sin ese filtro la diferencia
// salía 18 y con él 13; cinco puntos eran monte.
//
// Y sólo a MEDIODÍA. De noche la medida oscila entre 3 y 7 entre pasadas —la
// luz del propio manantial cae sobre la hierba y las motas se mueven— así que
// no separa nada. A mediodía repite 4 y 4.
//
// El umbral sale de medir los dos casos, no de redondear: 1 con el tono actual
// —y repite 1 entre pasadas—, 10 con el que tenía hace un rato y 18 con el que
// hacía cantar a la isla. 9 los separa con ocho puntos de margen por arriba del
// caso bueno.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(
    (e) => (e.textContent || '').trim().toUpperCase() === 'MEDIODÍA'
  );
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 2600));

const sitio = await page.evaluate(() => {
  const ex = window.__portfolio;
  const sec = Object.values(ex.world.shrines || {}).find((s) => s.planEscalinata);
  const c = sec.localToWorldXZ(sec.islaLocal.x, sec.islaLocal.z);
  const cubierta = sec.cotaCubierta + sec.group.position.y;
  const rig = ex.rig;
  rig.idleDrift = false;
  rig.target.set(c.x * 0.55, cubierta - 14, c.z * 0.55);
  rig.distance = 120;
  rig.azimuth = 1.1;
  rig.polar = 0.85;
  return { cx: c.x, cz: c.z, cubierta };
});
await new Promise((r) => setTimeout(r, 2400));

const verde = await page.evaluate(({ cx, cz, cubierta }) => {
  const ex = window.__portfolio;
  const cam = ex.camera;
  const gl = ex.renderer.getContext();
  const campo = ex.world.field;
  const V = cam.position.constructor;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  ex.renderer.render(ex.scene, cam);
  const pix = new Uint8Array(4);
  // El raycaster se toma prestado del que la app ya usa para los puntos
  // interactivos: `import('three')` desde aquí no resuelve —Vite reescribe los
  // imports de los módulos que sirve, no los de un evaluate suelto— y montar
  // uno a mano habría sido reimplementar la intersección.
  const rayo = ex.interaction.raycaster;
  // Su alcance está recortado para los puntos interactivos; aquí se mide desde
  // ciento veinte metros.
  rayo.near = 0;
  rayo.far = Infinity;
  if (rayo.layers) rayo.layers.enableAll();
  const tocados = {};

  // El píxel sólo cuenta si lo que hay ahí es LA HIERBA.
  //
  // Sin esto la medida no medía nada. Los puntos se elegían por coordenada y se
  // leía el color que hubiera; desde que la cubierta tiene matorral, cantos y
  // una senda de losas, buena parte de esos puntos caen sobre una mata o una
  // piedra, cuyo color no depende del tono del césped. Con el tono viejo —el
  // que cantaba— la prueba daba 2 de diferencia en vez de 13: pasaba, y no
  // porque el color estuviera bien.
  //
  // Se tira un rayo desde la cámara y se acepta el punto sólo si lo primero que
  // encuentra es la malla que se quiere medir.
  const leerSi = (x, y, z, nombre) => {
    const v = new V(x, y, z).project(cam);
    if (Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98 || v.z > 1) return null;
    // `setFromCamera` sólo lee `.x` y `.y`: un objeto llano vale.
    rayo.setFromCamera({ x: v.x, y: v.y }, cam);
    const choques = rayo.intersectObjects(ex.scene.children, true);
    // La cúpula del cielo va centrada en la cámara, así que sale la PRIMERA en
    // distancia y tapa todo lo demás; igual el mar, las motas y las vetas de
    // luz, que no son superficie sobre la que se pise nada.
    const NO_ES_SUELO = /^(sky|ocean|motes|birds|ley|label|rotulo|holo|beacon|pulse|smoke|fire|isla-nube)/;
    const primero = choques.find(
      (c) => c.object.visible && c.object.isMesh && !NO_ES_SUELO.test(c.object.name || '')
    );
    const q = primero ? primero.object.name || '(sin nombre)' : '(nada)';
    tocados[q] = (tocados[q] || 0) + 1;
    if (!primero || primero.object.name !== nombre) return null;
    gl.readPixels(
      Math.round((v.x * 0.5 + 0.5) * w),
      Math.round((v.y * 0.5 + 0.5) * h),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix
    );
    return [pix[0], pix[1], pix[2]];
  };
  const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const luz = (l) => {
    const v = l.filter(Boolean);
    if (!v.length) return null;
    return (
      0.2126 * mediana(v.map((c) => c[0])) +
      0.7152 * mediana(v.map((c) => c[1])) +
      0.0722 * mediana(v.map((c) => c[2]))
    );
  };
  const normalY = (x, z) => {
    const d = 1.2;
    const hx = (campo.height(x + d, z) - campo.height(x - d, z)) / (2 * d);
    const hz = (campo.height(x, z + d) - campo.height(x, z - d)) / (2 * d);
    return 1 / Math.sqrt(hx * hx + hz * hz + 1);
  };

  const isla = [];
  for (let i = 0; i < 140; i++) {
    const th = (i / 140) * Math.PI * 2 * 5;
    const rad = 5 + (i % 9) * 1.1;
    isla.push(leerSi(cx + Math.cos(th) * rad, cubierta + 0.15, cz + Math.sin(th) * rad, 'isla-cesped'));
  }
  const prado = [];
  for (let i = 0; i < 220; i++) {
    const th = ((i / 220) * Math.PI * 2 * 7);
    const rad = 14 + (i % 11) * 4;
    const x = cx * 0.45 + Math.cos(th) * rad;
    const z = cz * 0.45 + Math.sin(th) * rad;
    if (normalY(x, z) < 0.985) continue;
    prado.push(leerSi(x, campo.height(x, z) + 0.12, z, 'terrain'));
  }
  const a = luz(isla);
  const b = luz(prado);
  return {
    isla: a === null ? null : +a.toFixed(0),
    prado: b === null ? null : +b.toFixed(0),
    muestras: { isla: isla.filter(Boolean).length, prado: prado.filter(Boolean).length },
    tocados: Object.entries(tocados).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}, sitio);

console.log('\n  y el verde casa con el del mundo');
comprobar(
  verde.isla !== null && verde.prado !== null && verde.muestras.prado > 20 && verde.muestras.isla > 10,
  'Hay prado llano de sobra con el que comparar',
  `${verde.muestras.isla} de isla, ${verde.muestras.prado} de prado` +
    (verde.muestras.isla + verde.muestras.prado === 0
      ? ` · el rayo toca: ${(verde.tocados || []).map(([n, c]) => `${n}×${c}`).join(', ')}`
      : '')
);
if (verde.isla !== null && verde.prado !== null) {
  const d = Math.abs(verde.isla - verde.prado);
  comprobar(
    d < 9,
    'La cubierta no es más clara que el prado a plena luz',
    `isla ${verde.isla} · prado ${verde.prado} · difieren ${d}`
  );
}

comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
