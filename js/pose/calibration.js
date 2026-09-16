// Raccoglie qualche decina di frame di posa neutra e ne ricava la baseline
// personale (mediana, robusta rispetto a frame anomali).

import { CONFIG } from '../config.js';
import { computeSignals } from './gestures.js';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

export class Calibrator {
  constructor(frames = CONFIG.gestures.calibrationFrames) {
    this.needed = frames;
    this.samples = [];
  }

  add(landmarks) {
    const signals = computeSignals(landmarks);
    if (signals.valid) this.samples.push(signals);
    return this.progress;
  }

  get progress() {
    return Math.min(1, this.samples.length / this.needed);
  }

  get done() {
    return this.samples.length >= this.needed;
  }

  finish() {
    if (this.samples.length === 0) return null;
    const baseline = {
      shoulderWidth: median(this.samples.map((s) => s.shoulderWidth)),
      torso: median(this.samples.map((s) => s.torso)),
      hipY: median(this.samples.map((s) => s.hipY)),
      shoulderCenterX: median(this.samples.map((s) => s.shoulderCenterX)),
      hipCenterX: median(this.samples.map((s) => s.hipCenterX)),
    };
    baseline.torso = Math.max(baseline.torso, 0.05);
    baseline.shoulderWidth = Math.max(baseline.shoulderWidth, 0.05);
    return baseline;
  }
}
