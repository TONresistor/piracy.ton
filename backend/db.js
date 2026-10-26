import Database from 'better-sqlite3';
import { migrateDatabase } from './migrations.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Keep mutable runtime state outside the deployed source tree in production.
// The local fallback preserves the existing zero-config development behavior.
const dbPath = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), 'piracy.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

try { migrateDatabase(db); }
catch (error) { db.close(); throw error; }

export default db;
