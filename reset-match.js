// Ferramenta de manutenção: reverte jogos finalizados de volta para "pendente".
//
// Uso:  node reset-match.js <id> [<id> ...]
// Ex.:  node reset-match.js 73 76
//
// Para cada jogo informado: zera placar e pênaltis, volta o status para
// 'pending', zera os pontos das apostas daquele jogo e recoloca o placeholder
// na chave do mata-mata (mesma lógica do resetMatchToPending do server.js).
//
// IMPORTANTE: rode com o servidor PARADO (SQLite não suporta acesso concorrente
// de múltiplos processos). Ex.: pm2 stop bolao-copa-2026 && node reset-match.js 73 76 && pm2 start bolao-copa-2026

const { db } = require('./db');

// Espelha o mapa bracketProgression de server.js (chaveamento fixo da Copa 2026).
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

function resetMatchToPending(matchId) {
  const match = db.prepare('SELECT id, home_team, away_team, status FROM matches WHERE id = ?').get(matchId);
  if (!match) {
    console.log(`Jogo ${matchId} não encontrado. Pulando.`);
    return;
  }

  // 1. Resetar o jogo
  db.prepare(`
    UPDATE matches
    SET home_score = null, away_score = null, penalty_winner = null, status = 'pending'
    WHERE id = ?
  `).run(matchId);

  // 2. Zerar os pontos das apostas
  db.prepare('UPDATE bets SET points_earned = 0 WHERE match_id = ?').run(matchId);

  // 3. Reverter chaveamento (recolocar placeholder)
  if (matchId === 101 || matchId === 102) {
    const finalSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${finalSlot} = ? WHERE id = 104`).run(`Vencedor J${matchId}`);
    const thirdPlaceSlot = matchId === 101 ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${thirdPlaceSlot} = ? WHERE id = 103`).run(`Perdedor J${matchId}`);
  } else if (bracketProgression[matchId]) {
    const nextRule = bracketProgression[matchId];
    const updateColumn = nextRule.slot === 'home' ? 'home_team' : 'away_team';
    db.prepare(`UPDATE matches SET ${updateColumn} = ? WHERE id = ?`).run(`Vencedor J${matchId}`, nextRule.nextMatchId);
  }

  console.log(`Jogo ${matchId} (${match.home_team} x ${match.away_team}) revertido para pendente.`);
}

const ids = process.argv.slice(2).map(Number).filter(n => Number.isInteger(n));
if (ids.length === 0) {
  console.error('Uso: node reset-match.js <id> [<id> ...]   (ex.: node reset-match.js 73 76)');
  process.exit(1);
}

for (const id of ids) {
  resetMatchToPending(id);
}
console.log('Concluído.');
