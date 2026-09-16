// Test della logica pura (nessuna dipendenza da browser/Three).
// Esecuzione: node tests/run.mjs  (oppure npm test)

import { CONFIG } from '../js/config.js';
import { computeSignals, GestureEngine } from '../js/pose/gestures.js';
import { Calibrator } from '../js/pose/calibration.js';
import { Player, checkCollisions, checkCoins } from '../js/game/player.js';
import { Spawner, isRowSolvable, OBSTACLE } from '../js/game/spawner.js';
import { Game, GameState } from '../js/game/game.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// Costruisce una posa sintetica (33 landmark) con parametri controllabili.
function pose({ shoulderY = 0.3, hipY = 0.6, shoulderCenterX = 0.5, hipCenterX = 0.5, width = 0.2 } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  lms[11] = { x: shoulderCenterX - width / 2, y: shoulderY, z: 0, visibility: 1 };
  lms[12] = { x: shoulderCenterX + width / 2, y: shoulderY, z: 0, visibility: 1 };
  lms[23] = { x: hipCenterX - width / 2, y: hipY, z: 0, visibility: 1 };
  lms[24] = { x: hipCenterX + width / 2, y: hipY, z: 0, visibility: 1 };
  return lms;
}

function stubBus() {
  const events = [];
  return { events, emit: (cmd) => events.push(cmd) };
}

const neutral = pose();
const baseline = computeSignals(neutral);

console.log('\npose/gestures');

test('computeSignals misura larghezza spalle e torso', () => {
  const s = baseline;
  assert(s.valid, 'dovrebbe essere valido');
  assert(approx(s.shoulderWidth, 0.2), `larghezza = ${s.shoulderWidth}`);
  assert(approx(s.torso, 0.3), `torso = ${s.torso}`);
});

test('visibility bassa => frame non valido', () => {
  const bad = pose();
  bad[11].visibility = 0.1;
  assert(computeSignals(bad).valid === false, 'dovrebbe essere scartato');
});

test('salto: i fianchi salgono sopra soglia', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  engine.update(pose({ hipY: 0.6 - baseline.torso * 0.3 }), 1000);
  assert(bus.events.includes('jump'), `eventi: ${bus.events}`);
});

test('salto: un solo evento finché non si riarma', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  const high = pose({ hipY: 0.6 - baseline.torso * 0.3 });
  engine.update(high, 1000);
  engine.update(high, 1100);
  engine.update(high, 1150);
  const jumps = bus.events.filter((e) => e === 'jump');
  assert(jumps.length === 1, `salto emesso ${jumps.length} volte`);
});

test('squat: entra ed esce con isteresi', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  engine.update(pose({ hipY: 0.6 + baseline.torso * 0.3 }), 1000);
  engine.update(neutral, 1200);
  assert(bus.events[0] === 'duck:down', `eventi: ${bus.events}`);
  assert(bus.events.includes('duck:up'), 'dovrebbe risalire al centro');
});

test('lean: inclinazione a destra emette right', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  engine.update(pose({ shoulderCenterX: 0.5 - baseline.shoulderWidth * 0.3 }), 1000);
  assert(bus.events.includes('right'), `eventi: ${bus.events}`);
});

test('lean: inclinazione a sinistra emette left', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  engine.update(pose({ shoulderCenterX: 0.5 + baseline.shoulderWidth * 0.3 }), 1000);
  assert(bus.events.includes('left'), `eventi: ${bus.events}`);
});

test('lean: serve tornare al centro tra due comandi', () => {
  const bus = stubBus();
  const engine = new GestureEngine(bus);
  engine.setBaseline(baseline);
  const right = pose({ shoulderCenterX: 0.5 - baseline.shoulderWidth * 0.3 });
  engine.update(right, 1000);
  engine.update(right, 1200);
  engine.update(neutral, 1300);
  engine.update(right, 1400);
  const rights = bus.events.filter((e) => e === 'right');
  assert(rights.length === 2, `right emesso ${rights.length} volte`);
});

test('calibrazione: la mediana produce una baseline stabile', () => {
  const calibrator = new Calibrator(5);
  for (let i = 0; i < 5; i++) calibrator.add(pose({ hipY: 0.6 + (i % 2) * 0.001 }));
  assert(calibrator.done, 'dovrebbe essere completa');
  const b = calibrator.finish();
  assert(approx(b.torso, 0.3, 0.01), `torso = ${b.torso}`);
});

console.log('\ngame/player');

test('moveLane resta entro i limiti', () => {
  const player = new Player();
  assert(player.moveLane(-1) === true, 'primo spostamento a sinistra');
  assert(player.moveLane(-1) === false, 'secondo spostamento bloccato');
  assert(player.moveLane(1) === true, 'ritorno al centro');
  assert(player.moveLane(1) === true, 'a destra');
  assert(player.moveLane(1) === false, 'oltre il bordo destro');
});

test('salto: parte, raggiunge aria e atterra', () => {
  const player = new Player();
  assert(player.jump() === true, 'il salto dovrebbe partire');
  assert(player.jump() === false, 'non si salta due volte in aria');
  let landed = false;
  for (let i = 0; i < 200; i++) {
    player.update(1 / 60);
    if (!player.airborne && player.y === 0 && i > 2) landed = true;
  }
  assert(landed, 'dovrebbe atterrare');
});

test('duck: durata minima rispettata', () => {
  const player = new Player();
  player.duck(true);
  player.update(0.1);
  player.duck(false);
  player.update(0.05);
  assert(player.ducking === true, 'non deve rialzarsi subito');
  player.update(CONFIG.player.duckMinDuration);
  assert(player.ducking === false, 'dopo la durata minima si rialza');
});

test('collisione: barriera bassa richiede salto', () => {
  const player = new Player();
  const low = { type: OBSTACLE.LOW, x: 0, z: 0, y0: 0, y1: 1, halfW: 0.95, halfD: 0.45 };
  assert(checkCollisions(player, [low]) !== null, 'da terra deve colpire');
  player.y = 1.2;
  assert(checkCollisions(player, [low]) === null, 'in volo deve passare');
});

test('collisione: barra alta richiede duck', () => {
  const player = new Player();
  const high = { type: OBSTACLE.HIGH, x: 0, z: 0, y0: 1, y1: 2.7, halfW: 0.95, halfD: 0.45 };
  assert(checkCollisions(player, [high]) !== null, 'in piedi deve colpire');
  player.duck(true);
  assert(checkCollisions(player, [high]) === null, 'accovacciato deve passare');
});

test('collisione: corsia diversa non colpisce', () => {
  const player = new Player();
  const block = { type: OBSTACLE.BLOCK, x: CONFIG.lanes.x[2], z: 0, y0: 0, y1: 2.7, halfW: 0.95, halfD: 0.45 };
  assert(checkCollisions(player, [block]) === null, 'corse laterali sono libere');
});

test('monete: raccolte quando allineate', () => {
  const player = new Player();
  const coin = { id: 1, x: player.x, y: 0.9, z: 0.2 };
  assert(checkCoins(player, [coin]).length === 1, 'dovrebbe raccogliere');
  assert(checkCoins(player, [{ ...coin, x: 3 }]).length === 0, 'lontana no');
});

console.log('\ngame/spawner');

test('spawner: ogni fila è risolvibile', () => {
  const spawner = new Spawner(() => 0.99);
  for (let i = 0; i < 2000; i++) {
    const row = spawner.buildRow();
    assert(isRowSolvable(row.obstacles), `fila non risolvibile: ${JSON.stringify(row.obstacles)}`);
    assert(row.obstacles.length < CONFIG.lanes.count || row.obstacles.some((o) => o.type !== OBSTACLE.BLOCK),
      'mai tre blocchi pieni');
  }
});

test('spawner: rispetto del tempo minimo di reazione', () => {
  const spawner = new Spawner(Math.random);
  let distance = 0;
  let speed = CONFIG.speed.start;
  for (let i = 0; i < 400; i++) {
    const row = spawner.maybeSpawn(distance, speed);
    if (row) {
      assert(row.solvable, 'ogni fila generata deve essere risolvibile');
      const gap = spawner.nextDistance - distance;
      assert(gap >= speed * CONFIG.spawn.minReactionTime - 1e-9, `gap ${gap} troppo corto a ${speed}`);
    }
    distance += 2;
    speed = Math.min(CONFIG.speed.max, speed + 0.05);
  }
});

test('spawner: prima fila dopo startDistance', () => {
  const spawner = new Spawner(Math.random);
  assert(spawner.maybeSpawn(CONFIG.spawn.startDistance - 1, 15) === null, 'troppo presto');
  assert(spawner.maybeSpawn(CONFIG.spawn.startDistance, 15) !== null, 'dovrebbe generare');
});

console.log('\ngame/game (loop completo, World finto)');

function makeFakeWorld() {
  return {
    obstacles: new Map(),
    coins: new Map(),
    clearObjects() {
      this.obstacles.clear();
      this.coins.clear();
    },
    addObstacle(o) {
      this.obstacles.set(o.id, o);
    },
    syncObstacle() {},
    removeObstacle(id) {
      this.obstacles.delete(id);
    },
    addCoin(c) {
      this.coins.set(c.id, c);
    },
    syncCoin() {},
    removeCoin(id) {
      this.coins.delete(id);
    },
    updateTrack() {},
    updatePlayer() {},
    updateCamera() {},
    spinCoins() {},
  };
}

function makeGame() {
  let handler = () => {};
  const bus = {
    emit: (cmd) => handler(cmd),
    on: (fn) => {
      handler = fn;
      return () => {};
    },
  };
  const world = makeFakeWorld();
  const game = new Game(world, bus);
  return { game, world, bus };
}

test('start() porta il gioco in PLAYING e resetta', () => {
  const { game } = makeGame();
  game.start();
  assert(game.state === GameState.PLAYING, `stato: ${game.state}`);
  assert(game.distance === 0 && game.score === 0, 'contatori azzerati');
});

test('i comandi muovono il giocatore', () => {
  const { game, bus } = makeGame();
  game.start();
  bus.emit('right');
  assert(game.player.lane === 2, `lane: ${game.player.lane}`);
  bus.emit('left');
  bus.emit('left');
  assert(game.player.lane === 0, `lane: ${game.player.lane}`);
  bus.emit('jump');
  assert(game.player.airborne === true, 'dovrebbe essere in volo');
});

test('il loop avanza distanza e punteggio e genera ostacoli', () => {
  const { game, world } = makeGame();
  game.start();
  for (let i = 0; i < 60 * 20; i++) game.update(1 / 60, i / 60);
  assert(game.distance > 0, 'distanza avanzata');
  assert(game.score > 0, 'punteggio > 0');
  assert(world.obstacles.size > 0, 'ostacoli presenti nella scena');
});

test('collisione con blocco => GAMEOVER', () => {
  const { game } = makeGame();
  game.start();
  game.obstacles.push({
    id: 999,
    type: OBSTACLE.BLOCK,
    x: game.player.x,
    z: 0,
    y0: 0,
    y1: 2.7,
    halfW: 0.95,
    halfD: 0.45,
  });
  game.update(0.016, 1);
  assert(game.state === GameState.GAMEOVER, `stato: ${game.state}`);
  assert(game.player.alive === false, 'player non vivo');
});

test('raccolta monete incrementa il contatore', () => {
  const { game } = makeGame();
  game.start();
  game.coins.push({ id: 500, lane: game.player.lane, x: game.player.x, y: 0.9, z: 0 });
  game.update(0.016, 1);
  assert(game.coinsCollected === 1, `monete: ${game.coinsCollected}`);
});

test('la velocità cresce fino al tetto', () => {
  const { game } = makeGame();
  game.start();
  for (let i = 0; i < 60 * 200; i++) game.update(1 / 60, i / 60);
  assert(game.speed <= CONFIG.speed.max + 1e-9, `speed: ${game.speed}`);
  assert(game.speed > CONFIG.speed.start, 'la velocità è aumentata');
});

console.log(`\n${passed} passati, ${failed} falliti\n`);
process.exit(failed === 0 ? 0 : 1);
