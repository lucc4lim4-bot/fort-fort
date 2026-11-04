# Fort Fort — Battle Royale 3D multiplayer

Battle royale estilo Fortnite **Reload**: ilha compacta de **400 × 400 m**, 30 jogadores por partida (humanos + bots), ônibus de batalha, planador, loot, baús, **construção** (parede / piso / rampa), colheita de materiais, tempestade que fecha rápido e **10 skins 3D** feitas à mão (código) com contorno cartoon.

## Como jogar

```bash
cd battle-royale
npm install
npm start          # http://localhost:3000
```

- **Sozinho:** abra `http://localhost:3000`, escolha nome e skin e clique em **Jogar** → **Começar agora**. Bots completam a partida.
- **Com amigos na mesma rede (Wi-Fi):** descubra o IP do seu PC (`ipconfig` / `ifconfig`) e passe `http://SEU_IP:3000`.
- **Pela internet:** rode `npm start` e exponha a porta com `npx cloudflared tunnel --url http://localhost:3000` (ou ngrok), **ou** faça deploy do servidor (há `Dockerfile` e `render.yaml`; no Render/Railway/Fly é só apontar para a pasta `battle-royale`). O endereço público é o que os amigos abrem — todos entram na mesma sala (até 16 humanos).

> O servidor precisa estar rodando (WebSocket em `/ws`), por isso não funciona no GitHub Pages.

## Controles

| Tecla | Ação |
|---|---|
| `WASD` / `Shift` / `Espaço` | mover / correr / pular (no ônibus: pular; no ar: abrir planador) |
| Mouse / botão direito | atirar / mirar (sniper tem luneta) |
| `R` · `E` | recarregar · pegar item / abrir baú |
| `1`–`6` · roda | itens (1 = picareta que colhe árvores, pedras e sucata) |
| Clique com cura/escudo na mão | usar (bandagem, kit médico, mini escudo, poção) |
| `Z` `X` `C` · `V` · `Q` | parede, piso, rampa · trocar material (madeira/tijolo/metal) · sair da construção |
| `G` · `M` · `Esc` | dançar · mapa grande · soltar o mouse |

## O que tem

- **Mapa Reload** com 8 locais: Vila Central, Fazenda Feliz, Base Militar, Porto Pescador, Fábrica Cinza, Ruínas Antigas, Torre Alta (escada em espiral de 21 m) e Subúrbio Verde — casas com portas/janelas, contêineres, silos, árvores, pedras, mar e relevo.
- **Armas** com 5 raridades: pistola, SMG, rifle de assalto, escopeta e sniper; munição por tipo; headshot; tracers e efeitos.
- **Construção** com colisão e vida por material; balas e picareta destroem as peças.
- **Tempestade** em 5 fases, ônibus de batalha, queda livre + planador.
- **Skins:** Comandante Tático, Ninja Sombra, Robô Alfa-7, Astronauta Cósmico, Dragão Rubro, Capitão Pirata, Zumbi Faminto, Cavaleiro Dourado, Gatinha Neon e Rei Abóbora (prévia 3D giratória no saguão; duplo clique faz dançar).
- **Bots** que descem do ônibus, saqueiam, lutam, se curam e fogem da tempestade.

## Arquitetura

```
battle-royale/
  server/server.js   HTTP estático + WebSocket (/ws)
  server/game.js     simulação autoritativa: partida, loot, combate, construção, tempestade, bots (30 Hz)
  shared/            dados e mundo determinístico (mesmo código no cliente e no servidor)
  public/            cliente Three.js (cena, modelos das skins, HUD, áudio sintetizado)
```

O servidor decide tiros, dano, loot, construção e tempestade. O movimento é calculado no cliente (com checagem de salto de posição no servidor) — suficiente para jogar com amigos, mas não é à prova de trapaça. Ainda não há equipes/duplas nem respawn por cartão (Reload original).
