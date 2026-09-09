/**
 * Capturas del Camino del Viajero: la escalinata y la isla flotante.
 *
 * No es una comprobación: no afirma nada. Existe porque lo que hay que juzgar
 * aquí —si una peña parece flotar, si una escalinata parece subir— no se mide,
 * se mira, y mirarlo a mano obliga a recorrer el mundo con el ratón cada vez.
 *
 *   node tools/isla-foto.mjs
 */
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto('http://127.0.0.1:5173/?instant', { waitUntil: 'networkidle2', timeout: 240000 });
await p.waitForFunction(
  () => {
    const e = document.querySelector('.loader__enter');
    return e && !e.hidden;
  },
  { timeout: 240000 }
);
await p.click('.loader__enter');
await new Promise((r) => setTimeout(r, 2500));

const sitio = await p.evaluate(() => {
  const ex = window.__portfolio;
  let isla = null;
  let esc = null;
  ex.scene.traverse((o) => {
    if (o.name === 'isla-flotante') isla = o;
    if (o.name === 'escalinata-isla-cuerpo') esc = o;
  });
  const salida = {};
  if (isla) {
    isla.updateWorldMatrix(true, true);
    const m = isla.matrixWorld.elements;
    salida.isla = [m[12], m[13], m[14]];
  }
  if (esc) {
    esc.updateWorldMatrix(true, true);
    const a = esc.geometry.attributes.position;
    const m = esc.matrixWorld.elements;
    let mn = [1e9, 1e9, 1e9];
    let mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i);
      const y = a.getY(i);
      const z = a.getZ(i);
      const v = [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], v[k]);
        mx[k] = Math.max(mx[k], v[k]);
      }
    }
    salida.escalinata = { min: mn, max: mx, medio: mn.map((v, k) => (v + mx[k]) / 2) };
  }
  return salida;
});
if (!sitio.isla) {
  console.log('NO ESTÁ LA ISLA');
  await b.close();
  process.exit(1);
}
console.log('isla en', sitio.isla.map((v) => +v.toFixed(1)).join(', '));
if (sitio.escalinata) {
  console.log('escalinata de', sitio.escalinata.min.map((v) => +v.toFixed(1)).join(', '),
              'a', sitio.escalinata.max.map((v) => +v.toFixed(1)).join(', '));
}

// La escalinata avanza de `max` a `min`: se mira desde el costado de esa
// dirección, o la propia isla la tapa.
const e = sitio.escalinata;
const vistas = [
  ['ascenso', e ? e.medio : sitio.isla, 92, 0.75, 1.30],
  ['escalinata', e ? e.medio : sitio.isla, 52, 2.05, 1.32],
  ['isla', sitio.isla, 44, 2.35, 1.44],
  ['cubierta', sitio.isla, 27, 0.6, 0.95],
];
for (const [nombre, objetivo, dist, az, pol] of vistas) {
  await p.evaluate(
    ({ c, dist, az, pol }) => {
      const r = window.__portfolio.rig;
      r.idleDrift = false;
      r.target.set(c[0], c[1], c[2]);
      r.distance = dist;
      r.azimuth = az;
      r.polar = pol;
    },
    { c: objetivo, dist, az, pol }
  );
  await new Promise((r) => setTimeout(r, 2200));
  await p.screenshot({ path: `/tmp/isla-${nombre}.png` });
}
// Y de noche, que es cuando la veta de luz tiene algo que decir.
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /noche/i.test(e.textContent || ''));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 3000));
for (const [nombre, objetivo, dist, az, pol] of vistas.slice(0, 2)) {
  await p.evaluate(
    ({ c, dist, az, pol }) => {
      const r = window.__portfolio.rig;
      r.idleDrift = false;
      r.target.set(c[0], c[1], c[2]);
      r.distance = dist;
      r.azimuth = az;
      r.polar = pol;
    },
    { c: objetivo, dist, az, pol }
  );
  await new Promise((r) => setTimeout(r, 2200));
  await p.screenshot({ path: `/tmp/isla-${nombre}-noche.png` });
}
console.log('errores:', errs.length ? errs.slice(0, 3).join(' | ') : 'ninguno');
await b.close();
