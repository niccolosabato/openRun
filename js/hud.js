// Tutto l'interfaccia: schermate, HUD numerico, anteprima scheletro e pannello debug.

const BONES = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

const SCREENS = ['menu', 'loading', 'calibrate', 'countdown', 'gameover', 'paused'];

export class Hud {
  constructor(root = document) {
    this.root = root;
    this.screens = {};
    for (const name of SCREENS) this.screens[name] = root.getElementById(`screen-${name}`);

    this.score = root.getElementById('hud-score');
    this.speed = root.getElementById('hud-speed');
    this.coins = root.getElementById('hud-coins');
    this.hud = root.getElementById('hud');
    this.progress = root.getElementById('calibrate-progress');
    this.status = root.getElementById('status');
    this.countdown = root.getElementById('countdown-number');
    this.finalScore = root.getElementById('final-score');
    this.finalDetails = root.getElementById('final-details');
    this.toastEl = root.getElementById('toast');
    this.notice = root.getElementById('menu-notice');
    this.noticeTitle = root.getElementById('menu-notice-title');
    this.noticeDetail = root.getElementById('menu-notice-detail');
    this.debug = root.getElementById('debug');
    this.debugHip = root.getElementById('debug-hip');
    this.debugLean = root.getElementById('debug-lean');
    this.debugFps = root.getElementById('debug-fps');

    this.canvas = root.getElementById('overlay');
    this.ctx = this.canvas.getContext('2d');
    this.preview = root.getElementById('preview');

    this.toastTimer = null;
  }

  showScreen(name) {
    for (const key of SCREENS) {
      this.screens[key].classList.toggle('hidden', key !== name);
    }
    this.preview.classList.toggle('big', name === 'calibrate' || name === 'loading');
  }

  showHud(visible) {
    this.hud.classList.toggle('hidden', !visible);
  }

  setCountdown(value) {
    this.countdown.textContent = value;
  }

  setProgress(value) {
    this.progress.style.width = `${Math.round(value * 100)}%`;
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  update(data) {
    this.score.textContent = Math.round(data.score).toLocaleString('it-IT');
    this.speed.textContent = data.speed.toFixed(1);
    this.coins.textContent = data.coins;
  }

  showGameOver(data) {
    this.finalScore.textContent = Math.round(data.score).toLocaleString('it-IT');
    this.finalDetails.textContent = `${Math.floor(data.distance)} m · ${data.coins} monete · velocità max ${data.speed.toFixed(1)}`;
  }

  showNotice(title, detail) {
    this.noticeTitle.textContent = title;
    this.noticeDetail.textContent = detail;
    this.notice.classList.remove('hidden');
  }

  clearNotice() {
    this.notice.classList.add('hidden');
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  toggleDebug() {
    this.debug.classList.toggle('hidden');
  }

  setDebug(signals, fps) {
    if (this.debug.classList.contains('hidden')) return;
    const hip = signals ? Math.max(-0.5, Math.min(0.5, signals.hipRise)) : 0;
    const lean = signals ? Math.max(-0.5, Math.min(0.5, signals.lean)) : 0;
    this.debugHip.style.transform = `scaleX(${Math.abs(hip) * 2})`;
    this.debugHip.style.transformOrigin = hip >= 0 ? 'left' : 'right';
    this.debugHip.style.background = hip >= 0 ? '#4dd0e1' : '#ff7a45';
    this.debugLean.style.transform = `scaleX(${Math.abs(lean) * 2})`;
    this.debugLean.style.transformOrigin = lean >= 0 ? 'left' : 'right';
    this.debugLean.style.background = lean >= 0 ? '#9b6bff' : '#ffd24a';
    this.debugFps.textContent = `${Math.round(fps)} fps`;
  }

  resizeCanvas() {
    const rect = this.preview.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
  }

  // landmarks in coordinate immagine (0..1). Il video è specchiato via CSS,
  // quindi anche l'overlay va specchiato per allinearsi.
  drawSkeleton(landmarks, valid) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const toX = (x) => (1 - x) * canvas.width;
    const toY = (y) => y * canvas.height;
    const scale = Math.max(1, canvas.width / 500);

    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = valid ? 'rgba(77, 208, 225, 0.9)' : 'rgba(255, 122, 69, 0.9)';
    for (const [a, b] of BONES) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(toX(pa.x), toY(pa.y));
      ctx.lineTo(toX(pb.x), toY(pb.y));
      ctx.stroke();
    }

    ctx.fillStyle = valid ? '#ffd24a' : '#ff7a45';
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc(toX(point.x), toY(point.y), 3 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clearSkeleton() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
