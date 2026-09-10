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

comprobar(errores.length === 0, 'Sin errores en consola', errores.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${fallos === 0 ? 'Todo en orden.' : `${fallos} fallo(s).`}\n`);
process.exit(fallos === 0 ? 0 : 1);
