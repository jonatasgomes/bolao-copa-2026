// Ferramenta de manutenção: apaga TODAS as apostas (palpites + pontos) e, com
// isso, zera o ranking. NÃO toca nos resultados/placares dos jogos.
//
// Uso:  node clear-bets.js --yes      (a flag --yes evita execução acidental)
//
// IMPORTANTE: rode com o servidor PARADO (SQLite não aceita acesso concorrente)
// e faça backup antes (ex.: cp bolao.db bolao.db.bak).

const { db } = require('./db');

if (!process.argv.includes('--yes')) {
  console.error('Isto APAGA todas as apostas e zera o ranking.');
  console.error('Para confirmar, rode: node clear-bets.js --yes');
  process.exit(1);
}

const before = db.prepare('SELECT COUNT(*) AS c FROM bets').get().c;
const res = db.prepare('DELETE FROM bets').run();
console.log(`Apostas apagadas: ${res.changes} (havia ${before}). Ranking zerado.`);
console.log('Os resultados dos jogos foram mantidos.');
