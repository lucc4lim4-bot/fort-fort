// Renderização do mundo: terreno, mar, céu, construções, árvores, peças de construção e tempestade.
import * as THREE from 'three';
import { HALF, POIS, MAT_INFO, RARITY } from '/shared/data.js';
import { M } from './models.js';

const rngSeeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

export function buildSky(scene) {
  const g = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d8fe8) }, mid: { value: new THREE.Color(0x9fd0ff) }, bot: { value: new THREE.Color(0xe6f3ff) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h>0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid, bot, min(1.0,-h*4.0)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(g, mat); sky.renderOrder = -10; scene.add(sky);
  // nuvens
  const rnd = rngSeeded(77), clouds = new THREE.Group();
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group(); const n = 4 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + rnd() * 12, 1), cm); s.position.set(j * 14 - n * 7, rnd() * 5, rnd() * 10); s.scale.y = 0.6; c.add(s); }
    c.position.set((rnd() - 0.5) * 900, 245 + rnd() * 60, (rnd() - 0.5) * 900); clouds.add(c);
  }
  scene.add(clouds);
  return { sky, clouds };
}

function terrainColor(world, x, z, h, slope) {
  const c = new THREE.Color();
  if (h < 0.15) return c.set(0x3e7f97).lerp(new THREE.Color(0xc9b98a), Math.max(0, (h + 3) / 3.3));
  if (h < 1.1) return c.set(0xe2d4a0).lerp(new THREE.Color(0xd5c488), (Math.sin(x * 0.7) + Math.cos(z * 0.6)) * 0.25 + 0.25);
  const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.07 + z * 0.09) * 0.8;
  c.set(0x5ca044).lerp(new THREE.Color(0x4a8a38), n * 0.4 + 0.5);
  if (h > 7.5) c.lerp(new THREE.Color(0x8a9a60), Math.min(1, (h - 7.5) / 3));
  if (slope > 0.55) c.lerp(new THREE.Color(0x8a867a), Math.min(1, (slope - 0.55) * 3));
  if (h < 1.7) c.lerp(new THREE.Color(0xd9ca94), (1.7 - h) / 0.6);
  for (const p of world.pois) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r * 1.05) {
      const w = 1 - Math.max(0, (d - p.r * 0.6) / (p.r * 0.45));
      let col = 0x9a9588;
      if (p.style === 'farm') col = (Math.floor((x + z) / 4) % 2) ? 0xc8a85a : 0x8a6a3a;
      else if (p.style === 'military' || p.style === 'factory') col = 0x7b7d72;
      else if (p.style === 'ruins') col = 0x8d8a78;
      else if (p.style === 'suburb') col = 0x6fae52;
      else if (p.style === 'port') col = 0xb5aa8c;
      c.lerp(new THREE.Color(col), Math.max(0, Math.min(0.85, w)));
    }
  }
  return c;
}

export function buildTerrain(scene, world) {
  const N = 200, size = HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = world.heightAt(x, z);
    pos.setY(i, h);
    const sl = Math.hypot(world.heightAt(x + 1, z) - h, world.heightAt(x, z + 1) - h);
    const c = terrainColor(world, x, z, h, sl); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
  mesh.receiveShadow = true; scene.add(mesh);
  // mar
  const wc = document.createElement('canvas'); wc.width = wc.height = 128; const g = wc.getContext('2d');
  g.fillStyle = '#2b8fd8'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; const x = Math.random() * 128, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 22, y); g.stroke(); }
  const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(90, 90); wt.colorSpace = THREE.SRGBColorSpace;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ map: wt, color: 0xffffff, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.05; scene.add(water);
  return { mesh, water, wt };
}

export function buildStatics(scene, world) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const st = world.statics;
  const im = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 }), st.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  st.forEach((b, i) => {
    s.set(b.maxx - b.minx, b.maxy - b.miny, b.maxz - b.minz); p.set((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    c.setHex(b.col ?? 0xcccccc); const j = 0.92 + ((i * 7919) % 17) / 17 * 0.14; c.multiplyScalar(j); im.setColorAt(i, c);
  });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
  // decoração (visual)
  const dec = { pyr: [], cyl: [], cone: [], box: [] };
  for (const d of world.decor) dec[d.t].push(d);
  const mk = (geo, list, rot) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), list.length);
    list.forEach((d, i) => {
      q.setFromEuler(new THREE.Euler(0, rot, 0)); s.set(d.sx, d.sy, d.sz); p.set(d.x, d.y + (d.t === 'pyr' ? d.sy / 2 : d.t === 'cone' ? d.sy / 2 : 0), d.z);
      m4.compose(p, q, s); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c.setHex(d.col));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  };
  const pyr = new THREE.ConeGeometry(0.7071, 1, 4); mk(pyr, dec.pyr, Math.PI / 4);
  mk(new THREE.CylinderGeometry(0.5, 0.5, 1, 18), dec.cyl, 0); mk(new THREE.ConeGeometry(0.5, 1, 18), dec.cone, 0); mk(boxGeo, dec.box, 0);

  // árvores, pedras e sucata
  const rnd = rngSeeded(5);
  const trees = world.nodes.filter((n) => n.t === 'tree'), rocks = world.nodes.filter((n) => n.t === 'rock'), scraps = world.nodes.filter((n) => n.t === 'scrap');
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 7), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), trees.length);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const cones = [0, 1, 2].map(() => new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), leafMat, trees.length));
  const blob = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, trees.length);
  let nb = 0;
  trees.forEach((t, i) => {
    const sc = t.s, round = i % 3 === 0;
    q.identity(); p.set(t.x, t.y + 2.2 * sc, t.z); s.set(sc, 4.6 * sc, sc); m4.compose(p, q, s); trunk.setMatrixAt(i, m4);
    c.setHSL(0.27 + rnd() * 0.06, 0.5, 0.26 + rnd() * 0.1);
    cones.forEach((cm, k) => {
      if (round) { s.set(0, 0, 0); p.set(t.x, t.y, t.z); } else { const r = [2.1, 1.65, 1.1][k] * sc, h = [2.6, 2.3, 2.0][k] * sc; p.set(t.x, t.y + (2.4 + k * 1.5) * sc + h / 2, t.z); s.set(r, h, r); }
      m4.compose(p, q, s); cm.setMatrixAt(i, m4); cm.setColorAt(i, c);
    });
    if (round) { p.set(t.x, t.y + 5 * sc, t.z); s.set(2.3 * sc, 2.0 * sc, 2.3 * sc); c.setHSL(0.22 + rnd() * 0.07, 0.55, 0.32 + rnd() * 0.08); } else { p.set(t.x, t.y - 5, t.z); s.set(0, 0, 0); }
    m4.compose(p, q, s); blob.setMatrixAt(i, m4); blob.setColorAt(i, c); nb++;
  });
  [trunk, blob, ...cones].forEach((m) => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), rocks.length);
  rocks.forEach((r, i) => { q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())); p.set(r.x, r.y + 0.5 * r.s, r.z); s.set(1.2 * r.s, 0.95 * r.s, 1.1 * r.s); m4.compose(p, q, s); rock.setMatrixAt(i, m4); rock.setColorAt(i, c.setHSL(0.08, 0.06, 0.42 + rnd() * 0.15)); });
  rock.castShadow = rock.receiveShadow = true; scene.add(rock);
  const scrap = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.5 }), scraps.length * 2);
  scraps.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)); p.set(r.x, r.y + 0.45, r.z); s.set(1.9, 0.9, 1.1); m4.compose(p, q, s); scrap.setMatrixAt(i * 2, m4); scrap.setColorAt(i * 2, c.setHex(0x8a5a3a));
    p.set(r.x + 0.2, r.y + 1.1, r.z); s.set(1.0, 0.5, 0.9); m4.compose(p, q, s); scrap.setMatrixAt(i * 2 + 1, m4); scrap.setColorAt(i * 2 + 1, c.setHex(0x6b7480));
  });
  scrap.castShadow = true; scene.add(scrap);
}

// ------------------------------------------------------------ peças de construção
const texCache = {};
function pieceTexture(mat) {
  if (texCache[mat]) return texCache[mat];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  if (mat === 'wood') {
    g.fillStyle = '#b98550'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#a9763f' : '#c4915a'; g.fillRect(0, i * 16, 128, 15); g.fillStyle = 'rgba(60,30,10,.35)'; g.fillRect(0, i * 16 + 15, 128, 1.5); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(70,40,15,.2)'; g.fillRect(Math.random() * 128, Math.random() * 128, 12 + Math.random() * 30, 1); }
  } else if (mat === 'brick') {
    g.fillStyle = '#7d7468'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { g.fillStyle = `hsl(${12 + Math.random() * 6},${45 + Math.random() * 10}%,${42 + Math.random() * 8}%)`; g.fillRect(c * 32 + (r % 2 ? 16 : 0) - 16 + 1, r * 16 + 1, 30, 14); }
  } else {
    g.fillStyle = '#9aa7b4'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#5b6672'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
    g.fillStyle = '#4f5a66'; for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118], [10, 64], [118, 64]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 6.3); g.fill(); }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (texCache[mat] = t);
}
const pieceMats = {};
export function pieceMaterial(mat) { return pieceMats[mat] || (pieceMats[mat] = new THREE.MeshStandardMaterial({ map: pieceTexture(mat), roughness: mat === 'metal' ? 0.45 : 0.85, metalness: mat === 'metal' ? 0.5 : 0 })); }
function wedgeGeometry(y0, base) {
  const A = [-2, y0, 2], B = [2, y0, 2], C = [2, y0, -2], D = [-2, y0, -2];
  const E = [-2, base, 2], F = [2, base, 2], G = [2, base + 4, -2], H = [-2, base + 4, -2];
  const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const v = [...quad(A, D, C, B), ...quad(A, B, F, E), ...quad(D, H, G, C), ...quad(A, E, H, D), ...quad(B, C, G, F), ...quad(E, F, G, H)];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = []; for (let i = 0; i < v.length / 3; i++) uv.push((v[i * 3] + v[i * 3 + 2]) * 0.25, v[i * 3 + 1] * 0.25);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}

export function createPieceMesh(c, mat) {
  let mesh;
  const cx = (c.minx + c.maxx) / 2, cz = (c.minz + c.maxz) / 2;
  if (c.type === 'ramp') {
    mesh = new THREE.Mesh(wedgeGeometry(c.miny, c.baseY), pieceMaterial(mat)); mesh.position.set(cx, 0, cz); mesh.rotation.y = -c.dir * Math.PI / 2;
    // uv da rampa simples: reaproveita escala do mundo
  } else {
    const sx = c.maxx - c.minx, sy = c.maxy - c.miny, sz = c.maxz - c.minz;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const uv = g.attributes.uv; // repete textura por metro
    const faceScale = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * faceScale[f][0] / 4, uv.getY(i) * faceScale[f][1] / 4); }
    mesh = new THREE.Mesh(g, pieceMaterial(mat)); mesh.position.set(cx, (c.miny + c.maxy) / 2, cz);
  }
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------ tempestade
export function createStorm(scene) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(150,60,255,0.0)'); gr.addColorStop(0.55, 'rgba(150,60,255,0.28)'); gr.addColorStop(1, 'rgba(190,100,255,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 20 + Math.random() * 60); }
  const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(40, 2);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 220, 96, 1, true), new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  wall.position.y = 70; wall.renderOrder = 5; scene.add(wall);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 120, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.position.y = 50; scene.add(ring);
  return { wall, ring, tx };
}

// ------------------------------------------------------------ loot
const AMMO_COL = { light: 0xffc94a, medium: 0x6fd36a, shell: 0xff6a4a, heavy: 0x66aaff };
export function createItemMesh(kind, k, r, createWeapon) {
  const g = new THREE.Group(); const col = new THREE.Color(RARITY[r || 0].c);
  if (kind === 'weapon') { const w = createWeapon(k, r); w.scale.setScalar(1.5); w.rotation.y = Math.PI / 2; g.add(w); }
  else if (kind === 'ammo') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.32), M(AMMO_COL[k], {})); g.add(b);
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6), M(0xd9d9d9, { metal: true })); s.position.set(-0.14 + i * 0.14, 0.22, 0); g.add(s); }
    col.set(AMMO_COL[k]);
  } else {
    const cons = { bandage: 0xf4f4f4, medkit: 0xff3b3b, minishield: 0x53c8ff, shieldpot: 0x2a7bff }[k];
    if (k === 'bandage' || k === 'medkit') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(k === 'medkit' ? 0.6 : 0.4, k === 'medkit' ? 0.4 : 0.2, 0.3), M(cons)); g.add(b);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.32), M(0xd32), 0); c1.material = M(k === 'medkit' ? 0xffffff : 0xe03030); c1.position.y = 0.0; c1.position.z = 0.0; b.add(c1);
      const c2 = c1.clone(); c2.rotation.y = Math.PI / 2; b.add(c2);
    } else {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.4, 10), M(cons, { opacity: 0.85 })); g.add(b);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), M(0xdddddd)); t.position.y = 0.26; g.add(t);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), M(cons, { glow: true })); gl.position.y = -0.02; g.add(gl);
    }
    col.set(cons);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.5; g.add(beam); g.userData.beam = beam;
  const base = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; base.position.y = -0.25; g.add(base);
  g.userData.inner = g.children[0];
  return g;
}

export function createChestMesh() {
  const g = new THREE.Group();
  const gold = M(0xe8b83a, { metal: true }), wood = M(0x8a4f1f);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), wood); base.position.y = 0.28; g.add(base);
  const lid = new THREE.Group(); lid.position.set(0, 0.56, -0.35); g.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI), wood); top.rotation.z = Math.PI / 2; top.position.set(0, 0, 0.35); lid.add(top);
  for (const x of [-0.5, 0, 0.5]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.74), gold); band.position.set(x, 0.28, 0); g.add(band); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), gold); lock.position.set(0, 0.55, 0.37); g.add(lock);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); glow.position.y = 2.4; g.add(glow);
  g.userData.lid = lid; g.userData.glow = glow;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
