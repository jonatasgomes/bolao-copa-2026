// Mapeamento de emojis de bandeiras de países
const flags = {
  'África do Sul': '🇿🇦',
  'Canadá': '🇨🇦',
  'Alemanha': '🇩🇪',
  'Paraguai': '🇵🇾',
  'Holanda': '🇳🇱',
  'Marrocos': '🇲🇦',
  'Brasil': '🇧🇷',
  'Japão': '🇯🇵',
  'Espanha': '🇪🇸',
  'Áustria': '🇦🇹',
  'Portugal': '🇵🇹',
  'Croácia': '🇭🇷',
  'México': '🇲🇽',
  'Equador': '🇪🇨',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'RD Congo': '🇨🇩',
  'Bélgica': '🇧🇪',
  'Senegal': '🇸🇳',
  'Estados Unidos': '🇺🇸',
  'Bósnia e Herzegovina': '🇧🇦',
  'Suíça': '🇨🇭',
  'Argélia': '🇩🇿',
  'Austrália': '🇦🇺',
  'Egito': '🇪🇬',
  'Argentina': '🇦🇷',
  'Cabo Verde': '🇨🇻',
  'Colômbia': '🇨🇴',
  'Gana': '🇬🇭',
  'Costa do Marfim': '🇨🇮',
  'Noruega': '🇳🇴',
  'França': '🇫🇷',
  'Suécia': '🇸🇪'
};

// Obter a bandeira de um time
function getFlag(teamName) {
  if (!teamName) return '❓';
  if (teamName.startsWith('Vencedor') || teamName.startsWith('Perdedor')) {
    return '🏆';
  }
  return flags[teamName] || '🏳️';
}

// Formatar datas para exibição legível
function formatMatchDate(dateStr) {
  // dateStr está em 'YYYY-MM-DD HH:MM'
  const parts = dateStr.split(' ');
  const dateParts = parts[0].split('-');
  const time = parts[1];
  return `${dateParts[2]}/${dateParts[1]} - ${time}`;
}

// Variáveis de Estado Global do Frontend
let currentUser = null;
let autoRefreshInterval = null;
let localDrafts = {}; // { matchId: { home_score, away_score, penalty_winner } }

// Elementos da Interface
const loginSection = document.getElementById('login-section');
const changePasswordSection = document.getElementById('change-password-section');
const mainApp = document.getElementById('main-app');
const toastEl = document.getElementById('toast');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

// Toast Notification Helper
function showToast(message, isError = false) {
  toastEl.innerText = message;
  toastEl.style.display = 'block';
  if (isError) {
    toastEl.style.backgroundColor = 'rgba(239, 68, 68, 0.95)';
    toastEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    toastEl.style.color = '#ffffff';
  } else {
    toastEl.style.backgroundColor = 'rgba(16, 185, 129, 0.95)';
    toastEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    toastEl.style.color = '#ffffff';
  }
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, 3500);
}

// 1. Verificar Autenticação
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    
    if (data.loggedIn) {
      currentUser = data;
      if (currentUser.mustChangePassword) {
        showSection('change-password');
      } else {
        showSection('app');
        initializeDashboard();
      }
    } else {
      showSection('login');
    }
  } catch (err) {
    console.error('Erro na autenticação:', err);
    showSection('login');
  }
}

// Exibir seções específicas
function showSection(sectionName) {
  loginSection.style.display = 'none';
  changePasswordSection.style.display = 'none';
  mainApp.style.display = 'none';

  if (sectionName === 'login') {
    loginSection.style.display = 'flex';
    stopAutoRefresh();
    loadLoginUsers();
  } else if (sectionName === 'change-password') {
    changePasswordSection.style.display = 'flex';
    stopAutoRefresh();
  } else if (sectionName === 'app') {
    mainApp.style.display = 'block';
    startAutoRefresh();
  }
}

// Iniciar atualização periódica leve
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  // Atualiza a cada 15 segundos
  autoRefreshInterval = setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    if (activeTab === 'matches-view') {
      loadMatches();
    } else if (activeTab === 'ranking-view') {
      loadRanking();
    } else if (activeTab === 'matrix-view') {
      loadMatrix();
    }
  }, 15000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// Configurar escutas de eventos (forms e cliques)
function setupEventListeners() {
  // Login Form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        errorEl.innerText = data.error || 'Erro ao realizar login.';
        errorEl.style.display = 'block';
        return;
      }

      currentUser = data;
      if (currentUser.mustChangePassword) {
        showSection('change-password');
      } else {
        showSection('app');
        initializeDashboard();
      }
    } catch (err) {
      errorEl.innerText = 'Erro ao conectar ao servidor.';
      errorEl.style.display = 'block';
    }
  });

  // Change Password Form
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('change-password-error');
    errorEl.style.display = 'none';

    if (newPassword !== confirmPassword) {
      errorEl.innerText = 'As senhas não coincidem.';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        errorEl.innerText = data.error || 'Erro ao alterar a senha.';
        errorEl.style.display = 'block';
        return;
      }

      showToast('Senha alterada com sucesso!');
      currentUser.mustChangePassword = false;
      showSection('app');
      initializeDashboard();
    } catch (err) {
      errorEl.innerText = 'Erro de rede.';
      errorEl.style.display = 'block';
    }
  });

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      currentUser = null;
      showSection('login');
      showToast('Sessão encerrada.');
    } catch (err) {
      console.error(err);
    }
  });

  // Tabs de Navegação
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(targetTab).classList.add('active');

      // Salvar a aba ativa no localStorage
      localStorage.setItem('bolao_active_tab', targetTab);

      // Carregar os dados específicos de cada aba
      if (targetTab === 'matches-view') {
        loadMatches();
      } else if (targetTab === 'ranking-view') {
        loadRanking();
      } else if (targetTab === 'matrix-view') {
        loadMatrix();
      } else if (targetTab === 'admin-view') {
        loadAdminPanel();
      }
    });
  });

  // Admin: Cadastrar jogador
  document.getElementById('admin-add-player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('new-player-name').value;
    const password = document.getElementById('new-player-password').value;

    try {
      const res = await fetch('/api/admin/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Erro ao cadastrar jogador.', true);
        return;
      }

      showToast(data.message);
      document.getElementById('new-player-name').value = '';
      document.getElementById('new-player-password').value = 'Brasil2026';
      loadAdminPlayersList();
      loadLoginUsers();
    } catch (err) {
      showToast('Erro ao cadastrar jogador no servidor.', true);
    }
  });

  // Admin: Salvar URL de Sincronização
  document.getElementById('btn-save-sync-config').addEventListener('click', async () => {
    const url = document.getElementById('sync-url-input').value;
    const headersStr = document.getElementById('sync-headers-input').value.trim();
    let headers = {};
    
    if (headersStr) {
      try {
        headers = JSON.parse(headersStr);
      } catch (e) {
        showToast('Formato JSON de headers inválido!', true);
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, headers })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao salvar configuração.', true);
        return;
      }
      showToast(data.message);
      loadAdminSyncStatus();
    } catch (err) {
      showToast('Erro ao salvar configuração no servidor.', true);
    }
  });

  // Admin: Forçar Sincronização de Placares
  document.getElementById('btn-trigger-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-trigger-sync');
    btn.disabled = true;
    btn.innerText = 'Sincronizando...';

    try {
      const res = await fetch('/api/admin/sync/trigger', { method: 'POST' });
      const data = await res.json();
      
      btn.disabled = false;
      btn.innerText = 'Sincronizar Agora';

      if (!res.ok) {
        showToast(data.error || 'Erro ao sincronizar placares.', true);
        return;
      }

      showToast(data.message);
      loadAdminPanel(); // Recarrega jogadores, placares locais e o status
    } catch (err) {
      btn.disabled = false;
      btn.innerText = 'Sincronizar Agora';
      showToast('Erro de rede ao sincronizar placares.', true);
    }
  });
}

// Inicializar interface do Dashboard após login com sucesso
function initializeDashboard() {
  document.getElementById('user-name').innerText = currentUser.username;
  document.getElementById('user-avatar').innerText = currentUser.username.charAt(0).toUpperCase();
  
  if (currentUser.role === 'admin') {
    document.getElementById('user-role').innerText = 'Administrador';
    document.getElementById('admin-tab-btn').style.display = 'flex';
  } else {
    document.getElementById('user-role').innerText = 'Apostador';
    document.getElementById('admin-tab-btn').style.display = 'none';
  }

  // Ativa a aba salva no localStorage ou a padrão se não houver
  const savedTab = localStorage.getItem('bolao_active_tab');
  let targetTab = savedTab || 'matches-view';
  
  if (targetTab === 'admin-view' && currentUser.role !== 'admin') {
    targetTab = 'matches-view';
  }

  const tabToClick = document.querySelector(`[data-tab="${targetTab}"]`);
  if (tabToClick) {
    tabToClick.click();
  } else {
    document.querySelector('[data-tab="matches-view"]').click();
  }
}

// ==========================================
// CARREGAR DADOS DOS JOGOS E APOSTAS
// ==========================================
async function loadMatches() {
  const container = document.getElementById('matches-container');
  try {
    const res = await fetch('/api/matches');
    const matches = await res.json();

    container.innerHTML = '';
    
    if (matches.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:2rem; grid-column: 1/-1;">Nenhum jogo cadastrado.</div>`;
      return;
    }

    matches.forEach(match => {
      const card = document.createElement('div');
      card.className = `match-card ${match.closed ? 'is-closed' : ''} ${match.status === 'finished' ? 'is-finished' : ''}`;
      
      const homeFlag = getFlag(match.home_team);
      const awayFlag = getFlag(match.away_team);
      const matchDateStr = formatMatchDate(match.match_date);

      // Status Tag HTML
      let statusTag = '';
      if (match.status === 'finished') {
        statusTag = `<span class="match-status status-finished">Encerrado</span>`;
      } else if (match.closed) {
        statusTag = `<span class="match-status status-closed">Ao Vivo / Bloqueado</span>`;
      } else {
        statusTag = `<span class="match-status status-pending">Aberto</span>`;
      }

      // Palpites atuais do usuário (lê do rascunho local se houver, senão do banco)
      const draft = localDrafts[match.id];
      const myBetHome = draft ? draft.home_score : (match.myBet ? match.myBet.home_score : '');
      const myBetAway = draft ? draft.away_score : (match.myBet ? match.myBet.away_score : '');
      const myBetPen = draft ? draft.penalty_winner : (match.myBet ? match.myBet.penalty_winner : null);

      // Pênaltis HTML se palpite for empate
      const isDrawBet = myBetHome !== '' && myBetAway !== '' && parseInt(myBetHome, 10) === parseInt(myBetAway, 10);

      // HTML do card
      let html = `
        <div class="match-header">
          <span class="match-id">Jogo ${match.id}</span>
          <span>${matchDateStr}</span>
          ${statusTag}
        </div>
        <div style="font-size:0.8rem; text-align:center; color:var(--text-muted); margin-bottom:0.5rem;">${match.venue}</div>
        
        <div class="match-teams-row">
          <div class="team">
            <span class="team-flag">${homeFlag}</span>
            <span class="team-name" title="${match.home_team}">${match.home_team}</span>
          </div>
          <div class="match-vs">VS</div>
          <div class="team">
            <span class="team-flag">${awayFlag}</span>
            <span class="team-name" title="${match.away_team}">${match.away_team}</span>
          </div>
        </div>
      `;

      // Se o jogo está finalizado, mostra o placar oficial
      if (match.status === 'finished') {
        const penText = match.penalty_winner 
          ? ` (Pênaltis: ${match.penalty_winner === 'home' ? match.home_team : match.away_team})` 
          : '';
        html += `
          <div class="official-score-display">
            Placar Oficial
            <div class="score-number">${match.home_score} x ${match.away_score}${penText}</div>
          </div>
        `;
      }

      // Área de Palpites do próprio jogador (se for jogador comum e não administrador)
      const isBetEditable = !match.closed && match.status !== 'finished';
      const ptsEarned = (match.status === 'finished' && match.myBet) ? `${match.myBet.points_earned} PTS` : '';

      if (currentUser.role === 'admin') {
        html += `
          <div class="bet-box" style="border: 1px dashed var(--glass-border); background: transparent; padding: 0.8rem 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">
              Administradores não fazem apostas.
            </span>
          </div>
        `;
      } else {
        html += `
          <div class="bet-box">
            <div class="bet-box-header">
              <span>Meu Palpite</span>
              <span class="pts-earned">${ptsEarned}</span>
            </div>
            <div class="bet-inputs-row">
              <input type="number" min="0" class="bet-input home-input" value="${myBetHome}" ${isBetEditable ? '' : 'disabled'} data-match-id="${match.id}">
              <span class="bet-divider">x</span>
              <input type="number" min="0" class="bet-input away-input" value="${myBetAway}" ${isBetEditable ? '' : 'disabled'} data-match-id="${match.id}">
              
              <button class="btn-save-bet" data-match-id="${match.id}" style="margin-left: 0.5rem; display: ${isBetEditable ? 'inline-block' : 'none'};">Salvar</button>
            </div>
            
            <!-- Seleção de pênaltis de desempate se for empate -->
            <div class="penalty-bet-box" id="pen-box-${match.id}" style="display: ${isDrawBet ? 'flex' : 'none'};">
              <label>Quem avança nos Pênaltis?</label>
              <div class="penalty-options">
                <button class="penalty-btn penalty-home ${myBetPen === 'home' ? 'selected' : ''}" 
                  ${isBetEditable ? '' : 'disabled'} 
                  data-match-id="${match.id}" data-winner="home">
                  ${match.home_team}
                </button>
                <button class="penalty-btn penalty-away ${myBetPen === 'away' ? 'selected selected-away' : ''}" 
                  ${isBetEditable ? '' : 'disabled'} 
                  data-match-id="${match.id}" data-winner="away">
                  ${match.away_team}
                </button>
              </div>
            </div>
          </div>
        `;
      }

      // Se o jogo estiver fechado, mostra apostas de outros jogadores
      if (match.closed) {
        html += `
          <div class="other-bets-section">
            <h4>Apostas dos Adversários</h4>
            <div class="other-bets-list">
        `;
        
        if (match.otherBets && match.otherBets.length > 0) {
          match.otherBets.forEach(ob => {
            const obPenText = ob.penalty_winner 
              ? ` (${ob.penalty_winner === 'home' ? match.home_team : match.away_team})` 
              : '';
            const pointsTag = match.status === 'finished' 
              ? `<span class="pts-tag">+${ob.points_earned} pts</span>` 
              : '';
            html += `
              <div class="other-bet-item">
                <span class="player-name">${ob.username}</span>
                <span class="player-score">${ob.home_score} x ${ob.away_score}${obPenText}</span>
                ${pointsTag}
              </div>
            `;
          });
        } else {
          html += `<div style="font-size:0.75rem; color:var(--text-muted); text-align:center;">Nenhum adversário apostou neste jogo.</div>`;
        }
        
        html += `
            </div>
          </div>
        `;
      }

      card.innerHTML = html;
      container.appendChild(card);
    });

    // Anexar eventos aos novos inputs/botões inseridos na tela
    attachBetEventListeners();

  } catch (err) {
    console.error('Erro ao buscar jogos:', err);
    container.innerHTML = `<div style="color:#f87171; text-align:center; padding:2rem;">Erro ao carregar os jogos do servidor.</div>`;
  }
}

// Configurar escutas de eventos específicos nos cartões de aposta
function attachBetEventListeners() {
  // Inputs de placar do palpite
  const homeInputs = document.querySelectorAll('.home-input');
  const awayInputs = document.querySelectorAll('.away-input');

  const onScoreChange = (matchId) => {
    const homeVal = document.querySelector(`.home-input[data-match-id="${matchId}"]`).value;
    const awayVal = document.querySelector(`.away-input[data-match-id="${matchId}"]`).value;
    const penBox = document.getElementById(`pen-box-${matchId}`);
    
    // Recuperar vencedor de pênaltis selecionado no rascunho anterior
    const selectedBtn = document.querySelector(`#pen-box-${matchId} .penalty-btn.selected`);
    const penaltyWinner = selectedBtn ? selectedBtn.dataset.winner : null;

    // Atualizar rascunho local
    localDrafts[matchId] = {
      home_score: homeVal,
      away_score: awayVal,
      penalty_winner: penaltyWinner
    };

    if (homeVal !== '' && awayVal !== '' && parseInt(homeVal, 10) === parseInt(awayVal, 10)) {
      penBox.style.display = 'flex';
    } else {
      penBox.style.display = 'none';
      if (localDrafts[matchId]) {
        localDrafts[matchId].penalty_winner = null;
      }
      penBox.querySelectorAll('.penalty-btn').forEach(btn => btn.classList.remove('selected', 'selected-away'));
    }
  };

  homeInputs.forEach(input => {
    input.addEventListener('input', () => onScoreChange(input.dataset.matchId));
  });

  awayInputs.forEach(input => {
    input.addEventListener('input', () => onScoreChange(input.dataset.matchId));
  });

  // Botões de pênalti
  const penBtns = document.querySelectorAll('.penalty-btn');
  penBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const matchId = btn.dataset.matchId;
      const winner = btn.dataset.winner;
      const parent = btn.parentElement;

      parent.querySelectorAll('.penalty-btn').forEach(b => b.classList.remove('selected', 'selected-away'));
      
      if (winner === 'home') {
        btn.classList.add('selected');
      } else {
        btn.classList.add('selected', 'selected-away');
      }
      
      btn.dataset.selected = 'true';

      // Atualizar rascunho local
      const homeVal = document.querySelector(`.home-input[data-match-id="${matchId}"]`).value;
      const awayVal = document.querySelector(`.away-input[data-match-id="${matchId}"]`).value;
      localDrafts[matchId] = {
        home_score: homeVal,
        away_score: awayVal,
        penalty_winner: winner
      };
    });
  });

  // Botões de salvar aposta
  const saveBtns = document.querySelectorAll('.btn-save-bet');
  saveBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.matchId;
      const homeScore = document.querySelector(`.home-input[data-match-id="${matchId}"]`).value;
      const awayScore = document.querySelector(`.away-input[data-match-id="${matchId}"]`).value;

      const isHomeEmpty = homeScore.trim() === '';
      const isAwayEmpty = awayScore.trim() === '';

      if (isHomeEmpty && isAwayEmpty) {
        // Remover aposta
        try {
          const res = await fetch('/api/bets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              match_id: parseInt(matchId, 10),
              home_score: '',
              away_score: '',
              penalty_winner: null
            })
          });

          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || 'Erro ao remover palpite.', true);
            return;
          }

          showToast('Palpite removido com sucesso!');
          delete localDrafts[matchId]; // Limpar rascunho salvo
          loadMatches(); // Recarregar jogos
        } catch (err) {
          showToast('Erro ao se conectar ao servidor.', true);
        }
        return;
      }

      if (isHomeEmpty || isAwayEmpty) {
        showToast('Para preencher o palpite, ambos os placares devem ser informados. Para remover o palpite, deixe ambos vazios.', true);
        return;
      }

      let penaltyWinner = null;
      if (parseInt(homeScore, 10) === parseInt(awayScore, 10)) {
        const selectedBtn = document.querySelector(`#pen-box-${matchId} .penalty-btn.selected`);
        if (!selectedBtn) {
          showToast('Empate detectado! Selecione quem avança nos pênaltis.', true);
          return;
        }
        penaltyWinner = selectedBtn.dataset.winner;
      }

      try {
        const res = await fetch('/api/bets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: parseInt(matchId, 10),
            home_score: parseInt(homeScore, 10),
            away_score: parseInt(awayScore, 10),
            penalty_winner: penaltyWinner
          })
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Erro ao salvar palpite.', true);
          return;
        }

        showToast(data.message);
        delete localDrafts[matchId]; // Limpar rascunho salvo
        loadMatches(); // Recarregar jogos para atualizar estado
      } catch (err) {
        showToast('Erro ao se conectar ao servidor.', true);
      }
    });
  });
}

// ==========================================
// ABA DE CLASSIFICAÇÃO / RANKING
// ==========================================
async function loadRanking() {
  const container = document.getElementById('ranking-container');
  try {
    const res = await fetch('/api/ranking');
    const ranking = await res.json();

    container.innerHTML = '';

    if (ranking.length === 0) {
      container.innerHTML = `<tr><td colspan="3" style="text-align:center;">Nenhum jogador cadastrado para o ranking.</td></tr>`;
      return;
    }

    ranking.forEach((player, index) => {
      const row = document.createElement('tr');
      
      let rankBadge = '';
      if (index === 0) {
        rankBadge = `<span class="rank-badge gold">1º</span>`;
      } else if (index === 1) {
        rankBadge = `<span class="rank-badge silver">2º</span>`;
      } else if (index === 2) {
        rankBadge = `<span class="rank-badge bronze">3º</span>`;
      } else {
        rankBadge = `${index + 1}º`;
      }

      row.innerHTML = `
        <td class="rank-col">${rankBadge}</td>
        <td class="player-col">${player.username}</td>
        <td class="points-col">${player.total_points} PTS</td>
      `;

      container.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#f87171;">Erro ao carregar classificação.</td></tr>`;
  }
}

// ==========================================
// FUNÇÕES DO PAINEL DO ADMINISTRADOR (ADMIN)
// ==========================================
function loadAdminPanel() {
  loadAdminPlayersList();
  loadAdminMatchesList();
  loadAdminSyncStatus();
}

async function loadAdminPlayersList() {
  const container = document.getElementById('admin-players-list');
  try {
    const res = await fetch('/api/admin/players');
    const players = await res.json();

    container.innerHTML = '';
    
    if (players.length === 0) {
      container.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:1rem;">Nenhum jogador cadastrado.</div>`;
      return;
    }

    players.forEach(p => {
      const div = document.createElement('div');
      div.className = 'admin-player-item';
      
      const pwdBadge = p.must_change_password === 1
        ? `<span class="status-badge pwd-default">Senha Padrão</span>`
        : `<span class="status-badge pwd-changed">Senha Alterada</span>`;

      div.innerHTML = `
        <span class="name">${p.username}</span>
        ${pwdBadge}
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminMatchesList() {
  const container = document.getElementById('admin-matches-container');
  try {
    const res = await fetch('/api/matches');
    const matches = await res.json();

    container.innerHTML = '';

    matches.forEach(match => {
      const item = document.createElement('div');
      item.className = 'admin-match-item';

      const homeFlag = getFlag(match.home_team);
      const awayFlag = getFlag(match.away_team);
      const matchDateStr = formatMatchDate(match.match_date);

      const isFinished = match.status === 'finished';
      const homeScoreVal = match.home_score !== null ? match.home_score : '';
      const awayScoreVal = match.away_score !== null ? match.away_score : '';
      const penaltyWinnerVal = match.penalty_winner || '';

      let html = `
        <div class="admin-match-info">
          <span class="round">${match.round} • Jogo ${match.id}</span>
          <div class="teams">${homeFlag} ${match.home_team} vs ${match.away_team} ${awayFlag}</div>
          <div class="details">${matchDateStr} • ${match.venue}</div>
        </div>
        <div class="admin-score-form">
          <input type="number" min="0" class="admin-score-input admin-home-score" 
            value="${homeScoreVal}" placeholder="Casa" data-match-id="${match.id}">
          <span style="font-weight:800; color:var(--text-muted);">x</span>
          <input type="number" min="0" class="admin-score-input admin-away-score" 
            value="${awayScoreVal}" placeholder="Fora" data-match-id="${match.id}">
          
          <!-- Seleção de pênaltis se placar for empate -->
          <div class="admin-penalty-box" id="admin-pen-box-${match.id}" style="display: ${homeScoreVal !== '' && awayScoreVal !== '' && parseInt(homeScoreVal, 10) === parseInt(awayScoreVal, 10) ? 'flex' : 'none'}; flex-direction: column; gap:0.2rem; font-size:0.75rem;">
            <select class="admin-penalty-select" style="background:#222; color:#fff; border:1px solid var(--glass-border); padding:0.2rem; border-radius:5px;" data-match-id="${match.id}">
              <option value="">-- Quem Classificou? --</option>
              <option value="home" ${penaltyWinnerVal === 'home' ? 'selected' : ''}>${match.home_team}</option>
              <option value="away" ${penaltyWinnerVal === 'away' ? 'selected' : ''}>${match.away_team}</option>
            </select>
          </div>

          <button class="btn-update-score btn-save-match-score" data-match-id="${match.id}">Salvar Placar</button>
        </div>
      `;

      item.innerHTML = html;
      container.appendChild(item);
    });

    attachAdminScoreEvents();

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color:#f87171; text-align:center; padding:1rem;">Erro ao buscar jogos.</div>`;
  }
}

function attachAdminScoreEvents() {
  const homeScores = document.querySelectorAll('.admin-home-score');
  const awayScores = document.querySelectorAll('.admin-away-score');

  const onAdminScoreChange = (matchId) => {
    const homeVal = document.querySelector(`.admin-home-score[data-match-id="${matchId}"]`).value;
    const awayVal = document.querySelector(`.admin-away-score[data-match-id="${matchId}"]`).value;
    const penBox = document.getElementById(`admin-pen-box-${matchId}`);

    if (homeVal !== '' && awayVal !== '' && parseInt(homeVal, 10) === parseInt(awayVal, 10)) {
      penBox.style.display = 'flex';
    } else {
      penBox.style.display = 'none';
      document.querySelector(`.admin-penalty-select[data-match-id="${matchId}"]`).value = '';
    }
  };

  homeScores.forEach(input => {
    input.addEventListener('input', () => onAdminScoreChange(input.dataset.matchId));
  });

  awayScores.forEach(input => {
    input.addEventListener('input', () => onAdminScoreChange(input.dataset.matchId));
  });

  const updateBtns = document.querySelectorAll('.btn-save-match-score');
  updateBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const matchId = btn.dataset.matchId;
      if (!matchId) return;

      const homeInput = document.querySelector(`.admin-home-score[data-match-id="${matchId}"]`);
      const awayInput = document.querySelector(`.admin-away-score[data-match-id="${matchId}"]`);
      if (!homeInput || !awayInput) return;

      const homeScore = homeInput.value;
      const awayScore = awayInput.value;
      
      if (homeScore === '' || awayScore === '') {
        showToast('Preencha os dois placares antes de atualizar!', true);
        return;
      }

      let penaltyWinner = null;
      if (parseInt(homeScore, 10) === parseInt(awayScore, 10)) {
        const select = document.querySelector(`.admin-penalty-select[data-match-id="${matchId}"]`);
        penaltyWinner = select.value;
        if (!penaltyWinner) {
          showToast('Defina o vencedor nos pênaltis para o empate!', true);
          return;
        }
      }

      try {
        const res = await fetch('/api/admin/matches/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: parseInt(matchId, 10),
            home_score: parseInt(homeScore, 10),
            away_score: parseInt(awayScore, 10),
            penalty_winner: penaltyWinner
          })
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Erro ao salvar placar.', true);
          return;
        }

        showToast(data.message);
        loadAdminMatchesList(); // Atualizar visualização do admin
      } catch (err) {
        showToast('Erro na conexão com o servidor.', true);
      }
    });
  });
}

// ==========================================
// ABA DE GRADE GERAL DE APOSTAS
// ==========================================
async function loadMatrix() {
  const headerRow = document.getElementById('matrix-header-row');
  const container = document.getElementById('matrix-container');

  try {
    const res = await fetch('/api/bets/matrix');
    const data = await res.json();

    const { players, matrix } = data;

    // 1. Renderizar cabeçalho da tabela
    let headerHtml = `<th style="text-align:left; padding: 1rem;">Jogo</th>`;
    players.forEach(p => {
      headerHtml += `<th style="text-align:center; padding: 1rem; text-transform: capitalize; min-width: 80px;">${p}</th>`;
    });
    headerRow.innerHTML = headerHtml;

    // 2. Renderizar linhas (jogos)
    container.innerHTML = '';
    if (matrix.length === 0) {
      container.innerHTML = `<tr><td colspan="${players.length + 1}" style="text-align:center; padding: 1rem;">Nenhum jogo disponível.</td></tr>`;
      return;
    }

    matrix.forEach(match => {
      const row = document.createElement('tr');
      
      const homeFlag = getFlag(match.home_team);
      const awayFlag = getFlag(match.away_team);

      let scoreText = '';
      if (match.status === 'finished') {
        let penSuffix = '';
        if (match.penalty_winner) {
          const penWinnerName = match.penalty_winner === 'home' ? match.home_team : match.away_team;
          penSuffix = ` (${penWinnerName})`;
        }
        scoreText = ` <strong style="color: var(--yellow-primary); font-size: 0.9rem; background: rgba(254,224,0,0.1); padding: 0.15rem 0.35rem; border-radius: 4px; margin-left: 0.4rem;">${match.home_score}x${match.away_score}${penSuffix}</strong>`;
      }

      let cellsHtml = `
        <td style="text-align:left; font-weight:600; font-size:0.9rem; white-space:nowrap; padding: 1rem 0.8rem;">
          <span style="color:var(--yellow-primary); font-size:0.75rem; font-weight:800; background: rgba(254,224,0,0.1); padding:0.15rem 0.35rem; border-radius:4px; margin-right:0.3rem;">J${match.id}</span> 
          ${homeFlag} ${match.home_team} x ${match.away_team} ${awayFlag}
          ${scoreText}
        </td>
      `;

      players.forEach(p => {
        const betValue = match.bets[p] || '-';
        let cellStyle = 'text-align:center; font-weight:700; padding: 1rem 0.8rem;';
        
        if (betValue === '🔒') {
          cellStyle += 'color: var(--text-muted); opacity: 0.7; font-size:0.9rem;';
        } else if (betValue === '-') {
          cellStyle += 'color: var(--text-muted); font-weight:300; opacity: 0.4;';
        } else {
          cellStyle += 'color: var(--yellow-primary);';
        }

        cellsHtml += `<td style="${cellStyle}">${betValue}</td>`;
      });

      row.innerHTML = cellsHtml;
      container.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#f87171; padding:1rem;">Erro ao carregar a grade de apostas.</td></tr>`;
  }
}

// Carregar usuários no dropdown da tela de login
async function loadLoginUsers() {
  const selectEl = document.getElementById('login-username');
  if (!selectEl) return;
  try {
    const res = await fetch('/api/public/users');
    const users = await res.json();
    
    // Preservar valor selecionado se aplicável
    const previousSelection = selectEl.value;

    selectEl.innerHTML = '<option value="">Selecione o usuário...</option>';
    users.forEach(username => {
      const option = document.createElement('option');
      option.value = username;
      option.innerText = username;
      selectEl.appendChild(option);
    });

    if (users.includes(previousSelection)) {
      selectEl.value = previousSelection;
    }
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    selectEl.innerHTML = '<option value="">Erro ao carregar usuários</option>';
  }
}

// Buscar status de sincronização e atualizar tela do admin
async function loadAdminSyncStatus() {
  const urlInput = document.getElementById('sync-url-input');
  const headersInput = document.getElementById('sync-headers-input');
  const statusDisplay = document.getElementById('sync-status-display');
  if (!urlInput || !statusDisplay) return;

  try {
    const res = await fetch('/api/admin/sync/status');
    const data = await res.json();

    urlInput.value = data.syncUrl;
    if (headersInput) {
      headersInput.value = (data.syncHeaders && Object.keys(data.syncHeaders).length > 0)
        ? JSON.stringify(data.syncHeaders, null, 2)
        : '';
    }

    const status = data.status;
    if (!status.time) {
      statusDisplay.innerHTML = `
        <strong>Status:</strong> Nunca executada.<br>
        <span style="color: var(--text-muted);">Clique em 'Sincronizar Agora' para buscar placares.</span>
      `;
    } else {
      const color = status.success ? '#34d399' : '#f87171';
      const indicator = status.success ? '✅ Sucesso' : '❌ Erro';
      const formattedDate = new Date(status.time).toLocaleString('pt-BR');
      statusDisplay.innerHTML = `
        <strong>Última Sincronização:</strong><br>
        Hora: ${formattedDate}<br>
        Resultado: <span style="color: ${color}; font-weight:700;">${indicator}</span><br>
        Detalhes: ${status.message}
      `;
    }
  } catch (err) {
    console.error(err);
    statusDisplay.innerHTML = `<span style="color:#f87171;">Erro ao obter status da sincronização.</span>`;
  }
}
