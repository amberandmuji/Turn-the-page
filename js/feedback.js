// A paper page-turn sound and an edge flash when the page turns.
// The sound is made on the fly from filtered noise, like paper rustling:
// a short swish as the page lifts and slides, then a soft flap as it lands.
// No audio files are needed.
let audio = null;
let noise = null;

function noiseBuffer(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.6);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Slightly "grainy" noise: random crackles over white noise, like paper fibres.
  for (let i = 0; i < length; i++) {
    const crackle = Math.random() < 0.02 ? (Math.random() * 2 - 1) * 2.5 : 0;
    data[i] = (Math.random() * 2 - 1) * 0.6 + crackle;
  }
  return buffer;
}

// One burst of filtered noise: a band that sweeps from one pitch to another.
function burst(ctx, out, t, { dur, from, to, q, peak, attack }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2; // no two turns sound the same
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = q;
  band.frequency.setValueAtTime(from, t);
  band.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(gain).connect(out);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

// volume runs from 0 (silent) to 1 (full).
export function playTurnSound(direction, volume = 1) {
  if (volume <= 0) return;
  try {
    audio = audio || new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    noise = noise || noiseBuffer(audio);
    const t = audio.currentTime + 0.01;
    // Squared, so the slider feels even to the ear.
    const out = audio.createGain();
    out.gain.value = volume * volume;
    out.connect(audio.destination);
    // Turning back sounds a touch lower, so the two directions feel different.
    const pitch = direction === 'next' ? 1 : 0.85;
    // The page lifts and slides across: a rising, airy swish.
    burst(audio, out, t, { dur: 0.28, from: 1800 * pitch, to: 4200 * pitch, q: 0.9, peak: 0.55, attack: 0.09 });
    // Paper rubbing against paper underneath it.
    burst(audio, out, t + 0.04, { dur: 0.22, from: 5200 * pitch, to: 2600 * pitch, q: 2.5, peak: 0.18, attack: 0.05 });
    // The page lands: a soft, low flap.
    burst(audio, out, t + 0.24, { dur: 0.12, from: 700 * pitch, to: 300 * pitch, q: 1.2, peak: 0.45, attack: 0.008 });
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
