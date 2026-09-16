// Genera le file di ostacoli. Puro e deterministico se si inietta un rng.
// Regola d'oro: ogni fila richiede UNA sola azione ed è sempre risolvibile
// (mai un blocco pieno su tutte e tre le corsie).

import { CONFIG } from '../config.js';

export const OBSTACLE = {
  LOW: 'low', // bassa barriera -> salto
  HIGH: 'high', // barra alta -> duck
  BLOCK: 'block', // blocco pieno -> cambio corsia
};

// Geometria degli ostacoli (usata da scena e collisioni).
export const OBSTACLE_SHAPE = {
  [OBSTACLE.LOW]: { y0: 0, y1: 1.0, halfW: 0.95, halfD: 0.45 },
  [OBSTACLE.HIGH]: { y0: 1.0, y1: 2.7, halfW: 0.95, halfD: 0.45 },
  [OBSTACLE.BLOCK]: { y0: 0, y1: 2.7, halfW: 0.95, halfD: 0.45 },
};

export function isRowSolvable(row, laneCount = CONFIG.lanes.count) {
  if (row.length < laneCount) return true;
  // se tutte le corsie sono occupate, almeno una deve essere superabile con salto/duck
  return row.some((item) => item.type !== OBSTACLE.BLOCK);
}

function shuffledLanes(rng, laneCount) {
  const lanes = [];
  for (let i = 0; i < laneCount; i++) lanes.push(i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

export class Spawner {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.nextDistance = CONFIG.spawn.startDistance;
  }

  // Chiamata ogni frame con la distanza percorsa e la velocità attuale.
  // Restituisce { obstacles, coins } oppure null se non è il momento.
  maybeSpawn(distance, speed) {
    if (distance < this.nextDistance) return null;

    const row = this.buildRow();
    const gap = Math.max(CONFIG.spawn.minGap, Math.min(CONFIG.spawn.maxGap, speed * 1.15));
    const reaction = speed * CONFIG.spawn.minReactionTime;
    this.nextDistance = distance + Math.max(gap, reaction);

    return row;
  }

  buildRow() {
    const laneCount = CONFIG.lanes.count;
    const rng = this.rng;
    const roll = rng();

    let type;
    if (roll < 0.34) type = OBSTACLE.LOW;
    else if (roll < 0.68) type = OBSTACLE.HIGH;
    else type = OBSTACLE.BLOCK;

    const lanes = shuffledLanes(rng, laneCount);
    let blockedCount;
    if (type === OBSTACLE.BLOCK) {
      // 1 o 2 corsie: lasciarne sempre una libera
      blockedCount = rng() < 0.55 ? 1 : 2;
    } else {
      blockedCount = rng() < 0.5 ? 1 : laneCount; // singolo ostacolo o fila intera
    }

    const obstacles = lanes.slice(0, blockedCount).map((lane) => ({ lane, type }));

    // Monete su una corsia libera, in fila, poco prima della barriera.
    const coins = [];
    if (obstacles.length < laneCount) {
      const freeLanes = lanes.slice(blockedCount);
      const lane = freeLanes[0];
      for (let i = 0; i < 3; i++) coins.push({ lane, offset: -(4 + i * CONFIG.coins.spacing) });
    }

    return { obstacles, coins, solvable: isRowSolvable(obstacles, laneCount) };
  }
}
