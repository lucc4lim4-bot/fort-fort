# Forja de Batalha

Duelo 1v1 onde você pede qualquer coisa ("bazuca de abacaxi", "tubarão ninja que solta laser", "muralha de chocolate") e a forja transforma o pedido em arma, torre, aliado, muralha, escudo, cura, turbo, minas ou ataque aéreo.

- **Jogar (3D, terceira pessoa):** https://lucc4lim4-bot.github.io/fort-fort/
- **Versão 2D (com 2 jogadores no mesmo teclado):** https://lucc4lim4-bot.github.io/fort-fort/2d.html

## Controles (3D)

`WASD` andar · mouse mirar · clique atirar · `Espaço` pular · `Shift` correr · `Q`/roda/`1-7` trocar arma · `E` usar item · `R` trocar item · `Esc` soltar o mouse.

## Sobre a IA

Quando o jogo é aberto como Artifact no claude.ai, os pedidos são forjados pelo Claude. No GitHub Pages ele usa a forja local, que reconhece palavras-chave (fogo, gelo, míssil, torre, tubarão, muralha, cura…) e monta o item a partir delas.


## Battle Royale 3D multiplayer

Na pasta [`battle-royale/`](battle-royale/) há um jogo battle royale estilo Fortnite Reload (mapa 400×400 m, 10 skins 3D, construção, tempestade e multiplayer por WebSocket). Veja o [README dele](battle-royale/README.md): `cd battle-royale && npm install && npm start`.
