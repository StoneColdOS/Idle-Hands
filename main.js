// Idle Hands - PSX style test scene
// Low-res render target + vertex snapping + Gouraud lighting + dithered 15-bit color.
import * as THREE from 'three';

// ---------- renderer & low-res target ----------
const LOW_H = 240; // PSX-ish vertical resolution
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const rt = new THREE.WebGLRenderTarget(320, 240, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
});
const snapRes = { value: new THREE.Vector2(160, 120) };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060a);
scene.fog = new THREE.Fog(0x07060a, 4, 9);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.03, 30);
scene.add(camera);

// ---------- post (dither + quantize) ----------
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(320, 240) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
    float bayer(vec2 p){
      int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); int i = x + y * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return m[i] / 16.0 - 0.5;
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(c.rgb, 1.0);
      #include <colorspace_fragment>
      vec2 px = floor(vUv * res);
      vec3 col = gl_FragColor.rgb;
      col = floor(col * 31.0 + 0.5 + bayer(px) * 1.2) / 31.0; // 15-bit color + ordered dither
      vec2 d = vUv - 0.5; col *= 1.0 - dot(d, d) * 0.9;        // vignette
      col *= 0.94 + 0.06 * mod(px.y, 2.0);                      // faint scanlines
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

function resize() {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  renderer.setSize(w, h);
  const lw = Math.round(LOW_H * aspect), lh = LOW_H;
  rt.setSize(lw, lh);
  postMat.uniforms.res.value.set(lw, lh);
  snapRes.value.set(lw / 2, lh / 2);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- materials ----------
function psx(mat) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uSnap = snapRes;
    s.vertexShader = 'uniform vec2 uSnap;\n' + s.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vec4 sp = gl_Position; sp.xy = floor(sp.xy / sp.w * uSnap + 0.5) / uSnap * sp.w; gl_Position = sp;`);
  };
  return mat;
}
const lam = (o) => psx(new THREE.MeshLambertMaterial(o));
const basic = (o) => psx(new THREE.MeshBasicMaterial(o));

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.canvas = c; t.userData.ctx = g;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function noise(g, w, h, n, colors, sz = 1) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(Math.random() * colors.length) | 0]; g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, sz, sz); }
}

// ---------- textures ----------
const woodFloor = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#4a3020'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = ['#553722', '#45291a', '#5c3d26', '#4e321f'][(y / 8) % 4]; g.fillRect(0, y, w, 7);
    g.fillStyle = '#24160d'; g.fillRect(0, y + 7, w, 1); g.fillRect(((y * 13) % w), y, 1, 7);
  }
  noise(g, w, h, 260, ['#3a2416', '#634228', '#2e1c11']);
}, [6, 6]);
const tableWood = canvasTex(64, 32, (g, w, h) => {
  g.fillStyle = '#b08a5e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < .5 ? '#a07a50' : '#c49a6a'; g.fillRect(0, (Math.random() * h) | 0, w, 1); }
  noise(g, w, h, 120, ['#8e6a44', '#caa577']);
});
const paneling = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#5a3a26'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { g.fillStyle = '#3a2416'; g.fillRect(x, 0, 1, h); g.fillStyle = '#6a4630'; g.fillRect(x + 1, 0, 1, h); }
  noise(g, w, h, 300, ['#4c3020', '#664330', '#523523']);
}, [5, 2]);
const sideWall = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#6b6550'; g.fillRect(0, 0, w, h); noise(g, w, h, 300, ['#5f5946', '#77705a', '#625c48']);
}, [4, 2]);
const fabric = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#7a2f22'; g.fillRect(0, 0, w, h); noise(g, w, h, 400, ['#6a281d', '#8a3a2a', '#5e2219', '#93432f']);
});
const ringTex = canvasTex(32, 32, (g) => {
  g.strokeStyle = 'rgba(15,10,6,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(15,10,6,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(16, 16, 13, 0.4, 4.2); g.stroke();
});
const puddleTex = canvasTex(32, 32, (g) => {
  g.fillStyle = 'rgba(8,6,10,0.92)'; g.beginPath(); g.ellipse(16, 16, 14, 9, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(24, 22, 6, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(90,70,140,0.5)'; g.fillRect(10, 12, 6, 1);
});
function label(bg, fg, l1, l2, stripe) {
  return canvasTex(64, 32, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = stripe; g.fillRect(0, 22, w, 4); }
    g.fillStyle = fg; g.font = 'bold 10px Arial'; g.textBaseline = 'top';
    g.fillText(l1, 3, 5); g.fillText(l1, 35, 5);
    if (l2) { g.font = 'bold 7px Arial'; g.fillText(l2, 3, 15); g.fillText(l2, 35, 15); }
  });
}
const redVolt = label('#2a3f8f', '#e8e8f0', 'RED', 'VOLT', '#c8202a');
const oilLabel = label('#e2b830', '#2a1a10', 'MOD-', 'ELO 10W30', '#b5302a');
const packTop = canvasTex(32, 48, (g, w, h) => {
  g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c0202a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 20); g.lineTo(w / 2, 10); g.lineTo(0, 20); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 7px serif'; g.fillText('Marlbolts', 1, 34);
});
const chipTex = canvasTex(8, 8, (g) => {
  g.fillStyle = '#1f6b3a'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#111'; g.fillRect(2, 2, 4, 4);
  g.fillStyle = '#e9c46a'; for (let i = 0; i < 8; i += 2) { g.fillRect(i, 0, 1, 1); g.fillRect(i, 7, 1, 1); }
});
const windowTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#0d1630'; g.fillRect(0, 0, w, h);
  noise(g, w, 16, 10, ['#9aa8d8', '#ffffff']);
  g.fillStyle = '#1a1f2a'; g.fillRect(0, 22, 9, 10); g.fillRect(20, 18, 12, 14);
  g.fillStyle = '#e8c070'; g.fillRect(23, 21, 2, 2);
  for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(180,170,150,0.55)'; g.fillRect(0, y, w, 2); }
});
const posterTex = canvasTex(32, 48, (g, w, h) => {
  g.fillStyle = '#d9c9a0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a6a70'; g.fillRect(12, 14, 8, 8); g.fillRect(13, 22, 6, 9);
  g.fillStyle = '#ffd24a'; g.fillRect(14, 17, 1, 1); g.fillRect(17, 17, 1, 1);
  g.fillStyle = '#5a3a26'; g.fillRect(15, 4, 2, 10); g.fillRect(4, 4, 24, 2);
  g.fillStyle = '#7a2a20'; g.font = 'bold 6px Arial'; g.fillText('HANG IN', 4, 39); g.fillText('THERE', 6, 45);
});

// CRT screen: tiny animated "game"
const screenTex = canvasTex(64, 48, () => {});
const sg = screenTex.userData.ctx;
const stars = Array.from({ length: 18 }, () => [Math.random() * 64, Math.random() * 48, rnd(0.3, 1.2)]);
let enemyX = 10, score = 0;
function drawScreen(t) {
  sg.fillStyle = '#05140f'; sg.fillRect(0, 0, 64, 48);
  sg.fillStyle = '#9fffd8';
  for (const s of stars) { s[1] = (s[1] + s[2]) % 48; sg.fillRect(s[0] | 0, s[1] | 0, 1, 1); }
  enemyX = 32 + Math.sin(t * 1.3) * 22;
  sg.fillStyle = '#ff5a7a'; sg.fillRect(enemyX - 3, 10, 6, 3); sg.fillRect(enemyX - 1, 13, 2, 2);
  const px = 32 + Math.sin(t * 0.9 + 1) * 18;
  sg.fillStyle = '#7ad0ff'; sg.fillRect(px - 3, 38, 7, 3); sg.fillRect(px - 1, 35, 3, 3);
  if ((t * 4 | 0) % 2) { sg.fillStyle = '#ffffff'; sg.fillRect(px, 20 + ((t * 40) % 14), 1, 3); }
  score = (score + 7) % 99999;
  sg.fillStyle = '#ffe066'; sg.font = '6px monospace'; sg.fillText(String(score).padStart(5, '0'), 2, 6);
  for (let y = 0; y < 48; y += 2) { sg.fillStyle = 'rgba(0,0,0,0.25)'; sg.fillRect(0, y, 64, 1); }
  screenTex.needsUpdate = true;
}

// ---------- helpers ----------
function box(w, h, d, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt, rb, h, seg, mat, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function decal(tex, size, x, y, z, rotX = -Math.PI / 2, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), basic({ map: tex, transparent: true, depthWrite: false, opacity }));
  m.position.set(x, y, z); m.rotation.x = rotX; m.rotation.z = Math.random() * 6; scene.add(m); return m;
}

// ---------- room ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7, 7, 7), lam({ map: woodFloor }));
floor.rotation.x = -Math.PI / 2; floor.position.z = -0.5; scene.add(floor);

const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 3, 7, 3), lam({ map: paneling }));
back.position.set(0, 1.5, -2.8); scene.add(back);
const left = new THREE.Mesh(new THREE.PlaneGeometry(7, 3, 7, 3), lam({ map: sideWall }));
left.position.set(-3, 1.5, -0.5); left.rotation.y = Math.PI / 2; scene.add(left);
const right = new THREE.Mesh(new THREE.PlaneGeometry(7, 3, 7, 3), lam({ map: sideWall }));
right.position.set(3, 1.5, -0.5); right.rotation.y = -Math.PI / 2; scene.add(right);

const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), basic({ map: windowTex, color: 0x8a8fa8 }));
win.position.set(-2.98, 1.5, -1.0); win.rotation.y = Math.PI / 2; scene.add(win);
box(0.04, 0.06, 1.3, lam({ color: 0x3a2a1e }), -2.97, 1.02, -1.0);

const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), lam({ map: posterTex }));
poster.position.set(1.4, 1.55, -2.78); poster.rotation.z = 0.04; scene.add(poster);

// TV stand, CRT, console
const darkWood = lam({ color: 0x4a3020 });
box(1.4, 0.5, 0.5, darkWood, 0, 0.25, -2.4);
box(0.62, 0.08, 0.3, lam({ color: 0x1c1c22 }), -0.35, 0.54, -2.35).rotation.y = 0.1; // console
box(0.7, 0.55, 0.5, lam({ color: 0x8f949a }), 0.15, 0.78, -2.4);
box(0.5, 0.4, 0.3, lam({ color: 0x7c8086 }), 0.15, 0.78, -2.75);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.39), basic({ map: screenTex }));
screen.position.set(0.12, 0.8, -2.145); scene.add(screen);
for (let i = 0; i < 4; i++) box(0.16, 0.02, 0.2, lam({ color: [0x203060, 0x602020, 0x206040, 0x111111][i] }), 0.55, 0.51 + i * 0.022, -2.35).rotation.y = rnd(-0.3, 0.3);

// floor lamp
cyl(0.015, 0.015, 1.4, 5, lam({ color: 0x2a2018 }), -2.3, 0.7, -2.2);
cyl(0.12, 0.22, 0.25, 8, basic({ color: 0xf2c46a }), -2.3, 1.45, -2.2);
cyl(0.18, 0.2, 0.03, 8, lam({ color: 0x2a2018 }), -2.3, 0.015, -2.2);

// couch (seen in wide shot)
const fab = lam({ map: fabric });
box(2.2, 0.4, 0.9, fab, 0, 0.3, 1.6);
box(2.2, 0.6, 0.25, fab, 0, 0.75, 2.0);
box(0.25, 0.6, 0.9, fab, -1.2, 0.45, 1.6);
box(0.25, 0.6, 0.9, fab, 1.2, 0.45, 1.6);

// coffee table
const top = box(1.3, 0.06, 0.7, lam({ map: tableWood }), 0, 0.45, 0);
for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) box(0.05, 0.42, 0.05, darkWood, x, 0.21, z);
const TT = 0.481; // table top surface

// ashtray + butts + lit cig
const glass = lam({ color: 0xb8b8c8 });
cyl(0.12, 0.135, 0.045, 8, glass, 0.12, TT + 0.022, 0.05);
cyl(0.09, 0.09, 0.006, 8, lam({ color: 0x55524e }), 0.12, TT + 0.043, 0.05);
const butt = lam({ color: 0xe6e2da }), filt = lam({ color: 0xd08a3a });
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group(); g.position.set(0.12 + rnd(-0.05, 0.05), TT + 0.05, 0.05 + rnd(-0.05, 0.05)); g.rotation.set(Math.PI / 2, 0, rnd(0, 6));
  cyl(0.008, 0.008, 0.035, 5, butt, 0, 0, 0, g); cyl(0.0085, 0.0085, 0.018, 5, filt, 0, 0.026, 0, g); scene.add(g);
}
const cig = new THREE.Group(); cig.position.set(0.24, TT + 0.055, 0.04); cig.rotation.set(0, 0.5, Math.PI / 2 - 0.15);
cyl(0.008, 0.008, 0.08, 5, butt, 0, -0.02, 0, cig); cyl(0.0085, 0.0085, 0.025, 5, filt, 0, 0.032, 0, cig);
const ember = cyl(0.009, 0.009, 0.008, 5, basic({ color: 0xff6a20 }), 0, -0.064, 0, cig);
scene.add(cig);

// cans
function can(tex, x, z, tipped) {
  const g = new THREE.Group();
  const mats = [lam({ map: tex }), lam({ color: 0xc8c8d0 }), lam({ color: 0x9a9aa2 })];
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), mats));
  if (tipped) { g.rotation.z = Math.PI / 2; g.rotation.y = rnd(0, 6); g.position.set(x, TT + 0.033, z); }
  else g.position.set(x, TT + 0.06, z);
  scene.add(g); return g;
}
can(redVolt, -0.32, -0.12);
can(redVolt, -0.18, 0.12, true);
can(oilLabel, 0.42, -0.16);
decal(ringTex, 0.1, -0.05, TT + 0.001, -0.15);
decal(ringTex, 0.1, 0.35, TT + 0.001, 0.18);
decal(puddleTex, 0.5, 0.75, 0.002, 0.55);

// cig pack
const packMats = [lam({ color: 0xf0eee8 }), lam({ color: 0xf0eee8 }), lam({ map: packTop }), lam({ color: 0xf0eee8 }), lam({ color: 0xc0202a }), lam({ color: 0xc0202a })];
const pack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.09), packMats);
pack.position.set(0.32, TT + 0.011, -0.02); pack.rotation.y = 0.4; scene.add(pack);

// controller
const pad = new THREE.Group(); pad.position.set(-0.4, TT + 0.016, 0.2); pad.rotation.y = -0.3;
const padMat = lam({ color: 0x26262c });
box(0.13, 0.025, 0.06, padMat, 0, 0, 0, pad);
const gl = cyl(0.022, 0.018, 0.07, 6, padMat, -0.055, -0.004, 0.035, pad); gl.rotation.x = 1.2;
const gr = cyl(0.022, 0.018, 0.07, 6, padMat, 0.055, -0.004, 0.035, pad); gr.rotation.x = 1.2;
box(0.012, 0.004, 0.012, basic({ color: 0xff4a4a }), 0.04, 0.014, -0.008, pad);
box(0.012, 0.004, 0.012, basic({ color: 0x4a9aff }), 0.055, 0.014, 0.004, pad);
scene.add(pad);

// microchip crumbs
const chipMat = lam({ map: chipTex });
for (let i = 0; i < 9; i++) { const c = box(0.028, 0.005, 0.02, chipMat, rnd(-0.55, 0.55), TT + 0.003, rnd(-0.3, 0.3)); c.rotation.y = rnd(0, 6); }
for (let i = 0; i < 10; i++) { const c = box(0.03, 0.006, 0.022, chipMat, rnd(-0.9, 0.9), 0.003, rnd(0.4, 1.1)); c.rotation.y = rnd(0, 6); }

// smoke
const smokeTex = canvasTex(16, 16, (g) => {
  const r = g.createRadialGradient(8, 8, 0, 8, 8, 8); r.addColorStop(0, 'rgba(200,200,210,0.9)'); r.addColorStop(1, 'rgba(200,200,210,0)');
  g.fillStyle = r; g.fillRect(0, 0, 16, 16);
});
const smoke = Array.from({ length: 16 }, (_, i) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
  s.userData.t = i / 16; scene.add(s); return s;
});
const emberWorld = new THREE.Vector3();

// robot hand (POV, attached to camera)
const hand = new THREE.Group();
const teal = lam({ color: 0x4fb0b8, emissive: 0x16393c }), tealD = lam({ color: 0x3a8a92, emissive: 0x0f2a2c }), joint = lam({ color: 0x2a2a30 });
box(0.09, 0.07, 0.32, teal, 0, 0, 0.12, hand);           // forearm
box(0.095, 0.075, 0.03, joint, 0, 0, -0.04, hand);       // wrist ring
box(0.1, 0.035, 0.1, tealD, 0, -0.005, -0.1, hand);      // palm
for (let i = 0; i < 3; i++) box(0.022, 0.02, 0.07, teal, -0.03 + i * 0.03, -0.012, -0.18, hand);
box(0.022, 0.02, 0.05, teal, 0.06, -0.01, -0.09, hand).rotation.y = -0.5;
box(0.02, 0.012, 0.02, basic({ color: 0xffe066 }), 0, 0.04, 0.05, hand); // status LED
hand.position.set(0.24, -0.2, -0.42); hand.rotation.set(0.3, 0.5, 0.2);
camera.add(hand);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x3a3450, 1.4));
const lamp = new THREE.PointLight(0xffb060, 3.5, 6, 1); lamp.position.set(-2.2, 1.35, -2.0); scene.add(lamp);
const tvLight = new THREE.PointLight(0x60ffd0, 2.2, 4, 1); tvLight.position.set(0.12, 0.85, -1.8); scene.add(tvLight);
const emberLight = new THREE.PointLight(0xff7030, 0.25, 0.6, 1); scene.add(emberLight);
const head = new THREE.SpotLight(0xfff0d0, 0, 14, 0.28, 0.5, 0.5); head.position.set(-6, 1.3, -1.0); scene.add(head); scene.add(head.target);

// ---------- camera shots ----------
const shots = [
  { pos: [0.3, 1.05, 1.25], look: [-0.02, 0.55, -0.9], hand: true },   // couch POV
  { pos: [0.62, 0.6, 0.42], look: [0.06, 0.48, -0.02], hand: false },  // ashtray close-up
  { pos: [2.5, 2.2, 1.9], look: [-0.5, 0.5, -1.0], hand: false },      // wide corner
  { pos: [-0.9, 0.62, -1.2], look: [0.15, 0.8, -2.3], hand: false },   // TV close
];
let shot = 0;
const lookAt = new THREE.Vector3();
function setShot(i) {
  shot = (i + shots.length) % shots.length;
  const s = shots[shot]; camera.position.set(...s.pos); lookAt.set(...s.look); hand.visible = s.hand;
}
setShot(0);

const hintEl = document.getElementById('hint');
let hintTimer = setTimeout(() => (hintEl.style.opacity = 0), 5000);
function next() { setShot(shot + 1); }
window.addEventListener('pointerdown', next);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') next();
  if (e.code === 'ArrowLeft') setShot(shot - 1);
});
let padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const pressed = (b) => p.buttons[b] && p.buttons[b].pressed;
    for (const [b, fn] of [[0, next], [15, next], [14, () => setShot(shot - 1)]]) {
      const k = p.index + ':' + b;
      if (pressed(b) && !padPrev[k]) fn();
      padPrev[k] = pressed(b);
    }
  }
}

// ---------- clock ----------
const clockEl = document.getElementById('clock');
let mins = 23 * 60 + 52;
setInterval(() => {
  mins = (mins + 1) % (24 * 60);
  const h24 = Math.floor(mins / 60), m = mins % 60, h = h24 % 12 || 12;
  clockEl.textContent = `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'a.m.' : 'p.m.'}`;
}, 1500);

// ---------- loop ----------
resize();
const clock = new THREE.Clock();
let screenAcc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  pollPad();

  // handheld-camera breathing
  const s = shots[shot];
  camera.position.set(s.pos[0] + Math.sin(t * 0.5) * 0.008, s.pos[1] + Math.sin(t * 0.8) * 0.006, s.pos[2]);
  camera.lookAt(lookAt);
  hand.position.y = -0.2 + Math.sin(t * 0.8) * 0.004;

  // CRT
  screenAcc += dt; if (screenAcc > 0.08) { screenAcc = 0; drawScreen(t); }
  tvLight.intensity = 2.0 + Math.sin(t * 13) * 0.25 + Math.sin(t * 3.1) * 0.25;

  // ember + smoke
  const glow = 0.75 + Math.sin(t * 2.2) * 0.25;
  ember.material.color.setRGB(1, 0.3 + glow * 0.2, 0.08);
  ember.getWorldPosition(emberWorld);
  emberLight.position.copy(emberWorld); emberLight.intensity = 0.2 * glow;
  for (const p of smoke) {
    p.userData.t = (p.userData.t + dt * 0.18) % 1; const k = p.userData.t;
    p.position.set(emberWorld.x + Math.sin(k * 9 + t) * 0.03 * k, emberWorld.y + k * 0.55, emberWorld.z + Math.cos(k * 7) * 0.02 * k);
    const sc = 0.02 + k * 0.1; p.scale.set(sc, sc, 1);
    p.material.opacity = Math.sin(k * Math.PI) * 0.45;
  }

  // headlights sweep every ~14s
  const cyc = t % 14;
  if (cyc < 3) {
    const k = cyc / 3;
    head.intensity = Math.sin(k * Math.PI) * 60;
    head.target.position.set(-2.5 + k * 5, 1.2, -2.8);
  } else head.intensity = 0;

  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
