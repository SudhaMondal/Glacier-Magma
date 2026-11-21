import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeBoardTextures, makeBorderTextures } from './textures.js';

export const sqXZ = (s) => [(s & 7) - 3.5, 3.5 - (s >> 3)];
export const xzSq = (x, z) => {
  const f = Math.floor(x + 4), r = 7 - Math.floor(z + 4);
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
};

export class World {
  onResize: ((s: number) => void) | null = null;
  board: any;
  boardMat: any;
  camera: any;
  container: any;
  controls: any;
  fireLight: any;
  frameMat: any;
  iceLight: any;
  momentum: any;
  momentumTarget: any;
  pxScale: any;
  renderer: any;
  scene: any;
  shake: any;
  sun: any;
  constructor(container) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    container.appendChild(r.domElement);

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x05080d); s.fog = new THREE.FogExp2(0x05080d, 0.03);
    const pm = new THREE.PMREMGenerator(r);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 9.5, 10.5);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    Object.assign(c, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 7, maxDistance: 19, minPolarAngle: 0.25, maxPolarAngle: 1.42, rotateSpeed: 0.6 });

    // lights: ice on the white side (+z), magma on the black side (-z)
    s.add(new THREE.HemisphereLight(0x9fc8ff, 0x301008, 0.35));
    const sun = (this.sun = new THREE.DirectionalLight(0xdfeeff, 1.0));
    sun.position.set(4, 11, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 }); sun.shadow.bias = -0.0004;
    s.add(sun);
    this.iceLight = new THREE.PointLight(0x66ccff, 40, 18, 2); this.iceLight.position.set(0, 3.5, 5.5); s.add(this.iceLight);
    this.fireLight = new THREE.PointLight(0xff6a22, 40, 18, 2); this.fireLight.position.set(0, 3.5, -5.5); s.add(this.fireLight);
    this.momentum = 0; this.momentumTarget = 0;

    // board
    const bt = makeBoardTextures(), br = makeBorderTextures();
    this.boardMat = new THREE.MeshPhysicalMaterial({ map: bt.map, emissiveMap: bt.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), this.boardMat);
    this.board.rotation.x = -Math.PI / 2; this.board.position.y = 0.002; this.board.receiveShadow = true; s.add(this.board);
    this.frameMat = new THREE.MeshStandardMaterial({ map: br.map, emissiveMap: br.emissive, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.5, metalness: 0.15 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.5, 10.2), this.frameMat);
    frame.position.y = -0.25; frame.receiveShadow = true; s.add(frame);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; s.add(floor);

    this.shake = 0;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container); this.container = container; this.resize();
    this.setOrientation('w');
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h;
    this.camera.position.setLength(Math.max(this.camera.position.length(), w / h < 0.8 ? 15 : 0)); // pull back on portrait phones
    this.camera.updateProjectionMatrix();
    this.pxScale = (h * this.renderer.getPixelRatio()) / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.onResize?.(this.pxScale);
  }
  setOrientation(color) {
    const d = this.camera.position.length() || 14, ang = 0.72;
    this.camera.position.set(0, Math.sin(ang) * d, (color === 'w' ? 1 : -1) * Math.cos(ang) * d);
    this.controls.target.set(0, 0, 0); this.controls.update();
  }
  /** Who has momentum: +1 favours ice (white to move), -1 favours magma. check boosts the pressure on the side in check. */
  setMomentum(turn, check) { this.momentumTarget = (turn === 'w' ? 1 : -1) * (check ? 1 : 0.55); }
  update(dt, t) {
    this.controls.update();
    this.momentum += (this.momentumTarget - this.momentum) * Math.min(1, dt * 2);
    const m = this.momentum;
    this.iceLight.intensity = 40 * (0.75 + 0.5 * Math.max(-0.4, m));
    this.fireLight.intensity = 40 * (0.75 - 0.5 * Math.min(0.4, m)) * (0.95 + 0.05 * Math.sin(t * 7));
    this.frameMat.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 1.3);
    this.boardMat.emissiveIntensity = 0.8 + 0.2 * Math.sin(t * 1.7 + 1);
    if (this.shake > 0.0005) { this.scene.position.set((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake * 0.6, (Math.random() - 0.5) * this.shake); this.shake *= Math.pow(0.02, dt); }
    else this.scene.position.set(0, 0, 0);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
