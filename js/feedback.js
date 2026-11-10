// A soft click and an edge flash when the page turns.
let audio = null;

export function playTurnSound(direction) {
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    // Slightly higher pitch going forward, lower going back.
    osc.frequency.setValueAtTime(direction === 'next' ? 660 : 520, t);
    osc.frequency.exponentialRampToValueAtTime(direction === 'next' ? 880 : 390, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {
    // Audio blocked or unavailable; the flash still shows.
  }
}

export function flashEdge(element, direction) {
  const cls = direction === 'next' ? 'flash-next' : 'flash-prev';
  element.classList.remove('flash-next', 'flash-prev');
  void element.offsetWidth; // restart the animation
  element.classList.add(cls);
}
