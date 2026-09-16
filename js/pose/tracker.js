// Wrapper sottile attorno a MediaPipe Tasks Vision (PoseLandmarker).
// Il modello e il WASM arrivano da CDN: nessun build step, tutto on-device.

import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseTracker {
  constructor() {
    this.landmarker = null;
    this.lastTimestamp = -1;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return this;
  }

  // detectForVideo pretende timestamp strettamente crescenti.
  detect(video, timestampMs) {
    if (!this.landmarker) return null;
    let ts = timestampMs;
    if (ts <= this.lastTimestamp) ts = this.lastTimestamp + 1;
    this.lastTimestamp = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return result?.landmarks?.[0] ?? null;
  }
}
