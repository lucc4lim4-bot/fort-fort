// Dados compartilhados entre cliente e servidor.
export const SIZE = 400;          // mapa 400x400 m (tamanho do modo Reload: ilha pequena e rápida)
export const HALF = SIZE / 2;
export const TOTAL_PLAYERS = 30;  // humanos + bots
export const MAX_HUMANS = 16;
export const TICK = 30;           // Hz do servidor
export const EYE = 1.6;
export const PLAYER_H = 1.8;
export const PLAYER_R = 0.38;

export const RARITY = [
  { n: 'Comum', c: '#b4b9be', w: 40 },
  { n: 'Incomum', c: '#5fd34a', w: 28 },
  { n: 'Raro', c: '#3aa0ff', w: 18 },
  { n: 'Épico', c: '#b45cff', w: 10 },
  { n: 'Lendário', c: '#ffb02e', w: 4 },
];
export const RMUL = [1, 1.05, 1.1, 1.15, 1.2];

// rps = tiros/s, hs = multiplicador de headshot, ammo = tipo de munição
export const WEAPONS = {
  pickaxe: { n: 'Picareta', melee: true, dmg: 20, rps: 1.8, range: 3.6 },
  pistol:  { n: 'Pistola', dmg: 24, rps: 6, mag: 16, reload: 1.6, spread: 0.012, range: 170, ammo: 'light', hs: 1.5, pellets: 1 },
  smg:     { n: 'Submetralhadora', dmg: 17, rps: 11, mag: 30, reload: 2.0, spread: 0.028, range: 120, ammo: 'light', hs: 1.5, pellets: 1 },
  ar:      { n: 'Rifle de Assalto', dmg: 30, rps: 5.5, mag: 30, reload: 2.3, spread: 0.017, range: 220, ammo: 'medium', hs: 1.5, pellets: 1 },
  shotgun: { n: 'Escopeta', dmg: 12, rps: 0.95, mag: 5, reload: 3.0, spread: 0.065, range: 45, ammo: 'shell', hs: 1.5, pellets: 9 },
  sniper:  { n: 'Sniper', dmg: 105, rps: 0.55, mag: 1, reload: 2.4, spread: 0.0008, range: 400, ammo: 'heavy', hs: 2.2, pellets: 1, scope: true },
};
export const AMMO = {
  light: { n: 'Munição Leve', max: 240, pick: 36 },
  medium: { n: 'Munição Média', max: 240, pick: 30 },
  shell: { n: 'Cartuchos', max: 60, pick: 10 },
  heavy: { n: 'Munição Pesada', max: 40, pick: 6 },
};
// time = segundos para usar
export const CONSUMABLES = {
  bandage:    { n: 'Bandagem', time: 2.5, hp: 15, hpMax: 75, stack: 15, color: '#e8e8e8' },
  medkit:     { n: 'Kit Médico', time: 6, hp: 100, hpMax: 100, stack: 3, color: '#ff4a4a' },
  minishield: { n: 'Mini Escudo', time: 2.0, sh: 25, shMax: 50, stack: 6, color: '#53c8ff' },
  shieldpot:  { n: 'Poção de Escudo', time: 4.0, sh: 50, shMax: 100, stack: 2, color: '#2a7bff' },
};
export const MATS = ['wood', 'brick', 'metal'];
export const MAT_INFO = {
  wood:  { n: 'Madeira', hp: 120, color: 0xb98550 },
  brick: { n: 'Tijolo', hp: 240, color: 0xc4573a },
  metal: { n: 'Metal', hp: 360, color: 0x9aa7b4 },
};
export const BUILD_COST = 10;

export const SKINS = [
  { id: 0, name: 'Comandante Tático', rarity: 2, desc: 'Capacete, colete e camuflagem de campo.' },
  { id: 1, name: 'Ninja Sombra', rarity: 3, desc: 'Silencioso, letal e com uma katana nas costas.' },
  { id: 2, name: 'Robô Alfa-7', rarity: 3, desc: 'Metal ciano com visor brilhante.' },
  { id: 3, name: 'Astronauta Cósmico', rarity: 2, desc: 'Direto da órbita com capacete de vidro.' },
  { id: 4, name: 'Dragão Rubro', rarity: 4, desc: 'Escamas vermelhas, chifres, cauda e asas.' },
  { id: 5, name: 'Capitão Pirata', rarity: 2, desc: 'Chapéu tricórnio, tapa-olho e barba.' },
  { id: 6, name: 'Zumbi Faminto', rarity: 1, desc: 'Pele esverdeada e roupas rasgadas.' },
  { id: 7, name: 'Cavaleiro Dourado', rarity: 4, desc: 'Armadura dourada, elmo com pluma e capa.' },
  { id: 8, name: 'Gatinha Neon', rarity: 3, desc: 'Orelhas de gato, cauda e brilho neon.' },
  { id: 9, name: 'Rei Abóbora', rarity: 3, desc: 'Cabeça de abóbora e terno sombrio.' },
];

// Tempestade: espera (s), encolhimento (s), raio final, dano por segundo
export const STORM_STAGES = [
  { wait: 45, shrink: 40, r: 125, dmg: 1 },
  { wait: 30, shrink: 30, r: 78, dmg: 2 },
  { wait: 25, shrink: 25, r: 42, dmg: 4 },
  { wait: 18, shrink: 22, r: 16, dmg: 7 },
  { wait: 10, shrink: 20, r: 3, dmg: 10 },
];
export const STORM_START_R = 215;

export const BUS_SPEED = 30;
export const BUS_Y = 185;

export const POIS = [
  { id: 'town', name: 'Vila Central', x: 0, z: 0, r: 40, style: 'town' },
  { id: 'farm', name: 'Fazenda Feliz', x: -96, z: 58, r: 32, style: 'farm' },
  { id: 'base', name: 'Base Militar', x: 100, z: -68, r: 32, style: 'military' },
  { id: 'port', name: 'Porto Pescador', x: -72, z: -138, r: 30, style: 'port' },
  { id: 'fact', name: 'Fábrica Cinza', x: 96, z: 92, r: 32, style: 'factory' },
  { id: 'ruin', name: 'Ruínas Antigas', x: -112, z: -44, r: 24, style: 'ruins' },
  { id: 'tower', name: 'Torre Alta', x: 22, z: -108, r: 20, style: 'tower' },
  { id: 'sub', name: 'Subúrbio Verde', x: -22, z: 104, r: 30, style: 'suburb' },
];
