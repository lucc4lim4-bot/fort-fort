// Lógica autoritativa do servidor: partidas, combate, loot, construção, tempestade e bots.
import {
  TOTAL_PLAYERS, TICK, EYE, PLAYER_H, WEAPONS, AMMO, CONSUMABLES, RARITY, RMUL, MAT_INFO, BUILD_COST,
  STORM_STAGES, STORM_START_R, BUS_SPEED, BUS_Y, POIS, SKINS, MATS,
} from '../shared/data.js';
import { createWorld, makePieceCollider, pieceKey, pieceCenter, rayAABB } from '../shared/world.js';

export const WEAPON_IDS = ['pickaxe', 'pistol', 'smg', 'ar', 'shotgun', 'sniper', 'rocket'];
const GUNS = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'rocket'];
const GUN_WEIGHT = { pistol: 16, smg: 18, ar: 28, shotgun: 20, sniper: 9, rocket: 4 };
const CONS = Object.keys(CONSUMABLES);
const NODE_MAT = { tree: 'wood', rock: 'brick', scrap: 'metal' };
const BOT_NAMES = ['Bia', 'Rafa', 'Kiko', 'Lobo', 'Nina', 'Tigrão', 'Duda', 'Zeca', 'Mel', 'Bruxo', 'Pandora', 'Tião', 'Luna', 'Fênix', 'Cacá', 'Jabuti', 'Vesgo', 'Maya', 'Dino', 'Pipoca', 'Sombra', 'Raio', 'Nico', 'Gaia', 'Thor', 'Lili', 'Max', 'Safira', 'Rex', 'Cometa'];

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Game {
  constructor(seed = 1337) {
    this.world = createWorld(seed);
    this.seed = seed;
    this.players = new Map();
    this.nextId = 1;
    this.phase = 'lobby'; // lobby | play | ended
    this.lobbyT = -1;
    this.endT = 0;
    this.tickN = 0;
    this.items = new Map(); this.nextItem = 1;
    this.chests = this.world.chestSpots.map((c, i) => ({ id: i, x: c.x, y: c.y, z: c.z, open: false }));
    this.builds = new Map();
    this.storm = null; this.bus = null; this.matchT = 0; this.winner = null;
    this.lastTick = Date.now();
  }

  // ---------- rede ----------
  send(p, msg) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); }
  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  alivePlayers() { return [...this.players.values()].filter((p) => p.alive); }

  addHuman(ws, name, skin) {
    if (this.humans().length >= 16) { ws.close(); return null; }
    const p = this.newPlayer(false, name, skin); p.ws = ws;
    this.players.set(p.id, p); this.rosterDirty = true;
    this.send(p, {
      t: 'welcome', id: p.id, seed: this.seed, phase: this.phase, ...this.fullState(),
    });
    if (this.phase === 'lobby' && this.lobbyT < 0) this.lobbyT = 20;
    this.broadcast({ t: 'chat', m: `${p.name} entrou no jogo` });
    return p;
  }
  removePlayer(p) {
    if (!this.players.has(p.id)) return;
    if (p.alive) this.eliminate(p, null, 'quit', false);
    this.players.delete(p.id);
    this.broadcast({ t: 'chat', m: `${p.name} saiu` });
    if (!this.humans().length) { if (this.phase !== 'lobby') this.resetToLobby(); this.lobbyT = -1; }
  }
  fullState() {
    return {
      items: [...this.items.values()].map((i) => this.itemMsg(i)),
      chests: this.chests.filter((c) => c.open).map((c) => c.id),
      builds: [...this.builds.values()].map((b) => [b.type, b.gx, b.by, b.gz, b.dir, b.mat, b.hp / b.maxhp]),
    };
  }
  itemMsg(i) { return [i.id, i.kind, i.k, i.r, i.n, r1(i.x), r1(i.y), r1(i.z)]; }

  newPlayer(bot, name, skin) {
    const id = this.nextId++;
    return {
      id, bot, name: (name || 'Jogador').slice(0, 16), skin: Number.isInteger(skin) && skin >= 0 && skin < SKINS.length ? skin : Math.floor(Math.random() * SKINS.length),
      ws: null, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, onGround: true, flags: 0, emote: 0,
      hp: 100, sh: 0, alive: false, inMatch: false, bus: false, inv: [], slot: 0, ammo: {}, mats: {}, kills: 0, place: 0,
      reloadEnd: 0, useEnd: 0, using: null, nextFire: 0, dirty: true, lastIn: 0, held: 0, killsAt: 0, ai: null,
    };
  }
  resetInventory(p) {
    p.inv = [{ k: 'pickaxe' }, null, null, null, null, null];
    p.slot = 0; p.ammo = { light: 0, medium: 0, shell: 0, heavy: 0, rocket: 0 }; p.mats = { wood: 120, brick: 0, metal: 0 };
    p.reloadEnd = 0; p.using = null; p.dirty = true;
  }

  // ---------- loop ----------
  tick() {
    const now = Date.now();
    let dt = (now - this.lastTick) / 1000; this.lastTick = now; dt = Math.min(dt, 0.1);
    this.tickN++;
    if (this.phase === 'lobby') {
      if (this.humans().length && this.lobbyT >= 0) { this.lobbyT -= dt; if (this.lobbyT <= 0) this.startMatch(); }
    } else if (this.phase === 'play') {
      this.matchT += dt;
      this.updateBus(dt); this.updateStorm(dt);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (p.bot) this.updateBot(p, dt);
        this.updatePlayer(p, now, dt);
      }
      this.checkEnd(dt);
    } else if (this.phase === 'ended') {
      this.endT -= dt; if (this.endT <= 0) this.resetToLobby();
    }
    this.snapshot();
  }

  snapshot() {
    const pl = [];
    for (const p of this.players.values()) {
      if (!p.inMatch && this.phase !== 'lobby') continue;
      if (!p.inMatch) continue;
      pl.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), Math.ceil(p.hp), Math.ceil(p.sh), p.flags | (p.alive ? 0 : 128) | (p.bus ? 256 : 0), p.held, p.emote]);
    }
    const st = this.storm;
    const msg = {
      t: 's', n: this.tickN, ph: this.phase, lt: this.phase === 'lobby' ? Math.max(0, Math.ceil(this.lobbyT)) : Math.round(this.matchT),
      al: this.alivePlayers().length, hu: this.humans().length,
      st: st ? [r1(st.cx), r1(st.cz), r1(st.r), r1(st.ncx), r1(st.ncz), r1(st.nr), st.phase === 'wait' ? 0 : 1, Math.ceil(Math.max(0, st.t)), st.stage] : null,
      bus: this.bus && this.bus.active ? [r1(this.bus.x), r1(this.bus.z), BUS_Y, r2(this.bus.dx), r2(this.bus.dz)] : null,
      p: pl,
    };
    if (this.phase === 'ended' && this.winner) msg.win = [this.winner.id, this.winner.name];
    if (this.rosterDirty || this.tickN % 45 === 0) { msg.ro = [...this.players.values()].map((q) => [q.id, q.name, q.skin, q.bot ? 1 : 0]); this.rosterDirty = false; }
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(s);
        if (p.dirty) { p.dirty = false; this.sendInv(p); }
      }
    }
  }
  sendInv(p) {
    this.send(p, { t: 'inv', inv: p.inv.map((i) => (i ? [i.k, i.r || 0, i.mag ?? 0, i.n || 0] : null)), slot: p.slot, ammo: p.ammo, mats: p.mats });
  }

  // ---------- partida ----------
  startMatch() {
    this.phase = 'play'; this.matchT = 0; this.winner = null;
    for (const b of this.builds.values()) this.world.colliders.remove(b.col);
    this.builds.clear(); this.items.clear(); this.nextItem = 1;
    for (const c of this.chests) c.open = false;
    // remove bots antigos
    for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.id);
    this.rosterDirty = true;
    const humans = this.humans();
    const nBots = Math.max(0, TOTAL_PLAYERS - humans.length);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < nBots; i++) {
      const b = this.newPlayer(true, names[i % names.length], undefined);
      b.name = names[i % names.length]; this.players.set(b.id, b);
    }
    // ônibus de batalha
    const th = Math.random() * Math.PI * 2, off = rnd(-45, 45);
    const dx = Math.cos(th), dz = Math.sin(th);
    this.bus = { active: true, dx, dz, x: -dx * 190 - dz * off, z: -dz * 190 + dx * off, len: 380 };
    for (const p of this.players.values()) {
      p.inMatch = true; p.alive = true; p.hp = 100; p.sh = 0; p.kills = 0; p.place = 0; p.bus = true; p.flags = 0; p.emote = 0; p.held = 0;
      p.x = this.bus.x; p.z = this.bus.z; p.y = BUS_Y; p.vx = p.vy = p.vz = 0; p.onGround = false;
      this.resetInventory(p);
      if (p.bot) {
        const poi = POIS[Math.floor(Math.random() * POIS.length)];
        p.ai = { tx: poi.x + rnd(-12, 12), tz: poi.z + rnd(-12, 12), jumpDist: rnd(60, 110), state: 'bus', think: 0, strafe: 1, strafeT: 0, stuckT: 0, lx: 0, lz: 0, skill: rnd(0.25, 0.8), wantItem: null, enemy: null, fire: 0, bad: new Map(), stuckN: 0 };
      }
    }
    // loot
    const spots = this.world.lootSpots.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(spots.length, 150); i++) this.spawnLoot(spots[i].x, spots[i].y, spots[i].z, Math.random() < 0.55 ? 'w' : null);
    // tempestade
    this.storm = { stage: 0, phase: 'wait', t: STORM_STAGES[0].wait + 14, cx: 0, cz: 0, r: STORM_START_R, from: null };
    this.nextCircle();
    this.broadcast({ t: 'start', seed: this.seed });
    for (const p of this.humans()) { this.send(p, { t: 'welcome', id: p.id, seed: this.seed, phase: 'play', ...this.fullState() }); }
  }
  nextCircle() {
    const s = this.storm, st = STORM_STAGES[Math.min(s.stage, STORM_STAGES.length - 1)];
    const maxOff = Math.max(0, s.r - st.r) * 0.85, a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff;
    let ncx = s.cx + Math.cos(a) * d, ncz = s.cz + Math.sin(a) * d;
    const lim = 170 - st.r; const m = Math.hypot(ncx, ncz); if (m > lim && lim > 0) { ncx *= lim / m; ncz *= lim / m; }
    s.ncx = ncx; s.ncz = ncz; s.nr = st.r;
  }
  updateStorm(dt) {
    const s = this.storm; if (!s) return;
    const st = STORM_STAGES[Math.min(s.stage, STORM_STAGES.length - 1)];
    if (!this.bus.active || this.matchT > 14) s.t -= dt; // só começa a contar depois da queda inicial
    if (s.phase === 'wait') {
      if (s.t <= 0) { s.phase = 'shrink'; s.t = st.shrink; s.from = { cx: s.cx, cz: s.cz, r: s.r }; }
    } else {
      const k = 1 - Math.max(0, s.t) / st.shrink;
      s.cx = s.from.cx + (s.ncx - s.from.cx) * k; s.cz = s.from.cz + (s.ncz - s.from.cz) * k; s.r = s.from.r + (s.nr - s.from.r) * k;
      if (s.t <= 0) {
        s.cx = s.ncx; s.cz = s.ncz; s.r = s.nr;
        if (s.stage < STORM_STAGES.length - 1) { s.stage++; s.phase = 'wait'; s.t = STORM_STAGES[s.stage].wait; this.nextCircle(); }
        else { s.t = 9999; }
      }
    }
  }
  updateBus(dt) {
    const b = this.bus; if (!b || !b.active) return;
    b.x += b.dx * BUS_SPEED * dt; b.z += b.dz * BUS_SPEED * dt;
    for (const p of this.players.values()) if (p.bus && p.alive) { p.x = b.x; p.z = b.z; p.y = BUS_Y; }
    const proj = b.x * b.dx + b.z * b.dz;
    if (proj > 190) {
      b.active = false;
      for (const p of this.players.values()) if (p.bus) this.leaveBus(p);
    }
  }
  leaveBus(p) {
    p.bus = false; p.flags |= 1; p.onGround = false; p.vy = 0;
    if (p.bot) p.ai.state = 'fall';
  }
  checkEnd(dt) {
    const alive = this.alivePlayers();
    const humansAlive = alive.filter((p) => !p.bot).length;
    if (alive.length <= 1) return this.endMatch(alive[0] || null);
    if (!humansAlive && this.humans().length) {
      this.noHumanT = (this.noHumanT || 0) + dt;
      if (this.noHumanT > 6) this.endMatch(alive.sort((a, b) => b.kills - a.kills)[0]);
    } else this.noHumanT = 0;
  }
  endMatch(winner) {
    this.phase = 'ended'; this.endT = 12; this.winner = winner; this.noHumanT = 0;
    if (winner) { winner.place = 1; }
    this.broadcast({ t: 'end', win: winner ? [winner.id, winner.name, winner.kills, winner.skin] : null });
    for (const p of this.humans()) if (p.alive) this.send(p, { t: 'victory', kills: p.kills });
  }
  resetToLobby() {
    this.phase = 'lobby'; this.storm = null; this.bus = null; this.noHumanT = 0;
    for (const p of [...this.players.values()]) { if (p.bot) this.players.delete(p.id); else { p.inMatch = false; p.alive = false; p.flags = 0; } }
    this.lobbyT = this.humans().length ? 20 : -1;
    this.broadcast({ t: 'lobby' });
  }

  // ---------- jogador ----------
  handle(p, m) {
    switch (m.t) {
      case 'in': { // estado de movimento enviado pelo cliente
        if (!p.alive || p.bus) return;
        const x = +m.x, y = +m.y, z = +m.z; if (!isFinite(x + y + z)) return;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d > 120 && !process.env.DEBUG_TP) { this.send(p, { t: 'tp', x: p.x, y: p.y, z: p.z }); return; }
        p.x = Math.max(-199, Math.min(199, x)); p.y = y; p.z = Math.max(-199, Math.min(199, z));
        p.yaw = +m.yaw || 0; p.pitch = Math.max(-1.5, Math.min(1.5, +m.pitch || 0));
        p.flags = (m.f | 0) & 127 | (p.reloadEnd > Date.now() ? 32 : 0);
        p.emote = m.em ? 1 : 0;
        break;
      }
      case 'slot': this.setSlot(p, m.i | 0); break;
      case 'shoot': this.shoot(p, +m.ax, +m.ay, +m.az, !!m.ads); break;
      case 'reload': this.startReload(p); break;
      case 'pick': this.pickup(p, m.id | 0); break;
      case 'chest': this.openChest(p, m.id | 0); break;
      case 'use': this.useItem(p, m.i | 0); break;
      case 'build': this.build(p, m); break;
      case 'jump': if (p.bus && p.alive) this.leaveBus(p); break;
      case 'drop': this.dropSlot(p, m.i | 0); break;
      case 'start': if (this.phase === 'lobby' && this.humans().length) this.lobbyT = Math.min(this.lobbyT, 1.2); break;
      case 'dbg': if (process.env.DEBUG_TP) { const w = WEAPONS[m.k]; if (w) { const i = p.inv.findIndex((x, n) => n > 0 && !x); p.inv[i < 0 ? 1 : i] = { k: m.k, r: m.r | 0, mag: w.mag }; p.ammo[w.ammo] = 200; p.mats = { wood: 500, brick: 300, metal: 300 }; p.dirty = true; } } break;
      case 'chat': this.broadcast({ t: 'chat', m: `${p.name}: ${String(m.m).slice(0, 80)}` }); break;
      case 'skin': if (this.phase === 'lobby' && Number.isInteger(m.s) && m.s >= 0 && m.s < SKINS.length) { p.skin = m.s; this.rosterDirty = true; } if (typeof m.n === 'string') p.name = m.n.slice(0, 16) || p.name; break;
    }
  }

  setSlot(p, i) {
    if (!p.alive || i < 0 || i > 5 || p.slot === i) return;
    p.slot = i; p.reloadEnd = 0; p.using = null; this.updateHeld(p); p.dirty = true;
  }
  updateHeld(p) {
    const it = p.inv[p.slot];
    p.held = !it ? 0 : WEAPON_IDS.indexOf(it.k) >= 0 ? WEAPON_IDS.indexOf(it.k) : 10 + CONS.indexOf(it.k);
  }
  weapon(p) { const it = p.inv[p.slot]; return it && WEAPONS[it.k] ? { it, w: WEAPONS[it.k] } : null; }

  updatePlayer(p, now, dt) {
    if (p.reloadEnd && now >= p.reloadEnd) {
      p.reloadEnd = 0;
      const cur = this.weapon(p);
      if (cur && !cur.w.melee) {
        const need = cur.w.mag - cur.it.mag, take = Math.min(need, p.ammo[cur.w.ammo]);
        cur.it.mag += take; p.ammo[cur.w.ammo] -= take; p.dirty = true;
      }
    }
    if (p.using && now >= p.useEnd) {
      const it = p.inv[p.using.slot], c = it && CONSUMABLES[it.k];
      if (c) {
        if (c.hp) p.hp = Math.min(c.hpMax, Math.max(p.hp, p.hp + c.hp));
        if (c.sh) p.sh = Math.min(c.shMax, Math.max(p.sh, p.sh + c.sh));
        it.n--; if (it.n <= 0) { p.inv[p.using.slot] = null; if (p.slot === p.using.slot) { p.slot = 0; this.updateHeld(p); } }
        p.dirty = true;
      }
      p.using = null;
    }
    // tempestade
    if (this.storm && !p.bus) {
      const d = Math.hypot(p.x - this.storm.cx, p.z - this.storm.cz);
      if (d > this.storm.r) {
        const dps = STORM_STAGES[Math.min(this.storm.stage, STORM_STAGES.length - 1)].dmg;
        this.damage(p, dps * dt, null, 'storm', false, true);
      }
    }
    // auto-coleta de munição para humanos
    if (!p.bot && this.tickN % 4 === 0 && !p.bus) {
      for (const it of this.items.values()) {
        if (it.kind === 'ammo' && Math.abs(it.x - p.x) < 2.2 && Math.abs(it.z - p.z) < 2.2 && Math.abs(it.y - p.y) < 3) this.pickup(p, it.id, true);
      }
    }
  }

  // ---------- combate ----------
  startReload(p) {
    const cur = this.weapon(p); if (!cur || cur.w.melee || p.reloadEnd || !p.alive) return;
    if (cur.it.mag >= cur.w.mag || p.ammo[cur.w.ammo] <= 0) return;
    const dur = cur.w.reload / (1 + (cur.it.r || 0) * 0.04);
    p.reloadEnd = Date.now() + dur * 1000; p.using = null;
    this.send(p, { t: 'rl', d: dur });
  }

  shoot(p, ax, ay, az, ads) {
    if (!p.alive || p.bus || (p.flags & 3) || !isFinite(ax + ay + az)) return;
    const cur = this.weapon(p); if (!cur) return;
    const now = Date.now(); if (now < p.nextFire || p.reloadEnd || p.using) return;
    const { it, w } = cur;
    const ox = p.x, oy = p.y + EYE, oz = p.z;
    let dx = ax - ox, dy = ay - oy, dz = az - oz; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    p.nextFire = now + 1000 / w.rps - 15;
    const rmul = RMUL[it.r || 0];
    if (w.melee) {
      const hit = this.castRay(p, ox, oy, oz, dx, dy, dz, w.range);
      this.broadcast({ t: 'sw', i: p.id });
      if (hit) this.applyHit(p, hit, w.dmg, 'pickaxe', 1, ox, oy, oz);
      return;
    }
    if (it.mag <= 0) { this.startReload(p); return; }
    it.mag--; p.dirty = true;
    const spread = w.spread * (ads ? 0.45 : 1) * (p.bot ? 1 : 1);
    const ends = [];
    for (let k = 0; k < w.pellets; k++) {
      let ddx = dx + (Math.random() - 0.5) * 2 * spread, ddy = dy + (Math.random() - 0.5) * 2 * spread, ddz = dz + (Math.random() - 0.5) * 2 * spread;
      const l = Math.hypot(ddx, ddy, ddz); ddx /= l; ddy /= l; ddz /= l;
      const hit = this.castRay(p, ox, oy, oz, ddx, ddy, ddz, w.range);
      const t = hit ? hit.t : w.range;
      ends.push([r1(ox + ddx * t), r1(oy + ddy * t), r1(oz + ddz * t), hit ? (hit.type === 'player' ? 2 : 1) : 0]);
      if (w.explode) { this.explode(p, ox + ddx * t, oy + ddy * t, oz + ddz * t, w.dmg * rmul, w.explode, it.k); ends[ends.length - 1][3] = 3; }
      else if (hit) this.applyHit(p, hit, w.dmg * rmul, it.k, w.hs, ox, oy, oz);
    }
    this.broadcast({ t: 'sh', i: p.id, o: [r1(ox), r1(oy), r1(oz)], e: ends, w: WEAPON_IDS.indexOf(it.k) });
    if (it.mag <= 0 && p.ammo[w.ammo] > 0) this.startReload(p);
  }

  explode(p, x, y, z, dmg, radius, wk) {
    for (const q of this.players.values()) {
      if (!q.alive || q.bus) continue;
      const d = Math.hypot(q.x - x, q.y + 0.9 - y, q.z - z);
      if (d < radius) this.damage(q, dmg * (1 - d / radius * 0.7) * (q === p ? 0.5 : 1), p, wk, false);
    }
    for (const b of [...this.builds.values()]) {
      const c = b.col; if (Math.hypot((c.minx + c.maxx) / 2 - x, (c.miny + c.maxy) / 2 - y, (c.minz + c.maxz) / 2 - z) < radius + 1.5) this.damageBuild(b, 260);
    }
  }

  castRay(shooter, ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD, res = null;
    const wr = this.world.raycast(ox, oy, oz, dx, dy, dz, maxD);
    if (wr) { best = wr.t; res = { type: wr.kind === 'terrain' ? 'terrain' : 'collider', t: wr.t, c: wr.c }; }
    for (const q of this.players.values()) {
      if (q === shooter || !q.alive || q.bus) continue;
      if (Math.abs(q.x - ox) > maxD + 2 || Math.abs(q.z - oz) > maxD + 2) continue;
      const box = { minx: q.x - 0.45, maxx: q.x + 0.45, minz: q.z - 0.45, maxz: q.z + 0.45, miny: q.y, maxy: q.y + PLAYER_H + 0.1 };
      const t = rayAABB(ox, oy, oz, dx, dy, dz, box, best);
      if (t >= 0 && t < best) { best = t; res = { type: 'player', t, q, hy: oy + dy * t - q.y }; }
    }
    return res;
  }

  applyHit(p, hit, dmg, wk, hsMul, ox, oy, oz) {
    if (hit.type === 'player') {
      const head = hit.hy >= 1.48;
      const falloff = wk === 'shotgun' ? Math.max(0.35, 1 - hit.t / 55) : 1;
      this.damage(hit.q, dmg * (head ? hsMul : 1) * falloff, p, wk, head);
    } else if (hit.type === 'collider') {
      const c = hit.c;
      if (c.build) { this.damageBuild(c.bref, wk === 'pickaxe' ? 45 : dmg); }
      else if (c.node !== undefined && wk === 'pickaxe') {
        const n = this.world.nodes[c.node], mat = NODE_MAT[n.t], amt = 10 + Math.floor(Math.random() * 6);
        p.mats[mat] = Math.min(999, p.mats[mat] + amt); p.dirty = true;
        this.broadcast({ t: 'hv', n: n.id, i: p.id });
        this.send(p, { t: 'hvm', mat, amt });
      }
    }
  }

  damage(v, amount, killer, wk, head, silent) {
    if (!v.alive || amount <= 0) return;
    let rem = amount;
    if (v.sh > 0) { const a = Math.min(v.sh, rem); v.sh -= a; rem -= a; }
    v.hp -= rem;
    if (killer && killer !== v) {
      if (killer.ws) this.send(killer, { t: 'hit', a: Math.round(amount), h: head, k: v.hp <= 0 });
      if (v.ws) this.send(v, { t: 'dmg', x: killer.x, z: killer.z, a: Math.round(amount) });
      if (v.bot && v.ai && !v.ai.enemy) v.ai.enemy = killer;
    } else if (!silent && v.ws) this.send(v, { t: 'dmg', a: Math.round(amount) });
    if (v.hp <= 0) this.eliminate(v, killer, wk, head);
  }

  eliminate(v, killer, wk, head) {
    if (!v.alive) return;
    const aliveBefore = this.alivePlayers().length;
    v.alive = false; v.hp = 0; v.place = aliveBefore; v.bus = false; v.using = null;
    if (killer && killer !== v) { killer.kills++; if (killer.ws) this.send(killer, { t: 'kills', k: killer.kills }); }
    this.broadcast({ t: 'kill', k: killer && killer !== v ? killer.id : -1, v: v.id, w: wk, h: !!head });
    // dropa itens
    v.inv.forEach((it) => { if (it && it.k !== 'pickaxe') this.dropItem(v, it); });
    for (const [t, n] of Object.entries(v.ammo)) if (n > 0) this.addItem({ kind: 'ammo', k: t, r: 0, n: Math.min(n, AMMO[t].pick * 2), x: v.x + rnd(-1, 1), y: v.y + 0.4, z: v.z + rnd(-1, 1) });
    if (v.ws) this.send(v, { t: 'dead', place: v.place, killer: killer ? killer.name : null, kills: v.kills, wk });
  }

  // ---------- itens ----------
  addItem(o) {
    const it = { id: this.nextItem++, ...o }; this.items.set(it.id, it);
    this.broadcast({ t: 'i+', i: [this.itemMsg(it)] });
    return it;
  }
  rollRarity(boost = 0) {
    let tot = 0; RARITY.forEach((r) => (tot += r.w));
    let x = Math.random() * tot, i = 0;
    for (; i < RARITY.length; i++) { x -= RARITY[i].w; if (x <= 0) break; }
    return Math.min(4, i + boost);
  }
  randWeapon() {
    let tot = 0; GUNS.forEach((g) => (tot += GUN_WEIGHT[g]));
    let x = Math.random() * tot; for (const g of GUNS) { x -= GUN_WEIGHT[g]; if (x <= 0) return g; }
    return 'ar';
  }
  makeLootDef(forceType, boost = 0) {
    const roll = forceType || (Math.random() < 0.45 ? 'w' : Math.random() < 0.55 ? 'a' : 'c');
    if (roll === 'w') return { kind: 'weapon', k: this.randWeapon(), r: this.rollRarity(boost), n: 1 };
    if (roll === 'a') { const t = Object.keys(AMMO)[Math.floor(Math.random() * 5)]; return { kind: 'ammo', k: t, r: 0, n: AMMO[t].pick }; }
    const k = CONS[Math.floor(Math.pow(Math.random(), 1.4) * CONS.length)];
    return { kind: 'cons', k, r: 0, n: k === 'bandage' ? 5 : k === 'minishield' ? 2 : 1 };
  }
  spawnLoot(x, y, z, forceType, boost) { return this.addItem({ ...this.makeLootDef(forceType, boost), x, y, z }); }
  dropItem(p, it) {
    this.addItem({ kind: it.mag !== undefined ? 'weapon' : 'cons', k: it.k, r: it.r || 0, n: it.n || 1, x: p.x + rnd(-1.2, 1.2), y: p.y + 0.4, z: p.z + rnd(-1.2, 1.2) });
  }
  dropSlot(p, i) {
    const it = p.inv[i]; if (!p.alive || i < 1 || !it) return;
    p.inv[i] = null; this.dropItem(p, it); if (p.slot === i) { p.slot = 0; this.updateHeld(p); } p.dirty = true;
  }

  pickup(p, id, auto) {
    const it = this.items.get(id); if (!it || !p.alive || p.bus) return;
    if (Math.abs(it.x - p.x) > 3.8 || Math.abs(it.z - p.z) > 3.8 || Math.abs(it.y - p.y) > 4) return;
    let ok = false;
    if (it.kind === 'ammo') {
      const t = it.k, mx = AMMO[t].max, can = mx - p.ammo[t];
      if (can <= 0) return;
      const take = Math.min(can, it.n); p.ammo[t] += take; it.n -= take; ok = it.n <= 0;
      if (!ok) this.broadcast({ t: 'i-', id: it.id }), this.broadcast({ t: 'i+', i: [this.itemMsg(it)] });
      p.dirty = true; if (!ok) return;
    } else if (it.kind === 'cons') {
      const c = CONSUMABLES[it.k];
      let slot = p.inv.findIndex((x, i) => i > 0 && x && x.k === it.k && x.n < c.stack);
      if (slot >= 0) { const add = Math.min(c.stack - p.inv[slot].n, it.n); p.inv[slot].n += add; it.n -= add; ok = it.n <= 0; if (!ok) { this.broadcast({ t: 'i-', id: it.id }); this.broadcast({ t: 'i+', i: [this.itemMsg(it)] }); } p.dirty = true; if (!ok) return; }
      else {
        slot = p.inv.findIndex((x, i) => i > 0 && !x);
        if (slot < 0) return;
        p.inv[slot] = { k: it.k, n: Math.min(it.n, c.stack) }; ok = true; p.dirty = true;
      }
    } else {
      if (auto) return;
      const w = WEAPONS[it.k];
      let slot = p.inv.findIndex((x, i) => i > 0 && !x);
      if (slot < 0) {
        slot = p.slot > 0 ? p.slot : 1;
        const old = p.inv[slot]; if (old) this.dropItem(p, old);
      }
      p.inv[slot] = { k: it.k, r: it.r, mag: w.mag };
      p.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, p.ammo[w.ammo] + Math.round(AMMO[w.ammo].pick * 0.8));
      if (p.slot === 0 || p.slot === slot) { p.slot = slot; p.reloadEnd = 0; }
      this.updateHeld(p); p.dirty = true; ok = true;
    }
    if (ok) { this.items.delete(it.id); this.broadcast({ t: 'i-', id: it.id, by: p.id }); }
  }

  openChest(p, id) {
    const c = this.chests[id]; if (!c || c.open || !p.alive) return;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 4.5 || Math.abs(c.y - p.y) > 4) return;
    c.open = true; this.broadcast({ t: 'c!', id });
    const mk = (type, boost) => { const a = Math.random() * 6.28, d = rnd(0.8, 1.7); this.spawnLoot(c.x + Math.cos(a) * d, c.y + 0.4, c.z + Math.sin(a) * d, type, boost); };
    const wdef = this.makeLootDef('w', 1); const it = this.addItem({ ...wdef, x: c.x + 1, y: c.y + 0.4, z: c.z });
    const t = WEAPONS[it.k].ammo; this.addItem({ kind: 'ammo', k: t, r: 0, n: AMMO[t].pick, x: c.x - 1, y: c.y + 0.4, z: c.z + 0.2 });
    mk('c'); if (Math.random() < 0.6) mk('c'); if (Math.random() < 0.5) mk('w', 0);
  }

  useItem(p, i) {
    const it = p.inv[i]; if (!p.alive || !it || !CONSUMABLES[it.k] || p.using || p.bus) return;
    const c = CONSUMABLES[it.k];
    if ((c.hp && p.hp >= c.hpMax) || (c.sh && p.sh >= c.shMax)) return;
    p.slot = i; this.updateHeld(p); p.reloadEnd = 0;
    p.using = { slot: i }; p.useEnd = Date.now() + c.time * 1000; p.dirty = true;
    this.send(p, { t: 'us', d: c.time, k: it.k });
  }

  // ---------- construção ----------
  build(p, m) {
    if (!p.alive || p.bus || (p.flags & 3)) return;
    const type = m.ty; if (!['wall', 'floor', 'ramp'].includes(type)) return;
    const mat = MATS.includes(m.mat) ? m.mat : 'wood';
    if (p.mats[mat] < BUILD_COST) return;
    const gx = m.gx | 0, by = m.by | 0, gz = m.gz | 0, dir = m.dir | 0;
    if (type === 'wall' && dir > 1) return; if (type === 'ramp' && (dir < 0 || dir > 3)) return;
    const key = pieceKey(type, gx, by, gz, type === 'floor' ? 0 : dir);
    if (this.builds.has(key) || this.builds.size > 1800) return;
    const [cx, cy, cz] = pieceCenter(type, gx, by, gz, dir);
    if (Math.hypot(cx - p.x, cz - p.z) > 15 || Math.abs(cy - p.y) > 14 || Math.abs(by) > 2000) return;
    if (Math.hypot(cx, cz) > 190) return;
    const col = makePieceCollider(this.world, type, gx, by, gz, type === 'floor' ? 0 : dir);
    if (col.base + 4 < col.tmax + 0.8) return; // enterrada
    const b = { key, type, gx, by, gz, dir: col.dir, mat, hp: MAT_INFO[mat].hp, maxhp: MAT_INFO[mat].hp, col };
    col.bref = b; this.world.colliders.add(col); this.builds.set(key, b);
    p.mats[mat] -= BUILD_COST; p.dirty = true;
    this.broadcast({ t: 'b+', b: [type, gx, by, gz, b.dir, mat, 1], by: p.id });
  }
  damageBuild(b, dmg) {
    if (!b || !this.builds.has(b.key)) return;
    b.hp -= dmg;
    if (b.hp <= 0) { this.world.colliders.remove(b.col); this.builds.delete(b.key); this.broadcast({ t: 'b-', k: [b.type, b.gx, b.by, b.gz, b.dir] }); }
    else this.broadcast({ t: 'bh', k: [b.type, b.gx, b.by, b.gz, b.dir], h: r2(b.hp / b.maxhp) });
  }

  // ---------- bots ----------
  updateBot(b, dt) {
    const ai = b.ai, w = this.world, now = Date.now();
    if (ai.state === 'bus') {
      const d = Math.hypot(this.bus.x - ai.tx, this.bus.z - ai.tz);
      if (d < ai.jumpDist && this.bus.active) this.leaveBus(b);
      return;
    }
    if (ai.state === 'fall') {
      const g = w.groundAt(b.x, b.z, b.y), h = b.y - g;
      const dx = ai.tx - b.x, dz = ai.tz - b.z, d = Math.hypot(dx, dz) || 1;
      const sp = h > 60 ? 24 : 19, vy = h > 60 ? -50 : -9;
      b.flags = h > 60 ? 1 : 2;
      b.x += (dx / d) * Math.min(sp * dt, d); b.z += (dz / d) * Math.min(sp * dt, d); b.y += vy * dt; b.yaw = Math.atan2(dx, dz);
      if (b.y <= g + 0.05) { b.y = g; b.flags = 0; b.onGround = true; b.vy = 0; b.vx = b.vz = 0; ai.state = 'ground'; }
      return;
    }
    // inteligência no solo
    ai.think -= dt; ai.strafeT -= dt;
    const eye = { x: b.x, y: b.y + EYE, z: b.z };
    if (ai.think <= 0) {
      ai.think = 0.25 + Math.random() * 0.15;
      // inimigo
      let best = null, bd = 85;
      for (const q of this.players.values()) {
        if (q === b || !q.alive || q.bus || (q.flags & 3 && q.y - this.world.groundAt(q.x, q.z, q.y) > 40)) continue;
        const d = dist2(b, q); if (d < bd) { bd = d; best = q; }
      }
      ai.enemy = null;
      if (best) {
        const dx = best.x - b.x, dy = best.y + 1.2 - eye.y, dz = best.z - b.z, dl = Math.hypot(dx, dy, dz);
        const hit = w.raycast(eye.x, eye.y, eye.z, dx / dl, dy / dl, dz / dl, dl - 0.5);
        const cg = this.weapon(b), armed = cg && !cg.w.melee && (cg.it.mag > 0 || b.ammo[cg.w.ammo] > 0);
        if (!hit && (armed || bd < 7)) { if (ai.seenId !== best.id || now - (ai.seenT || 0) > 1500) ai.react = now + 350 + Math.random() * 600; ai.seenId = best.id; ai.seenT = now; ai.enemy = best; }
      }
      this.botPickBest(b);
      // loot
      ai.wantItem = null;
      if (!ai.enemy) {
        let bi = null, bdist = 55;
        for (const it of this.items.values()) {
          if ((ai.bad.get('i' + it.id) || 0) > now) continue;
          const d = Math.hypot(it.x - b.x, it.z - b.z); if (d < bdist && Math.abs(it.y - b.y) < 6 && this.botWants(b, it)) { bdist = d; bi = it; }
        }
        let bc = null;
        for (const c of this.chests) { if (c.open || (ai.bad.get('c' + c.id) || 0) > now) continue; const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < bdist && Math.abs(c.y - b.y) < 5) { bdist = d; bc = c; } }
        ai.wantItem = bc ? { chest: bc } : bi ? { item: bi } : null;
        if (ai.wantItem && ai.wantItem.item && !this.items.has(ai.wantItem.item.id)) ai.wantItem = null;
      }
      // curar
      if (!ai.enemy && !b.using) {
        const hi = b.inv.findIndex((x) => x && ((x.k === 'medkit' && b.hp < 60) || (x.k === 'bandage' && b.hp < 70) || (x.k === 'shieldpot' && b.sh < 40) || (x.k === 'minishield' && b.sh < 40)));
        if (hi > 0) this.useItem(b, hi);
      }
    }
    // destino
    let gx = null, gz = null, speed = 6.4, shooting = false;
    const st = this.storm;
    const outside = st && Math.hypot(b.x - st.cx, b.z - st.cz) > st.r - 8;
    const nextOutside = st && Math.hypot(b.x - st.ncx, b.z - st.ncz) > st.nr - 6 && st.phase === 1;
    if (outside || nextOutside) { gx = st.phase === 1 || nextOutside ? st.ncx : st.cx; gz = st.phase === 1 || nextOutside ? st.ncz : st.cz; speed = 8; }
    else if (ai.enemy && !b.using) {
      const e = ai.enemy, cur = this.weapon(b), d = dist2(b, e);
      const ideal = !cur ? 5 : { pistol: 18, smg: 14, ar: 26, shotgun: 8, sniper: 60, pickaxe: 2 }[cur.it.k];
      const ang = Math.atan2(e.x - b.x, e.z - b.z);
      b.yaw = ang;
      if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeT = 0.7 + Math.random() * 1.2; }
      let fx = 0, fz = 0;
      if (d > ideal * 1.15) { fx += Math.sin(ang); fz += Math.cos(ang); } else if (d < ideal * 0.6) { fx -= Math.sin(ang); fz -= Math.cos(ang); }
      fx += Math.cos(ang) * ai.strafe * 0.8; fz -= Math.sin(ang) * ai.strafe * 0.8;
      gx = b.x + fx * 6; gz = b.z + fz * 6; speed = 6;
      if (cur && !cur.w.melee) {
        if (cur.it.mag <= 0) { if (!b.reloadEnd) this.startReload(b); }
        else if (d < cur.w.range * 0.8 && now >= b.nextFire && now >= (ai.react || 0)) {
          const err = d * (0.012 + 0.06 * (1 - ai.skill));
          const ty = e.y + 1.0 + Math.random() * 0.5;
          if (Math.random() < 0.55 + ai.skill * 0.35) this.shoot(b, e.x + rnd(-err, err), ty + rnd(-err, err) * 0.5, e.z + rnd(-err, err), false);
          b.nextFire = Math.max(b.nextFire, now + (cur.w.rps > 5 ? 0 : 150 + Math.random() * 300));
        }
        shooting = true;
      } else if (cur && cur.w.melee && d < 3) this.shoot(b, e.x, e.y + 1.2, e.z, false);
    } else if (ai.wantItem) {
      const tgt = ai.wantItem.chest || ai.wantItem.item;
      gx = tgt.x; gz = tgt.z;
      if (Math.hypot(tgt.x - b.x, tgt.z - b.z) < 2) {
        if (ai.wantItem.chest) { this.openChest(b, ai.wantItem.chest.id); ai.bad.set('c' + ai.wantItem.chest.id, now + 60000); }
        else { const iid = ai.wantItem.item.id; this.pickup(b, iid); if (this.items.has(iid)) ai.bad.set('i' + iid, now + 30000); }
        ai.wantItem = null; ai.think = 0.1;
      }
    } else {
      // vagar em direção ao círculo seguro
      if (!ai.wp || Math.hypot(ai.wp.x - b.x, ai.wp.z - b.z) < 3 || Math.random() < 0.004) {
        const cx = st ? (st.phase === 1 ? st.ncx : st.cx) : 0, cz = st ? (st.phase === 1 ? st.ncz : st.cz) : 0, rr = st ? Math.max(5, (st.phase === 1 ? st.nr : st.r) * 0.8) : 100;
        const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * Math.min(rr, 150);
        ai.wp = { x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d };
      }
      gx = ai.wp.x; gz = ai.wp.z; speed = 5;
    }
    // movimento
    let wx = 0, wz = 0;
    if (gx !== null) { const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz); if (d > 0.4) { wx = dx / d; wz = dz / d; } }
    if (!ai.enemy && (wx || wz)) b.yaw = Math.atan2(wx, wz);
    const px = b.x, pz = b.z;
    const inWater = w.heightAt(b.x, b.z) < -0.1;
    w.moveEntity(b, dt, wx, wz, inWater ? speed * 0.6 : speed, false);
    // travado?
    ai.stuckT += dt;
    if (ai.stuckT > 0.4) {
      const moved = Math.hypot(b.x - ai.lx, b.z - ai.lz);
      if ((wx || wz) && moved < 0.5) {
        w.moveEntity(b, dt, wx, wz, speed, true); ai.wp = null; if (Math.random() < 0.3) ai.strafe *= -1;
        if (++ai.stuckN >= 5 && ai.wantItem) { const wi = ai.wantItem; ai.bad.set(wi.chest ? 'c' + wi.chest.id : 'i' + wi.item.id, now + 45000); ai.wantItem = null; ai.stuckN = 0; }
        else if (ai.stuckN >= 5) { ai.stuckN = 0; ai.wp = null; }
      } else ai.stuckN = 0;
      ai.lx = b.x; ai.lz = b.z; ai.stuckT = 0;
    }
    b.pitch = 0;
    b.flags = (Math.hypot(b.x - px, b.z - pz) > 0.02 ? 4 : 0) | (b.onGround ? 0 : 8) | (inWater ? 16 : 0);
  }
  botWants(b, it) {
    if (it.kind === 'ammo') return b.ammo[it.k] < AMMO[it.k].max * 0.6;
    if (it.kind === 'cons') return b.inv.some((x, i) => i > 0 && (!x || x.k === it.k));
    const has = b.inv.slice(1).filter(Boolean).filter((x) => WEAPONS[x.k]);
    if (!has.length) return true;
    return has.length < 3 || has.some((x) => x.r < it.r);
  }
  botPickBest(b) {
    let bi = 0, bs = -1;
    b.inv.forEach((x, i) => {
      if (i === 0 || !x || !WEAPONS[x.k]) return;
      const w = WEAPONS[x.k], usable = x.mag > 0 || b.ammo[w.ammo] > 0;
      const s = (usable ? 100 : 0) + w.dmg * w.pellets * w.rps * RMUL[x.r || 0] * 0.1 + (x.r || 0);
      if (s > bs) { bs = s; bi = i; }
    });
    if (bi && b.slot !== bi && !b.using) this.setSlot(b, bi);
    const cur = this.weapon(b);
    if (cur && !cur.w.melee && cur.it.mag <= 0 && b.ammo[cur.w.ammo] > 0 && !b.reloadEnd) this.startReload(b);
  }
}
