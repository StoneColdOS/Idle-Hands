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
scene.fog = new THREE.Fog(0x06050c, 3, 13);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 40);
camera.rotation.order = 'YXZ';
scene.add(camera);

// ---------- post (dither + quantize + vignette) ----------
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(320, 240) }, fade: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float fade; varying vec2 vUv;
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
const cinderTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#cfc6a8'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 900, ['#c2b99c', '#d8d0b4', '#bab196', '#c8bfa2']);
  g.fillStyle = '#9a9278';
  for (let r = 0; r < 4; r++) {
    g.fillRect(0, r * 16, w, 1);
    const off = (r % 2) * 16;
    for (let x = off; x < w + 32; x += 32) g.fillRect(x % w, r * 16, 1, 16);
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
  g.fillStyle = 'rgba(40,36,30,0.35)'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
});
const ceilTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#b8b4a8'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#a8a498', '#c4c0b4', '#9c988c']);
  g.fillStyle = '#6a685e'; g.fillRect(0, 0, w, 2); g.fillRect(0, 32, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(32, 0, 2, h);
  g.fillStyle = 'rgba(120,90,40,0.35)'; g.beginPath(); g.ellipse(46, 18, 7, 5, 0.3, 0, 7); g.fill(); // water stain
});
const lockerTex = canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = '#3a6a78'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a4e5a'; g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
  for (let y = 4; y < 14; y += 2) { g.fillStyle = '#16303a'; g.fillRect(8, y, 16, 1); }
  for (let y = 50; y < 60; y += 2) { g.fillStyle = '#16303a'; g.fillRect(8, y, 16, 1); }
  g.fillStyle = '#9aa8a8'; g.fillRect(24, 28, 3, 9);
  g.fillStyle = '#d8d0b8'; g.fillRect(8, 18, 10, 5); g.fillStyle = '#222'; g.font = '5px monospace'; g.fillText(String(100 + ((Math.random() * 300) | 0)), 8, 22);
  noise(g, w, h, 60, ['#4a7a88', '#2e5866']);
});
function doorTex(label, ajar) {
  return canvasTex(32, 64, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = Math.random() < 0.5 ? '#6a4a2c' : '#8a6040'; g.fillRect(0, (Math.random() * h) | 0, w, 1); }
    g.fillStyle = '#c8c8c0'; g.fillRect(5, 6, 8, 22); g.fillStyle = '#05060a'; g.fillRect(6, 7, 6, 20);
    if (ajar) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(9, 12, 1, 2); }
    g.fillStyle = '#c0a040'; g.fillRect(25, 34, 4, 2);
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
const cinder = (len, h) => lam({ map: tiled(cinderTex, len / 0.8, h / 0.8) });
const statics = [];
function wallX(x, z1, z2, y1 = 0, y2 = H) { const m = box(0.12, y2 - y1, z2 - z1, cinder(z2 - z1, y2 - y1), x, (y1 + y2) / 2, (z1 + z2) / 2); statics.push(m); return m; }
function wallZ(z, x1, x2, y1 = 0, y2 = H) { const m = box(x2 - x1, y2 - y1, 0.12, cinder(x2 - x1, y2 - y1), (x1 + x2) / 2, (y1 + y2) / 2, z); statics.push(m); return m; }

wallZ(-2, -2.5, 2.5); wallZ(2, -2.5, 2.5); wallX(-2.5, -2, 2);
wallX(2.5, -12.5, -0.5); wallX(2.5, 0.5, 2); wallX(2.5, -0.5, 0.5, 2.1, H); // shared wall w/ office door gap
wallX(4.5, -12.5, 2); wallZ(-12.5, 2.5, 4.5); wallZ(2, 2.5, 4.5);

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
const lockerMat = lam({ map: lockerTex }), lockerSide = lam({ color: 0x2e5866 });
for (const [z0, n] of [[-0.9, 9], [-6.9, 9]]) for (let i = 0; i < n; i++) faced(0.4, 1.85, 0.38, lockerSide, 1, lam({ map: lockerTex.clone() }), 4.25, 0.925, z0 - i * 0.39);
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
plane(1.4, 1.1, basic({ map: outsideTex }), 3.5, 1.5, -12.43);
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
const sodiumHall = new THREE.PointLight(0xff9a40, 3.2, 7, 1); sodiumHall.position.set(3.5, 1.6, -12.2); scene.add(sodiumHall);
const doorDark = new THREE.PointLight(0x3a2a6a, 0.0, 2, 1); doorDark.position.set(4.6, 1.2, -11.6); scene.add(doorDark);

// shadows
const noCast = new Set(statics);
scene.traverse((o) => {
  if (!o.isMesh) return;
  o.receiveShadow = true;
  o.castShadow = !noCast.has(o) && !o.material.transparent && !(o.geometry.type === 'PlaneGeometry');
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

  // the figure: only there until you walk toward it
  figure.visible = !figureGone;

  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
