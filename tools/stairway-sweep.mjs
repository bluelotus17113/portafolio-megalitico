/**
 * Barrido de tope de pendiente × panza del trazado.
 *
 * El tope y el largo del recorrido no son independientes: el rellano que se
 * forma solo en el banco de media ladera se come recorrido a pendiente cero, y
 * lo que queda tiene que subir MÁS que la media. Si el tope no da para eso, el
 * perfil se queda corto y los últimos escalones se amontonan todos en el mismo
 * punto — que es exactamente lo que pasaba con tope 0,66 y panza 12,8.
 *
 *   node tools/stairway-sweep.mjs
 */

import { TerrainField } from '../src/world/Terrain.js';
import { souterrainMound, souterrainCuts, souterrainTunnel } from '../src/models/Souterrain.js';
import { stairwayPlan, _resetStairwayPlan, STAIRWAY } from '../src/models/Stairway.js';
import { SECTIONS, SEED, DAIS } from '../src/config.js';

const PAD_RADIUS = Object.fromEntries(
  Object.entries(DAIS).map(([id, d]) => [id, d.radius + d.steps * d.stepWidth + 0.5])
);

function campo() {
  const field = new TerrainField(SEED);
  field.addPad(0, 0, PAD_RADIUS.plaza, 10);
  for (const def of SECTIONS) field.addPad(def.anchor[0], def.anchor[2], PAD_RADIUS[def.id] ?? 16, 10);
  const cerro = souterrainMound();
  field.addMound(cerro.x, cerro.z, cerro.radius, cerro.height);
  for (const c of souterrainCuts(field)) field.addCut(c.ax, c.az, c.bx, c.bz, c);
  const g = souterrainTunnel();
  field.addTunnel(g.ax, g.az, g.bx, g.bz, g);
  return field;
}

const panzaBase = STAIRWAY.panza.map(([t, q]) => [t, q]);
const qMax = Math.max(...panzaBase.map(([, q]) => q));

console.log('tope  panza  largo  pend  contrah  huella mín  nulas  desmonte  terraplén  rellanos');
for (const escala of [1.0, 1.15, 1.3, 1.45]) {
  for (const tope of [0.66, 0.72, 0.78, 0.85, 0.95]) {
    _resetStairwayPlan();
    STAIRWAY.panza = panzaBase.map(([t, q]) => [t, q * escala]);
    STAIRWAY.topePendiente = tope;
    const plan = stairwayPlan(campo());

    const fondos = plan.huellas.map((h) => h.lFin - h.lIni);
    // La última huella se extiende hasta el final del trazado, así que no cuenta.
    const utiles = fondos.slice(0, -1);
    const nulas = utiles.filter((d) => d < 0.15).length;
    const rellanos = utiles.filter((d) => d > 1.4).length;
    console.log(
      `${tope.toFixed(2)}  ${(qMax * escala).toFixed(1).padStart(5)}  ${plan.largo.toFixed(1).padStart(5)}  ` +
      `${(((plan.y1 - plan.y0) / plan.largo) * 100).toFixed(0).padStart(3)}%  ` +
      `${(plan.contrahuella * 100).toFixed(1).padStart(6)}  ` +
      `${(Math.min(...utiles) * 100).toFixed(0).padStart(9)}  ` +
      `${String(nulas).padStart(5)}  ${plan.desmonte.toFixed(2).padStart(8)}  ${plan.terraplen.toFixed(2).padStart(9)}  ` +
      `${String(rellanos).padStart(8)}`
    );
  }
  console.log('');
}
