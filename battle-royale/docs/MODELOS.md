# Inventário e mapeamento de modelos 3D

Motor: **Three.js 0.170** (cliente em `public/js`, mundo compartilhado em `shared/`).
Hoje **nenhum modelo vem de arquivo**: tudo é gerado em código (primitivas). O registro `public/js/assets.js` permite trocar cada item por um GLB sem mexer na lógica; o que não tiver arquivo continua procedural.

## 1. Inventário

| Item | Onde é criado | Usado por | Colisão / hitbox | Animação | LOD / otimização atual |
|---|---|---|---|---|---|
| Personagens (10 skins) | `models.js` → `buildRig`, `SKIN_BUILD[0..9]`, `createCharacter(id)` | `main.js` (jogadores, bots, prévia do saguão, miniaturas do armário) | **Servidor**: caixa 0,9 × 1,9 × 0,9 m (`server/game.js → castRay`); física: cilindro r 0,38 / h 1,8 (`shared/world.js`) | Procedural por juntas em `poseRig` (andar, correr, pular, aterrissar, mirar, recarregar, picareta, cura, dança, queda livre, planador, eliminação) | Some acima de 260 m; nomes só até 60 m; materiais em cache (`M()`) |
| Planador | `models.js → buildGlider` | filho do personagem | — | balanço em `poseRig` | — |
| Armas (7) | `models.js → createWeapon(key, raridade)` | mão do personagem (`rig.mount`), loot no chão | sem colisão (tiro é raycast do servidor a partir do olho) | coice/recarga pelo braço | geometrias em cache |
| Boca do cano | `g.userData.muzzle` | traçantes e clarão (`main.js → onShot`) | — | — | — |
| Ônibus de batalha | `models.js → createBusModel` | `main.js` | nenhuma (jogadores não colidem) | posição/rumo do servidor | 1 instância |
| Baú | `scene.js → createChestMesh` (+ `userData.lid`, `userData.glow`) | `main.js` | nenhuma (interação por distância 3,5 m) | tampa abre | 34 instâncias |
| Itens no chão | `scene.js → createItemMesh` (usa `createWeapon` para armas) | `main.js` | nenhuma | gira e flutua | ocultos acima de 120 m |
| Peças de construção (parede/piso/rampa) | `scene.js → createPieceMesh`; colisor em `shared/world.js → makePieceCollider` | cliente e servidor | AABB / rampa (compartilhado) | “pop” ao construir | 3 materiais compartilhados |
| Casas, contêineres, torres, ruínas | `shared/world.js → house/container/spiralTower` (caixas) | render em `scene.js → buildStatics` (1 InstancedMesh) | as próprias caixas | — | instanciado |
| Decoração (telhados, janelas, chaminés, silos, postes, arbustos, flores) | `shared/world.js → decor[]` | `scene.js → buildStatics` | nenhuma | — | 5 InstancedMesh |
| Árvores, pedras, sucata | `shared/world.js → addNode` | `scene.js → buildStatics` | caixa do tronco/pedra | — | InstancedMesh |
| Terreno, mar, céu, nuvens, tempestade | `scene.js → buildTerrain/buildSky/createStorm` | `main.js` | terreno: `heightAt()` | textura do mar e da tempestade rola | 1 malha cada |

## 2. Mapeamento “atual → substituto”

Formato sempre **GLB** (glTF binário). Unidade: metro. Eixo: Y para cima, frente em **+Z**.

| Atual | Arquivo sugerido | Escala/pivô (normalizado pelo loader) | Materiais | Juntas / nós obrigatórios | Animação |
|---|---|---|---|---|---|
| Skin 0 Comandante Tático | `characters/comandante.glb` | altura 1,8 m, pivô nos pés | 3–5 materiais sólidos (pele, roupa, detalhe, acessório) | `hips, torso, head, shoulder_L/R, elbow_L/R, leg_L/R, knee_L/R` (+ opcionais `foot_L/R`, `hand_R_socket`) | nenhuma no arquivo: o jogo gira as juntas |
| Skin 1 Ninja Sombra | `characters/ninja.glb` | idem | idem | idem | idem |
| Skin 2 Robô Alfa-7 | `characters/robo.glb` | idem | metal + emissivo do visor | idem | idem |
| Skin 3 Astronauta Cósmico | `characters/astronauta.glb` | idem | capacete transparente (opacity < 1) | idem | idem |
| Skin 4 Dragão Rubro | `characters/dragao.glb` | idem | escamas + barriga | idem (cauda/asas como filhos de `hips`/`torso`) | idem |
| Skin 5 Capitão Pirata | `characters/pirata.glb` | idem | | idem | idem |
| Skin 6 Zumbi Faminto | `characters/zumbi.glb` | idem | | idem | idem |
| Skin 7 Cavaleiro Dourado | `characters/cavaleiro.glb` | idem | metal dourado | idem | idem |
| Skin 8 Gatinha Neon | `characters/gatinha.glb` | idem | emissivos rosa/ciano | idem | idem |
| Skin 9 Rei Abóbora | `characters/abobora.glb` | idem | emissivo na boca/olhos | idem | idem |
| Picareta | `weapons/pickaxe.glb` | tamanho real (~0,9 m), origem na empunhadura | material `rarity` opcional | `muzzle` (opcional: ponta) | — |
| Pistola Pesada | `weapons/pistol.glb` | ~0,4 m | material **`rarity`** recebe a cor | `muzzle` | — |
| SMG Tática | `weapons/smg.glb` | ~0,6 m | idem | `muzzle` | — |
| Rifle de Assalto | `weapons/ar.glb` | ~0,95 m | idem | `muzzle` | — |
| Escopeta Pump | `weapons/shotgun.glb` | ~0,85 m | idem | `muzzle` | — |
| Rifle de Caça | `weapons/sniper.glb` | ~1,15 m | idem | `muzzle` | — |
| Lança-foguetes | `weapons/rocket.glb` | ~1,0 m | idem | `muzzle` | — |
| Ônibus de batalha | `vehicles/onibus.glb` | 9 m de comprimento, pivô no centro | 2–3 cores + vidro | — | (rotores/balão podem ser estáticos) |
| Planador | `props/planador.glb` | 1,6 m de altura, pivô na base | 2 cores | — | balanço feito em código |
| Baú | `props/bau.glb` | 1,1 m, pivô na base | madeira + dourado | `lid` (dobradiça no eixo X) | tampa gira −1,8 rad |
| Árvore | `props/arvore.glb` | 7 m, pivô na base | ≤ 2 materiais | — | instanciada (1 desenho por material) |
| Pedra | `props/pedra.glb` | 1,7 m, pivô na base | 1 material | — | instanciada |
| Casas, contêineres, peças de construção, terreno | **ficam procedurais** | — | — | — | A colisão desses itens é a própria geometria; trocar por GLB exige mudar `shared/world.js` no servidor também. |

## 3. Estilo aplicado

- Materiais `MeshStandardMaterial` com rugosidade 0,45–0,75 e metal baixo (GLBs são ajustados ao carregar), cores saturadas, sombras suaves.
- Luz de recorte azulada (`rimLight` em `main.js`) para destacar silhuetas.
- Contorno preto foi retirado na versão atual: custava o dobro de desenhos por personagem. Pode voltar só para personagens perto da câmera, se desejado.
- Qualidade baixa: `?q=low` na URL desliga sombras e reduz resolução e neblina; em toque a resolução e o mapa de sombras já são reduzidos.

## 4. Licenças

O projeto não contém assets de terceiros: tudo é geometria gerada em código, e os arquivos em `public/models/exemplo/` foram gerados por este projeto a partir de formas simples. Fontes de assets CC0 sugeridas (confira a licença de cada arquivo antes de usar):
- Kenney — https://kenney.nl/assets (CC0)
- Quaternius — https://quaternius.com (CC0)
- Poly Pizza — https://poly.pizza (vários CC0/CC-BY: verifique cada modelo; CC-BY exige crédito)

Ao adicionar um asset, registre nome, autor, URL e licença em `public/models/CREDITOS.md`.
