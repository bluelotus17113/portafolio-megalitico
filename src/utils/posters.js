/**
 * Carteles generativos para los proyectos.
 *
 * Cada proyecto proyecta una lámina sobre su monolito. Mientras no haya
 * capturas reales, esta lámina se dibuja a partir de la semilla del proyecto:
 * misma semilla, misma composición. Así el círculo se ve poblado y variado
 * desde el primer arranque, sin cargar una sola imagen.
 *
 * Para usar capturas reales basta con dar `image` en el proyecto: entonces se
 * carga esa textura en vez de generar el cartel.
 *
 * Aquí NO se importa three a propósito. El cartel es un lienzo 2D y lo usan
 * las dos versiones del portafolio; envolverlo en una textura es cosa de quien
 * lo va a pegar en un monolito, y esa línea vive en `sections/Projects.js`.
 * Con el `import` aquí, pedir un cartel desde la página ligera se traía los
 * 635 kB del motor por delante.
 */

import { makeRandom, SimplexNoise } from './noise.js';

const W = 768;
const H = 512;

function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/**
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.hue  Tono base en grados.
 * @param {number} opts.escala  Resolución respecto a los 768×512 de diseño.
 *   El dibujo no cambia: se escala el lienzo y se le dice al contexto que
 *   trabaje en las mismas coordenadas, así que todo lo de abajo sigue pensando
 *   en 768×512 y no hay que tocar ni una cifra.
 *
 *   Existe porque los dos sitios que lo usan piden cosas muy distintas. Sobre
 *   un monolito, la lámina se proyecta grande y quiere los 768 enteros; en una
 *   ficha de la versión ligera se enseña a unos 270 px de ancho, y dibujarla a
 *   768 son OCHO VECES los píxeles que se van a ver — pagados en el equipo que
 *   menos puede pagarlos, que es justamente para el que existe esa versión.
 */
export function posterCanvas({ seed = 1, hue = 190, escala = 1 } = {}) {
  const random = makeRandom(seed);
  const noise = new SimplexNoise(seed + 7);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * escala);
  canvas.height = Math.round(H * escala);
  const ctx = canvas.getContext('2d');
  if (escala !== 1) ctx.scale(escala, escala);

  const hueB = (hue + 40 + random() * 120) % 360;

  // Fondo: degradado diagonal oscuro.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hsl(hue, 42, 11));
  bg.addColorStop(1, hsl(hueB, 38, 6));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Campo de ruido tenue: quita el aspecto de degradado plano.
  const field = ctx.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const n = noise.fbm(x * 0.006, y * 0.006, 0, 4, 2.2, 0.55) * 0.5 + 0.5;
      const i = (y * W + x) * 4;
      const v = n * 46;
      field.data[i] = v;
      field.data[i + 1] = v * 1.05;
      field.data[i + 2] = v * 1.2;
      field.data[i + 3] = 90;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  tmp.getContext('2d').putImageData(field, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(tmp, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // Retícula de fondo, común a todas las composiciones: da escala y sugiere
  // trabajo de taller. Muy tenue, casi solo textura.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hsl(hue, 40, 70, 0.05);
  ctx.lineWidth = 1;
  const step = 32;
  ctx.beginPath();
  for (let x = step; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  // Composición: una de cuatro familias. Se elige por la semilla directa y
  // no por el generador aleatorio, porque con semillas próximas el primer
  // valor del PRNG caía siempre en el mismo tramo y los nueve carteles
  // salían de la misma familia.
  const family = Math.abs(Math.round(seed)) % 4;

  if (family === 0) {
    // Curvas de nivel: contornos de un campo de ruido.
    const levels = 13 + Math.floor(random() * 9);
    const scale = 0.004 + random() * 0.003;
    const ox = random() * 50;
    for (let l = 0; l < levels; l++) {
      const threshold = -0.55 + (l / levels) * 1.1;
      ctx.beginPath();
      // Marcha por columnas: para cada x se busca el cruce del nivel.
      for (let x = 0; x <= W; x += 3) {
        let last = null;
        for (let y = 0; y <= H; y += 3) {
          const v = noise.fbm((x + ox) * scale, y * scale, l * 0.13, 4, 2.1, 0.55);
          if (last !== null && (last - threshold) * (v - threshold) < 0) {
            ctx.moveTo(x, y - 1.5);
            ctx.lineTo(x + 3, y - 1.5);
          }
          last = v;
        }
      }
      const bright = 34 + (l / levels) * 34;
      ctx.strokeStyle = hsl(hue + l * 1.6, 55, bright, 0.55);
      ctx.lineWidth = l % 4 === 0 ? 2 : 1;
      ctx.stroke();
    }
  } else if (family === 1) {
    // Órbitas: arcos concéntricos finos con nodos.
    const cx = W * (0.34 + random() * 0.32);
    const cy = H * (0.36 + random() * 0.28);
    const rings = 7 + Math.floor(random() * 6);
    for (let i = 0; i < rings; i++) {
      const r = 26 + i * (16 + random() * 14);
      const start = random() * Math.PI * 2;
      const sweep = Math.PI * (0.35 + random() * 1.35);
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + sweep);
      ctx.strokeStyle = hsl(hue + i * 3, 58, 40 + i * 2.4, 0.6);
      ctx.lineWidth = i % 3 === 0 ? 2.2 : 1;
      ctx.stroke();
      // Nodo en el extremo del arco.
      if (random() > 0.45) {
        const a = start + sweep;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6 + random() * 3, 0, Math.PI * 2);
        ctx.fillStyle = hsl(hueB, 80, 72, 0.85);
        ctx.fill();
      }
    }
  } else if (family === 2) {
    // Onda: bandas apiladas moduladas por ruido.
    const bands = 16 + Math.floor(random() * 12);
    for (let b = 0; b < bands; b++) {
      const baseY = H * (0.16 + (b / bands) * 0.72);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const amp = 26 * (1 - Math.abs(b / bands - 0.5) * 1.4);
        const y = baseY + noise.fbm(x * 0.004, b * 0.35, 3.7, 3, 2.2, 0.5) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hsl(hue + b * 1.2, 55, 34 + (b / bands) * 34, 0.5);
      ctx.lineWidth = b % 5 === 0 ? 2 : 0.9;
      ctx.stroke();
    }
  } else {
    // Trama: módulos alineados con relleno escaso, como una maqueta.
    const cols = 6 + Math.floor(random() * 4);
    const rows = 4 + Math.floor(random() * 3);
    const pad = 34;
    const cw = (W - pad * 2) / cols;
    const ch = (H - pad * 2) / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = pad + i * cw;
        const y = pad + j * ch;
        const v = noise.noise2(i * 0.8, j * 0.8) * 0.5 + 0.5;
        ctx.strokeStyle = hsl(hue, 45, 42, 0.30);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
        if (v > 0.62) {
          const k = (v - 0.62) / 0.38;
          ctx.fillStyle = hsl(hue + (i - j) * 6, 62, 40 + k * 26, 0.30 + k * 0.3);
          ctx.fillRect(x + 3, y + 3, cw - 6, (ch - 6) * (0.35 + k * 0.65));
        }
        if (v < 0.2) {
          ctx.beginPath();
          ctx.moveTo(x + 3, y + ch - 3);
          ctx.lineTo(x + cw - 3, y + 3);
          ctx.strokeStyle = hsl(hueB, 70, 62, 0.45);
          ctx.stroke();
        }
      }
    }
  }

  // Acento: una sola forma clara que ancla la composición.
  ctx.strokeStyle = hsl(hueB, 85, 76, 0.9);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  const ax = W * (0.14 + random() * 0.6);
  const ay = H * (0.16 + random() * 0.6);
  if (random() > 0.5) {
    ctx.arc(ax, ay, 26 + random() * 40, 0, Math.PI * 2);
  } else {
    const s = 40 + random() * 70;
    ctx.moveTo(ax, ay - s / 2);
    ctx.lineTo(ax + s / 2, ay);
    ctx.lineTo(ax, ay + s / 2);
    ctx.lineTo(ax - s / 2, ay);
    ctx.closePath();
  }
  ctx.stroke();

  // Punto de luz: da un foco a la composición.
  const glow = ctx.createRadialGradient(
    W * (0.2 + random() * 0.6), H * (0.2 + random() * 0.6), 0,
    W * 0.5, H * 0.5, W * 0.7
  );
  glow.addColorStop(0, hsl(hue, 90, 70, 0.42));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'source-over';

  // Marco interior: le da acabado de lámina.
  ctx.strokeStyle = hsl(hue, 40, 80, 0.35);
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  // Viñeta.
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}

export const POSTER_ASPECT = W / H;
