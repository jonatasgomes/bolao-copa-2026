const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'bolao.db');
const db = new DatabaseSync(dbPath);

// Inicializar tabelas
function initDatabase() {
  // Tabela de Usuários
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'player')) DEFAULT 'player',
      must_change_password INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Jogos
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY, -- Número do jogo oficial (73 a 104)
      round TEXT NOT NULL, -- 'Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Third Place', 'Final'
      match_date TEXT NOT NULL, -- Formato 'YYYY-MM-DD HH:MM'
      venue TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_score INTEGER DEFAULT NULL,
      away_score INTEGER DEFAULT NULL,
      penalty_winner TEXT CHECK(penalty_winner IN ('home', 'away', NULL)) DEFAULT NULL,
      status TEXT CHECK(status IN ('pending', 'finished')) DEFAULT 'pending'
    )
  `);

  // Tabela de Apostas (Palpites)
  db.exec(`
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      penalty_winner TEXT CHECK(penalty_winner IN ('home', 'away', NULL)) DEFAULT NULL,
      points_earned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(match_id) REFERENCES matches(id),
      UNIQUE(user_id, match_id)
    )
  `);
}

// Helper para gerar hash de senha com salt
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Helper para verificar senha
function verifyPassword(password, salt, hash) {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

module.exports = {
  db,
  initDatabase,
  hashPassword,
  verifyPassword
};
