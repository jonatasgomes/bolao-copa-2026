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
├── server.js          # Backend Express: rotas API, sync service, scoring, bracket propagation (~1180 linhas)
├── db.js              # Inicialização do SQLite, schema (3 tabelas), helpers de hash/senha
├── seed.js            # Semeadura do banco: admin + 32 jogos do mata-mata (J73–J104)
├── package.json       # Dependências: express, express-session
├── .gitignore         # Ignora node_modules/, *.db, .env, logs, IDE
├── bolao.db           # Banco SQLite gerado em runtime (NÃO versionado)
├── public/
│   ├── index.html     # SPA: login, troca de senha, dashboard (4 abas), modal de senha
│   ├── app.js         # Toda a lógica do frontend (~1150 linhas)
│   ├── styles.css     # CSS completo com glassmorphism, responsivo, modais
│   └── assets/        # Imagens estáticas (banners, lendas)
└── README.md          # Documentação do projeto
```

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
- SPA-like com alternância de seções via `showSection()`.
- Abas do dashboard gerenciadas por `data-tab` nos botões.
- Auto-refresh a cada 15s nas abas ativas.
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
| GET | `/api/public/mock-scores` | Endpoint de mock para testes de sincronização |

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

## Limites e Restrições Conhecidas

- **Sessões em memória**: reiniciar o servidor desloga todos os usuários.
- **Session secret hardcoded** no código (`copa2026-brasil-hexa-secret`).
- **SQLite single-file**: não suporta acesso concorrente de múltiplos processos.
- **Sem CDN**: assets estáticos servidos diretamente pelo Express.
- **Sem testes automatizados** no CI/CD — apenas scripts manuais.
- **`node:sqlite` é experimental** (Node.js imprime warning no startup).
- **Banco não versionado** (`.gitignore` exclui `*.db`) — backup manual.
