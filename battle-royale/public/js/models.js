// Modelos 3D procedurais: 10 skins de personagem (estilo cartoon com contorno) + armas.
import * as THREE from 'three';

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
    else m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide });
    matCache.set(key, m);
  }
  return m;
}
const OUT = new THREE.MeshBasicMaterial({ color: 0x0c0c12, side: THREE.BackSide });

const G = {
  sph: new Map(), cap: new Map(), box: new Map(), cyl: new Map(), cone: new Map(),
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
function outlined(mesh, rig, s = 1.07) {
  const o = new THREE.Mesh(mesh.geometry, OUT); o.scale.setScalar(s); o.userData.outline = true; mesh.add(o); rig.outlines.push(o);
  mesh.castShadow = true; return mesh;
}
function shadowAll(g) { g.traverse((o) => { if (o.isMesh && !o.userData.outline) o.castShadow = true; }); }

// ---------------------------------------------------------------- rig base
function buildRig(sp) {
  const rig = { outlines: [], phase: 0, t: Math.random() * 10, swing: 0, dead: 0 };
  const root = new THREE.Group(); root.rotation.order = 'YXZ'; rig.root = root;
  const hips = new THREE.Group(); hips.position.y = 0.82; root.add(hips); rig.hips = hips;
  const pelvis = outlined(put(hips, box(0.34, 0.2, 0.22, M(sp.pants)), 0, -0.02, 0), rig, 1.1); rig.pelvis = pelvis;
  const torso = new THREE.Group(); torso.position.y = 0.05; torso.scale.set(1.08, 1, 1.1); hips.add(torso); rig.torso = torso;
  const chest = cap(0.19, 0.2, M(sp.shirt)); chest.scale.set(1.12, 1, 0.78); put(torso, chest, 0, 0.27, 0); outlined(chest, rig, 1.06); rig.chest = chest;
  rig.back = new THREE.Group(); rig.back.position.set(0, 0.32, -0.17); torso.add(rig.back);
  rig.front = new THREE.Group(); rig.front.position.set(0, 0.3, 0.16); torso.add(rig.front);
  // cabeça
  const head = new THREE.Group(); head.position.y = 0.64; head.scale.setScalar(1.28); torso.add(head); rig.head = head;
  const skull = sph(0.2, M(sp.skin)); skull.scale.set(1, 1.04, 1.02); put(head, skull, 0, 0.1, 0); outlined(skull, rig, 1.06); rig.skull = skull;
  for (const e of [-1, 1]) { const ear = sph(0.05, M(sp.skin), 8, 6); ear.scale.set(0.5, 1, 0.8); put(head, ear, e * 0.2, 0.08, -0.01); }
  put(head, cyl(0.075, 0.09, 0.1, M(sp.skin), 10), 0, -0.04, 0);
  if (sp.hairStyle) {
    const hc = M(sp.hairColor || 0x4a2f1a);
    const cap2 = new THREE.Mesh(geo(G.sph, 'hairCap', () => new THREE.SphereGeometry(0.218, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), hc);
    put(head, cap2, 0, 0.115, -0.02, -0.25, 0, 0); outlined(cap2, rig, 1.04);
    put(head, sph(0.1, hc, 10, 8), 0, 0.3, 0.1, 0, 0, 0).scale.set(1.2, 0.7, 1.3);
    if (sp.hairStyle === 'long') put(head, box(0.34, 0.34, 0.08, hc), 0, -0.02, -0.17);
  }
  rig.face = new THREE.Group(); rig.face.position.set(0, 0.11, 0.185); head.add(rig.face);
  if (!sp.noFace) {
    const eyeM = M(sp.eye || 0xffffff), pup = M(sp.pupil || 0x1a1a22);
    for (const s of [-1, 1]) {
      put(rig.face, sph(0.042, eyeM, 10, 8), s * 0.075, 0.025, 0.01);
      put(rig.face, sph(0.024, pup, 8, 6), s * 0.075, 0.025, 0.045);
      put(rig.face, sph(0.009, M(0xffffff, { glow: true }), 6, 4), s * 0.075 + 0.008, 0.035, 0.066);
      put(rig.face, box(0.09, 0.016, 0.02, M(sp.brow || sp.hair || 0x3a2a1c)), s * 0.075, 0.09, 0.015, 0, 0, -s * 0.12);
    }
    put(rig.face, box(0.07, 0.014, 0.02, M(0x7a2f2f)), 0, -0.07, 0.02);
    put(rig.face, sph(0.028, M(sp.skin), 8, 6), 0, -0.02, 0.035);
  }
  // braços (2 segmentos)
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.26, 0.5, 0); sh.rotation.order = 'YXZ'; torso.add(sh);
    put(sh, sph(0.085, M(sp.shirtB || sp.shirt), 12, 8), 0, 0, 0);
    const up = cap(0.077, 0.16, M(sp.sleeve ?? sp.shirt)); put(sh, up, 0, -0.15, 0); outlined(up, rig, 1.1);
    const el = new THREE.Group(); el.position.y = -0.29; el.rotation.order = 'YXZ'; sh.add(el);
    const lo = cap(0.069, 0.14, M(sp.forearm ?? sp.skin)); put(el, lo, 0, -0.13, 0); outlined(lo, rig, 1.1);
    const hand = sph(0.088, M(sp.glove ?? sp.skin), 12, 8); put(el, hand, 0, -0.29, 0); outlined(hand, rig, 1.1);
    arms.push({ sh, el, hand, up, lo });
  }
  rig.armL = arms[0]; rig.armR = arms[1];
  rig.mount = new THREE.Group(); rig.mount.position.set(0, -0.3, 0.02); rig.mount.rotation.x = Math.PI / 2; arms[1].el.add(rig.mount);
  // pernas
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.12, -0.04, 0); hips.add(hp);
    const th = cap(0.105, 0.22, M(sp.pants)); put(hp, th, 0, -0.2, 0); outlined(th, rig, 1.09);
    const kn = new THREE.Group(); kn.position.y = -0.4; hp.add(kn);
    const sn = cap(0.088, 0.24, M(sp.shin ?? sp.pants)); put(kn, sn, 0, -0.2, 0.01); outlined(sn, rig, 1.1);
    const ft = box(0.17, 0.1, 0.32, M(sp.shoes)); put(kn, ft, 0, -0.395, 0.07); outlined(ft, rig, 1.12); put(kn, box(0.175, 0.03, 0.33, M(0xe8e8e8)), 0, -0.44, 0.07);
    legs.push({ hp, kn, th, sn, ft });
  }
  rig.legL = legs[0]; rig.legR = legs[1];
  // paraquedas (planador) e brilho
  const gl = new THREE.Group(); gl.visible = false; rig.glider = gl; root.add(gl);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(1.9, 6, 8, (i / 6) * Math.PI * 2, Math.PI / 3, 0, Math.PI / 2.3), M(i % 2 ? 0xffffff : (sp.gliderColor || 0xff4f6b), { glow: true, side: THREE.DoubleSide }));
    seg.scale.set(1, 0.5, 1); put(gl, seg, 0, 2.5, 0);
  }
  for (let i = 0; i < 4; i++) { const ln = cyl(0.012, 0.012, 1.55, M(0x222222), 4); put(gl, ln, Math.cos(i * Math.PI / 2 + 0.78) * 0.55, 1.65, Math.sin(i * Math.PI / 2 + 0.78) * 0.55, 0.0, 0, 0); ln.rotation.set(Math.sin(i * Math.PI / 2 + 0.78) * 0.4, 0, -Math.cos(i * Math.PI / 2 + 0.78) * 0.4); }
  rig.spec = sp;
  return rig;
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

export function createCharacter(skinId) {
  const id = ((skinId % SPECS.length) + SPECS.length) % SPECS.length;
  const rig = buildRig(SPECS[id]); rig.skinId = id;
  SKIN_BUILD[id](rig);
  shadowAll(rig.root);
  rig.weapon = null; rig.weaponKey = '';
  rig.setOutline = (v) => { if (rig._ol !== v) { rig._ol = v; rig.outlines.forEach((o) => (o.visible = v)); } };
  return rig;
}

// ---------------------------------------------------------------- armas
const WCOL = [0xb4b9be, 0x5fd34a, 0x3aa0ff, 0xb45cff, 0xffb02e];
export function createWeapon(key, rarity = 0) {
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

// st: {speed, onGround, mode:'ground'|'fall'|'glide'|'bus', pitch, gun:boolean, melee:boolean, using:boolean, swing:(seg desde o golpe), emote, dead, water}
export function poseRig(rig, st, dt) {
  rig.t += dt;
  const J = rig.J || (rig.J = {
    lax: 0, lay: 0, laz: 0, lex: 0, rax: 0, ray: 0, raz: 0, rex: 0, llx: 0, llz: 0, lkx: 0, rlx: 0, rlz: 0, rkx: 0,
    hipY: 0.82, hipRX: 0, torsoX: 0, torsoZ: 0, headX: 0, headY: 0,
  });
  const T = { lax: 0, lay: 0, laz: 0, lex: 0, rax: 0, ray: 0, raz: 0, rex: 0, llx: 0, llz: 0, lkx: 0, rlx: 0, rlz: 0, rkx: 0, hipY: 0.82, hipRX: 0, torsoX: 0, torsoZ: 0, headX: 0, headY: 0 };
  let k = 1 - Math.exp(-dt * 16);
  const pitch = st.pitch || 0;
  if (st.mode === 'fall') {
    T.hipRX = 1.38; T.headX = -1.15; T.torsoX = -0.2;
    T.lax = -0.3; T.laz = -1.35; T.rax = -0.3; T.raz = 1.35; T.lex = -0.5; T.rex = -0.5;
    T.llx = 0.15; T.llz = -0.35; T.rlx = 0.1; T.rlz = 0.35; T.lkx = 0.35; T.rkx = 0.35; T.hipY = 0.9;
    T.hipRX += Math.sin(rig.t * 14) * 0.03;
  } else if (st.mode === 'glide') {
    T.lax = -2.85; T.rax = -2.85; T.lay = 0.1; T.ray = -0.1; T.lex = -0.1; T.rex = -0.1;
    T.llx = Math.sin(rig.t * 2) * 0.12; T.rlx = -Math.sin(rig.t * 2) * 0.12; T.lkx = 0.15; T.rkx = 0.15; T.hipRX = 0.1; T.hipY = 0.86;
  } else if (st.mode === 'bus') {
    T.lax = -0.2; T.rax = -0.2; T.llx = -1.45; T.rlx = -1.45; T.lkx = 1.45; T.rkx = 1.45;
  } else if (st.emote) {
    const s = Math.sin(rig.t * 9), c = Math.cos(rig.t * 9);
    T.hipY = 0.82 - Math.abs(s) * 0.07; T.torsoZ = s * 0.28; T.headY = c * 0.4;
    T.lax = -2.7 + s * 0.6; T.rax = -2.7 - s * 0.6; T.laz = -0.35; T.raz = 0.35; T.lex = -0.5; T.rex = -0.5;
    T.llx = -0.3 + s * 0.6; T.rlx = -0.3 - s * 0.6; T.lkx = 0.6 + Math.max(0, s) * 0.8; T.rkx = 0.6 + Math.max(0, -s) * 0.8; T.hipRX = c * 0.1;
  } else {
    const sp = st.speed || 0, amp = Math.min(1, sp / 6.5);
    if (st.onGround && sp > 0.4) rig.phase += dt * (4.2 + sp * 0.95);
    else if (st.onGround) { rig.phase *= 0.9; }
    const p = rig.phase;
    if (!st.onGround) { // no ar
      T.llx = -0.7; T.rlx = 0.25; T.lkx = 0.9; T.rkx = 0.3; T.hipY = 0.82;
    } else {
      T.llx = -Math.sin(p) * 0.95 * amp; T.rlx = Math.sin(p) * 0.95 * amp;
      T.lkx = Math.max(0, Math.cos(p)) * 1.15 * amp; T.rkx = Math.max(0, -Math.cos(p)) * 1.15 * amp;
      T.hipY = 0.82 - Math.abs(Math.sin(p)) * 0.04 * amp + Math.sin(rig.t * 1.6) * 0.004;
      T.lax = Math.sin(p) * 0.75 * amp; T.rax = -Math.sin(p) * 0.75 * amp; T.lex = -0.25 - 0.5 * amp; T.rex = -0.25 - 0.5 * amp;
      T.torsoX = 0.1 * amp; T.torsoZ = Math.sin(p) * 0.04 * amp;
    }
    if (st.using) {
      T.rax = -1.75; T.lax = -1.65; T.rex = -1.7; T.lex = -1.7; T.lay = 0.4; T.ray = -0.4;
    } else if (st.gun) {
      const a = -1.42 - pitch * 0.85;
      T.rax = a; T.ray = -0.12; T.rex = -0.22; T.lax = a + 0.06; T.lay = 0.62; T.lex = -0.55; T.torsoX = -pitch * 0.18; T.torsoZ = 0;
      if (st.recoil) T.rax += st.recoil * 0.25;
    } else if (st.melee) {
      T.rax = -0.55; T.rex = -0.9; T.ray = -0.1;
      if (st.swing < 0.34) { const u = st.swing / 0.34; T.rax = u < 0.3 ? -2.5 - u * 2 : -2.5 + (u - 0.3) / 0.7 * 3.2; T.rex = -0.4; T.torsoX = u > 0.3 ? 0.35 : -0.2; k = 1 - Math.exp(-dt * 40); }
    }
    T.headX = -pitch * 0.55;
  }
  for (const key in T) J[key] += (T[key] - J[key]) * k;
  const h = rig.hips; h.position.y = J.hipY; h.rotation.x = J.hipRX;
  rig.torso.rotation.x = J.torsoX; rig.torso.rotation.z = J.torsoZ; rig.head.rotation.x = J.headX; rig.head.rotation.y = J.headY;
  rig.armL.sh.rotation.set(J.lax, J.lay, J.laz); rig.armR.sh.rotation.set(J.rax, J.ray, J.raz);
  rig.armL.el.rotation.x = J.lex; rig.armR.el.rotation.x = J.rex;
  rig.legL.hp.rotation.set(J.llx, 0, J.llz); rig.legR.hp.rotation.set(J.rlx, 0, J.rlz);
  rig.legL.kn.rotation.x = J.lkx; rig.legR.kn.rotation.x = J.rkx;
  rig.glider.visible = st.mode === 'glide';
  if (rig.tail) rig.tail.forEach((s, i) => { s.rotation.y = Math.sin(rig.t * 3 + i * 0.8) * 0.28; s.rotation.x = Math.sin(rig.t * 2 + i) * 0.06; });
  if (rig.wings) rig.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.z = Math.sin(rig.t * (st.mode === 'glide' || st.mode === 'fall' ? 8 : 2.2)) * 0.2 * -s; });
  if (rig.cape) rig.cape.rotation.x = 0.15 + Math.min(0.7, (st.speed || 0) * 0.07) + Math.sin(rig.t * 5) * 0.04;
  // morte: cai para trás
  rig.dead = st.dead ? Math.min(1, rig.dead + dt * 2.5) : 0;
  rig.root.rotation.x = -rig.dead * 1.45; rig.root.position.y += 0;
}
