// Ferramenta de manutenção: lança o placar OFICIAL de um jogo (marca como
// encerrado, recalcula os pontos das apostas e propaga o vencedor na chave).
//
// Uso:  node set-score.js <id> <golsCasa> <golsFora> [home|away]
//   O 4º argumento (quem avança nos pênaltis) só é necessário em empate.
//
// Ex.:  node set-score.js 73 0 1         (Canadá venceu fora, sem pênaltis)
//       node set-score.js 89 1 1 home    (empate, mandante avança nos pênaltis)
//
// Espelha a lógica de updateMatchScore/calculatePoints de server.js — mantém os
// dois em sincronia se algum dia a regra mudar.
//
// IMPORTANTE: rode com o servidor PARADO (SQLite não aceita acesso concorrente).
// Ex.: pm2 stop bolao-copa-2026 && node set-score.js 73 0 1 && pm2 start bolao-copa-2026

const { db } = require('./db');

const bracketProgression = {
  74: { nextMatchId: 89, slot: 'home' }, 77: { nextMatchId: 89, slot: 'away' },
  73: { nextMatchId: 90, slot: 'home' }, 75: { nextMatchId: 90, slot: 'away' },
  76: { nextMatchId: 91, slot: 'home' }, 78: { nextMatchId: 91, slot: 'away' },
  79: { nextMatchId: 92, slot: 'home' }, 80: { nextMatchId: 92, slot: 'away' },
  83: { nextMatchId: 93, slot: 'home' }, 84: { nextMatchId: 93, slot: 'away' },
  81: { nextMatchId: 94, slot: 'home' }, 82: { nextMatchId: 94, slot: 'away' },
  86: { nextMatchId: 95, slot: 'home' }, 88: { nextMatchId: 95, slot: 'away' },
  85: { nextMatchId: 96, slot: 'home' }, 87: { nextMatchId: 96, slot: 'away' },
  89: { nextMatchId: 97, slot: 'home' }, 90: { nextMatchId: 97, slot: 'away' },
  93: { nextMatchId: 98, slot: 'home' }, 94: { nextMatchId: 98, slot: 'away' },
  91: { nextMatchId: 99, slot: 'home' }, 92: { nextMatchId: 99, slot: 'away' },
  95: { nextMatchId: 100, slot: 'home' }, 96: { nextMatchId: 100, slot: 'away' },
  97: { nextMatchId: 101, slot: 'home' }, 98: { nextMatchId: 101, slot: 'away' },
  99: { nextMatchId: 102, slot: 'home' }, 100: { nextMatchId: 102, slot: 'away' }
};

function calculatePoints(A_home, A_away, A_pen, B_home, B_away, B_pen) {
  if (A_home === B_home && A_away === B_away) {
    if (A_home === A_away) {
      return A_pen === B_pen ? 10 : 7;
    }
    return 10;
  }
  const isWinnerCorrect = (A_home > A_away && B_home > B_away) || (A_home < A_away && B_home < B_away);
  if (isWinnerCorrect) {
    const diff_A = Math.abs(A_home - A_away);
    const diff_B = Math.abs(B_home - B_away);
    return diff_A === diff_B ? 7 : 5;
  }
  if (A_home === A_away && B_home === B_away) {
    return A_pen === B_pen ? 7 : 5;
  }
  return 0;
}

function updateMatchScore(matchId, homeScore, awayScore, penaltyWinner) {
  const hScore = parseInt(homeScore, 10);
  const aScore = parseInt(awayScore, 10);

  if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
    throw new Error('Placares devem ser números maiores ou iguais a 0.');
  }

  let penWinner = null;
  if (hScore === aScore) {
    if (!penaltyWinner || (penaltyWinner !== 'home' && penaltyWinner !== 'away')) {
      throw new Error('Empate: informe o time que avança nos pênaltis (home ou away).');
    }
    penWinner = penaltyWinner;
  }

  db.prepare(`
    UPDATE matches
    SET home_score = ?, away_score = ?, penalty_winner = ?, status = 'finished'
    WHERE id = ?
  `).run(hScore, aScore, penWinner, matchId);

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) throw new Error(`Jogo ${matchId} não encontrado.`);

  let matchWinnerName = '';
  let matchLoserName = '';
  if (hScore > aScore) {
    matchWinnerName = match.home_team; matchLoserName = match.away_team;
  } else if (aScore > hScore) {
    matchWinnerName = match.away_team; matchLoserName = match.home_team;
  } else {
    matchWinnerName = penWinner === 'home' ? match.home_team : match.away_team;
    matchLoserName = penWinner === 'home' ? match.away_team : match.home_team;
  }

  if (bracketProgression[matchId]) {
    const rule = bracketProgression[matchId];
    const col = rule.slot === 'home' ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).run(matchWinnerName, rule.nextMatchId);
    console.log(`  ${matchWinnerName} avançou para o Jogo ${rule.nextMatchId} (${rule.slot}).`);
  }

  if (matchId === 101 || matchId === 102) {
    const finalSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${finalSlot} = ? WHERE id = 104`).run(matchWinnerName);
    const thirdSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${thirdSlot} = ? WHERE id = 103`).run(matchLoserName);
    console.log(`  Semifinal: ${matchWinnerName} para a Final, ${matchLoserName} para o 3º lugar.`);
  }

  const bets = db.prepare('SELECT * FROM bets WHERE match_id = ?').all(matchId);
  const stmtPts = db.prepare('UPDATE bets SET points_earned = ? WHERE id = ?');
  bets.forEach(bet => {
    const points = calculatePoints(hScore, aScore, penWinner, bet.home_score, bet.away_score, bet.penalty_winner);
    stmtPts.run(points, bet.id);
  });
  console.log(`  ${bets.length} aposta(s) recalculada(s).`);
}

const [idArg, hArg, aArg, penArg] = process.argv.slice(2);
const id = Number(idArg), h = Number(hArg), a = Number(aArg);
if (!Number.isInteger(id) || !Number.isInteger(h) || !Number.isInteger(a)) {
  console.error('Uso: node set-score.js <id> <golsCasa> <golsFora> [home|away]');
  process.exit(1);
}

const m = db.prepare('SELECT id, home_team, away_team FROM matches WHERE id = ?').get(id);
if (!m) { console.error(`Jogo ${id} não encontrado.`); process.exit(1); }

updateMatchScore(id, h, a, penArg || null);
console.log(`Jogo ${id} (${m.home_team} x ${m.away_team}) registrado: ${h}-${a}${penArg ? ' pen:' + penArg : ''}.`);
console.log('Concluído.');
