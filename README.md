# 🏆 Bolão da Copa do Mundo 2026 🇧🇷

Este é um aplicativo web completo para gerenciamento de bolão da Copa do Mundo de 2026 (focado nas fases eliminatórias de mata-mata em diante). O projeto foi desenvolvido sob medida para uso familiar e entre amigos, apresentando uma interface responsiva, moderna e visualmente inspirada nas cores da Seleção Brasileira (Verde e Amarelo).

---

## ✨ Funcionalidades Principais

*   **👥 Seletor de Usuários no Login**: Login extremamente amigável para celular, permitindo selecionar o participante a partir de um dropdown, dispensando digitação manual.
*   **🔒 Gerenciamento de Senhas**: Exigência obrigatória de alteração de senha padrão no primeiro login dos usuários.
*   **📊 Aba "Grade de Apostas" (Matriz Geral)**: Uma tabela cruzada exibindo todos os palpites dos participantes por partida. Palpites ativos ficam ocultados por um cadeado (`🔒`) para evitar cópias e são revelados automaticamente assim que o jogo é finalizado.
*   **⚽ Classificados e Chaveamento Automático**: O sistema atualiza o chaveamento das fases seguintes de forma 100% autônoma, substituindo os placeholders (ex: `Vencedor J76`) pelos nomes reais das seleções vencedoras.
*   **🔄 Sincronizador Híbrido de Placares**:
    *   **JSON APIs**: Suporta leitura direta de APIs profissionais como *API-Football (api-sports.io)* e *football-data.org*.
    *   **Web Scraping**: Motor inteligente que lê dados em formato textual ou HTML de sites de esportes, buscando padrões e traduzindo nomes de equipes.
    *   **Sobrescrita e Reversão**: Corrige automaticamente placares incorretos cadastrados por engano e desfaz chaveamentos/limpa apostas se um jogo futuro for indevidamente marcado como encerrado.
*   **⏱️ Agendador Inteligente (Anti-Bloqueio)**: Verifica se há jogos programados para o momento atual. Entra em modo ativo (sincronização a cada 5 minutos) apenas durante as partidas e suspende chamadas em horários inativos, poupando créditos de APIs gratuitas.
*   **📱 Design Responsivo Premium**: Interface adaptada para smartphones (onde ocorre 90% do acesso dos participantes), com rolagem lateral de matriz, cards otimizados e abas responsivas.

---

## 🛠️ Tecnologia Utilizada

*   **Backend**: Node.js, Express, Express-Session.
*   **Banco de Dados**: SQLite local através do módulo nativo `node:sqlite` (DatabaseSync) para estabilidade e consistência transacional SQL.
*   **Frontend**: HTML5, CSS3 Customizado (Glassmorphic & CSS Variables) e JavaScript puro (Vanilla).

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
*   Node.js instalado (Versão 22 ou superior, que suporta nativamente `node:sqlite`).

### Passo a Passo

1.  **Instalar Dependências**:
    ```bash
    npm install
    ```

2.  **Inicializar o Banco de Dados (Seed)**:
    Este comando cria as tabelas e insere os jogos oficiais das rodadas de mata-mata (a partir dos 32 avos de final):
    ```bash
    node seed.js
    ```

3.  **Iniciar o Servidor**:
    ```bash
    node server.js
    ```

4.  **Acessar a Aplicação**:
    Abra o navegador e digite: [http://localhost:3000](http://localhost:3000)

---

## 🔑 Credenciais Iniciais de Administrador

*   **Usuário**: Selecione `admin` no dropdown.
*   **Senha padrão**: `admin123` *(O sistema solicitará a troca de senha no primeiro login).*

No Painel Administrativo, você poderá cadastrar novos jogadores (com a senha inicial padrão `123456`) e configurar as chaves ou endpoints de integração de placares.

---

## 📁 Estrutura de Diretórios

```text
├── bolao.db             # Banco de dados SQLite local
├── db.js                # Inicialização e exports do DatabaseSync do SQLite
├── seed.js              # Script para resetar e popular o banco com as partidas oficiais
├── server.js            # Servidor HTTP Express e endpoints REST de sincronização/regras
├── package.json         # Dependências do projeto e scripts
├── public/
│   ├── index.html       # Estrutura HTML5 da Single Page Application (SPA)
│   ├── styles.css       # Design System responsivo, variáveis CSS e efeitos glassmorphism
│   ├── app.js           # Lógica do cliente, rascunhos de palpites locais e requisições assíncronas
│   └── assets/          # Bandeiras, ícones e mídias
```

---

Desenvolvido para o Bolão Oficial da Copa do Mundo de 2026. Rumo ao Hexa! 🇧🇷⭐️⭐️⭐️⭐️⭐️⭐️
