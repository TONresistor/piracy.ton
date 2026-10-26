import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

test('legacy registration attempts receive a safe next_check_at migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'piracy-db-migration-'));
    const databasePath = join(directory, 'legacy.sqlite');
    try {
        const legacy = new Database(databasePath);
        legacy.exec(`
            CREATE TABLE registration_attempts (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                wallet_address TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            INSERT INTO registration_attempts VALUES
                ('prepared', 'PREPARED', 'wallet', 10, 20, 30),
                ('confirming', 'CONFIRMING', 'wallet', 40, 50, 60);
        `);
        legacy.close();

        const dbModuleUrl = new URL('../db.js', import.meta.url).href;
        const script = `
            const db = (await import(${JSON.stringify(dbModuleUrl)})).default;
            const rows = db.prepare('SELECT id, next_check_at FROM registration_attempts ORDER BY id').all();
            console.log(JSON.stringify(rows));
            db.close();
        `;
        const migrated = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            encoding: 'utf8',
            env: { ...process.env, DB_PATH: databasePath }
        });

        assert.equal(migrated.status, 0, migrated.stderr);
        assert.deepEqual(JSON.parse(migrated.stdout), [
            { id: 'confirming', next_check_at: 50 },
            { id: 'prepared', next_check_at: 30 }
        ]);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test('migrations preserve data across restarts and unexpected schema failures are fatal', () => {
    const directory = mkdtempSync(join(tmpdir(), 'piracy-db-restart-'));
    const databasePath = join(directory, 'db.sqlite');
    const dbModuleUrl = new URL('../db.js', import.meta.url).href;
    const execute = script => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8', env: { ...process.env, DB_PATH: databasePath }
    });
    try {
        const first = execute(`const db = (await import(${JSON.stringify(dbModuleUrl)})).default;
            db.prepare("INSERT INTO sync_state VALUES ('test', 42)").run(); db.close();`);
        assert.equal(first.status, 0, first.stderr);
        const restart = execute(`const db = (await import(${JSON.stringify(dbModuleUrl)})).default;
            console.log(db.prepare("SELECT value FROM sync_state WHERE key='test'").get().value); db.close();`);
        assert.equal(restart.status, 0, restart.stderr);
        assert.equal(restart.stdout.trim(), '42');
        const incompatible = new Database(databasePath);
        incompatible.exec('DROP TABLE bags; CREATE TABLE bags(id INTEGER PRIMARY KEY)');
        incompatible.close();
        const broken = execute(`await import(${JSON.stringify(dbModuleUrl)});`);
        assert.notEqual(broken.status, 0);
        assert.match(broken.stderr, /no such column/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('versioned migrations adopt the previous worker schema without losing jobs, identities or cursors', async () => {
    const { migrateDatabase, SCHEMA_VERSION } = await import('../migrations.js');
    const db = new Database(':memory:');
    try {
        // Simulate an installed database from before migration version tracking.
        migrateDatabase(db);
        db.exec(`DROP TABLE schema_migrations;
            ALTER TABLE worker_jobs DROP COLUMN created_at;
            ALTER TABLE worker_jobs DROP COLUMN started_at;
            ALTER TABLE worker_jobs DROP COLUMN error_status;`);
        db.prepare("INSERT INTO worker_jobs(key,kind,payload,state,run_at,updated_at) VALUES('retry','publication','{}','queued',100,90)").run();
        db.prepare("INSERT INTO sync_state VALUES('preserved',42)").run();
        db.prepare("INSERT INTO bags(bag_id,name,category,uploader_wallet) VALUES('bag','Legacy','video','owner')").run();
        migrateDatabase(db); migrateDatabase(db);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, SCHEMA_VERSION);
        const job = db.prepare("SELECT state,created_at,started_at,error_status FROM worker_jobs WHERE key='retry'").get();
        assert.deepEqual(job, { state: 'queued', created_at: 90, started_at: 0, error_status: null });
        assert.equal(db.prepare("SELECT value FROM sync_state WHERE key='preserved'").get().value, 42);
        assert.equal(db.prepare("SELECT name FROM bags WHERE bag_id='bag'").get().name, 'Legacy');
        db.prepare('INSERT INTO schema_migrations VALUES(?,0)').run(SCHEMA_VERSION + 1);
        assert.throws(() => migrateDatabase(db), /newer_than_application/);
    } finally { db.close(); }
});

test('a failed migration rolls back schema edits and never records success', async () => {
    const { migrateDatabase } = await import('../migrations.js');
    const db = new Database(':memory:');
    try {
        db.exec('CREATE TABLE bags(id INTEGER PRIMARY KEY)');
        assert.throws(() => migrateDatabase(db), /no such column/);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 0);
        assert.deepEqual(db.pragma('table_info(bags)').map(column => column.name), ['id']);
    } finally { db.close(); }
});
