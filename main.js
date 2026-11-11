// Idle Hands - PSX style test scene
// Low-res render target + vertex snapping + Gouraud lighting + dithered 15-bit color.
import * as THREE from 'three';

// ---------- renderer & low-res target ----------
const LOW_H = 240; // PSX-ish vertical resolution
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // hard, chunky PSX-style shadow edges
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const rt = new THREE.WebGLRenderTarget(320, 240, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
});
const snapRes = { value: new THREE.Vector2(160, 120) };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08070f);
scene.fog = new THREE.Fog(0x08070f, 4, 9);

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
function stucco(base, specks, rep) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    noise(g, w, h, 1400, specks);
    noise(g, w, h, 90, specks, 2);
  }, rep);
}
const paneling = stucco('#8e889a', ['#827c8e', '#9a94a4', '#787284', '#948ea0'], [7, 3]);
const sideWall = stucco('#8e889a', ['#827c8e', '#9a94a4', '#787284', '#948ea0'], [7, 3]);
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
cyl(0.015, 0.015, 1.4, 5, lam({ color: 0x2a2018 }), -2.3, 0.7, -2.2).userData.noCast = true;
cyl(0.12, 0.22, 0.25, 8, basic({ color: 0xf2c46a }), -2.3, 1.45, -2.2).userData.noCast = true;
box(0.004, 0.12, 0.004, lam({ color: 0xc8a040 }), -2.18, 1.28, -2.12).userData.noCast = true; // pull chain
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

// ---------- detail pass ----------
// rug
const rugTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#5a1e22'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e2a4a'; g.fillRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#7a2a2a'; g.fillRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#d8b878';
  for (let i = 6; i < w - 6; i += 6) { g.fillRect(i, 5, 2, 2); g.fillRect(i, h - 7, 2, 2); g.fillRect(5, i, 2, 2); g.fillRect(w - 7, i, 2, 2); }
  g.save(); g.translate(32, 32); g.rotate(Math.PI / 4); g.fillStyle = '#1e2a4a'; g.fillRect(-12, -12, 24, 24); g.fillStyle = '#d8b878'; g.fillRect(-5, -5, 10, 10); g.restore();
  noise(g, w, h, 500, ['#4a181c', '#6a2626', '#1a223a', '#3a1416']);
});
const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7, 4, 4), lam({ map: rugTex }));
rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.004, 0.1); scene.add(rug);

// baseboards
const trim = lam({ color: 0xc8c2bc });
box(7, 0.1, 0.03, trim, 0, 0.05, -2.78);
box(0.03, 0.1, 7, trim, -2.98, 0.05, -0.5);
box(0.03, 0.1, 7, trim, 2.98, 0.05, -0.5);

// wall outlet + framed photo
box(0.06, 0.1, 0.01, lam({ color: 0xd8d0b8 }), -0.9, 0.3, -2.79);
const photoTex = canvasTex(32, 24, (g) => {
  g.fillStyle = '#c8b090'; g.fillRect(0, 0, 32, 24); g.fillStyle = '#7aa0c0'; g.fillRect(0, 0, 32, 12);
  g.fillStyle = '#3a2a20'; g.fillRect(8, 6, 4, 4); g.fillStyle = '#d8a070'; g.fillRect(8, 10, 4, 1);
  g.fillStyle = '#5a6a8a'; g.fillRect(7, 11, 6, 9);
  g.fillStyle = '#4fb0b8'; g.fillRect(19, 9, 6, 5); g.fillRect(18, 14, 8, 6); g.fillStyle = '#ffe066'; g.fillRect(20, 11, 1, 1); g.fillRect(23, 11, 1, 1);
  g.fillStyle = '#4fb0b8'; g.fillRect(13, 13, 5, 1);
});
box(0.42, 0.34, 0.02, lam({ color: 0x2a1a10 }), -1.3, 1.5, -2.785);
const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), lam({ map: photoTex }));
photo.position.set(-1.3, 1.5, -2.773); scene.add(photo);

// CRT details: vents, front panel, power LED, antenna
box(0.4, 0.004, 0.25, lam({ color: 0x55585e }), 0.15, 1.057, -2.45);
box(0.7, 0.07, 0.01, lam({ color: 0x6c7076 }), 0.15, 0.545, -2.148);
box(0.015, 0.008, 0.005, basic({ color: 0xff3020 }), 0.42, 0.545, -2.142);
for (const a of [-0.5, 0.45]) { const r = cyl(0.004, 0.004, 0.45, 4, lam({ color: 0xb0b0b8 }), 0.15, 1.25, -2.5); r.rotation.z = a; }

// cables: controller -> console -> TV
function cable(points, color = 0x18181c) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 4), lam({ color })));
}
cable([[-0.42, TT + 0.016, 0.16], [-0.55, TT + 0.01, 0.0], [-0.66, 0.35, -0.25], [-0.6, 0.01, -0.9], [-0.45, 0.01, -1.9], [-0.42, 0.52, -2.2]]);
cable([[-0.1, 0.55, -2.45], [0.0, 0.5, -2.62], [0.1, 0.62, -2.68]], 0x22222a);

// game cases + VHS stack on stand, tower speaker
function spineTex(bg, fg, text) {
  return canvasTex(16, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.fillRect(0, 0, w, 10);
    g.save(); g.translate(11, 60); g.rotate(-Math.PI / 2); g.font = 'bold 8px Arial'; g.fillText(text, 0, 0); g.restore();
  });
}
const spines = [
  spineTex('#1a1a20', '#3a5aa8', 'METAL BOLT'), spineTex('#1a1a20', '#a83a3a', 'CHORE QUEST'),
  spineTex('#e8e8f0', '#3a3a3a', 'DUST RALLY'), spineTex('#1a1a20', '#3aa860', 'BROOM 64'),
  spineTex('#2a2a2a', '#d8b040', 'VHS'), spineTex('#2a2a2a', '#d8d8d8', 'VHS'),
];
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.19, 0.14), [lam({ map: spines[i % 4] }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 })]);
  m.position.set(-0.62 + i * 0.032, 0.6, -2.5); m.rotation.y = Math.PI / 2; scene.add(m);
}
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.025, 0.1), [lam({ color: 0x111111 }), lam({ color: 0x111111 }), lam({ color: 0x151515 }), lam({ color: 0x111111 }), lam({ map: spines[4 + (i % 2)] }), lam({ color: 0x111111 })]);
  m.position.set(-0.45, 0.06 + 0.026 * i + 0.25 * 0, -2.12); m.rotation.y = rnd(-0.15, 0.15); m.position.y = 0.013 + i * 0.026; scene.add(m);
}
const grille = canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = '#141416'; g.fillRect(0, 0, w, h);
  for (const [y, r] of [[18, 11], [46, 13]]) { g.fillStyle = '#2a2a30'; g.beginPath(); g.arc(16, y, r, 0, 7); g.fill(); g.fillStyle = '#0a0a0c'; g.beginPath(); g.arc(16, y, r * 0.45, 0, 7); g.fill(); }
  g.fillStyle = '#888'; g.font = '5px Arial'; g.fillText('JVB', 11, 6);
});
const spk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.3), [lam({ color: 0x1a1a1e }), lam({ color: 0x1a1a1e }), lam({ color: 0x1a1a1e }), lam({ color: 0x1a1a1e }), lam({ map: grille }), lam({ color: 0x1a1a1e })]);
spk.position.set(1.05, 0.375, -2.45); spk.rotation.y = -0.2; scene.add(spk);

// bookshelf on right wall full of games
box(0.32, 1.5, 1.0, darkWood, 2.82, 0.75, -1.5);
for (let s = 0; s < 4; s++) {
  box(0.3, 0.02, 0.96, lam({ color: 0x5a3a26 }), 2.8, 0.2 + s * 0.36, -1.5);
  for (let i = 0; i < 14; i++) {
    if (Math.random() < 0.15) continue;
    const hgt = rnd(0.17, 0.22);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, hgt, 0.03), [lam({ color: 0x1a1a20 }), lam({ map: spines[(i + s) % 6] }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 }), lam({ color: 0x1a1a20 })]);
    m.position.set(2.78, 0.21 + s * 0.36 + hgt / 2, -1.92 + i * 0.062); m.rotation.y = Math.PI; m.rotation.x = rnd(-0.08, 0.08); scene.add(m);
  }
}

// chip bag: "Byte's Classic RAM"
const bagTex = canvasTex(32, 48, (g, w, h) => {
  g.fillStyle = '#e8c030'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0202a'; g.beginPath(); g.arc(16, 18, 11, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 8px Arial'; g.fillText("BYTE'S", 2, 21);
  g.fillStyle = '#1f6b3a'; g.fillRect(8, 32, 16, 8); g.fillStyle = '#111'; g.font = 'bold 5px Arial'; g.fillText('CLASSIC RAM', 1, 46);
});
const bagGeo = new THREE.BoxGeometry(0.16, 0.22, 0.05, 2, 3, 1);
const bp = bagGeo.attributes.position;
for (let i = 0; i < bp.count; i++) { bp.setZ(i, bp.getZ(i) * (1 - Math.abs(bp.getY(i)) * 3.5) + rnd(-0.008, 0.008)); bp.setX(i, bp.getX(i) + rnd(-0.008, 0.008)); }
bagGeo.computeVertexNormals();
const bag = new THREE.Mesh(bagGeo, lam({ map: bagTex }));
bag.position.set(-0.25, TT + 0.03, -0.24); bag.rotation.set(-Math.PI / 2 + 0.15, 0, 0.6); scene.add(bag);
for (let i = 0; i < 5; i++) { const c = box(0.028, 0.005, 0.02, chipMat, -0.2 + rnd(-0.08, 0.1), TT + 0.003, -0.15 + rnd(-0.05, 0.08)); c.rotation.y = rnd(0, 6); }

// pizza box on the floor
const pizzaTex = canvasTex(48, 48, (g, w, h) => {
  g.fillStyle = '#c8a070'; g.fillRect(0, 0, w, h); noise(g, w, h, 200, ['#b89060', '#d8b080']);
  g.fillStyle = '#b02020'; g.beginPath(); g.arc(24, 22, 13, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 7px Arial'; g.fillText('PIZZA', 13, 25);
  g.fillStyle = 'rgba(90,50,20,0.5)'; g.beginPath(); g.ellipse(36, 38, 6, 4, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(10, 40, 4, 3, 0, 0, 7); g.fill();
});
const pz = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), [lam({ color: 0xb89060 }), lam({ color: 0xb89060 }), lam({ map: pizzaTex }), lam({ color: 0xa88050 }), lam({ color: 0xb89060 }), lam({ color: 0xb89060 })]);
pz.position.set(-1.25, 0.025, 0.7); pz.rotation.y = 0.5; scene.add(pz);

// side table with flip phone (owner texts will land here)
box(0.4, 0.04, 0.4, darkWood, 1.55, 0.5, 0.9);
box(0.04, 0.48, 0.04, darkWood, 1.55, 0.24, 0.9);
box(0.3, 0.02, 0.3, darkWood, 1.55, 0.01, 0.9);
const phone = new THREE.Group(); phone.position.set(1.5, 0.535, 0.88); phone.rotation.y = 0.4;
box(0.05, 0.012, 0.1, lam({ color: 0x9aa0a8 }), 0, 0, 0, phone);
box(0.035, 0.002, 0.04, basic({ color: 0x3a6a8a }), 0, 0.007, -0.02, phone);
scene.add(phone);
cyl(0.04, 0.035, 0.09, 7, lam({ color: 0xd8d0c0 }), 1.65, 0.565, 0.98); // mug

// plant by the window
const leafTex = canvasTex(16, 32, (g) => {
  g.fillStyle = '#2f5a2a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(8 + rnd(-3, 3), 4 + i * 5, 4, 3, rnd(-1, 1), 0, 7); g.fill(); }
  g.fillStyle = '#4a7a3a'; for (let i = 0; i < 4; i++) g.fillRect((rnd(3, 12)) | 0, (rnd(2, 30)) | 0, 2, 2);
});
cyl(0.12, 0.09, 0.22, 7, lam({ color: 0x9a4a2a }), -2.6, 0.11, -0.2);
const leafMat = lam({ map: leafTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
for (let i = 0; i < 4; i++) {
  const l = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), leafMat);
  l.position.set(-2.6, 0.55, -0.2); l.rotation.y = (i * Math.PI) / 4; l.rotation.z = rnd(-0.15, 0.15); scene.add(l);
}

// lamp light cone on the wall
const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.7, 1.1, 8, 1, true), basic({ color: 0xffc070, transparent: true, opacity: 0.03, depthWrite: false, side: THREE.DoubleSide }));
cone.position.set(-2.3, 2.0, -2.2); scene.add(cone);

// ---------- detail pass 2 ----------
// curtains on the window
const curtainTex = canvasTex(16, 32, (g, w, h) => {
  g.fillStyle = '#3a3a6a'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) { g.fillStyle = '#2a2a52'; g.fillRect(x, 0, 2, h); }
  noise(g, w, h, 60, ['#45457a', '#25254a']);
});
for (const dz of [-0.75, 0.75]) {
  const c = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.4, 3, 1), lam({ map: curtainTex, side: THREE.DoubleSide }));
  const cp = c.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 30) * 0.03);
  c.position.set(-2.93, 1.4, -1.0 + dz); c.rotation.y = Math.PI / 2; scene.add(c);
}
cyl(0.012, 0.012, 2.0, 5, lam({ color: 0x2a2a2a }), -2.93, 2.12, -1.0).rotation.x = Math.PI / 2;

// front door on the right wall (the owner comes through here)
const doorTex = canvasTex(32, 64, (g, w, h) => {
  g.fillStyle = '#d6d0c4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#bcb6aa'; for (const [x, y, ww, hh] of [[4, 4, 10, 24], [18, 4, 10, 24], [4, 34, 10, 26], [18, 34, 10, 26]]) { g.fillRect(x, y, ww, hh); g.fillStyle = '#e0dace'; g.fillRect(x + 1, y + 1, ww - 2, hh - 2); g.fillStyle = '#bcb6aa'; }
  noise(g, w, h, 80, ['#c8c2b6', '#e2dcd0']);
});
box(0.06, 2.1, 1.05, lam({ color: 0xc8c2bc }), 2.98, 1.05, 0.1);
const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), lam({ map: doorTex }));
door.position.set(2.94, 1.0, 0.1); door.rotation.y = -Math.PI / 2; scene.add(door);
const brass = lam({ color: 0xc8a040 });
cyl(0.025, 0.025, 0.05, 6, brass, 2.91, 1.0, 0.45).rotation.z = Math.PI / 2;
box(0.02, 0.05, 0.035, brass, 2.925, 1.15, 0.45);
cyl(0.008, 0.008, 0.02, 5, lam({ color: 0x111111 }), 2.93, 1.55, 0.1).rotation.z = Math.PI / 2;
const matTex = canvasTex(32, 16, (g, w, h) => { g.fillStyle = '#5a4630'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1e14'; g.font = 'bold 6px Arial'; g.fillText('GO AWAY', 3, 11); noise(g, w, h, 120, ['#4a3a26', '#6a5438']); });
const mat2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.7), lam({ map: matTex }));
mat2.rotation.set(-Math.PI / 2, 0, Math.PI / 2); mat2.position.set(2.65, 0.005, 0.1); scene.add(mat2);
// key hooks + light switch by the door
box(0.02, 0.06, 0.3, darkWood, 2.97, 1.45, -0.65);
for (let i = 0; i < 3; i++) box(0.04, 0.012, 0.012, brass, 2.95, 1.42, -0.75 + i * 0.1);
box(0.012, 0.1, 0.06, lam({ color: 0xe8e2d6 }), 2.975, 1.2, -0.55);

// stereo rack next to the TV with glowing displays
const lcdTex = (txt, col) => canvasTex(32, 8, (g) => { g.fillStyle = '#0a0c14'; g.fillRect(0, 0, 32, 8); g.fillStyle = col; g.font = 'bold 6px monospace'; g.fillText(txt, 2, 6); });
const rackX = -1.25, rackZ = -2.45;
box(0.5, 0.75, 0.38, lam({ color: 0x1a1a1e }), rackX, 0.375, rackZ);
const units = [['TUNER 98.7', '#6ab0ff'], ['CD  03 4:12', '#ff9a40'], ['AMP ||||| ', '#6ab0ff'], ['TAPE A  ', '#9aff9a']];
units.forEach(([t, c], i) => {
  const y = 0.12 + i * 0.17;
  box(0.46, 0.13, 0.02, lam({ color: 0x2a2a30 }), rackX, y, rackZ + 0.19);
  const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), basic({ map: lcdTex(t, c) })); d.position.set(rackX - 0.06, y + 0.01, rackZ + 0.202); scene.add(d);
  cyl(0.025, 0.025, 0.02, 8, lam({ color: 0x55555c }), rackX + 0.15, y, rackZ + 0.205).rotation.x = Math.PI / 2;
});
const rackGlow = new THREE.PointLight(0x6a9aff, 0.6, 1.5, 1); rackGlow.position.set(rackX, 0.5, rackZ + 0.5); scene.add(rackGlow);

// wall shelf with CDs, a robot figure and trailing ivy
box(0.9, 0.03, 0.18, darkWood, -0.55, 1.75, -2.7);
for (let i = 0; i < 9; i++) box(0.012, 0.13, 0.13, lam({ color: [0x2a4a8a, 0xd8d0c0, 0x8a2a2a, 0x1a1a1a, 0x4a8a5a][i % 5] }), -0.95 + i * 0.016, 1.83, -2.7);
box(0.06, 0.08, 0.05, lam({ color: 0xc8a040 }), -0.6, 1.805, -2.7);
box(0.05, 0.05, 0.04, lam({ color: 0xc8a040 }), -0.6, 1.87, -2.7);
cyl(0.06, 0.045, 0.1, 7, lam({ color: 0xd8d0c0 }), -0.2, 1.815, -2.7);
const ivyTex = canvasTex(16, 64, (g) => {
  for (let i = 0; i < 26; i++) { g.fillStyle = ['#2f5a2a', '#3e6e34', '#24461f'][i % 3]; g.beginPath(); g.ellipse(8 + Math.sin(i) * 4, 2 + i * 2.4, 3, 2, i, 0, 7); g.fill(); }
});
for (const dx of [-0.25, -0.17, -0.12]) {
  const v = new THREE.Mesh(new THREE.PlaneGeometry(0.12, rnd(0.5, 0.8)), lam({ map: ivyTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  v.position.set(dx, 1.5, -2.61); scene.add(v);
}

// calendar
const calTex = canvasTex(24, 32, (g) => {
  g.fillStyle = '#eee8dc'; g.fillRect(0, 0, 24, 32); g.fillStyle = '#c0302a'; g.fillRect(0, 0, 24, 12);
  g.fillStyle = '#fff'; g.font = 'bold 5px Arial'; g.fillText('NOV', 7, 8);
  g.fillStyle = '#888'; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) g.fillRect(2 + c * 3.6, 15 + r * 4, 2, 2);
  g.fillStyle = '#c0302a'; g.fillRect(12, 22, 4, 3);
});
const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32), lam({ map: calTex })); cal.position.set(2.975, 1.4, -0.35); cal.rotation.y = -Math.PI / 2; scene.add(cal);

// laundry pile + sneakers
const hoodie = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), lam({ color: 0x4a5a3a })); hoodie.scale.set(1.3, 0.35, 1); hoodie.position.set(1.9, 0.06, -0.6); scene.add(hoodie);
const shirt = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), lam({ color: 0x7a2a2a })); shirt.scale.set(1.4, 0.3, 1); shirt.position.set(2.05, 0.1, -0.5); scene.add(shirt);
for (const [x, z, r] of [[2.4, 0.55, 0.3], [2.5, 0.7, -0.2]]) {
  const sh = new THREE.Group(); sh.position.set(x, 0, z); sh.rotation.y = r;
  box(0.1, 0.05, 0.26, lam({ color: 0xe8e4dc }), 0, 0.035, 0, sh); box(0.11, 0.02, 0.28, lam({ color: 0x3a3a40 }), 0, 0.01, 0, sh); box(0.08, 0.04, 0.08, lam({ color: 0xc03030 }), 0, 0.07, 0.07, sh);
  scene.add(sh);
}

// alarm clock on the side table (mirrors the HUD time)
const tclk = canvasTex(48, 20, () => {});
function drawTableClock(h, m, pm) {
  const g = tclk.userData.ctx; g.fillStyle = '#0a0606'; g.fillRect(0, 0, 48, 20);
  g.fillStyle = '#ff2a1a'; g.font = 'bold 13px monospace';
  g.fillText(`${String(h).padStart(2, ' ')}:${String(m).padStart(2, '0')}`, 3, 15);
  if (pm) g.fillRect(44, 4, 2, 2);
  tclk.needsUpdate = true;
}
const ac = new THREE.Group(); ac.position.set(1.62, 0.56, 0.82); ac.rotation.y = -0.6;
box(0.17, 0.08, 0.08, lam({ color: 0x1a1a1c }), 0, 0, 0, ac);
const acFace = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.055), basic({ map: tclk })); acFace.position.set(0, 0, 0.041); ac.add(acFace);
box(0.06, 0.012, 0.03, lam({ color: 0x3a3a3e }), -0.04, 0.045, 0, ac);
scene.add(ac);
const acGlow = new THREE.PointLight(0xff2a1a, 0.3, 0.7, 1); acGlow.position.set(1.6, 0.6, 0.95); scene.add(acGlow);

// ---------- detail pass 3 ----------
// ceiling + light fixture
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(7, 7, 7, 7), lam({ map: stucco('#6e6a78', ['#625e6c', '#7a7684'], [7, 7]) }));
ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3, -0.5); ceil.userData.noCast = true; scene.add(ceil);
cyl(0.25, 0.18, 0.08, 8, lam({ color: 0xd8d0c0 }), 0, 2.96, -0.4).userData.noCast = true;

// smoke detector (blinks) + thermostat
cyl(0.08, 0.08, 0.035, 8, lam({ color: 0xe8e4dc }), 1.9, 2.98, -1.6).userData.noCast = true;
const smokeLed = box(0.012, 0.006, 0.012, basic({ color: 0xff2020 }), 1.93, 2.955, -1.58);
box(0.1, 0.13, 0.025, lam({ color: 0xe0dace }), -2.985, 1.45, 0.6).rotation.y = Math.PI / 2;
box(0.05, 0.02, 0.005, basic({ color: 0x9aff9a }), -2.97, 1.48, 0.6).rotation.y = Math.PI / 2;

// window sill with empty bottles
box(0.12, 0.03, 1.4, lam({ color: 0xc8c2bc }), -2.93, 1.03, -1.0);
const bottle = lam({ color: 0x3a6a2a, emissive: 0x0a1a08 });
for (const z of [-1.4, -1.32, -0.6]) { cyl(0.025, 0.03, 0.18, 6, bottle, -2.92, 1.135, z); cyl(0.01, 0.015, 0.06, 5, bottle, -2.92, 1.25, z); }

// couch cushions, pillows, throw blanket, remote
const fab2 = lam({ map: fabric, color: 0xd09080 });
for (const x of [-0.7, 0, 0.7]) box(0.68, 0.1, 0.78, fab2, x, 0.55, 1.55).rotation.z = rnd(-0.03, 0.03);
for (const [x, r] of [[-0.85, 0.3], [0.9, -0.25]]) { const pl = box(0.4, 0.34, 0.12, lam({ color: 0x3a4a7a }), x, 0.8, 1.82); pl.rotation.set(-0.3, r, r * 0.5); }
const plaidTex = canvasTex(32, 32, (g, w, h) => {
  g.fillStyle = '#2f4a3a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 8) { g.fillStyle = 'rgba(200,170,90,0.6)'; g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); g.fillStyle = 'rgba(120,30,30,0.5)'; g.fillRect(i + 4, 0, 1, h); g.fillRect(0, i + 4, w, 1); }
});
const throwGeo = new THREE.PlaneGeometry(0.7, 0.9, 6, 6);
const tp = throwGeo.attributes.position;
for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setZ(i, (y < 0 ? y * y * -1.6 : 0) + rnd(-0.015, 0.015)); }
throwGeo.computeVertexNormals();
const blanket = new THREE.Mesh(throwGeo, lam({ map: plaidTex, side: THREE.DoubleSide }));
blanket.rotation.set(-Math.PI / 2, 0, 0.2); blanket.position.set(1.15, 0.78, 1.45); scene.add(blanket);
const remote = new THREE.Group(); remote.position.set(0.3, 0.615, 1.4); remote.rotation.y = 0.7;
box(0.045, 0.018, 0.17, lam({ color: 0x1e1e22 }), 0, 0, 0, remote);
for (let i = 0; i < 6; i++) box(0.008, 0.004, 0.008, lam({ color: [0xc03030, 0x888888, 0x888888][i % 3] }), -0.01 + (i % 2) * 0.02, 0.011, -0.05 + Math.floor(i / 2) * 0.03, remote);
scene.add(remote);

// coffee table extras: Bot Guide magazine, lighter, half-eaten battery, receipts
const guideTex = canvasTex(32, 40, (g, w, h) => {
  g.fillStyle = '#f0ece0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0202a'; g.fillRect(2, 2, 28, 9);
  g.fillStyle = '#fff'; g.font = 'bold 7px Arial'; g.fillText('BOT', 4, 9); g.fillText('GUIDE', 4, 9 + 0); g.fillStyle = '#c0202a'; g.fillRect(2, 2, 28, 9);
  g.fillStyle = '#fff'; g.fillText('BOT GUIDE', 3, 9);
  g.fillStyle = '#4fb0b8'; g.fillRect(8, 14, 16, 16); g.fillStyle = '#ffe066'; g.fillRect(12, 19, 2, 2); g.fillRect(18, 19, 2, 2);
  g.fillStyle = '#222'; g.font = '4px Arial'; g.fillText('10 WAYS TO HIDE', 1, 35); g.fillText('A MESS FAST', 4, 39);
});
const mag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.26), [lam({ color: 0xe8e4d8 }), lam({ color: 0xe8e4d8 }), lam({ map: guideTex }), lam({ color: 0xe8e4d8 }), lam({ color: 0xe8e4d8 }), lam({ color: 0xe8e4d8 })]);
mag.position.set(-0.5, TT + 0.004, -0.08); mag.rotation.y = 0.5; scene.add(mag);
box(0.02, 0.06, 0.012, lam({ color: 0x9a4ad8 }), 0.27, TT + 0.006, 0.2).rotation.set(Math.PI / 2, 0, 0.9);
const batt = new THREE.Group(); batt.position.set(-0.05, TT + 0.012, -0.05); batt.rotation.set(0, 0.8, Math.PI / 2);
cyl(0.012, 0.012, 0.035, 6, lam({ color: 0x1a1a1a }), 0, 0, 0, batt); cyl(0.012, 0.012, 0.012, 6, lam({ color: 0xd8a020 }), 0, 0.023, 0, batt);
cyl(0.004, 0.004, 0.005, 5, lam({ color: 0xc0c0c0 }), 0, 0.031, 0, batt); scene.add(batt);
for (let i = 0; i < 3; i++) { const r = box(0.06, 0.002, 0.11, lam({ color: 0xece8de }), rnd(-0.5, 0.5), TT + 0.002 + i * 0.001, rnd(-0.25, 0.28)); r.rotation.y = rnd(0, 6); }

// overflowing trash can + crumpled paper
cyl(0.16, 0.13, 0.38, 8, lam({ color: 0x5a5e66 }), -1.75, 0.19, 1.1);
for (let i = 0; i < 4; i++) { const c = can(redVolt, -1.75 + rnd(-0.08, 0.08), 1.1 + rnd(-0.08, 0.08), true); c.position.y = 0.4 + i * 0.03; }
const paper = lam({ color: 0xe8e4dc });
for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), paper); b.position.set(-1.75 + rnd(-0.5, 0.5), 0.03, 1.1 + rnd(-0.6, 0.2)); b.rotation.set(rnd(0, 6), rnd(0, 6), 0); scene.add(b); }

// power strip behind the stand
const strip = new THREE.Group(); strip.position.set(0.7, 0.02, -2.68);
box(0.36, 0.035, 0.07, lam({ color: 0xe8e4dc }), 0, 0, 0, strip);
box(0.02, 0.01, 0.02, basic({ color: 0xff3020 }), 0.16, 0.022, 0, strip);
for (let i = 0; i < 4; i++) box(0.035, 0.04, 0.03, lam({ color: 0x18181c }), -0.13 + i * 0.07, 0.035, 0, strip);
scene.add(strip);
cable([[0.88, 0.02, -2.68], [1.4, 0.01, -2.5], [2.1, 0.01, -2.6], [2.35, 0.05, -2.7]]);

// robot charging dock in the corner (Unit 7's bed)
const dockTex = canvasTex(24, 48, (g, w, h) => {
  g.fillStyle = '#2a2e36'; g.fillRect(0, 0, w, h); g.fillStyle = '#4fb0b8'; g.fillRect(2, 2, 20, 6);
  g.fillStyle = '#0a0c10'; g.font = 'bold 5px Arial'; g.fillText('UNIT 7', 3, 7);
  for (let i = 0; i < 5; i++) { g.fillStyle = i < 2 ? '#40ff60' : '#103a18'; g.fillRect(9, 14 + i * 6, 6, 4); }
  g.fillStyle = '#888'; g.fillRect(4, 44, 16, 1);
});
const dock = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.06), [lam({ color: 0x2a2e36 }), lam({ color: 0x2a2e36 }), lam({ color: 0x2a2e36 }), lam({ color: 0x2a2e36 }), lam({ map: dockTex, emissive: 0x111418 }), lam({ color: 0x2a2e36 })]);
dock.position.set(2.45, 0.55, -2.75); scene.add(dock);
box(0.6, 0.04, 0.5, lam({ color: 0x3a3e46 }), 2.45, 0.02, -2.5);
const dockGlow = new THREE.PointLight(0x40ff60, 0.5, 1.2, 1); dockGlow.position.set(2.45, 0.6, -2.55); scene.add(dockGlow);

// ---------- shadows ----------
const noShadow = new Set([floor, back, left, right, rug, cone, screen, win]);
scene.traverse((o) => {
  if (!o.isMesh) return;
  o.receiveShadow = true;
  let inHand = false; for (let p = o; p; p = p.parent) if (p === hand) inHand = true;
  o.castShadow = !inHand && !noShadow.has(o) && !o.userData.noCast && !(o.material.transparent);
  if (inHand) o.receiveShadow = false;
});

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x30305a, 1.3));
const moon = new THREE.DirectionalLight(0x6a78ff, 0.9); moon.position.set(-6, 3, -1); moon.target.position.set(1, 0, -0.5); scene.add(moon); scene.add(moon.target);
const lamp = new THREE.PointLight(0xffb060, 4.2, 7, 1); lamp.position.set(-2.3, 1.28, -2.2); scene.add(lamp);
lamp.castShadow = true; lamp.shadow.mapSize.set(256, 256); lamp.shadow.bias = -0.002; lamp.shadow.normalBias = 0.03; lamp.shadow.camera.near = 0.15;
moon.castShadow = true; moon.shadow.mapSize.set(512, 512); moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.03;
Object.assign(moon.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 16 });
const tvLight = new THREE.PointLight(0x60ffd0, 2.2, 4, 1); tvLight.position.set(0.12, 0.85, -1.8); scene.add(tvLight);

const emberLight = new THREE.PointLight(0xff7030, 0.25, 0.6, 1); scene.add(emberLight);
const head = new THREE.SpotLight(0xfff0d0, 0, 14, 0.28, 0.5, 0.5); head.position.set(-6, 1.3, -1.0); scene.add(head); scene.add(head.target);

// ---------- camera shots ----------
const shots = [
  { pos: [0.3, 1.05, 1.25], look: [-0.02, 0.55, -0.9], hand: true },   // couch POV
  { pos: [0.62, 0.6, 0.42], look: [0.06, 0.48, -0.02], hand: false },  // ashtray close-up
  { pos: [2.5, 2.2, 1.9], look: [-0.5, 0.5, -1.0], hand: false },      // wide corner
  { pos: [-0.9, 0.62, -1.2], look: [0.15, 0.8, -2.3], hand: false },   // TV close
  { pos: [0.2, 1.25, 0.9], look: [2.9, 1.0, 0.0], hand: false },       // front door
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

// ---------- clock (90s LED alarm clock) ----------
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
const SEG_PTS = {
  a: '3,1 17,1 14,4 6,4', b: '18,2 18,17 15,15 15,5', c: '18,19 18,34 15,31 15,21',
  d: '3,35 17,35 14,32 6,32', e: '2,19 2,34 5,31 5,21', f: '2,2 2,17 5,15 5,5', g: '3,18 6,16 14,16 17,18 14,20 6,20',
};
function digitSVG(n, blank) {
  const on = blank ? '' : SEG[n];
  return `<svg viewBox="0 0 20 36" class="dg">` + Object.entries(SEG_PTS).map(([k, pts]) =>
    `<polygon points="${pts}" class="${on.includes(k) ? 'on' : 'off'}"/>`).join('') + `</svg>`;
}
const digitsEl = document.getElementById('digits'), pmEl = document.getElementById('pm'), colonEl = document.getElementById('colon');
let mins = 23 * 60 + 52;
function renderClock() {
  const h24 = Math.floor(mins / 60), m = mins % 60, h = h24 % 12 || 12;
  digitsEl.querySelector('.h').innerHTML = digitSVG(Math.floor(h / 10), h < 10) + digitSVG(h % 10);
  digitsEl.querySelector('.m').innerHTML = digitSVG(Math.floor(m / 10)) + digitSVG(m % 10);
  pmEl.classList.toggle('lit', h24 >= 12);
  drawTableClock(h, m, h24 >= 12);
}
setInterval(() => { mins = (mins + 1) % (24 * 60); renderClock(); }, 1500);
setInterval(() => colonEl.classList.toggle('dim'), 750);
renderClock();

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

  smokeLed.visible = (t % 4) < 0.15;

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
