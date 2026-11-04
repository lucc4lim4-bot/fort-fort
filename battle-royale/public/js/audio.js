// Efeitos sonoros sintetizados (WebAudio) — sem arquivos externos.
let ctx = null, master = null, noiseBuf = null;
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v) { if (master) master.gain.value = v; }
function noise(dur, vol, f0, f1, type = 'lowpass', q = 1) {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), ctx.currentTime + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(); s.stop(ctx.currentTime + dur + 0.05);
}
function tone(freq, dur, vol, type = 'sine', slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.05);
}
export const sfx = {
  shot(kind, vol = 1) {
    const v = Math.min(1, vol);
    if (kind === 'sniper') { noise(0.7, 0.9 * v, 2600, 120, 'lowpass'); tone(90, 0.4, 0.6 * v, 'sine', -50); }
    else if (kind === 'shotgun') { noise(0.45, 0.9 * v, 3200, 140, 'lowpass'); tone(110, 0.25, 0.5 * v, 'sine', -60); }
    else if (kind === 'ar') { noise(0.2, 0.55 * v, 3800, 260, 'lowpass'); tone(150, 0.12, 0.35 * v, 'square', -90); }
    else if (kind === 'smg') { noise(0.13, 0.4 * v, 5200, 500, 'lowpass'); tone(210, 0.08, 0.2 * v, 'square', -120); }
    else if (kind === 'pistol') { noise(0.16, 0.45 * v, 4200, 400, 'lowpass'); tone(180, 0.1, 0.3 * v, 'square', -100); }
    else if (kind === 'pickaxe') noise(0.15, 0.3 * v, 800, 3000, 'bandpass', 1.5);
  },
  hit(head) { tone(head ? 1500 : 900, 0.08, 0.28, 'triangle'); if (head) tone(2200, 0.1, 0.2, 'triangle'); },
  kill() { tone(500, 0.18, 0.3, 'sawtooth', 500); tone(1000, 0.2, 0.2, 'triangle', 300); },
  hurt() { noise(0.18, 0.5, 500, 100, 'lowpass'); },
  pickup() { tone(660, 0.07, 0.2, 'triangle'); setTimeout(() => tone(990, 0.09, 0.2, 'triangle'), 60); },
  build() { noise(0.12, 0.4, 900, 200, 'bandpass', 2); tone(140, 0.08, 0.25, 'square', -40); },
  harvest() { noise(0.1, 0.5, 1800, 500, 'bandpass', 3); tone(260, 0.06, 0.25, 'square', -80); },
  reload() { noise(0.05, 0.4, 3000, 2000, 'highpass'); setTimeout(() => noise(0.06, 0.45, 2500, 1500, 'highpass'), 380); },
  chest() { tone(523, 0.12, 0.25, 'triangle'); setTimeout(() => tone(659, 0.12, 0.25, 'triangle'), 90); setTimeout(() => tone(784, 0.25, 0.25, 'triangle'), 180); },
  bus() { tone(160, 0.5, 0.15, 'sawtooth', 20); },
  click() { tone(800, 0.04, 0.15, 'square'); },
  jump() { noise(0.35, 0.5, 600, 2400, 'bandpass', 1); },
  storm() { noise(0.9, 0.25, 300, 120, 'lowpass'); },
};
