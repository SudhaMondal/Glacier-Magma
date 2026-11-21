import * as THREE from 'three';
import { makeMarbleTextures } from './textures.js';

const V = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
const BASE = [[0, 0], [0.37, 0], [0.38, 0.05], [0.36, 0.1], [0.28, 0.15]];
const lathe = (pts, seg) => new THREE.LatheGeometry(V(pts), seg);

function knightHead() {
  const sh = new THREE.Shape();
  [[-0.24, 0.12], [-0.3, 0.6], [-0.24, 1.0], [-0.1, 1.24], [-0.02, 1.36], [0.06, 1.26], [0.34, 0.98], [0.46, 0.84], [0.43, 0.72], [0.27, 0.73], [0.14, 0.64], [0.22, 0.4], [0.3, 0.12]]
    .forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 2 });
  g.translate(-0.04, 0, -0.13);
  return g;
}

/** Returns [{geo, pos:[x,y,z], rot:[x,y,z]?, isHead?}] describing a piece; ice = faceted (low segment) lathes. */
function parts(type: string, ice: boolean) {
  const seg = ice ? 9 : 36, ss = ice ? 8 : 24, P: { geo: THREE.BufferGeometry; pos: number[]; rot?: number[]; head?: boolean }[] = [];
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, extra: { rot?: number[]; head?: boolean } = {}) => P.push({ geo, pos: [x, y, z], ...extra });
  const sph = (r, sy = 1) => { const g = new THREE.SphereGeometry(r, ss, ss); g.scale(1, sy, 1); return g; };
  switch (type) {
    case 'p':
      add(lathe([...BASE, [0.2, 0.22], [0.14, 0.4], [0.15, 0.52], [0.23, 0.56], [0.23, 0.62], [0.14, 0.66], [0, 0.66]], seg)); add(sph(0.2), 0, 0.82); break;
    case 'r': {
      add(lathe([...BASE, [0.21, 0.3], [0.2, 0.62], [0.27, 0.7], [0.31, 0.74], [0.31, 0.9], [0, 0.9]], seg));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.BoxGeometry(0.15, 0.17, 0.11), Math.cos(a) * 0.24, 0.98, Math.sin(a) * 0.24, { rot: [0, -a, 0] }); }
      break;
    }
    case 'n':
      add(lathe([...BASE, [0.26, 0.12], [0, 0.12]], seg)); add(knightHead(), 0, 0.02, 0, { head: true }); break;
    case 'b':
      add(lathe([...BASE, [0.19, 0.26], [0.12, 0.56], [0.2, 0.66], [0.22, 0.72], [0.12, 0.8], [0, 0.8]], seg)); add(sph(0.21, 1.4), 0, 1.02); add(sph(0.06), 0, 1.36); break;
    case 'q': {
      add(lathe([...BASE, [0.2, 0.3], [0.14, 0.7], [0.2, 0.95], [0.3, 1.12], [0.27, 1.2], [0, 1.2]], seg));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.ConeGeometry(0.06, 0.24, 5), Math.cos(a) * 0.22, 1.32, Math.sin(a) * 0.22, { rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] }); }
      add(sph(0.1), 0, 1.5); break;
    }
    case 'k':
      add(lathe([...BASE, [0.2, 0.3], [0.15, 0.8], [0.22, 1.05], [0.3, 1.2], [0.3, 1.3], [0, 1.3]], seg));
      add(new THREE.BoxGeometry(0.11, 0.44, 0.11), 0, 1.58); add(new THREE.BoxGeometry(0.32, 0.11, 0.11), 0, 1.64); break;
  }
  return P;
}

const geoCache = new Map();
function geometry(type, ice) {
  const k = type + ice;
  if (!geoCache.has(k)) geoCache.set(k, parts(type, ice));
  return geoCache.get(k);
}

let base: { ice: THREE.MeshPhysicalMaterial; magma: THREE.MeshStandardMaterial } | null = null;
function baseMaterials() {
  if (base) return base;
  const mt = makeMarbleTextures();
  base = {
    ice: new THREE.MeshPhysicalMaterial({ color: 0xa8dcff, roughness: 0.12, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, ior: 1.31, thickness: 0.7, flatShading: true, emissive: 0x1d6aa0, emissiveIntensity: 0.25, envMapIntensity: 1.4 }),
    magma: new THREE.MeshStandardMaterial({ color: 0x9a8f8a, map: mt.map, roughness: 0.32, metalness: 0.3, emissive: 0xff5a16, emissiveMap: mt.emissive, emissiveIntensity: 1, envMapIntensity: 0.9 }),
  };
  return base;
}

export const PIECE_HEIGHT = { p: 1.0, r: 1.1, n: 1.25, b: 1.4, q: 1.65, k: 1.85 };

/** A piece = group (placed by tweens) > inner (lift / glow) > meshes. */
export function createPiece(type, color, quality = 'high') {
  const ice = color === 'w', group = new THREE.Group(), inner = new THREE.Group();
  const mat: any = baseMaterials()[ice ? 'ice' : 'magma'].clone();
  if (ice && quality === 'high') { mat.transmission = 0.5; }
  group.add(inner);
  let head: THREE.Mesh | null = null;
  for (const p of geometry(type, ice)) {
    const m = new THREE.Mesh(p.geo, mat);
    m.position.set(p.pos[0]!, p.pos[1]!, p.pos[2]!); if (p.rot) m.rotation.set(p.rot[0]!, p.rot[1]!, p.rot[2]!);
    m.castShadow = true; m.receiveShadow = true;
    inner.add(m);
    if (p.head) head = m;
  }
  // knights face the enemy: white looks toward -z (black side), black toward +z
  const facing = ice ? Math.PI / 2 : -Math.PI / 2;
  if (type === 'n') inner.children.forEach((m) => { if (m === head) m.rotation.y = facing; });
  const obj: any = { group, inner, mat, type, color, el: ice ? 'ice' : 'magma', sq: -1, head, facing, lift: 0, glow: 0 };
  group.userData.piece = obj;
  group.traverse((o) => { o.userData.piece = obj; });
  obj.setGlow = (g) => { obj.glow = g; if (ice) mat.emissiveIntensity = 0.25 + g * 0.9; else mat.emissiveIntensity = 1 + g * 2.2; };
  obj.setQuality = (q) => { if (ice) { mat.transmission = q === 'high' ? 0.5 : 0; mat.needsUpdate = true; } };
  return obj;
}
