// Loads backend/.env into process.env BEFORE any other module reads it.
// MUST be the first import in server.js: in ES modules, imported modules run
// their top-level code at import time, so contract-sync.js / db.js would
// otherwise read process.env before it is populated.
// Uses Node's built-in process.loadEnvFile (Node >= 20.12) — no dependency.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');

if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
} else {
    console.warn('[env] No .env file found at ' + envPath + ' — relying on process environment.');
}
