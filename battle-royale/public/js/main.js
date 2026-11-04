// Cliente do jogo: rede, entrada, física local, câmera, HUD e efeitos.
import * as THREE from 'three';
import { createWorld, makePieceCollider, pieceKey, wallFromEdge, rayAABB } from '/shared/world.js';
import { SKINS, RARITY, WEAPONS, CONSUMABLES, AMMO, MATS, MAT_INFO, BUILD_COST, POIS, PLAYER_H, HALF, STORM_STAGES } from '/shared/data.js';
import { createCharacter, setRigWeapon, poseRig, createWeapon, createBusModel } from './models.js';
import { buildSky, buildTerrain, buildStatics, createPieceMesh, createStorm, createItemMesh, createChestMesh } from './scene.js';
import { initAudio, sfx, setVolume } from './audio.js';

const $ = (id) => document.getElementById(id);
const WID = ['pickaxe', 'pistol', 'smg', 'ar', 'shotgun', 'sniper'];
const CONS_IDS = Object.keys(CONSUMABLES);
const ICON = { pickaxe: '⛏️', pistol: '🔫', smg: '🔫', ar: '🔫', shotgun: '🔫', sniper: '🎯', bandage: '🩹', medkit: '➕', minishield: '🛡️', shieldpot: '🧪' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ------------------------------------------------------------------ renderer / cena
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d4ff);
scene.fog = new THREE.Fog(0xcfe6ff, 160, 640);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 1600);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xe4f1ff, 0xb5ad92, 1.55));
const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
sun.position.set(80, 140, 50); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ estado
let ws = null, myId = -1, world = null, worldSeed = 0, skyObj = null, terrain = null, stormObj = null, busMesh = null;
let phase = 'lobby', mode = 'lobby', lobbyT = -1, snap = null, storm = null, bus = null, aliveCount = 0;
let sens = Number(store.get('sens', 80)), mySkin = Number(store.get('skin', 0)) || 0, myName = store.get('name', '');
const players = new Map(), roster = new Map(), items = new Map(), chestMeshes = [], builds = new Map(), nodeShake = new Map();
const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, yaw: 0, pitch: 0, hp: 100, sh: 0, alive: false, kills: 0, rig: null, speed: 0, deadT: 0, swingT: 9, recoil: 0, glideT: 0 };
const inv = { items: [null, null, null, null, null, null], slot: 0, ammo: { light: 0, medium: 0, shell: 0, heavy: 0 }, mats: { wood: 0, brick: 0, metal: 0 } };
const keys = {}; let locked = false, mouseL = false, mouseR = false, ads = false, buildPiece = null, matSel = 0, emoting = false, showBig = false;
let nextFire = 0, progress = null, spectateId = -1, busY = 0, lastIn = 0, ghost = null, lastPlace = 0, deathInfo = null, chestOpen = new Set();
let netPing = 0, fovCur = 75;

// ------------------------------------------------------------------ mundo
function initWorld(seed) {
  if (world && worldSeed === seed) return;
  worldSeed = seed; world = createWorld(seed);
  if (skyObj) { /* recria tudo em troca de semente */ location.reload(); return; }
  skyObj = buildSky(scene); terrain = buildTerrain(scene, world); buildStatics(scene, world); stormObj = createStorm(scene);
  busMesh = createBusModel(); busMesh.visible = false; scene.add(busMesh);
  world.chestSpots.forEach((c, i) => { const m = createChestMesh(); m.position.set(c.x, c.y, c.z); m.rotation.y = (i * 2.399) % 6.28; scene.add(m); chestMeshes.push(m); });
  drawMinimapBase();
}

// ------------------------------------------------------------------ rede
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  initAudio(); sfx.click();
  const name = ($('nameIn').value.trim() || 'Jogador').slice(0, 16); myName = name; store.set('name', name);
  $('conn').classList.remove('hidden'); $('conn').textContent = 'Conectando ao servidor…';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => send({ t: 'join', name, skin: mySkin });
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = () => { $('conn').classList.remove('hidden'); $('conn').innerHTML = 'Conexão perdida.<br><button id="rl">Recarregar</button>'; $('rl').onclick = () => location.reload(); document.exitPointerLock?.(); };
  ws.onerror = () => { $('lobbyMsg').textContent = 'Não foi possível conectar.'; };
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id; initWorld(m.seed); phase = m.phase;
      $('conn').classList.add('hidden'); $('joinPanel').classList.add('hidden'); $('waitPanel').classList.remove('hidden');
      clearMatchState(); m.items.forEach(addItem); m.chests.forEach((id) => openChestVisual(id, true)); m.builds.forEach((b) => addBuild(b, true));
      if (m.phase === 'play') { /* entrou no meio da partida: snapshot define o modo */ }
      break;
    }
    case 's': onSnapshot(m); break;
    case 'start': startMatchUI(); break;
    case 'lobby': backToLobby(); break;
    case 'inv': onInv(m); break;
    case 'i+': m.i.forEach(addItem); break;
    case 'i-': removeItem(m.id, m.by); break;
    case 'c!': openChestVisual(m.id); break;
    case 'b+': addBuild(m.b); if (m.by === myId) sfx.build(); break;
    case 'b-': removeBuild(m.k); break;
    case 'bh': hurtBuild(m.k, m.h); break;
    case 'sh': onShot(m); break;
    case 'sw': { const p = m.i === myId ? me : players.get(m.i); if (p) { p.swingT = 0; if (m.i !== myId) sfx.shot('pickaxe', 0.3); } break; }
    case 'hit': hitMarker(m); break;
    case 'dmg': onDamaged(m); break;
    case 'kill': onKill(m); break;
    case 'kills': me.kills = m.k; $('killsN').textContent = m.k; break;
    case 'dead': onDead(m); break;
    case 'victory': $('victTxt').textContent = `${me.kills} eliminações`; $('victory').classList.remove('hidden'); document.exitPointerLock?.(); break;
    case 'end': if (m.win) toast(m.win[0] === myId ? '🏆 Você venceu!' : `🏆 ${m.win[1]} venceu a partida!`, 6000); break;
    case 'rl': progress = { t0: performance.now(), dur: m.d * 1000, label: 'Recarregando' }; sfx.reload(); break;
    case 'us': progress = { t0: performance.now(), dur: m.d * 1000, label: CONSUMABLES[m.k].n }; break;
    case 'hv': nodeHit(m); break;
    case 'hvm': toast(`+${m.amt} ${MAT_INFO[m.mat].n}`, 900); sfx.harvest(); break;
    case 'tp': me.x = m.x; me.y = m.y; me.z = m.z; break;
    case 'chat': chatLine(m.m); break;
    default: break;
  }
}

function updateRoster(ro) {
  const ids = new Set();
  for (const [id, name, skin, bot] of ro) {
    ids.add(id); roster.set(id, { name, skin, bot });
    const p = players.get(id);
    if (p && p.skin !== skin) { scene.remove(p.rig.root); p.rig = createCharacter(skin); scene.add(p.rig.root); p.skin = skin; }
    if (p) p.name = name;
  }
  for (const id of [...roster.keys()]) if (!ids.has(id)) roster.delete(id);
  if (id_is(myId) && phase === 'lobby') renderRoster();
}
const id_is = (v) => v >= 0;
function renderRoster() {
  const hs = [...roster.entries()].filter(([, r]) => !r.bot);
  $('roster').innerHTML = `<b>${hs.length}</b> jogador(es) na sala:<br>` + hs.map(([id, r]) => `${id === myId ? '⭐ ' : '• '}<b>${esc(r.name)}</b> <span style="opacity:.7">— ${SKINS[r.skin]?.name || ''}</span>`).join('<br>');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = (id) => (id === myId ? 'Você' : roster.get(id)?.name || '???');

function ensurePlayer(id) {
  let p = players.get(id);
  if (!p) {
    const meta = roster.get(id) || { name: '…', skin: id % SKINS.length };
    const rig = createCharacter(meta.skin); rig.root.visible = false; scene.add(rig.root); setRigWeapon(rig, 'pickaxe');
    p = { id, rig, skin: meta.skin, name: meta.name, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, yaw: 0, tyaw: 0, pitch: 0, tpitch: 0, hp: 100, sh: 0, flags: 0, held: 0, alive: true, bus: false, init: false, speed: 0, swingT: 9, emote: 0, deadT: 0, recoil: 0 };
    players.set(id, p);
  }
  return p;
}

function onSnapshot(m) {
  phase = m.ph; snap = m; storm = m.st; bus = m.bus; aliveCount = m.al; lobbyT = m.lt;
  if (m.ro) updateRoster(m.ro);
  const seen = new Set(); let mine = null;
  for (const e of m.p) {
    const [id, x, y, z, yaw, pitch, hp, sh, fl, held, em] = e; seen.add(id);
    if (id === myId) { mine = e; me.hp = hp; me.sh = sh; continue; }
    const p = ensurePlayer(id);
    p.tx = x; p.ty = y; p.tz = z; p.tyaw = yaw; p.tpitch = pitch;
    if (!p.init) { p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.init = true; }
    p.flags = fl & 127; p.alive = !(fl & 128); p.bus = !!(fl & 256); p.held = held; p.emote = em; p.hp = hp; p.sh = sh;
  }
  for (const [id, p] of players) if (!seen.has(id)) { scene.remove(p.rig.root); players.delete(id); }
  if (phase === 'play') {
    if (mine) {
      const fl = mine[8], alive = !(fl & 128), onBus = !!(fl & 256);
      if (alive && onBus && mode === 'lobby') { mode = 'bus'; me.alive = true; busY = mine[2]; $('toast').textContent = ''; toast('Pressione ESPAÇO para pular do ônibus!', 5000); sfx.bus(); }
      else if (alive && !onBus && mode === 'bus') { mode = 'fall'; startFall(); }
      if (!alive && mode !== 'spectate' && mode !== 'lobby') { me.alive = false; mode = 'spectate'; }
    } else if (mode === 'lobby') { mode = 'spectate'; me.alive = false; $('hud').classList.remove('hidden'); $('lobby').classList.add('hidden'); toast('Partida em andamento — você observa até a próxima rodada.', 5000); showHud(true); }
  }
  updateLobbyUI();
  $('aliveN').textContent = aliveCount;
}

function startMatchUI() {
  for (const [, p] of players) scene.remove(p.rig.root);
  players.clear(); me.kills = 0; $('killsN').textContent = 0; me.alive = true; me.deadT = 0; progress = null; emoting = false; buildPiece = null;
  $('lobby').classList.add('hidden'); $('death').classList.add('hidden'); $('victory').classList.add('hidden'); showHud(true);
  if (!me.rig) { me.rig = createCharacter(mySkin); scene.add(me.rig.root); setRigWeapon(me.rig, 'pickaxe'); }
  mode = 'lobby'; // até o snapshot confirmar o ônibus
  requestLock(); setTimeout(() => { if (!locked) $('pause').classList.remove('hidden'); }, 400);
}
function backToLobby() {
  mode = 'lobby'; phase = 'lobby'; me.alive = false; clearMatchState();
  for (const [, p] of players) scene.remove(p.rig.root);
  players.clear(); showHud(false); $('lobby').classList.remove('hidden'); $('death').classList.add('hidden'); $('victory').classList.add('hidden'); $('pause').classList.add('hidden');
  if (me.rig) me.rig.root.visible = false;
  document.exitPointerLock?.();
}
function showHud(v) { $('hud').classList.toggle('hidden', !v); }

function clearMatchState() {
  for (const [, it] of items) scene.remove(it.group); items.clear();
  for (const [, b] of builds) { world.colliders.remove(b.col); scene.remove(b.mesh); } builds.clear();
  chestOpen.clear(); chestMeshes.forEach((c) => { c.userData.lid.rotation.x = 0; c.userData.glow.visible = true; });
  inv.items = [null, null, null, null, null, null]; inv.slot = 0; inv.ammo = { light: 0, medium: 0, shell: 0, heavy: 0 }; inv.mats = { wood: 0, brick: 0, metal: 0 };
}

// ------------------------------------------------------------------ itens / baús / construções
function addItem(a) {
  const [id, kind, k, r, n, x, y, z] = a;
  if (items.has(id)) { scene.remove(items.get(id).group); }
  const group = createItemMesh(kind, k, r, createWeapon); group.position.set(x, y + 0.55, z); scene.add(group);
  items.set(id, { id, kind, k, r, n, x, y, z, group, ph: Math.random() * 6 });
}
function removeItem(id, by) {
  const it = items.get(id); if (!it) return;
  scene.remove(it.group); items.delete(id);
  if (by === myId) sfx.pickup();
}
function openChestVisual(id, quiet) {
  if (chestOpen.has(id)) return; chestOpen.add(id);
  const m = chestMeshes[id]; if (!m) return;
  m.userData.lid.rotation.x = -1.8; m.userData.glow.visible = false;
  if (!quiet) { const c = world.chestSpots[id]; burst(c.x, c.y + 0.8, c.z, 0xffd84a, 24, 4); if (Math.hypot(c.x - me.x, c.z - me.z) < 40) sfx.chest(); }
}
function addBuild(b, quiet) {
  const [type, gx, by, gz, dir, mat, hp] = b;
  const key = pieceKey(type, gx, by, gz, dir); if (builds.has(key)) return;
  const col = makePieceCollider(world, type, gx, by, gz, dir);
  world.colliders.add(col);
  const mesh = createPieceMesh(col, mat); scene.add(mesh);
  const o = { key, col, mesh, mat, type, cx: (col.minx + col.maxx) / 2, cz: (col.minz + col.maxz) / 2 }; builds.set(key, o);
  if (hp < 1) hurtBuild([type, gx, by, gz, dir], hp);
  if (!quiet) { mesh.scale.setScalar(0.92); o.pop = 0; }
}
function removeBuild(k) {
  const key = pieceKey(...k); const b = builds.get(key); if (!b) return;
  world.colliders.remove(b.col); scene.remove(b.mesh); builds.delete(key);
  burst(b.cx, (b.col.miny + b.col.maxy) / 2, b.cz, MAT_INFO[b.mat].color, 18, 6);
  sfx.harvest();
}
function hurtBuild(k, h) {
  const b = builds.get(pieceKey(...k)); if (!b) return;
  if (!b.mesh.userData.own) { b.mesh.material = b.mesh.material.clone(); b.mesh.userData.own = true; }
  b.mesh.material.color.setScalar(0.4 + 0.6 * h);
}
function nodeHit(m) {
  const n = world.nodes[m.n]; if (!n) return;
  burst(n.x, n.y + (n.t === 'tree' ? 1.6 : 0.8), n.z, n.t === 'tree' ? 0x8b5a2b : n.t === 'rock' ? 0xaaaaaa : 0xc0c8d0, 8, 3);
}

// ------------------------------------------------------------------ inventário / HUD
function onInv(m) {
  inv.items = m.inv.map((a) => (a ? { k: a[0], r: a[1], mag: a[2], n: a[3] } : null)); inv.slot = m.slot; inv.ammo = m.ammo; inv.mats = m.mats;
  renderHotbar();
}
function curItem() { return inv.items[inv.slot]; }
function renderHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  inv.items.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'slot' + (i === inv.slot && !buildPiece ? ' sel' : '');
    if (it) {
      const nm = WEAPONS[it.k]?.n || CONSUMABLES[it.k]?.n || '';
      d.innerHTML = `<span class="k">${i + 1}</span><span class="ic">${ICON[it.k] || '?'}</span><span style="font-size:9px">${nm}</span>` + (it.k !== 'pickaxe' && WEAPONS[it.k] ? `<span class="n">${it.mag}</span>` : CONSUMABLES[it.k] ? `<span class="n">${it.n}</span>` : '') + (WEAPONS[it.k] && it.k !== 'pickaxe' ? `<span class="rb" style="background:${RARITY[it.r].c}"></span>` : '');
      if (WEAPONS[it.k] && it.k !== 'pickaxe') d.style.borderColor = RARITY[it.r].c;
    } else d.innerHTML = `<span class="k">${i + 1}</span>`;
    d.onclick = () => selectSlot(i); hb.appendChild(d);
  });
  const mt = $('mats'); mt.innerHTML = '';
  MATS.forEach((m, i) => { const d = document.createElement('div'); d.className = 'mat' + (i === matSel ? ' sel' : ''); d.dataset.m = m; d.innerHTML = `${MAT_INFO[m].n}<b>${inv.mats[m] || 0}</b>`; mt.appendChild(d); });
}
function selectSlot(i) {
  if (!me.alive || mode === 'bus') return;
  buildPiece = null; inv.slot = i; send({ t: 'slot', i }); renderHotbar(); progress = null; ads = false;
}
function toast(t, ms = 2500) { const el = $('toast'); el.textContent = t; clearTimeout(toast._t); toast._t = setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, ms); }
function chatLine(t) { const d = document.createElement('div'); d.textContent = t; $('chatlog').appendChild(d); setTimeout(() => d.remove(), 7000); while ($('chatlog').children.length > 6) $('chatlog').firstChild.remove(); }
function hitMarker(m) {
  const h = $('hitmarker'); h.classList.remove('show', 'head'); void h.offsetWidth; h.classList.add('show'); if (m.h) h.classList.add('head');
  sfx.hit(m.h); if (m.k) sfx.kill();
  const d = document.createElement('div'); d.className = 'dmgnum' + (m.h ? ' head' : ''); d.textContent = m.a; d.style.left = `calc(50% + ${(Math.random() * 60 - 10)}px)`; d.style.top = '42%'; d.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
  $('hud').appendChild(d); setTimeout(() => d.remove(), 800);
}
function onDamaged() { const v = $('vignette'); v.style.opacity = 1; setTimeout(() => (v.style.opacity = 0), 150); sfx.hurt(); }
function onKill(m) {
  const d = document.createElement('div');
  const wn = m.w === 'storm' ? 'a tempestade' : m.w === 'quit' ? 'desconexão' : WEAPONS[m.w]?.n || m.w;
  d.textContent = m.k < 0 ? `${nameOf(m.v)} foi eliminado (${wn})` : `${nameOf(m.k)} eliminou ${nameOf(m.v)}${m.h ? ' 🎯' : ''} · ${wn}`;
  if (m.k === myId || m.v === myId) d.className = 'me';
  $('killfeed').appendChild(d); setTimeout(() => d.remove(), 6200); while ($('killfeed').children.length > 5) $('killfeed').firstChild.remove();
  const p = players.get(m.v); if (p) { p.alive = false; p.deadT = 0; }
}
function onDead(m) {
  me.alive = false; mode = 'spectate'; deathInfo = m; ads = false; progress = null;
  $('deathTxt').textContent = `Você ficou em #${m.place}${m.killer ? ` · eliminado por ${m.killer}` : ''} · ${m.kills} eliminações`;
  $('death').classList.remove('hidden'); pickSpectate(); if (me.rig) me.rig.root.visible = true;
}
function pickSpectate(next) {
  const alive = [...players.values()].filter((p) => p.alive && !p.bus);
  if (!alive.length) { spectateId = -1; return; }
  let i = alive.findIndex((p) => p.id === spectateId); i = next ? (i + 1) % alive.length : (i < 0 ? 0 : i);
  spectateId = alive[i].id;
}

function updateLobbyUI() {
  if ($('waitPanel').classList.contains('hidden')) return;
  if (phase === 'lobby') {
    $('status').textContent = lobbyT > 0 ? 'A partida começa em…' : 'Aguardando jogadores…';
    $('countdown').textContent = lobbyT > 0 ? `${lobbyT}s` : '--'; $('startBtn').disabled = false;
  } else { $('status').textContent = 'Partida em andamento'; $('countdown').textContent = '▶'; $('startBtn').disabled = true; }
}

// ------------------------------------------------------------------ efeitos
const sparkGeo = new THREE.BufferGeometry(); const SP = 400;
const sparkPos = new Float32Array(SP * 3), sparkCol = new Float32Array(SP * 3), sparkVel = new Float32Array(SP * 3), sparkLife = new Float32Array(SP); let sparkI = 0;
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
sparks.frustumCulled = false; scene.add(sparks);
for (let i = 0; i < SP; i++) sparkPos[i * 3 + 1] = -999;
function burst(x, y, z, color, n = 8, speed = 4) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = sparkI++ % SP;
    sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z;
    sparkVel[i * 3] = (Math.random() - 0.5) * speed; sparkVel[i * 3 + 1] = Math.random() * speed * 0.9; sparkVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    sparkCol[i * 3] = c.r; sparkCol[i * 3 + 1] = c.g; sparkCol[i * 3 + 2] = c.b; sparkLife[i] = 0.35 + Math.random() * 0.45;
  }
}
function updateSparks(dt) {
  for (let i = 0; i < SP; i++) {
    if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -999; continue; }
    sparkLife[i] -= dt; sparkVel[i * 3 + 1] -= 12 * dt;
    sparkPos[i * 3] += sparkVel[i * 3] * dt; sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt; sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
  }
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
}
const tracers = []; const trGeo = new THREE.BoxGeometry(1, 1, 1);
const trMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
function tracer(a, b) {
  const len = a.distanceTo(b); if (len < 0.5) return;
  const m = new THREE.Mesh(trGeo, trMat); m.scale.set(0.035, 0.035, len); m.position.copy(a).lerp(b, 0.5); m.lookAt(b); scene.add(m); tracers.push({ m, life: 0.07 });
}
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.4, 'rgba(255,190,70,.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function muzzleFlash(rig, scale = 0.7) {
  if (!rig || !rig.muzzle) return;
  if (!rig.flash) { rig.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); rig.muzzle.add(rig.flash); }
  rig.flash.scale.setScalar(scale); rig.flash.visible = true; rig.flashT = 0.05;
}
const _v = new THREE.Vector3();
function onShot(m) {
  const own = m.i === myId; const p = own ? me : players.get(m.i);
  const rig = p && p.rig; const key = WID[m.w] || 'ar';
  let from = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
  if (rig && rig.muzzle && rig.root.visible) { rig.root.updateWorldMatrix(true, true); rig.muzzle.getWorldPosition(_v); from = _v.clone(); }
  if (!own) { muzzleFlash(rig, key === 'shotgun' || key === 'sniper' ? 1.1 : 0.7); const d = from.distanceTo(camera.position); sfx.shot(key, clamp(1 - d / 200, 0.04, 1)); if (p) p.recoil = 1; }
  for (const e of m.e) {
    const to = new THREE.Vector3(e[0], e[1], e[2]);
    if (key !== 'shotgun' || Math.random() < 0.5) tracer(from, to);
    if (e[3] === 1) burst(e[0], e[1], e[2], 0xd8c9a0, 4, 3); else if (e[3] === 2) burst(e[0], e[1], e[2], 0xff3030, 6, 3);
  }
}

// ------------------------------------------------------------------ minimapa
const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 400;
function drawMinimapBase() {
  const g = mapBase.getContext('2d'), W = 400; const img = g.createImageData(W, W);
  for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
    const x = px - HALF + 0.5, z = py - HALF + 0.5, h = world.heightAt(x, z); let r, gg, b;
    if (h < 0) { const d = Math.min(1, -h / 3.2); r = 40 - 20 * d; gg = 130 - 40 * d; b = 200 - 30 * d; }
    else if (h < 1.1) { r = 226; gg = 212; b = 160; }
    else { const s = 0.8 + Math.min(0.5, (h - 1) / 14); r = 90 * s; gg = 160 * s; b = 68 * s; }
    const i = (py * W + px) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(70,70,70,.8)'; for (const c of world.statics) if (c.maxy - c.miny > 2 && !c.node) g.fillRect(c.minx + HALF, c.minz + HALF, Math.max(1, c.maxx - c.minx), Math.max(1, c.maxz - c.minz));
  g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.fillStyle = '#fff';
  for (const p of POIS) { g.strokeText(p.name, p.x + HALF, p.z + HALF - 4); g.fillText(p.name, p.x + HALF, p.z + HALF - 4); }
}
function drawMap(cv, big) {
  const g = cv.getContext('2d'), S = cv.width, k = S / 400;
  g.clearRect(0, 0, S, S); g.drawImage(mapBase, 0, 0, S, S);
  if (storm) {
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc((storm[0] + HALF) * k, (storm[1] + HALF) * k, Math.max(0.1, storm[2] * k), 0, Math.PI * 2, true); g.fillStyle = 'rgba(140,50,230,.5)'; g.fill('evenodd'); g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc((storm[3] + HALF) * k, (storm[4] + HALF) * k, Math.max(1, storm[5] * k), 0, Math.PI * 2); g.stroke();
  }
  if (bus) {
    g.strokeStyle = 'rgba(255,230,80,.7)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo((bus[0] - bus[3] * 430 + HALF) * k, (bus[1] - bus[4] * 430 + HALF) * k); g.lineTo((bus[0] + bus[3] * 430 + HALF) * k, (bus[1] + bus[4] * 430 + HALF) * k); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffe14a'; g.beginPath(); g.arc((bus[0] + HALF) * k, (bus[1] + HALF) * k, 7 * (big ? 1.4 : 1), 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
  }
  if (me.alive || mode === 'spectate') {
    const sp = mode === 'spectate' ? players.get(spectateId) : me; if (sp) {
      g.save(); g.translate((sp.x + HALF) * k, (sp.z + HALF) * k); g.rotate(Math.atan2(Math.cos(sp.yaw), Math.sin(sp.yaw)));
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, 6); g.lineTo(-3, 0); g.lineTo(-6, -6); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
}

// ------------------------------------------------------------------ entrada
function requestLock() { if (mode === 'spectate' && !me.alive && deathInfo) return; canvas.requestPointerLock?.(); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  const playing = ['bus', 'fall', 'glide', 'ground'].includes(mode);
  $('pause').classList.toggle('hidden', locked || !playing || !$('lobby').classList.contains('hidden'));
});
$('pause').addEventListener('click', () => { initAudio(); canvas.requestPointerLock?.(); });
canvas.addEventListener('click', () => { if (!locked && ['bus', 'fall', 'glide', 'ground'].includes(mode)) { initAudio(); canvas.requestPointerLock?.(); } });
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const s = sens * 0.000028 * (ads ? 0.55 : 1);
  const mx = clamp(e.movementX, -200, 200), my = clamp(e.movementY, -200, 200);
  me.yaw -= mx * s; me.pitch = clamp(me.pitch - my * s, -1.45, 1.45);
});
document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) mouseL = true; if (e.button === 2) { mouseR = true; ads = !buildPiece; }
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) { mouseR = false; ads = false; } });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (!locked || !me.alive || mode === 'bus') return;
  const dir = e.deltaY > 0 ? 1 : -1; let i = inv.slot;
  for (let n = 0; n < 6; n++) { i = (i + dir + 6) % 6; if (inv.items[i]) break; }
  selectSlot(i);
}, { passive: true });
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (keys[e.code]) return; keys[e.code] = true;
  if (e.code === 'Tab') e.preventDefault();
  if (!['bus', 'fall', 'glide', 'ground'].includes(mode)) { if (e.code === 'KeyM') toggleBig(); return; }
  if (e.code === 'Space') {
    if (mode === 'bus') { send({ t: 'jump' }); mode = 'fall'; startFall(); sfx.jump(); }
    else if (mode === 'fall' && me.glideT > 0.7) { mode = 'glide'; sfx.jump(); }
  }
  if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 6) selectSlot(n - 1); }
  if (mode !== 'ground') return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyR') send({ t: 'reload' });
  if (e.code === 'KeyZ') toggleBuild('wall'); if (e.code === 'KeyX') toggleBuild('floor'); if (e.code === 'KeyC') toggleBuild('ramp');
  if (e.code === 'KeyQ') { if (buildPiece) { buildPiece = null; renderHotbar(); } }
  if (e.code === 'KeyV') { matSel = (matSel + 1) % 3; renderHotbar(); }
  if (e.code === 'KeyG') emoting = !emoting;
  if (e.code === 'KeyM') toggleBig();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
function toggleBig() { showBig = !showBig; $('bigmap').classList.toggle('hidden', !showBig); }
function toggleBuild(t) { buildPiece = buildPiece === t ? null : t; ads = false; renderHotbar(); }
function startFall() { me.vy = 0; me.vx = me.vz = 0; me.glideT = 0; me.onGround = false; if (busMesh) busMesh.visible = true; me.x = bus ? bus[0] : me.x; me.z = bus ? bus[1] : me.z; me.y = bus ? bus[2] : me.y; }

function interact() {
  const n = nearestInteract(); if (!n) return;
  if (n.chest !== undefined) send({ t: 'chest', id: n.chest }); else send({ t: 'pick', id: n.item.id });
}
function nearestInteract() {
  let best = null, bd = 3.5;
  for (const it of items.values()) {
    if (it.kind === 'ammo') continue;
    const d = Math.hypot(it.x - me.x, it.z - me.z); if (d < bd && Math.abs(it.y - me.y) < 3) { bd = d; best = { item: it }; }
  }
  world.chestSpots.forEach((c, i) => { if (chestOpen.has(i)) return; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < Math.min(bd, 4) && Math.abs(c.y - me.y) < 3) { bd = d; best = { chest: i }; } });
  return best;
}

// ------------------------------------------------------------------ física do jogador local
const fwdV = new THREE.Vector3();
function lookDir(out) { const cp = Math.cos(me.pitch); return out.set(Math.sin(me.yaw) * cp, Math.sin(me.pitch), Math.cos(me.yaw) * cp); }
function wishDir() {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let wx = Math.sin(me.yaw) * f + -Math.cos(me.yaw) * r, wz = Math.cos(me.yaw) * f + Math.sin(me.yaw) * r;
  const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
  return [wx, wz, f, r];
}
function updateLocal(dt) {
  me.swingT += dt; me.recoil = Math.max(0, me.recoil - dt * 6);
  if (mode === 'bus') { if (bus) { me.x = bus[0]; me.z = bus[1]; me.y = bus[2]; me.yaw = Math.atan2(bus[3], bus[4]); } return; }
  if (mode === 'fall' || mode === 'glide') {
    const [wx, wz, f, r] = wishDir(); me.glideT += dt;
    const ground = world.groundAt(me.x, me.z, me.y + 100);
    const h = me.y - ground;
    if (mode === 'fall') {
      const dive = keys.ShiftLeft || keys.ShiftRight ? 1 : 0;
      me.vy = Math.max(me.vy - 22 * dt, -(52 + dive * 20));
      const sp = (wx || wz) ? (f > 0 ? 24 + dive * 10 : 14) : 2.5;
      me.vx += (wx * sp - me.vx) * Math.min(1, dt * 2.2); me.vz += (wz * sp - me.vz) * Math.min(1, dt * 2.2);
      if (h < 70) { mode = 'glide'; sfx.jump(); }
    } else {
      me.vy += (-8.5 - me.vy) * Math.min(1, dt * 3);
      const base = 9, sp = base + (f > 0 ? 11 : f < 0 ? -5 : 0);
      const dx = Math.sin(me.yaw), dz = Math.cos(me.yaw);
      const tx = dx * sp + -Math.cos(me.yaw) * r * 7, tz = dz * sp + Math.sin(me.yaw) * r * 7;
      me.vx += (tx - me.vx) * Math.min(1, dt * 2.5); me.vz += (tz - me.vz) * Math.min(1, dt * 2.5);
    }
    me.x = clamp(me.x + me.vx * dt, -190, 190); me.z = clamp(me.z + me.vz * dt, -190, 190); me.y += me.vy * dt;
    const g = world.groundAt(me.x, me.z, me.y + 0.7);
    if (me.y <= g) { me.y = g; me.vy = 0; me.vx *= 0.3; me.vz *= 0.3; me.onGround = true; mode = 'ground'; sfx.jump(); }
    return;
  }
  if (mode !== 'ground') return;
  let [wx, wz] = wishDir();
  if (wx || wz) emoting = false;
  const water = world.heightAt(me.x, me.z) < -0.15 && me.y < 0.5;
  const cur = curItem();
  let speed = (keys.ShiftLeft || keys.ShiftRight) && !ads ? 8.4 : 6.4;
  if (ads) speed *= 0.55; if (progress && progress.label !== 'Recarregando') speed *= 0.6; if (water) speed *= 0.55;
  if (emoting) speed = 0;
  world.moveEntity(me, dt, wx, wz, speed, !!keys.Space && !water && !emoting);
  if (keys.Space) emoting = false;
  me.speed = Math.hypot(me.vx, me.vz);
}

// ------------------------------------------------------------------ mira / tiro / construção
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function aimPoint() {
  _o.copy(camera.position); lookDir(_d);
  let best = 300; const hit = world.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 300); if (hit) best = hit.t;
  for (const p of players.values()) {
    if (!p.alive || p.bus || !p.rig.root.visible) continue;
    const t = rayAABB(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, { minx: p.x - 0.45, maxx: p.x + 0.45, minz: p.z - 0.45, maxz: p.z + 0.45, miny: p.y, maxy: p.y + 1.9 }, best);
    if (t >= 0 && t < best) best = t;
  }
  return [_o.x + _d.x * best, _o.y + _d.y * best, _o.z + _d.z * best];
}
function handleFire(now) {
  if (mode !== 'ground' || !me.alive || !locked) return;
  if (buildPiece) { if (mouseL && now - lastPlace > 140) { lastPlace = now; placeBuild(); } return; }
  const it = curItem(); if (!it) return;
  if (CONSUMABLES[it.k]) { if (mouseL && !progress && now > nextFire) { nextFire = now + 400; send({ t: 'use', i: inv.slot }); } return; }
  const w = WEAPONS[it.k]; if (!w) return;
  if (!mouseL || now < nextFire || (progress && progress.label === 'Recarregando')) return;
  if (w.melee) { nextFire = now + 1000 / w.rps; me.swingT = 0; send({ t: 'shoot', ...aimObj(), ads: false }); sfx.shot('pickaxe', 0.4); return; }
  if (it.mag <= 0) { if (inv.ammo[w.ammo] > 0) send({ t: 'reload' }); nextFire = now + 250; return; }
  nextFire = now + 1000 / w.rps; emoting = false;
  const ap = aimPoint(); send({ t: 'shoot', ax: ap[0], ay: ap[1], az: ap[2], ads });
  it.mag--; me.recoil = 1; sfx.shot(it.k, 0.8); muzzleFlash(me.rig, w.pellets > 1 || it.k === 'sniper' ? 1.1 : 0.7);
  me.pitch = clamp(me.pitch + (it.k === 'sniper' ? 0.03 : it.k === 'shotgun' ? 0.035 : 0.006 + Math.random() * 0.004), -1.45, 1.45); me.yaw += (Math.random() - 0.5) * 0.004;
  renderHotbar();
}
function aimObj() { const a = aimPoint(); return { ax: a[0], ay: a[1], az: a[2] }; }

const SIDE_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function computeBuild() {
  if (!buildPiece) return null;
  const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
  const gx = Math.round(me.x / 4), gz = Math.round(me.z / 4);
  const side = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0);
  let ref = null, bd = 1e9;
  for (const b of builds.values()) { const d = Math.hypot(b.cx - me.x, b.cz - me.z); if (d < 9 && d < bd) { bd = d; ref = b.col.base; } }
  const refBase = ref !== null ? ref : Math.round(me.y * 4) / 4;
  const base = refBase + Math.round((me.y - refBase) / 4) * 4, by = Math.round(base * 4);
  let type = buildPiece, ax = gx, az = gz, dir = 0;
  if (type === 'wall') {
    let cx = gx, cz = gz; const edgeD = side === 0 ? (me.z - (gz * 4 - 2)) : side === 2 ? ((gz * 4 + 2) - me.z) : side === 1 ? ((gx * 4 + 2) - me.x) : (me.x - (gx * 4 - 2));
    if (edgeD < 1.1) { cx += SIDE_STEP[side][0]; cz += SIDE_STEP[side][1]; }
    [ax, az, dir] = wallFromEdge(cx, cz, side);
  } else if (type === 'floor') {
    if (me.pitch > -0.8) { ax = gx + SIDE_STEP[side][0]; az = gz + SIDE_STEP[side][1]; }
  } else { ax = gx + SIDE_STEP[side][0]; az = gz + SIDE_STEP[side][1]; dir = side; }
  const col = makePieceCollider(world, type, ax, by, az, dir);
  const key = pieceKey(type, ax, by, az, dir);
  const cx = (col.minx + col.maxx) / 2, cz = (col.minz + col.maxz) / 2;
  const ok = !builds.has(key) && inv.mats[MATS[matSel]] >= BUILD_COST && Math.hypot(cx - me.x, cz - me.z) < 12 && col.base + 4 >= col.tmax + 0.8;
  return { type, gx: ax, by, gz: az, dir, col, key, ok };
}
function placeBuild() {
  const b = computeBuild(); if (!b || !b.ok) { if (b && !b.ok && inv.mats[MATS[matSel]] < BUILD_COST) toast('Materiais insuficientes!', 900); return; }
  send({ t: 'build', ty: b.type, gx: b.gx, by: b.by, gz: b.gz, dir: b.dir, mat: MATS[matSel] });
}
function updateGhost() {
  const b = mode === 'ground' && me.alive ? computeBuild() : null;
  if (!b) { if (ghost) ghost.mesh.visible = false; return; }
  if (!ghost || ghost.key !== b.key) {
    if (ghost) { scene.remove(ghost.mesh); ghost.mesh.geometry.dispose(); }
    const mesh = createPieceMesh(b.col, 'wood'); mesh.material = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false }); mesh.castShadow = false; mesh.receiveShadow = false;
    scene.add(mesh); ghost = { key: b.key, mesh };
  }
  ghost.mesh.visible = true; ghost.mesh.material.color.set(b.ok ? 0x55ff88 : 0xff5566);
}

// ------------------------------------------------------------------ câmera
let camPos = new THREE.Vector3();
function updateCamera(dt, now) {
  let px = me.x, py = me.y, pz = me.z, yaw = me.yaw, pitch = me.pitch, dist = 3.5, roff = 0.85, uoff = 0.15, fov = 75;
  if (mode === 'lobby') { // órbita de fundo
    const t = now / 1000 * 0.06; camera.position.set(Math.cos(t) * 250, 125, Math.sin(t) * 250); camera.rotation.set(-0.3, -t + Math.PI / 2 + Math.PI, 0, 'YXZ'); camera.lookAt(0, 8, 0); camera.fov = 60; camera.updateProjectionMatrix(); return;
  }
  if (mode === 'spectate') {
    const p = players.get(spectateId);
    if (!p || !p.alive) pickSpectate();
    if (p) { px = p.x; py = p.y; pz = p.z; yaw = p.yaw + (keys.KeyA ? 0.5 : 0) ; pitch = -0.15; }
    dist = 5; roff = 0.6; if (p) me.yaw = p.yaw;
  }
  if (mode === 'bus') { dist = 24; roff = 0; uoff = 7; py = bus ? bus[2] : py; }
  else if (mode === 'fall') { dist = 7; roff = 0; }
  else if (mode === 'glide') { dist = 9; roff = 0; uoff = 3.2; }
  else if (ads) { dist = 1.7; roff = 0.5; uoff = 0.1; const it = curItem(); fov = it && it.k === 'sniper' ? 16 : 52; }
  fovCur += (fov - fovCur) * Math.min(1, dt * 12);
  if (Math.abs(camera.fov - fovCur) > 0.05) { camera.fov = fovCur; camera.updateProjectionMatrix(); }
  const cp = Math.cos(pitch), fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp;
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const pvx = px, pvy = py + 1.55, pvz = pz;
  let dx = -fx * dist + rx * roff, dy = -fy * dist + uoff, dz = -fz * dist + rz * roff;
  let len = Math.hypot(dx, dy, dz);
  let hit = len > 0.1 ? world.raycast(pvx, pvy, pvz, dx / len, dy / len, dz / len, len) : null;
  if (hit && hit.t < 0.12) hit = null; // pivô dentro de um bloco: ignora
  if (hit && hit.t < len) len = Math.max(0.35, hit.t - 0.3); else len = Math.hypot(dx, dy, dz);
  const k = Math.hypot(dx, dy, dz) || 1;
  camPos.set(pvx + (dx / k) * len, pvy + (dy / k) * len, pvz + (dz / k) * len);
  // não entrar no terreno
  const gh = world.heightAt(camPos.x, camPos.z) + 0.3; if (camPos.y < gh) camPos.y = gh;
  camera.position.copy(camPos); camera.rotation.set(pitch, yaw + Math.PI, 0);
  const isScope = ads && mode === 'ground' && curItem()?.k === 'sniper';
  $('scope').style.display = isScope ? 'block' : 'none';
  if (me.rig) me.rig.root.visible = !isScope && len > 0.9 && mode !== 'bus' && (me.alive || mode === 'spectate') && mode !== 'lobby' ? (mode !== 'spectate') : false;
}

// ------------------------------------------------------------------ atualização visual dos jogadores
const tagPool = []; let tagUsed = 0;
function tagEl() { let el = tagPool[tagUsed]; if (!el) { el = document.createElement('div'); el.className = 'tag'; el.innerHTML = '<span></span><i><b></b></i>'; $('names').appendChild(el); tagPool.push(el); } tagUsed++; el.style.display = 'block'; return el; }
const _p = new THREE.Vector3();
function updatePlayers(dt) {
  tagUsed = 0;
  const k = 1 - Math.exp(-dt * 13);
  for (const p of players.values()) {
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001) * k; p.speed += (Math.min(sp, 12) - p.speed) * Math.min(1, dt * 8);
    if (Math.hypot(dx, dz) > 25) { p.x = p.tx; p.z = p.tz; p.y = p.ty; }
    p.x += dx * k; p.z += dz * k; p.y += (p.ty - p.y) * k; p.yaw += angDiff(p.yaw, p.tyaw) * k; p.pitch += (p.tpitch - p.pitch) * k;
    p.swingT += dt;
    const rig = p.rig;
    const hide = p.bus || (!p.alive && p.deadT > 5);
    if (!p.alive) p.deadT += dt;
    rig.root.visible = !hide && p.init;
    if (!rig.root.visible) continue;
    rig.root.position.set(p.x, p.y, p.z); rig.root.rotation.y = p.yaw;
    const fl = p.flags, mode2 = fl & 2 ? 'glide' : fl & 1 ? 'fall' : 'ground';
    const wk = p.held <= 5 ? WID[p.held] : null;
    setRigWeapon(rig, wk, 0);
    poseRig(rig, { speed: p.speed, onGround: !(fl & 8) && mode2 === 'ground', mode: mode2, pitch: p.pitch, gun: p.held >= 1 && p.held <= 5, melee: p.held === 0, using: p.held >= 6, swing: p.swingT, emote: p.emote && p.speed < 0.5, dead: !p.alive, recoil: p.recoil }, dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);
    if (rig.flashT !== undefined && rig.flash) { rig.flashT -= dt; if (rig.flashT <= 0) rig.flash.visible = false; }
    const d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
    rig.setOutline(d < 50);
    rig.root.visible = d < 260;
    if (p.alive && d < 60 && rig.root.visible) {
      _p.set(p.x, p.y + 2.25, p.z).project(camera);
      if (_p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1) {
        const el = tagEl(); el.style.left = `${(_p.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-_p.y * 0.5 + 0.5) * innerHeight}px`;
        el.children[0].textContent = p.name; el.children[1].firstChild.style.width = `${clamp((p.hp + p.sh) / 2, 0, 100)}%`; el.style.opacity = clamp(1.4 - d / 60, 0.2, 1);
      }
    }
  }
  for (let i = tagUsed; i < tagPool.length; i++) tagPool[i].style.display = 'none';
  // jogador local
  const rig = me.rig;
  if (rig && rig.root.visible) {
    rig.root.position.set(me.x, me.y, me.z);
    const bodyYaw = mode === 'spectate' ? me.yaw : me.yaw; rig.root.rotation.y += angDiff(rig.root.rotation.y, bodyYaw) * Math.min(1, dt * 20);
    const it = curItem();
    const gunOn = !buildPiece && it && WEAPONS[it.k] && !WEAPONS[it.k].melee, melee = !buildPiece && it && it.k === 'pickaxe';
    setRigWeapon(rig, buildPiece ? null : it && WEAPONS[it.k] ? it.k : null, it?.r || 0);
    poseRig(rig, { speed: me.speed, onGround: me.onGround, mode: mode === 'glide' ? 'glide' : mode === 'fall' ? 'fall' : 'ground', pitch: me.pitch, gun: !!gunOn, melee: !!melee, using: !!(progress && progress.label !== 'Recarregando'), swing: me.swingT, emote: emoting, dead: !me.alive, recoil: me.recoil }, dt);
    if (rig.flashT !== undefined && rig.flash) { rig.flashT -= dt; if (rig.flashT <= 0) rig.flash.visible = false; }
    rig.setOutline(true);
  }
}

// ------------------------------------------------------------------ HUD por quadro
function updateHud(now) {
  $('hpBar').children[0].style.width = `${clamp(me.hp, 0, 100)}%`; $('hpBar').children[1].textContent = Math.ceil(me.hp);
  $('shBar').children[0].style.width = `${clamp(me.sh, 0, 100)}%`; $('shBar').children[1].textContent = Math.ceil(me.sh);
  const it = curItem(), w = it && WEAPONS[it.k];
  if (buildPiece) { $('wName').textContent = `CONSTRUIR · ${{ wall: 'PAREDE', floor: 'PISO', ramp: 'RAMPA' }[buildPiece]}`; $('magN').textContent = ''; $('resN').textContent = MAT_INFO[MATS[matSel]].n + ' ' + inv.mats[MATS[matSel]]; }
  else if (w && !w.melee) { $('wName').textContent = `${w.n} · ${RARITY[it.r].n}`; $('wName').style.color = RARITY[it.r].c; $('magN').textContent = it.mag; $('resN').textContent = `/ ${inv.ammo[w.ammo]}`; }
  else if (it && CONSUMABLES[it.k]) { $('wName').textContent = CONSUMABLES[it.k].n; $('wName').style.color = '#fff'; $('magN').textContent = it.n; $('resN').textContent = 'clique para usar'; }
  else { $('wName').textContent = it ? 'PICARETA' : ''; $('wName').style.color = '#fff'; $('magN').textContent = ''; $('resN').textContent = ''; }
  $('crosshair').classList.toggle('build', !!buildPiece);
  $('crosshair').style.display = ads && it?.k === 'sniper' ? 'none' : 'block';
  // prompt
  const pr = $('prompt');
  const n = mode === 'ground' && me.alive ? nearestInteract() : null;
  if (n) {
    if (n.chest !== undefined) pr.innerHTML = '<b>[E]</b> Abrir baú'; else { const i = n.item; pr.innerHTML = `<b>[E]</b> Pegar <span style="color:${RARITY[i.r].c}">${i.kind === 'weapon' ? WEAPONS[i.k].n : CONSUMABLES[i.k]?.n}${i.kind === 'cons' ? ' ×' + i.n : ''}</span>${i.kind === 'weapon' ? `<small style="color:${RARITY[i.r].c}">${RARITY[i.r].n}</small>` : ''}`; }
    pr.classList.remove('hidden');
  } else pr.classList.add('hidden');
  // barra de progresso
  const pg = $('progress'), pl = $('progressLabel');
  if (progress) { const f = (now - progress.t0) / progress.dur; if (f >= 1) progress = null; else { pg.classList.remove('hidden'); pl.classList.remove('hidden'); pg.firstChild.style.width = `${f * 100}%`; pl.textContent = progress.label; } }
  if (!progress) { pg.classList.add('hidden'); pl.classList.add('hidden'); }
  // tempestade
  let txt = '—';
  if (bus && phase === 'play') txt = '🚌 Ônibus de batalha — pule!';
  else if (storm) { const t = storm[7], mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0'); txt = storm[6] ? `⚡ Tempestade fechando · ${mm}:${ss}` : `Próxima tempestade em ${mm}:${ss}`; }
  $('stormTxt').textContent = txt;
  if (storm && mode === 'ground') {
    const out = Math.hypot(me.x - storm[0], me.z - storm[1]) > storm[2];
    $('stormvig').style.opacity = out ? 1 : 0;
  } else $('stormvig').style.opacity = 0;
  // mapas
  if ((now | 0) % 2 === 0) { drawMap($('minimap'), false); if (showBig) drawMap($('bigmap'), true); }
}

// ------------------------------------------------------------------ loop
let last = performance.now(), sendAcc = 0, shadowK = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (world) {
    updateLocal(dt);
    handleFire(now);
    updateCamera(dt, now);
    updatePlayers(dt);
    updateGhost();
    // luz/sombra segue o jogador
    const fx = mode === 'lobby' ? 0 : me.x, fz = mode === 'lobby' ? 0 : me.z;
    sun.target.position.set(Math.round(fx), 0, Math.round(fz)); sun.position.set(Math.round(fx) + 70, 120, Math.round(fz) + 40);
    if (mode === 'lobby') { sun.shadow.camera.left = -160; sun.shadow.camera.right = 160; sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160; } else { sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70; }
    sun.shadow.camera.updateProjectionMatrix();
    // ambiente
    terrain.wt.offset.set(now * 0.00002, now * 0.000015);
    skyObj.clouds.position.x = (now * 0.002) % 400 - 200;
    // loot
    for (const it of items.values()) {
      const d = Math.hypot(it.x - camera.position.x, it.z - camera.position.z);
      it.group.visible = d < 120;
      if (it.group.visible) { it.group.userData.inner.rotation.y = now * 0.0016 + it.ph; it.group.position.y = it.y + 0.65 + Math.sin(now * 0.003 + it.ph) * 0.12; }
    }
    // peças recém criadas “pulam”
    for (const b of builds.values()) if (b.pop !== undefined) { b.pop += dt * 8; const s = Math.min(1, 0.92 + b.pop * 0.08); b.mesh.scale.setScalar(s); if (b.pop >= 1) delete b.pop; }
    // tracers
    for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; if (t.life <= 0) { scene.remove(t.m); tracers.splice(i, 1); } }
    updateSparks(dt);
    // tempestade e ônibus
    if (storm) {
      stormObj.wall.visible = true; stormObj.wall.scale.set(storm[2], 1, storm[2]); stormObj.wall.position.x = storm[0]; stormObj.wall.position.z = storm[1]; stormObj.tx.offset.y -= dt * 0.15; stormObj.tx.offset.x += dt * 0.01;
      stormObj.ring.visible = storm[5] > 4; stormObj.ring.scale.set(storm[5], 1, storm[5]); stormObj.ring.position.x = storm[3]; stormObj.ring.position.z = storm[4];
    } else { stormObj.wall.visible = false; stormObj.ring.visible = false; }
    if (bus && phase === 'play') { busMesh.visible = true; busMesh.position.set(bus[0], bus[2], bus[1]); busMesh.rotation.y = Math.atan2(bus[3], bus[4]); } else busMesh.visible = false;
    // rede
    sendAcc += dt;
    if (sendAcc >= 1 / 30 && ['fall', 'glide', 'ground'].includes(mode) && me.alive) {
      sendAcc = 0;
      const f = (mode === 'fall' ? 1 : 0) | (mode === 'glide' ? 2 : 0) | (me.speed > 0.5 ? 4 : 0) | (mode === 'ground' && !me.onGround ? 8 : 0) | (buildPiece ? 64 : 0);
      send({ t: 'in', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), f, em: emoting && me.speed < 0.5 ? 1 : 0 });
    }
    if (!$('hud').classList.contains('hidden')) updateHud(now);
  }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ lobby UI
const previewR = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
previewR.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); previewR.shadowMap.enabled = true;
const pScene = new THREE.Scene(); const pCam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); pCam.position.set(0, 1.25, 6.6); pCam.lookAt(0, 0.85, 0);
pScene.add(new THREE.HemisphereLight(0xdcecff, 0x554466, 1.5)); const pl = new THREE.DirectionalLight(0xffffff, 2.6); pl.position.set(2.5, 4, 3); pl.castShadow = true; pScene.add(pl);
const rim = new THREE.DirectionalLight(0x9a6bff, 1.6); rim.position.set(-3, 2, -3); pScene.add(rim);
const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x241a4a, roughness: 0.4, metalness: 0.4 })); stage.position.y = -0.06; stage.receiveShadow = true; pScene.add(stage);
const stageRing = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.025, 8, 60), new THREE.MeshBasicMaterial({ color: 0xb06bff })); stageRing.rotation.x = Math.PI / 2; pScene.add(stageRing);
let pRig = null, pRot = 0.4, pDrag = false, pEmote = false;
function setPreviewSkin() {
  if (pRig) pScene.remove(pRig.root);
  pRig = createCharacter(mySkin); setRigWeapon(pRig, 'ar', Math.max(1, SKINS[mySkin].rarity)); pScene.add(pRig.root); pRig.setOutline(true);
  const s = SKINS[mySkin];
  $('skinName').textContent = s.name; $('skinRar').textContent = RARITY[s.rarity].n.toUpperCase(); $('skinRar').style.color = RARITY[s.rarity].c; $('skinDesc').textContent = s.desc;
  document.querySelectorAll('#skinGrid div').forEach((d, i) => d.classList.toggle('sel', i === mySkin));
  store.set('skin', mySkin);
  if (ws && ws.readyState === 1) send({ t: 'skin', s: mySkin, n: $('nameIn').value.trim() });
  if (me.rig) { scene.remove(me.rig.root); me.rig = createCharacter(mySkin); scene.add(me.rig.root); me.rig.root.visible = false; }
}
SKINS.forEach((s, i) => { const d = document.createElement('div'); d.textContent = s.name.split(' ')[0]; d.style.borderBottom = `3px solid ${RARITY[s.rarity].c}`; d.onclick = () => { mySkin = i; setPreviewSkin(); sfx.click(); }; $('skinGrid').appendChild(d); });
$('skinPrev').onclick = () => { mySkin = (mySkin + SKINS.length - 1) % SKINS.length; setPreviewSkin(); };
$('skinNext').onclick = () => { mySkin = (mySkin + 1) % SKINS.length; setPreviewSkin(); };
$('nameIn').value = myName; $('sens').value = sens; $('sensV').textContent = sens;
$('sens').oninput = () => { sens = Number($('sens').value); $('sensV').textContent = sens; store.set('sens', sens); };
$('playBtn').onclick = connect;
$('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
$('startBtn').onclick = () => { initAudio(); send({ t: 'start' }); };
$('specNext').onclick = () => pickSpectate(true);
$('toLobby').onclick = () => { $('death').classList.add('hidden'); $('victory').classList.add('hidden'); mode = 'spectate'; deathInfo = null; showHud(true); toast('Observando — a próxima rodada começa em breve.', 4000); };
$('victory').onclick = () => { $('victory').classList.add('hidden'); };
const pw = $('previewWrap');
pw.addEventListener('mousedown', () => { pDrag = true; }); addEventListener('mouseup', () => { pDrag = false; });
addEventListener('mousemove', (e) => { if (pDrag) pRot += e.movementX * 0.012; });
pw.addEventListener('dblclick', () => { pEmote = !pEmote; });
function previewLoop(now) {
  requestAnimationFrame(previewLoop);
  if ($('lobby').classList.contains('hidden') || !pRig) return;
  const r = pw.getBoundingClientRect(); const w = Math.max(10, r.width), h = Math.max(10, r.height);
  if (previewR.domElement.width !== Math.floor(w * previewR.getPixelRatio())) { previewR.setSize(w, h, false); pCam.aspect = w / h; pCam.updateProjectionMatrix(); }
  if (!pDrag) pRot += 0.006; pRig.root.rotation.y = pRot; stageRing.rotation.z += 0.01;
  poseRig(pRig, { speed: 0, onGround: true, mode: 'ground', pitch: 0, gun: !pEmote, melee: false, swing: 9, emote: pEmote, dead: false }, 1 / 60);
  previewR.render(pScene, pCam);
}
setPreviewSkin(); requestAnimationFrame(previewLoop);

// mundo de fundo (mesma semente padrão do servidor) para a órbita do lobby
initWorld(1337);
requestAnimationFrame(frame);
window.__game = { tp(x, y, z) { me.x = x; me.y = y; me.z = z; me.vx = me.vy = me.vz = 0; mode = 'ground'; me.alive = true; me.onGround = false; if (!me.rig) { me.rig = createCharacter(mySkin); scene.add(me.rig.root); setRigWeapon(me.rig, 'pickaxe'); } }, me, players, items, builds, inv, get mode() { return mode; }, set mode(v) { mode = v; }, get world() { return world; }, scene, camera, renderer, send, keys, setLocked(v) { locked = v; }, get phase() { return phase; }, get storm() { return storm; } };
