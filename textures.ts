import * as THREE from 'three';

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function crack(ctx, rand, x, y, len, segs, step) {
  ctx.beginPath(); ctx.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < segs; i++) { a += (rand() - 0.5) * 1.4; x += Math.cos(a) * step; y += Math.sin(a) * step; ctx.lineTo(x, y); }
  ctx.stroke();
}

/** 8x8 board: frozen slate vs. basalt tiles. Canvas top row = rank 8 (far side). */
export function makeBoardTextures() {
  const T = 256, S = T * 8, rand = rng(7);
  const cm = canvas(S, S), ce = canvas(S, S), m = cm.getContext('2d')!, e = ce.getContext('2d')!;
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const x = f * T, y = (7 - r) * T, light = (f + r) % 2 === 1;
    if (light) {
      const g = m.createLinearGradient(x, y, x + T, y + T); g.addColorStop(0, '#e9f7ff'); g.addColorStop(1, '#a4cde8');
      m.fillStyle = g; m.fillRect(x, y, T, T);
      for (let i = 0; i < 220; i++) { m.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(110,170,225,.12)'; m.fillRect(x + rand() * T, y + rand() * T, 2 + rand() * 6, 2 + rand() * 6); }
      m.strokeStyle = 'rgba(255,255,255,.6)'; m.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) crack(m, rand, x + rand() * T, y + rand() * T, 0, 6, 28);
      m.strokeStyle = 'rgba(255,255,255,.35)'; m.lineWidth = 5; m.strokeRect(x + 3, y + 3, T - 6, T - 6);
    } else {
      const g = m.createLinearGradient(x, y, x + T, y + T); g.addColorStop(0, '#2a2120'); g.addColorStop(1, '#0d0a0a');
      m.fillStyle = g; m.fillRect(x, y, T, T);
      for (let i = 0; i < 200; i++) { m.fillStyle = `rgba(255,255,255,${rand() * 0.06})`; m.fillRect(x + rand() * T, y + rand() * T, 2 + rand() * 5, 2 + rand() * 5); }
      m.strokeStyle = 'rgba(255,100,30,.45)'; m.lineWidth = 1.6;
      e.strokeStyle = 'rgba(255,110,30,1)'; e.lineWidth = 2.2; e.shadowColor = '#ff5a10'; e.shadowBlur = 8;
      for (let i = 0; i < 3; i++) {
        const sx = x + rand() * T, sy = y + rand() * T, st = rand() * 1e9;
        const r1 = rng(st), r2 = rng(st);
        crack(m, r1, sx, sy, 0, 7, 26); crack(e, r2, sx, sy, 0, 7, 26);
      }
      e.shadowBlur = 0;
    }
    m.strokeStyle = 'rgba(0,0,0,.4)'; m.lineWidth = 2; m.strokeRect(x, y, T, T);
  }
  return { map: tex(cm), emissive: tex(ce) };
}

/** Frame around the board: ice on the white side, magma on the black side. */
export function makeBorderTextures() {
  const S = 1024, rand = rng(11), cm = canvas(S, S), ce = canvas(S, S), m = cm.getContext('2d')!, e = ce.getContext('2d')!;
  const g = m.createLinearGradient(0, 0, 0, S);
  [[0, '#1d0a06'], [0.4, '#4a190c'], [0.5, '#2f3846'], [0.6, '#5d8199'], [1, '#d3ecf8']].forEach(([p, c]) => g.addColorStop(p as number, c as string));
  m.fillStyle = g; m.fillRect(0, 0, S, S); e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) { m.fillStyle = `rgba(255,255,255,${rand() * 0.09})`; const y = rand() * S; m.fillRect(rand() * S, y, 2 + rand() * 6, 2 + rand() * 4); }
  e.strokeStyle = '#ff6a1a'; e.lineWidth = 3; e.shadowColor = '#ff4a00'; e.shadowBlur = 12;
  for (let i = 0; i < 50; i++) { const sx = rand() * S, sy = rand() * S * 0.5; crack(e, rand, sx, sy, 0, 8, 30); }
  m.strokeStyle = 'rgba(255,255,255,.45)'; m.lineWidth = 1.5;
  for (let i = 0; i < 50; i++) crack(m, rand, rand() * S, S * 0.55 + rand() * S * 0.45, 0, 6, 30);
  return { map: tex(cm), emissive: tex(ce) };
}

/** Black pieces: polished volcanic marble veined with magma. */
export function makeMarbleTextures() {
  const S = 512, rand = rng(23), cm = canvas(S, S), ce = canvas(S, S), m = cm.getContext('2d')!, e = ce.getContext('2d')!;
  m.fillStyle = '#17110f'; m.fillRect(0, 0, S, S); e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { m.fillStyle = `rgba(${40 + rand() * 40},${30 + rand() * 20},${28 + rand() * 20},.18)`; m.beginPath(); m.arc(rand() * S, rand() * S, 10 + rand() * 60, 0, 7); m.fill(); }
  for (let i = 0; i < 26; i++) {
    const sx = rand() * S, sy = rand() * S, seed = rand() * 1e9;
    for (const [ctx, col, w, blur] of ([[m, 'rgba(255,120,40,.65)', 2, 0], [e, '#ff7a22', 3.2, 10], [e, '#ffd27a', 1.1, 0]] as [CanvasRenderingContext2D, string, number, number][])) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.shadowColor = '#ff4a00'; ctx.shadowBlur = blur;
      crack(ctx, rng(seed), sx, sy, 0, 9, 32);
    }
  }
  e.shadowBlur = 0;
  const a = tex(cm), b = tex(ce); a.wrapS = a.wrapT = b.wrapS = b.wrapT = THREE.RepeatWrapping;
  return { map: a, emissive: b };
}
