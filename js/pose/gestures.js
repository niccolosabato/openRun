// Landmark MediaPipe Pose (BlazePose, 33 punti) -> segnali normalizzati -> comandi.
// Modulo puro: nessuna dipendenza da DOM/Three, quindi testabile con Node.

import { CONFIG } from '../config.js';

export const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Estrae le metriche grezze di un frame. Restituisce valid=false se i punti
// chiave non sono abbastanza visibili (fuori inquadratura, buio, ecc.).
export function computeSignals(landmarks, minVisibility = CONFIG.gestures.minVisibility) {
  if (!landmarks || landmarks.length < 29) return { valid: false };

  const ls = landmarks[LANDMARK.LEFT_SHOULDER];
  const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
  const lh = landmarks[LANDMARK.LEFT_HIP];
  const rh = landmarks[LANDMARK.RIGHT_HIP];

  const key = [ls, rs, lh, rh];
  for (const p of key) {
    if (!p || (p.visibility ?? 1) < minVisibility) return { valid: false };
  }

  const shoulderCenter = mid(ls, rs);
  const hipCenter = mid(lh, rh);
  const shoulderWidth = distance(ls, rs);
  const torso = distance(shoulderCenter, hipCenter);

  if (shoulderWidth < 1e-4 || torso < 1e-4) return { valid: false };

  return {
    valid: true,
    shoulderCenter,
    hipCenter,
    shoulderWidth,
    torso,
    // quota dei fianchi (y cresce verso il basso nell'immagine)
    hipY: hipCenter.y,
    shoulderCenterX: shoulderCenter.x,
    hipCenterX: hipCenter.x,
  };
}

// Confronta un frame con la baseline personale e restituisce i segnali
// normalizzati: hipRise > 0 (in alto), crouch > 0 (accovacciato),
// lean > 0 (inclinato verso destra dell'utente).
export function normalize(signals, baseline, invertLateral = CONFIG.gestures.invertLateral) {
  const hipRise = (baseline.hipY - signals.hipY) / baseline.torso;
  const leanRaw =
    (signals.shoulderCenterX - signals.hipCenterX) -
    (baseline.shoulderCenterX - baseline.hipCenterX);
  let lean = -leanRaw / baseline.shoulderWidth;
  if (invertLateral) lean = -lean;
  return { hipRise, crouch: -hipRise, lean };
}

export class GestureEngine {
  constructor(bus, cfg = CONFIG.gestures) {
    this.bus = bus;
    this.cfg = cfg;
    this.baseline = null;
    this.reset();
  }

  setBaseline(baseline) {
    this.baseline = baseline;
  }

  reset() {
    this.jumpArmed = true;
    this.lastJumpMs = -Infinity;
    this.lastLeanMs = -Infinity;
    this.leanLatch = 0; // 0 neutro, 1 destra, -1 sinistra
    this.duckActive = false;
    this.lastSignals = null;
  }

  // Elabora un frame. `nowMs` deve essere monotono. Emette i comandi sul bus.
  update(landmarks, nowMs) {
    const signals = computeSignals(landmarks);
    if (!signals.valid || !this.baseline) {
      if (this.duckActive) {
        this.duckActive = false;
        this.bus.emit('duck:up');
      }
      this.lastSignals = null;
      return { valid: false };
    }

    const { hipRise, lean } = normalize(signals, this.baseline, this.cfg.invertLateral);
    this.lastSignals = { hipRise, lean };

    // --- squat / duck (stato mantenuto, con isteresi) ---
    if (!this.duckActive && hipRise < -this.cfg.duckEnterRatio) {
      this.duckActive = true;
      this.bus.emit('duck:down');
    } else if (this.duckActive && hipRise > -this.cfg.duckExitRatio) {
      this.duckActive = false;
      this.bus.emit('duck:up');
    }

    // --- salto (one-shot: deve prima riarmarsi tornando verso la baseline) ---
    if (
      this.jumpArmed &&
      hipRise > this.cfg.jumpRiseRatio &&
      nowMs - this.lastJumpMs > this.cfg.jumpCooldownMs
    ) {
      this.jumpArmed = false;
      this.lastJumpMs = nowMs;
      this.bus.emit('jump');
    }
    if (!this.jumpArmed && hipRise < this.cfg.jumpResetRatio) {
      this.jumpArmed = true;
    }

    // --- destra / sinistra (latch: serve tornare al centro per un nuovo comando) ---
    if (this.leanLatch === 0) {
      if (lean > this.cfg.leanEnterRatio && nowMs - this.lastLeanMs > this.cfg.leanCooldownMs) {
        this.leanLatch = 1;
        this.lastLeanMs = nowMs;
        this.bus.emit('right');
      } else if (
        lean < -this.cfg.leanEnterRatio &&
        nowMs - this.lastLeanMs > this.cfg.leanCooldownMs
      ) {
        this.leanLatch = -1;
        this.lastLeanMs = nowMs;
        this.bus.emit('left');
      }
    } else if (Math.abs(lean) < this.cfg.leanExitRatio) {
      this.leanLatch = 0;
    }

    return { valid: true, hipRise, lean };
  }
}
