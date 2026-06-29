# DEPLOYMENT.md — Runbook de Deploy do Bolão Copa 2026

Este documento descreve como realizar deploy, reinicialização e rollback da aplicação na VPS de produção. Assume-se **zero contexto prévio**.

---

## Infraestrutura

| Item | Valor |
|------|-------|
| **SSH alias** | `oracle-large` |
| **Provedor** | Oracle Cloud Infrastructure (OCI) |
| **SO** | Ubuntu 24.04 LTS (Noble Numbat) |
| **Timezone do SO** | UTC |
| **IP público** | `147.5.119.139` |
| **Node.js** | v22.22.3 (via NVM — requer `bash -i` ou source do nvm) |
| **NPM** | 10.9.8 |
| **Usuário SSH** | `ubuntu` |

> **Nota sobre NVM**: O Node.js é instalado via NVM. Comandos via SSH não-interativo não carregam o NVM automaticamente. Use `bash -i -c '...'` ou faça source do NVM no comando.

---

## Caminhos da Aplicação

| Item | Caminho |
|------|---------|
| **Raiz do projeto** | `/home/ubuntu/git/bolao-copa-2026` |
| **Banco de dados (SQLite)** | `/home/ubuntu/git/bolao-copa-2026/bolao.db` |
| **Logs do PM2 (stdout)** | `/home/ubuntu/.pm2/logs/bolao-copa-2026-out.log` |
| **Logs do PM2 (stderr)** | `/home/ubuntu/.pm2/logs/bolao-copa-2026-error.log` |
| **Caddyfile** | `/etc/caddy/Caddyfile` |

---

## Gerenciador de Processos — PM2

| Item | Valor |
|------|-------|
| **Nome do serviço** | `bolao-copa-2026` |
| **PM2 ID** | `2` |
| **Script** | `server.js` |
| **Modo** | `fork_mode` |
| **Porta** | `3001` (via variável `PORT`) |

---

## Proxy Reverso — Caddy

| Item | Valor |
|------|-------|
| **Domínio público** | `bolao.jonatasgomes.link` |
| **URL pública** | `https://bolao.jonatasgomes.link` |
| **TLS** | Automático via Caddy (Let's Encrypt / ZeroSSL) |
| **DNS** | Cloudflare — wildcard `*.jonatasgomes.link` aponta para o IP da VPS |
| **Porta interna** | `localhost:3001` |

Bloco do Caddyfile:
```caddy
bolao.jonatasgomes.link {
    encode zstd gzip
    reverse_proxy localhost:3001
}
```

> **Outros serviços na mesma VPS**: FinHub (porta 3000), resume (site estático). Não altere seus blocos no Caddyfile.

---

## Variáveis de Ambiente

| Variável | Propósito |
|----------|-----------|
| `PORT` | Porta HTTP do servidor Express (padrão: `3001` em produção) |

---

## Deploy Completo (do zero)

```bash
# 1. Acessar a VPS
ssh oracle-large

# 2. Clonar o repositório
cd ~/git
git clone https://github.com/jonatasgomes/bolao-copa-2026.git
cd bolao-copa-2026

# 3. Instalar dependências
npm install

# 4. Semear o banco de dados (cria bolao.db + admin + jogos)
node seed.js

# 5. Iniciar com PM2 na porta 3001
PORT=3001 pm2 start server.js --name "bolao-copa-2026"

# 6. Salvar a lista de processos do PM2 (sobrevive a reboots)
pm2 save

# 7. (Se necessário) Configurar o Caddy — editar Caddyfile
sudo nano /etc/caddy/Caddyfile
# Adicionar o bloco bolao.jonatasgomes.link (ver seção acima)
sudo systemctl reload caddy
```

---

## Deploy de Atualização (rotina)

Procedimento padrão para enviar código novo à produção:

```bash
# --- Na máquina local ---

# 1. Commit e push
git add -A && git commit -m "descrição" && git push origin main

# --- Na VPS (ou via SSH direto) ---

# 2. Pull + restart (comando único do local)
ssh oracle-large "cd ~/git/bolao-copa-2026 && git pull origin main && bash -i -c 'PORT=3001 pm2 restart bolao-copa-2026 --update-env'"
```

> **`--update-env`** é necessário para garantir que a variável `PORT=3001` seja reaplicada ao processo.

---

## Comandos Operacionais

### Status e Logs

```bash
# Ver status do processo
ssh oracle-large "bash -i -c 'pm2 status'"

# Detalhes do processo
ssh oracle-large "bash -i -c 'pm2 show bolao-copa-2026'"

# Logs em tempo real
ssh oracle-large "bash -i -c 'pm2 logs bolao-copa-2026 --lines 50'"

# Apenas log de erros
ssh oracle-large "bash -i -c 'pm2 logs bolao-copa-2026 --err --lines 50'"
```

### Reinicialização

```bash
# Restart graceful (mantém variáveis de ambiente)
ssh oracle-large "bash -i -c 'PORT=3001 pm2 restart bolao-copa-2026 --update-env'"

# Reload (zero-downtime, se aplicável)
ssh oracle-large "bash -i -c 'PORT=3001 pm2 reload bolao-copa-2026 --update-env'"

# Stop / Start
ssh oracle-large "bash -i -c 'pm2 stop bolao-copa-2026'"
ssh oracle-large "bash -i -c 'pm2 start bolao-copa-2026'"
```

### Caddy (Proxy / TLS)

```bash
# Recarregar configuração (sem downtime)
ssh oracle-large "sudo systemctl reload caddy"

# Ver status
ssh oracle-large "sudo systemctl status caddy"

# Validar Caddyfile
ssh oracle-large "caddy validate --config /etc/caddy/Caddyfile"
```

---

## Rollback

### Rollback de código (via Git)

```bash
ssh oracle-large "cd ~/git/bolao-copa-2026 && git log --oneline -5"
# Identificar o hash do commit anterior

ssh oracle-large "cd ~/git/bolao-copa-2026 && git checkout <COMMIT_HASH> -- . && bash -i -c 'PORT=3001 pm2 restart bolao-copa-2026 --update-env'"
```

Ou reverter ao commit anterior:

```bash
ssh oracle-large "cd ~/git/bolao-copa-2026 && git reset --hard HEAD~1 && bash -i -c 'PORT=3001 pm2 restart bolao-copa-2026 --update-env'"
```

### Rollback de banco de dados

O banco SQLite (`bolao.db`) **não é versionado**. Modificações no banco (migrações) precisam de rollback manual via scripts SQL.

Para backup preventivo antes de migrações:

```bash
ssh oracle-large "cp ~/git/bolao-copa-2026/bolao.db ~/git/bolao-copa-2026/bolao.db.bak"
```

Para restaurar:

```bash
ssh oracle-large "cp ~/git/bolao-copa-2026/bolao.db.bak ~/git/bolao-copa-2026/bolao.db && bash -i -c 'PORT=3001 pm2 restart bolao-copa-2026 --update-env'"
```

### Re-semeadura completa (reset do banco)

```bash
ssh oracle-large "cd ~/git/bolao-copa-2026 && rm -f bolao.db && bash -i -c 'node seed.js && PORT=3001 pm2 restart bolao-copa-2026 --update-env'"
```

> ⚠️ **CUIDADO**: Isto apaga TODOS os dados (apostas, jogadores, placares).

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| `node: command not found` via SSH | NVM não carregado | Usar `bash -i -c '...'` em todos os comandos |
| Porta 3001 em uso | Outro processo | `ssh oracle-large "bash -i -c 'lsof -i :3001'"` |
| 502 Bad Gateway no browser | PM2 caiu ou porta errada | Verificar `pm2 status` e reiniciar |
| Certificado TLS inválido | Caddy não recarregado | `sudo systemctl reload caddy` |
| `ExperimentalWarning: SQLite` | Comportamento normal do Node 22 | Ignorar; não afeta funcionalidade |
| Sessões perdidas após restart | Sessões armazenadas em memória | Esperado; usuários precisam relogar |
