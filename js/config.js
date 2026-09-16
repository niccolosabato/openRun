// openRun — tutti i parametri regolabili in un unico posto.
// Le soglie dei gesti sono espresse come rapporti (non in pixel) così
// funzionano a qualsiasi distanza dalla webcam. Vedi README per la taratura.

export const CONFIG = {
  lanes: {
    count: 3,
    x: [-2.3, 0, 2.3],
    changeSpeed: 10, // 1/s, velocità di interpolazione del cambio corsia
  },

  player: {
    standingHeight: 1.6,
    duckHeight: 0.85,
    halfWidth: 0.42,
    halfDepth: 0.42,
    jumpVelocity: 7.4,
    gravity: 20.0,
    duckMinDuration: 0.30, // evita duck accidentali troppo brevi
    duckMaxDuration: 1.8, // rilascio automatico se il segnale resta "giù"
  },

  world: {
    spawnZ: -150,
    despawnZ: 12,
    tileLength: 15,
    tileCount: 12,
    fogNear: 45,
    fogFar: 160,
    background: 0x0b1020,
  },

  speed: {
    start: 15, // unità/secondo
    max: 42,
    ramp: 0.45, // incremento al secondo
  },

  spawn: {
    startDistance: 28,
    minGap: 18, // unità minime tra due file
    maxGap: 40,
    minReactionTime: 0.85, // secondi minimi garantiti per reagire
  },

  coins: {
    value: 5,
    spacing: 1.7,
  },

  gestures: {
    calibrationFrames: 50,
    calibrationCountdownMs: 3000, // tempo per sistemarsi prima di raccogliere i frame
    minVisibility: 0.5,

    // salto: i fianchi salgono sopra la baseline
    jumpRiseRatio: 0.22, // rialzo / lunghezza torso
    jumpResetRatio: 0.05, // sotto questa quota l'azione si riarma
    jumpCooldownMs: 550,

    // squat: i fianchi scendono sotto la baseline (con isteresi)
    duckEnterRatio: 0.20,
    duckExitRatio: 0.11,

    // lean: spalle spostate lateralmente rispetto ai fianchi
    leanEnterRatio: 0.16, // offset / larghezza spalle
    leanExitRatio: 0.08,
    leanCooldownMs: 220,
    invertLateral: false, // metti true se destra/sinistra risultano scambiate

    lostPoseTimeoutMs: 1200,
  },

  camera: {
    fov: 62,
    position: [0, 3.4, 6.8],
    lookAt: [0, 1.1, -8],
    followX: 0.35, // quanto la camera insegue lateralmente il player
  },
};
