// Servidor HTTP (arquivos estáticos) + WebSocket (partida multiplayer).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { TICK } from '../shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function resolveFile(url) {
  let p = decodeURIComponent(url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/vendor/three.module.js') return path.join(ROOT, 'node_modules/three/build/three.module.js');
  if (p.startsWith('/vendor/addons/')) { const f = path.join(ROOT, 'node_modules/three/examples/jsm', p.slice('/vendor/addons/'.length)); return f.startsWith(path.join(ROOT, 'node_modules/three/examples/jsm')) ? f : null; }
  if (p.startsWith('/shared/')) return path.join(ROOT, p);
  const f = path.join(ROOT, 'public', p);
  return f.startsWith(path.join(ROOT, 'public')) ? f : null;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  const f = resolveFile(req.url);
  if (!f) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const game = new Game(Number(process.env.SEED) || 1337);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
wss.on('connection', (ws) => {
  let p = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!p) { if (m.t === 'join') p = game.addHuman(ws, String(m.name || 'Jogador'), m.skin); return; }
    try { game.handle(p, m); } catch (e) { console.error('erro handle', e); }
  });
  ws.on('close', () => { if (p) game.removePlayer(p); });
  ws.on('error', () => {});
});

setInterval(() => { try { game.tick(); } catch (e) { console.error('erro tick', e); } }, 1000 / TICK);
server.listen(PORT, () => console.log(`Fort Fort Battle Royale rodando em http://localhost:${PORT}`));
