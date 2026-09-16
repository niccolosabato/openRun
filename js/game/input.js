// Canale unico dei comandi. Le sorgenti (webcam, tastiera) emettono gli stessi
// eventi, così il gioco non sa da dove arrivano.
// Comandi: 'left' | 'right' | 'jump' | 'duck:down' | 'duck:up'

export class InputBus {
  constructor() {
    this.listeners = new Set();
    this.enabled = true;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(command) {
    if (!this.enabled) return;
    for (const fn of this.listeners) fn(command);
  }
}

const KEY_MAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'duck:down',
  KeyS: 'duck:down',
};

// Fallback da tastiera: permette di testare il gioco senza webcam.
export function attachKeyboard(bus, target = window) {
  const onKeyDown = (event) => {
    const command = KEY_MAP[event.code];
    if (!command || event.repeat) return;
    event.preventDefault();
    bus.emit(command);
  };

  const onKeyUp = (event) => {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      bus.emit('duck:up');
    }
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
  };
}
