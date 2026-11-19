// Idle Hands - night-shift sysadmin, PSX style test v0.6
// Node-based first-person movement through an IT office and a school hallway at 3 a.m.
import * as THREE from 'three';

// ---------- renderer & low-res target ----------
const LOW_H = 240;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const rt = new THREE.WebGLRenderTarget(320, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
const snapRes = { value: new THREE.Vector2(160, 120) };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06050c);
scene.fog = new THREE.Fog(0x06050c, 5, 42);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 40);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- post (dither + quantize + vignette) ----------
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(320, 240) }, fade: { value: 1 }, time: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float fade; uniform float time; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer(vec2 p){
      int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); int i = x + y * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return m[i] / 16.0 - 0.5;
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(c.rgb * fade, 1.0);
      #include <colorspace_fragment>
      vec2 px = floor(vUv * res);
      vec3 col = gl_FragColor.rgb;
      col += (hash(px + floor(time * 24.0) * vec2(17.0, 31.0)) - 0.5) * 0.055;
      col = floor(col * 31.0 + 0.5 + bayer(px) * 1.2) / 31.0;
      vec2 d = vUv - 0.5; col *= 1.0 - dot(d, d) * 1.1;
      col *= 0.94 + 0.06 * mod(px.y, 2.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

function resize() {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  renderer.setSize(w, h);
  const lw = Math.round(LOW_H * aspect);
  rt.setSize(lw, LOW_H);
  postMat.uniforms.res.value.set(lw, LOW_H);
  snapRes.value.set(lw / 2, LOW_H / 2);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- materials & helpers ----------
function psx(mat) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uSnap = snapRes;
    s.vertexShader = 'uniform vec2 uSnap;\n' + s.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
       vec4 sp = gl_Position; sp.xy = floor(sp.xy / sp.w * uSnap + 0.5) / uSnap * sp.w; gl_Position = sp;`);
  };
  return mat;
}
const lam = (o) => psx(new THREE.MeshLambertMaterial(o));
const basic = (o) => psx(new THREE.MeshBasicMaterial(o));
const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.userData.ctx = g;
  return t;
}
function noise(g, w, h, n, colors, sz = 1) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(Math.random() * colors.length) | 0]; g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, sz, sz); }
}
function tiled(tex, rx, ry) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; }

function box(w, h, d, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt_, rb, h, seg, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt_, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function plane(w, h, mat, x, y, z, ry = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
// box with a specific material on one face: face index +x,-x,+y,-y,+z,-z
function faced(w, h, d, base, face, faceMat, x, y, z) {
  const mats = [base, base, base, base, base, base]; mats[face] = faceMat;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); m.position.set(x, y, z); scene.add(m); return m;
}
function lcdTex(txt, col, w = 48) {
  return canvasTex(w, 8, (g) => { g.fillStyle = '#05070c'; g.fillRect(0, 0, w, 8); g.fillStyle = col; g.font = 'bold 6px monospace'; g.fillText(txt, 2, 6); });
}

// ---------- textures ----------
const cinderTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#cbc2a4'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 3600, ['#bfb69a', '#d6ceb2', '#b4ab90', '#c6bda0']);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) {
    if (Math.random() < 0.18) { g.fillStyle = `rgba(90,70,40,${rnd(0.06, 0.16)})`; g.fillRect(c * 32 - (r % 2) * 16, r * 16, 32, 16); }
  }
  g.fillStyle = '#8e866c';
  for (let r = 0; r < 8; r++) {
    g.fillRect(0, r * 16, w, 1);
    const off = (r % 2) * 16;
    for (let x = off; x < w + 32; x += 32) g.fillRect(x % w, r * 16, 1, 16);
  }
  for (let i = 0; i < 14; i++) { g.fillStyle = Math.random() < 0.5 ? '#e2dac0' : '#9a9278'; g.fillRect((rnd(0, w)) | 0, (rnd(0, h)) | 0, (rnd(1, 4)) | 0, (rnd(1, 3)) | 0); }
  for (let i = 0; i < 3; i++) {
    const x = rnd(0, w), y = rnd(0, h * 0.5);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(100,70,30,${0.12 - k * 0.003})`; g.fillRect(x + rnd(-1, 1), y + k, 2, 1); }
  }
});
const carpetTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#3a3e52'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#323648', '#44485e', '#2c2f40', '#4a4560']);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
});
const vctTex = canvasTex(64, 64, (g, w, h) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#c8c2ae' : '#9a9e94'; g.fillRect(x * 16, y * 16, 16, 16);
  }
  noise(g, w, h, 500, ['#b0aa98', '#d8d2c0', '#8a8e84', '#a8a090']);
  if (Math.random() < 1) { g.fillStyle = 'rgba(160,130,60,0.35)'; g.fillRect(16, 32, 16, 16); }
  g.fillStyle = 'rgba(30,26,20,0.5)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  g.fillStyle = 'rgba(30,26,20,0.25)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i + 1, 0, 1, h); g.fillRect(0, i + 1, w, 1); }
  g.fillStyle = '#2a2620'; g.fillRect(47, 47, 4, 3); g.fillRect(48, 50, 2, 1);
});
const ceilTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#b8b4a8'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#a8a498', '#c4c0b4', '#9c988c']);
  g.fillStyle = '#6a685e'; g.fillRect(0, 0, w, 2); g.fillRect(0, 32, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(32, 0, 2, h);
  g.fillStyle = 'rgba(120,90,40,0.35)'; g.beginPath(); g.ellipse(46, 18, 7, 5, 0.3, 0, 7); g.fill(); // water stain
});
function lockerVariant(kind) {
  return canvasTex(32, 64, (g, w, h) => {
    g.fillStyle = '#3a6a78'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a4e5a'; g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    for (let y = 4; y < 14; y += 2) { g.fillStyle = '#16303a'; g.fillRect(8, y, 16, 1); }
    for (let y = 50; y < 60; y += 2) { g.fillStyle = '#16303a'; g.fillRect(8, y, 16, 1); }
    g.fillStyle = '#9aa8a8'; g.fillRect(24, 28, 3, 9);
    g.fillStyle = '#d8d0b8'; g.fillRect(8, 18, 10, 5); g.fillStyle = '#222'; g.font = '5px monospace'; g.fillText(String(100 + ((Math.random() * 300) | 0)), 8, 22);
    noise(g, w, h, 90, ['#4a7a88', '#2e5866', '#24464f']);
    g.fillStyle = 'rgba(20,10,5,0.35)'; g.fillRect(0, h - 6, w, 6);
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(200,220,220,0.35)'; g.fillRect((rnd(2, 28)) | 0, (rnd(10, 60)) | 0, (rnd(2, 7)) | 0, 1); }
    if (kind === 1) { for (let i = 0; i < 40; i++) { g.fillStyle = ['#8a4a20', '#6a3418', '#a85a28'][i % 3]; g.fillRect(24 + rnd(-4, 4), 36 + rnd(0, 26), 1, rnd(1, 3)); } g.fillStyle = 'rgba(120,60,20,0.5)'; g.fillRect(0, 54, w, 10); }
    if (kind === 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(14, 38, 7, 5, 0.3, 0, 7); g.fill(); g.fillStyle = 'rgba(160,200,210,0.3)'; g.fillRect(10, 35, 6, 1); }
    if (kind === 3) { g.fillStyle = '#f0e040'; g.fillRect(6, 26, 7, 7); g.fillStyle = '#e04040'; g.fillRect(14, 40, 6, 6); g.fillStyle = '#f0f0f0'; g.fillRect(4, 44, 9, 6); g.fillStyle = '#222'; g.fillRect(6, 46, 5, 1); }
    if (kind === 4) { g.fillStyle = 'rgba(220,230,230,0.7)'; g.font = 'bold 6px monospace'; g.fillText('HELP', 6, 46); }
  });
}
const lockerTexes = [0, 0, 1, 2, 3, 0, 1, 4, 2].map(lockerVariant);
function doorTex(label, ajar) {
  return canvasTex(32, 64, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = Math.random() < 0.5 ? '#6a4a2c' : '#8a6040'; g.fillRect(0, (Math.random() * h) | 0, w, 1); }
    g.fillStyle = '#c8c8c0'; g.fillRect(5, 6, 8, 22); g.fillStyle = '#05060a'; g.fillRect(6, 7, 6, 20);
    if (ajar) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(9, 12, 1, 2); }
    g.fillStyle = '#c0a040'; g.fillRect(25, 34, 4, 2);
    g.fillStyle = '#8a8a86'; g.fillRect(0, 54, w, 10); noise(g, w, 10, 60, ['#5a5a56', '#2a2a28']);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(20,14,8,0.6)'; g.fillRect(rnd(0, 28) | 0, rnd(50, 62) | 0, rnd(2, 6) | 0, 1); }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(210,190,160,0.45)'; g.fillRect(rnd(2, 28) | 0, rnd(30, 52) | 0, rnd(1, 5) | 0, 1); }
    g.fillStyle = 'rgba(30,20,10,0.35)'; g.fillRect(22, 30, 9, 10);
    g.fillStyle = '#e8e4d8'; g.fillRect(16, 8, 12, 6); g.fillStyle = '#222'; g.font = 'bold 5px Arial'; g.fillText(label, 17, 13);
  });
}
const corkTex = canvasTex(64, 40, (g, w, h) => {
  g.fillStyle = '#a07848'; g.fillRect(0, 0, w, h); noise(g, w, h, 400, ['#8a6438', '#b08858', '#94704a']);
  const flyers = [['#f0e060', 'BOOK FAIR'], ['#f0f0e8', 'LOST CAT'], ['#e86a6a', 'NO STUDENTS'], ['#9ad0f0', 'PICTURE DAY'], ['#f0f0e8', "DON'T STAY"]];
  flyers.forEach(([c, t], i) => {
    const x = 3 + (i % 3) * 20, y = 3 + Math.floor(i / 3) * 19;
    g.fillStyle = c; g.fillRect(x, y, 17, 15); g.fillStyle = '#222'; g.font = '4px Arial'; g.fillText(t.slice(0, 8), x + 1, y + 5);
    g.fillStyle = '#c03030'; g.fillRect(x + 7, y, 2, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 3; k++) g.fillRect(x + 2, y + 8 + k * 2, 12, 1);
  });
  g.fillStyle = '#f0f0e8'; g.fillRect(44, 22, 16, 14); g.fillStyle = '#111'; g.fillRect(48, 25, 8, 6); g.font = '3px Arial'; g.fillText('HAVE YOU', 45, 34);
});
const whiteboardTex = canvasTex(64, 40, (g, w, h) => {
  g.fillStyle = '#e8eaea'; g.fillRect(0, 0, w, h); noise(g, w, h, 80, ['#d8dada', '#c8cccc']);
  g.fillStyle = '#2a4aa8'; g.font = '5px Arial'; g.fillText('MAINT WINDOW 11P-6A', 2, 7);
  g.fillStyle = '#c03030'; g.fillText('VLAN 113 ???', 2, 15); g.fillText('who keeps logging', 2, 22); g.fillText('into LAB 3', 2, 28);
  g.fillStyle = '#222'; for (let i = 0; i < 7; i++) g.fillRect(44 + i * 2, 30, 1, 6); g.fillRect(43, 33, 15, 1);
  g.strokeStyle = '#2a4aa8'; g.lineWidth = 1; g.strokeRect(44, 4, 8, 6); g.strokeRect(54, 14, 8, 6); g.beginPath(); g.moveTo(48, 10); g.lineTo(58, 14); g.stroke();
});
const posterTex = canvasTex(32, 44, (g, w, h) => {
  g.fillStyle = '#1a2a6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0d040'; g.font = 'bold 5px Arial';
  g.fillText('HAVE YOU', 4, 8); g.fillText('TRIED', 8, 14); g.fillText('TURNING IT', 2, 34); g.fillText('OFF AND ON?', 1, 40);
  g.strokeStyle = '#f0d040'; g.beginPath(); g.arc(16, 23, 6, 0.7, Math.PI * 2 - 0.7 + Math.PI / 2); g.stroke(); g.fillStyle = '#f0d040'; g.fillRect(15, 16, 2, 6);
});
const boxTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#a8864e'; g.fillRect(0, 0, w, h); noise(g, w, h, 120, ['#98764a', '#b8965e']);
  g.fillStyle = '#c8b890'; g.fillRect(0, 14, w, 3);
  g.fillStyle = '#2a2a2a'; g.font = 'bold 6px Arial'; g.fillText('eMac', 4, 9); g.fillStyle = '#b02020'; g.font = 'bold 4px Arial'; g.fillText('SURPLUS', 3, 25); g.fillText('DO NOT USE', 2, 30);
});
const exitTex = canvasTex(32, 12, (g) => { g.fillStyle = '#200404'; g.fillRect(0, 0, 32, 12); g.fillStyle = '#ff2a1a'; g.font = 'bold 9px Arial'; g.fillText('EXIT', 5, 10); });
const outsideTex = canvasTex(64, 48, (g, w, h) => {
  g.fillStyle = '#0a0a1c'; g.fillRect(0, 0, w, h); noise(g, w, 22, 18, ['#c8c8e8', '#8a8ab0']);
  g.fillStyle = '#1a1420'; g.fillRect(0, 28, w, 20);
  const r = g.createRadialGradient(44, 22, 1, 44, 22, 22); r.addColorStop(0, 'rgba(255,170,70,0.9)'); r.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0a0a0a'; g.fillRect(43, 20, 1, 20); g.fillStyle = '#ffd890'; g.fillRect(41, 19, 5, 2);
  g.fillStyle = '#2a2830'; g.fillRect(10, 32, 22, 7); g.fillRect(14, 28, 9, 5); g.fillStyle = '#5a5870'; g.fillRect(15, 29, 7, 3); // truck
  g.fillStyle = '#0a0a0a'; g.fillRect(12, 38, 4, 3); g.fillRect(26, 38, 4, 3);
  g.fillStyle = '#ff3020'; g.fillRect(31, 34, 1, 2);
  g.fillStyle = '#d8b040'; for (let x = 0; x < w; x += 8) g.fillRect(x, 44, 4, 1);
});
const blindsTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#1a1018'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? 'rgba(255,150,60,0.75)' : 'rgba(255,170,80,0.55)'; g.fillRect(0, y, w, 1); g.fillStyle = '#b8b0a0'; g.fillRect(0, y + 1, w, 1); }
});

// ---------- architecture ----------
// IT office: x[-2.5,2.5] z[-2,2]; hallway: x[2.5,4.5] z[-12.5,2]; ceiling 2.7
const H = 2.7;
const cinder = (len, h) => lam({ map: tiled(cinderTex, len / 1.6, h / 1.6) });
const statics = [];
function wallX(x, z1, z2, y1 = 0, y2 = H) { const m = box(0.12, y2 - y1, z2 - z1, cinder(z2 - z1, y2 - y1), x, (y1 + y2) / 2, (z1 + z2) / 2); statics.push(m); return m; }
function wallZ(z, x1, x2, y1 = 0, y2 = H) { const m = box(x2 - x1, y2 - y1, 0.12, cinder(x2 - x1, y2 - y1), (x1 + x2) / 2, (y1 + y2) / 2, z); statics.push(m); return m; }

wallZ(-2, -2.5, 2.5); wallZ(2, -2.5, 2.5); wallX(-2.5, -2, 2);
wallX(2.5, -12.5, -0.5); wallX(2.5, 0.5, 2); wallX(2.5, -0.5, 0.5, 2.1, H); // shared wall w/ office door gap
wallX(4.5, -12.5, 2); wallZ(2, 2.5, 4.5);
const endWall = [];
for (const [x1, x2, y1, y2] of [[2.5, 2.8, 0, H], [4.2, 4.5, 0, H], [2.8, 4.2, 0, 0.95], [2.8, 4.2, 2.05, H]]) {
  const m = box(x2 - x1, y2 - y1, 0.12, cinder(x2 - x1, y2 - y1), (x1 + x2) / 2, (y1 + y2) / 2, -12.5); m.userData.castOutside = true; endWall.push(m);
}

const officeFloor = plane(5, 4, lam({ map: tiled(carpetTex, 10, 8) }), 0, 0, 0); officeFloor.rotation.x = -Math.PI / 2;
const hallFloor = plane(2, 14.5, lam({ map: tiled(vctTex, 2 / 1.0, 14.5 / 1.0) }), 3.5, 0, -5.25); hallFloor.rotation.x = -Math.PI / 2;
const c1 = plane(5, 4, lam({ map: tiled(ceilTex, 4, 3.2) }), 0, H, 0); c1.rotation.x = Math.PI / 2;
const c2 = plane(2, 14.5, lam({ map: tiled(ceilTex, 1.6, 11.6) }), 3.5, H, -5.25); c2.rotation.x = Math.PI / 2;
statics.push(officeFloor, hallFloor, c1, c2);

// painted stripe + baseboards in the hall
const stripe = lam({ color: 0x2f6a6a });
box(0.02, 0.14, 13.0, stripe, 2.57, 1.05, -6.0); box(0.02, 0.14, 14.5, stripe, 4.43, 1.05, -5.25);
const base = lam({ color: 0x2a2a2e });
box(0.02, 0.1, 13.0, base, 2.57, 0.05, -6.0); box(0.02, 0.1, 14.5, base, 4.43, 0.05, -5.25);
// door doorFrame into office
const doorFrame = lam({ color: 0x5a5a5e });
box(0.16, 2.1, 0.06, doorFrame, 2.5, 1.05, -0.53); box(0.16, 2.1, 0.06, doorFrame, 2.5, 1.05, 0.53); box(0.16, 0.06, 1.12, doorFrame, 2.5, 2.1, 0);

// ---------- IT office props ----------
// desk along north wall
const deskTop = lam({ color: 0x6a5a48 }), deskSide = lam({ color: 0x4a3e32 });
box(2.0, 0.05, 0.8, deskTop, 0, 0.74, -1.55);
box(0.05, 0.72, 0.76, deskSide, -0.97, 0.36, -1.55); box(0.05, 0.72, 0.76, deskSide, 0.97, 0.36, -1.55);
box(1.9, 0.5, 0.03, deskSide, 0, 0.45, -1.92);
const DT = 0.765;

// laptop (beige, open) with a ticket queue
const beige = lam({ color: 0xbfb6a0 }), beigeD = lam({ color: 0x9a927e });
const kbTex = canvasTex(32, 24, (g, w, h) => {
  g.fillStyle = '#9a927e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a2a2e'; for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) g.fillRect(2 + c * 2.4, 2 + r * 2.6, 2, 2);
  g.fillStyle = '#2a2a2e'; g.fillRect(9, 13, 14, 2); g.fillStyle = '#5a5650'; g.fillRect(12, 17, 8, 5);
});
faced(0.38, 0.025, 0.27, beige, 2, lam({ map: kbTex }), 0, DT + 0.0125, -1.42);
const screenTex = canvasTex(80, 60, () => {});
const sg = screenTex.userData.ctx;
const tickets = [
  ['#4468', 'LAB 3 IMAGING', 'closed'], ['#4469', 'PRINTER RM 104', 'closed'], ['#4470', 'WIFI B-WING', 'open'],
  ['#4471', 'RM 113 PROJECTOR', 'new'], ['#4472', 'RM 113 PROJECTOR', 'new'], ['#4473', 'RM 113 PROJECTOR', 'new'],
];
function drawLaptop(t) {
  sg.fillStyle = '#2a8a8a'; sg.fillRect(0, 0, 80, 60);
  sg.fillStyle = '#d8d4c8'; sg.fillRect(4, 4, 72, 48);
  sg.fillStyle = '#1a3aa8'; sg.fillRect(4, 4, 72, 6); sg.fillStyle = '#fff'; sg.font = 'bold 5px Arial'; sg.fillText('HelpDesk 2000 - Queue', 6, 9);
  sg.fillStyle = '#c8c8c8'; sg.fillRect(70, 5, 4, 4);
  tickets.forEach(([id, title, st], i) => {
    const y = 13 + i * 6;
    if (st === 'new') { sg.fillStyle = (Math.floor(t * 2) % 2 && i === 5) ? '#ffd0d0' : '#f8e8e8'; sg.fillRect(5, y - 1, 70, 6); }
    sg.fillStyle = st === 'new' ? '#a81818' : '#333'; sg.font = '4px monospace';
    sg.fillText(`${id} ${title}`, 6, y + 3); sg.fillText(st === 'new' ? '3:0' + (i - 1) + 'a' : st, 62, y + 3);
  });
  sg.fillStyle = '#555'; sg.font = '3px monospace'; sg.fillText('submitted by: ________', 6, 50);
  sg.fillStyle = '#1a3aa8'; sg.fillRect(0, 54, 80, 6); sg.fillStyle = '#3a9a3a'; sg.fillRect(0, 54, 14, 6);
  sg.fillStyle = '#fff'; sg.font = 'bold 4px Arial'; sg.fillText('start', 2, 58); sg.fillText('2:5' + (Math.floor(t / 10) % 10) + ' AM', 64, 58);
  for (let y = 0; y < 60; y += 2) { sg.fillStyle = 'rgba(0,0,0,0.12)'; sg.fillRect(0, y, 80, 1); }
  screenTex.needsUpdate = true;
}
drawLaptop(0);
const lid = new THREE.Group(); lid.position.set(0, DT + 0.025, -1.555); lid.rotation.x = -0.28; scene.add(lid);
box(0.38, 0.27, 0.015, beige, 0, 0.135, 0, lid);
const lscreen = plane(0.33, 0.23, basic({ map: screenTex }), 0, 0.14, 0.009, 0, lid);

// CRT monitor with a ping that never answers
const termTex = canvasTex(64, 48, () => {});
const tg = termTex.userData.ctx;
function drawTerm(t) {
  tg.fillStyle = '#020a04'; tg.fillRect(0, 0, 64, 48); tg.fillStyle = '#4aff7a'; tg.font = '4px monospace';
  const lines = ['$ ping 10.1.13.1', 'Request timed out.', 'Request timed out.', 'Request timed out.', 'Reply from 10.1.13.1:', '  bytes=32 time=0ms', 'Request timed out.'];
  const n = Math.min(lines.length, 2 + (Math.floor(t * 0.8) % (lines.length - 1)));
  for (let i = 0; i < n; i++) tg.fillText(lines[i], 2, 6 + i * 5.5);
  if (Math.floor(t * 2) % 2) tg.fillRect(2, 6 + n * 5.5 - 3, 3, 4);
  for (let y = 0; y < 48; y += 2) { tg.fillStyle = 'rgba(0,0,0,0.3)'; tg.fillRect(0, y, 64, 1); }
  termTex.needsUpdate = true;
}
drawTerm(0);
const crt = new THREE.Group(); crt.position.set(0.68, DT, -1.62); crt.rotation.y = -0.35; scene.add(crt);
box(0.42, 0.36, 0.38, beige, 0, 0.2, 0, crt); box(0.3, 0.26, 0.2, beigeD, 0, 0.2, -0.28, crt); box(0.22, 0.03, 0.2, beigeD, 0, 0.015, 0, crt);
plane(0.33, 0.26, basic({ map: termTex }), 0, 0.21, 0.192, 0, crt);

// energy drink, CD spindle, desk phone, mug, papers
const voltTex = canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = '#2a3f8f'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0c0d0'; g.fillRect(0, 0, w / 2, h);
  g.fillStyle = '#c8202a'; g.font = 'bold 10px Arial'; g.fillText('RED', 3, 13); g.fillText('VOLT', 33, 13); g.fillRect(0, 22, w, 4);
});
const can = (x, z, tipped) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), [lam({ map: voltTex }), lam({ color: 0xc8c8d0 }), lam({ color: 0x9a9aa2 })]);
  if (tipped) { m.rotation.z = Math.PI / 2; m.rotation.y = rnd(0, 6); m.position.set(x, DT + 0.033, z); } else m.position.set(x, DT + 0.06, z);
  scene.add(m); return m;
};
can(0.32, -1.33); can(-0.42, -1.75); can(-0.7, -1.45, true);
cyl(0.065, 0.065, 0.1, 10, lam({ color: 0x9aa8c8, transparent: true, opacity: 0.6 }), -0.62, DT + 0.05, -1.72);
cyl(0.06, 0.06, 0.06, 10, lam({ color: 0xd8dce8 }), -0.62, DT + 0.03, -1.72);
const phone = new THREE.Group(); phone.position.set(-0.35, DT, -1.5); phone.rotation.y = 0.3; scene.add(phone);
box(0.2, 0.06, 0.18, lam({ color: 0x2a2a2e }), 0, 0.03, 0, phone);
box(0.2, 0.04, 0.05, lam({ color: 0x1e1e22 }), 0, 0.08, -0.05, phone);
const phoneLed = box(0.015, 0.008, 0.015, basic({ color: 0xff2020 }), 0.08, 0.064, 0.06, phone);
for (let i = 0; i < 4; i++) { const p = box(0.2, 0.002, 0.27, lam({ color: 0xe8e4d8 }), rnd(0.25, 0.5), DT + 0.002 + i * 0.002, rnd(-1.85, -1.6)); p.rotation.y = rnd(-0.4, 0.4); }

// wire shelving full of network gear (the "stereo stack")
const chrome = lam({ color: 0x8a8e96 });
const SX = -1.75, SZ = -1.72;
for (const [dx, dz] of [[-0.48, -0.2], [0.48, -0.2], [-0.48, 0.2], [0.48, 0.2]]) cyl(0.012, 0.012, 2.0, 4, chrome, SX + dx, 1.0, SZ + dz);
const ledBoxes = [];
const gear = [
  ['SW-CORE-01', '#6ab0ff'], ['UPS 72%  ', '#ffa040'], ['KVM  CH 3', '#6ab0ff'], ['SW-B-WING', '#6ab0ff'], ['NAS  ERR', '#ff4040'], ['DHCP  OK', '#9aff9a'],
];
for (let s = 0; s < 4; s++) {
  const y = 0.25 + s * 0.5;
  box(1.0, 0.015, 0.44, chrome, SX, y, SZ);
  const nUnits = s === 3 ? 1 : 2;
  for (let u = 0; u < nUnits; u++) {
    const [txt, col] = gear[(s * 2 + u) % gear.length];
    const uy = y + 0.07 + u * 0.13;
    faced(0.86, 0.11, 0.36, lam({ color: 0x1c1c22 }), 4, lam({ color: 0x24242c }), SX, uy, SZ);
    plane(0.26, 0.05, basic({ map: lcdTex(txt, col) }), SX - 0.24, uy + 0.01, SZ + 0.182);
    for (let k = 0; k < 8; k++) {
      const led = box(0.014, 0.01, 0.005, basic({ color: Math.random() < 0.8 ? 0x30ff60 : 0xffa020 }), SX + 0.02 + k * 0.035, uy - 0.025, SZ + 0.183);
      led.userData.rate = rnd(2, 12); led.userData.phase = rnd(0, 6); ledBoxes.push(led);
    }
  }
}
box(0.34, 0.26, 0.3, lam({ map: boxTex }), SX - 0.2, 1.88, SZ); // box on top shelf

// server rack (south-west corner)
const RKX = -1.95, RKZ = 1.45;
faced(0.62, 2.0, 0.8, lam({ color: 0x141418 }), 5, lam({ color: 0x1a1a20 }), RKX, 1.0, RKZ);
for (let u = 0; u < 9; u++) {
  const y = 0.25 + u * 0.18;
  box(0.54, 0.13, 0.02, lam({ color: u % 3 === 0 ? 0x2a2a30 : 0x222228 }), RKX, y, RKZ - 0.405);
  for (let k = 0; k < 6; k++) {
    const led = box(0.012, 0.012, 0.005, basic({ color: [0x3a7aff, 0x30ff60, 0xffa020][(k + u) % 3] }), RKX - 0.2 + k * 0.025, y + 0.03, RKZ - 0.417);
    led.userData.rate = rnd(1, 9); led.userData.phase = rnd(0, 6); ledBoxes.push(led);
  }
}
// cables spilling from the rack
function cable(points, color = 0x18181c, r = 0.008) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 4), lam({ color })));
}
cable([[-1.85, 0.6, 1.04], [-1.6, 0.05, 0.9], [-1.0, 0.01, 0.2], [-0.4, 0.01, -1.0], [-0.1, 0.4, -1.85], [0.0, DT, -1.7]], 0x2a4aa8);
cable([[-2.05, 1.2, 1.04], [-1.9, 0.02, 0.6], [-1.75, 0.05, -1.3]], 0xd8c040);
cable([[-1.9, 0.9, 1.04], [-1.4, 0.02, 0.4], [-1.65, 0.3, -1.52]], 0xc03030);

// office chair (rolled back a bit)
const chairM = lam({ color: 0x1e1e26 });
const chair = new THREE.Group(); chair.position.set(0.15, 0, -0.55); chair.rotation.y = 0.25; scene.add(chair);
box(0.5, 0.08, 0.48, chairM, 0, 0.48, 0, chair); box(0.48, 0.6, 0.07, chairM, 0, 0.85, 0.24, chair);
cyl(0.03, 0.03, 0.4, 6, chrome, 0, 0.25, 0, chair);
for (let i = 0; i < 5; i++) { const leg = box(0.3, 0.03, 0.04, chrome, 0, 0.05, 0, chair); leg.rotation.y = (i / 5) * Math.PI * 2; leg.position.set(Math.cos(i * 1.256) * 0.14, 0.05, -Math.sin(i * 1.256) * 0.14); }

// filing cabinet + coffee maker
faced(0.46, 1.3, 0.6, lam({ color: 0x6a6e74 }), 5, lam({ map: canvasTex(16, 32, (g) => { g.fillStyle = '#6a6e74'; g.fillRect(0, 0, 16, 32); g.fillStyle = '#4a4e54'; for (let i = 0; i < 4; i++) { g.fillRect(0, i * 8, 16, 1); g.fillStyle = '#b0b0b8'; g.fillRect(5, i * 8 + 3, 6, 1); g.fillStyle = '#4a4e54'; } }) }), 1.75, 0.65, -1.62).rotation.y = Math.PI;
box(0.2, 0.3, 0.22, lam({ color: 0x1a1a1a }), 1.7, 1.45, -1.62);
cyl(0.07, 0.07, 0.1, 8, lam({ color: 0x3a2a1e, transparent: true, opacity: 0.85 }), 1.7, 1.36, -1.52);
box(0.02, 0.01, 0.01, basic({ color: 0xff3020 }), 1.65, 1.5, -1.505);

// surplus eMac boxes, whiteboard, poster, corkboard
const cb = lam({ map: boxTex });
box(0.5, 0.42, 0.5, cb, 1.6, 0.21, 1.55).rotation.y = 0.1; box(0.5, 0.42, 0.5, cb, 1.6, 0.63, 1.55).rotation.y = -0.08; box(0.5, 0.42, 0.5, cb, 1.0, 0.21, 1.6).rotation.y = 0.3;
box(1.4, 0.9, 0.03, lam({ color: 0xa8a8a8 }), -0.2, 1.5, 1.93);
plane(1.32, 0.82, lam({ map: whiteboardTex }), -0.2, 1.5, 1.912, Math.PI);
plane(0.42, 0.58, lam({ map: posterTex }), 1.2, 1.55, -1.935);
plane(0.8, 0.5, lam({ map: corkTex }), -1.2, 1.55, -1.935);

// window on the west wall with sodium light through the blinds
plane(1.0, 0.9, basic({ map: blindsTex, color: 0x9a8070 }), -2.43, 1.55, 0.15, Math.PI / 2);
box(0.06, 0.06, 1.1, doorFrame, -2.42, 1.07, 0.15); box(0.06, 0.06, 1.1, doorFrame, -2.42, 2.03, 0.15);

// trash can + crumpled paper
cyl(0.15, 0.12, 0.36, 8, lam({ color: 0x3a3e46 }), 1.05, 0.18, -1.35);
for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), lam({ color: 0xe8e4dc })); b.position.set(1.05 + rnd(-0.35, 0.3), 0.03, -1.2 + rnd(-0.3, 0.4)); scene.add(b); }

// office ceiling light: one dead fluorescent panel
box(0.6, 0.03, 1.2, lam({ color: 0x8a8a86 }), 0, H - 0.02, 0.2);

// ---------- hallway props ----------
const lockerSide = lam({ color: 0x2e5866 });
let lockerN = 0;
for (const [z0, n] of [[-0.9, 9], [-6.9, 9]]) for (let i = 0; i < n; i++) {
  const z = z0 - i * 0.39, k = lockerN++;
  if (k === 5) {
    faced(0.4, 1.85, 0.38, lockerSide, 1, lam({ color: 0x0a0c10 }), 4.25, 0.925, z);
    const hinge = new THREE.Group(); hinge.position.set(4.05, 0.925, z - 0.19); hinge.rotation.y = -1.9; scene.add(hinge);
    faced(0.02, 1.8, 0.37, lockerSide, 0, lam({ map: lockerTexes[2] }), 0, 0, 0.185).parent = hinge;
    box(0.3, 0.02, 0.3, lam({ color: 0x5a6a70 }), 4.27, 1.45, z);
    box(0.18, 0.22, 0.08, lam({ color: 0x8a2a2a }), 4.3, 0.12, z).rotation.y = 0.4;
    const pg = plane(0.16, 0.2, lam({ color: 0xe8e4d8 }), 4.38, 1.2, z); pg.rotation.y = -Math.PI / 2;
    continue;
  }
  faced(0.4, 1.85, 0.38, lockerSide, 1, lam({ map: lockerTexes[k % lockerTexes.length] }), 4.25, 0.925, z);
}
// lockers re-randomize texture numbers per clone not possible; fine at this res
// classroom doors
function door(label, x, z, facing, ajar) {
  const g = new THREE.Group(); g.position.set(x, 1.05, z); g.rotation.y = facing; scene.add(g);
  box(1.0, 2.15, 0.08, doorFrame, 0, 0, -0.02, g);
  plane(0.88, 2.05, basic({ color: 0x000000 }), 0, -0.04, 0.025, 0, g);
  const leaf = new THREE.Group(); leaf.position.set(-0.44, 0, 0.03); g.add(leaf);
  plane(0.88, 2.05, lam({ map: doorTex(label, ajar), side: THREE.DoubleSide }), 0.44, -0.04, 0, 0, leaf);
  if (ajar) leaf.rotation.y = -0.35;
  return g;
}
door('112', 2.56, -5.0, Math.PI / 2);
door('RR', 2.56, -9.2, Math.PI / 2);
door('113', 4.44, -11.6, -Math.PI / 2, true);
door('', 3.5, 1.94, Math.PI); // exit double door end
plane(0.4, 0.15, basic({ map: exitTex }), 3.5, 2.35, 1.93, Math.PI);
const exitGlow = new THREE.PointLight(0xff2a1a, 0.6, 2.2, 1); exitGlow.position.set(3.5, 2.2, 1.6); scene.add(exitGlow);
// bulletin board, water fountain, wet floor sign, mop bucket
plane(1.3, 0.8, lam({ map: corkTex }), 2.565, 1.55, -7.0, Math.PI / 2);
box(0.08, 1.0, 1.4, doorFrame, 2.53, 1.55, -7.0).scale.set(0.5, 0.88, 1.0);
const fountain = new THREE.Group(); fountain.position.set(2.75, 0.85, -2.6); scene.add(fountain);
box(0.36, 0.12, 0.42, lam({ color: 0xb8bcc0 }), 0, 0, 0, fountain); box(0.3, 0.5, 0.06, lam({ color: 0x9a9ea2 }), -0.12, -0.3, 0, fountain).rotation.y = Math.PI / 2;
const yel = lam({ color: 0xe8c020, side: THREE.DoubleSide });
const wet = new THREE.Group(); wet.position.set(3.2, 0, -7.6); wet.rotation.y = 0.5; scene.add(wet);
const a1 = plane(0.3, 0.62, yel, 0, 0.3, 0.08, 0, wet); a1.rotation.x = -0.25; const a2 = plane(0.3, 0.62, yel, 0, 0.3, -0.08, 0, wet); a2.rotation.x = 0.25;
cyl(0.18, 0.15, 0.3, 8, lam({ color: 0xd8c020 }), 3.0, 0.15, -8.3); cyl(0.012, 0.012, 1.2, 4, lam({ color: 0x8a6a40 }), 3.05, 0.65, -8.25).rotation.z = 0.2;
// puddle by the bucket
const puddle = plane(0.7, 0.5, basic({ color: 0x0a0a14, transparent: true, opacity: 0.5, depthWrite: false }), 3.25, 0.004, -8.0); puddle.rotation.x = -Math.PI / 2;

// school wall clock, stopped at 3:00
const wallClockTex = canvasTex(32, 32, (g) => {
  g.fillStyle = '#f0ece0'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill();
  g.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(16 + Math.sin(a) * 12 - 1, 16 - Math.cos(a) * 12 - 1, 2, 2); }
  g.fillRect(15, 6, 2, 11); g.fillRect(16, 15, 8, 2);
  g.fillStyle = '#c02020'; g.fillRect(16, 16, 1, 1);
});
const wc = cyl(0.2, 0.2, 0.06, 12, lam({ color: 0x1a1a1a }), 4.42, 1.75, 0.0); wc.rotation.z = Math.PI / 2;
const wcFace = plane(0.36, 0.36, lam({ map: wallClockTex, transparent: true, alphaTest: 0.5 }), 4.385, 1.75, 0.0, -Math.PI / 2);

// end-of-hall window to the parking lot
plane(1.4, 1.1, basic({ color: 0x8aa0c8, transparent: true, opacity: 0.025, depthWrite: false }), 3.5, 1.5, -12.5);
box(1.4, 0.04, 0.2, doorFrame, 3.5, 0.95, -12.48); // sill
box(1.5, 0.06, 0.08, doorFrame, 3.5, 0.95, -12.42); box(1.5, 0.06, 0.08, doorFrame, 3.5, 2.05, -12.42); box(0.05, 1.1, 0.08, doorFrame, 3.5, 1.5, -12.42);

// fluorescent fixtures in the hall
const tubeOn = basic({ color: 0xe8f4ff }), tubeOff = lam({ color: 0x6a6a68 });
const fixtures = [];
for (const z of [-0.9, -4.9, -8.9]) {
  const m = box(0.55, 0.03, 1.15, tubeOn.clone(), 3.5, H - 0.02, z);
  fixtures.push(m);
}
fixtures[2].material = tubeOff;

// the figure at the end of the hall
const figure = new THREE.Group(); figure.position.set(3.55, 0, -11.75); scene.add(figure);
const dark = basic({ color: 0x030304 });
box(0.4, 0.95, 0.22, dark, 0, 1.15, 0, figure);
box(0.14, 0.75, 0.14, dark, -0.1, 0.38, 0, figure); box(0.14, 0.75, 0.14, dark, 0.1, 0.38, 0, figure);
box(0.1, 0.85, 0.1, dark, -0.26, 1.05, 0, figure).rotation.z = 0.05; box(0.1, 0.9, 0.1, dark, 0.26, 1.02, 0, figure).rotation.z = -0.04;
const fhead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), dark); fhead.position.set(0.02, 1.78, 0); fhead.rotation.z = 0.3; figure.add(fhead);
let figureGone = false;

// ---------- crust pass ----------
function decal(tex, w, h, x, y, z, ry = 0, rx = 0, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam({ map: tex, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.order = 'YXZ'; m.rotation.set(rx, ry, 0); m.position.set(x, y, z); scene.add(m); return m;
}
const E = Math.PI / 2;
const grimeTex = canvasTex(32, 32, (g, w, h) => {
  for (let y = 0; y < h; y++) { g.fillStyle = `rgba(30,22,12,${Math.pow(y / h, 2) * 0.85})`; g.fillRect(0, y, w, 1); }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(20,14,8,${rnd(0.1, 0.4)})`; g.fillRect(rnd(0, w) | 0, (h * 0.4 + rnd(0, h * 0.6)) | 0, 1, rnd(1, 3) | 0); }
});
const floorEdgeTex = canvasTex(32, 32, (g, w, h) => {
  for (let x = 0; x < w; x++) { g.fillStyle = `rgba(28,22,14,${Math.pow(1 - x / w, 2) * 0.8})`; g.fillRect(x, 0, 1, h); }
  noise(g, 10, h, 60, ['rgba(20,15,10,0.5)']);
});
const dripTex = canvasTex(16, 64, (g, w, h) => {
  for (let i = 0; i < 6; i++) { const x = rnd(2, 14) | 0, len = rnd(20, 62); for (let y = 0; y < len; y++) { g.fillStyle = `rgba(110,64,24,${0.55 * (1 - y / len)})`; g.fillRect(x, y, 1 + (y < 6 ? 1 : 0), 1); } }
  g.fillStyle = 'rgba(110,64,24,0.5)'; g.fillRect(0, 0, w, 3);
});
const stainTex = canvasTex(32, 32, (g) => {
  for (let r = 14; r > 2; r -= 2) { g.fillStyle = `rgba(${120 - r * 2},${88 - r * 2},40,${r === 14 ? 0.5 : 0.12})`; g.beginPath(); g.ellipse(16 + rnd(-1, 1), 16 + rnd(-1, 1), r, r * 0.8, rnd(0, 3), 0, 7); g.fill(); }
});
const coffeeTex = canvasTex(16, 16, (g) => { g.strokeStyle = 'rgba(70,40,15,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(8, 8, 5.5, 0, 6); g.stroke(); });
const scuffTex = canvasTex(32, 16, (g) => {
  for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(15,12,10,${rnd(0.3, 0.7)})`; g.lineWidth = 1; g.beginPath(); const y = rnd(3, 13); g.moveTo(rnd(0, 8), y); g.quadraticCurveTo(16, y + rnd(-6, 6), rnd(22, 32), y + rnd(-3, 3)); g.stroke(); }
});
const gumTex = canvasTex(8, 8, (g) => { g.fillStyle = 'rgba(40,36,34,0.85)'; g.beginPath(); g.ellipse(4, 4, 2.5, 2, 0, 0, 7); g.fill(); });
const crackTex = canvasTex(64, 64, (g) => {
  g.strokeStyle = 'rgba(230,235,255,0.75)'; g.lineWidth = 1;
  const arms = 6; for (let a = 0; a < arms; a++) { let x = 22, y = 30, ang = a / arms * 6.28; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { ang += rnd(-0.5, 0.5); x += Math.cos(ang) * rnd(3, 7); y += Math.sin(ang) * rnd(3, 7); g.lineTo(x, y); } g.stroke(); }
  g.beginPath(); g.arc(22, 30, 4, 0, 7); g.stroke();
});
const webTex = canvasTex(32, 32, (g) => {
  g.strokeStyle = 'rgba(220,220,230,0.55)'; g.lineWidth = 1;
  for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(0, 0); const an = a / 5 * Math.PI / 2; g.lineTo(Math.cos(an) * 32, Math.sin(an) * 32); g.stroke(); }
  for (let r = 6; r < 32; r += 5) { g.beginPath(); g.arc(0, 0, r + rnd(-1, 1), 0, Math.PI / 2); g.stroke(); }
});
const peelTex = canvasTex(32, 32, (g) => {
  g.fillStyle = 'rgba(150,140,110,0.9)'; g.beginPath();
  for (let a = 0; a < 7; a += 0.5) { const r = rnd(7, 14); g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.8); } g.fill();
  g.strokeStyle = 'rgba(240,235,215,0.8)'; g.stroke();
});
const bugsTex = canvasTex(32, 64, (g) => { for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(20,18,14,0.8)'; g.fillRect(rnd(2, 30) | 0, rnd(2, 62) | 0, 1 + (Math.random() < 0.3 ? 1 : 0), 1); } g.fillStyle = 'rgba(80,70,40,0.3)'; g.fillRect(0, 50, 32, 14); });
const tapeTex = canvasTex(16, 64, (g) => { g.fillStyle = 'rgba(150,150,150,0.9)'; g.fillRect(0, 0, 16, 64); noise(g, 16, 64, 60, ['#8a8a8a', '#aaaaaa']); g.fillStyle = 'rgba(40,36,30,0.5)'; g.fillRect(0, 0, 16, 2); g.fillRect(0, 62, 16, 2); });
const noteTex = (txt, col = '#f0e060') => canvasTex(16, 16, (g) => { g.fillStyle = col; g.fillRect(0, 0, 16, 16); g.fillStyle = '#2a2aa8'; g.font = '4px Arial'; txt.split('|').forEach((t, i) => g.fillText(t, 1, 5 + i * 4)); });

// grime along the bottoms of every wall
const gStrip = (len, x, z, ry) => decal(tiled(grimeTex, len / 1.2, 1), len, 0.45, x, 0.225, z, ry);
gStrip(14.5, 2.575, -5.25, E); gStrip(14.5, 4.425, -5.25, -E); gStrip(2, 3.5, -12.425, 0); gStrip(2, 3.5, 1.925, Math.PI);
gStrip(5, 0, -1.925, 0); gStrip(5, 0, 1.925, Math.PI); gStrip(4, -2.425, 0, E); gStrip(1.5, 2.425, -1.25, -E); gStrip(1.5, 2.425, 1.25, -E);
// dirt collecting along the floor edges in the hall
decal(tiled(floorEdgeTex, 1, 10), 0.4, 14.5, 2.76, 0.003, -5.25, 0, -E);
decal(tiled(floorEdgeTex, 1, 10), 0.4, 14.5, 4.24, 0.003, -5.25, Math.PI, -E);
// scuffs + gum on the hall floor
for (let i = 0; i < 14; i++) decal(scuffTex, rnd(0.3, 0.6), 0.2, rnd(2.8, 4.2), 0.004, rnd(-12, 1.5), rnd(0, 6), -E, rnd(0.5, 1));
for (let i = 0; i < 18; i++) { const s2 = rnd(0.03, 0.06); decal(gumTex, s2, s2, rnd(2.7, 4.3), 0.005, rnd(-12.2, 1.8), 0, -E); }
// water stains + drips
decal(dripTex, 0.35, 1.3, 4.43, 1.85, -3.2, -E); decal(dripTex, 0.3, 1.0, 4.43, 2.05, -9.6, -E);
decal(dripTex, 0.3, 1.2, 2.57, 1.95, -11.0, E); decal(dripTex, 0.4, 1.0, -1.0, 2.15, -1.925, 0);
decal(dripTex, 0.3, 0.9, -2.425, 2.2, -1.2, E);
for (const [x, z] of [[3.3, -2.8], [3.9, -7.2], [3.4, -10.9], [-1.4, 1.0], [0.9, -0.6]]) decal(stainTex, rnd(0.4, 0.7), rnd(0.4, 0.7), x, H - 0.004, z, rnd(0, 6), E);
// peeling paint on the hall walls
for (const [z, y] of [[-1.8, 1.4], [-3.6, 0.6], [-6.2, 1.9], [-10.4, 1.2], [-12.0, 0.7]]) decal(peelTex, rnd(0.2, 0.35), rnd(0.2, 0.3), 2.575, y, z, E);
// cracked window
plane(0.42, 0.42, basic({ map: crackTex, transparent: true, opacity: 0.5, depthWrite: false }), 3.22, 1.62, -12.49);
// cobwebs in the corners
for (const [x, z, ry] of [[2.62, -12.38, Math.PI / 4], [4.38, -12.38, -Math.PI / 4], [-2.38, -1.88, Math.PI / 4], [-2.38, 1.88, Math.PI * 3 / 4], [4.38, 1.88, -Math.PI * 3 / 4]]) {
  const w = decal(webTex, 0.6, 0.6, x, H - 0.3, z, ry, 0, 0.9); w.material.side = THREE.DoubleSide; w.scale.x = (ry > 0 ? 1 : -1);
}
// dead bugs inside the light covers
for (const z of [-0.9, -4.9, -8.9]) decal(bugsTex, 0.5, 1.1, 3.5, H - 0.04, z, 0, E, 0.9);

// rusty pipe along the hall ceiling, with brackets and a drip below
const rust = lam({ color: 0x6a4a34 });
const pipe = cyl(0.05, 0.05, 14.5, 6, rust, 4.28, 2.5, -5.25); pipe.rotation.x = E;
for (let z = 1.5; z > -12.5; z -= 2.2) box(0.14, 0.2, 0.04, lam({ color: 0x3a3a3a }), 4.36, 2.6, z);
for (const z of [-3.2, -9.6]) { const b = box(0.03, 0.03, 0.03, rust, 4.28, 2.44, z); b.userData.drip = true; }
const dripDrop = box(0.012, 0.025, 0.012, lam({ color: 0x9ab0c8, emissive: 0x101820 }), 4.28, 2.4, -3.2);
const dripPuddle = decal(stainTex, 0.35, 0.3, 4.15, 0.005, -3.2, 0, -E, 0.8);

// rusty vent grate low on the west wall
const ventTex = canvasTex(32, 16, (g) => { g.fillStyle = '#5a5248'; g.fillRect(0, 0, 32, 16); for (let x = 2; x < 32; x += 3) { g.fillStyle = '#16120e'; g.fillRect(x, 2, 1, 12); } g.fillStyle = 'rgba(120,60,20,0.6)'; g.fillRect(0, 10, 32, 6); });
decal(ventTex, 0.5, 0.25, 2.578, 0.32, -6.0, E); decal(dripTex, 0.4, 0.5, 2.576, 0.05, -6.0, E, 0, 0.6);

// missing + sagging ceiling tiles, with wires hanging out
const hole = (x, z, w, d) => { const m = plane(w, d, basic({ color: 0x020203, polygonOffset: true, polygonOffsetFactor: -2 }), x, H - 0.003, z); m.rotation.x = E; return m; };
hole(3.85, -6.6, 0.6, 0.6); hole(-1.2, -0.4, 0.6, 0.6);
cable([[3.7, H, -6.5], [3.75, 2.25, -6.55], [3.82, 2.0, -6.7]], 0x222222, 0.006);
cable([[4.0, H, -6.8], [3.95, 2.35, -6.7], [4.05, 2.15, -6.6]], 0xa83020, 0.005);
cable([[-1.3, H, -0.3], [-1.25, 2.3, -0.4], [-1.1, 2.15, -0.5]], 0x2a4aa8, 0.006);
const sag = box(0.6, 0.015, 0.6, lam({ map: ceilTex }), 3.15, H - 0.17, -3.9); sag.rotation.z = 0.5;

// office crust: carpet stains, coffee rings, duct tape, sticky notes, dust bunnies, dead plant
for (let i = 0; i < 6; i++) decal(stainTex, rnd(0.3, 0.6), rnd(0.25, 0.5), rnd(-2, 2), 0.004, rnd(-1.5, 1.6), rnd(0, 6), -E, 0.8);
for (const [x, z] of [[0.45, -1.3], [-0.2, -1.8], [0.62, -1.75], [-0.85, -1.35]]) decal(coffeeTex, 0.09, 0.09, x, DT + 0.002, z, rnd(0, 6), -E);
decal(tiled(tapeTex, 1, 1), 0.1, 0.7, -0.75, 0.006, -0.6, 0.6, -E);
const notes = [['DO NOT|REBOOT', '#f0e060'], ['pw on|back', '#f09ac0'], ['113??', '#f0e060'], ['CALL|BACK', '#9ae0a0']];
const crtNote = plane(0.07, 0.07, lam({ map: noteTex(...notes[0]) }), 0.16, 0.36, 0.193, 0.1, crt);
plane(0.07, 0.07, lam({ map: noteTex(...notes[2]) }), -0.17, 0.08, 0.193, -0.15, crt);
decal(noteTex(...notes[1]), 0.07, 0.07, 0.13, DT + 0.003, -1.42, 0.4, -E);
decal(noteTex(...notes[3]), 0.08, 0.08, RKX + 0.1, 1.55, RKZ - 0.42, Math.PI);
for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.03, 0.06), 0), lam({ color: 0x6a6670 })); d.scale.y = 0.4; d.position.set(rnd(-0.9, 0.9), 0.015, rnd(-1.85, -1.3)); scene.add(d); }
cyl(0.09, 0.07, 0.13, 7, lam({ color: 0x8a4a2a }), 1.85, 1.365, -1.65);
for (let i = 0; i < 4; i++) { const st = box(0.01, rnd(0.15, 0.3), 0.01, lam({ color: 0x5a4a28 }), 1.85 + rnd(-0.03, 0.03), 1.5, -1.65 + rnd(-0.03, 0.03)); st.rotation.set(rnd(-0.6, 0.6), 0, rnd(-0.8, 0.8)); }
// grime on the server rack + gear
decal(tiled(grimeTex, 1, 1), 0.62, 0.5, RKX, 0.25, RKZ - 0.418, Math.PI, 0, 0.7);

// ---------- outside: the parking lot ----------
const asphaltTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#232327', '#323236', '#1c1c20', '#3a3a3e']);
  g.strokeStyle = 'rgba(10,10,12,0.8)'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); let x = rnd(0, w), y = rnd(0, h); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-8, 8); y += rnd(-8, 8); g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = 'rgba(15,15,18,0.6)'; g.beginPath(); g.ellipse(40, 20, 7, 4, 0.4, 0, 7); g.fill();
});
const grassTex = canvasTex(32, 32, (g, w, h) => { g.fillStyle = '#1c2414'; g.fillRect(0, 0, w, h); noise(g, w, h, 600, ['#24301a', '#141a0e', '#2c3a20', '#3a3a22']); });
const concreteTex = canvasTex(32, 32, (g, w, h) => { g.fillStyle = '#6a6862'; g.fillRect(0, 0, w, h); noise(g, w, h, 500, ['#5e5c56', '#76746e', '#55534e']); g.fillStyle = '#3a3834'; g.fillRect(0, 0, 1, h); });
const outside = (o) => { o.userData.outside = true; return o; };
const ground = outside(plane(40, 14, lam({ map: tiled(asphaltTex, 10, 3.5) }), 3, 0, -20.6)); ground.rotation.x = -E;
const walk = outside(plane(40, 1.3, lam({ map: tiled(concreteTex, 20, 1) }), 3, 0.06, -13.2)); walk.rotation.x = -E;
outside(box(40, 0.14, 0.15, lam({ map: concreteTex }), 3, 0.07, -13.9));
const grass = outside(plane(60, 30, lam({ map: tiled(grassTex, 24, 12) }), 3, -0.01, -42)); grass.rotation.x = -E;
outside(box(40, 0.12, 0.15, lam({ map: concreteTex }), 3, 0.06, -27.5));
// outer face of the school wall
// parking stripes + stop blocks
const paint = lam({ color: 0xd8b040 });
for (let x = -6; x <= 12; x += 2.8) { outside(box(0.1, 0.01, 4.6, paint, x, 0.006, -17.2)); outside(box(1.4, 0.12, 0.18, lam({ map: concreteTex }), x + 1.4, 0.06, -15.0)); }
outside(box(20, 0.01, 0.1, paint, 3, 0.006, -19.6));
// sodium streetlight
const pole = lam({ color: 0x3a3a3c });
outside(cyl(0.08, 0.11, 4.8, 6, pole, 1.0, 2.4, -17.5));
outside(box(0.9, 0.06, 0.06, pole, 1.4, 4.75, -17.5));
outside(box(0.55, 0.14, 0.28, pole, 1.75, 4.7, -17.5));
const lampHead = outside(box(0.45, 0.04, 0.22, basic({ color: 0xffd090 }), 1.75, 4.62, -17.5)); lampHead.userData.noShadow = true;
outside(cyl(0.2, 0.25, 0.3, 6, lam({ map: concreteTex }), 1.0, 0.15, -17.5));
// light cone haze under the lamp
const haze = outside(cyl(0.25, 2.2, 4.5, 8, basic({ color: 0xff9a40, transparent: true, opacity: 0.018, depthWrite: false, side: THREE.DoubleSide }), 1.75, 2.35, -17.5)); haze.userData.noShadow = true; haze.visible = false;

// the work truck (ladder rack, toolbox, beat up)
const truck = new THREE.Group(); truck.position.set(5.6, 0, -17.9); truck.rotation.y = 0.55; scene.add(truck); truck.userData.outside = true;
const tWhite = lam({ color: 0xc8c4bc }), tDark = lam({ color: 0x1a1a1e }), tGlass = lam({ color: 0x1a2030 }), tRack = lam({ color: 0x141414 });
box(1.9, 0.55, 5.0, tWhite, 0, 0.75, 0, truck);             // body
box(1.85, 0.7, 1.6, tWhite, 0, 1.35, 0.55, truck);          // cab
box(1.75, 0.5, 1.4, tGlass, 0, 1.42, 0.55, truck).scale.set(1.03, 1, 1.02);
box(1.9, 0.18, 1.5, tWhite, 0, 1.08, 1.95, truck);          // hood
box(1.9, 0.12, 0.08, lam({ color: 0x8a8a8a }), 0, 0.6, 2.52, truck); // bumper
box(1.9, 0.12, 0.08, lam({ color: 0x8a8a8a }), 0, 0.6, -2.52, truck);
for (const x of [-0.9, 0.9]) box(0.06, 0.45, 2.3, tWhite, x, 1.25, -1.35, truck); // bed walls
box(1.9, 0.45, 0.06, tWhite, 0, 1.25, -2.5, truck);
box(1.7, 0.35, 0.45, lam({ color: 0x8a8e94 }), 0, 1.2, -0.45, truck); // toolbox
for (const [x, z] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.6], [0.95, -1.6]]) { const w = cyl(0.36, 0.36, 0.26, 8, tDark, x, 0.36, z, truck); w.rotation.z = E; }
// ladder rack
for (const z of [-2.45, -0.25]) { box(0.06, 1.0, 0.06, tRack, -0.92, 1.95, z, truck); box(0.06, 1.0, 0.06, tRack, 0.92, 1.95, z, truck); box(1.9, 0.06, 0.06, tRack, 0, 2.45, z, truck); }
box(0.06, 0.06, 2.3, tRack, -0.92, 2.45, -1.35, truck); box(0.06, 0.06, 2.3, tRack, 0.92, 2.45, -1.35, truck);
box(0.4, 0.05, 3.2, lam({ color: 0x8a8a7a }), 0.4, 2.51, -1.0, truck); // ladder on top
box(0.08, 0.06, 0.02, basic({ color: 0xff2010 }), -0.8, 0.95, -2.54, truck); box(0.08, 0.06, 0.02, basic({ color: 0xff2010 }), 0.8, 0.95, -2.54, truck);
// side lettering
const truckDecal = canvasTex(64, 16, (g) => { g.fillStyle = '#1a2a6a'; g.font = 'bold 7px Arial'; g.fillText('DISTRICT IT', 3, 8); g.font = '5px Arial'; g.fillText('FACILITIES  #07', 3, 14); });
const td = plane(1.4, 0.35, lam({ map: truckDecal, transparent: true }), 0.961, 0.8, 0.3, E, truck); td.material.alphaTest = 0.4;

// a second car, abandoned under a tree
const car = new THREE.Group(); car.position.set(-3.6, 0, -21.5); car.rotation.y = -0.2; scene.add(car); car.userData.outside = true;
box(1.7, 0.5, 4.0, lam({ color: 0x4a2a2a }), 0, 0.55, 0, car); box(1.6, 0.45, 2.0, lam({ color: 0x4a2a2a }), 0, 1.0, -0.2, car); box(1.55, 0.38, 1.9, tGlass, 0, 1.03, -0.2, car).scale.set(1.03, 1, 1.02);
for (const [x, z] of [[-0.85, 1.25], [0.85, 1.25], [-0.85, -1.25], [0.85, -1.25]]) { const w = cyl(0.3, 0.3, 0.2, 8, tDark, x, 0.3, z, car); w.rotation.z = E; }

// trees + bushes (layered low-poly blobs, lit by the lamp)
const leaf = [lam({ color: 0x24341c }), lam({ color: 0x1c2a16 }), lam({ color: 0x30401e })];
function tree(x, z, s2) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s2); scene.add(g); g.userData.outside = true;
  cyl(0.14, 0.2, 3.2, 5, lam({ color: 0x2a2018 }), 0, 1.6, 0, g);
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.9, 1.5), 0), leaf[i % 3]); b.position.set(rnd(-0.9, 0.9), rnd(2.8, 4.6), rnd(-0.9, 0.9)); b.rotation.set(rnd(0, 3), rnd(0, 3), 0); g.add(b); }
}
for (const [x, z, s2] of [[-2, -26, 1.2], [1.5, -28, 1.4], [6, -27, 1.1], [10, -29, 1.5], [-6, -24, 1.0], [13, -25, 1.2], [-1.0, -23.2, 0.9]]) tree(x, z, s2);
for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.4, 0.8), 0), leaf[i % 3]); b.position.set(rnd(-6, 12), 0.35, rnd(-27.2, -26)); b.scale.y = 0.7; scene.add(b); b.userData.outside = true; }
// tall dry weeds by the curb (like your reference)
const weedTex = canvasTex(16, 32, (g) => { for (let i = 0; i < 10; i++) { g.fillStyle = ['#8a6a3a', '#6a5030', '#a08048'][i % 3]; const x = rnd(1, 15) | 0, h2 = rnd(14, 30) | 0; g.fillRect(x, 32 - h2, 1, h2); g.fillRect(x - 1, 32 - h2, 3, 3); } });
for (let i = 0; i < 10; i++) { const wd = plane(rnd(0.5, 0.9), rnd(0.6, 1.0), lam({ map: weedTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), rnd(-5, 12), 0.35, rnd(-27.8, -27.3), rnd(-0.5, 0.5)); wd.userData.outside = true; }

// distant building silhouette with a couple of lit windows
const farTex = canvasTex(64, 32, (g, w, h) => { g.fillStyle = '#0e0e16'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = Math.random() < 0.25 ? '#e8c070' : '#16161e'; g.fillRect(4 + (i % 4) * 15, 6 + Math.floor(i / 4) * 12, 8, 6); } });
outside(plane(18, 6, basic({ map: farTex, fog: false, color: 0x8a8a8a }), 4, 3, -36));

// stars
const starGeo = new THREE.BufferGeometry(); const sp = [];
for (let i = 0; i < 260; i++) { const a = rnd(-1.2, 1.2), el = rnd(0.12, 1.1), r = 60; sp.push(Math.sin(a) * Math.cos(el) * r + 3, Math.sin(el) * r, -Math.cos(a) * Math.cos(el) * r - 12); }
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc8c8e8, size: 1.6, sizeAttenuation: false, fog: false })));

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x2a2a52, 1.15));
const laptopLight = new THREE.PointLight(0x9fd8ff, 1.8, 3.2, 1); laptopLight.position.set(0, 1.05, -1.25); scene.add(laptopLight);
laptopLight.castShadow = true; laptopLight.shadow.mapSize.set(256, 256); laptopLight.shadow.bias = -0.003; laptopLight.shadow.normalBias = 0.02; laptopLight.shadow.camera.near = 0.05;
const termLight = new THREE.PointLight(0x4aff7a, 0.6, 1.6, 1); termLight.position.set(0.6, 1.0, -1.35); scene.add(termLight);
const shelfLight = new THREE.PointLight(0x5a7aff, 1.2, 2.8, 1); shelfLight.position.set(-1.5, 1.2, -1.1); scene.add(shelfLight);
const rackLight = new THREE.PointLight(0x4a6aff, 1.0, 2.5, 1); rackLight.position.set(-1.7, 1.0, 0.8); scene.add(rackLight);
const sodiumOffice = new THREE.PointLight(0xff9a40, 2.6, 5, 1); sodiumOffice.position.set(-2.2, 1.6, 0.15); scene.add(sodiumOffice);
const hallLights = [-0.9, -4.9].map((z) => { const l = new THREE.PointLight(0xd8ecff, 2.4, 6.5, 1); l.position.set(3.5, H - 0.25, z); scene.add(l); return l; });
hallLights[1].castShadow = true; hallLights[1].shadow.mapSize.set(256, 256); hallLights[1].shadow.bias = -0.003; hallLights[1].shadow.normalBias = 0.03; hallLights[1].shadow.camera.near = 0.1;
const sodiumHall = new THREE.PointLight(0xff9a40, 1.2, 5, 1); sodiumHall.position.set(3.5, 1.6, -12.2); scene.add(sodiumHall);
const streetLight = new THREE.PointLight(0xffa048, 16, 18, 1.3); streetLight.position.set(1.75, 4.4, -17.5); scene.add(streetLight);
streetLight.castShadow = true; streetLight.shadow.mapSize.set(256, 256); streetLight.shadow.bias = -0.004; streetLight.shadow.normalBias = 0.05; streetLight.shadow.camera.near = 0.3;
const skyFill = new THREE.HemisphereLight(0x1a2050, 0x050403, 0.35); scene.add(skyFill);
const doorDark = new THREE.PointLight(0x3a2a6a, 0.0, 2, 1); doorDark.position.set(4.6, 1.2, -11.6); scene.add(doorDark);

// shadows
const noCast = new Set(statics);
scene.traverse((o) => {
  if (!o.isMesh) return;
  o.receiveShadow = true;
  o.castShadow = !noCast.has(o) && !o.material.transparent && !(o.geometry.type === 'PlaneGeometry') && !o.userData.noShadow;
  if (o.userData.castOutside) o.castShadow = true;
});
figure.traverse((o) => { if (o.isMesh) o.castShadow = false; });

// ---------- nodes (node-based movement) ----------
// headings: 0 = north (-z), 1 = east (+x), 2 = south (+z), 3 = west (-x)
const nodes = {
  desk:   { area: 'IT OFFICE',   pos: [0, 1.15, -0.95], links: { 2: 'office' }, pitch: { 0: -0.36 } },
  office: { area: 'IT OFFICE',   pos: [0, 1.6, 0.45],   links: { 0: 'desk', 1: 'door' }, pitch: { 3: -0.05 } },
  door:   { area: 'IT OFFICE',   pos: [1.95, 1.6, 0],   links: { 1: 'hallS', 3: 'office' } },
  hallS:  { area: 'B-WING HALL', pos: [3.5, 1.6, 0],    links: { 0: 'hallM', 3: 'door' } },
  hallM:  { area: 'B-WING HALL', pos: [3.5, 1.6, -5],   links: { 0: 'hallN', 2: 'hallS' } },
  hallN:  { area: 'B-WING HALL', pos: [3.5, 1.6, -11.45], links: { 2: 'hallM' } },
};
const yawOf = (h) => -h * Math.PI / 2;
const state = { node: 'desk', heading: 0, yaw: 0, pitch: -0.36, busy: false };
const cur = { pos: new THREE.Vector3(...nodes.desk.pos), yaw: 0, pitch: -0.36 };
let tween = null; // { from, to, t, dur, kind }
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

const areaEl = document.getElementById('area');
let areaTimer;
function showArea(name) { areaEl.textContent = name; areaEl.style.opacity = 1; clearTimeout(areaTimer); areaTimer = setTimeout(() => (areaEl.style.opacity = 0), 2200); }

function targetPitch(nodeId, h) { const p = nodes[nodeId].pitch; return (p && p[h] !== undefined) ? p[h] : 0; }
function turn(dir) {
  if (tween) return;
  const h = (state.heading + dir + 4) % 4;
  tween = { kind: 'turn', t: 0, dur: 0.38, fromYaw: cur.yaw, toYaw: cur.yaw - dir * Math.PI / 2, fromPitch: cur.pitch, toPitch: targetPitch(state.node, h) };
  state.heading = h; updateArrows();
}
function forward() {
  if (tween) return;
  const next = nodes[state.node].links[state.heading];
  if (!next) { bump(); return; }
  const prevArea = nodes[state.node].area;
  tween = { kind: 'move', t: 0, dur: 0.9, from: cur.pos.clone(), to: new THREE.Vector3(...nodes[next].pos), fromPitch: cur.pitch, toPitch: targetPitch(next, state.heading), fromYaw: cur.yaw, toYaw: cur.yaw };
  state.node = next;
  if (nodes[next].area !== prevArea) showArea(nodes[next].area);
  if (next === 'hallM' || next === 'hallN') figureGone = true;
  updateArrows();
}
let bumpT = 0; function bump() { bumpT = 0.25; }

// ---------- controls ----------
const btn = (id, fn) => { const el = document.getElementById(id); el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }); return el; };
const upBtn = btn('b-up', forward); btn('b-left', () => turn(-1)); btn('b-right', () => turn(1)); btn('b-down', () => turn(2));
function updateArrows() { upBtn.classList.toggle('off', !nodes[state.node].links[state.heading]); }
updateArrows();
window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW') forward();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') turn(-1);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') turn(1);
  if (e.code === 'ArrowDown' || e.code === 'KeyS') turn(2);
});
const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const inputs = {
      up: (p.buttons[12] && p.buttons[12].pressed) || ay < -0.6,
      down: (p.buttons[13] && p.buttons[13].pressed) || ay > 0.6,
      left: (p.buttons[14] && p.buttons[14].pressed) || ax < -0.6,
      right: (p.buttons[15] && p.buttons[15].pressed) || ax > 0.6,
    };
    const acts = { up: forward, down: () => turn(2), left: () => turn(-1), right: () => turn(1) };
    for (const k in inputs) { const key = p.index + k; if (inputs[k] && !padPrev[key]) acts[k](); padPrev[key] = inputs[k]; }
  }
}

// ---------- LED alarm clock HUD ----------
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
const SEG_PTS = { a: '3,1 17,1 14,4 6,4', b: '18,2 18,17 15,15 15,5', c: '18,19 18,34 15,31 15,21', d: '3,35 17,35 14,32 6,32', e: '2,19 2,34 5,31 5,21', f: '2,2 2,17 5,15 5,5', g: '3,18 6,16 14,16 17,18 14,20 6,20' };
const digitSVG = (n, blank) => `<svg viewBox="0 0 20 36" class="dg">` + Object.entries(SEG_PTS).map(([k, pts]) => `<polygon points="${pts}" class="${!blank && SEG[n].includes(k) ? 'on' : 'off'}"/>`).join('') + `</svg>`;
const digitsEl = document.getElementById('digits'), pmEl = document.getElementById('pm'), colonEl = document.getElementById('colon');
let mins = 2 * 60 + 51;
function renderClock() {
  const h24 = Math.floor(mins / 60), m = mins % 60, h = h24 % 12 || 12;
  digitsEl.querySelector('.h').innerHTML = digitSVG(Math.floor(h / 10), h < 10) + digitSVG(h % 10);
  digitsEl.querySelector('.m').innerHTML = digitSVG(Math.floor(m / 10)) + digitSVG(m % 10);
  pmEl.classList.toggle('lit', h24 >= 12);
}
setInterval(() => { mins = (mins + 1) % 1440; renderClock(); }, 2500);
setInterval(() => colonEl.classList.toggle('dim'), 750);
renderClock();

// ---------- loop ----------
resize();
showArea('IT OFFICE');
const clock = new THREE.Clock();
let acc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  pollPad();
  postMat.uniforms.time.value = t;

  // camera tween + idle sway + footstep bob
  let bob = 0;
  if (tween) {
    tween.t += dt; const k = Math.min(tween.t / tween.dur, 1), e = ease(k);
    if (tween.kind === 'move') { cur.pos.lerpVectors(tween.from, tween.to, e); bob = Math.abs(Math.sin(k * Math.PI * 3)) * 0.035; }
    cur.yaw = tween.fromYaw + (tween.toYaw - tween.fromYaw) * e;
    cur.pitch = tween.fromPitch + (tween.toPitch - tween.fromPitch) * e;
    if (k >= 1) tween = null;
  }
  if (bumpT > 0) bumpT -= dt;
  camera.position.set(cur.pos.x + Math.sin(t * 0.5) * 0.006, cur.pos.y + Math.sin(t * 0.8) * 0.006 - bob, cur.pos.z);
  camera.rotation.y = cur.yaw + Math.sin(t * 0.35) * 0.006 + (bumpT > 0 ? Math.sin(bumpT * 60) * 0.01 : 0);
  camera.rotation.x = cur.pitch + Math.sin(t * 0.6) * 0.004;

  // screens
  acc += dt; if (acc > 0.12) { acc = 0; drawLaptop(t); drawTerm(t); }

  // blinking LEDs
  for (const l of ledBoxes) l.visible = Math.sin(t * l.userData.rate + l.userData.phase) > -0.3;
  phoneLed.visible = (t % 1.6) < 0.8;

  // fluorescent flicker on the middle hall light
  const fl = Math.random() < 0.06 ? rnd(0, 0.4) : 1;
  const buzz = (t % 9 > 8.2) ? (Math.random() < 0.5 ? 0 : 1) : fl;
  hallLights[1].intensity = 2.4 * buzz;
  fixtures[1].material.color.setScalar(0.25 + 0.75 * buzz);
  laptopLight.intensity = 1.7 + Math.sin(t * 9) * 0.05;

  // pipe drip falls every ~3s
  const dk = (t % 3) / 3;
  dripDrop.position.y = 2.4 - Math.pow(dk, 2) * 2.4; dripDrop.visible = dk < 0.98;

  // the figure: only there until you walk toward it
  figure.visible = !figureGone;

  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
