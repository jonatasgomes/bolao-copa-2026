# CLAUDE.md — Bolão da Copa 2026

## O que é este projeto

Aplicação web de bolão (pool de apostas) para a Copa do Mundo FIFA 2026, focada no mata-mata (jogos 73–104). Jogadores cadastram palpites nos placares dos jogos e acumulam pontos conforme a precisão. É uma ferramenta social de uso doméstico/familiar, com ~10 participantes previstos.

---

## Stack Técnica

| Camada | Tecnologia | Versão mínima |
|--------|-----------|---------------|
| Runtime | Node.js (CommonJS) | **v22.5+** (obrigatório — usa `node:sqlite` nativo) |
| Backend | Express 5 + express-session | 5.2.x / 1.19.x |
| Banco de dados | SQLite via `node:sqlite` (`DatabaseSync`) | Embutido no Node 22.5+ |
| Frontend | HTML + Vanilla CSS + Vanilla JS (SPA-like) | — |
| Gerenciamento de processos | PM2 | 7.x |
| Proxy reverso / TLS | Caddy | 2.x |

> **Não há framework frontend**, bundler, TypeScript, nem ORMs. Todo o frontend é servido como arquivos estáticos de `public/`.

---

## Estrutura do Repositório

```
bolao-copa-2026/
├── server.js          # Backend Express: rotas API, sync service (TheSportsDB), scoring, bracket propagation
├── db.js              # Inicialização do SQLite, schema (3 tabelas), helpers de hash/senha
├── seed.js            # Semeadura do banco: admin + 32 jogos do mata-mata (J73–J104)
├── reset-match.js     # Manutenção: reverte um jogo finalizado para pendente (placar, pontos e chave)
├── set-score.js       # Manutenção: lança/corrige o placar oficial de um jogo via CLI
├── package.json       # Dependências: express, express-session
├── .gitignore         # Ignora node_modules/, *.db, .env, logs, IDE
├── bolao.db           # Banco SQLite gerado em runtime (NÃO versionado)
├── public/
│   ├── index.html     # SPA: login, troca de senha, header fixo unificado (3 abas + menu hamburguer)
│   ├── app.js         # Toda a lógica do frontend (troca de abas, palpites, sync de UI)
│   ├── styles.css     # CSS completo com glassmorphism, responsivo, modais
│   └── assets/        # Imagens estáticas (banners, lendas)
└── README.md          # Documentação do projeto
```

> Os scripts de manutenção (`reset-match.js`, `set-score.js`) escrevem direto no SQLite — rode-os com o servidor **parado** (`pm2 stop`), pois o `node:sqlite` não aceita acesso concorrente.

### Tabelas do Banco (SQLite)

| Tabela | Propósito |
|--------|-----------|
| `users` | Jogadores e admin. Campos: `username`, `password_hash`, `salt`, `role` (admin/player), `must_change_password` |
| `matches` | 32 jogos do mata-mata (IDs 73–104). Campos: `round`, `match_date`, `venue`, `home_team`, `away_team`, `home_score`, `away_score`, `penalty_winner`, `status` |
| `bets` | Palpites. UNIQUE(user_id, match_id). Campos: `home_score`, `away_score`, `penalty_winner`, `points_earned` |

---

## Comandos

### Instalação
```bash
npm install
```

### Semeadura do banco (primeira vez ou reset)
```bash
node seed.js
```
Cria o banco `bolao.db`, insere o admin (`admin` / `admin123`) e os 32 jogos. É idempotente: não duplica registros existentes.

### Execução local (desenvolvimento)
```bash
node server.js
# ou com porta custom:
PORT=3000 node server.js
```
Acessa em `http://localhost:3000` (ou a porta definida em `PORT`).

### Testes
Não há suite de testes formal (`npm test` retorna erro). Os testes de integração são scripts avulsos executados manualmente (não versionados).

### Scripts de manutenção
```bash
# Reverter um jogo finalizado para pendente (limpa placar, pontos e chave)
node reset-match.js <id> [<id> ...]

# Lançar/corrigir o placar oficial de um jogo (4º arg só em empate: home|away)
node set-score.js <id> <golsCasa> <golsFora> [home|away]
```
> Rode com o servidor **parado**. Em produção:
> `pm2 stop bolao-copa-2026 && node <script> ... && PORT=3001 pm2 restart bolao-copa-2026 --update-env`

---

## Convenções do Código

### Backend (`server.js`)
- **Rotas API** seguem o padrão REST sob `/api/`:
  - Públicas: `/api/public/*` (sem auth)
  - Autenticadas: middleware `requireAuth` + `requirePasswordChangeCheck`
  - Admin: middleware adicional `requireAdmin`
- **Sessões** são gerenciadas por `express-session` em memória (sem store externo).
- **Senhas** usam PBKDF2 com salt aleatório (1000 iterações, SHA-512).
- **Scoring** é centralizado na função `calculatePoints()`.
- **Propagação de chaves** usa o mapa `bracketProgression` que liga cada jogo ao próximo na chave.

### Frontend (`public/app.js`)
- SPA-like com alternância de seções via `showSection()` e de abas via `activateTab()`.
- Header fixo unificado: 3 abas na toolbar (Jogos, Ranking, Grade) + menu hamburguer (Regras, Painel Admin, troca de senha, sair).
- A aba **Jogos** rola sozinha até o dia de hoje ao abrir (`scrollMatchesToToday()`).
- Auto-refresh a cada 15s na aba ativa (lê `.view-panel.active`).
- Rascunhos locais (`localDrafts`) preservam inputs durante refresh.
- Bandeiras de países mapeadas via `getFlag()` (emoji unicode).

### Timezone
- Datas dos jogos são armazenadas no banco como strings **ET (Eastern Time / UTC-4)**: `'YYYY-MM-DD HH:MM'`.
- **Backend**: `isMatchClosed()` appenda `-04:00` ao interpretar as datas.
- **Frontend**: `formatMatchDate()` converte de ET para o timezone local do navegador via `Intl.DateTimeFormat`.

### Idioma
- Todo o código de interface e mensagens de erro está em **português brasileiro**.
- Nomes de variáveis, funções e comentários misturam português e inglês.

---

## Regras de Pontuação

| Pontos | Condição |
|--------|----------|
| **10** | Placar exato (incluindo acertar quem avança nos pênaltis se empate) |
| **7** | Acertou vencedor + saldo de gols exato; OU acertou empate mas errou pênaltis; OU acertou que seria empate com placar diferente e acertou pênaltis |
| **5** | Acertou apenas o vencedor; OU acertou empate com placar e pênaltis incorretos |
| **0** | Errou tudo |

---

## Rotas da API

### Públicas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/public/users` | Lista usernames dos jogadores (para dropdown de login) |

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/login` | Login (username + password) |
| POST | `/api/logout` | Encerra sessão |
| POST | `/api/change-password` | Troca de senha (voluntária exige `currentPassword`) |
| GET | `/api/me` | Retorna dados do usuário logado |

### Jogador (autenticado)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/matches` | Lista jogos + palpites do jogador + palpites revelados |
| POST | `/api/bets` | Salvar/remover palpite (campos vazios = deletar) |
| GET | `/api/ranking` | Classificação geral |
| GET | `/api/bets/matrix` | Grade comparativa de apostas |

### Admin
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/admin/players` | Cadastrar jogador |
| GET | `/api/admin/players` | Listar jogadores |
| POST | `/api/admin/matches/score` | Lançar/atualizar placar oficial |
| GET | `/api/admin/sync/status` | Status da sincronização |
| POST | `/api/admin/sync/config` | Configurar URL/headers de sync |
| POST | `/api/admin/sync/trigger` | Disparar sincronização manual |

---

## Sincronização de Placares (atualização automática)

- **Fonte padrão**: [TheSportsDB](https://www.thesportsdb.com) (gratuita, sem chave) — jogos encerrados da Copa (liga **4429**). Configurável pela env `SYNC_URL` ou pelo painel admin.
- **Parser**: `parseExternalMatches()` reconhece vários formatos (TheSportsDB, API-Football, football-data.org, openfootball) e casa cada jogo pelo **nome dos times** via `matchTeams()` (traduz EN→PT e ignora a ordem mando/visitante).
- **Agendador**: roda uma vez no **startup** (catch-up) e a cada **5 min durante a janela de cada jogo** (de 15 min antes até 3,5 h após o início). Fora das janelas, só uma rotina diária às 02:00.
- **Segurança** (lição do mock removido): só lança jogos **realmente encerrados e com vencedor definido**. **Empates (pênaltis) são pulados** — a fonte gratuita não traz o classificado da disputa — e ficam para lançamento manual (painel admin ou `set-score.js`). O sync **nunca apaga** um lançamento manual.
- **Pênaltis automáticos**: troque `SYNC_URL` para uma fonte com placar de pênaltis (ex.: football-data.org, com a chave em `X-Auth-Token` nos headers do sync) — o parser correspondente já existe.

---

## Limites e Restrições Conhecidas

- **Sessões em memória**: reiniciar o servidor desloga todos os usuários.
- **Session secret hardcoded** no código (`copa2026-brasil-hexa-secret`).
- **SQLite single-file**: não suporta acesso concorrente de múltiplos processos.
- **Sem CDN**: assets estáticos servidos diretamente pelo Express.
- **Sem testes automatizados** no CI/CD — apenas scripts manuais.
- **`node:sqlite` é experimental** (Node.js imprime warning no startup).
- **Banco não versionado** (`.gitignore` exclui `*.db`) — backup manual.
- **Pênaltis não sincronizam** automaticamente (a fonte gratuita não traz o classificado da disputa) — empates de mata-mata precisam de lançamento manual.
