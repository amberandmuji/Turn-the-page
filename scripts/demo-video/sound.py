# Paper page-turn sound, a numpy copy of js/feedback.js, placed at each turn.
import json, sys, wave, numpy as np
SR = 48000; DUR = 10.0
rng = np.random.default_rng(7)
out = np.zeros(int(SR * DUR))
def bandpass(x, f, q):
    # time-varying RBJ bandpass, per-sample coefficients (small buffers, fine)
    y = np.zeros_like(x); x1=x2=y1=y2=0.0
    for i in range(len(x)):
        w = 2*np.pi*f[i]/SR; al = np.sin(w)/(2*q); a0 = 1+al
        b0, b2 = al/a0, -al/a0; a1, a2 = -2*np.cos(w)/a0, (1-al)/a0
        yi = b0*x[i] + b2*x2 - a1*y1 - a2*y2
        x2, x1 = x1, x[i]; y2, y1 = y1, yi; y[i] = yi
    return y
def noise(n):
    d = rng.uniform(-1,1,n)*0.6
    m = rng.random(n) < 0.02
    d[m] += rng.uniform(-1,1,m.sum())*2.5
    return d
def burst(t, dur, f0, f1, q, peak, attack):
    n = int(dur*SR); tt = np.arange(n)/SR
    f = f0*(f1/f0)**(tt/dur)
    env = np.where(tt < attack, 1e-4*(peak/1e-4)**(tt/attack), peak*(1e-4/peak)**((tt-attack)/max(1e-3,dur-attack)))
    s = int(t*SR); seg = bandpass(noise(n), f, q)*env
    out[s:s+n] += seg[:len(out)-s]
turns = json.load(open(sys.argv[1])); fps = 30
for fr in turns:
    t = fr/fps + 0.02
    burst(t, .28, 1800, 4200, .9, .55, .09)
    burst(t+.04, .22, 5200, 2600, 2.5, .18, .05)
    burst(t+.24, .12, 700, 300, 1.2, .45, .008)
out *= 0.49 / max(1e-6, np.abs(out).max()) * 1.4
out = np.clip(out, -1, 1)
w = wave.open(sys.argv[2], 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype(np.int16).tobytes()); w.close()
