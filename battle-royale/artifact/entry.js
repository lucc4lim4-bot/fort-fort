window.__NO_ASSETS = true;
import { Game } from '../server/game.js';
let game = null, timer = null;
window.__LOCAL = () => {
  if (!game) { game = new Game(1337); timer = setInterval(() => { try { game.tick(); } catch (e) { console.error(e); } }, 1000 / 30); }
  let player = null;
  const client = { readyState: 1, onopen: null, onmessage: null, onclose: null, onerror: null,
    send(s) { const m = JSON.parse(s); if (!player) { if (m.t === 'join') player = game.addHuman(server, String(m.name || 'Jogador'), m.skin); return; } game.handle(player, m); },
    close() { if (player) game.removePlayer(player); player = null; } };
  const server = { readyState: 1, send(s) { if (client.onmessage) client.onmessage({ data: s }); }, close() {} };
  setTimeout(() => client.onopen && client.onopen(), 0);
  return client;
};
import '../public/js/main.js';
