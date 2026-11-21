import * as THREE from 'three';
import { fromFEN, colorOf } from '@glacier-magma/shared';
import { World, sqXZ, xzSq } from './world.js';
import { VFX } from './vfx.js';
import { createPiece } from './pieces.js';

const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const DUR = { p: 0.5, n: 0.95, b: 0.6, r: 0.85, q: 0.8, k: 0.7 }; // within the 0.4s - 1.1s act window
const BIG = { p: 1, n: 1.3, b: 1.3, r: 1.4, q: 1.7, k: 2 };

export class GameView {
  onApplied: ((s: any) => void) | null = null; lastMove: number[] = []; mated = false; tension = 0;
  audio: any;
  capGeo: any;
  checkObj: any;
  circleGeo: any;
  clock: any;
  gameKey: any;
  hl: any;
  hmat: any;
  keep: any;


  moveCount: any;
  onSquare: any;
  pending: any;
  pieces: any;
  processing: any;
  ptr: any;
  quadGeo: any;
  ray: any;
  running: any;
  scene: any;
  selected: any;
  settings: any;
  t: any;

  tweens: any;
  vfx: any;
  wardT: any;
  world: any;
  constructor(container, { audio, settings }) {
    this.audio = audio; this.settings = settings;
    this.world = new World(container); this.vfx = new VFX(this.world);
    this.scene = this.world.scene;
    this.pieces = new Map(); this.tweens = []; this.keep = [];
    this.hl = new THREE.Group(); this.scene.add(this.hl);
    this.gameKey = null; this.moveCount = 0; this.pending = null; this.processing = false;
    this.checkObj = null; this.wardT = 0; this.selected = null;
    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2();
    this.onSquare = null; this.running = false; this.t = 0; this.clock = new THREE.Clock();
    const el = this.world.renderer.domElement; let down: { x: number; y: number; t: number } | null = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (moved < 6 && dt < 600) { const sq = this.pick(e); if (sq >= 0) this.onSquare?.(sq); }
    });
    this.circleGeo = new THREE.CircleGeometry(0.16, 24).rotateX(-Math.PI / 2);
    this.capGeo = new THREE.RingGeometry(0.36, 0.47, 32).rotateX(-Math.PI / 2);
    this.quadGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    this.hmat = {};
    for (const [k, c] of Object.entries({ ice: 0x7fe3ff, magma: 0xff7a22, cap: 0xff3b3b, last: 0xffffff })) this.hmat[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: k === 'last' ? 0.16 : 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  start() { if (this.running) return; this.running = true; this.clock.getDelta(); requestAnimationFrame(this.loop); this.world.resize(); }
  stop() { this.running = false; }
  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt; this.step(dt); this.world.render();
  };
  step(dt) {
    for (const tw of [...this.tweens]) {
      tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn?.(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.res(); }
    }
    this.world.update(dt, this.t); this.vfx.update(dt);
    for (const p of this.pieces.values()) {
      p.lift += ((p === this.selected ? 0.2 : 0) - p.lift) * Math.min(1, dt * 12); p.inner.position.y = p.lift;
      if (p.manual) continue;
      const tg = p === this.selected ? 0.55 + 0.4 * Math.sin(this.t * 5) : p === this.checkObj ? 0.5 + 0.5 * Math.sin(this.t * 6) : 0;
      if (Math.abs(tg - p.glow) > 0.002) p.setGlow(lerp(p.glow, tg, Math.min(1, dt * 10)));
    }
    for (const m of this.hl.children) if (m.userData.pulse) m.scale.setScalar(1 + 0.07 * Math.sin(this.t * 5));
    if (this.checkObj && (this.wardT -= dt) <= 0) {
      this.wardT = 1.6; const [x, z] = sqXZ(this.checkObj.sq); if (!this.settings.turbo) this.vfx.ward(this.checkObj.el, x, 0, z);
    }
  }
  tween(dur: number, fn?: (k: number) => void) { return new Promise((res) => this.tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, res })); }
  wait(s) { return this.tween(s); }

  setOrientation(c) { this.world.setOrientation(c); }
  applyQuality() { for (const p of this.pieces.values()) p.setQuality(this.settings.quality); }

  // ---------- board state ----------
  place(ch, sq) {
    const o = createPiece(ch.toLowerCase(), colorOf(ch), this.settings.quality);
    o.sq = sq; const [x, z] = sqXZ(sq); o.group.position.set(x, 0, z); this.scene.add(o.group); this.pieces.set(sq, o); return o;
  }
  remove(o) { this.scene.remove(o.group); o.mat.dispose(); }
  resetBoard(fen) {
    for (const o of this.pieces.values()) this.remove(o);
    this.pieces.clear(); this.checkObj = null; this.selected = null;
    for (const k of this.keep) { this.scene.remove(k); k.traverse?.((c) => c.material?.dispose?.()); }
    this.keep = [];
    const st = fromFEN(fen);
    st.board.forEach((ch, sq) => { if (ch) this.place(ch, sq); });
  }
  reconcile(fen) {
    const st = fromFEN(fen);
    for (let sq = 0; sq < 64; sq++) {
      const ch = st.board[sq], o = this.pieces.get(sq);
      if ((ch && (!o || o.type !== ch.toLowerCase() || o.color !== colorOf(ch))) || (!ch && o)) {
        return this.resetBoard(fen);
      }
    }
  }
  findKing(color) { for (const p of this.pieces.values()) if (p.type === 'k' && p.color === color) return p; return null; }

  // ---------- highlights & selection ----------
  setHighlights({ selected = -1, targets = [], last = [], el = 'ice' }: { selected?: number; targets?: { sq: number; capture: boolean }[]; last?: number[]; el?: string } = {}) {
    for (const m of [...this.hl.children]) this.hl.remove(m);
    const put = (geo, mat, sq, y, pulse) => { const m = new THREE.Mesh(geo, mat); const [x, z] = sqXZ(sq); m.position.set(x, y, z); m.userData.pulse = pulse; m.renderOrder = 2; this.hl.add(m); };
    for (const s of last) put(this.quadGeo, this.hmat.last, s, 0.012, false);
    if (selected >= 0) put(this.quadGeo, this.hmat[el], selected, 0.014, true);
    for (const t of targets) t.capture ? put(this.capGeo, this.hmat.cap, t.sq, 0.02, true) : put(this.circleGeo, this.hmat[el], t.sq, 0.02, false);
    this.selected = selected >= 0 ? this.pieces.get(selected) || null : null;
  }
  pick(ev) {
    const r = this.world.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.world.camera);
    const objs = [...this.pieces.values()].map((p) => p.group); objs.push(this.world.board);
    for (const h of this.ray.intersectObjects(objs, true)) {
      const pc = h.object.userData.piece;
      if (pc) return pc.sq;
      if (h.object === this.world.board) return xzSq(h.point.x, h.point.z);
    }
    return -1;
  }

  // ---------- sync with game snapshots ----------
  sync(snap) { this.pending = snap; if (!this.processing) this.process(); }
  async process() {
    this.processing = true;
    while (this.pending) {
      const snap = this.pending; this.pending = null;
      try { await this.apply(snap); } catch (err) { console.error(err); this.resetBoard(snap.fen); this.moveCount = snap.history.length; }
    }
    this.processing = false;
  }
  async apply(snap) {
    const n = snap.history.length;
    let animated = false;
    if (snap.gameKey !== this.gameKey || n < this.moveCount || n - this.moveCount > 4) {
      this.gameKey = snap.gameKey; this.resetBoard(snap.fen); this.moveCount = n; this.mated = false;
    } else if (n > this.moveCount) {
      animated = true;
      for (let i = this.moveCount; i < n; i++) await this.animateMove(snap.history[i]);
      this.moveCount = n;
      if (!(snap.result?.reason === 'checkmate')) this.reconcile(snap.fen);
    }
    const last = snap.history.at(-1);
    this.lastMove = last ? [last.from, last.to] : [];
    const fin = snap.status === 'finished', mate = fin && snap.result?.reason === 'checkmate';
    this.world.setMomentum(snap.turn, snap.check && !fin);
    const alive = snap.fen.split(' ')[0].replace(/[^A-Za-z]/g, '').length;
    this.tension = Math.min(1, ((32 - alive) / 26) * 0.7 + (snap.check ? 0.35 : 0));
    this.checkObj = null;
    if (snap.check && !fin) {
      this.checkObj = this.findKing(snap.turn); this.wardT = 0;
      if (animated) this.audio.play('check');
    }
    this.onApplied?.(snap);
    if (mate && !this.mated) { this.mated = true; await this.mateSeq(snap.turn, !animated); }
    if (!mate) this.mated = false;
  }

  // ---------- choreography ----------
  async animateMove(e) {
    const turbo = this.settings.turbo, mover = this.pieces.get(e.from);
    if (!mover) throw new Error('desync');
    const t = mover.type, el = mover.el, au = this.audio, W = this.world;
    const [x0, z0] = sqXZ(e.from), [x1, z1] = sqXZ(e.to);
    const capSq = e.ep ? (e.color === 'w' ? e.to - 8 : e.to + 8) : e.to;
    const victim = e.captured ? this.pieces.get(capSq) : null;
    this.pieces.delete(e.from); if (victim) this.pieces.delete(capSq);
    let rookTask = Promise.resolve();
    if (e.castle) {
      const base = e.color === 'w' ? 0 : 56, rf = base + (e.castle === 'K' ? 7 : 0), rt = base + (e.castle === 'K' ? 5 : 3), rook = this.pieces.get(rf);
      if (rook) { this.pieces.delete(rf); rook.sq = rt; this.pieces.set(rt, rook); rookTask = this.slide(rook, rf, rt, DUR.r); }
    }
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const g = mover.group, cap = !!victim; let impacted = false;
    const impact = () => { if (impacted) return; impacted = true; if (victim) this.kill(victim, el, x1, z1); };
    if (!turbo) { if (t === 'n') au.play('hoof'); else if (t === 'b' || t === 'q') au.play('whoosh', { el }); else au.play('move', { el }); }
    const axis = new THREE.Vector3(ux, 0, uz), pivot = mover.head ? mover.facing : 0;
    await this.tween(turbo ? 0.001 : DUR[t], (k) => {
      const p = t === 'p' && cap ? easeOut(k) : easeIO(k);
      const x = lerp(x0, x1, p), z = lerp(z0, z1, p); let y = 0;
      g.rotation.set(0, 0, 0);
      if (t === 'n') {
        y = Math.sin(Math.PI * k) * 1.15; const lean = -Math.cos(Math.PI * k) * 0.25;
        g.rotation.x = uz * lean; g.rotation.z = -ux * lean;
        const face = sm(0, 0.2, k) * (1 - sm(0.8, 1, k)), a1 = Math.atan2(-uz, ux); let d = a1 - pivot; d = Math.atan2(Math.sin(d), Math.cos(d));
        mover.head.rotation.y = pivot + d * face;
      } else if (t === 'p') { const lean = Math.sin(Math.PI * k) * (cap ? 0.3 : 0.16); g.rotation.x = uz * lean; g.rotation.z = -ux * lean; y = cap ? Math.sin(Math.PI * k) * 0.12 : 0; }
      else if (t === 'b') { g.quaternion.setFromAxisAngle(axis, Math.sin(Math.PI * k) * 0.32); y = Math.sin(Math.PI * k) * 0.08; }
      else if (t === 'r') y = Math.sin(Math.PI * k) * 0.06;
      else if (t === 'q') { y = Math.sin(Math.PI * k) * 0.16; mover.inner.rotation.y = Math.sin(Math.PI * k) * 0.7; }
      else y = Math.sin(Math.PI * k) * 0.08;
      g.position.set(x, y, z);
      if (!turbo && Math.random() < 0.7) { this.vfx.trail(el, x, y, z, t === 'q' ? 3 : t === 'r' ? 2 : 1); }
      if (t === 'q' && !turbo && Math.random() < 0.08) this.vfx.ringFx(el, x, 0.1, z, 1.6, 0.4);
      if (k > (t === 'p' ? 0.7 : 0.82)) impact();
    });
    g.rotation.set(0, 0, 0); g.position.set(x1, 0, z1); mover.inner.rotation.y = 0;
    if (mover.head) mover.head.rotation.y = mover.facing;
    mover.sq = e.to; this.pieces.set(e.to, mover);
    impact();
    if (!turbo) {
      this.vfx.landing(el, x1, z1, t === 'n' ? 1.3 : t === 'r' ? 1.5 : t === 'k' ? 1.1 : 0.6);
      if (t === 'r') { au.play('slam'); W.shake = 0.1; } else if (t === 'k') W.shake = Math.max(W.shake, 0.03);
      else if (t === 'n') W.shake = Math.max(W.shake, 0.045);
    }
    if (e.promo) {
      this.remove(mover); this.pieces.delete(e.to);
      const np = this.place(e.color === 'w' ? e.promo.toUpperCase() : e.promo, e.to);
      this.vfx.promote(np.el, x1, z1); au.play('promote');
    }
    await rookTask;
  }
  slide(obj, from, to, dur) {
    const [x0, z0] = sqXZ(from), [x1, z1] = sqXZ(to), turbo = this.settings.turbo;
    return this.tween(turbo ? 0.001 : dur, (k) => { const p = easeIO(k); obj.group.position.set(lerp(x0, x1, p), Math.sin(Math.PI * k) * 0.25, lerp(z0, z1, p)); if (!turbo && Math.random() < 0.5) this.vfx.trail(obj.el, obj.group.position.x, 0, obj.group.position.z, 1); })
      .then(() => { obj.group.position.set(x1, 0, z1); if (!turbo) this.vfx.landing(obj.el, x1, z1, 1.2); });
  }
  kill(v, attackerEl, x, z) {
    this.remove(v);
    if (this.settings.turbo) { this.audio.play('move', { el: v.el }); return; }
    this.vfx.capture(attackerEl, x, z); this.vfx.shatter(v.el, x, 0, z, BIG[v.type]); this.audio.play('capture', { el: v.el });
  }
  async mateSeq(color, instant) {
    const king = this.findKing(color); if (!king) return;
    const [x, z] = sqXZ(king.sq), el = king.el;
    if (instant) { this.remove(king); this.pieces.delete(king.sq); this.keep.push(el === 'ice' ? this.vfx.emblem(x, z, true) : this.vfx.crackedStone(x, z, true)); return; }
    this.audio.play('mate', { el }); king.manual = true; this.checkObj = null;
    await this.tween(1.5, (k) => {
      king.setGlow(k * 3.2); king.group.position.set(x + (Math.random() - 0.5) * 0.06 * k, 0, z + (Math.random() - 0.5) * 0.06 * k);
      this.world.shake = Math.max(this.world.shake, 0.025 * k); if (Math.random() < 0.6) this.vfx.trail(el, x, 0.4 + Math.random() * 0.9, z, 1);
    });
    this.remove(king); this.pieces.delete(king.sq); this.world.shake = 0.2;
    if (el === 'ice') { this.vfx.shatter('ice', x, 0.4, z, 2.4); this.vfx.blizzard(x, z); this.vfx.aurora(); await this.wait(1.3); this.keep.push(this.vfx.emblem(x, z)); }
    else { this.vfx.eruption(x, z); this.vfx.shatter('magma', x, 0.4, z, 1.9); await this.wait(1); this.keep.push(this.vfx.crackedStone(x, z)); }
  }
}
