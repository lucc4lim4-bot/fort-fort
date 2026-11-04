// Modelos 3D procedurais: 10 skins de personagem (estilo cartoon com contorno) + armas.
import * as THREE from 'three';
import { getAsset, findNode } from './assets.js';

const gradCanvas = document.createElement('canvas'); gradCanvas.width = 4; gradCanvas.height = 1;
{ const g = gradCanvas.getContext('2d'); ['#6b6b78', '#a8a8b4', '#e0e0e8', '#ffffff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(i, 0, 1, 1); }); }
const gradient = new THREE.CanvasTexture(gradCanvas); gradient.minFilter = gradient.magFilter = THREE.NearestFilter;

const matCache = new Map();
export function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = matCache.get(key);
  if (!m) {
    if (o.glow) m = new THREE.MeshBasicMaterial({ color: o.glow === true ? color : o.glow, transparent: !!o.opacity, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide });
    else if (o.metal) m = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.28, ...o.std });
    else m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.62, metalness: 0, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide });
    matCache.set(key, m);
  }
  return m;
}
const OUT = new THREE.MeshBasicMaterial({ color: 0x0c0c12, side: THREE.BackSide });

const G = {
  sph: new Map(), cap: new Map(), box: new Map(), cyl: new Map(), cone: new Map(), lathe: new Map(),
};
function geo(cache, key, make) { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; }
const sph = (r, m, ws = 18, hs = 14) => new THREE.Mesh(geo(G.sph, `${r}/${ws}`, () => new THREE.SphereGeometry(r, ws, hs)), m);
const cap = (r, l, m) => new THREE.Mesh(geo(G.cap, `${r}/${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12)), m);
const box = (x, y, z, m) => new THREE.Mesh(geo(G.box, `${x}/${y}/${z}`, () => new THREE.BoxGeometry(x, y, z)), m);
const cyl = (rt, rb, h, m, s = 12) => new THREE.Mesh(geo(G.cyl, `${rt}/${rb}/${h}/${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)), m);
const cone = (r, h, m, s = 10) => new THREE.Mesh(geo(G.cone, `${r}/${h}/${s}`, () => new THREE.ConeGeometry(r, h, s)), m);
function put(parent, mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh;
}
function outlined(mesh) { mesh.castShadow = true; return mesh; } // visual sem contorno (sombreamento suave)
function shadowAll(g) { g.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; }); }

// ---------------------------------------------------------------- formas orgânicas
function latheGeo(key, pts, segs = 16) {
  return geo(G.lathe, key, () => { const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs); g.computeVertexNormals(); return g; });
}
// membro afunilado com pontas arredondadas: origem na junta de cima, pendurado para -y
function limbGeo(rTop, rBot, len) {
  return latheGeo(`limb${rTop}/${rBot}/${len}`, (() => {
    const p = [];
    for (let k = 0; k <= 5; k++) { const a = (k / 5) * Math.PI / 2; p.push([Math.max(0.0001, rBot * Math.sin(a)), -len - rBot * Math.cos(a)]); }
    for (let k = 0; k <= 5; k++) { const b = (k / 5) * Math.PI / 2; p.push([Math.max(0.0001, rTop * Math.cos(b)), rTop * Math.sin(b) * 0.6]); }
    return p;
  })(), 14);
}
const limb = (rT, rB, len, m) => new THREE.Mesh(limbGeo(rT, rB, len), m);
const TORSO_PTS = [[0.0001, -0.02], [0.15, -0.01], [0.168, 0.05], [0.165, 0.12], [0.185, 0.24], [0.205, 0.36], [0.2, 0.44], [0.16, 0.52], [0.09, 0.565], [0.0001, 0.58]];
const PELVIS_PTS = [[0.0001, -0.13], [0.11, -0.12], [0.165, -0.05], [0.17, 0.03], [0.15, 0.09], [0.0001, 0.1]];

// ---------------------------------------------------------------- rig base (proporções estilo cartoon heroico)
function buildRig(sp) {
  const rig = { outlines: [], phase: 0, t: Math.random() * 10, swing: 0, dead: 0, land: 0, air: 0 };
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; rig.root = root;
  const hips = new THREE.Group(); hips.position.y = 0.84; root.add(hips); rig.hips = hips;
  const pelvis = new THREE.Mesh(latheGeo('pelvis', PELVIS_PTS), M(sp.pants)); pelvis.scale.set(1, 1, 0.74); put(hips, pelvis, 0, 0, 0); rig.pelvis = pelvis;
  put(hips, cyl(0.172, 0.172, 0.05, M(sp.belt ?? 0x2a2420), 18), 0, 0.06, 0).scale.set(1, 1, 0.76);
  put(hips, box(0.06, 0.05, 0.02, M(0xd8c060, { metal: true })), 0, 0.06, 0.132);
  const torso = new THREE.Group(); torso.position.y = 0.06; torso.rotation.order = 'YXZ'; hips.add(torso); rig.torso = torso;
  const chest = new THREE.Mesh(latheGeo('torso', TORSO_PTS, 18), M(sp.shirt)); chest.scale.set(1.08, 1, 0.72); put(torso, chest, 0, 0, 0); rig.chest = chest;
  rig.back = new THREE.Group(); rig.back.position.set(0, 0.32, -0.15); torso.add(rig.back);
  rig.front = new THREE.Group(); rig.front.position.set(0, 0.3, 0.145); torso.add(rig.front);
  put(torso, cyl(0.07, 0.085, 0.12, M(sp.skin), 12), 0, 0.6, 0); // pescoço
  // cabeça
  const head = new THREE.Group(); head.position.y = 0.64; head.scale.setScalar(1.28); head.rotation.order = 'YXZ'; torso.add(head); rig.head = head;
  const skull = sph(0.2, M(sp.skin), 24, 18); skull.scale.set(0.98, 1.06, 1.0); put(head, skull, 0, 0.11, 0); rig.skull = skull;
  const jaw = sph(0.165, M(sp.skin), 18, 12); jaw.scale.set(1, 0.78, 1); put(skull, jaw, 0, -0.07, 0.025);
  for (const e of [-1, 1]) { const ear = sph(0.048, M(sp.skin), 10, 8); ear.scale.set(0.45, 1, 0.75); put(skull, ear, e * 0.195, -0.01, -0.01); }
  if (sp.hairStyle) {
    const hc = M(sp.hairColor || 0x4a2f1a);
    const capH = new THREE.Mesh(geo(G.sph, 'hairCap2', () => new THREE.SphereGeometry(0.212, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)), hc);
    put(head, capH, 0, 0.125, -0.012, -0.28, 0, 0);
    for (let i = 0; i < 5; i++) { const t = sph(0.07, hc, 10, 8); t.scale.set(1, 0.6, 1.3); put(head, t, -0.12 + i * 0.06, 0.29 - Math.abs(i - 2) * 0.012, 0.11, 0.5, 0, (i - 2) * 0.25); }
    if (sp.hairStyle === 'long') { const l = sph(0.2, hc, 14, 10); l.scale.set(1, 1.3, 0.45); put(head, l, 0, 0.0, -0.13); }
  }
  rig.face = new THREE.Group(); rig.face.position.set(0, 0.105, 0.175); head.add(rig.face);
  if (!sp.noFace) {
    const white = M(0xffffff), iris = M(sp.iris ?? sp.eye ?? 0x5b3b22), pup = M(sp.pupil || 0x111114), shine = M(0xffffff, { glow: true });
    for (const s of [-1, 1]) {
      const ew = sph(0.046, sp.eye ? M(sp.eye) : white, 14, 10); ew.scale.set(0.9, 1.2, 0.55); put(rig.face, ew, s * 0.072, 0.03, 0.0);
      const ir = sph(0.03, iris, 12, 8); ir.scale.set(1, 1.15, 0.5); put(rig.face, ir, s * 0.07, 0.026, 0.022);
      put(rig.face, sph(0.016, pup, 8, 6), s * 0.07, 0.026, 0.033).scale.set(1, 1.1, 0.5);
      put(rig.face, sph(0.008, shine, 6, 4), s * 0.07 + 0.01, 0.042, 0.04);
      const br = box(0.085, 0.022, 0.025, M(sp.brow || sp.hairColor || 0x3a2a1c)); put(rig.face, br, s * 0.075, 0.1, 0.0, 0, 0, -s * 0.18);
    }
    const nose = sph(0.028, M(sp.skin), 10, 8); nose.scale.set(0.9, 0.8, 1); put(rig.face, nose, 0, -0.018, 0.035);
    const mouth = new THREE.Mesh(geo(G.cyl, 'smile', () => new THREE.TorusGeometry(0.042, 0.009, 6, 14, Math.PI)), M(0x6a2626)); put(rig.face, mouth, 0, -0.06, 0.012, 0, 0, Math.PI);
    rig.mouth = mouth;
  }
  // braços
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.225, 0.47, 0); sh.rotation.order = 'YXZ'; torso.add(sh);
    put(sh, sph(0.095, M(sp.shirtB || sp.sleeve || sp.shirt), 14, 10), 0, 0, 0);
    const up = limb(0.083, 0.068, 0.22, M(sp.sleeve ?? sp.shirt)); put(sh, up, 0, -0.02, 0);
    const el = new THREE.Group(); el.position.y = -0.29; el.rotation.order = 'YXZ'; sh.add(el);
    const lo = limb(0.068, 0.056, 0.2, M(sp.forearm ?? sp.skin)); put(el, lo, 0, 0, 0);
    const hand = sph(0.074, M(sp.glove ?? sp.skin), 14, 10); hand.scale.set(0.9, 1.15, 0.75); put(el, hand, 0, -0.285, 0.005);
    const thumb = limb(0.026, 0.022, 0.05, M(sp.glove ?? sp.skin)); put(hand, thumb, -s * 0.055, 0.02, 0.04, 0.6, 0, s * 0.6);
    arms.push({ sh, el, hand, up, lo });
  }
  rig.armL = arms[0]; rig.armR = arms[1];
  rig.mount = new THREE.Group(); rig.mount.position.set(0, -0.3, 0.02); rig.mount.rotation.x = Math.PI / 2; arms[1].el.add(rig.mount);
  // pernas
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.03, 0); hp.rotation.order = 'XZY'; hips.add(hp);
    const th = limb(0.112, 0.088, 0.33, M(sp.pants)); put(hp, th, 0, 0, 0);
    const kn = new THREE.Group(); kn.position.y = -0.41; hp.add(kn);
    const sn = limb(0.088, 0.07, 0.31, M(sp.shin ?? sp.pants)); put(kn, sn, 0, 0, 0);
    const ftG = new THREE.Group(); ftG.position.y = -0.37; kn.add(ftG);
    const ft = sph(0.1, M(sp.shoes), 16, 10); ft.scale.set(0.85, 0.55, 1.55); put(ftG, ft, 0, -0.01, 0.06);
    put(ftG, box(0.16, 0.035, 0.31, M(sp.sole ?? 0xece8e0)), 0, -0.05, 0.06);
    legs.push({ hp, kn, th, sn, ft, ftG });
  }
  rig.legL = legs[0]; rig.legR = legs[1];
  rig.glider = buildGlider(sp); root.add(rig.glider);
  rig.spec = sp;
  return rig;
}
function buildGlider(sp) {
  const gl = new THREE.Group(); gl.visible = false;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(1.9, 6, 8, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.3), M(i % 2 ? 0xffffff : (sp.gliderColor || 0xff4f6b), { side: THREE.DoubleSide }));
    seg.scale.set(1, 0.48, 1); put(gl, seg, 0, 2.5, 0);
  }
  put(gl, cyl(0.05, 0.05, 0.12, M(0x222222), 8), 0, 3.42, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; const ln = cyl(0.01, 0.01, 1.6, M(0x222222), 4); put(gl, ln, Math.cos(a) * 0.55, 1.65, Math.sin(a) * 0.55); ln.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  const g2 = getAsset('glider', 'default'); if (g2) { gl.clear(); g2.position.y = 1.7; gl.add(g2); }
  return gl;
}

// ---------------------------------------------------------------- skins
const SKIN_BUILD = [
  // 0 Comandante Tático
  (rig) => {
    const camo = M(0x4b5a3a), dark = M(0x2a3324), vestM = M(0x39452f);
    const vest = cap(0.205, 0.17, vestM); vest.scale.set(1.14, 1, 0.84); put(rig.torso, vest, 0, 0.3, 0.01); outlined(vest, rig, 1.05);
    for (const s of [-1, 1]) { put(rig.front, box(0.1, 0.12, 0.06, dark), s * 0.1, -0.05, 0.05); put(rig.front, box(0.1, 0.12, 0.06, dark), s * 0.1, -0.2, 0.05); }
    put(rig.front, box(0.06, 0.04, 0.02, M(0xf0e060)), 0.12, 0.12, 0.03);
    const helm = sph(0.225, M(0x56653f), 18, 10); helm.scale.set(1.0, 0.85, 1.06); helm.geometry = geo(G.sph, 'helm', () => new THREE.SphereGeometry(0.225, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58)); put(rig.head, helm, 0, 0.13, 0); outlined(helm, rig, 1.05);
    put(rig.head, cyl(0.235, 0.235, 0.025, dark, 20), 0, 0.075, 0.01);
    put(rig.head, box(0.26, 0.07, 0.05, M(0x4bd1ff, { glow: true })), 0, 0.16, 0.2);
    put(rig.head, box(0.28, 0.02, 0.03, dark), 0, 0.16, 0.18);
    const bag = box(0.34, 0.4, 0.16, M(0x4d5a3a)); put(rig.back, bag, 0, -0.02, -0.08); outlined(bag, rig, 1.05);
    put(rig.back, box(0.3, 0.1, 0.17, dark), 0, 0.2, -0.08);
    for (const a of [rig.armL, rig.armR]) put(a.sh, box(0.1, 0.05, 0.13, dark), 0, -0.07, 0);
    for (const l of [rig.legL, rig.legR]) put(l.kn, box(0.16, 0.07, 0.17, dark), 0, 0.02, 0.01);
  },
  // 1 Ninja Sombra
  (rig) => {
    const red = M(0xd8232f), blk = M(0x1a1a22);
    const hood = sph(0.215, M(0x1b1b24), 18, 12); hood.scale.set(1.0, 1.05, 1.04); put(rig.head, hood, 0, 0.1, -0.005); outlined(hood, rig, 1.05);
    put(rig.head, box(0.36, 0.085, 0.3, M(0xe3b48f)), 0, 0.12, 0.09);
    put(rig.head, cyl(0.215, 0.215, 0.07, red, 20), 0, 0.19, 0, 0, 0, 0);
    for (const s of [-1, 1]) { const tail = box(0.05, 0.3, 0.015, red); put(rig.head, tail, s * 0.05, 0.12, -0.26, 0.35, 0, s * 0.3); }
    put(rig.head, box(0.07, 0.07, 0.04, M(0xf3f3f3)), 0, 0.2, 0.2);
    const scarf = cyl(0.14, 0.17, 0.1, red, 14); put(rig.torso, scarf, 0, 0.62, 0); const tail = box(0.1, 0.5, 0.02, red); put(rig.back, tail, 0.08, 0.2, -0.05, 0.12, 0, 0.1);
    put(rig.torso, box(0.38, 0.07, 0.24, red), 0, 0.02, 0);
    const kat = new THREE.Group(); put(kat, cyl(0.016, 0.016, 0.95, M(0xdfe6ee, { metal: true }), 6), 0, 0.2, 0); put(kat, box(0.1, 0.02, 0.1, M(0xd8a738)), 0, -0.28, 0); put(kat, cyl(0.022, 0.022, 0.2, blk, 6), 0, -0.4, 0);
    kat.rotation.z = 0.7; put(rig.back, kat, 0, 0.1, -0.05); kat.position.z = -0.06;
    for (const l of [rig.legL, rig.legR]) put(l.kn, box(0.15, 0.05, 0.16, red), 0, 0.2, 0.01);
    for (const a of [rig.armL, rig.armR]) put(a.el, box(0.12, 0.06, 0.12, red), 0, -0.05, 0);
  },
  // 2 Robô Alfa-7
  (rig) => {
    const metal = M(0xc9d4e0, { metal: true }), dark = M(0x2a3340, { metal: true }), glow = M(0x37e8ff, { glow: true });
    rig.skull.material = metal; rig.face.visible = false;
    const hb = box(0.34, 0.28, 0.3, metal); put(rig.head, hb, 0, 0.1, 0); outlined(hb, rig, 1.06); rig.skull.visible = false;
    put(rig.head, box(0.28, 0.1, 0.05, glow), 0, 0.13, 0.16); put(rig.head, box(0.18, 0.025, 0.04, dark), 0, 0.02, 0.16);
    for (const s of [-1, 1]) put(rig.head, cyl(0.07, 0.07, 0.06, dark, 12), s * 0.2, 0.1, 0, 0, 0, Math.PI / 2);
    put(rig.head, cyl(0.012, 0.012, 0.2, dark, 6), 0, 0.34, 0); put(rig.head, sph(0.04, M(0xff4545, { glow: true }), 8, 6), 0, 0.46, 0);
    put(rig.front, box(0.2, 0.18, 0.04, glow), 0, 0.05, 0.04); put(rig.front, box(0.28, 0.05, 0.04, dark), 0, 0.2, 0.03);
    put(rig.back, box(0.28, 0.3, 0.1, dark), 0, 0.05, -0.04);
    for (const a of [rig.armL, rig.armR]) { put(a.sh, sph(0.1, dark, 10, 8), 0, 0, 0); put(a.el, sph(0.065, dark, 8, 6), 0, 0, 0); }
    for (const l of [rig.legL, rig.legR]) { put(l.kn, sph(0.085, dark, 8, 6), 0, 0, 0.02); put(l.hp, box(0.16, 0.06, 0.16, glow), 0, -0.4, 0.04).scale.set(0.01, 0.01, 0.01); }
  },
  // 3 Astronauta Cósmico
  (rig) => {
    const w = M(0xf1f3f7), org = M(0xff7a1a);
    const bub = sph(0.31, M(0xbfe6ff, { opacity: 0.28 }), 20, 16); put(rig.head, bub, 0, 0.1, 0.01);
    put(rig.head, cyl(0.2, 0.22, 0.07, w, 18), 0, -0.1, 0);
    const bag = box(0.42, 0.5, 0.2, w); put(rig.back, bag, 0, -0.02, -0.1); outlined(bag, rig, 1.04);
    put(rig.back, box(0.1, 0.38, 0.06, org), -0.1, -0.02, -0.2); put(rig.back, box(0.1, 0.38, 0.06, org), 0.1, -0.02, -0.2);
    put(rig.front, box(0.22, 0.16, 0.05, M(0x2f3a4a)), 0, 0.02, 0.05); put(rig.front, sph(0.025, M(0xff3b3b, { glow: true }), 6, 6), -0.06, 0.04, 0.085); put(rig.front, sph(0.025, M(0x38ff88, { glow: true }), 6, 6), 0.0, 0.04, 0.085);
    put(rig.front, box(0.1, 0.07, 0.02, M(0x2f6fe0)), 0.13, 0.22, 0.03);
    for (const a of [rig.armL, rig.armR]) put(a.el, cyl(0.075, 0.075, 0.05, org, 10), 0, -0.2, 0);
    put(rig.torso, cyl(0.2, 0.2, 0.07, org, 16), 0, 0.03, 0);
  },
  // 4 Dragão Rubro
  (rig) => {
    const red = M(0xb3262c), dark = M(0x6a1217), belly = M(0xf1b866), horn = M(0xf3e6c4);
    rig.face.visible = true;
    const snout = box(0.17, 0.12, 0.2, red); put(rig.head, snout, 0, 0.04, 0.2); outlined(snout, rig, 1.08);
    put(rig.head, box(0.15, 0.03, 0.18, M(0x2a0a0c)), 0, -0.02, 0.2);
    for (const s of [-1, 1]) { put(rig.head, sph(0.018, M(0x2a0a0c), 6, 4), s * 0.04, 0.08, 0.3); put(rig.head, cone(0.04, 0.34, horn, 8), s * 0.12, 0.3, -0.05, -0.5, 0, -s * 0.35); put(rig.head, cone(0.03, 0.12, horn, 6), s * 0.18, 0.02, 0.06, 0, 0, -s * 1.2); }
    put(rig.front, box(0.22, 0.34, 0.04, belly), 0, 0.0, 0.05);
    for (let i = 0; i < 6; i++) put(rig.back, cone(0.04, 0.12 - i * 0.008, dark, 6), 0, 0.42 - i * 0.12, -0.02, -0.6, 0, 0);
    // cauda
    let p = rig.hips, r = 0.07; const tail = [];
    for (let i = 0; i < 4; i++) { const seg = new THREE.Group(); seg.position.set(0, i === 0 ? -0.05 : 0, i === 0 ? -0.13 : -0.17); p.add(seg); const m = cap(r, 0.12, red); m.rotation.x = Math.PI / 2; seg.add(m); if (i < 3) put(seg, cone(0.03, 0.08, dark, 5), 0, 0.07, 0, 0, 0, 0); p = seg; r *= 0.8; tail.push(seg); }
    rig.tail = tail;
    // asas
    const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.55, 0.6, -0.1, 0.9, 0.1, -0.1, 0, 0, 0, 0.9, 0.1, -0.1, 0.55, -0.35, -0.05, 0, 0, 0, 0.55, -0.35, -0.05, 0.1, -0.4, 0], 3)); wingG.computeVertexNormals();
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(wingG, M(0x8a1c22, { side: THREE.DoubleSide })); wing.scale.x = s; wing.position.set(s * 0.05, 0.3, -0.05); wing.rotation.set(0, s * 0.45, 0); rig.back.add(wing); put(wing, cyl(0.014, 0.014, 0.95, dark, 5), 0.45, 0.28, -0.1, 0, 0, -1.1); (rig.wings ||= []).push(wing); }
    for (const l of [rig.legL, rig.legR]) { for (const x of [-0.04, 0, 0.04]) put(l.kn, cone(0.02, 0.07, horn, 5), x, -0.42, 0.18, Math.PI / 2, 0, 0); }
  },
  // 5 Capitão Pirata
  (rig) => {
    const coat = M(0x7a1f2b), gold = M(0xe6b73a, { metal: true }), blk = M(0x16161c), white = M(0xf2ead8), hair = M(0x2a1a10);
    const co = cap(0.205, 0.2, coat); co.scale.set(1.16, 1, 0.84); put(rig.torso, co, 0, 0.26, 0); outlined(co, rig, 1.05);
    put(rig.front, box(0.13, 0.32, 0.03, white), 0, 0.04, 0.06);
    for (let i = 0; i < 3; i++) put(rig.front, sph(0.016, gold, 6, 5), 0.06, 0.12 - i * 0.1, 0.1);
    put(rig.torso, box(0.42, 0.06, 0.26, blk), 0, 0.02, 0); put(rig.torso, box(0.06, 0.06, 0.03, gold), 0, 0.02, 0.135);
    const brim = cyl(0.3, 0.3, 0.035, blk, 3); brim.rotation.y = 0.2; put(rig.head, brim, 0, 0.27, 0);
    put(rig.head, cyl(0.2, 0.22, 0.12, blk, 16), 0, 0.31, 0); put(rig.head, sph(0.04, white, 8, 6), 0, 0.33, 0.21); put(rig.head, box(0.07, 0.015, 0.02, white), 0, 0.31, 0.215);
    put(rig.head, box(0.07, 0.08, 0.03, blk), -0.075, 0.14, 0.19); put(rig.head, box(0.4, 0.015, 0.02, blk), 0, 0.17, 0.17, 0, 0, 0.1);
    const beard = box(0.22, 0.12, 0.1, hair); put(rig.head, beard, 0, -0.04, 0.15, 0.2, 0, 0); put(rig.head, box(0.13, 0.04, 0.05, hair), 0, 0.0, 0.2);
    for (const l of [rig.legL, rig.legR]) put(l.kn, cyl(0.092, 0.11, 0.2, blk, 10), 0, -0.16, 0);
    for (const a of [rig.armL, rig.armR]) put(a.el, cyl(0.075, 0.09, 0.08, white, 10), 0, -0.22, 0);
  },
  // 6 Zumbi Faminto
  (rig) => {
    const flesh = M(0x8cb56c), pink = M(0xd98a9a), rag = M(0x5a4a3a);
    const brain = sph(0.15, pink, 10, 8); put(rig.head, brain, 0.03, 0.26, -0.03); outlined(brain, rig, 1.06);
    for (let i = 0; i < 4; i++) put(rig.head, sph(0.05, M(0xc4727f), 6, 5), Math.cos(i * 1.6) * 0.09 + 0.03, 0.34, Math.sin(i * 1.6) * 0.09 - 0.03);
    put(rig.face, box(0.1, 0.035, 0.02, M(0x6a1010)), 0, -0.07, 0.03); for (const x of [-0.03, 0, 0.03]) put(rig.face, box(0.012, 0.03, 0.02, M(0xe8e0c8)), x, -0.055, 0.04);
    rig.face.children[1].scale.setScalar(1.3);
    put(rig.head, box(0.07, 0.015, 0.02, M(0x4a2a2a)), 0.07, 0.05, 0.19, 0, 0, 0.6);
    for (let i = 0; i < 4; i++) put(rig.front, box(0.06, 0.1, 0.02, M(0xd0c8b0)), -0.15 + i * 0.1, 0.1, 0.05);
    put(rig.front, box(0.14, 0.1, 0.02, flesh), 0.04, -0.05, 0.05);
    for (const l of [rig.legL]) put(l.kn, box(0.17, 0.12, 0.16, flesh), 0, 0.04, 0);
    for (const a of [rig.armL, rig.armR]) { put(a.el, box(0.11, 0.015, 0.11, M(0x4a2a2a)), 0, -0.06, 0); }
    put(rig.armR.sh, cone(0.04, 0.12, rag, 5), 0.0, -0.3, 0.07, 3.14, 0, 0);
  },
  // 7 Cavaleiro Dourado
  (rig) => {
    const gold = M(0xe8b83a, { metal: true }), dark = M(0x8a6b1a, { metal: true }), red = M(0xb3222c, { side: THREE.DoubleSide });
    const helm = sph(0.235, gold, 18, 14); helm.scale.set(1, 1.1, 1.04); put(rig.head, helm, 0, 0.1, 0); outlined(helm, rig, 1.05); rig.face.visible = false; rig.skull.visible = false;
    put(rig.head, box(0.3, 0.05, 0.1, M(0x16161c)), 0, 0.12, 0.2); put(rig.head, box(0.05, 0.22, 0.1, M(0x16161c)), 0, 0.06, 0.2);
    put(rig.head, cyl(0.02, 0.02, 0.5, dark, 6), 0, 0.36, 0, 0, 0, 0); put(rig.head, box(0.07, 0.1, 0.4, red), 0, 0.4, -0.12, 0.3, 0, 0);
    const pl = cap(0.21, 0.2, gold); pl.scale.set(1.16, 1, 0.86); put(rig.torso, pl, 0, 0.27, 0.01); outlined(pl, rig, 1.04);
    put(rig.front, box(0.1, 0.34, 0.03, dark), 0, 0.05, 0.1);
    for (const a of [rig.armL, rig.armR]) { put(a.sh, sph(0.13, gold, 12, 8), 0, 0.02, 0).scale.set(1, 0.7, 1); put(a.el, cyl(0.07, 0.075, 0.18, gold, 10), 0, -0.1, 0); }
    for (const l of [rig.legL, rig.legR]) { put(l.kn, sph(0.1, gold, 8, 6), 0, 0, 0.04); put(l.kn, cyl(0.08, 0.085, 0.3, gold, 10), 0, -0.2, 0.01); }
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.95, 1, 6), red); cape.position.set(0, -0.12, -0.12); cape.rotation.x = 0.1; rig.back.add(cape); rig.cape = cape;
    put(rig.torso, box(0.42, 0.06, 0.26, dark), 0, 0.03, 0);
  },
  // 8 Gatinha Neon
  (rig) => {
    const pink = M(0xff4fd8, { glow: true }), cy = M(0x37f0ff, { glow: true }), suit = M(0x2a1442);
    const hair = sph(0.215, M(0x2b0f4a), 18, 12); hair.scale.set(1.02, 1.0, 1.06); hair.geometry = geo(G.sph, 'hairNeon', () => new THREE.SphereGeometry(0.215, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62)); put(rig.head, hair, 0, 0.115, -0.015); outlined(hair, rig, 1.05);
    for (const s of [-1, 1]) { const e = cone(0.085, 0.24, M(0x2b0f4a), 4); put(rig.head, e, s * 0.13, 0.33, -0.02, 0, Math.PI / 4, -s * 0.25); outlined(e, rig, 1.07); put(rig.head, cone(0.045, 0.15, pink, 4), s * 0.13, 0.31, 0.0, 0, Math.PI / 4, -s * 0.25); put(rig.head, sph(0.06, pink, 8, 6), s * 0.17, 0.12, -0.12); }
    put(rig.head, box(0.36, 0.07, 0.04, cy), 0, 0.15, 0.185);
    put(rig.front, box(0.3, 0.025, 0.02, pink), 0, 0.28, 0.12); put(rig.front, box(0.025, 0.4, 0.02, cy), 0.1, 0.0, 0.07); put(rig.front, box(0.025, 0.4, 0.02, cy), -0.1, 0.0, 0.07);
    for (const l of [rig.legL, rig.legR]) { put(l.th, box(0.02, 0.38, 0.02, pink), 0.085, 0, 0.0); put(l.sn, box(0.02, 0.36, 0.02, cy), 0.07, 0, 0.0); }
    for (const a of [rig.armL, rig.armR]) put(a.el, cyl(0.062, 0.062, 0.04, pink, 10), 0, -0.2, 0);
    let p = rig.hips; const tail = [];
    for (let i = 0; i < 4; i++) { const sg = new THREE.Group(); sg.position.set(0, i === 0 ? 0.02 : 0, i === 0 ? -0.14 : -0.12); p.add(sg); const m = cap(0.035, 0.08, i % 2 ? pink : suit); m.rotation.x = Math.PI / 2; sg.add(m); p = sg; tail.push(sg); }
    rig.tail = tail;
  },
  // 9 Rei Abóbora
  (rig) => {
    const og = M(0xff8a1a), glow = M(0xffe35a, { glow: true }), suit = M(0x1b1a24);
    rig.skull.visible = false; rig.face.visible = false;
    const pump = sph(0.28, og, 18, 14); pump.scale.set(1.12, 0.92, 1.08); put(rig.head, pump, 0, 0.1, 0); outlined(pump, rig, 1.05);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; const rib = sph(0.28, M(0xe77510), 12, 10); rib.scale.set(0.12 + 0.0, 0.93, 1.08); rib.rotation.y = a; rib.position.set(0, 0.1, 0); rig.head.add(rib); }
    put(rig.head, cyl(0.035, 0.05, 0.14, M(0x3d7a2a), 6), 0.01, 0.37, 0, 0.15, 0, 0.2);
    for (const s of [-1, 1]) put(rig.head, cone(0.065, 0.1, glow, 3), s * 0.1, 0.15, 0.28, 0, 0, s > 0 ? 0 : 0).rotation.set(Math.PI / 2, 0, Math.PI);
    put(rig.head, cone(0.04, 0.05, glow, 3), 0, 0.06, 0.3).rotation.set(Math.PI / 2, 0, 0);
    const mouth = box(0.26, 0.07, 0.04, glow); put(rig.head, mouth, 0, -0.03, 0.29); for (const x of [-0.08, 0.04]) put(rig.head, box(0.04, 0.05, 0.05, og), x, 0.0, 0.3);
    put(rig.head, sph(0.19, M(0xffb347, { glow: true, opacity: 0.18 }), 8, 6), 0, 0.1, 0.0);
    put(rig.torso, cyl(0.12, 0.14, 0.05, M(0xffffff), 10), 0, 0.64, 0);
    const bow = new THREE.Group(); for (const s of [-1, 1]) put(bow, cone(0.06, 0.1, og, 3), s * 0.06, 0, 0, 0, 0, s * Math.PI / 2); put(bow, sph(0.025, og, 6, 5)); put(rig.torso, bow, 0, 0.6, 0.12);
    for (let i = 0; i < 3; i++) put(rig.front, sph(0.02, og, 6, 5), 0, 0.15 - i * 0.12, 0.08);
  },
];

const SPECS = [
  { skin: 0xe8b890, shirt: 0x4b5a3a, pants: 0x55633f, shoes: 0x1c1c1c, hair: 0x3a2a1c, gliderColor: 0x56653f },
  { skin: 0xe3b48f, shirt: 0x1b1b24, pants: 0x1b1b24, shoes: 0x16161c, glove: 0x16161c, gliderColor: 0xd8232f, noFace: true },
  { skin: 0xc9d4e0, shirt: 0xb7c3d0, pants: 0xaeb9c6, shoes: 0x2a3340, glove: 0x2a3340, forearm: 0xaeb9c6, gliderColor: 0x37e8ff, noFace: true },
  { hairStyle: 'short', hairColor: 0x6b4423, skin: 0xf0c8a0, shirt: 0xf1f3f7, pants: 0xe6e9ef, shoes: 0x8890a0, glove: 0xff7a1a, gliderColor: 0xff7a1a },
  { skin: 0xc2392f, shirt: 0xb3262c, pants: 0x8f1d23, shoes: 0x4a0f12, glove: 0xb3262c, forearm: 0xb3262c, eye: 0xffe35a, pupil: 0x1a0505, brow: 0x4a0f12, gliderColor: 0xb3262c },
  { skin: 0xd9a77a, shirt: 0xf2ead8, pants: 0x1c1c24, shoes: 0x141418, sleeve: 0x7a1f2b, glove: 0xd9a77a, gliderColor: 0x16161c, hair: 0x2a1a10 },
  { skin: 0x8cb56c, shirt: 0x5a4a3a, pants: 0x3f4a5a, shoes: 0x2a2a2a, eye: 0xf4f0c0, pupil: 0x7a1010, brow: 0x3a4a2a, gliderColor: 0x6a8a4a },
  { skin: 0xe8b890, shirt: 0xe8b83a, pants: 0xd0a02e, shoes: 0x8a6b1a, sleeve: 0xe8b83a, glove: 0xd0a02e, forearm: 0xd0a02e, gliderColor: 0xb3222c },
  { skin: 0xf3c9b0, shirt: 0x2a1442, pants: 0x2a1442, shoes: 0xff4fd8, glove: 0x37f0ff, eye: 0xe9ffff, pupil: 0xff4fd8, brow: 0xff4fd8, gliderColor: 0xff4fd8 },
  { skin: 0xe8b890, shirt: 0x1b1a24, pants: 0x1b1a24, shoes: 0x0f0f14, glove: 0xf4f4f4, gliderColor: 0xff8a1a },
];

// Nomes de nós aceitos em personagens GLB (sem skinning: cada parte é filha da junta).
export const CHAR_JOINTS = {
  hips: ['hips', 'Hips'], torso: ['torso', 'Spine', 'spine'], head: ['head', 'Head'],
  shoulder_L: ['shoulder_L', 'LeftArm'], elbow_L: ['elbow_L', 'LeftForeArm'], shoulder_R: ['shoulder_R', 'RightArm'], elbow_R: ['elbow_R', 'RightForeArm'],
  leg_L: ['leg_L', 'LeftUpLeg'], knee_L: ['knee_L', 'LeftLeg'], foot_L: ['foot_L', 'LeftFoot'], leg_R: ['leg_R', 'RightUpLeg'], knee_R: ['knee_R', 'RightLeg'], foot_R: ['foot_R', 'RightFoot'],
  hand_R_socket: ['hand_R_socket', 'RightHandSocket', 'RightHand'],
};
function rigFromAsset(model, sp) {
  const j = {}; for (const [k, names] of Object.entries(CHAR_JOINTS)) j[k] = findNode(model, names);
  const required = ['hips', 'torso', 'head', 'shoulder_L', 'elbow_L', 'shoulder_R', 'elbow_R', 'leg_L', 'knee_L', 'leg_R', 'knee_R'];
  const missing = required.filter((k) => !j[k]);
  if (missing.length) { console.warn('[assets] personagem GLB sem juntas:', missing.join(', '), '— usando procedural'); return null; }
  const rig = { outlines: [], phase: 0, t: Math.random() * 10, swing: 0, dead: 0, land: 0, air: 0, fromAsset: true };
  rig.root = new THREE.Group(); rig.root.rotation.order = 'YXZ'; rig.root.add(model);
  rig.hips = j.hips; rig.torso = j.torso; rig.head = j.head; rig.chest = j.torso; rig.skull = j.head;
  rig.face = new THREE.Group(); rig.back = new THREE.Group(); rig.front = new THREE.Group();
  [j.torso, j.head].forEach((o) => (o.rotation.order = 'YXZ'));
  const foot = (o, parent) => o || parent.add(new THREE.Object3D()) && parent.children[parent.children.length - 1];
  rig.armL = { sh: j.shoulder_L, el: j.elbow_L }; rig.armR = { sh: j.shoulder_R, el: j.elbow_R };
  [rig.armL.sh, rig.armL.el, rig.armR.sh, rig.armR.el].forEach((o) => (o.rotation.order = 'YXZ'));
  rig.legL = { hp: j.leg_L, kn: j.knee_L, ftG: foot(j.foot_L, j.knee_L) }; rig.legR = { hp: j.leg_R, kn: j.knee_R, ftG: foot(j.foot_R, j.knee_R) };
  // poseRig usa a altura do quadril como referência (0,84 m)
  rig.hipBase = j.hips.position.y;
  if (j.hand_R_socket) { rig.mount = new THREE.Group(); j.hand_R_socket.add(rig.mount); }
  else { rig.mount = new THREE.Group(); rig.mount.position.set(0, -0.3, 0.02); rig.mount.rotation.x = Math.PI / 2; j.elbow_R.add(rig.mount); }
  rig.glider = buildGlider(sp); rig.root.add(rig.glider);
  rig.spec = sp;
  return rig;
}

export function createCharacter(skinId) {
  const id = ((skinId % SPECS.length) + SPECS.length) % SPECS.length;
  const model = getAsset('character', id);
  let rig = model ? rigFromAsset(model, SPECS[id]) : null;
  if (rig) { rig.skinId = id; rig.weapon = null; rig.weaponKey = ''; rig.setOutline = () => {}; return rig; }
  rig = buildRig(SPECS[id]); rig.skinId = id;
  SKIN_BUILD[id](rig);
  shadowAll(rig.root);
  rig.weapon = null; rig.weaponKey = '';
  rig.setOutline = (v) => { if (rig._ol !== v) { rig._ol = v; rig.outlines.forEach((o) => (o.visible = v)); } };
  return rig;
}

// ---------------------------------------------------------------- armas
const WCOL = [0xb4b9be, 0x5fd34a, 0x3aa0ff, 0xb45cff, 0xffb02e];
function weaponFromAsset(key, rarity) {
  const m = getAsset('weapon', key); if (!m) return null;
  const g = new THREE.Group(); g.add(m);
  // material chamado "rarity" (ou "Rarity") recebe a cor da raridade
  m.traverse((o) => { if (o.isMesh && /rarity/i.test(o.material.name || '')) { o.material.color.setHex(WCOL[rarity] || WCOL[0]); if (o.material.emissive) o.material.emissive.setHex(WCOL[rarity] || WCOL[0]).multiplyScalar(0.4); } });
  let mz = findNode(m, ['muzzle', 'Muzzle']);
  if (!mz) { const b = new THREE.Box3().setFromObject(m); mz = new THREE.Object3D(); mz.position.set(0, (b.min.y + b.max.y) / 2, b.max.z); g.add(mz); }
  g.userData.muzzle = mz;
  return g;
}
export function createWeapon(key, rarity = 0) {
  const fromAsset = weaponFromAsset(key, rarity); if (fromAsset) return fromAsset;
  const g = new THREE.Group();
  const rc = WCOL[rarity] || WCOL[0];
  const acc = M(rc, { glow: true }), steel = M(0x3a3f47, { metal: true }), dark = M(0x1b1e23), grip = M(0x24272d), tan = M(0xb59f74), olive = M(0x56603f), wood = M(0x8a5530), chrome = M(0xcfd6de, { metal: true }), red = M(0xff3b3b, { glow: true });
  const A = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.castShadow = true; g.add(m); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
  const tube = (r, l, m, x, y, z) => A(cyl(r, r, l, m, 10), x, y, z, Math.PI / 2, 0, 0);
  let muzzleZ = 0.5;
  switch (key) {
    case 'pickaxe':
      tube(0.024, 0.9, wood, 0, 0, 0.05); A(box(0.06, 0.06, 0.1, dark), 0, 0, 0.42);
      A(box(0.05, 0.07, 0.62, chrome), 0, 0, 0.47, 0, Math.PI / 2, 0);
      A(cone(0.05, 0.26, chrome, 6), 0.4, 0, 0.47, 0, 0, -Math.PI / 2); A(cone(0.05, 0.26, chrome, 6), -0.4, 0, 0.47, 0, 0, Math.PI / 2);
      A(box(0.07, 0.07, 0.04, acc), 0, 0, 0.3); muzzleZ = 0.5; break;
    case 'pistol': // pistola pesada
      A(box(0.055, 0.075, 0.3, steel), 0, 0.04, 0.16); A(box(0.056, 0.03, 0.31, chrome), 0, 0.085, 0.16);
      tube(0.02, 0.12, dark, 0, 0.04, 0.34); A(box(0.05, 0.14, 0.07, grip), 0, -0.06, 0.03, 0.25, 0, 0);
      A(box(0.03, 0.04, 0.03, acc), 0, 0.12, 0.28); A(box(0.058, 0.05, 0.1, acc), 0, -0.01, 0.2); muzzleZ = 0.4; break;
    case 'smg': // SMG tática com silenciador
      A(box(0.07, 0.1, 0.36, dark), 0, 0.03, 0.17); A(box(0.072, 0.03, 0.34, steel), 0, 0.095, 0.17);
      A(box(0.05, 0.16, 0.06, grip), 0, -0.1, 0.03, 0.15, 0, 0); A(box(0.045, 0.26, 0.065, steel), 0, -0.17, 0.2, -0.12, 0, 0);
      A(box(0.05, 0.08, 0.1, grip), 0, -0.08, 0.34); tube(0.03, 0.26, dark, 0, 0.04, 0.46); A(box(0.074, 0.03, 0.2, acc), 0, 0.02, 0.14);
      A(box(0.05, 0.05, 0.1, olive), 0, 0.14, 0.12); A(box(0.03, 0.04, 0.03, red), 0, 0.17, 0.12); A(box(0.06, 0.07, 0.22, steel), 0, 0.02, -0.14); muzzleZ = 0.6; break;
    case 'ar': // rifle de assalto (estilo SCAR)
      A(box(0.075, 0.115, 0.5, tan), 0, 0.03, 0.2); A(box(0.06, 0.04, 0.42, dark), 0, 0.105, 0.22);
      A(box(0.05, 0.09, 0.32, steel), 0, 0.03, 0.6); tube(0.018, 0.2, dark, 0, 0.045, 0.82); A(box(0.06, 0.06, 0.08, steel), 0, 0.045, 0.9);
      A(box(0.058, 0.11, 0.24, tan), 0, 0.0, -0.2, 0.1, 0, 0); A(box(0.05, 0.075, 0.1, dark), 0, 0.02, -0.34);
      A(box(0.05, 0.15, 0.065, grip), 0, -0.11, 0.05, 0.22, 0, 0); A(box(0.048, 0.22, 0.07, dark), 0, -0.15, 0.3, -0.18, 0, 0);
      A(box(0.06, 0.08, 0.14, dark), 0, 0.17, 0.22); A(box(0.04, 0.05, 0.02, red), 0, 0.19, 0.3);
      A(box(0.078, 0.025, 0.46, acc), 0, 0.075, 0.2); A(box(0.045, 0.05, 0.14, dark), 0, -0.055, 0.5); muzzleZ = 0.96; break;
    case 'shotgun': // escopeta pump
      tube(0.03, 0.78, steel, 0, 0.055, 0.44); tube(0.026, 0.62, dark, 0, -0.01, 0.4); A(box(0.07, 0.11, 0.3, steel), 0, 0.02, 0.02);
      A(box(0.08, 0.075, 0.2, wood), 0, -0.03, 0.4); A(box(0.082, 0.02, 0.2, acc), 0, 0.012, 0.4);
      A(box(0.06, 0.13, 0.3, wood), 0, -0.02, -0.22, 0.14, 0, 0); A(box(0.055, 0.09, 0.05, grip), 0, -0.09, 0.0, 0.2, 0, 0);
      A(box(0.03, 0.03, 0.04, red), 0, 0.12, 0.74); A(box(0.02, 0.04, 0.02, dark), 0, 0.11, 0.1); muzzleZ = 0.84; break;
    case 'sniper': // rifle de caça com luneta
      A(box(0.06, 0.09, 0.62, steel), 0, 0.03, 0.22); tube(0.017, 0.62, dark, 0, 0.045, 0.82); tube(0.024, 0.06, steel, 0, 0.045, 1.14);
      A(box(0.06, 0.14, 0.34, wood), 0, -0.01, -0.22, 0.1, 0, 0); A(box(0.065, 0.08, 0.3, wood), 0, -0.02, 0.4); A(box(0.048, 0.13, 0.05, grip), 0, -0.1, 0.03, 0.2, 0, 0);
      tube(0.035, 0.34, dark, 0, 0.14, 0.22); tube(0.05, 0.1, steel, 0, 0.14, 0.42); tube(0.045, 0.08, steel, 0, 0.14, 0.02);
      A(cyl(0.042, 0.042, 0.02, M(0x66d9ff, { glow: true }), 12), 0, 0.14, 0.475, Math.PI / 2, 0, 0); A(box(0.03, 0.05, 0.04, steel), 0, 0.09, 0.2);
      A(box(0.07, 0.025, 0.1, acc), 0, 0.085, -0.02); A(box(0.03, 0.03, 0.09, chrome), 0.06, 0.06, 0.05, 0, 0, 0.5); muzzleZ = 1.16; break;
    case 'rocket': // lança-foguetes
      tube(0.1, 0.95, olive, 0, 0.06, 0.15); tube(0.115, 0.14, dark, 0, 0.06, 0.62); tube(0.115, 0.14, dark, 0, 0.06, -0.3);
      A(cone(0.075, 0.2, M(0xd23a2a), 8), 0, 0.06, 0.78, Math.PI / 2, 0, 0); A(box(0.06, 0.14, 0.06, grip), 0, -0.07, 0.1, 0.2, 0, 0); A(box(0.06, 0.14, 0.06, grip), 0, -0.06, 0.36, 0.1, 0, 0);
      A(box(0.05, 0.08, 0.2, steel), 0.0, 0.2, 0.18); A(box(0.04, 0.025, 0.04, red), 0, 0.25, 0.1); A(box(0.205, 0.03, 0.4, acc), 0, 0.06, 0.15);
      A(cone(0.12, 0.2, dark, 10), 0, 0.06, -0.46, -Math.PI / 2, 0, 0); muzzleZ = 0.95; break;
    default: break;
  }
  const mz = new THREE.Object3D(); mz.position.set(0, 0.04, muzzleZ); g.add(mz); g.userData.muzzle = mz;
  return g;
}

export function createBusModel() {
  const a = getAsset('bus', 'default'); if (a) return a;
  const g = new THREE.Group();
  g.add(box(3.4, 2.6, 9, M(0x2f7cff)));
  put(g, box(3.5, 0.5, 9.1, M(0xffffff)), 0, -0.3, 0);
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) put(g, box(0.05, 0.7, 0.9, M(0x9fe0ff)), s * 1.72, 0.45, i * 1.15);
  put(g, box(3.0, 1.0, 0.05, M(0x9fe0ff)), 0, 0.5, 4.52);
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(5.2, 20, 14), M(0xff5a2a)); balloon.scale.set(1, 1.2, 1.5); balloon.position.y = 11; g.add(balloon);
  const st = new THREE.Mesh(new THREE.SphereGeometry(5.25, 20, 14), M(0xffe14a)); st.scale.set(0.35, 1.2, 1.5); st.position.y = 11; g.add(st);
  for (const [x, z] of [[-1.4, -3.5], [1.4, -3.5], [-1.4, 3.5], [1.4, 3.5]]) put(g, cyl(0.05, 0.05, 8.3, M(0x333333), 4), x, 4.2, z);
  shadowAll(g);
  return g;
}

// ---------------------------------------------------------------- animação
export function setRigWeapon(rig, key, rarity = 0) {
  const id = key ? `${key}:${rarity}` : '';
  if (rig.weaponKey === id) return;
  rig.weaponKey = id;
  if (rig.weapon) { rig.mount.remove(rig.weapon); rig.weapon = null; }
  if (key) { rig.weapon = createWeapon(key, rarity); rig.mount.add(rig.weapon); rig.muzzle = rig.weapon.userData.muzzle; }
}

// st: {speed, onGround, mode:'ground'|'fall'|'glide'|'bus', pitch, gun, melee, using, reload, swing, emote, dead, recoil, weapon}
const JKEYS = ['lax', 'lay', 'laz', 'lex', 'ley', 'rax', 'ray', 'raz', 'rex', 'rey', 'llx', 'llz', 'lkx', 'lfx', 'rlx', 'rlz', 'rkx', 'rfx', 'hipY', 'hipRX', 'hipRZ', 'hipRY', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ'];
export function poseRig(rig, st, dt) {
  rig.t += dt;
  const t = rig.t;
  if (!rig.J) { rig.J = {}; JKEYS.forEach((k) => (rig.J[k] = 0)); rig.J.hipY = 0.84; }
  const J = rig.J, T = {}; JKEYS.forEach((k) => (T[k] = 0)); T.hipY = 0.84;
  let k = 1 - Math.exp(-dt * 14);
  const pitch = st.pitch || 0;
  // aterrissagem: “amassa” ao tocar o chão
  const grounded = st.mode === 'ground' && st.onGround;
  if (!grounded) rig.air += dt; else { if (rig.air > 0.35) rig.land = Math.min(1, rig.air * 0.8); rig.air = 0; }
  rig.land = Math.max(0, rig.land - dt * 3.2);

  if (st.mode === 'fall') {
    const w = Math.sin(t * 13) * 0.05;
    T.hipRX = 1.32 + w; T.headX = -1.1; T.torsoX = -0.25;
    T.lax = -0.4; T.laz = -1.3 + w; T.rax = -0.4; T.raz = 1.3 - w; T.lex = -0.6; T.rex = -0.6;
    T.llx = 0.25; T.llz = -0.4; T.rlx = 0.2; T.rlz = 0.4; T.lkx = 0.6; T.rkx = 0.5; T.hipY = 0.92;
  } else if (st.mode === 'glide') {
    const sw = Math.sin(t * 1.8);
    T.lax = -2.9; T.rax = -2.9; T.lay = 0.15; T.ray = -0.15; T.lex = -0.25; T.rex = -0.25;
    T.llx = sw * 0.18 - 0.1; T.rlx = -sw * 0.18 - 0.1; T.lkx = 0.25; T.rkx = 0.25; T.hipRZ = sw * 0.06; T.hipY = 0.88; T.headX = 0.15;
  } else if (st.mode === 'bus') {
    T.lax = -0.25; T.rax = -0.25; T.llx = -1.45; T.rlx = -1.45; T.lkx = 1.45; T.rkx = 1.45;
  } else if (st.emote && !st.dead) {
    // dança: passo lateral com braços alternados
    const b = t * 8, s = Math.sin(b), c = Math.cos(b), s2 = Math.sin(b * 0.5);
    T.hipY = 0.8 - Math.abs(s) * 0.07; T.hipRZ = s * 0.12; T.hipRY = s2 * 0.35; T.torsoZ = -s * 0.2; T.torsoY = -s2 * 0.25; T.headZ = s * 0.18; T.headY = c * 0.2;
    T.lax = -1.6 + s * 1.2; T.rax = -1.6 - s * 1.2; T.laz = -0.5; T.raz = 0.5; T.lex = -1.2 - c * 0.3; T.rex = -1.2 + c * 0.3;
    T.llx = -0.2 + s * 0.45; T.rlx = -0.2 - s * 0.45; T.llz = -0.12; T.rlz = 0.12;
    T.lkx = 0.4 + Math.max(0, s) * 0.9; T.rkx = 0.4 + Math.max(0, -s) * 0.9; T.lfx = -0.2; T.rfx = -0.2;
  } else {
    const sp = st.speed || 0, amp = Math.min(1, sp / 6.5), run = Math.max(0, Math.min(1, (sp - 6.6) / 1.8));
    if (grounded && sp > 0.35) rig.phase += dt * (4.6 + sp * 0.92);
    const p = rig.phase;
    if (!grounded) {
      const up = (st.vy || 0) > 0;
      T.llx = up ? -0.9 : -0.5; T.rlx = up ? 0.2 : 0.35; T.lkx = up ? 1.2 : 0.7; T.rkx = up ? 0.45 : 0.25;
      T.lax = -0.5; T.rax = -0.4; T.laz = -0.35; T.raz = 0.35; T.lex = -0.6; T.rex = -0.6; T.hipY = 0.84; T.torsoX = 0.12;
    } else if (sp > 0.35) {
      const sn = Math.sin(p), cs = Math.cos(p);
      T.llx = -sn * (0.85 + run * 0.35) * amp; T.rlx = sn * (0.85 + run * 0.35) * amp;
      T.lkx = (Math.max(0, cs) * (1.25 + run * 0.4) + 0.12) * amp; T.rkx = (Math.max(0, -cs) * (1.25 + run * 0.4) + 0.12) * amp;
      T.lfx = Math.max(0, sn) * 0.4 * amp - 0.1; T.rfx = Math.max(0, -sn) * 0.4 * amp - 0.1;
      T.hipY = 0.84 - Math.abs(cs) * 0.055 * amp + 0.02 * amp; T.hipRY = sn * 0.16 * amp; T.hipRZ = cs * 0.05 * amp;
      T.torsoY = -sn * 0.2 * amp; T.torsoX = (0.12 + run * 0.18) * amp; T.headY = sn * 0.08 * amp;
      T.lax = sn * (0.75 + run * 0.4) * amp; T.rax = -sn * (0.75 + run * 0.4) * amp; T.laz = -0.12; T.raz = 0.12;
      T.lex = -0.35 - (0.6 + run * 0.4) * amp; T.rex = -0.35 - (0.6 + run * 0.4) * amp;
    } else {
      // parado: respiração e peso no pé
      const br = Math.sin(t * 1.9);
      T.hipY = 0.84 + br * 0.006; T.torsoX = br * 0.015; T.headX = -br * 0.02; T.headY = Math.sin(t * 0.45) * 0.12;
      T.lax = 0.05; T.rax = 0.05; T.laz = -0.12 - br * 0.02; T.raz = 0.12 + br * 0.02; T.lex = -0.18; T.rex = -0.18;
      T.llz = -0.04; T.rlz = 0.06; T.hipRZ = 0.03; T.lkx = 0.05; T.rkx = 0.1;
    }
    // parte de cima: armas e itens
    if (st.using) {
      const w = Math.sin(t * 9) * 0.12;
      T.rax = -1.8 + w; T.lax = -1.7 - w; T.rex = -1.75; T.lex = -1.75; T.lay = 0.45; T.ray = -0.45; T.headX = 0.2;
    } else if (st.gun) {
      const a = -1.45 - pitch * 0.9;
      T.rax = a; T.ray = -0.1; T.rex = -0.25; T.lax = a + 0.08; T.lay = 0.68; T.lex = -0.6;
      T.torsoX = -pitch * 0.25 + (grounded && sp > 0.35 ? 0.06 : 0); T.torsoY = 0.12 + T.torsoY * 0.4; T.headY = -0.1;
      if (st.reload) { const r = Math.sin(t * 7); T.lax = -0.6 + r * 0.2; T.lay = 0.4; T.lex = -1.2; T.rax = a + 0.35; T.rey = 0.3; }
      if (st.recoil) { T.rax += st.recoil * 0.22; T.lax += st.recoil * 0.18; T.torsoX -= st.recoil * 0.05; }
    } else if (st.melee) {
      T.rax = -0.5 + (sp > 0.35 ? T.rax * 0.3 : 0); T.rex = -0.95; T.ray = -0.1;
      if (st.swing < 0.4) {
        const u = st.swing / 0.4, e = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
        T.rax = u < 0.3 ? -0.5 - e * 2.4 : -2.9 + (1 - e) * 3.4; T.rex = -0.3; T.lax = -0.6; T.torsoY = u < 0.3 ? 0.35 * e : -0.4 * (1 - e); T.torsoX = u < 0.3 ? -0.15 : 0.3 * e;
        k = 1 - Math.exp(-dt * 45);
      }
    }
    T.headX += -pitch * 0.55;
    // aterrissagem
    if (rig.land > 0) { T.hipY -= rig.land * 0.14; T.lkx += rig.land * 0.6; T.rkx += rig.land * 0.6; T.llx -= rig.land * 0.35; T.rlx -= rig.land * 0.35; T.torsoX += rig.land * 0.25; }
  }
  if (st.dead) { T.lax = -0.3; T.rax = -0.3; T.laz = -1.0; T.raz = 1.0; T.llz = -0.2; T.rlz = 0.2; T.headX = 0.3; }
  for (const key of JKEYS) J[key] += (T[key] - J[key]) * k;
  const h = rig.hips; h.position.y = J.hipY + (rig.hipBase !== undefined ? rig.hipBase - 0.84 : 0); h.rotation.set(J.hipRX, J.hipRY, J.hipRZ);
  rig.torso.rotation.set(J.torsoX, J.torsoY - J.hipRY * 0.6, J.torsoZ); rig.head.rotation.set(J.headX, J.headY, J.headZ);
  rig.armL.sh.rotation.set(J.lax, J.lay, J.laz); rig.armR.sh.rotation.set(J.rax, J.ray, J.raz);
  rig.armL.el.rotation.set(J.lex, J.ley, 0); rig.armR.el.rotation.set(J.rex, J.rey, 0);
  rig.legL.hp.rotation.set(J.llx, 0, J.llz); rig.legR.hp.rotation.set(J.rlx, 0, J.rlz);
  rig.legL.kn.rotation.x = J.lkx; rig.legR.kn.rotation.x = J.rkx;
  rig.legL.ftG.rotation.x = J.lfx - J.lkx * 0.25 - J.llx * 0.2; rig.legR.ftG.rotation.x = J.rfx - J.rkx * 0.25 - J.rlx * 0.2;
  // respiração no peito
  rig.chest.scale.y = 1 + Math.sin(t * 1.9) * 0.012;
  rig.glider.visible = st.mode === 'glide';
  if (rig.glider.visible) rig.glider.rotation.z = Math.sin(t * 1.8) * 0.06;
  if (rig.tail) rig.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 3 + i * 0.8) * 0.28; s.rotation.x = Math.sin(t * 2 + i) * 0.06; });
  if (rig.wings) rig.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.z = Math.sin(t * (st.mode === 'glide' || st.mode === 'fall' ? 8 : 2.2)) * 0.2 * -s; });
  if (rig.cape) rig.cape.rotation.x = 0.15 + Math.min(0.7, (st.speed || 0) * 0.07) + Math.sin(t * 5) * 0.04;
  // eliminação: cai para trás e se desfaz
  if (st.dead) { rig.dead += dt; } else { rig.dead = 0; rig.root.scale.setScalar(1); }
  const fall = Math.min(1, rig.dead * 2.4);
  rig.root.rotation.x = -fall * fall * 1.45;
  if (rig.dead > 1.1) { const s = Math.max(0.001, 1 - (rig.dead - 1.1) * 1.6); rig.root.scale.setScalar(s); }
}
