// Fully procedural audio (Web Audio API): adaptive music, elemental foley, ambience. No asset files needed.
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ICE_NOTES = [69, 72, 76, 79, 81, 84, 88, 91]; // A minor add9 shimmer
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]];

export class AudioEngine {
  beat: any;
  busAmb: any;
  busMusic: any;
  busSfx: any;
  ctx: any;
  droneF: any;
  drones: any;
  gIce: any;
  gMag: any;
  master: any;
  musicOn: any;
  muted: any;
  next: any;
  noiseBuf: any;
  rev: any;
  side: any;
  tension: any;
  timer: any;
  v: any;
  constructor() {
    this.ctx = null; this.muted = false; this.tension = 0; this.side = 'w'; this.musicOn = false;
    this.v = { master: 0.8, music: 0.5, sfx: 0.8, amb: 0.35 };
    try { Object.assign(this.v, JSON.parse(localStorage.getItem('gm_audio') || '{}')); } catch { /* ignore */ }
    this.muted = localStorage.getItem('gm_muted') === '1';
  }
  save() { localStorage.setItem('gm_audio', JSON.stringify(this.v)); localStorage.setItem('gm_muted', this.muted ? '1' : '0'); }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor();
    this.master = c.createGain(); this.master.connect(comp); comp.connect(c.destination);
    const bus = () => { const g = c.createGain(); g.connect(this.master); return g; };
    this.busMusic = bus(); this.busSfx = bus(); this.busAmb = bus();
    this.rev = c.createConvolver();
    const len = c.sampleRate * 2.6, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    this.rev.buffer = ir;
    const ro = c.createGain(); ro.gain.value = 0.55; this.rev.connect(ro); ro.connect(this.master);
    const nl = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, nl, c.sampleRate);
    const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.gIce = c.createGain(); this.gMag = c.createGain(); this.gIce.connect(this.busMusic); this.gMag.connect(this.busMusic);
    this.applyVol();
    this.startAmbience();
  }
  applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.v.master, t, 0.05);
    this.busMusic.gain.setTargetAtTime(this.v.music, t, 0.05);
    this.busSfx.gain.setTargetAtTime(this.v.sfx, t, 0.05);
    this.busAmb.gain.setTargetAtTime(this.v.amb, t, 0.05);
  }
  setVol(k, v) { this.v[k] = v; this.applyVol(); this.save(); }
  setMuted(m) { this.muted = m; this.applyVol(); this.save(); }

  // ---------- primitives ----------
  tone(o) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0), osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(o.bus || this.busSfx);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.rev); }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  noise(o) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf; f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.a || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.busSfx);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.rev); }
    src.start(t, rnd(0, 1.5)); src.stop(t + o.dur + 0.05);
  }

  // ---------- sound effects ----------
  play(name: string, o: { el?: string; scale?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const ice = o.el === 'ice';
    switch (name) {
      case 'click': this.tone({ f: 880, f2: 660, dur: 0.06, gain: 0.12, type: 'triangle' }); break;
      case 'select':
        if (ice) { this.tone({ f: 1568, dur: 0.5, gain: 0.1, rev: 0.6 }); this.tone({ f: 2349, dur: 0.4, gain: 0.05, rev: 0.6, delay: 0.05 }); }
        else { this.tone({ f: 110, f2: 80, dur: 0.25, gain: 0.25, type: 'triangle' }); this.noise({ ft: 'lowpass', f: 600, dur: 0.15, gain: 0.12 }); }
        break;
      case 'invalid': this.tone({ f: 150, f2: 70, dur: 0.2, gain: 0.3, type: 'square' }); this.noise({ ft: 'lowpass', f: 300, dur: 0.15, gain: 0.2 }); break;
      case 'move':
        if (ice) { this.noise({ ft: 'highpass', f: 5000, dur: 0.14, gain: 0.12 }); this.tone({ f: mtof(ICE_NOTES[(Math.random() * 6) | 0] + 12), dur: 0.7, gain: 0.07, rev: 0.7 }); }
        else { this.tone({ f: 75, f2: 45, dur: 0.28, gain: 0.5 }); this.noise({ ft: 'lowpass', f: 500, dur: 0.2, gain: 0.3 }); for (let i = 0; i < 3; i++) this.noise({ ft: 'highpass', f: 4000, dur: 0.02, gain: 0.15, delay: rnd(0, 0.15) }); }
        break;
      case 'hoof': [0, 0.13, 0.26, 0.42].forEach((d, i) => { this.tone({ f: 190, f2: 90, dur: 0.1, gain: i === 3 ? 0.5 : 0.3, delay: d * (o.scale || 1) }); this.noise({ f: 1000, dur: 0.05, gain: 0.2, delay: d * (o.scale || 1) }); }); break;
      case 'slam': this.tone({ f: 62, f2: 28, dur: 0.55, gain: 0.7 }); this.noise({ ft: 'lowpass', f: 400, f2: 80, dur: 0.45, gain: 0.5 }); break;
      case 'whoosh': this.noise({ ft: 'bandpass', f: ice ? 1200 : 300, f2: ice ? 5000 : 1400, q: 2, dur: 0.4, gain: 0.18, a: 0.15 }); break;
      case 'capture':
        if (ice) {
          this.noise({ ft: 'highpass', f: 3500, dur: 0.35, gain: 0.35 });
          for (let i = 0; i < 12; i++) this.tone({ f: rnd(1800, 6500), dur: rnd(0.15, 0.4), gain: 0.07, delay: rnd(0, 0.3), rev: 0.5 });
        } else {
          this.tone({ f: 95, f2: 38, dur: 0.6, gain: 0.6 }); this.noise({ ft: 'lowpass', f: 900, f2: 200, dur: 0.6, gain: 0.45 });
          for (let i = 0; i < 8; i++) this.noise({ ft: 'highpass', f: 3500, dur: 0.03, gain: 0.2, delay: rnd(0, 0.5) });
        }
        break;
      case 'check': this.tone({ f: 466, dur: 0.7, gain: 0.18, type: 'triangle', rev: 0.4 }); this.tone({ f: 494, dur: 0.7, gain: 0.18, type: 'triangle', rev: 0.4 }); break;
      case 'promote': [0, 4, 7, 12].forEach((s, i) => this.tone({ f: mtof(72 + s), dur: 0.6, gain: 0.12, delay: i * 0.08, rev: 0.6, type: 'triangle' })); break;
      case 'mate':
        if (ice) {
          this.tone({ f: 55, dur: 3.5, gain: 0.5, a: 0.3, rev: 0.5 }); this.noise({ ft: 'highpass', f: 3000, dur: 1.2, gain: 0.3, delay: 1 });
          for (let i = 0; i < 24; i++) this.tone({ f: rnd(1500, 7000), dur: rnd(0.3, 1), gain: 0.06, delay: 1 + rnd(0, 1.5), rev: 0.7 });
        } else {
          this.noise({ ft: 'lowpass', f: 300, f2: 70, dur: 3, gain: 0.8, a: 0.8 }); this.tone({ f: 48, f2: 30, dur: 3.2, gain: 0.4, type: 'sawtooth', a: 0.6 });
          for (let i = 0; i < 20; i++) this.noise({ ft: 'highpass', f: 3500, dur: 0.03, gain: 0.2, delay: 1 + rnd(0, 2) });
        }
        break;
      case 'end': [0, -3, -7, -12].forEach((s, i) => this.tone({ f: mtof(69 + s), dur: 1.2, gain: 0.12, delay: i * 0.25, rev: 0.8, type: 'triangle' })); break;
    }
  }

  // ---------- adaptive music ----------
  setTension(t, side) {
    this.tension = Math.max(0, Math.min(1, t)); this.side = side;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.gIce.gain.setTargetAtTime(side === 'w' ? 1 : 0.5, now, 1.5);
    this.gMag.gain.setTargetAtTime((side === 'b' ? 0.55 : 0.25) + this.tension * 0.6, now, 1.5);
    if (this.droneF) this.droneF.frequency.setTargetAtTime(160 + this.tension * 700, now, 1);
  }
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    const c = this.ctx; this.musicOn = true; this.beat = 0; this.next = c.currentTime + 0.3;
    this.droneF = c.createBiquadFilter(); this.droneF.type = 'lowpass'; this.droneF.frequency.value = 180;
    const dg = c.createGain(); dg.gain.value = 0.16; this.droneF.connect(dg); dg.connect(this.gMag);
    this.drones = [55, 55.35, 82.4].map((f) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(this.droneF); o.start(); return o; });
    this.setTension(this.tension, this.side);
    this.timer = setInterval(() => this.schedule(), 120);
  }
  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false; clearInterval(this.timer);
    this.drones?.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
  }
  schedule() {
    const c = this.ctx;
    while (this.next < c.currentTime + 0.6) { this.beatAt(this.next - c.currentTime, this.beat++); this.next += 0.5; }
  }
  beatAt(d, b) {
    const T = this.tension, ice = (o) => this.tone({ bus: this.gIce, delay: d, ...o });
    if (Math.random() < 0.38 + 0.1 * T) {
      let n = ICE_NOTES[(Math.random() * ICE_NOTES.length) | 0];
      if (T > 0.55 && Math.random() < 0.25) n -= 1; // sour minor-second under pressure
      ice({ f: mtof(n), dur: 2, gain: 0.06, rev: 0.8, type: 'sine' }); ice({ f: mtof(n + 12), dur: 1.2, gain: 0.025, rev: 0.8, type: 'triangle' });
    }
    if (b % 16 === 0) CHORDS[(b / 16) % 4 | 0].forEach((m) => ice({ f: mtof(m), dur: 7.5, gain: 0.05, a: 2, rev: 0.7, type: 'triangle' }));
    const taiko = (g) => { this.tone({ bus: this.gMag, delay: d, f: 110, f2: 42, dur: 0.45, gain: g }); this.noise({ bus: this.gMag, delay: d, ft: 'lowpass', f: 500, dur: 0.15, gain: g * 0.5 }); };
    if (b % 4 === 0) taiko(0.22 + T * 0.35);
    else if (b % 4 === 2 && T > 0.25) taiko(0.12 + T * 0.25);
    else if (T > 0.6 && Math.random() < 0.5) taiko(0.08 + T * 0.1);
    if (b % 16 === 8 && T > 0.35) this.tone({ bus: this.gMag, delay: d, f: 110, f2: 123, dur: 4, gain: 0.07 * T, a: 1.5, type: 'sawtooth' });
  }
  startAmbience() {
    const c = this.ctx;
    const loop = (type, f, q, gain) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain;
      s.connect(fl); fl.connect(g); g.connect(this.busAmb); s.start(); return { fl, g };
    };
    const wind = loop('bandpass', 600, 0.7, 0.18); loop('lowpass', 90, 0.5, 0.35);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 350; lfo.connect(lg); lg.connect(wind.fl.frequency); lfo.start();
    setInterval(() => { if (!this.muted && Math.random() < 0.5) this.noise({ bus: this.busAmb, ft: 'highpass', f: rnd(2500, 5000), dur: 0.025, gain: rnd(0.05, 0.14) }); }, 350);
  }
}
export const audio = new AudioEngine();
