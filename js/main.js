// openRun — bootstrap: webcam -> MediaPipe -> gesti -> gioco.

import { CONFIG } from './config.js';
import { InputBus, attachKeyboard } from './game/input.js';
import { World } from './game/scene.js';
import { Game, GameState } from './game/game.js';
import { PoseTracker } from './pose/tracker.js';
import { GestureEngine } from './pose/gestures.js';
import { Calibrator } from './pose/calibration.js';
import { Hud } from './hud.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hud = new Hud(document);
const bus = new InputBus();
const world = new World(document.getElementById('game-root'));
const game = new Game(world, bus);
const engine = new GestureEngine(bus);
attachKeyboard(bus);

const video = document.getElementById('cam');

let tracker = null;
let videoReady = false;
let cameraActive = false;
let calibrator = null;
let calibrationStartAt = 0;
let lastValidMs = -Infinity;
let lastFrame = performance.now();
let fps = 60;
let countdownToken = 0;

game.onHud = (data) => hud.update(data);

game.onStateChange = (state) => {
  if (state === GameState.PLAYING) {
    hud.showScreen(null);
    hud.showHud(true);
  } else if (state === GameState.GAMEOVER) {
    hud.showHud(false);
    hud.showGameOver(game.hudData());
    hud.showScreen('gameover');
  } else if (state === GameState.PAUSED) {
    hud.showScreen('paused');
  } else if (state === GameState.COUNTDOWN) {
    hud.showScreen('countdown');
  } else if (state === GameState.CALIBRATING) {
    hud.showScreen('calibrate');
  }
};

function beginCalibration() {
  calibrator = new Calibrator();
  engine.reset();
  engine.setBaseline(null);
  calibrationStartAt = performance.now() + CONFIG.gestures.calibrationCountdownMs;
  hud.setProgress(0);
  hud.setCalibrateCount(Math.ceil(CONFIG.gestures.calibrationCountdownMs / 1000));
  game.setState(GameState.CALIBRATING);
}

async function runCountdown() {
  const token = ++countdownToken;
  game.setState(GameState.COUNTDOWN);
  for (let n = 3; n >= 1; n--) {
    if (token !== countdownToken) return;
    hud.setCountdown(n);
    await wait(600);
  }
  if (token !== countdownToken) return;
  game.start();
}

// Fallisce invece di restare appeso per sempre su una promise che non risponde.
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Trasforma l'errore (o l'assenza di contesto sicuro) in un messaggio leggibile.
function cameraErrorMessage(error) {
  if (!window.isSecureContext) {
    return {
      title: 'Connessione non sicura: webcam bloccata',
      detail:
        'Il browser consente la fotocamera solo su https:// o su localhost. Aprendo il sito da http://<ip> la webcam non può partire: usa un tunnel HTTPS (cloudflared/ngrok) o apri la pagina da https.',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: 'Webcam non supportata',
      detail: 'Questo browser non espone getUserMedia. Aggiorna Chrome, Edge, Firefox o Safari e riprova.',
    };
  }
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Permesso fotocamera negato',
        detail:
          'Consenti l’accesso alla fotocamera per questo sito (icona lucchetto/candela nella barra dell’indirizzo), poi riprova.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { title: 'Nessuna fotocamera trovata', detail: 'Collega o abilita una fotocamera e riprova.' };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        title: 'Fotocamera occupata',
        detail: 'Un’altra app o scheda la sta usando. Chiudila e riprova.',
      };
    case 'OverconstrainedError':
      return {
        title: 'Fotocamera non compatibile',
        detail: `Nessuna fotocamera soddisfa i requisiti richiesti (${error.constraint ?? 'constraint'}).`,
      };
    case 'TimeoutError':
      return { title: 'Nessuna risposta dal browser', detail: error.message };
    default:
      return {
        title: 'Webcam non disponibile',
        detail: error?.message || 'Errore sconosciuto durante l’accesso alla fotocamera.',
      };
  }
}

function showCameraProblem(error) {
  const info = cameraErrorMessage(error);
  hud.showScreen('menu');
  hud.showNotice(info.title, info.detail);
  hud.toast(info.title);
}

async function startWithCamera() {
  if (cameraActive) {
    beginCalibration();
    return;
  }
  hud.clearNotice();

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showCameraProblem(null);
    return;
  }

  try {
    hud.showScreen('loading');
    hud.setStatus('Richiedo l’accesso alla webcam…');
    const stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      }),
      15000,
      'Il browser non ha risposto alla richiesta della fotocamera. Controlla di aver risposto al popup del permesso e riprova.',
    );
    video.srcObject = stream;
    await withTimeout(video.play(), 8000, 'Il flusso della fotocamera non è partito. Riprova.');
    videoReady = true;
    hud.resizeCanvas();

    hud.setStatus('Carico il modello di pose (MediaPipe)…');
    tracker = await withTimeout(
      new PoseTracker().init(),
      30000,
      'Il modello di pose non si è caricato (rete lenta o CDN raggiungibile). Riprova.',
    );
    cameraActive = true;
    beginCalibration();
  } catch (error) {
    console.error(error);
    videoReady = false;
    cameraActive = false;
    video.srcObject = null;
    showCameraProblem(error);
  }
}

function startKeyboard() {
  countdownToken++;
  cameraActive = false;
  tracker = null;
  engine.reset();
  engine.setBaseline(null);
  hud.clearNotice();
  runCountdown();
}

function processPose(now) {
  if (!tracker || !videoReady || video.readyState < 2) return;

  const landmarks = tracker.detect(video, now);

  if (game.state === GameState.CALIBRATING && calibrator) {
    // Conto alla rovescia: tempo per sistemarsi, ancora nessun frame raccolto.
    const remaining = calibrationStartAt - now;
    if (remaining > 0) {
      hud.setCalibrateCount(Math.ceil(remaining / 1000));
      hud.drawSkeleton(landmarks, true);
      return;
    }
    hud.setCalibrateCount(null);

    const progress = calibrator.add(landmarks);
    hud.setProgress(progress);
    hud.drawSkeleton(landmarks, progress > 0);
    if (calibrator.done) {
      const baseline = calibrator.finish();
      calibrator = null;
      if (baseline) {
        engine.setBaseline(baseline);
        engine.reset();
      }
      runCountdown();
    }
    return;
  }

  const result = engine.update(landmarks, now);
  hud.drawSkeleton(landmarks, result.valid);
  hud.setDebug(result, fps);

  if (result.valid) lastValidMs = now;

  const lost = now - lastValidMs > CONFIG.gestures.lostPoseTimeoutMs;
  if (lost && game.state === GameState.PLAYING) game.pause();
  else if (!lost && game.state === GameState.PAUSED) game.resume();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

  processPose(now);
  game.update(dt, now / 1000);
  world.render();
}

function bindButtons() {
  document.getElementById('btn-start').addEventListener('click', startWithCamera);
  document.getElementById('btn-keyboard').addEventListener('click', startKeyboard);
  document.getElementById('btn-replay').addEventListener('click', () => runCountdown());
  document.getElementById('btn-recalibrate').addEventListener('click', beginCalibration);
  document.getElementById('btn-menu').addEventListener('click', () => {
    countdownToken++;
    hud.showHud(false);
    hud.clearSkeleton();
    hud.showScreen('menu');
  });
  document.getElementById('debug-toggle').addEventListener('click', () => hud.toggleDebug());
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Backquote') hud.toggleDebug();
  });

  // Su touch la modalità tastiera non ha senso: nascondi il pulsante.
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.getElementById('btn-keyboard').classList.add('hidden');
  }
}

function bindResize() {
  const onResize = () => {
    world.resize();
    hud.resizeCanvas();
  };
  window.addEventListener('resize', onResize);
  video.addEventListener('loadedmetadata', onResize);
  document.addEventListener('fullscreenchange', onResize);
}

bindButtons();
bindResize();
hud.showScreen('menu');
hud.showHud(false);
hud.resizeCanvas();
world.updatePlayer(game.player);
requestAnimationFrame(frame);
