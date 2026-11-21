import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

/** GPU point-sprite particle pool (soft round sprites, per-particle size/colour/alpha). */
class Particles {
  a0: any;
  age: any;
  alpha: any;
  c0: any;
  c1: any;
  colr: any;
  drag: any;
  g: any;
  geo: any;
  i: any;
  life: any;
  mat: any;
  max: any;
  points: any;
  pos: any;
  s0: any;
  s1: any;
  size: any;
  vel: any;
  constructor(scene, max, additive) {
    this.max = max; this.i = 0;
    const f = (n) => new Float32Array(max * n);
    Object.assign(this, { pos: f(3), vel: f(3), c0: f(3), c1: f(3), colr: f(3), size: f(1), s0: f(1), s1: f(1), alpha: f(1), a0: f(1), life: f(1), age: f(1), g: f(1), drag: f(1) });
    this.age.fill(1); this.life.fill(1);
    const geo = (this.geo = new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; if(a<0.003) discard; gl_FragColor=vec4(vC,a); }`,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(o) {
    const i = this.i; this.i = (i + 1) % this.max; const k = i * 3;
    this.pos[k] = o.x; this.pos[k + 1] = o.y; this.pos[k + 2] = o.z;
    this.vel[k] = o.vx || 0; this.vel[k + 1] = o.vy || 0; this.vel[k + 2] = o.vz || 0;
    const a = o.c0, b = o.c1 || o.c0;
    for (let j = 0; j < 3; j++) { this.c0[k + j] = a[j]; this.c1[k + j] = b[j]; }
    this.s0[i] = o.s0; this.s1[i] = o.s1 ?? o.s0; this.a0[i] = o.a ?? 1; this.life[i] = o.life; this.age[i] = 0; this.g[i] = o.g || 0; this.drag[i] = o.drag || 0;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i];
      if (t >= 1) { this.alpha[i] = 0; continue; }
      const k = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k + 1] -= this.g[i] * dt;
      for (let j = 0; j < 3; j++) { this.vel[k + j] *= dr; this.pos[k + j] += this.vel[k + j] * dt; this.colr[k + j] = this.c0[k + j] + (this.c1[k + j] - this.c0[k + j]) * t; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * (t < 0.1 ? t / 0.1 : 1);
    }
    for (const n of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[n].needsUpdate = true;
  }
}

const C = { frost: col(0xbfeaff), white: col(0xffffff), cyan: col(0x5fd4ff), deep: col(0x2a7fd0), ember: col(0xff7a1e), yellow: col(0xffd27a), red: col(0xd62a08), ash: col(0x3a3532), smoke: col(0x5a5450), dark: col(0x120e0d), mist: col(0xbad8f0), aur1: col(0x46ffb4), aur2: col(0x9a6bff) };
const ring = (r0, r1) => { const g = new THREE.RingGeometry(r0, r1, 56); g.rotateX(-Math.PI / 2); return g; };
const RING = ring(0.9, 1);
const SHARD = new THREE.OctahedronGeometry(0.1, 0), CHUNK = new THREE.DodecahedronGeometry(0.1, 0), CONE = new THREE.ConeGeometry(0.07, 0.8, 5);
CONE.translate(0, 0.4, 0);

export class VFX {
  add: any;
  ambT: any;
  fireFlash: any;
  fragIce: any;
  iceFlash: any;
  items: any;
  nrm: any;
  scene: any;
  t: any;
  world: any;
  constructor(world) {
    this.scene = world.scene; this.world = world; this.items = []; this.t = 0; this.ambT = 0;
    this.add = new Particles(this.scene, 4500, true);
    this.nrm = new Particles(this.scene, 2200, false);
    world.onResize = (s) => { this.add.mat.uniforms.uScale.value = s; this.nrm.mat.uniforms.uScale.value = s; };
    world.onResize(world.pxScale);
    this.iceFlash = new THREE.PointLight(0x7fdcff, 0, 9, 2); this.fireFlash = new THREE.PointLight(0xff6a22, 0, 9, 2);
    this.scene.add(this.iceFlash, this.fireFlash);
    this.fragIce = new THREE.MeshPhysicalMaterial({ color: 0xcdeeff, roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true, emissive: 0x2a8acd, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 });
  }
  flash(el, x, z, power = 60, y = 1) {
    const l = el === 'ice' ? this.iceFlash : this.fireFlash; l.position.set(x, y, z); l.intensity = power;
  }
  push(item) { this.items.push(item); return item; }
  fade(mesh, dur, peak = 1, grow = 0, parent = this.scene) {
    parent.add(mesh); let age = 0;
    return this.push({ update: (dt) => {
      age += dt; const t = age / dur;
      if (t >= 1) { parent.remove(mesh); mesh.material.dispose?.(); return false; }
      mesh.material.opacity = peak * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - t * 0.3);
      if (grow) mesh.scale.setScalar(1 + grow * t);
      return true;
    } });
  }
  disc(x, z, color, radius, dur, peak = 0.5, blending: THREE.Blending = THREE.AdditiveBlending) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); return this.fade(m, dur, peak);
  }
  ringFx(el, x, y, z, max = 2.5, dur = 0.6) {
    const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: el === 'ice' ? 0x8fe3ff : 0xff7a22, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.scale.setScalar(0.3); this.scene.add(m); let age = 0;
    this.push({ update: (dt) => { age += dt; const t = age / dur; if (t >= 1) { this.scene.remove(m); m.material.dispose(); return false; } m.scale.setScalar(0.3 + (max - 0.3) * (1 - (1 - t) ** 2)); m.material.opacity = (1 - t) ** 1.5; return true; } });
  }

  // ---- movement ----
  trail(el, x, y, z, amount = 1) {
    for (let i = 0; i < amount; i++) {
      if (el === 'ice') {
        this.add.emit({ x: x + rnd(-0.2, 0.2), y: y + rnd(0.05, 0.6), z: z + rnd(-0.2, 0.2), vy: rnd(-0.1, 0.3), vx: rnd(-0.2, 0.2), vz: rnd(-0.2, 0.2), life: rnd(0.4, 0.8), s0: rnd(0.05, 0.14), s1: 0.01, c0: Math.random() < 0.4 ? C.white : C.cyan, c1: C.deep, a: 0.9 });
      } else {
        this.add.emit({ x: x + rnd(-0.2, 0.2), y: y + rnd(0.05, 0.4), z: z + rnd(-0.2, 0.2), vy: rnd(0.3, 1), vx: rnd(-0.2, 0.2), vz: rnd(-0.2, 0.2), life: rnd(0.5, 1), s0: rnd(0.05, 0.12), s1: 0.01, c0: C.yellow, c1: C.red, a: 0.95, g: -0.2 });
        if (Math.random() < 0.3) this.nrm.emit({ x, y: y + 0.4, z, vy: 0.5, life: 1.2, s0: 0.15, s1: 0.5, c0: C.smoke, c1: C.ash, a: 0.25 });
      }
    }
  }
  landing(el, x, z, power = 1) {
    this.ringFx(el, x, 0.05, z, 1.4 + power, 0.55);
    const n = Math.round(22 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(0.8, 2.4) * power;
      if (el === 'ice') this.add.emit({ x, y: 0.05, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(0.2, 0.9), life: rnd(0.5, 1), s0: rnd(0.06, 0.15), s1: 0.02, c0: C.frost, c1: C.cyan, a: 0.8, g: 1.5, drag: 1.5 });
      else this.add.emit({ x, y: 0.05, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: rnd(0.8, 2.2), life: rnd(0.4, 0.9), s0: rnd(0.04, 0.1), s1: 0.01, c0: C.yellow, c1: C.red, a: 1, g: 5 });
    }
    this.flash(el, x, z, 18 * power, 0.6);
  }

  // ---- capture ----
  capture(el, x, z) {
    this.flash(el, x, z, 70, 0.9);
    if (el === 'ice') {
      for (let i = 0; i < 7; i++) { // ice-shard lances
        const m = new THREE.Mesh(CONE, new THREE.MeshPhysicalMaterial({ color: 0xcdf1ff, roughness: 0.05, emissive: 0x39a6ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.95, flatShading: true }));
        const a = (i / 7) * Math.PI * 2 + rnd(-0.2, 0.2);
        m.position.set(x, 0.15, z); m.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0); m.rotation.order = 'YXZ';
        m.lookAt(x + Math.cos(a), 0.9, z + Math.sin(a)); m.rotateX(Math.PI / 2);
        m.scale.set(0.01, 0.01, 0.01); this.scene.add(m); let age = 0;
        this.push({ update: (dt) => { age += dt; const t = age / 0.7; if (t >= 1) { this.scene.remove(m); m.material.dispose(); return false; } const s = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75; m.scale.set(s * 0.9 + 0.01, s * 0.9 + 0.01, s * 0.9 + 0.01); m.material.opacity = Math.min(1, 1.3 - t); return true; } });
      }
      for (let i = 0; i < 40; i++) this.add.emit({ x, y: 0.5, z, vx: rnd(-1.5, 1.5), vy: rnd(0, 2), vz: rnd(-1.5, 1.5), life: rnd(0.5, 1.2), s0: rnd(0.08, 0.2), s1: 0.3, c0: C.white, c1: C.mist, a: 0.55, drag: 1.2 });
      this.disc(x, z, 0xb9eaff, 0.5, 2.5, 0.6); // frost-lock
    } else {
      for (let i = 0; i < 3; i++) { // molten arcs
        const a = Math.random() * Math.PI * 2;
        for (let j = 0; j < 22; j++) this.add.emit({ x, y: 0.3, z, vx: Math.cos(a) * rnd(1.5, 2.6) + rnd(-0.1, 0.1), vz: Math.sin(a) * rnd(1.5, 2.6) + rnd(-0.1, 0.1), vy: rnd(2.5, 3.5), life: rnd(0.7, 1.1), s0: 0.1, s1: 0.03, c0: C.yellow, c1: C.red, a: 1, g: 7 });
      }
      for (let i = 0; i < 45; i++) this.add.emit({ x, y: 0.3, z, vx: rnd(-2.5, 2.5), vy: rnd(1, 4), vz: rnd(-2.5, 2.5), life: rnd(0.4, 1), s0: rnd(0.04, 0.1), s1: 0.01, c0: C.yellow, c1: C.ember, a: 1, g: 6 });
      this.disc(x, z, 0x0a0706, 0.55, 3, 0.7, THREE.NormalBlending); // scorched ash
    }
  }
  /** Victim destroyed: pawns/pieces shatter into ice (then melt to a sheen) or crumble to embers, ash and obsidian pebbles. */
  shatter(el, x, y, z, big = 1) {
    const n = Math.round(14 * big);
    for (let i = 0; i < n; i++) {
      const ice = el === 'ice', mat = ice ? this.fragIce : new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.3, metalness: 0.3, emissive: 0xff5a10, emissiveIntensity: 2 });
      const m = new THREE.Mesh(ice ? SHARD : CHUNK, mat); m.castShadow = true;
      const s = rnd(0.6, 1.5) * (0.7 + 0.3 * big); m.scale.set(s, s * rnd(0.8, 1.6), s);
      m.position.set(x + rnd(-0.15, 0.15), y + rnd(0.1, 0.8) * big * 0.7, z + rnd(-0.15, 0.15)); this.scene.add(m);
      const v = new THREE.Vector3(rnd(-1.6, 1.6), rnd(1.5, 4), rnd(-1.6, 1.6)), w = new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)); let age = 0; const life = rnd(1.6, 2.4);
      this.push({ update: (dt) => {
        age += dt; v.y -= 11 * dt; m.position.addScaledVector(v, dt); m.rotation.x += w.x * dt; m.rotation.y += w.y * dt;
        if (m.position.y < 0.07) { m.position.y = 0.07; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; w.multiplyScalar(0.5); }
        if (!ice) m.material.emissiveIntensity = Math.max(0, 2 * (1 - age / (life * 0.7)));
        const t = age / life; if (t > 0.6) m.scale.multiplyScalar(1 - dt * 2.2);
        if (t >= 1) { this.scene.remove(m); if (!ice) m.material.dispose(); return false; } return true;
      } });
    }
    const q = Math.round(26 * big);
    for (let i = 0; i < q; i++) {
      if (el === 'ice') this.add.emit({ x, y: y + rnd(0, 0.8), z, vx: rnd(-1.2, 1.2), vy: rnd(0.5, 2.5), vz: rnd(-1.2, 1.2), life: rnd(1, 2), s0: rnd(0.05, 0.12), s1: 0.02, c0: C.white, c1: C.cyan, a: 0.9, g: 1.2, drag: 0.5 });
      else {
        this.add.emit({ x, y: y + rnd(0, 0.8), z, vx: rnd(-0.8, 0.8), vy: rnd(0.8, 2.2), vz: rnd(-0.8, 0.8), life: rnd(1, 2), s0: rnd(0.05, 0.1), s1: 0.02, c0: C.yellow, c1: C.dark, a: 1, g: 0.5, drag: 0.4 });
        this.nrm.emit({ x, y: y + 0.3, z, vx: rnd(-0.3, 0.3), vy: rnd(0.4, 1), vz: rnd(-0.3, 0.3), life: rnd(1.5, 2.8), s0: 0.2, s1: 0.8, c0: C.smoke, c1: C.ash, a: 0.35 });
      }
    }
    if (el === 'ice') this.disc(x, z, 0x7fcfff, 0.55, 2.4, 0.5); // melt sheen
  }
  ward(el, x, y, z) { // check warning pulse
    this.ringFx(el, x, 0.1, z, 2.2, 0.8);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.0, 28, 1, true), new THREE.MeshBasicMaterial({ color: el === 'ice' ? 0x66d8ff : 0xff6a22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, 1, z); this.fade(m, 0.9, 0.35, 0.6);
    this.flash(el, x, z, 25, 1.4);
  }
  promote(el, x, z) {
    this.ringFx(el, x, 0.1, z, 2.4, 0.7);
    for (let i = 0; i < 40; i++) this.add.emit({ x, y: 0.2, z, vx: rnd(-0.6, 0.6), vy: rnd(1.5, 3.5), vz: rnd(-0.6, 0.6), life: rnd(0.8, 1.4), s0: 0.09, s1: 0.02, c0: el === 'ice' ? C.white : C.yellow, c1: el === 'ice' ? C.cyan : C.red, a: 1, g: 0.5 });
    this.flash(el, x, z, 60, 1.2);
  }

  // ---- checkmate finales ----
  blizzard(x, z, dur = 3.4) {
    let age = 0;
    this.flash('ice', x, z, 120, 1.6);
    this.push({ update: (dt) => {
      age += dt; if (age > dur) return false;
      for (let i = 0; i < 26; i++) {
        const a = age * 4 + Math.random() * 6.28, r = rnd(0.1, 1 + age * 0.9), h = rnd(0, 3.2);
        const sp = 3.4;
        this.add.emit({ x: x + Math.cos(a) * r, y: h, z: z + Math.sin(a) * r, vx: -Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(0.2, 1), life: rnd(0.8, 1.6), s0: rnd(0.06, 0.16), s1: 0.02, c0: Math.random() < 0.5 ? C.white : C.cyan, c1: C.deep, a: 0.9 });
      }
      if (Math.random() < 0.6) this.nrm.emit({ x: x + rnd(-1, 1), y: rnd(0, 1.5), z: z + rnd(-1, 1), vy: 0.4, life: 1.8, s0: 0.5, s1: 1.6, c0: C.mist, c1: C.mist, a: 0.18 });
      this.iceFlash.intensity = Math.max(this.iceFlash.intensity, 30 + 20 * Math.sin(age * 9)); return true;
    } });
  }
  eruption(x, z, dur = 3) {
    let age = 0;
    this.flash('fire', x, z, 200, 1.8);
    for (let i = 0; i < 160; i++) this.add.emit({ x, y: 0.3, z, vx: rnd(-2.2, 2.2), vy: rnd(3, 8), vz: rnd(-2.2, 2.2), life: rnd(1, 2.2), s0: rnd(0.08, 0.22), s1: 0.03, c0: C.yellow, c1: C.red, a: 1, g: 5 });
    this.ringFx('fire', x, 0.1, z, 4, 1.1);
    this.push({ update: (dt) => {
      age += dt; if (age > dur) return false;
      for (let i = 0; i < 8; i++) this.nrm.emit({ x: x + rnd(-0.4, 0.4), y: 0.5, z: z + rnd(-0.4, 0.4), vx: rnd(-0.8, 0.8), vy: rnd(1.5, 3), vz: rnd(-0.8, 0.8), life: rnd(2, 3.5), s0: 0.4, s1: 1.8, c0: C.smoke, c1: C.ash, a: 0.4 });
      for (let i = 0; i < 5; i++) this.add.emit({ x: x + rnd(-0.3, 0.3), y: 0.4, z: z + rnd(-0.3, 0.3), vx: rnd(-0.5, 0.5), vy: rnd(1, 3), vz: rnd(-0.5, 0.5), life: rnd(1, 2.4), s0: 0.06, s1: 0.01, c0: C.ember, c1: C.dark, a: 1, g: -0.3 });
      this.fireFlash.intensity = Math.max(this.fireFlash.intensity, 60 * (1 - age / dur)); return true;
    } });
  }
  aurora(dur = 6) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d')!.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    const cx = c.getContext('2d')!; cx.fillStyle = g; cx.fillRect(0, 0, 4, 128); const tex = new THREE.CanvasTexture(c);
    const planes = [0x46ffb4, 0x6fd8ff, 0x9a6bff].map((color, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.5, 24, 1), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.position.set(0, 3 + i * 0.3, 1 - i * 1.6); m.rotation.y = (i - 1) * 0.25; this.scene.add(m); return m;
    });
    let age = 0;
    this.push({ update: (dt) => {
      age += dt; const t = age / dur, env = Math.sin(Math.PI * Math.min(1, t));
      planes.forEach((m, i) => { m.material.opacity = 0.55 * env; m.rotation.y = (i - 1) * 0.25 + Math.sin(age * 0.5 + i) * 0.15; const p = m.geometry.attributes.position; for (let k = 0; k < p.count; k++) p.setY(k, k < 25 ? 2.25 + Math.sin(age * 1.4 + p.getX(k) * 0.7 + i) * 0.35 : -2.25); p.needsUpdate = true; });
      if (t >= 1) { planes.forEach((m) => { this.scene.remove(m); m.material.dispose(); }); return false; } return true;
    } });
  }

  /** Persistent remnants (emblem / cracked stone). Returned so the view can clear them on reset. */
  emblem(x, z, instant = false) {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xcdeeff, roughness: 0.1, clearcoat: 1, emissive: 0x39a6ff, emissiveIntensity: 0.7, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 8), mat); base.position.y = 0.03; g.add(base);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, i % 2 ? 0.22 : 0.34, 4), mat); const a = (i / 5) * Math.PI - Math.PI / 2 + Math.PI / 10; s.position.set(Math.cos(a + Math.PI / 2 - Math.PI / 2) * 0.0 + (i - 2) * 0.12, 0.2 + (i % 2 ? 0 : 0.06), 0); g.add(s); }
    g.position.set(x, 0, z); g.scale.setScalar(instant ? 1 : 0.01); this.scene.add(g);
    if (!instant) { let age = 0; this.push({ update: (dt) => { age += dt; g.scale.setScalar(Math.min(1, age / 1.2)); return age < 1.2; } }); }
    return g;
  }
  crackedStone(x, z, instant = false) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c1514, roughness: 0.7, emissive: 0xff4a10, emissiveIntensity: instant ? 0.25 : 2.5, flatShading: true });
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), mat); m.scale.set(1, 0.55, 1); m.position.set(x, 0.16, z); m.rotation.set(0.3, 0.5, 0.2); m.castShadow = true; this.scene.add(m);
    if (!instant) { let age = 0; this.push({ update: (dt) => { age += dt; mat.emissiveIntensity = 0.25 + 2.25 * Math.max(0, 1 - age / 5); return age < 5; } }); }
    return m;
  }

  update(dt) {
    this.t += dt;
    this.items = this.items.filter((it) => it.update(dt));
    for (const l of [this.iceFlash, this.fireFlash]) l.intensity *= Math.pow(0.004, dt);
    // ambient: snow over the white half, embers over the black half, mist & heat haze along the border midline
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 0.07;
      this.add.emit({ x: rnd(-5, 5), y: 5, z: rnd(0.2, 5), vy: -rnd(0.35, 0.7), vx: rnd(-0.1, 0.1), life: 9, s0: 0.05, s1: 0.05, c0: C.frost, c1: C.frost, a: 0.6 });
      this.add.emit({ x: rnd(-5, 5), y: 0.1, z: rnd(-5, -0.2), vy: rnd(0.25, 0.6), vx: rnd(-0.1, 0.15), life: 6, s0: 0.05, s1: 0.015, c0: C.ember, c1: C.dark, a: 0.8, g: -0.05 });
      const side = Math.random() < 0.5 ? -1 : 1, z = rnd(-1.4, 1.4);
      if (z > 0) this.nrm.emit({ x: side * 4.7, y: 0.1, z, vy: 0.15, vx: side * 0.1, vz: rnd(-0.1, 0.1), life: 4, s0: 0.7, s1: 1.7, c0: C.mist, c1: C.mist, a: 0.1 });
      else this.add.emit({ x: side * 4.7, y: 0.1, z, vy: 0.35, life: 3, s0: 0.5, s1: 1.2, c0: C.ember, c1: C.red, a: 0.05 });
    }
    this.add.update(dt); this.nrm.update(dt);
  }
}
