const { db, initDatabase, hashPassword } = require('./db');

// Inicializa o banco de dados
initDatabase();

console.log('Banco de dados inicializado.');

// 1. Inserir usuário Administrador inicial
const checkAdmin = db.prepare('SELECT id FROM users WHERE username = ?');
const adminExists = checkAdmin.get('admin');

if (!adminExists) {
  const { hash, salt } = hashPassword('admin123');
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, salt, role, must_change_password)
    VALUES (?, ?, ?, 'admin', 1)
  `);
  insertUser.run('admin', hash, salt);
  console.log('Usuário admin inserido (senha padrão: admin123, troca obrigatória).');
} else {
  console.log('Usuário admin já existe.');
}

// 2. Inserir Jogos
const matches = [
  // Oitavas de final / 16 avos de final (Round of 32)
  { id: 73, round: 'Round of 32', match_date: '2026-06-28 15:00', venue: 'SoFi Stadium, Los Angeles', home_team: 'África do Sul', away_team: 'Canadá' },
  { id: 74, round: 'Round of 32', match_date: '2026-06-29 16:30', venue: 'Gillette Stadium, Boston', home_team: 'Alemanha', away_team: 'Paraguai' },
  { id: 75, round: 'Round of 32', match_date: '2026-06-29 21:00', venue: 'Estadio BBVA, Monterrey', home_team: 'Holanda', away_team: 'Marrocos' },
  { id: 76, round: 'Round of 32', match_date: '2026-06-29 13:00', venue: 'NRG Stadium, Houston', home_team: 'Brasil', away_team: 'Japão' },
  { id: 77, round: 'Round of 32', match_date: '2026-06-30 17:00', venue: 'MetLife Stadium, New Jersey', home_team: 'França', away_team: 'Suécia' },
  { id: 78, round: 'Round of 32', match_date: '2026-06-30 13:00', venue: 'AT&T Stadium, Dallas', home_team: 'Costa do Marfim', away_team: 'Noruega' },
  { id: 79, round: 'Round of 32', match_date: '2026-06-30 21:00', venue: 'Estadio Azteca, Cidade do México', home_team: 'México', away_team: 'Equador' },
  { id: 80, round: 'Round of 32', match_date: '2026-07-01 12:00', venue: 'Mercedes-Benz Stadium, Atlanta', home_team: 'Inglaterra', away_team: 'RD Congo' },
  { id: 81, round: 'Round of 32', match_date: '2026-07-01 20:00', venue: 'Levi\'s Stadium, Santa Clara', home_team: 'Estados Unidos', away_team: 'Bósnia e Herzegovina' },
  { id: 82, round: 'Round of 32', match_date: '2026-07-01 16:00', venue: 'Lumen Field, Seattle', home_team: 'Bélgica', away_team: 'Senegal' },
  { id: 83, round: 'Round of 32', match_date: '2026-07-02 19:00', venue: 'BMO Field, Toronto', home_team: 'Portugal', away_team: 'Croácia' },
  { id: 84, round: 'Round of 32', match_date: '2026-07-02 15:00', venue: 'SoFi Stadium, Los Angeles', home_team: 'Espanha', away_team: 'Áustria' },
  { id: 85, round: 'Round of 32', match_date: '2026-07-02 23:00', venue: 'BC Place, Vancouver', home_team: 'Suíça', away_team: 'Argélia' },
  { id: 86, round: 'Round of 32', match_date: '2026-07-03 18:00', venue: 'Hard Rock Stadium, Miami', home_team: 'Argentina', away_team: 'Cabo Verde' },
  { id: 87, round: 'Round of 32', match_date: '2026-07-03 21:30', venue: 'Arrowhead Stadium, Kansas City', home_team: 'Colômbia', away_team: 'Gana' },
  { id: 88, round: 'Round of 32', match_date: '2026-07-03 14:00', venue: 'AT&T Stadium, Dallas', home_team: 'Austrália', away_team: 'Egito' },

  // Oitavas de final (Round of 16)
  { id: 89, round: 'Round of 16', match_date: '2026-07-04 18:00', venue: 'Lincoln Financial Field, Filadélfia', home_team: 'Vencedor J74', away_team: 'Vencedor J77' },
  { id: 90, round: 'Round of 16', match_date: '2026-07-04 21:00', venue: 'NRG Stadium, Houston', home_team: 'Vencedor J73', away_team: 'Vencedor J75' },
  { id: 91, round: 'Round of 16', match_date: '2026-07-05 18:00', venue: 'MetLife Stadium, New Jersey', home_team: 'Vencedor J76', away_team: 'Vencedor J78' },
  { id: 92, round: 'Round of 16', match_date: '2026-07-05 21:00', venue: 'Estadio Azteca, Cidade do México', home_team: 'Vencedor J79', away_team: 'Vencedor J80' },
  { id: 93, round: 'Round of 16', match_date: '2026-07-06 18:00', venue: 'AT&T Stadium, Dallas', home_team: 'Vencedor J83', away_team: 'Vencedor J84' },
  { id: 94, round: 'Round of 16', match_date: '2026-07-06 21:00', venue: 'Lumen Field, Seattle', home_team: 'Vencedor J81', away_team: 'Vencedor J82' },
  { id: 95, round: 'Round of 16', match_date: '2026-07-07 18:00', venue: 'Mercedes-Benz Stadium, Atlanta', home_team: 'Vencedor J86', away_team: 'Vencedor J88' },
  { id: 96, round: 'Round of 16', match_date: '2026-07-07 21:00', venue: 'BC Place, Vancouver', home_team: 'Vencedor J85', away_team: 'Vencedor J87' },

  // Quartas de final (Quarterfinals)
  { id: 97, round: 'Quarterfinals', match_date: '2026-07-09 18:00', venue: 'Gillette Stadium, Boston', home_team: 'Vencedor J89', away_team: 'Vencedor J90' },
  { id: 98, round: 'Quarterfinals', match_date: '2026-07-10 18:00', venue: 'SoFi Stadium, Los Angeles', home_team: 'Vencedor J93', away_team: 'Vencedor J94' },
  { id: 99, round: 'Quarterfinals', match_date: '2026-07-11 18:00', venue: 'Hard Rock Stadium, Miami', home_team: 'Vencedor J91', away_team: 'Vencedor J92' },
  { id: 100, round: 'Quarterfinals', match_date: '2026-07-11 21:00', venue: 'Arrowhead Stadium, Kansas City', home_team: 'Vencedor J95', away_team: 'Vencedor J96' },

  // Semifinais (Semifinals)
  { id: 101, round: 'Semifinals', match_date: '2026-07-14 20:00', venue: 'AT&T Stadium, Dallas', home_team: 'Vencedor J97', away_team: 'Vencedor J98' },
  { id: 102, round: 'Semifinals', match_date: '2026-07-15 20:00', venue: 'Mercedes-Benz Stadium, Atlanta', home_team: 'Vencedor J99', away_team: 'Vencedor J100' },

  // Terceiro lugar (Third Place)
  { id: 103, round: 'Third Place', match_date: '2026-07-18 16:00', venue: 'Hard Rock Stadium, Miami', home_team: 'Perdedor J101', away_team: 'Perdedor J102' },

  // Final
  { id: 104, round: 'Final', match_date: '2026-07-19 16:00', venue: 'MetLife Stadium, New Jersey', home_team: 'Vencedor J101', away_team: 'Vencedor J102' }
];

const checkMatch = db.prepare('SELECT id FROM matches WHERE id = ?');
const insertMatch = db.prepare(`
  INSERT INTO matches (id, round, match_date, venue, home_team, away_team)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let seededCount = 0;
for (const match of matches) {
  const matchExists = checkMatch.get(match.id);
  if (!matchExists) {
    insertMatch.run(match.id, match.round, match.match_date, match.venue, match.home_team, match.away_team);
    seededCount++;
  }
}

console.log(`${seededCount} jogos semeados com sucesso.`);
console.log('Processo de semeadura concluído.');
