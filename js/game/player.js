// Stato del giocatore: corsia, salto, duck. Puro (numeri), testabile con Node.

import { CONFIG } from '../config.js';

export class Player {
  constructor() {
    this.standingHeight = CONFIG.player.standingHeight;
    this.duckHeight = CONFIG.player.duckHeight;
    this.halfWidth = CONFIG.player.halfWidth;
    this.halfDepth = CONFIG.player.halfDepth;
    this.reset();
  }

  reset() {
    this.lane = Math.floor(CONFIG.lanes.count / 2);
    this.x = CONFIG.lanes.x[this.lane];
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.ducking = false;
    this.duckTime = 0;
    this.pendingDuckRelease = false;
    this.alive = true;
  }

  get targetX() {
    return CONFIG.lanes.x[this.lane];
  }

  get height() {
    return this.ducking ? this.duckHeight : this.standingHeight;
  }

  moveLane(direction) {
    const next = this.lane + direction;
    if (next < 0 || next >= CONFIG.lanes.count) return false;
    this.lane = next;
    return true;
  }

  jump() {
    if (this.airborne || !this.alive) return false;
    this.airborne = true;
    this.vy = CONFIG.player.jumpVelocity;
    this.ducking = false;
    this.duckTime = 0;
    this.pendingDuckRelease = false;
    return true;
  }

  duck(on) {
    if (!this.alive) return;
    if (on) {
      if (this.airborne) return; // niente duck in volo
      this.ducking = true;
      this.duckTime = 0;
      this.pendingDuckRelease = false;
    } else {
      // rispetta la durata minima prima di rialzarsi
      if (this.duckTime >= CONFIG.player.duckMinDuration) {
        this.ducking = false;
        this.pendingDuckRelease = false;
      } else {
        this.pendingDuckRelease = true;
      }
    }
  }

  update(dt) {
    const cfg = CONFIG.player;

    const targetX = this.targetX;
    const dx = targetX - this.x;
    const step = CONFIG.lanes.changeSpeed * dt;
    if (Math.abs(dx) <= step) {
      this.x = targetX;
    } else {
      this.x += Math.sign(dx) * step;
    }

    if (this.airborne) {
      this.y += this.vy * dt;
      this.vy -= cfg.gravity * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.airborne = false;
      }
    }

    if (this.ducking) {
      this.duckTime += dt;
      if (this.duckTime >= cfg.duckMaxDuration) {
        this.ducking = false;
        this.pendingDuckRelease = false;
      }
    }
    if (this.ducking && this.pendingDuckRelease && this.duckTime >= cfg.duckMinDuration) {
      this.ducking = false;
      this.pendingDuckRelease = false;
    }
  }
}

// Ritorna l'ostacolo colpito, oppure null.
export function checkCollisions(player, obstacles) {
  if (!player.alive) return null;
  for (const obstacle of obstacles) {
    if (Math.abs(obstacle.z) > obstacle.halfD + player.halfDepth) continue;
    if (Math.abs(obstacle.x - player.x) > obstacle.halfW + player.halfWidth) continue;
    const bottom = player.y;
    const top = player.y + player.height;
    if (top > obstacle.y0 && bottom < obstacle.y1) return obstacle;
  }
  return null;
}

// Ritorna le monete raccolte in questo frame.
export function checkCoins(player, coins) {
  const collected = [];
  for (const coin of coins) {
    if (Math.abs(coin.z) > 0.8) continue;
    if (Math.abs(coin.x - player.x) > 0.8) continue;
    const bottom = player.y;
    const top = player.y + player.height;
    if (coin.y > bottom - 0.5 && coin.y < top + 0.5) collected.push(coin);
  }
  return collected;
}
