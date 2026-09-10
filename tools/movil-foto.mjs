/**
 * Capturas en pantallas de teléfono.
 *
 * No hay forma de juzgar esto sin verlo al tamaño real: un menú que en el
 * portátil cabe de sobra puede salirse por la derecha en 360 px sin que ningún
 * número lo diga.
 *
 *   node tools/movil-foto.mjs
 */
import puppeteer from 'puppeteer-core';

const U = process.env.U ?? 'http://127.0.0.1:5173';
const TELEFONOS = [
  ['iphone12', 390, 844, 3],
  ['android-pequeno', 360, 740, 2],
];

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
  protocolTimeout: 600000,
});

for (const [nombre, w, h, dpr] of TELEFONOS) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  // Portada
  await p.goto(U + '/', { waitUntil: 'networkidle2', timeout: 180000 });
  await new Promise((r) => setTimeout(r, 1800));
  await p.screenshot({ path: `/tmp/mov-${nombre}-portada.png` });

  // Ligera + su menú
  await p.goto(U + '/?modo=ligero', { waitUntil: 'networkidle2', timeout: 180000 });
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `/tmp/mov-${nombre}-ligera.png` });
  const desborde = await p.evaluate(() => {
    const fuera = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
        fuera.push((el.className || el.tagName) + ' → ' + Math.round(r.right) + 'px');
      }
    }
    return { anchoDoc: document.documentElement.scrollWidth, ventana: window.innerWidth, fuera: [...new Set(fuera)].slice(0, 6) };
  });
  console.log(`\n${nombre} (${w}×${h}) · ligera`);
  console.log('   ancho del documento', desborde.anchoDoc, 'vs ventana', desborde.ventana,
              desborde.anchoDoc > desborde.ventana ? '← SE DESBORDA' : '← ok');
  if (desborde.fuera.length) console.log('   se salen:', desborde.fuera.join(' | '));

  await p.close();
}
console.log('\ncapturas en /tmp/mov-*.png');
await b.close();
