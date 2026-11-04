// Mundo determinístico (mesmo código no cliente e no servidor): terreno, construções, colisão e raycast.
import { HALF, POIS, PLAYER_H, PLAYER_R } from './data.js';

export const STEP = 0.65;
export const GRAVITY = 26;
export const JUMP_V = 8.6;
export const MAP_LIMIT = 186;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- Colliders (grade espacial) ----------
const CELL = 8, OFF = 64;
const cellKey = (ix, iz) => (ix + OFF) * 256 + (iz + OFF);
let stampCounter = 1;
const qOut = [];
export class Colliders {
  constructor() { this.grid = new Map(); this.all = new Set(); }
  add(c) {
    this.all.add(c);
    const x0 = Math.floor(c.minx / CELL), x1 = Math.floor(c.maxx / CELL), z0 = Math.floor(c.minz / CELL), z1 = Math.floor(c.maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = cellKey(ix, iz); let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(c);
    }
    return c;
  }
  remove(c) {
    if (!this.all.delete(c)) return;
    const x0 = Math.floor(c.minx / CELL), x1 = Math.floor(c.maxx / CELL), z0 = Math.floor(c.minz / CELL), z1 = Math.floor(c.maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(cellKey(ix, iz));
      if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
    }
  }
  // devolve array reutilizado (consumir antes da próxima consulta)
  query(minx, minz, maxx, maxz) {
    qOut.length = 0; const st = ++stampCounter;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(cellKey(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const c = a[i]; if (c._s !== st) { c._s = st; qOut.push(c); } }
    }
    return qOut;
  }
}

export function rayAABB(ox, oy, oz, dx, dy, dz, c, maxD) {
  let t0 = 0, t1 = maxD;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [c.minx, c.miny, c.minz], mx = [c.maxx, c.maxy, c.maxz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; }
    else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

export function rampY(c, x, z) {
  let t;
  switch (c.dir) {
    case 0: t = (c.maxz - z) / (c.maxz - c.minz); break;
    case 1: t = (x - c.minx) / (c.maxx - c.minx); break;
    case 2: t = (z - c.minz) / (c.maxz - c.minz); break;
    default: t = (c.maxx - x) / (c.maxx - c.minx);
  }
  return c.baseY + c.h * Math.min(1, Math.max(0, t));
}

// ---------- Peças de construção ----------
export const PIECE = 4;
export function pieceKey(type, gx, by, gz, dir) { return `${type}${gx},${by},${gz},${dir}`; } // by = altura da base em quartos de metro
export function pieceCenter(type, gx, by, gz, dir) {
  const base = by / 4, x = gx * PIECE, z = gz * PIECE;
  if (type === 'wall') return dir === 0 ? [x, base + 2, z - 2] : [x - 2, base + 2, z];
  return [x, base, z];
}
export function wallFromEdge(gx, gz, side) { // 0 N,1 E,2 S,3 W
  if (side === 0) return [gx, gz, 0];
  if (side === 1) return [gx + 1, gz, 1];
  if (side === 2) return [gx, gz + 1, 0];
  return [gx, gz, 1];
}

export function createWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const rr = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  function rawH(x, z) {
    const r = Math.hypot(x, z);
    const isl = 1 - smooth(150, 192, r);
    const n = vnoise(x * 0.011 + 10, z * 0.011 + 10, seed) * 0.7 + vnoise(x * 0.04, z * 0.04, seed + 1) * 0.25 + vnoise(x * 0.12, z * 0.12, seed + 2) * 0.05;
    const hl = 1.3 + n * 9.5;
    return hl * isl + -3.2 * (1 - isl);
  }
  const pc = POIS.map((p) => ({ ...p, h: rawH(p.x, p.z) }));
  function heightAt(x, z) {
    let h = rawH(x, z);
    for (let i = 0; i < pc.length; i++) {
      const p = pc[i], d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 1.35) { const w = 1 - smooth(p.r * 0.85, p.r * 1.35, d); h += (p.h - h) * w; }
    }
    return h;
  }
  function poiAt(x, z, pad = 0) {
    for (const p of pc) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return p;
    return null;
  }

  const colliders = new Colliders();
  const statics = [];   // caixas estáticas (render instanciado)
  const decor = [];     // só visual
  const nodes = [];     // árvores, pedras, sucata
  const lootSpots = [];
  const chestSpots = [];
  const ptsHouse = [];

  function box(minx, miny, minz, maxx, maxy, maxz, col, extra) {
    const c = { minx, miny, minz, maxx, maxy, maxz, col, kind: 'box', static: true, ...extra };
    colliders.add(c); statics.push(c); return c;
  }
  const cbox = (cx, cz, sx, sz, y0, y1, col, extra) => box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y1, cz + sz / 2, col, extra);

  // parede ao longo de um eixo com aberturas (portas / janelas)
  function wallLine(axis, fixed, a0, a1, base, H, th, col, openings) {
    const seg = (s, e, y0, y1) => {
      if (e - s < 0.05) return;
      if (axis === 'x') box(s, y0, fixed - th / 2, e, y1, fixed + th / 2, col);
      else box(fixed - th / 2, y0, s, fixed + th / 2, y1, e, col);
    };
    let cur = a0;
    for (const o of openings.slice().sort((p, q) => p.c - q.c)) {
      const s = o.c - o.w / 2, e = o.c + o.w / 2;
      seg(cur, s, base - 3, base + H);
      if (o.sill > 0) seg(s, e, base - 3, base + o.sill);
      if (o.top < H) seg(s, e, base + o.top, base + H);
      cur = e;
    }
    seg(cur, a1, base - 3, base + H);
  }

  const WALLS = [0xe8dcc4, 0xd9c7a3, 0xc9d6dd, 0xe2b9a0, 0xcfe0c3, 0xf0e6d2, 0xb7c4d6, 0xe7cf9e];
  const ROOFS = [0xb5473a, 0x6d7f95, 0x4a6b4a, 0x8a5a3c, 0x9a4a5a, 0x555b66];

  // casa com porta + janelas; devolve info para loot
  function house(cx, cz, sx, sz, opts = {}) {
    const base = heightAt(cx, cz);
    const H = opts.H || 3.4, th = 0.4;
    const col = opts.col ?? pick(WALLS), rcol = opts.roof ?? pick(ROOFS);
    const door = opts.door ?? Math.floor(rng() * 4);
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const dw = opts.doorW || 2.4;
    const mk = (side, axis, fixed, a0, a1, len) => {
      const ops = [];
      if (side === door) ops.push({ c: (a0 + a1) / 2 + (opts.doorOff || 0), w: dw, sill: 0, top: 2.7 });
      else if (len > 7) { ops.push({ c: (a0 + a1) / 2 - len * 0.22, w: 1.8, sill: 1.0, top: 2.3 }); if (len > 11) ops.push({ c: (a0 + a1) / 2 + len * 0.22, w: 1.8, sill: 1.0, top: 2.3 }); }
      else ops.push({ c: (a0 + a1) / 2, w: 1.6, sill: 1.0, top: 2.3 });
      wallLine(axis, fixed, a0, a1, base, H, th, col, ops);
      for (const o of ops) {
        const isDoor = o.sill === 0, h = o.top - o.sill, cy = base + o.sill + h / 2;
        const D = (cx2, cy2, w2, h2, c2) => decor.push({ t: 'box', x: axis === 'x' ? cx2 : fixed, y: cy2, z: axis === 'x' ? fixed : cx2, sx: axis === 'x' ? w2 : th + 0.07, sy: h2, sz: axis === 'x' ? th + 0.07 : w2, col: c2 });
        if (isDoor) {
          D(o.c - o.w / 2 - 0.08, cy, 0.16, h + 0.1, 0xf4efe4); D(o.c + o.w / 2 + 0.08, cy, 0.16, h + 0.1, 0xf4efe4); D(o.c, base + o.top + 0.08, o.w + 0.32, 0.18, 0xf4efe4);
          D(o.c, base + 0.08, o.w, 0.16, 0x6d4a2c);
        } else {
          D(o.c, cy, o.w + 0.3, h + 0.3, 0xf6f1e6);
          decor.push({ t: 'box', x: axis === 'x' ? o.c : fixed, y: cy, z: axis === 'x' ? fixed : o.c, sx: axis === 'x' ? o.w : 0.1, sy: h, sz: axis === 'x' ? 0.1 : o.w, col: 0x9fd8f2 });
          D(o.c, cy, 0.07, h, 0xf6f1e6);
        }
      }
    };
    mk(0, 'x', z0, x0, x1, sx); mk(2, 'x', z1, x0, x1, sx);
    mk(3, 'z', x0, z0 + th / 2, z1 - th / 2, sz); mk(1, 'z', x1, z0 + th / 2, z1 - th / 2, sz);
    // piso e teto
    box(x0, base - 3, z0, x1, base + 0.12, z1, opts.floor ?? 0x8b7355);
    box(x0 - 0.5, base + H, z0 - 0.5, x1 + 0.5, base + H + 0.35, z1 + 0.5, rcol);
    decor.push({ t: 'box', x: cx, y: base + 0.2, z: cz, sx: sx + 0.3, sy: 0.55, sz: sz + 0.3, col: 0x8f8f87 });
    if (!opts.flat) decor.push({ t: 'box', x: cx + sx * 0.25, y: base + H + 1.6, z: cz - sz * 0.2, sx: 0.9, sy: 2.6, sz: 0.9, col: 0xa4523a });
    if (!opts.flat) decor.push({ t: 'pyr', x: cx, y: base + H + 0.35, z: cz, sx: sx + 1.4, sy: Math.min(3.2, Math.max(sx, sz) * 0.28), sz: sz + 1.4, col: rcol });
    // loot dentro
    const spots = [[0, 0], [-sx * 0.25, sz * 0.2], [sx * 0.25, -sz * 0.2], [sx * 0.2, sz * 0.25]];
    spots.forEach(([ox, oz], i) => { if (i < (opts.loot ?? 3)) lootSpots.push({ x: cx + ox, y: base + 0.4, z: cz + oz }); });
    if (opts.chest ?? (rng() < 0.45)) chestSpots.push({ x: cx - sx * 0.3, y: base + 0.1, z: cz - sz * 0.28 });
    return { cx, cz, sx, sz, base };
  }

  // torre com escada em espiral (35 degraus de 0,6 m = 21 m)
  function spiralTower(cx, cz, deckCol = 0x6b7078) {
    const base = heightAt(cx, cz), R = 4.25, W = 2.5, d = 0.75, rise = 0.6, Htop = rise * 35 + 0.1;
    box(cx - 3, base - 3, cz - 3, cx + 3, base + Htop, cz + 3, deckCol);
    let s = 0;
    const step = (px, pz, sx, sz) => { s++; box(cx + px - sx / 2, base - 3, cz + pz - sz / 2, cx + px + sx / 2, base + rise * s, cz + pz + sz / 2, 0x8a8f96); };
    for (let j = 0; j < 8; j++) step(-3 + d / 2 + j * d, -R, d, W);        // norte (oeste -> leste)
    step(R, -R, W, W);                                                   // canto NE
    for (let j = 0; j < 8; j++) step(R, -3 + d / 2 + j * d, W, d);        // leste (norte -> sul)
    step(R, R, W, W);                                                    // canto SE
    for (let j = 0; j < 8; j++) step(3 - d / 2 - j * d, R, d, W);         // sul (leste -> oeste)
    step(-R, R, W, W);                                                   // canto SW
    for (let j = 0; j < 7; j++) step(-R, 3 - d / 2 - j * d, W, d);        // oeste (sul -> norte) até encostar no núcleo
    const y0 = base + Htop, y1 = y0 + 1.1;
    box(cx - 3, y0, cz - 3, cx + 3, y1, cz - 2.7, 0x555a62); box(cx - 3, y0, cz + 2.7, cx + 3, y1, cz + 3, 0x555a62);
    box(cx + 2.7, y0, cz - 3, cx + 3, y1, cz + 3, 0x555a62);
    lootSpots.push({ x: cx, y: y0 + 0.3, z: cz });
    chestSpots.push({ x: cx + 1.2, y: y0 + 0.05, z: cz + 1.2 });
    return base;
  }

  function container(cx, cz, alongX, col, stacked) {
    const sx = alongX ? 6.1 : 2.5, sz = alongX ? 2.5 : 6.1, base = heightAt(cx, cz);
    box(cx - sx / 2, base - 3, cz - sz / 2, cx + sx / 2, base + 2.6, cz + sz / 2, col);
    if (stacked) box(cx - sx / 2, base + 2.6, cz - sz / 2, cx + sx / 2, base + 5.2, cz + sz / 2, pick([0x2f6fb0, 0xb04a2f, 0x3a8a4d, 0xd29a2e]));
    if (rng() < 0.35) lootSpots.push({ x: cx + (alongX ? 4 : 0), y: base + 0.3, z: cz + (alongX ? 0 : 4) });
  }

  function addNode(t, x, z, s) {
    const y = heightAt(x, z); const id = nodes.length;
    const n = { id, t, x, y, z, s };
    nodes.push(n);
    const w = t === 'tree' ? 0.9 : t === 'rock' ? 2.0 * s : 1.8;
    const hgt = t === 'tree' ? 6 : t === 'rock' ? 1.7 * s : 1.3;
    colliders.add({ minx: x - w / 2, miny: y - 1, minz: z - w / 2, maxx: x + w / 2, maxy: y + hgt, maxz: z + w / 2, kind: 'box', node: id, nt: t, static: true });
    return n;
  }

  // ---------- POIs ----------
  for (const p of pc) {
    const R = p.r;
    if (p.style === 'town') {
      for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
        if (gx === 0 && gz === 0) continue;
        if (Math.hypot(gx, gz) * 15 > R - 2 || rng() < 0.2) continue;
        house(p.x + gx * 15 + rr(-1.5, 1.5), p.z + gz * 15 + rr(-1.5, 1.5), rr(8, 11), rr(8, 11), { loot: 3 });
      }
      // praça central: relógio
      cbox(p.x, p.z, 3, 3, heightAt(p.x, p.z) - 3, heightAt(p.x, p.z) + 11, 0xb8b2a4);
      decor.push({ t: 'cyl', x: p.x, y: heightAt(p.x, p.z) + 11, z: p.z, sx: 2.2, sy: 2.2, sz: 2.2, col: 0xe8e4d8 });
      chestSpots.push({ x: p.x + 3, y: heightAt(p.x, p.z) + 0.1, z: p.z });
      chestSpots.push({ x: p.x - 3, y: heightAt(p.x, p.z) + 0.1, z: p.z + 2 });
    } else if (p.style === 'suburb') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3, rad = i % 2 ? 21 : 12;
        house(p.x + Math.cos(a) * rad, p.z + Math.sin(a) * rad, rr(8, 10), rr(8, 10), { door: Math.floor(rng() * 4) });
      }
    } else if (p.style === 'farm') {
      house(p.x - 10, p.z - 6, 20, 12, { H: 5.2, col: 0xb23a32, roof: 0x7a2b25, doorW: 4.6, loot: 4, chest: true });
      house(p.x + 14, p.z + 10, 16, 10, { H: 4.6, col: 0xa8352e, roof: 0x7a2b25, doorW: 4, loot: 3, chest: true });
      house(p.x + 12, p.z - 14, 8, 8, { col: 0xf0e6d2 });
      for (const [sx, sz] of [[-18, 14], [-10, 18]]) {
        const y = heightAt(p.x + sx, p.z + sz);
        cbox(p.x + sx, p.z + sz, 5, 5, y - 3, y + 11, 0xbfc7cf);
        decor.push({ t: 'cyl', x: p.x + sx, y: y + 5.5, z: p.z + sz, sx: 5.4, sy: 11, sz: 5.4, col: 0xc6ced6 });
        decor.push({ t: 'cone', x: p.x + sx, y: y + 11, z: p.z + sz, sx: 5.6, sy: 3, sz: 5.6, col: 0x8f98a2 });
      }
      for (let i = 0; i < 7; i++) { const x = p.x + rr(-22, 22), z = p.z + rr(-22, 22); const y = heightAt(x, z); cbox(x, z, 1.6, 1.6, y - 1, y + 1.4, 0xd9be5a); }
      for (let i = 0; i < 5; i++) lootSpots.push({ x: p.x + rr(-22, 22), y: heightAt(p.x, p.z) + 0.4, z: p.z + rr(-22, 22) });
    } else if (p.style === 'military') {
      for (let i = 0; i < 9; i++) {
        const a = rr(0, 6.28), rad = rr(8, 26);
        container(p.x + Math.cos(a) * rad, p.z + Math.sin(a) * rad, rng() < 0.5, pick([0xb04a2f, 0x2f6fb0, 0x4c7a3a, 0xd29a2e, 0x6d6f73]), rng() < 0.4);
      }
      house(p.x, p.z, 16, 11, { H: 3.6, col: 0x727a68, roof: 0x4c5446, flat: true, loot: 4, chest: true, doorW: 3 });
      spiralTower(p.x + 20, p.z - 18, 0x59604f);
    } else if (p.style === 'port') {
      house(p.x + 6, p.z + 14, 10, 8, { col: 0xc9d6dd }); house(p.x - 10, p.z + 10, 9, 9, { col: 0xe2b9a0 });
      house(p.x + 18, p.z + 2, 8, 8, { col: 0xcfe0c3 });
      for (let i = 0; i < 4; i++) container(p.x - 14 + i * 7, p.z - 10, true, pick([0xb04a2f, 0x2f6fb0, 0xd29a2e, 0x4c7a3a]), i % 2 === 0);
      const ang = Math.atan2(p.z, p.x); const dx = Math.cos(ang), dz = Math.sin(ang);
      for (let i = 0; i < 12; i++) { // píer para o mar
        const px = p.x + dx * (8 + i * 3.4), pz = p.z + dz * (8 + i * 3.4);
        box(px - 2, -4, pz - 2, px + 2, 0.9, pz + 2, 0x8a6a46);
      }
      lootSpots.push({ x: p.x + dx * 30, y: 1.3, z: p.z + dz * 30 });
      chestSpots.push({ x: p.x + dx * 40, y: 1.0, z: p.z + dz * 40 });
    } else if (p.style === 'factory') {
      house(p.x - 12, p.z - 4, 28, 18, { H: 7, col: 0x8d9298, roof: 0x4f5359, flat: true, doorW: 5, loot: 4, chest: true });
      house(p.x + 14, p.z + 12, 18, 14, { H: 6, col: 0x7d8a96, roof: 0x4f5359, flat: true, doorW: 4, loot: 4, chest: true });
      for (const [ox, oz] of [[12, -14], [20, -8]]) {
        const y = heightAt(p.x + ox, p.z + oz);
        cbox(p.x + ox, p.z + oz, 3.4, 3.4, y - 2, y + 20, 0x9a6d5a);
        decor.push({ t: 'cyl', x: p.x + ox, y: y + 10, z: p.z + oz, sx: 3.4, sy: 20, sz: 3.4, col: 0xa97b66 });
      }
      for (let i = 0; i < 4; i++) container(p.x - 22 + i * 4, p.z + 18, false, pick([0xb04a2f, 0x2f6fb0, 0xd29a2e]), i % 2 === 0);
    } else if (p.style === 'ruins') {
      for (let i = 0; i < 14; i++) {
        const x = p.x + rr(-20, 20), z = p.z + rr(-20, 20), y = heightAt(x, z), h = rr(1.6, 6), len = rr(3, 9);
        const ax = rng() < 0.5; cbox(x, z, ax ? len : 0.8, ax ? 0.8 : len, y - 2, y + h, pick([0x9b9a8f, 0x8a897f, 0xaaa89a]));
      }
      for (let i = 0; i < 6; i++) { const x = p.x + rr(-18, 18), z = p.z + rr(-18, 18), y = heightAt(x, z); cbox(x, z, 1.3, 1.3, y - 2, y + rr(4, 8), 0xb9b6a8); }
      house(p.x, p.z, 11, 11, { col: 0x9b9a8f, roof: 0x77766c, flat: true, loot: 3, chest: true });
      lootSpots.push({ x: p.x + 10, y: heightAt(p.x, p.z) + 0.4, z: p.z - 10 });
    } else if (p.style === 'tower') {
      spiralTower(p.x, p.z, 0x6f757c);
      house(p.x + 14, p.z + 8, 9, 8, { col: 0xc9d6dd });
      house(p.x - 14, p.z + 6, 9, 8, { col: 0xe2b9a0 });
    }
  }

  // ---------- Props: caixas, barris, postes, cercas ----------
  function crate(x, z, sz = 1.4) { const y = heightAt(x, z); box(x - sz / 2, y - 0.5, z - sz / 2, x + sz / 2, y + sz, z + sz / 2, 0xb98550); decor.push({ t: 'box', x, y: y + sz / 2, z, sx: sz + 0.08, sy: 0.12, sz: sz + 0.08, col: 0x7a5530 }); }
  function barrel(x, z, c) { const y = heightAt(x, z); box(x - 0.45, y - 0.5, z - 0.45, x + 0.45, y + 1.1, z + 0.45, c); decor.push({ t: 'cyl', x, y: y + 0.55, z, sx: 0.9, sy: 1.1, sz: 0.9, col: c }); decor.push({ t: 'cyl', x, y: y + 0.55, z, sx: 0.95, sy: 0.12, sz: 0.95, col: 0x333333 }); }
  function lamp(x, z) { const y = heightAt(x, z); decor.push({ t: 'cyl', x, y: y + 2.2, z, sx: 0.14, sy: 4.4, sz: 0.14, col: 0x3a3f47 }); decor.push({ t: 'box', x, y: y + 4.5, z, sx: 0.5, sy: 0.35, sz: 0.5, col: 0xffe9a0 }); }
  for (const p of pc) {
    if (p.style === 'military' || p.style === 'factory' || p.style === 'port') {
      for (let i = 0; i < 7; i++) crate(p.x + rr(-24, 24), p.z + rr(-24, 24), rr(1.1, 1.8));
      for (let i = 0; i < 7; i++) barrel(p.x + rr(-24, 24), p.z + rr(-24, 24), pick([0xd23a2a, 0x2f6fb0, 0xe0b030, 0x4c7a3a]));
    }
    if (p.style === 'town' || p.style === 'suburb') for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; lamp(p.x + Math.cos(a) * (p.r - 6), p.z + Math.sin(a) * (p.r - 6)); }
    if (p.style === 'farm') {
      for (let i = 0; i < 6; i++) crate(p.x + rr(-24, 24), p.z + rr(-24, 24), 1.5);
      for (let i = -12; i <= 12; i++) { const x = p.x + i * 2, z = p.z - 27, y = heightAt(x, z); decor.push({ t: 'box', x, y: y + 0.6, z, sx: 0.15, sy: 1.2, sz: 0.15, col: 0x8a5a3c }); if (i < 12) decor.push({ t: 'box', x: x + 1, y: y + 0.9, z, sx: 2, sy: 0.1, sz: 0.08, col: 0xa8764c }); }
    }
  }
  for (let i = 0, n = 0; i < 2500 && n < 300; i++) { // arbustos e flores (só visual)
    const x = rr(-175, 175), z = rr(-175, 175), y = heightAt(x, z);
    if (Math.hypot(x, z) > 165 || y < 1.4 || poiAt(x, z, 1)) continue; n++;
    if (rng() < 0.7) { const s = rr(0.7, 1.5); decor.push({ t: 'blob', x, y: y + s * 0.3, z, sx: s * 1.3, sy: s * 0.9, sz: s * 1.2, col: pick([0x4f9a3a, 0x3f8a3a, 0x63a845, 0x57a04a]) }); }
    else for (let k = 0; k < 4; k++) decor.push({ t: 'blob', x: x + rr(-0.6, 0.6), y: y + 0.18, z: z + rr(-0.6, 0.6), sx: 0.3, sy: 0.3, sz: 0.3, col: pick([0xff5a6a, 0xffd84a, 0xffffff, 0xb06bff]) });
  }

  // ---------- Árvores, pedras e sucata ----------
  let tries = 0;
  while (nodes.filter((n) => n.t === 'tree').length < 430 && tries++ < 6000) {
    const x = rr(-170, 170), z = rr(-170, 170);
    if (Math.hypot(x, z) > 160 || poiAt(x, z, 4)) continue;
    const h = heightAt(x, z); if (h < 1.5) continue;
    const forest = vnoise(x * 0.035 + 50, z * 0.035 + 50, seed + 9);
    if (rng() > 0.15 + forest * 0.95) continue;
    addNode('tree', x, z, rr(0.85, 1.35));
  }
  tries = 0;
  while (nodes.filter((n) => n.t === 'rock').length < 90 && tries++ < 3000) {
    const x = rr(-175, 175), z = rr(-175, 175);
    if (Math.hypot(x, z) > 168 || heightAt(x, z) < 0.7) continue;
    addNode('rock', x, z, rr(0.8, 1.9));
  }
  for (const p of pc) if (p.style === 'military' || p.style === 'factory' || p.style === 'port')
    for (let i = 0; i < 4; i++) { const x = p.x + rr(-24, 24), z = p.z + rr(-24, 24); if (heightAt(x, z) > 0.8) addNode('scrap', x, z, 1); }

  // loot ao ar livre
  tries = 0;
  while (lootSpots.length < 170 && tries++ < 2000) {
    const x = rr(-160, 160), z = rr(-160, 160); const h = heightAt(x, z);
    if (Math.hypot(x, z) > 155 || h < 1) continue;
    lootSpots.push({ x, y: h + 0.4, z });
  }
  tries = 0;
  while (chestSpots.length < 34 && tries++ < 2000) {
    const x = rr(-150, 150), z = rr(-150, 150); const h = heightAt(x, z);
    if (Math.hypot(x, z) > 148 || h < 1) continue;
    chestSpots.push({ x, y: h + 0.1, z });
  }

  // ---------- Física ----------
  const H = PLAYER_H, R = PLAYER_R;
  function groundAt(x, z, y) {
    let g = heightAt(x, z);
    const list = colliders.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x < c.minx - 0.25 || x > c.maxx + 0.25 || z < c.minz - 0.25 || z > c.maxz + 0.25) continue;
      let top;
      if (c.kind === 'ramp') {
        const cx = Math.min(c.maxx, Math.max(c.minx, x)), cz = Math.min(c.maxz, Math.max(c.minz, z));
        top = rampY(c, cx, cz);
      } else top = c.maxy;
      if (top <= y + STEP && top > g) g = top;
    }
    return g;
  }
  function blocked(x, z, y) {
    const list = colliders.query(x - R, z - R, x + R, z + R);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x + R <= c.minx || x - R >= c.maxx || z + R <= c.minz || z - R >= c.maxz) continue;
      if (c.kind === 'ramp') {
        const cx = Math.min(c.maxx, Math.max(c.minx, x)), cz = Math.min(c.maxz, Math.max(c.minz, z));
        if (rampY(c, cx, cz) > y + STEP && c.miny < y + H) return true;
      } else if (c.maxy > y + STEP && c.miny < y + H) return true;
    }
    return false;
  }
  function headBlocked(x, z, y) { // algo logo acima da cabeça?
    const list = colliders.query(x - R, z - R, x + R, z + R);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.kind === 'ramp') continue;
      if (x + R <= c.minx || x - R >= c.maxx || z + R <= c.minz || z - R >= c.maxz) continue;
      if (c.miny >= y + H - 0.1 && c.miny < y + H + 0.35) return true;
    }
    return false;
  }

  // Movimento de personagem (usado pelo cliente e pelos bots)
  function moveEntity(s, dt, wx, wz, speed, jump) {
    const k = Math.min(1, (s.onGround ? 14 : 3.2) * dt);
    s.vx += (wx * speed - s.vx) * k; s.vz += (wz * speed - s.vz) * k;
    let nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
    const rr2 = Math.hypot(nx, nz);
    if (rr2 > MAP_LIMIT) { nx *= MAP_LIMIT / rr2; nz *= MAP_LIMIT / rr2; }
    if (!blocked(nx, s.z, s.y) || blocked(s.x, s.z, s.y)) s.x = nx; else s.vx = 0;
    if (!blocked(s.x, nz, s.y) || blocked(s.x, s.z, s.y)) s.z = nz; else s.vz = 0;
    if (jump && s.onGround) { s.vy = JUMP_V; s.onGround = false; }
    const gy = groundAt(s.x, s.z, s.y);
    if (s.onGround && s.vy <= 0) {
      if (gy >= s.y - 0.75) { s.y = gy; s.vy = 0; }
      else s.onGround = false;
    }
    if (!s.onGround) {
      s.vy -= GRAVITY * dt;
      if (s.vy > 0 && headBlocked(s.x, s.z, s.y)) s.vy = 0;
      const ny = s.y + s.vy * dt;
      if (s.vy <= 0 && ny <= gy) { s.y = gy; s.vy = 0; s.onGround = true; }
      else s.y = ny;
    }
  }

  // Raio contra terreno + colisores. Retorna {t, kind, c, nx..} ou null
  function raycast(ox, oy, oz, dx, dy, dz, maxD, ignore) {
    let best = maxD, hit = null;
    for (let d = 0; d <= maxD + 8; d += 8) {
      const px = ox + dx * d, pz = oz + dz * d;
      const list = colliders.query(px - 8, pz - 8, px + 8, pz + 8);
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; if (c === ignore) continue;
        const t = rayAABB(ox, oy, oz, dx, dy, dz, c, best);
        if (t >= 0 && t < best) { best = t; hit = { t, kind: 'collider', c }; }
      }
    }
    // terreno
    let prev = 0;
    for (let d = 1; d <= best; d += 1.2) {
      const y = oy + dy * d, h = heightAt(ox + dx * d, oz + dz * d);
      if (y < h) {
        let a = prev, b = d;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < heightAt(ox + dx * m, oz + dz * m)) b = m; else a = m; }
        return { t: b, kind: 'terrain' };
      }
      prev = d;
    }
    return hit;
  }

  return { seed, heightAt, poiAt, pois: pc, colliders, statics, decor, nodes, lootSpots, chestSpots, groundAt, blocked, moveEntity, raycast, rawH };
}

// Geometria de uma peça de construção (colisor) — compartilhada entre cliente/servidor
export function makePieceCollider(world, type, gx, by, gz, dir) {
  const base = by / 4, cx = gx * PIECE, cz = gz * PIECE;
  let minx, maxx, minz, maxz, miny, maxy;
  if (type === 'wall') {
    if (dir === 0) { minx = cx - 2; maxx = cx + 2; minz = cz - 2 - 0.15; maxz = cz - 2 + 0.15; }
    else { minx = cx - 2 - 0.15; maxx = cx - 2 + 0.15; minz = cz - 2; maxz = cz + 2; }
    miny = base; maxy = base + PIECE;
  } else {
    minx = cx - 2; maxx = cx + 2; minz = cz - 2; maxz = cz + 2;
    miny = type === 'floor' ? base - 0.4 : base; maxy = type === 'floor' ? base : base + PIECE;
  }
  // "saia" até o terreno para não ficar flutuando em terreno inclinado
  const hs = [world.heightAt(minx, minz), world.heightAt(maxx, minz), world.heightAt(minx, maxz), world.heightAt(maxx, maxz), world.heightAt(cx, cz)];
  const tmin = Math.min(...hs), tmax = Math.max(...hs);
  const near = base - tmax <= 4.5;
  if (near && tmin - 0.3 < miny) miny = tmin - 0.3;
  const c = { minx, miny, minz, maxx, maxy, maxz, kind: type === 'ramp' ? 'ramp' : 'box', build: true, type, gx, by, gz, dir, tmin, tmax, base };
  if (type === 'ramp') { c.dir = dir; c.baseY = base; c.h = PIECE; }
  return c;
}
