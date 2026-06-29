const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, hashPassword, verifyPassword } = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'copa2026-brasil-hexa-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // false porque rodamos localmente em HTTP
    maxAge: 24 * 60 * 60 * 1000 // 1 dia
  }
}));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Helper para verificar se a partida já encerrou (bloquear palpite)
function isMatchClosed(matchDateStr) {
  // Converte 'YYYY-MM-DD HH:MM' para objeto Date
  const matchDate = new Date(matchDateStr.replace(' ', 'T') + ':00');
  return new Date() >= matchDate;
}

// Helper para verificar autenticação
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autorizado. Por favor, faça login.' });
  }
  next();
}

// Helper para verificar se precisa mudar a senha
function requirePasswordChangeCheck(req, res, next) {
  if (req.session.mustChangePassword && req.path !== '/api/change-password') {
    return res.status(403).json({ error: 'Necessário alterar a senha padrão antes de continuar.', mustChangePassword: true });
  }
  next();
}

// Helper para verificar se é Admin
function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// Listar todos os nomes de usuários registrados (público para o seletor da tela de login)
app.get('/api/public/users', (req, res) => {
  try {
    const stmt = db.prepare('SELECT username FROM users ORDER BY role ASC, username ASC');
    const users = stmt.all().map(u => u.username);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar lista de usuários.' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  username = username.trim();

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    const user = stmt.get(username);

    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    const isMatch = verifyPassword(password, user.salt, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    // Salvar sessão
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.mustChangePassword = user.must_change_password === 1;

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.must_change_password === 1
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no servidor durante o login.' });
  }
});

// Logout
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao deslogar.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout realizado com sucesso.' });
  });
});

// Mudar Senha
app.post('/api/change-password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
  }

  try {
    const { hash, salt } = hashPassword(newPassword.trim());
    const stmt = db.prepare('UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0 WHERE id = ?');
    stmt.run(hash, salt, req.session.userId);

    // Atualizar sessão
    req.session.mustChangePassword = false;

    res.json({ message: 'Senha atualizada com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar a senha.' });
  }
});

// Dados do Usuário Logado
app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    mustChangePassword: req.session.mustChangePassword
  });
});

// ==========================================
// ROTAS DE JOGOS E APOSTAS
// ==========================================

// Listar jogos e as apostas do jogador logado
app.get('/api/matches', requireAuth, requirePasswordChangeCheck, (req, res) => {
  try {
    // Listar todos os jogos
    const stmtMatches = db.prepare('SELECT * FROM matches ORDER BY id ASC');
    const matchesList = stmtMatches.all();

    // Listar palpites do próprio jogador logado
    const stmtMyBets = db.prepare('SELECT * FROM bets WHERE user_id = ?');
    const myBets = stmtMyBets.all(req.session.userId);
    const myBetsMap = {};
    myBets.forEach(bet => {
      myBetsMap[bet.match_id] = bet;
    });

    // Listar apostas de outros jogadores (apenas para jogos encerrados/fechados)
    // Para jogos abertos, não podemos vazar as apostas dos outros jogadores!
    const stmtOtherBets = db.prepare(`
      SELECT b.match_id, b.home_score, b.away_score, b.penalty_winner, b.points_earned, u.username
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE b.user_id != ?
    `);
    const otherBets = stmtOtherBets.all(req.session.userId);

    const otherBetsMap = {};
    otherBets.forEach(bet => {
      if (!otherBetsMap[bet.match_id]) {
        otherBetsMap[bet.match_id] = [];
      }
      otherBetsMap[bet.match_id].push(bet);
    });

    const result = matchesList.map(match => {
      const closed = isMatchClosed(match.match_date);
      return {
        ...match,
        closed,
        myBet: myBetsMap[match.id] || null,
        // Só retorna os palpites alheios se o jogo estiver fechado
        otherBets: closed ? (otherBetsMap[match.id] || []) : []
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar jogos.' });
  }
});

// Enviar/Atualizar um palpite
app.post('/api/bets', requireAuth, requirePasswordChangeCheck, (req, res) => {
  // Administradores não podem apostar
  if (req.session.role === 'admin') {
    return res.status(403).json({ error: 'Administradores não podem fazer apostas.' });
  }

  const { match_id, home_score, away_score, penalty_winner } = req.body;

  if (match_id === undefined || home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: 'Dados incompletos para a aposta.' });
  }

  const hScore = parseInt(home_score, 10);
  const aScore = parseInt(away_score, 10);

  if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
    return res.status(400).json({ error: 'Placares devem ser números inteiros maiores ou iguais a 0.' });
  }

  // Se empatou, precisa do vencedor dos pênaltis
  let penWinner = null;
  if (hScore === aScore) {
    if (!penalty_winner || (penalty_winner !== 'home' && penalty_winner !== 'away')) {
      return res.status(400).json({ error: 'Para palpites de empate no mata-mata, você deve escolher quem avança nos pênaltis.' });
    }
    penWinner = penalty_winner;
  }

  try {
    // Verificar se o jogo existe e se já começou ou terminou
    const stmtMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
    const match = stmtMatch.get(match_id);

    if (!match) {
      return res.status(404).json({ error: 'Jogo não encontrado.' });
    }

    if (match.status === 'finished' || isMatchClosed(match.match_date)) {
      return res.status(400).json({ error: 'As apostas para este jogo já foram encerradas!' });
    }

    // Inserir ou substituir aposta
    const stmtInsert = db.prepare(`
      INSERT INTO bets (user_id, match_id, home_score, away_score, penalty_winner, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, match_id) DO UPDATE SET
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        penalty_winner = excluded.penalty_winner,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmtInsert.run(req.session.userId, match_id, hScore, aScore, penWinner);

    res.json({ message: 'Palpite salvo com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar o palpite.' });
  }
});

// Ranking de Jogadores
app.get('/api/ranking', requireAuth, requirePasswordChangeCheck, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT u.id, u.username, COALESCE(SUM(b.points_earned), 0) as total_points
      FROM users u
      LEFT JOIN bets b ON u.id = b.user_id
      WHERE u.role = 'player'
      GROUP BY u.id
      ORDER BY total_points DESC, u.username ASC
    `);
    const ranking = stmt.all();
    res.json(ranking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar o ranking.' });
  }
});

// Matriz de Apostas (Grade de Apostas)
app.get('/api/bets/matrix', requireAuth, requirePasswordChangeCheck, (req, res) => {
  try {
    // Obter todos os jogadores
    const stmtPlayers = db.prepare("SELECT username FROM users WHERE role = 'player' ORDER BY username ASC");
    const players = stmtPlayers.all().map(p => p.username);

    // Obter todos os jogos
    const stmtMatches = db.prepare("SELECT id, round, home_team, away_team, match_date, status FROM matches ORDER BY id ASC");
    const matchesList = stmtMatches.all();

    // Obter todas as apostas dos jogadores
    const stmtBets = db.prepare(`
      SELECT b.match_id, b.home_score, b.away_score, b.penalty_winner, u.username
      FROM bets b
      JOIN users u ON b.user_id = u.id
      WHERE u.role = 'player'
    `);
    const allBets = stmtBets.all();

    // Mapear apostas por match_id e username
    const betsMap = {};
    allBets.forEach(bet => {
      if (!betsMap[bet.match_id]) {
        betsMap[bet.match_id] = {};
      }
      betsMap[bet.match_id][bet.username] = bet;
    });

    const matrix = matchesList.map(match => {
      const closed = match.status === 'finished' || isMatchClosed(match.match_date);
      
      const matchBets = {};
      players.forEach(username => {
        const bet = betsMap[match.id] ? betsMap[match.id][username] : null;
        
        if (!bet) {
          matchBets[username] = '-';
        } else {
          // Se o jogo está fechado OU o usuário logado é o próprio dono da aposta
          if (closed || username.toLowerCase() === req.session.username.toLowerCase()) {
            let betText = `${bet.home_score}x${bet.away_score}`;
            if (bet.home_score === bet.away_score && bet.penalty_winner) {
              const winnerName = bet.penalty_winner === 'home' ? match.home_team : match.away_team;
              betText += ` (${winnerName})`;
            }
            matchBets[username] = betText;
          } else {
            // Jogo aberto: esconde de outros usuários para não copiarem
            matchBets[username] = '🔒';
          }
        }
      });

      return {
        id: match.id,
        round: match.round,
        home_team: match.home_team,
        away_team: match.away_team,
        closed,
        bets: matchBets
      };
    });

    res.json({ players, matrix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar matriz de apostas.' });
  }
});

// ==========================================
// ROTAS DE ADMINISTRAÇÃO
// ==========================================

// Criar jogador (Nome + senha padrão)
app.post('/api/admin/players', requireAuth, requireAdmin, (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Nome do jogador e senha inicial são obrigatórios.' });
  }

  username = username.trim();
  password = password.trim();

  if (username.length < 2 || password.length < 4) {
    return res.status(400).json({ error: 'Nome deve ter no mínimo 2 caracteres e a senha no mínimo 4 caracteres.' });
  }

  try {
    const { hash, salt } = hashPassword(password);
    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, salt, role, must_change_password)
      VALUES (?, ?, ?, 'player', 1)
    `);
    stmt.run(username, hash, salt);

    res.json({ message: `Jogador '${username}' cadastrado com sucesso!` });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar o jogador.' });
  }
});

// Listar todos os jogadores (para o painel de admin)
app.get('/api/admin/players', requireAuth, requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, username, role, must_change_password, created_at
      FROM users
      WHERE role = 'player'
      ORDER BY username ASC
    `);
    const players = stmt.all();
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar jogadores.' });
  }
});

// Helper para calcular pontos
function calculatePoints(A_home, A_away, A_pen, B_home, B_away, B_pen) {
  // 1. Placar Exato (10 pts)
  if (A_home === B_home && A_away === B_away) {
    if (A_home === A_away) {
      // Se empatou, precisa acertar também o vencedor nos pênaltis
      return A_pen === B_pen ? 10 : 7; // Acertou placar de empate mas errou quem classifica: ganha 7
    }
    return 10;
  }

  // 2. Acertou Vencedor e Saldo (7 pts)
  const isWinnerCorrect = (A_home > A_away && B_home > B_away) || (A_home < A_away && B_home < B_away);
  if (isWinnerCorrect) {
    const diff_A = Math.abs(A_home - A_away);
    const diff_B = Math.abs(B_home - B_away);
    return diff_A === diff_B ? 7 : 5; // Saldo igual = 7, senão 5 (Apenas acertou vencedor)
  }

  // 3. Acertou que seria Empate mas errou placar (ex: apostou 1x1, terminou 2x2)
  if (A_home === A_away && B_home === B_away) {
    // Se o palpite de pênaltis foi correto: 7 pts, se errou: 5 pts
    return A_pen === B_pen ? 7 : 5;
  }

  return 0;
}

// Propagação do mata-mata (chaves)
const bracketProgression = {
  // Oitavas para Quartas
  74: { nextMatchId: 89, slot: 'home' },
  77: { nextMatchId: 89, slot: 'away' },
  73: { nextMatchId: 90, slot: 'home' },
  75: { nextMatchId: 90, slot: 'away' },
  76: { nextMatchId: 91, slot: 'home' },
  78: { nextMatchId: 91, slot: 'away' },
  79: { nextMatchId: 92, slot: 'home' },
  80: { nextMatchId: 92, slot: 'away' },
  83: { nextMatchId: 93, slot: 'home' },
  84: { nextMatchId: 93, slot: 'away' },
  81: { nextMatchId: 94, slot: 'home' },
  82: { nextMatchId: 94, slot: 'away' },
  86: { nextMatchId: 95, slot: 'home' },
  88: { nextMatchId: 95, slot: 'away' },
  85: { nextMatchId: 96, slot: 'home' },
  87: { nextMatchId: 96, slot: 'away' },

  // Quartas para Semis
  89: { nextMatchId: 97, slot: 'home' },
  90: { nextMatchId: 97, slot: 'away' },
  93: { nextMatchId: 98, slot: 'home' },
  94: { nextMatchId: 98, slot: 'away' },
  91: { nextMatchId: 99, slot: 'home' },
  92: { nextMatchId: 99, slot: 'away' },
  95: { nextMatchId: 100, slot: 'home' },
  96: { nextMatchId: 100, slot: 'away' },

  // Semis para Final e Terceiro Lugar
  97: { nextMatchId: 101, slot: 'home' },
  98: { nextMatchId: 101, slot: 'away' },
  99: { nextMatchId: 102, slot: 'home' },
  100: { nextMatchId: 102, slot: 'away' }
};

// ==========================================
// SERVIÇOS DE ATUALIZAÇÃO E PROPAGAÇÃO (HELPER)
// ==========================================

function updateMatchScore(matchId, homeScore, awayScore, penaltyWinner) {
  const hScore = parseInt(homeScore, 10);
  const aScore = parseInt(awayScore, 10);

  if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
    throw new Error('Placares devem ser números maiores ou iguais a 0.');
  }

  let penWinner = null;
  if (hScore === aScore) {
    if (!penaltyWinner || (penaltyWinner !== 'home' && penaltyWinner !== 'away')) {
      throw new Error('Em caso de empate no mata-mata, selecione o time que se classificou nos pênaltis.');
    }
    penWinner = penaltyWinner;
  }

  // 1. Atualizar o jogo em si
  const stmtUpdateMatch = db.prepare(`
    UPDATE matches
    SET home_score = ?, away_score = ?, penalty_winner = ?, status = 'finished'
    WHERE id = ?
  `);
  stmtUpdateMatch.run(hScore, aScore, penWinner, matchId);

  // Obter dados atualizados do jogo
  const stmtGetMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
  const match = stmtGetMatch.get(matchId);

  // 2. Calcular o vencedor textual para propagar a chave
  let matchWinnerName = '';
  let matchLoserName = '';
  if (hScore > aScore) {
    matchWinnerName = match.home_team;
    matchLoserName = match.away_team;
  } else if (aScore > hScore) {
    matchWinnerName = match.away_team;
    matchLoserName = match.home_team;
  } else {
    matchWinnerName = penWinner === 'home' ? match.home_team : match.away_team;
    matchLoserName = penWinner === 'home' ? match.away_team : match.home_team;
  }

  // Propagar vencedor para o próximo jogo da chave
  if (bracketProgression[matchId]) {
    const nextMatchRule = bracketProgression[matchId];
    const updateColumn = nextMatchRule.slot === 'home' ? 'home_team' : 'away_team';
    const stmtPropagate = db.prepare(`
      UPDATE matches
      SET ${updateColumn} = ?
      WHERE id = ?
    `);
    stmtPropagate.run(matchWinnerName, nextMatchRule.nextMatchId);
    console.log(`[Sync] Propagado: ${matchWinnerName} avançou para o Jogo ${nextMatchRule.nextMatchId} como ${nextMatchRule.slot}`);
  }

  // Caso especial: Semifinais propagam perdedores para o 3º Lugar e vencedores para a Final
  if (matchId === 101 || matchId === 102) {
    // Vencedor vai para a Final (Jogo 104)
    const finalSlot = matchId === 101 ? 'home_team' : 'away_team';
    const stmtFinal = db.prepare(`UPDATE matches SET ${finalSlot} = ? WHERE id = 104`);
    stmtFinal.run(matchWinnerName);

    // Perdedor vai para 3º Lugar (Jogo 103)
    const thirdPlaceSlot = matchId === 101 ? 'home_team' : 'away_team';
    const stmtThird = db.prepare(`UPDATE matches SET ${thirdPlaceSlot} = ? WHERE id = 103`);
    stmtThird.run(matchLoserName);
    console.log(`[Sync] Propagado Semifinal Jogo ${matchId}: ${matchWinnerName} para a Final, ${matchLoserName} para 3º Lugar.`);
  }

  // 3. Recalcular e atualizar pontos nas apostas desse jogo
  const stmtAllBets = db.prepare('SELECT * FROM bets WHERE match_id = ?');
  const bets = stmtAllBets.all(matchId);

  const stmtUpdateBetPoints = db.prepare('UPDATE bets SET points_earned = ? WHERE id = ?');

  bets.forEach(bet => {
    const points = calculatePoints(
      hScore, aScore, penWinner,
      bet.home_score, bet.away_score, bet.penalty_winner
    );
    stmtUpdateBetPoints.run(points, bet.id);
  });
}

// Configurações globais de Sincronização
let syncUrl = 'http://localhost:3000/api/public/mock-scores';
let syncHeaders = {};
let lastSyncStatus = { time: null, success: false, message: 'Nenhuma sincronização realizada ainda.' };

// Dicionário de mapeamento e tradução de seleções para APIs externas (Inglês -> Português)
function matchTeams(localHome, localAway, remoteHome, remoteAway) {
  if (!localHome || !localAway || !remoteHome || !remoteAway) return false;
  
  const norm = (str) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  const lh = norm(localHome);
  const la = norm(localAway);
  const rh = norm(remoteHome);
  const ra = norm(remoteAway);

  const translations = {
    'brazil': 'brasil',
    'germany': 'alemanha',
    'south africa': 'africa do sul',
    'netherlands': 'holanda',
    'morocco': 'marrocos',
    'spain': 'espanha',
    'austria': 'austria',
    'croatia': 'croacia',
    'mexico': 'mexico',
    'ecuador': 'equador',
    'belgium': 'belgica',
    'united states': 'estados unidos',
    'usa': 'estados unidos',
    'bosnia and herzegovina': 'bosnia e herzegovina',
    'switzerland': 'suica',
    'algeria': 'argelia',
    'australia': 'australia',
    'egypt': 'egito',
    'colombia': 'colombia',
    'ivory coast': 'costa do marfim',
    'cote divoire': 'costa do marfim',
    'france': 'franca',
    'sweden': 'suecia',
    'norway': 'noruega',
    'japan': 'japao',
    'paraguay': 'paraguai'
  };

  const translate = (name) => translations[name] || name;

  const tlh = translate(lh);
  const tla = translate(la);
  const trh = translate(rh);
  const tra = translate(ra);

  return (tlh === trh && tla === tra) || (tlh === tra && tla === trh);
}

// Analisa a resposta de APIs externas e padroniza os placares
function parseExternalMatches(data) {
  const matches = [];

  if (Array.isArray(data)) {
    data.forEach(item => {
      const matchId = item.id || item.matchNumber || item.match_id;
      if (matchId) {
        matches.push({
          id: parseInt(matchId, 10),
          home_score: item.home_score !== undefined ? item.home_score : null,
          away_score: item.away_score !== undefined ? item.away_score : null,
          penalty_winner: item.penalty_winner || null,
          status: item.status || 'pending'
        });
      }
    });
    return matches;
  }

  // api-sports.io (API-Football)
  if (data && Array.isArray(data.response)) {
    data.response.forEach(item => {
      if (item.fixture) {
        const homeName = item.teams?.home?.name;
        const awayName = item.teams?.away?.name;
        const isFinished = item.fixture.status?.short === 'FT' || item.fixture.status?.short === 'AET' || item.fixture.status?.short === 'PEN';
        
        matches.push({
          homeTeamName: homeName,
          awayTeamName: awayName,
          home_score: item.goals?.home,
          away_score: item.goals?.away,
          penalty_winner: (item.score?.penalty?.home !== null && item.score?.penalty?.home !== undefined) ? 
            (item.score.penalty.home > item.score.penalty.away ? 'home' : 'away') : null,
          status: isFinished ? 'finished' : 'pending'
        });
      }
    });
    return matches;
  }

  // football-data.org
  if (data && Array.isArray(data.matches)) {
    data.matches.forEach(item => {
      const homeName = item.homeTeam?.name;
      const awayName = item.awayTeam?.name;
      const isFinished = item.status === 'FINISHED';
      
      const homeScore = item.score?.fullTime?.home;
      const awayScore = item.score?.fullTime?.away;
      
      let penaltyWinner = null;
      if (item.score?.penalties?.home !== null && item.score?.penalties?.home !== undefined) {
        penaltyWinner = item.score.penalties.home > item.score.penalties.away ? 'home' : 'away';
      }

      matches.push({
        homeTeamName: homeName,
        awayTeamName: awayName,
        home_score: homeScore,
        away_score: awayScore,
        penalty_winner: penaltyWinner,
        status: isFinished ? 'finished' : 'pending'
      });
    });
    return matches;
  }

  // openfootball
  if (data && Array.isArray(data.rounds)) {
    data.rounds.forEach(round => {
      if (Array.isArray(round.matches)) {
        round.matches.forEach(item => {
          const homeName = item.team1?.name;
          const awayName = item.team2?.name;
          const isFinished = item.score !== undefined;
          const homeScore = item.score?.ft?.[0];
          const awayScore = item.score?.ft?.[1];
          
          let penaltyWinner = null;
          if (item.score?.ps) {
            penaltyWinner = item.score.ps[0] > item.score.ps[1] ? 'home' : 'away';
          }

          matches.push({
            homeTeamName: homeName,
            awayTeamName: awayName,
            home_score: homeScore,
            away_score: awayScore,
            penalty_winner: penaltyWinner,
            status: isFinished ? 'finished' : 'pending'
          });
        });
      }
    });
    return matches;
  }

  return matches;
}

// Reverter jogo finalizado de volta para pendente
function resetMatchToPending(matchId) {
  // 1. Resetar o jogo
  const stmtUpdate = db.prepare(`
    UPDATE matches
    SET home_score = null, away_score = null, penalty_winner = null, status = 'pending'
    WHERE id = ?
  `);
  stmtUpdate.run(matchId);

  // 2. Zerar os pontos das apostas
  const stmtBets = db.prepare('UPDATE bets SET points_earned = 0 WHERE match_id = ?');
  stmtBets.run(matchId);

  // 3. Reverter chaveamento (recolocar placeholder)
  if (matchId === 101 || matchId === 102) {
    const finalSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${finalSlot} = ? WHERE id = 104`).run(`Vencedor J${matchId}`);

    const thirdPlaceSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${thirdPlaceSlot} = ? WHERE id = 103`).run(`Perdedor J${matchId}`);
    console.log(`[Sync Reset] Semifinal J${matchId} revertida. Final e 3º Lugar resetados.`);
  } else if (bracketProgression[matchId]) {
    const nextRule = bracketProgression[matchId];
    const updateColumn = nextRule.slot === 'home' ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${updateColumn} = ? WHERE id = ?`).run(`Vencedor J${matchId}`, nextRule.nextMatchId);
    console.log(`[Sync Reset] Jogo ${matchId} revertido. Placeholder recolocado no Jogo ${nextRule.nextMatchId}.`);
  }
}

// Analisa uma página de texto/HTML em busca do placar de um jogo específico por regex
function parseHtmlForMatch(html, homeTeam, awayTeam) {
  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getVariants = (name) => {
    const list = [name];
    const norm = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (norm !== name) list.push(norm);

    const translations = {
      'Brasil': 'Brazil',
      'Alemanha': 'Germany',
      'África do Sul': 'South Africa',
      'Holanda': 'Netherlands',
      'Marrocos': 'Morocco',
      'Espanha': 'Spain',
      'Áustria': 'Austria',
      'Croácia': 'Croatia',
      'México': 'Mexico',
      'Equador': 'Ecuador',
      'Bélgica': 'Belgium',
      'Estados Unidos': 'United States',
      'usa': 'United States',
      'Suíça': 'Switzerland',
      'Argélia': 'Algeria',
      'Austrália': 'Australia',
      'Egito': 'Egypt',
      'Colômbia': 'Colombia',
      'Costa do Marfim': 'Ivory Coast',
      'França': 'France',
      'Suécia': 'Sweden',
      'Noruega': 'Norway',
      'Japão': 'Japan',
      'Paraguai': 'Paraguay'
    };
    if (translations[name]) list.push(translations[name]);
    
    // Reverso
    for (const [pt, en] of Object.entries(translations)) {
      if (en.toLowerCase() === name.toLowerCase()) {
        list.push(pt);
      }
    }
    return list;
  };

  const homeVariants = getVariants(homeTeam);
  const awayVariants = getVariants(awayTeam);

  for (const home of homeVariants) {
    for (const away of awayVariants) {
      // Padrão 1: Home [número] - [número] Away (ex: Brasil 2 - 1 Japão ou Brasil 2x1 Japão)
      const pattern1 = new RegExp(
        `${escapeRegExp(home)}\\s*[^a-zA-Z0-9<]*\\s*(\\d+)\\s*[^a-zA-Z0-9<]*\\s*(\\d+)\\s*[^a-zA-Z0-9<]*\\s*${escapeRegExp(away)}`,
        'i'
      );
      let match = html.match(pattern1);
      if (match) {
        const homeScore = parseInt(match[1], 10);
        const awayScore = parseInt(match[2], 10);
        let penaltyWinner = null;
        
        if (homeScore === awayScore) {
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(html.length, match.index + match[0].length + 100);
          const context = html.substring(contextStart, contextEnd).toLowerCase();
          
          const homeClean = home.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const awayClean = away.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          
          const homeWinsPen = context.includes('pen') && (context.includes(homeClean) || context.includes('venceu ' + homeClean));
          const awayWinsPen = context.includes('pen') && (context.includes(awayClean) || context.includes('venceu ' + awayClean));
          
          if (homeWinsPen && !awayWinsPen) penaltyWinner = 'home';
          if (awayWinsPen && !homeWinsPen) penaltyWinner = 'away';
        }
        return { homeScore, awayScore, penaltyWinner };
      }

      // Padrão 2: Away [número] - [número] Home (ex: Japão 1 - 2 Brasil)
      const pattern2 = new RegExp(
        `${escapeRegExp(away)}\\s*[^a-zA-Z0-9<]*\\s*(\\d+)\\s*[^a-zA-Z0-9<]*\\s*(\\d+)\\s*[^a-zA-Z0-9<]*\\s*${escapeRegExp(home)}`,
        'i'
      );
      match = html.match(pattern2);
      if (match) {
        const awayScore = parseInt(match[1], 10);
        const homeScore = parseInt(match[2], 10);
        let penaltyWinner = null;

        if (homeScore === awayScore) {
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(html.length, match.index + match[0].length + 100);
          const context = html.substring(contextStart, contextEnd).toLowerCase();
          
          const homeClean = home.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const awayClean = away.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          
          const homeWinsPen = context.includes('pen') && (context.includes(homeClean) || context.includes('venceu ' + homeClean));
          const awayWinsPen = context.includes('pen') && (context.includes(awayClean) || context.includes('venceu ' + awayClean));
          
          if (homeWinsPen && !awayWinsPen) penaltyWinner = 'home';
          if (awayWinsPen && !homeWinsPen) penaltyWinner = 'away';
        }
        return { homeScore, awayScore, penaltyWinner };
      }
    }
  }
  return null;
}

// Analisa uma página web completa
function parseHtmlScrape(html, localMatches) {
  const matches = [];
  const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/\s+/g, ' ');

  localMatches.forEach(match => {
    // Ignorar placeholders na raspagem
    if (match.home_team.startsWith('Vencedor') || match.home_team.startsWith('Perdedor') ||
        match.away_team.startsWith('Vencedor') || match.away_team.startsWith('Perdedor')) {
      return;
    }

    const scraped = parseHtmlForMatch(cleanHtml, match.home_team, match.away_team);
    if (scraped) {
      matches.push({
        id: match.id,
        home_score: scraped.homeScore,
        away_score: scraped.awayScore,
        penalty_winner: scraped.penaltyWinner,
        status: 'finished'
      });
    } else {
      // Se o jogo está finalizado localmente, mas não encontramos placar na página raspada
      // e o jogo é programado para o futuro, consideramos ele como 'scheduled' (pendente)
      // para permitir o reset automático!
      const kickoff = new Date(match.match_date);
      const isFuture = kickoff.getTime() > new Date().getTime();
      if (isFuture) {
        matches.push({
          id: match.id,
          home_score: null,
          away_score: null,
          penalty_winner: null,
          status: 'scheduled'
        });
      }
    }
  });

  return matches;
}

// Executa o processo de sincronização de placares (Suporta JSON API e HTML WebScraping)
async function performSync() {
  try {
    console.log(`[Sync] Buscando dados de placares de: ${syncUrl}`);
    const response = await fetch(syncUrl, { headers: syncHeaders });
    if (!response.ok) {
      throw new Error(`Servidor de sincronização retornou status ${response.status}`);
    }

    // Buscar todos os jogos locais para mapeamento
    const stmtAll = db.prepare('SELECT * FROM matches');
    const localMatches = stmtAll.all();

    let parsedMatches = [];
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      const text = await response.text();
      console.log(`[Sync] Detectado tipo textual (HTML/Text). Iniciando WebScraping...`);
      parsedMatches = parseHtmlScrape(text, localMatches);
    } else {
      try {
        const data = await response.json();
        parsedMatches = parseExternalMatches(data);
      } catch (jsonErr) {
        // Fallback de segurança para análise de texto
        console.log(`[Sync] Falha ao processar como JSON, caindo de volta para WebScraping...`);
        const text = await response.text();
        parsedMatches = parseHtmlScrape(text, localMatches);
      }
    }

    let updatedCount = 0;

    db.prepare('BEGIN').run();
    try {
      parsedMatches.forEach(remoteMatch => {
        let matchedLocal = null;
        if (remoteMatch.id) {
          matchedLocal = localMatches.find(m => m.id === remoteMatch.id);
        } else if (remoteMatch.homeTeamName && remoteMatch.awayTeamName) {
          matchedLocal = localMatches.find(m => 
            matchTeams(m.home_team, m.away_team, remoteMatch.homeTeamName, remoteMatch.awayTeamName)
          );
        }

        if (matchedLocal) {
          if (remoteMatch.status === 'finished') {
            const isDifferent = matchedLocal.status !== 'finished' ||
                                matchedLocal.home_score !== remoteMatch.home_score ||
                                matchedLocal.away_score !== remoteMatch.away_score ||
                                matchedLocal.penalty_winner !== remoteMatch.penalty_winner;
            
            if (isDifferent) {
              updateMatchScore(matchedLocal.id, remoteMatch.home_score, remoteMatch.away_score, remoteMatch.penalty_winner);
              updatedCount++;
            }
          } else {
            // Se o jogo não está finalizado remotamente/no scrape, mas consta como finalizado localmente, resetamos
            if (matchedLocal.status === 'finished') {
              resetMatchToPending(matchedLocal.id);
              updatedCount++;
            }
          }
        }
      });
      db.prepare('COMMIT').run();
    } catch (e) {
      db.prepare('ROLLBACK').run();
      throw e;
    }

    lastSyncStatus = {
      time: new Date().toISOString(),
      success: true,
      message: `Sincronização bem-sucedida! ${updatedCount} jogo(s) atualizados.`
    };
    console.log(`[Sync] ${lastSyncStatus.message}`);
  } catch (err) {
    lastSyncStatus = {
      time: new Date().toISOString(),
      success: false,
      message: `Erro na sincronização: ${err.message}`
    };
    console.error(`[Sync] ${lastSyncStatus.message}`);
    throw err;
  }
}

// Endpoint para atualizar placar manualmente pelo admin
app.post('/api/admin/matches/score', requireAuth, requireAdmin, (req, res) => {
  const { match_id, home_score, away_score, penalty_winner } = req.body;

  if (match_id === undefined || home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  try {
    updateMatchScore(match_id, home_score, away_score, penalty_winner);
    res.json({ message: 'Placar atualizado e pontuações recalculadas com sucesso!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Endpoint público simulando placares reais do torneio com base na data do servidor
app.get('/api/public/mock-scores', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM matches');
    const matches = stmt.all();
    const now = new Date();

    const mockMatches = matches.map(match => {
      const kickoff = new Date(match.match_date);
      // Considera jogo encerrado 2 horas após o início
      const isFinished = now.getTime() > kickoff.getTime() + 2 * 60 * 60 * 1000;

      if (isFinished) {
        // Se for o jogo 73 (África do Sul vs Canadá), o placar correto é 0 x 1 (Canadá 1 x 0)
        let homeScore = (match.id * 3) % 4;
        let awayScore = (match.id * 7) % 4;
        let penaltyWinner = null;

        if (match.id === 73) {
          homeScore = 0;
          awayScore = 1;
        } else {
          if (homeScore === awayScore) {
            penaltyWinner = (match.id % 2 === 0) ? 'home' : 'away';
          }
        }

        return {
          id: match.id,
          home_score: homeScore,
          away_score: awayScore,
          penalty_winner: penaltyWinner,
          status: 'finished'
        };
      } else {
        return {
          id: match.id,
          home_score: null,
          away_score: null,
          penalty_winner: null,
          status: 'scheduled'
        };
      }
    });

    res.json(mockMatches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar placares simulados.' });
  }
});

// Rotas de configuração de Sincronização do Admin
app.get('/api/admin/sync/status', requireAuth, requireAdmin, (req, res) => {
  res.json({ syncUrl, syncHeaders, status: lastSyncStatus });
});

app.post('/api/admin/sync/config', requireAuth, requireAdmin, (req, res) => {
  const { url, headers } = req.body;
  if (url !== undefined) {
    syncUrl = url.trim();
  }
  if (headers !== undefined) {
    syncHeaders = headers;
  }
  res.json({ message: 'Configuração atualizada com sucesso!', syncUrl, syncHeaders, status: lastSyncStatus });
});

app.post('/api/admin/sync/trigger', requireAuth, requireAdmin, async (req, res) => {
  try {
    await performSync();
    res.json({ message: 'Sincronização manual executada com sucesso!', status: lastSyncStatus });
  } catch (err) {
    res.status(500).json({ error: err.message, status: lastSyncStatus });
  }
});

// Agendador Inteligente de Sincronização: roda a cada 5 minutos
// Mas APENAS faz requisições à API se houver partidas ativas ocorrendo no momento!
setInterval(async () => {
  try {
    const stmt = db.prepare('SELECT match_date FROM matches');
    const matches = stmt.all();
    const now = new Date();

    const hasActiveMatch = matches.some(m => {
      const kickoff = new Date(m.match_date);
      // Considera ativo de 15 minutos antes do início até 3.5 horas depois (incluindo possíveis pênaltis/prorrogações)
      const startWindow = new Date(kickoff.getTime() - 15 * 60 * 1000);
      const endWindow = new Date(kickoff.getTime() + 210 * 60 * 1000);
      return now >= startWindow && now <= endWindow;
    });

    if (hasActiveMatch) {
      console.log('[Sync Scheduler] Partida ativa em andamento! Executando sincronização frequente...');
      await performSync();
    } else {
      // Sincronização de rotina uma vez por dia (às 02:00) para garantir integridade
      if (now.getHours() === 2 && now.getMinutes() < 5) {
        console.log('[Sync Scheduler] Executando sincronização de rotina diária...');
        await performSync();
      }
    }
  } catch (err) {
    console.error('[Sync Scheduler] Erro no agendador:', err.message);
  }
}, 5 * 60 * 1000);

// Inicializar e rodar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse http://localhost:${PORT}`);
});
