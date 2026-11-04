// Registro de modelos 3D: carrega GLB opcionais listados em /models/manifest.json.
// Tudo que não estiver no manifesto (ou falhar ao carregar) usa o modelo procedural
// de models.js/scene.js, então o jogo nunca fica com referência ausente.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Contrato de cada tipo (ver models/README.md)
export const ASSET_SPECS = {
  character: { height: 1.8, pivot: 'feet' },   // personagem em pé, olhando para +Z
  weapon: { length: null, pivot: 'grip' },     // origem na empunhadura, cano para +Z
  bus: { length: 9, pivot: 'center' },         // ônibus ~9 m, balão incluso
  chest: { length: 1.1, pivot: 'base' },
  glider: { height: 1.6, pivot: 'base' },      // copa do planador; montada 1,7 m acima dos pés
  tree: { height: 7, pivot: 'base' },
  rock: { height: 1.7, pivot: 'base' },
};

const cache = new Map(); // "kind/id" -> THREE.Object3D (original, normalizado)
let manifest = {};

function normalize(kind, obj) {
  const spec = ASSET_SPECS[kind] || {};
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (spec.height && size.y > 0) s = spec.height / size.y;
  else if (spec.length && size.z > 0) s = spec.length / size.z;
  const wrap = new THREE.Group(); wrap.add(obj); obj.scale.multiplyScalar(s);
  wrap.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  if (spec.pivot === 'feet' || spec.pivot === 'base') obj.position.set(-c.x, -b2.min.y, -c.z);
  else if (spec.pivot === 'center') obj.position.sub(c);
  // pivô 'grip': respeita a origem do arquivo
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m && 'roughness' in m) { m.roughness = Math.max(0.45, Math.min(0.75, m.roughness)); m.metalness = Math.min(m.metalness, 0.3); } });
    }
  });
  return wrap;
}

export async function preloadAssets(base = 'models/') {
  if (window.__NO_ASSETS) return 0; // artefato: sem arquivos externos, só procedurais
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return 0;
    manifest = await r.json();
  } catch { return 0; } // artefato ou servidor sem modelos: só procedurais
  const loader = new GLTFLoader();
  const jobs = [];
  for (const [kind, entries] of Object.entries(manifest)) {
    if (kind.startsWith('_') || !ASSET_SPECS[kind] || typeof entries !== 'object') continue;
    for (const [id, file] of Object.entries(entries)) {
      jobs.push(loader.loadAsync(base + file)
        .then((g) => cache.set(`${kind}/${id}`, normalize(kind, g.scene)))
        .catch((e) => console.warn(`[assets] ${kind}/${id} (${file}) falhou; usando procedural`, e.message)));
    }
  }
  await Promise.all(jobs);
  console.info(`[assets] ${cache.size} modelo(s) GLB carregado(s)`);
  return cache.size;
}

// Cópia independente (materiais clonados para permitir cor de raridade/dano).
export function getAsset(kind, id) {
  const src = cache.get(`${kind}/${id}`);
  if (!src) return null;
  const c = src.clone(true);
  c.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
  return c;
}

// Peças para InstancedMesh (árvores/pedras): geometria com transformações aplicadas.
export function getInstanceParts(kind, id = 'default') {
  const src = cache.get(`${kind}/${id}`);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push({ geometry: g, material: o.material }); } });
  return parts.length ? parts : null;
}

export function findNode(root, names) {
  for (const n of names) { const o = root.getObjectByName(n); if (o) return o; }
  return null;
}
