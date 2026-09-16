// State machine e regole del gioco. Mette insieme player, spawner e scena.

import { CONFIG } from '../config.js';
import { Player, checkCollisions, checkCoins } from './player.js';
import { Spawner, OBSTACLE_SHAPE } from './spawner.js';

export const GameState = {
  MENU: 'menu',
  CALIBRATING: 'calibrating',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
};

export class Game {
  constructor(world, bus) {
    this.world = world;
    this.bus = bus;
    this.player = new Player();
    this.spawner = new Spawner();

    this.state = GameState.MENU;
    this.obstacles = [];
    this.coins = [];
    this.nextId = 1;
    this.onStateChange = null;
    this.onHud = null;

    this.resetRun();

    bus.on((command) => this.handleCommand(command));
  }

  resetRun() {
    this.world.clearObjects();
    this.obstacles = [];
    this.coins = [];
    this.nextId = 1;
    this.distance = 0;
    this.speed = CONFIG.speed.start;
    this.elapsed = 0;
    this.score = 0;
    this.coinsCollected = 0;
    this.spawner.reset();
    this.player.reset();
  }

  setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.world.updatePlayer(this.player);
    if (this.onStateChange) this.onStateChange(next);
  }

  start() {
    this.resetRun();
    this.setState(GameState.PLAYING);
  }

  pause() {
    if (this.state === GameState.PLAYING) this.setState(GameState.PAUSED);
  }

  resume() {
    if (this.state === GameState.PAUSED) this.setState(GameState.PLAYING);
  }

  handleCommand(command) {
    if (this.state !== GameState.PLAYING) return;
    switch (command) {
      case 'left':
        this.player.moveLane(-1);
        break;
      case 'right':
        this.player.moveLane(1);
        break;
      case 'jump':
        this.player.jump();
        break;
      case 'duck:down':
        this.player.duck(true);
        break;
      case 'duck:up':
        this.player.duck(false);
        break;
    }
  }

  spawnRow() {
    const row = this.spawner.maybeSpawn(this.distance, this.speed);
    if (!row) return;
    const spawnZ = CONFIG.world.spawnZ;

    for (const item of row.obstacles) {
      const shape = OBSTACLE_SHAPE[item.type];
      const obstacle = {
        id: this.nextId++,
        type: item.type,
        lane: item.lane,
        x: CONFIG.lanes.x[item.lane],
        z: spawnZ,
        y0: shape.y0,
        y1: shape.y1,
        halfW: shape.halfW,
        halfD: shape.halfD,
      };
      this.obstacles.push(obstacle);
      this.world.addObstacle(obstacle);
    }

    for (const item of row.coins) {
      const coin = {
        id: this.nextId++,
        lane: item.lane,
        x: CONFIG.lanes.x[item.lane],
        y: 0.9,
        z: spawnZ - item.offset,
      };
      this.coins.push(coin);
      this.world.addCoin(coin);
    }
  }

  update(dt, time) {
    if (this.state !== GameState.PLAYING) {
      this.world.updateCamera(dt, this.player.x);
      return;
    }

    this.elapsed += dt;
    this.speed = Math.min(CONFIG.speed.max, CONFIG.speed.start + CONFIG.speed.ramp * this.elapsed);
    this.distance += this.speed * dt;

    this.player.update(dt);
    this.spawnRow();

    const step = this.speed * dt;
    for (const obstacle of this.obstacles) {
      obstacle.z += step;
      this.world.syncObstacle(obstacle);
    }
    for (const coin of this.coins) {
      coin.z += step;
      this.world.syncCoin(coin);
    }

    const hit = checkCollisions(this.player, this.obstacles);
    if (hit) {
      this.player.alive = false;
      this.setState(GameState.GAMEOVER);
      return;
    }

    const grabbed = checkCoins(this.player, this.coins);
    if (grabbed.length) {
      const ids = new Set(grabbed.map((coin) => coin.id));
      this.coinsCollected += grabbed.length;
      this.coins = this.coins.filter((coin) => !ids.has(coin.id));
      for (const coin of grabbed) this.world.removeCoin(coin.id);
    }

    const despawnZ = CONFIG.world.despawnZ;
    const goneObstacles = this.obstacles.filter((o) => o.z > despawnZ);
    if (goneObstacles.length) {
      const ids = new Set(goneObstacles.map((o) => o.id));
      for (const o of goneObstacles) this.world.removeObstacle(o.id);
      this.obstacles = this.obstacles.filter((o) => !ids.has(o.id));
    }
    const goneCoins = this.coins.filter((c) => c.z > despawnZ);
    if (goneCoins.length) {
      const ids = new Set(goneCoins.map((c) => c.id));
      for (const c of goneCoins) this.world.removeCoin(c.id);
      this.coins = this.coins.filter((c) => !ids.has(c.id));
    }

    this.score = Math.floor(this.distance) + this.coinsCollected * CONFIG.coins.value;

    this.world.updateTrack(dt, this.speed);
    this.world.updatePlayer(this.player);
    this.world.updateCamera(dt, this.player.x);
    this.world.spinCoins(time);

    if (this.onHud) this.onHud(this.hudData());
  }

  hudData() {
    return {
      state: this.state,
      score: this.score,
      speed: this.speed,
      distance: this.distance,
      coins: this.coinsCollected,
    };
  }
}
