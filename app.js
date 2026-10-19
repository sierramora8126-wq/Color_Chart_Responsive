/* ==========================================================================
   ALLIED S&T COLOR SELECTOR  -  V4.1
   Three.js r128 · modelo 3D de edificio metálico con todas las condiciones
   de color: roof, wall, wainscot, corner, eave, rake, ridge, base, jamb,
   head, gutter, downspout, canopy y parapet (edificio opcional aparte).
   Unidades: 1 unidad = 1 pie (ft).
   Convención de paredes: cada pared se construye en un marco local donde
   x = a lo largo de la pared, y = altura, z = hacia afuera (cara exterior z=0).
   ========================================================================== */
(function () {
'use strict';

const canvas = document.getElementById('canvas');
const viewer = document.querySelector('.viewer');

let catalog, colors = {}, defaults = {};
let seamsOn = true, labelsOn = true;
const materials = {};

const st = {canopy: false, leanto: false, parapet: false, wain: false, wtrim: true, pside: 'left', liner: 'none', lh: 'full', lbase: true, lcap: true, cut: true};
const linerOn = k => st.liner === 'both' || st.liner === k;     // liner: none | wall | roof | both
const linerPartial = () => linerOn('wall') && st.lh !== 'full';      // liner de pared con altura seleccionada
const NA = 'NA', PH = 3.5;                         // PH = altura del parapet sobre el alero
const isNA = k => colors[k] === NA;
const componentDefs = [
  {key:'roof',         name:'Roof Panels',        desc:'Main gable roof', na:false},
  {key:'wall',         name:'Wall Panels',        desc:'Exterior wall panels', na:false},
  {key:'wainscot',     name:'Wainscot Panel',     desc:'Lower wall panels', na:false, show:() => st.wain},
  {key:'wainscottrim', name:'Wainscot Trim',      desc:'Cap flashing at wainscot', show:() => st.wain && st.wtrim},
  {key:'linerwall',    name:'Liner Panel - Wall', desc:'Interior wall liner', na:false, show:() => linerOn('wall')},
  {key:'linerroof',    name:'Liner Panel - Roof', desc:'Interior roof liner', na:false, show:() => linerOn('roof')},
  {key:'linerbase',    name:'Liner Base Trim',    desc:'Base of partial-height liner', na:false, show:() => linerPartial() && st.lbase},
  {key:'linercap',     name:'Liner Cap Trim',     desc:'Top of partial-height liner', na:false, show:() => linerPartial() && st.lcap},
  {key:'corner',       name:'Corner Trim',        desc:'Outside corners'},
  {key:'eave',         name:'Eave Trim',          desc:'Eave fascia'},
  {key:'rake',         name:'Rake Trim',          desc:'Gable rake'},
  {key:'ridge',        name:'Ridge Cap',          desc:'Main ridge'},
  {key:'base',         name:'Base Trim',          desc:'Wall base'},
  {key:'fo',           name:'F.O. Trims',         desc:'Frame openings: jambs, heads, sills'},
  {key:'gutter',       name:'Gutter',             desc:'Eave gutter'},
  {key:'downspout',    name:'Downspout',          desc:'Vertical drainage'},
  {key:'canopy',       name:'Canopy Roof',        desc:'Front entry canopy', na:false, show:() => st.canopy},
  {key:'leanto',       name:'Lean-To Roof',       desc:'Side annex roof', na:false, show:() => st.leanto},
  {key:'parapet',      name:'Parapet Cap',        desc:'Coping at sidewall parapet', na:false, show:() => st.parapet},
  {key:'parapetback',  name:'Parapet Back Panel', desc:'Inside face of parapet', na:false, show:() => st.parapet}
];

/* ------------------------------------------------------------------ */
/* Renderer / scene / camera                                           */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;       // colores fieles (sin tone mapping)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const col = hex => new THREE.Color(hex).convertSRGBToLinear();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(col('#e4ecee'), 170, 540);

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 25;
controls.maxDistance = 240;
controls.maxPolarAngle = Math.PI * 0.485;
controls.screenSpacePanning = true;

/* ---- Cielo (domo con degradado) ---- */
(function sky() {
  const R = 600, geo = new THREE.SphereGeometry(R, 32, 24);
  const pos = geo.attributes.position, arr = new Float32Array(pos.count * 3);
  const top = col('#8fb7dc'), hor = col('#e4ecee');
  for (let i = 0; i < pos.count; i++) {
    const t = Math.pow(Math.max(0, pos.getY(i) / R), 0.5);
    const c = hor.clone().lerp(top, t);
    arr[i*3] = c.r; arr[i*3+1] = c.g; arr[i*3+2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, fog:false, depthWrite:false}));
  m.renderOrder = -10;
  scene.add(m);
})();

/* ---- Luces ---- */
scene.add(new THREE.HemisphereLight(0xffffff, col('#d9d4c6'), 0.62));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(-10 + 62*1.0, 62, 10 + 48);
sun.target.position.set(-10, 0, 10);
sun.castShadow = true;
const shadowSize = Math.min(window.matchMedia('(pointer:coarse)').matches ? 2048 : 4096, renderer.capabilities.maxTextureSize);
sun.shadow.mapSize.set(shadowSize, shadowSize);
Object.assign(sun.shadow.camera, {left:-105, right:105, top:105, bottom:-105, near:5, far:320});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.25);
fill.position.set(-60, 35, -55);
scene.add(fill);

/* ------------------------------------------------------------------ */
/* Texturas procedurales (costillas de panel / standing seam)         */
/* ------------------------------------------------------------------ */
const texCache = {};
function getPanelTex(type, seams) {
  const k = type + (seams ? '1' : '0');
  if (texCache[k]) return texCache[k];
  const S = 256;
  const cm = document.createElement('canvas'), cb = document.createElement('canvas');
  cm.width = cm.height = cb.width = cb.height = S;
  const g = cm.getContext('2d'), b = cb.getContext('2d');
  [g, b].forEach(ctx => {
    if (type === 'roof') { ctx.translate(S/2, S/2); ctx.rotate(Math.PI/2); ctx.translate(-S/2, -S/2); }
  });
  const stops = (gr, arr) => { arr.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  if (type === 'wall') {
    const p = S / 3;                           // 3 costillas por tile de 3 ft
    g.fillStyle = '#ededed'; g.fillRect(0, 0, S, S);
    b.fillStyle = '#000';    b.fillRect(0, 0, S, S);
    for (let i = 0; i < 3; i++) {
      const x = i * p;
      g.fillStyle = stops(g.createLinearGradient(x, 0, x + p, 0),
        [[0,'#ededed'],[.28,'#ededed'],[.40,'#fafafa'],[.50,'#ffffff'],[.60,'#dcdcdc'],[.72,'#ededed'],[1,'#ededed']]);
      g.fillRect(x, 0, p, S);
      b.fillStyle = stops(b.createLinearGradient(x, 0, x + p, 0),
        [[0,'#000'],[.30,'#000'],[.42,'#fff'],[.58,'#fff'],[.70,'#000'],[1,'#000']]);
      b.fillRect(x, 0, p, S);
    }
    if (seams) {                               // junta entre paneles
      g.fillStyle = '#8b9296'; g.fillRect(0, 0, 2.5, S); g.fillRect(S - 2.5, 0, 2.5, S);
      b.fillStyle = '#000';    b.fillRect(0, 0, 2.5, S); b.fillRect(S - 2.5, 0, 2.5, S);
    }
  } else {                                     // roof: standing seam cada 2 ft
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
    b.fillStyle = '#000';    b.fillRect(0, 0, S, S);
    if (seams) {
      [S*0.33, S*0.66].forEach(x => {          // estrías de la lámina
        g.fillStyle = '#e3e3e3'; g.fillRect(x, 0, 3, S);
        b.fillStyle = '#1a1a1a'; b.fillRect(x, 0, 3, S);
      });
      g.fillStyle = stops(g.createLinearGradient(S - 10, 0, S, 0), [[0,'#ffffff'],[1,'#c9c9c9']]);
      g.fillRect(S - 10, 0, 10, S);
      g.fillStyle = stops(g.createLinearGradient(0, 0, 10, 0), [[0,'#b9b9b9'],[1,'#f6f6f6']]);
      g.fillRect(0, 0, 10, S);
      b.fillStyle = stops(b.createLinearGradient(S - 10, 0, S, 0), [[0,'#fff'],[1,'#888']]);
      b.fillRect(S - 10, 0, 10, S);
      b.fillStyle = stops(b.createLinearGradient(0, 0, 10, 0), [[0,'#888'],[1,'#fff']]);
      b.fillRect(0, 0, 10, S);
    }
  }
  const map = new THREE.CanvasTexture(cm), bump = new THREE.CanvasTexture(cb);
  const tile = type === 'wall' ? 3 : 2;
  [map, bump].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    t.repeat.set(1 / tile, 1 / tile);
  });
  return (texCache[k] = {map, bump});
}

let _doorTex, _doorMat;
function doorTexture() {
  if (_doorTex) return _doorTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e9e9'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#9aa1a4'; g.fillRect(0, 250, 512, 6);          // junta entre secciones
  [[24, 28], [280, 28]].forEach(([x, y]) => {
    g.fillStyle = '#dde1e1'; g.fillRect(x, y, 208, 190);
    g.strokeStyle = '#c4cacc'; g.lineWidth = 4; g.strokeRect(x, y, 208, 190);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.repeat.set(1/4, 1/2);
  return (_doorTex = t);
}

/* ------------------------------------------------------------------ */
/* Materiales                                                          */
/* ------------------------------------------------------------------ */
const PANEL_KEYS = ['roof', 'wall', 'wainscot', 'canopy', 'leanto', 'parapetback', 'linerwall', 'linerroof'];
function M(key) {
  if (materials[key]) return materials[key];
  const isPanel = PANEL_KEYS.includes(key);
  const roofLike = ['roof', 'canopy', 'leanto', 'linerroof'].includes(key);
  const m = new THREE.MeshStandardMaterial({
    color: col(colors[key] || defaults[key] || '#cccccc'),
    roughness: isPanel ? (roofLike ? 0.42 : 0.55) : 0.4,
    metalness: isPanel ? 0.06 : 0.12
  });
  m.userData.key = key;
  if (isPanel) {
    m.userData.ptype = roofLike ? 'roof' : 'wall';
    m.bumpScale = roofLike ? 0.06 : 0.05;
    applyTex(m);
  }
  return (materials[key] = m);
}
function applyTex(m) {
  const t = getPanelTex(m.userData.ptype, seamsOn);
  m.map = t.map; m.bumpMap = t.bump; m.needsUpdate = true;
}
const neutralCache = {};
function N(hex, rough = 0.6, metal = 0.1) {
  const k = hex + rough + metal;
  return neutralCache[k] || (neutralCache[k] = new THREE.MeshStandardMaterial({color: col(hex), roughness: rough, metalness: metal}));
}
const glassMat = new THREE.MeshStandardMaterial({color: col('#7fa3b8'), roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.5, depthWrite: false});
componentDefs.forEach(d => M(d.key));              // crea todos los materiales

function highlight(key, on) {
  const m = materials[key]; if (!m) return;
  m.emissive.set(on ? 0x3b6fd6 : 0x000000);
  m.emissiveIntensity = on ? 0.38 : 0;
}

/* ------------------------------------------------------------------ */
/* Helpers de geometría                                                */
/* ------------------------------------------------------------------ */
function boxUV(g, off) {
  const o = off || [0, 0, 0];
  g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - bb.min.x + o[0], y = p.getY(i) - bb.min.y + o[1], z = p.getZ(i) - bb.min.z + o[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az)        uv.setXY(i, z, y);
    else                      uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}
function box(w, h, d, m, x, y, z, parent, uvOff, noShadow) {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g, uvOff);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = !noShadow; mesh.receiveShadow = true;
  if (m.userData && m.userData.key) mesh.userData.key = m.userData.key;
  parent.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Dimensiones                                                         */
/* ------------------------------------------------------------------ */
const W = 42, L = 60, EAVE = 16, PITCH = 1/3;            // 4:12
const THETA = Math.atan(PITCH), COS = Math.cos(THETA), SIN = Math.sin(THETA);
const HALF = W / 2, RISE = HALF * PITCH;
const T = 0.14;               // espesor lámina de techo
const WALL_T = 0.2;           // espesor pared
const WAIN = 4;               // altura wainscot
const OH = 1.2;               // alero / rake overhang
const RIDGE0 = EAVE + RISE + T / COS;

const main = new THREE.Group();            scene.add(main);
const seamlessTargets = [];                // (reservado)

/* ------------------------------------------------------------------ */
/* Terreno                                                             */
/* ------------------------------------------------------------------ */
(function ground() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 205 + Math.floor(Math.random() * 50);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 90); t.anisotropy = maxAniso;
  const m = new THREE.Mesh(new THREE.CircleGeometry(580, 64),
    new THREE.MeshStandardMaterial({color: col('#8ea77a'), roughness: 1, map: t}));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; scene.add(m);

  const concrete = N('#b9bcba', 0.92, 0), asphalt = N('#4c5256', 0.95, 0), walk = N('#c6c8c5', 0.9, 0);
  box(W + 10, 0.08, L + 10, concrete, 0, 0.04, 0, scene, null, true);          // losa perimetral
  box(W + 10, 0.05, 30, asphalt, 0, 0.025, L/2 + 5 + 14.9, scene, null, true); // estacionamiento
  box(16.5, 0.12, 12.5, walk, 9, 0.06, L/2 + 6, scene, null, true);            // acera de entrada
  // líneas de estacionamiento
  for (let i = 0; i < 7; i++) box(0.3, 0.02, 10, N('#e9e9e4', 0.9, 0), -15 + i * 5, 0.06, L/2 + 22, scene, null, true);
})();

function tree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.75 * s, 5 * s, 8), N('#6d5440', 1, 0));
  trunk.position.y = 2.5 * s; trunk.castShadow = true; g.add(trunk);
  [[0, 8.2, 0, 4.6], [1.6, 6.8, 0.8, 3.4], [-1.5, 7, -0.6, 3.5]].forEach(([a, b, c, r], i) => {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), N(i ? '#4f7a45' : '#5b8a4e', 1, 0));
    f.position.set(a * s, b * s, c * s); f.castShadow = true; f.receiveShadow = true; g.add(f);
  });
}
[[-34,-52,1.1],[12,-58,1],[52,-42,1.2],[62,18,1],[-76,-12,1.1],[-78,34,1],[78,60,0.9],[-60,-45,1]].forEach(t => tree(...t));

/* ------------------------------------------------------------------ */
/* Trims de esquina (perfil en L extruido)                             */
/* ------------------------------------------------------------------ */
function cornerTrim(cx, cz, sx, sz, h, parent) {
  if (isNA('corner')) return;
  const t = 0.16, w = 0.55;
  const pts = [[cx - sx*w, cz], [cx - sx*w, cz + sz*t], [cx + sx*t, cz + sz*t], [cx + sx*t, cz - sz*w], [cx, cz - sz*w], [cx, cz]];
  const s = new THREE.Shape();
  pts.forEach((p, i) => i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1]));
  const geo = new THREE.ExtrudeGeometry(s, {depth: h, bevelEnabled: false});
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, M('corner'));
  m.castShadow = true; m.receiveShadow = true; m.userData.key = 'corner';
  parent.add(m);
}

/* ------------------------------------------------------------------ */
/* Puertas, ventanas, louvers (marco local de pared)                   */
/* ------------------------------------------------------------------ */
function trimOpening(g, o) {
  if (isNA('fo')) return;
  const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  box(0.45, h, 0.2, M('fo'), o.x0 - 0.225, cy, 0.05, g);
  box(0.45, h, 0.2, M('fo'), o.x1 + 0.225, cy, 0.05, g);
  box(w + 0.9, 0.45, 0.2, M('fo'), cx, o.y1 + 0.225, 0.05, g);
  if (o.y0 > 0.01) box(w + 0.9, 0.35, 0.2, M('fo'), cx, o.y0 - 0.175, 0.05, g);   // sill
}
function overheadDoor(g, o) {
  const w = o.x1 - o.x0, h = o.y1, cx = (o.x0 + o.x1) / 2;
  const dm = _doorMat || (_doorMat = new THREE.MeshStandardMaterial({map: doorTexture(), color: 0xffffff, roughness: 0.6, metalness: 0.05}));
  box(w, h, 0.12, dm, cx, h / 2, -0.14, g, [0, 0, 0]);
  box(w, 0.12, 0.16, N('#2b3238'), cx, h - 0.06, -0.12, g);
  box(w, 0.1, 0.16, N('#2b3238'), cx, 0.05, -0.12, g);
}
function walkDoor(g, o) {
  const w = o.x1 - o.x0, h = o.y1, cx = (o.x0 + o.x1) / 2;
  box(w, h, 0.1, N('#46515a', 0.5, 0.2), cx, h / 2, -0.12, g);
  box(w * 0.55, h * 0.28, 0.02, glassMat, cx, h * 0.68, -0.065, g, null, true);
  box(w * 0.55 + 0.12, h * 0.28 + 0.12, 0.03, N('#2b3238'), cx, h * 0.68, -0.075, g);
  box(0.1, 0.4, 0.14, N('#c8ccd0', 0.3, 0.8), cx + w / 2 - 0.35, h * 0.46, -0.03, g);
}
function windowUnit(g, o) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  const fr = N('#d3d7da', 0.5, 0.2), f = 0.16;
  box(w, h, 0.02, N('#1b2328'), cx, cy, -0.17, g);
  box(w - 0.2, h - 0.2, 0.03, glassMat, cx, cy, -0.1, g, null, true);
  box(f, h, 0.1, fr, o.x0 + f / 2, cy, -0.08, g);
  box(f, h, 0.1, fr, o.x1 - f / 2, cy, -0.08, g);
  box(w, f, 0.1, fr, cx, o.y1 - f / 2, -0.08, g);
  box(w, f, 0.1, fr, cx, o.y0 + f / 2, -0.08, g);
  if (w > 4) box(f * 0.8, h, 0.1, fr, cx, cy, -0.08, g);
  if (h > 3) box(w, f * 0.8, 0.1, fr, cx, cy, -0.08, g);
}
function louver(g, o) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  box(w, h, 0.02, N('#1b2328'), cx, cy, -0.17, g);
  for (let i = 0; i < 5; i++) {
    const s = box(w - 0.3, 0.12, 0.2, N('#dfe2e4', 0.5, 0.2), cx, o.y0 + 0.3 + i * (h - 0.6) / 4, -0.08, g);
    s.rotation.x = 0.55;
  }
  const fr = N('#d3d7da', 0.5, 0.2);
  box(w, 0.15, 0.12, fr, cx, o.y1 - 0.075, -0.06, g); box(w, 0.15, 0.12, fr, cx, o.y0 + 0.075, -0.06, g);
  box(0.15, h, 0.12, fr, o.x0 + 0.075, cy, -0.06, g); box(0.15, h, 0.12, fr, o.x1 - 0.075, cy, -0.06, g);
}

/* ------------------------------------------------------------------ */
/* Pared: panel superior + wainscot + base + aberturas                  */
/* ------------------------------------------------------------------ */
function buildWall(len, top, openings, parent, para, isMain) {
  const WY = st.wain ? WAIN : 0;
  const g = new THREE.Group(); parent.add(g);
  const floor = openings.filter(o => o.y0 <= 0.01).sort((a, b) => a.x0 - b.x0);
  const holes = openings.filter(o => o.y0 > 0.01);

  // Panel superior (desde WAIN hasta el perfil superior), con muescas para puertas
  const s = new THREE.Shape();
  s.moveTo(0, WY);
  floor.forEach(o => { s.lineTo(o.x0, WY); s.lineTo(o.x0, o.y1); s.lineTo(o.x1, o.y1); s.lineTo(o.x1, WY); });
  s.lineTo(len, WY);
  for (let i = top.length - 1; i >= 0; i--) s.lineTo(top[i][0], top[i][1]);
  holes.forEach(o => {
    const p = new THREE.Path();
    p.moveTo(o.x0, o.y0); p.lineTo(o.x0, o.y1); p.lineTo(o.x1, o.y1); p.lineTo(o.x1, o.y0); p.lineTo(o.x0, o.y0);
    s.holes.push(p);
  });
  const geo = new THREE.ExtrudeGeometry(s, {depth: WALL_T, bevelEnabled: false, curveSegments: 1});
  geo.translate(0, 0, -WALL_T);
  const wm = new THREE.Mesh(geo, M('wall'));
  wm.castShadow = true; wm.receiveShadow = true; wm.userData.key = 'wall';
  g.add(wm);

  // Wainscot + flashing + base en los tramos sin puertas
  const segs = []; let cur = 0;
  floor.forEach(o => { if (o.x0 > cur + 0.01) segs.push([cur, o.x0]); cur = o.x1; });
  if (len > cur + 0.01) segs.push([cur, len]);
  segs.forEach(([a, b]) => {
    const w = b - a, cx = (a + b) / 2;
    if (st.wain) box(w, WAIN, WALL_T + 0.05, M('wainscot'), cx, WAIN / 2, -WALL_T / 2 + 0.025, g, [a, 0, 0]);
    if (st.wain && st.wtrim) box(w, 0.34, 0.11, M('wainscottrim'), cx, WAIN + 0.02, 0.045, g, [a, 0, 0]);
    if (!isNA('base')) box(w, 0.6, 0.22, M('base'), cx, 0.3, 0.01, g);
  });

  // Aberturas
  openings.forEach(o => {
    if (o.type === 'overhead') overheadDoor(g, o);
    else if (o.type === 'walk') walkDoor(g, o);
    else if (o.type === 'window') windowUnit(g, o);
    else if (o.type === 'louver') { louver(g, o); return; }
    trimOpening(g, o);
  });
  if (para) {                                  // parapet: panel trasero + coping
    const yT = EAVE + para;
    box(len, para - 0.1, 0.08, M('parapetback'), len / 2, EAVE + 0.05 + (para - 0.1) / 2, -WALL_T - 0.04, g);
    box(len + 0.1, 0.14, WALL_T + 0.5, M('parapet'), len / 2, yT + 0.07, -WALL_T / 2, g);
    [0.23, -WALL_T - 0.23].forEach(z => box(len + 0.1, 0.45, 0.04, M('parapet'), len / 2, yT - 0.2, z, g));
  }
  if (isMain && linerOn('wall')) wallLiner(g, len, para ? [[0, EAVE], [len, EAVE]] : top, openings);
  return g;
}

/* Coloca 4 paredes (front +z, back -z, right +x, left -x) y esquinas */
function placeWalls(parent, cx, cz, w, d, sides, cornerH) {
  const bw = (len, sd) => buildWall(len, sd.top, sd.open, parent, sd.para, true);
  const a = bw(w, sides.front); a.position.set(cx - w/2, 0, cz + d/2);
  const b = bw(w, sides.back);  b.position.set(cx + w/2, 0, cz - d/2); b.rotation.y = Math.PI;
  const r = bw(d, sides.right); r.position.set(cx + w/2, 0, cz + d/2); r.rotation.y = Math.PI / 2;
  const l = bw(d, sides.left);  l.position.set(cx - w/2, 0, cz - d/2); l.rotation.y = -Math.PI / 2;
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => cornerTrim(cx + sx * w/2, cz + sz * d/2, sx, sz, typeof cornerH === 'function' ? cornerH(sx) : cornerH, parent));
}

/* ------------------------------------------------------------------ */
/* Techos: mitad inclinada, alero (fascia+gutter), gable, shed          */
/* ------------------------------------------------------------------ */
/* Perfil de lámina delgada: polilínea [x,y] con espesor, extruida 'depth' a lo largo de z */
function sheetGeo(pts, th, depth) {
  const n = pts.length, d = th / 2;
  const ns = pts.slice(1).map((p, i) => { const dx = p[0] - pts[i][0], dy = p[1] - pts[i][1], l = Math.hypot(dx, dy); return [-dy / l, dx / l]; });
  const off = k => {
    if (k === 0) return ns[0];
    if (k === n - 1) return ns[n - 2];
    const a = ns[k - 1], b = ns[k], f = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / f, (a[1] + b[1]) / f];
  };
  const L1 = pts.map((p, k) => [p[0] + d * off(k)[0], p[1] + d * off(k)[1]]);
  const R1 = pts.map((p, k) => [p[0] - d * off(k)[0], p[1] - d * off(k)[1]]).reverse();
  const s = new THREE.Shape();
  L1.concat(R1).forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
  return new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: false});
}

/* Rake trim tipo PBR: cara en punta (7 1/4"), tapa superior con escalón 45° y labio inferior con hem */
function rakeTrim(g, len, z, dir) {                  // dir: +1 borde frontal (+z) / -1 borde trasero
  const pr = [[-8.875, -1.25], [-8.125, -1.25], [-6.875, 0], [0, 0], [2.094, -3.625], [0, -7.25], [-1.25, -7.25], [-1.25, -8.5]]
    .map(([u, v]) => [-dir * u / 12, 0.145 + v / 12]);
  const geo = sheetGeo(pr, 0.035, len);
  geo.rotateY(Math.PI / 2); geo.translate(-0.08, 0, 0);
  const m = new THREE.Mesh(geo, M('rake'));
  m.position.z = z; m.castShadow = m.receiveShadow = true; m.userData.key = 'rake'; g.add(m);
}

function roofHalf(o) {                       // marco local: x = pendiente abajo, y = normal, superficie en y=0
  const g = new THREE.Group();
  const mid = (o.sEave - 0.08) / 2;
  box(o.sEave + 0.08, T, o.zLen, M(o.key), mid, -T / 2, o.zOff, g);
  if (o.ridgeCap && !isNA('ridge')) box(0.95, 0.12, o.zLen + 0.1, M('ridge'), 0.4, 0.06, o.zOff, g);
  if (o.rakeF && !isNA('rake')) rakeTrim(g, o.sEave + 0.08, o.zOff + o.zLen / 2, 1);
  if (o.rakeB && !isNA('rake')) rakeTrim(g, o.sEave + 0.08, o.zOff - o.zLen / 2, -1);
  return g;
}
function eaveEdge(parent, side, xOut, yTop, zOff, zLen, withGutter) {
  const fh = 1.0;
  if (!isNA('eave')) box(0.12, fh, zLen, M('eave'), side * (xOut + 0.06), yTop + 0.04 - fh / 2, zOff, parent);
  if (!withGutter) return null;
  const x0 = xOut + (isNA('eave') ? 0.03 : 0.15), yB = yTop - 0.3, k = 4.1875 / 12;      // canal tipo PBR (perfil de lámina)
  const e1 = [COS, -SIN], e2 = [SIN, COS];                                              // ejes en el plano del techo
  const P = (o, a, b) => [o[0] + a * e1[0] + b * e2[0], o[1] + a * e1[1] + b * e2[1]];
  const B = [x0, yB], A = [x0, yB - 6.25 / 12], P1 = P(A, 5.25 / 12, 0), P2 = P(P1, k * 0.5, k * 0.866), P3 = P(P2, -k * 0.5, k * 0.866);
  const gm = new THREE.Mesh(sheetGeo([P(B, 1 / 12, 0), B, A, P1, P2, P3, P(P3, -0.625 / 12, 0)], 0.035, zLen), M('gutter'));
  gm.position.set(0, 0, zOff - zLen / 2); gm.scale.x = side; gm.castShadow = gm.receiveShadow = true; gm.userData.key = 'gutter'; parent.add(gm);
  return {gx: side * (x0 + 0.2), gBottom: (A[1] + P1[1]) / 2};
}
function gableRoof(o) {
  const g = new THREE.Group(); g.position.set(o.pos[0], 0, o.pos[1]); o.parent.add(g);
  const rise = o.half * PITCH, ridgeTop = o.eaveY + rise + T / COS;
  const zLen = o.len + o.ohF + o.ohB, zOff = (o.ohF - o.ohB) / 2;
  [-1, 1].forEach(side => {
    const pa = o.para && o.para[side], ohE = pa ? -WALL_T : o.ohE, sEave = (o.half + ohE) / COS;
    const h = roofHalf({sEave, zLen, zOff, key: o.key, ridgeCap: true, rakeF: o.rakeF, rakeB: o.rakeB});
    h.position.set(0, ridgeTop, 0);
    if (side > 0) h.rotation.z = -THETA; else { h.scale.x = -1; h.rotation.z = THETA; }
    g.add(h);
    if (pa) return;                            // lado con parapet: sin fascia ni gutter exterior
    const e = eaveEdge(g, side, o.half + ohE, ridgeTop - sEave * SIN, zOff, zLen, o.gutter && !isNA('gutter'));
    if (e && o.out) o.out[side] = e;
  });
  return g;
}
function shedRoof(o) {
  const g = new THREE.Group(); g.position.set(o.x0, 0, o.zc); o.parent.add(g);
  const topY = o.yHigh + T / COS, sEave = (o.run + o.ohE) / COS;
  const zLen = o.len + o.ohF + o.ohB, zOff = (o.ohF - o.ohB) / 2;
  const h = roofHalf({sEave, zLen, zOff, key: 'leanto', ridgeCap: false, rakeF: true, rakeB: true});
  h.position.set(0, topY, 0); h.rotation.z = -THETA; g.add(h);
  return eaveEdge(g, 1, o.run + o.ohE, topY - sEave * SIN, zOff, zLen, !isNA('gutter'));
}
function downspout(parent, side, xWall, z, gx, gBottom) {
  const sx = xWall + side * 0.3, ds = M('downspout');
  const elbowY = gBottom - 0.17;
  const el = Math.abs(gx - sx);
  box(el + 0.34, 0.34, 0.34, ds, (gx + sx) / 2, elbowY, z, parent);
  const vh = elbowY - 0.34 / 2 - 0.3;
  box(0.34, vh, 0.34, ds, sx, 0.3 + vh / 2, z, parent);
  box(0.8, 0.3, 0.34, ds, sx + side * 0.25, 0.3, z, parent);
}

/* ------------------------------------------------------------------ */
/* EDIFICIO PRINCIPAL                                                  */
/* ------------------------------------------------------------------ */
/* Liner de pared (interior): respeta las aberturas; altura completa o parcial con base/cap trim */
function wallLiner(g, len, top, openings) {
  const th = 0.06, zi = -(WALL_T + th), m = M('linerwall'), full = st.lh === 'full';
  const topAt = x => {
    if (!full) return st.lh;
    for (let i = 1; i < top.length; i++) if (x <= top[i][0] + 1e-6) { const [x0, y0] = top[i - 1], [x1, y1] = top[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    return top[top.length - 1][1];
  };
  const xs = [...new Set([0, len, ...openings.flatMap(o => [o.x0, o.x1]), ...(full ? top.map(p => p[0]) : [])])]
    .filter(x => x >= 0 && x <= len).sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a < 0.01) continue;
    const cov = openings.filter(o => o.x0 <= a + 1e-6 && o.x1 >= b - 1e-6).sort((p, q) => p.y0 - q.y0);
    const ta = topAt(a), tb = topAt(b), parts = []; let y = 0;
    cov.forEach(o => { if (o.y0 > y + 0.01) parts.push([y, o.y0]); y = Math.max(y, o.y1); });
    parts.push([y, Infinity]);
    parts.forEach(([y0, y1]) => {
      const ya = Math.min(y1, ta), yb = Math.min(y1, tb);
      if (ya <= y0 + 0.01 && yb <= y0 + 0.01) return;
      const s = new THREE.Shape(); s.moveTo(a, y0); s.lineTo(b, y0); s.lineTo(b, Math.max(yb, y0)); s.lineTo(a, Math.max(ya, y0));
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, {depth: th, bevelEnabled: false}), m);
      mesh.position.z = zi; mesh.receiveShadow = true; mesh.userData.key = 'linerwall'; g.add(mesh);
    });
    if (full) continue;
    const blocked = (y0, y1) => cov.some(o => o.y0 < y1 && o.y1 > y0);
    if (st.lbase && !blocked(0, 0.3)) box(b - a, 0.3, 0.1, M('linerbase'), (a + b) / 2, 0.15, zi - 0.05, g);
    if (st.lcap && !blocked(st.lh - 0.3, st.lh + 0.05)) box(b - a, 0.3, 0.12, M('linercap'), (a + b) / 2, st.lh - 0.1, zi - 0.06, g);
  }
}

/* Liner de techo (interior) */
function buildLiner() {
  if (!linerOn('roof')) return;
  const th = 0.06, OFF = WALL_T + th, a = HALF - OFF, m = M('linerroof'), sLen = a / COS, zLen = L - 2 * OFF;
  [-1, 1].forEach(s => {
    const g = new THREE.Group(); g.position.set(0, EAVE + RISE - 0.04, 0); g.rotation.z = -s * THETA; main.add(g);
    box(sLen, th, zLen, m, s * sLen / 2, -th / 2, 0, g);
  });
}

const para = {};
function buildMain() {
  buildLiner();
  para[-1] = st.parapet && st.pside !== 'right';
  para[1]  = st.parapet && st.pside !== 'left';
  const gableTop = [[0, EAVE], [HALF, EAVE + RISE], [W, EAVE]];
  const flatTop = (len, h = 0) => [[0, EAVE + h], [len, EAVE + h]];
  const sd = k => ({top: flatTop(L, para[k] ? PH : 0), para: para[k] ? PH : 0});

placeWalls(main, 0, 0, W, L, {
  front: {top: gableTop, open: [
    {type:'overhead', x0:4,     x1:18,    y0:0,   y1:14},
    {type:'walk',     x0:25.25, x1:28.75, y0:0,   y1:7},
    {type:'window',   x0:31.75, x1:36.25, y0:4.5, y1:8.5},
    {type:'louver',   x0:19.5,  x1:22.5,  y0:19,  y1:21.4}
  ]},
  back: {top: gableTop, open: [
    {type:'walk',   x0:18.25, x1:21.75, y0:0,   y1:7},
    {type:'window', x0:6,     x1:10.5,  y0:4.5, y1:8.5},
    {type:'window', x0:31.5,  x1:36,    y0:4.5, y1:8.5},
    {type:'louver', x0:19.5,  x1:22.5,  y0:19,  y1:21.4}
  ]},
  right: {...sd(1), open: [
    {type:'window', x0:3,  x1:7,  y0:4.5, y1:8.5},
    {type:'window', x0:40, x1:45, y0:4.5, y1:8.5},
    {type:'window', x0:50, x1:55, y0:4.5, y1:8.5}
  ]},
  left: {...sd(-1), open: [
    {type:'window', x0:8,  x1:13,   y0:4.5, y1:8.5},
    {type:'window', x0:26, x1:31,   y0:4.5, y1:8.5},
    {type:'window', x0:44, x1:49,   y0:4.5, y1:8.5},
    {type:'walk',   x0:52, x1:55.5, y0:0,   y1:7}
  ]}
}, k => EAVE + (para[k] ? PH : 0));

// Techo principal + gutters
const gOut = {};
gableRoof({parent: main, half: HALF, len: L, eaveY: EAVE, ohE: OH, ohF: OH, ohB: OH, key: 'roof',
           pos: [0, 0], gutter: true, rakeF: true, rakeB: true, out: gOut, para});
// Downspouts (4) - con parapet: scupper + collector head
[[1, 28.5], [1, -28.5], [-1, 28.5], [-1, -28.5]].forEach(([side, z]) => {
  if (isNA('downspout')) return;
  if (para[side]) {
    const x = side * HALF, hv = EAVE - 0.5, gn = isNA('gutter') ? 'downspout' : 'gutter';
    if (!isNA('gutter')) box(0.7, 0.45, 1.1, M('gutter'), x + side * 0.1, EAVE + 0.6, z, main);
    box(0.75, 0.95, 1.3, M(gn), x + side * 0.55, EAVE + 0.1, z, main);
    box(0.4, hv, 0.4, M('downspout'), x + side * 0.6, 0.1 + hv / 2, z, main);
  } else if (gOut[side]) downspout(main, side, side * HALF, z, gOut[side].gx, gOut[side].gBottom);
});

/* ---- Canopy de entrada (frente) ---- */
(function canopy() {
  if (!st.canopy) return;
  const cx = 9, half = 7, eaveY = 10.5, len = 10, z0 = L / 2;
  gableRoof({parent: main, half, len, eaveY, ohE: 0.9, ohF: 0.8, ohB: 0, key: 'canopy',
             pos: [cx, z0 + len / 2], gutter: false, rakeF: true, rakeB: false});
  const steel = N('#59626a', 0.5, 0.3);
  const zf = z0 + len - 0.5;
  [-1, 1].forEach(s => {
    box(0.36, 0.58, len, steel, cx + s * (half - 0.5), eaveY - 0.12, z0 + len / 2, main);   // vigas laterales
    box(0.45, eaveY - 0.4, 0.45, steel, cx + s * (half - 0.5), (eaveY - 0.4) / 2, zf, main); // postes
  });
  box(half * 2 - 0.6, 0.5, 0.35, steel, cx, eaveY - 0.15, zf, main);                       // viga frontal
  // frontón triangular de relleno
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(half * 2, 0); s.lineTo(half, half * PITCH); s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, {depth: 0.15, bevelEnabled: false});
  const tri = new THREE.Mesh(geo, M('wall'));
  tri.position.set(cx - half, eaveY, z0 + len - 0.1); tri.castShadow = true; tri.receiveShadow = true; tri.userData.key = 'wall';
  main.add(tri);
})();

/* ---- Lean-to (anexo lado derecho) ---- */
(function annex() {
  if (!st.leanto) return;
  const AX = HALF, AW = 12, AL = 24, AZ0 = 20, AEAVE = 10, AHIGH = 14;
  const ez = AZ0 - AL;                                             // z trasero
  const outer = buildWall(AL, [[0, AEAVE], [AL, AEAVE]], [
    {type:'walk',   x0:4.25, x1:7.75, y0:0,   y1:7},
    {type:'window', x0:12.5, x1:17.5, y0:4.5, y1:8}
  ], main);
  outer.position.set(AX + AW, 0, AZ0); outer.rotation.y = Math.PI / 2;
  const e1 = buildWall(AW, [[0, AHIGH], [AW, AEAVE]], [], main); e1.position.set(AX, 0, AZ0);
  const e2 = buildWall(AW, [[0, AEAVE], [AW, AHIGH]], [], main); e2.position.set(AX + AW, 0, ez); e2.rotation.y = Math.PI;
  cornerTrim(AX + AW, AZ0, 1, 1, AEAVE, main);
  cornerTrim(AX + AW, ez, 1, -1, AEAVE, main);
  const e = shedRoof({parent: main, x0: AX, yHigh: AHIGH, run: AW, zc: (AZ0 + ez) / 2, len: AL, ohE: 1.0, ohF: 1.0, ohB: 1.0});
  if (e && !isNA('downspout')) downspout(main, 1, AX + AW, AZ0 - 1.5, AX + e.gx, e.gBottom);
})();

/* ------------------------------------------------------------------ */
const pcd = calloutDefs.find(c => c.key === 'parapet');
  if (pcd) pcd.pos.set((para[-1] ? -1 : 1) * (HALF + 0.1), EAVE + PH + 0.15, -6);
}
renderer.localClippingEnabled = true;
const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);            // corte lateral: oculta x > 0
const cutOn = () => st.liner !== 'none' && st.cut;
function applyCut() {
  const on = cutOn();
  main.traverse(o => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach(m => {
      if (m.userData.cut === on) return;
      m.userData.cut = on; m.clippingPlanes = on ? [cutPlane] : []; m.clipShadows = on; m.needsUpdate = true;   // [] (no null): three r128 lee .length en la pasada de sombras
    });
  });
}
function disposeGroup(g) {
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  while (g.children.length) g.remove(g.children[0]);
}
function rebuild() {                          // reconstruye el modelo (N/A, wainscot, parapet)
  disposeGroup(main); buildMain(); applyCut(); syncControls();
}

/* ------------------------------------------------------------------ */
/* Callouts (etiquetas con flechas en pantalla)                         */
/* ------------------------------------------------------------------ */
const sEaveMain = (HALF + OH) / COS, yEdgeMain = RIDGE0 - sEaveMain * SIN;
const calloutDefs = [
  {text:'ROOF PANEL',  sub:'Main gable roof',     key:'roof',      pos:[10, RIDGE0 - 10 * PITCH, 6],        n:[SIN, COS, 0]},
  {text:'LEAN-TO ROOF',sub:'Side annex',     key:'leanto',      pos:[28, 14 + T / COS - 7 * PITCH, 8],   n:[SIN, COS, 0]},
  {text:'RIDGE CAP',                               key:'ridge',     pos:[0, RIDGE0 + 0.13, -4],              n:[0, 1, 0]},
  {text:'RAKE TRIM',                               key:'rake',      pos:[11.3, 19.23, L / 2 + OH + 0.2],     n:[0, 0, 1]},
  {text:'EAVE TRIM',   sub:'Fascia',              key:'eave',      pos:[HALF + OH + 0.13, yEdgeMain - 0.22, -10], n:[1, 0, 0]},
  {text:'GUTTER',                                  key:'gutter',    pos:[HALF + OH + 0.15 + 0.68, yEdgeMain - 0.73, 8], n:[1, 0, 0]},
  {text:'DOWNSPOUT',                               key:'downspout', pos:[HALF + 0.3 + 0.18, 7, 28.5],        n:[1, 0, 0]},
  {text:'WALL PANEL',                              key:'wall',      pos:[0.5, 10, L / 2 + 0.01],             n:[0, 0, 1]},
  {text:'WAINSCOT',                                key:'wainscot',  pos:[0.5, 2, L / 2 + 0.06],              n:[0, 0, 1], group:'wain'},
  {text:'CORNER TRIM',                             key:'corner',    pos:[HALF - 0.2, 8, L / 2 + 0.17],       n:[0, 0, 1]},
  {text:'BASE TRIM',                               key:'base',      pos:[11, 0.35, L / 2 + 0.13],            n:[0, 0, 1]},
  {text:'F.O. TRIM',   sub:'Door / window',       key:'fo',      pos:[-2.8, 6, L / 2 + 0.16],             n:[0, 0, 1]},
  {text:'CANOPY ROOF', sub:'Entry canopy',        key:'canopy',    pos:[12.5, 10.5 + 7 * PITCH + T / COS - 3.5 * PITCH, 36], n:[SIN, COS, 0]},
  {text:'PARAPET CAP', sub:'Optional condition',  key:'parapet',   pos:[HALF, EAVE + PH, -6], n:[0, 1, 0], group:'parapet'}
].map(d => Object.assign(d, {pos: new THREE.Vector3(...d.pos), nrm: new THREE.Vector3(...d.n).normalize()}));

/* ---- DOM overlay ---- */
const css = document.createElement('style');
css.textContent = `
.callout-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.callout-layer svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.callout-layer .callout{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;transition:border-color .15s}
.callout-layer .callout:hover{border-color:#173f77;background:#fff}
.sw{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.28);margin-right:6px;vertical-align:-1px}
.control.pulse{animation:cpulse 1.3s ease}
@keyframes cpulse{0%,100%{background:transparent}30%{background:#fff0a8}}
.control select:hover{border-color:#173f77}`;
document.head.appendChild(css);

const layer = document.createElement('div'); layer.className = 'callout-layer'; viewer.appendChild(layer);
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg'); layer.appendChild(svg);
svg.insertAdjacentHTML('beforeend', '<defs><marker id="arrowHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1f2d36"/></marker></defs>');

const callouts = calloutDefs.map(d => {
  const el = document.createElement('div'); el.className = 'callout';
  el.innerHTML = `<b>${d.text}</b>${d.sub ? `<span>${d.sub}</span>` : ''}`;
  layer.appendChild(el);
  const g = document.createElementNS(NS, 'g');
  const halo = document.createElementNS(NS, 'line'), ln = document.createElementNS(NS, 'line');
  halo.setAttribute('stroke', 'rgba(255,255,255,.85)'); halo.setAttribute('stroke-width', '4'); halo.setAttribute('stroke-linecap', 'round');
  ln.setAttribute('stroke', '#1f2d36'); ln.setAttribute('stroke-width', '1.5'); ln.setAttribute('marker-end', 'url(#arrowHead)');
  g.append(halo, ln); svg.appendChild(g);
  el.addEventListener('mouseenter', () => highlight(d.key, true));
  el.addEventListener('mouseleave', () => highlight(d.key, false));
  el.addEventListener('click', () => focusKey(d.key));
  return {def: d, el, g, halo, ln, bw: 0, bh: 0, sx: 0, sy: 0};
});
function measureCallouts() {
  callouts.forEach(c => { c.el.style.display = ''; c.bw = c.el.offsetWidth; c.bh = c.el.offsetHeight; });
}
setTimeout(measureCallouts, 0);
window.addEventListener('load', () => setTimeout(measureCallouts, 100));

const _p = new THREE.Vector3(), _c = new THREE.Vector3();
function layoutCallouts() {
  if (!labelsOn) { layer.style.display = 'none'; return; }
  layer.style.display = '';
  const w = viewer.clientWidth, h = viewer.clientHeight;
  const vis = [];
  callouts.forEach(c => {
    const cd = componentDefs.find(d => d.key === c.def.key);
    let ok = !isNA(c.def.key) && (!cd || !cd.show || cd.show()) && c.bw > 0 && !(cutOn() && c.def.pos.x > 0.01);
    if (ok) {
      _p.copy(c.def.pos).project(camera);
      if (_p.z > 1 || _p.z < -1) ok = false;
      _c.copy(camera.position).sub(c.def.pos).normalize();
      if (_c.dot(c.def.nrm) < 0.15) ok = false;
      c.sx = (_p.x * 0.5 + 0.5) * w; c.sy = (-_p.y * 0.5 + 0.5) * h;
      if (c.sx < 12 || c.sx > w - 12 || c.sy < 12 || c.sy > h - 12) ok = false;
    }
    c.el.style.display = ok ? '' : 'none';
    c.g.style.display = ok ? '' : 'none';
    if (ok) vis.push(c);
  });
  const compact = viewer.classList.contains('compact');
  const top = compact ? 52 : 96, bottom = h - (compact ? 34 : 54), gap = compact ? 4 : 6, margin = compact ? 6 : 14;
  const rowH = compact && vis.length ? vis.reduce((s, c) => s + c.bh, 0) / vis.length + gap : 40;
  const maxPer = Math.max(3, Math.floor((bottom - top) / rowH));
  let left = vis.filter(c => c.sx < w / 2), right = vis.filter(c => c.sx >= w / 2);
  while (right.length > maxPer && left.length < maxPer) { right.sort((a, b) => a.sx - b.sx); left.push(right.shift()); }
  while (left.length > maxPer && right.length < maxPer) { left.sort((a, b) => b.sx - a.sx); right.push(left.shift()); }
  const place = (list, isLeft) => {
    list.sort((a, b) => a.sy - b.sy);
    const ys = list.map(c => Math.min(Math.max(c.sy - c.bh / 2, top), bottom - c.bh));
    for (let i = 1; i < list.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + list[i - 1].bh + gap);
    if (list.length) {
      const last = list.length - 1, over = ys[last] + list[last].bh - bottom;
      if (over > 0) { ys[last] -= over; for (let i = last - 1; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - list[i].bh - gap); }
    }
    list.forEach((c, i) => {
      const x = isLeft ? margin : w - margin - c.bw;
      c.el.style.transform = `translate(${x}px,${ys[i]}px)`;
      const ax = isLeft ? x + c.bw : x, ay = ys[i] + c.bh / 2;
      [c.halo, c.ln].forEach(l => { l.setAttribute('x1', ax); l.setAttribute('y1', ay); l.setAttribute('x2', c.sx); l.setAttribute('y2', c.sy); });
    });
  };
  place(left, true); place(right, false);
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
const controlRefs = [];
function makeSelect(def) {
  const wrap = document.createElement('div'); wrap.className = 'control';
  const label = document.createElement('label');
  label.innerHTML = `<i class="sw"></i>${def.name}<small>${def.desc}</small>`;
  const select = document.createElement('select');
  wrap.append(label, select);
  document.getElementById('controls').appendChild(wrap);
  return {select, sw: label.querySelector('.sw'), wrap};
}
function fillSelect(sel, systemKey, def) {
  sel.innerHTML = '';
  catalog.systems[systemKey].colors.forEach(c => {
    const o = document.createElement('option'); o.value = c.hex; o.textContent = `${c.code} — ${c.name}`; sel.appendChild(o);
  });
  if (def.na !== false) {
    const o = document.createElement('option'); o.value = NA; o.textContent = 'N/A — Not in project'; sel.appendChild(o);
  }
}
function nearestHex(hex, list) {
  const parse = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = parse(hex); let best = list[0], dist = Infinity;
  list.forEach(c => {
    const b = parse(c.hex), d = (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
    if (d < dist) { dist = d; best = c; }
  });
  return best.hex;
}
componentDefs.forEach(def => {
  const r = makeSelect(def);
  controlRefs.push({def, sel: r.select, sw: r.sw, wrap: r.wrap});
  r.select.addEventListener('change', () => { const was = isNA(def.key); setColor(def.key, r.select.value); if (was !== isNA(def.key)) rebuild(); });
  r.wrap.addEventListener('mouseenter', () => highlight(def.key, true));
  r.wrap.addEventListener('mouseleave', () => highlight(def.key, false));
});
function setColor(key, hex) {
  colors[key] = hex;
  if (hex !== NA && materials[key]) materials[key].color.copy(col(hex));
  const r = controlRefs.find(r => r.def.key === key);
  if (r) r.sw.style.background = hex === NA ? 'repeating-linear-gradient(45deg,#fff,#fff 2px,#c9d0d5 2px,#c9d0d5 4px)' : hex;
}
function syncControls() {
  controlRefs.forEach(r => { r.wrap.style.display = (!r.def.show || r.def.show()) ? '' : 'none'; });
}
function loadSystem(key) {
  const list = catalog.systems[key].colors;
  controlRefs.forEach(({def, sel}) => {
    fillSelect(sel, key, def);
    const chosen = colors[def.key] === NA ? NA : nearestHex(colors[def.key] || defaults[def.key], list);
    sel.value = chosen;
    setColor(def.key, chosen);
  });
}
function reset() {
  colors = {...defaults};
  loadSystem(document.getElementById('systemSelect').value);
  rebuild();
}
function focusKey(key) {
  const r = controlRefs.find(r => r.def.key === key); if (!r) return;
  r.wrap.scrollIntoView({block: 'center', behavior: 'smooth'});
  r.wrap.classList.remove('pulse'); void r.wrap.offsetWidth; r.wrap.classList.add('pulse');
  highlight(key, true); setTimeout(() => highlight(key, false), 900);
  setTimeout(() => r.wrap.classList.remove('pulse'), 1400);
}

/* Click en el modelo -> resalta el control correspondiente */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downPos = null;
canvas.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]); downPos = null;
  if (moved > 5) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [main];
  const hit = ray.intersectObjects(targets, true).find(h => h.object.userData.key && !(cutOn() && h.point.x > 0));
  if (hit) focusKey(hit.object.userData.key);
});

/* ------------------------------------------------------------------ */
/* Vistas / cámara                                                     */
/* ------------------------------------------------------------------ */
const VIEWS = {
  iso:   {p: [74, 40, 94],   t: [6, 9, 4]},
  front: {p: [0, 15, 120],   t: [0, 10, 0]},
  side:  {p: [120, 15, 4],   t: [0, 10, 0]}
};
const VIEWS_P = {
  iso:   {p: [46, 44, 150],  t: [-8, 9, 8]},
  front: {p: [-8, 16, 150],  t: [-8, 10, 6]},
  side:  {p: [-150, 16, 36], t: [-24, 10, 6]}
};
let currentView = 'iso', fly = null;
function flyTo(p, t, dur = 900) {
  fly = {t0: performance.now(), dur, p0: camera.position.clone(), q0: controls.target.clone(),
         p1: new THREE.Vector3(...p), q1: new THREE.Vector3(...t)};
}
function go(name) {
  currentView = name;
  const v = VIEWS[name];
  const t = new THREE.Vector3(...v.t);
  const p = new THREE.Vector3(...v.p).sub(t).multiplyScalar(lastFit).add(t);   // aleja la cámara en pantallas angostas
  flyTo(p.toArray(), v.t);
  document.querySelectorAll('.view-switch button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
}
controls.addEventListener('start', () => { fly = null; });
camera.position.set(...VIEWS.iso.p);
controls.target.set(...VIEWS.iso.t);

function setup() {
  defaults = {...catalog.defaults};
  defaults.fo = defaults.fo || defaults.jamb;
  defaults.leanto = defaults.leanto || defaults.roof;
  defaults.wainscottrim = defaults.wainscottrim || defaults.base;
  defaults.linerwall = defaults.linerwall || '#E7E8E5';
  defaults.linerroof = defaults.linerroof || '#E7E8E5';
  defaults.linerbase = defaults.linerbase || '#E7E8E5';
  defaults.linercap = defaults.linercap || '#E7E8E5';
  colors = {...defaults};
  const systemSelect = document.getElementById('systemSelect');
  Object.entries(catalog.systems).forEach(([key, sys]) => {
    const o = document.createElement('option'); o.value = key; o.textContent = sys.label; systemSelect.appendChild(o);
  });
  document.getElementById('sourceNote').textContent = catalog.sourceNote;
  loadSystem(systemSelect.value);
  systemSelect.onchange = () => loadSystem(systemSelect.value);
  document.getElementById('reset').onclick = reset;
  const gid = id => document.getElementById(id);
  const upd = () => {
    st.canopy = gid('canopyToggle').checked; st.leanto = gid('leantoToggle').checked;
    st.wain = gid('wainToggle').checked; st.wtrim = gid('wainTrimToggle').checked;
    st.parapet = gid('parapetToggle').checked; st.pside = gid('parapetSide').value;
    st.liner = gid('linerSelect').value;
    st.lh = gid('linerHeight').value === 'sel' ? Number(gid('linerHeightVal').value) : 'full';
    st.lbase = gid('linerBaseToggle').checked; st.lcap = gid('linerCapToggle').checked; st.cut = gid('cutToggle').checked;
    gid('linerWallOpts').style.display = linerOn('wall') ? '' : 'none';
    gid('linerHeightValRow').style.display = linerPartial() ? '' : 'none';
    gid('linerBaseRow').style.display = gid('linerCapRow').style.display = linerPartial() ? '' : 'none';
    gid('cutRow').style.display = st.liner === 'none' ? 'none' : '';
    gid('wainTrimRow').style.display = st.wain ? '' : 'none';
    gid('parapetSideRow').style.display = st.parapet ? '' : 'none';
    rebuild();
  };
  ['canopyToggle', 'leantoToggle', 'wainToggle', 'wainTrimToggle', 'parapetToggle', 'parapetSide', 'linerSelect', 'linerHeight', 'linerHeightVal', 'linerBaseToggle', 'linerCapToggle', 'cutToggle'].forEach(id => gid(id).onchange = upd);
  upd(); setupPrint();
  document.getElementById('labelsToggle').onchange = e => { labelsOn = e.target.checked; };
  document.getElementById('front').onclick = () => go('front');
  document.getElementById('iso').onclick   = () => go('iso');
  document.getElementById('side').onclick  = () => go('side');
  document.querySelectorAll('.view-switch button').forEach(b => b.onclick = () => go(b.dataset.view));
  canvas.addEventListener('pointerdown', () => document.querySelector('.view-badge').classList.add('seen'), {once: true});
}

/* ------------------------------------------------------------------ */
/* SIGN AND PRINT: valida cliente -> firma -> hoja imprimible          */
/* ------------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const esc = v => String(v || '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const lum = h => { const p = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
const inkOn = h => lum(h) > 0.55 ? '#18212a' : '#ffffff';
const sysNow = () => catalog.systems[$('systemSelect').value];
function colorInfo(hex) { return sysNow().colors.find(c => c.hex === hex) || {code: '', name: hex}; }

function snap(p, t) {
  camera.position.set(...p); camera.lookAt(...t); renderer.render(scene, camera);
  return canvas.toDataURL('image/jpeg', 0.92);
}
function capture() {                           // 2 vistas del modelo actual (incluye N/A, parapet, etc.)
  const p0 = camera.position.clone(), q0 = controls.target.clone(), a0 = camera.aspect;
  camera.aspect = 1.92; camera.updateProjectionMatrix(); renderer.setSize(1152, 600, false);   // encuadre fijo, sin depender del tamaño de pantalla
  const imgs = [snap([74, 40, 94], [6, 9, 4]), snap([-74, 40, 94], [-6, 9, 4])];
  camera.aspect = a0; camera.updateProjectionMatrix(); renderer.setSize(viewer.clientWidth, viewer.clientHeight, false);
  camera.position.copy(p0); controls.target.copy(q0); controls.update();
  return imgs;
}
function psCard(hex) {
  if (hex === NA) return '<div class="ps-card ps-sm" style="background:#f1f3f5;color:#7a858d"><div class="ps-card-main"><b>N/A</b><span>Not in project</span></div></div>';
  const c = colorInfo(hex);
  return `<div class="ps-card ps-sm" style="background:${hex};color:${inkOn(hex)}"><div class="ps-card-main"><b>${esc(c.code)} — ${esc(c.name)}</b></div></div>`;
}
function buildSheet(sig, imgs) {
  const sys = sysNow(), date = new Date().toLocaleDateString('en-US');
  const act = componentDefs.filter(d => !d.show || d.show());
  const rows = act.map(d => `<div class="ps-row"><div class="ps-rl">${d.name}</div>${psCard(colors[d.key])}</div>`).join('');
  const used = new Set(act.map(d => colors[d.key]));
  const chart = sys.colors.map(c => `<div class="ps-card" style="background:${c.hex};color:${inkOn(c.hex)}"><div class="ps-card-main"><b>${esc(c.code)} — ${esc(c.name)}</b>${c.sr ? `<em>SR ${c.sr} · SRI ${c.sri}</em>` : ''}${c.note ? `<em>${esc(c.note)}</em>` : ''}</div>${used.has(c.hex) ? '<span class="ps-sel-tag">SELECTED</span>' : ''}</div>`);
  const n = Math.ceil(chart.length / 3);
  const cols = [0, 1, 2].map(i => `<div class="ps-col">${chart.slice(i * n, (i + 1) * n).join('')}</div>`).join('');
  const foot = '<div class="ps-foot"><div class="ps-logo">ALLIED</div><div>Screen colors are approximations.<br>Confirm final selection with physical color chips.</div></div>';
  const side = {left: 'left sidewall', right: 'right sidewall', both: 'both sidewalls'}[st.pside];
  const linerTxt = {none: 'No', wall: 'Wall', roof: 'Roof', both: 'Wall + Roof'}[st.liner] + (linerOn('wall') ? ` (wall ${st.lh === 'full' ? 'full height' : st.lh + ' ft'})` : '');
  const opts = `Canopy: ${st.canopy ? 'Yes' : 'No'} · Lean-to: ${st.leanto ? 'Yes' : 'No'} · Liner panel: ${linerTxt} · Wainscot: ${st.wain ? 'Yes' : 'No'}${st.wain ? ` · Wainscot trim: ${st.wtrim ? 'Yes' : 'No'}` : ''} · Parapet: ${st.parapet ? 'Yes (' + side + ')' : 'No'}`;
  const nm = esc($('custName').value), job = esc($('custJob').value), ad = esc($('custAddr').value).replace(/\n/g, '<br>');
  const top = `<div class="ps-top"><span>ALLIED S&amp;T COLOR SELECTOR</span><span>${date}</span></div>`;
  return `<section class="ps-page">${top}
  <div class="ps-title"><b>CUSTOMER COLOR SELECTION</b><span>${esc(sys.label)}</span></div>
  <div class="ps-cust"><div><label>Customer</label><p>${nm}</p></div><div><label>Job Number</label><p>${job}</p></div><div class="ps-wide"><label>Address</label><p>${ad}</p></div></div>
  <div class="ps-bar">3D COLOR PREVIEW</div>
  <div class="ps-views"><figure><img src="${imgs[0]}" alt=""><figcaption>Front / right view</figcaption></figure><figure><img src="${imgs[1]}" alt=""><figcaption>Front / left view</figcaption></figure></div>
  <div class="ps-bar">COLOR SELECTIONS</div>
  <div class="ps-sel">${rows}</div>
  <div class="ps-small">${opts}</div>
  <div class="ps-note">By signing, the customer confirms the color selections shown in this document. Screen colors are visual approximations; final selection must be confirmed with physical color chips.</div>
  <div class="ps-sign"><div><div class="ps-sigbox"><img src="${sig}" alt=""></div><div class="ps-line">CUSTOMER SIGNATURE</div></div><div><div class="ps-sigbox">${date}</div><div class="ps-line">DATE</div></div><div><div class="ps-sigbox">${nm}</div><div class="ps-line">PRINTED NAME</div></div></div>
  ${foot}</section>
  <section class="ps-page">${top}
  <div class="ps-title"><b>COLOR REFERENCE</b><span>${esc(sys.label)}</span></div>
  <div class="ps-cust"><div><label>Customer</label><p>${nm}</p></div><div><label>Job Number</label><p>${job}</p></div></div>
  <div class="ps-bar">AVAILABLE COLORS <small>— colors used in this project are tagged SELECTED</small></div>
  <div class="ps-cols">${cols}</div>
  <div class="ps-ref">${esc(catalog.sourceNote)}</div>
  ${foot}</section>`;
}
function setupPrint() {
  const pad = $('sigPad'), ctx = pad.getContext('2d');
  let drawing = false, inked = false;
  const fit = () => {
    const r = pad.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    pad.width = r.width * d; pad.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#10161c'; inked = false;
  };
  const pt = e => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener('pointerdown', e => { drawing = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); });
  pad.addEventListener('pointermove', e => { if (!drawing) return; ctx.lineTo(...pt(e)); ctx.stroke(); inked = true; });
  ['pointerup', 'pointercancel'].forEach(t => pad.addEventListener(t, () => { drawing = false; }));
  $('sigClear').onclick = fit;
  $('sigCancel').onclick = () => { $('signModal').hidden = true; };
  $('signPrint').onclick = () => {
    const ids = ['custName', 'custJob', 'custAddr'], bad = ids.filter(id => !$(id).value.trim());
    ids.forEach(id => $(id).classList.toggle('invalid', bad.includes(id)));
    const note = $('custNote'); note.hidden = !bad.length;
    if (bad.length) { note.textContent = 'Complete customer name, job number and address before signing.'; $(bad[0]).focus(); return; }
    $('signError').textContent = ''; $('signModal').hidden = false; fit();
  };
  $('sigConfirm').onclick = () => {
    if (!inked) { $('signError').textContent = 'Please sign in the box above.'; return; }
    const sig = pad.toDataURL('image/png'), imgs = capture();
    $('signModal').hidden = true;
    const sheet = $('printSheet'); sheet.innerHTML = buildSheet(sig, imgs);
    Promise.all([...sheet.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : 0))
      .then(() => setTimeout(() => window.print(), 120));
  };
  window.addEventListener('afterprint', () => { $('printSheet').innerHTML = ''; });
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */
let lastFit = 1, lastCompact = null;
const fitFactor = a => Math.min(2.2, Math.max(1, 1.5 / a));      // aspecto < 1.5 -> cámara más lejos para que quepa el edificio
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  const compact = w < 560 || h < 420;
  if (compact !== lastCompact) { lastCompact = compact; viewer.classList.toggle('compact', compact); measureCallouts(); }
  const f = fitFactor(camera.aspect);
  if (Math.abs(f - lastFit) > 0.005) {
    const r = f / lastFit, rescale = (p, t) => p.sub(t).multiplyScalar(r).add(t);
    rescale(camera.position, controls.target);
    if (fly) { rescale(fly.p0, fly.q0); rescale(fly.p1, fly.q1); }
    lastFit = f;
  }
  controls.maxDistance = 240 * lastFit;
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(viewer);
resize();

function animate(now) {
  requestAnimationFrame(animate);
  if (fly) {
    const k = Math.min(1, (now - fly.t0) / fly.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.q0, fly.q1, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  renderer.render(scene, camera);
  layoutCallouts();
}

async function init() {
  const r = await fetch('./colors.json');
  if (!r.ok) throw Error('Could not load colors.json');
  catalog = await r.json();
  setup();
  requestAnimationFrame(animate);
}
init().catch(e => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;top:20px;left:20px;background:#fff;padding:15px;border:1px solid #c33;z-index:20">Error: ${e.message}<br>Abre el proyecto con Live Server (no con file://).</div>`);
});
})();
