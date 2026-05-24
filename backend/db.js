import Database from 'better-sqlite3';

const db = new Database('piracy.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS bags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bag_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        size TEXT,
        files_count INTEGER,
        uploader_wallet TEXT NOT NULL,
        contract_index INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

try { db.exec(`ALTER TABLE bags ADD COLUMN files_count INTEGER`); } catch {}
try { db.exec(`ALTER TABLE bags ADD COLUMN contract_index INTEGER`); } catch {}

db.exec(`CREATE INDEX IF NOT EXISTS idx_bags_name ON bags(name)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bags_category ON bags(category)`);

export default db;
