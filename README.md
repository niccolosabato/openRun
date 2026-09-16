# openRun

Endless runner 3D in stile *Temple Run* **controllato con il corpo**: la webcam
legge i tuoi movimenti in tempo reale e li trasforma nei quattro comandi del
gioco — salto, duck (scivolata), destra e sinistra.

Tutto gira nel browser, senza build step e senza backend.

```
salto      -> salti davvero (i fianchi salgono)
duck       -> ti accovacci
destra     -> inclini il busto a destra
sinistra   -> inclini il busto a sinistra
```

## Come funziona

```
webcam (getUserMedia)
   -> MediaPipe PoseLandmarker (33 landmark, on-device)
   -> normalizzazione sulla posa neutra calibrata
   -> soglie + isteresi => comandi discreti
   -> gioco Three.js (pista infinita a 3 corsie)
```

- **Rilevamento pose**: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
  `PoseLandmarker` (modello *lite*, delegate GPU) via CDN.
- **Rendering**: [Three.js](https://threejs.org/) via importmap da CDN.
- **Niente build**: HTML/CSS/JS vanilla, ES module nativi.

## Requisiti per l'esecuzione

- Un browser recente (Chrome/Edge/Firefox) con **WebGL** e **webcam**.
- Contesto sicuro: la webcam (`getUserMedia`) funziona solo su **HTTPS** o
  **localhost**. Aprire `index.html` con `file://` **non** funziona (i moduli
  non si caricano e la camera è bloccata).
- Connessione a internet al primo caricamento (CDN + modello pose). Non serve
  invece alcun server applicativo.

## Avvio

```bash
# dalla cartella openRun/
python3 -m http.server 8000
# oppure
npm run serve
```

Poi apri <http://localhost:8000>. Su GitHub Pages basta pubblicare la cartella:
è già HTTPS.

## Test su mobile

`server.py` ascolta su tutte le interfacce e stampa l'URL da digitare sul
telefono (stessa rete Wi-Fi):

```bash
python3 server.py 8000
#   mobile  http://192.168.x.x:8000/
```

⚠️ Su mobile l'HTTP semplice **non basta**: `http://<ip-lan>:8000` non è un
*contesto sicuro*, quindi il browser blocca la webcam (`getUserMedia`). Il
gioco si avvia ma i comandi del corpo non funzionano. Per sbloccare la camera
serve HTTPS (o un'origine dichiarata sicura):

- **Tunnel HTTPS (consigliato, funziona anche su iOS)**
  ```bash
  cloudflared tunnel --url http://localhost:8000   # oppure: ngrok http 8000
  ```
  Apri sul telefono l'URL `https://…` che viene stampato.

- **Solo Android/Chrome, senza internet**: apri
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, aggiungi
  `http://<ip-lan>:8000`, imposta *Enabled* e riavvia il browser. Da quel
  momento la camera funziona su quell'origine.

- **GitHub Pages**: pubblica la cartella, è già HTTPS.

Nota: per il riconoscimento del corpo devi restare **interamente
inquadrato**, quindi il telefono va appoggiato lontano. Serve inoltre una
rete in cui i dispositivi si vedono tra loro (su alcune Wi-Fi pubbliche o
aziendali l'isolamento dei client lo impedisce).

## Uso

1. **Attiva webcam e calibra**: concedi il permesso. Hai **3 secondi** per
   metterti in posa neutra (dritto, tutto il corpo in inquadratura); poi resta
   fermo finché la barra non è completa. La calibrazione costruisce la tua
   *baseline* personale.
2. Dopo il countdown il gioco parte. Salta, accovacciati, inclinati.
3. Se ti allontani dall'inquadratura il gioco va in pausa da solo e riprende
   quando ricompari.
4. **Gioca con la tastiera**: modalità di prova senza webcam
   (`←` `→` corsie, `↑`/`Spazio` salto, `↓` duck).
5. Tasto `` ` `` (backtick) o il pulsante `{ }`: pannello debug con le
   barre dei segnali (salto/lean) e gli FPS. Utile per la taratura.

## Taratura dei gesti

Tutti i parametri stanno in `js/config.js`, sezione `gestures`. Le soglie sono
**rapporti**, non pixel, quindi funzionano a qualsiasi distanza.

| Parametro | Significato |
|---|---|
| `jumpRiseRatio` | quanto devono salire i fianchi per un salto (frazione del torso) |
| `duckEnterRatio` / `duckExitRatio` | ingresso/uscita dallo squat (isteresi) |
| `leanEnterRatio` / `leanExitRatio` | ingresso/uscita dall'inclinazione (isteresi) |
| `cooldown` vari | tempi minimi tra due comandi uguali |
| `invertLateral` | metti `true` se destra/sinistra risultano scambiate |

Procedura rapida: apri il pannello debug, guarda le barre, esegui il movimento e
regola la soglia appena sotto il picco che ottieni.

## Struttura

```
openRun/
  index.html            importmap CDN, schermate, HUD, anteprima webcam
  css/style.css
  js/
    config.js           tutti i parametri regolabili
    main.js             bootstrap: camera -> pose -> gesti -> loop
    hud.js              schermate, HUD, overlay scheletro, debug
    pose/
      tracker.js        init + detectForVideo di MediaPipe
      gestures.js       landmark -> segnali -> comandi (puro, testato)
      calibration.js    baseline personale dalla posa neutra (puro, testato)
    game/
      input.js          canale comandi unico: webcam + tastiera
      player.js         corsia, salto, duck, collisioni (puro, testato)
      spawner.js        generazione file di ostacoli/monete (puro, testato)
      scene.js          scena, pista infinita, mesh Three.js
      game.js           state machine, speed ramp, punteggio
  tests/run.mjs         test della logica pura con Node
```

## Test

```bash
node tests/run.mjs   # oppure: npm test
```

Coprono la logica pura (niente browser/WebGL): normalizzazione dei gesti e
isteresi, calibrazione, fisica del player, collisioni, solvibilità dello
spawner e un giro completo del `Game` con un World finto.

## Privacy

L'elaborazione del video avviene **interamente nel browser** (WASM/WebGL). I
frame della webcam non vengono inviati da nessuna parte: non esiste un backend.
MediaPipe invia a Google solo metriche anonime di performance/utilizzo delle
proprie API, non le immagini.

## Cosa è reale e cosa no (limiti)

- **Reale**: rilevamento pose, riconoscimento dei gesti, gioco, punteggio.
- **Segnaposto**: la grafica è tutta procedurale (capsule e box), nessun
  modello/animazione/audio di terze parti. Gli ostacoli sono tre forme
  astratte: bassa (salto), alta (duck), piena (cambio corsia).
- **Nessuna persistenza**: punteggi e calibrazione vivono in memoria, si
  perdono al reload. Nessun account, nessun salvataggio online.
- **Latenza**: l'inferenza + il filtro introducono un ritardo tipico di
  50–120 ms. Il salto richiede inoltre una piccola finestra di movimento per
  essere distinto da uno squat: aspettati un riconoscimento non istantaneo.
- **Dipendenza dalla webcam**: luce, sfondo e distanza influenzano
  l'accuratezza. La calibrazione mitiga ma non elimina il problema.
- **Un solo giocatore**, inquadratura singola, niente multiplayer.
- **CDN**: al primo avvio servono rete e i domini jsdelivr.net e
  storage.googleapis.com raggiungibili.

## Possibili sviluppi

- Asset e animazioni curati, audio.
- Riconoscimento di passi laterali oltre all'inclinazione.
- Salvataggio del record in `localStorage`.
- Modalità mobile / fallback touch.
