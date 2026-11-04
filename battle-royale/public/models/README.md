# Como trocar os modelos provisórios por GLB

O jogo funciona sem nenhum arquivo aqui: tudo que não estiver listado em `manifest.json` (ou falhar ao carregar) usa o modelo gerado em código. O console mostra `[assets] N modelo(s) GLB carregado(s)` e avisa qualquer falha.

## Passo a passo

1. Exporte o modelo como **.glb** (Blender: File → Export → glTF 2.0, formato *glTF Binary*). Use metros, Y para cima, frente do modelo em **+Z** (no Blender, frente em −Y e "+Y Up" marcado).
2. Coloque em uma subpasta (`characters/`, `weapons/`, `vehicles/`, `props/`).
3. Registre em `manifest.json`:
   ```json
   {
     "character": { "0": "characters/comandante.glb" },
     "weapon": { "ar": "weapons/ar.glb" },
     "bus": { "default": "vehicles/onibus.glb" },
     "chest": { "default": "props/bau.glb" },
     "glider": { "default": "props/planador.glb" },
     "tree": { "default": "props/arvore.glb" },
     "rock": { "default": "props/pedra.glb" }
   }
   ```
   Chaves de personagem = número da skin (0 a 9). Chaves de arma: `pickaxe, pistol, smg, ar, shotgun, sniper, rocket`.
4. Recarregue a página. A escala e o pivô são ajustados automaticamente (personagem com 1,8 m e pés no chão, ônibus com 9 m, etc.).

## Regras de cada tipo

- **Personagem**: sem skinning. Cada parte do corpo é filha de um nó com estes nomes (também aceita nomes do Mixamo, como `Hips`, `LeftArm`):
  `hips > torso > head`, `torso > shoulder_L > elbow_L`, `torso > shoulder_R > elbow_R > hand_R_socket`, `hips > leg_L > knee_L > foot_L`, `hips > leg_R > knee_R > foot_R`.
  Braços e pernas em pose reta, pendurados para baixo; o jogo gira as juntas para animar. `hand_R_socket` é onde a arma encaixa (arma aponta para +Z do socket). Se faltar uma junta obrigatória, o jogo avisa no console e usa o modelo procedural.
- **Arma**: origem na empunhadura, cano para +Z. Nó `muzzle` na ponta do cano (sem ele, a ponta é calculada pela caixa do modelo). Um material chamado `rarity` recebe a cor da raridade.
- **Baú**: nó `lid` com a dobradiça no eixo X.
- **Árvore / pedra**: viram InstancedMesh; mantenha poucos materiais (cada material é uma chamada de desenho).

## O que não muda com a troca

Colisões e acertos são calculados no servidor com caixas fixas (personagem 0,9 × 1,9 m; casas e construções em `shared/world.js`). Trocar o visual não altera a jogabilidade. Casas e peças de construção continuam procedurais porque a forma delas é também a colisão.

## Exemplo

`exemplo/` tem três GLB simples (personagem com as juntas, rifle e árvore) feitos por este projeto para testar o formato. Para vê-los em jogo, aponte o `manifest.json` para eles:
`{ "character": { "0": "exemplo/char.glb" }, "weapon": { "ar": "exemplo/ar.glb" }, "tree": { "default": "exemplo/tree.glb" } }`

## Créditos

Registre cada asset de terceiros (nome, autor, link, licença) em `CREDITOS.md`. Não use modelos extraídos de jogos comerciais.
