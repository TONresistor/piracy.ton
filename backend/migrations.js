// Ordered, transactional upgrades support fresh and pre-versioned installations.
function ensureColumn(db, table, column, definition) {
    if (!db.pragma(`table_info(${table})`).some(info => info.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

function legacySchema(db) {
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

    ensureColumn(db, 'bags', 'files_count', 'INTEGER');
    ensureColumn(db, 'bags', 'contract_index', 'INTEGER');

    db.exec(`CREATE INDEX IF NOT EXISTS idx_bags_name ON bags(name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bags_category ON bags(category)`);

    // Keep the sequential contract-sync cursor independent from indexed bag rows.
    // Reconciliation can discover a later BagItem before the background sync has
    // visited every earlier index, so MAX(bags.contract_index) is not a safe cursor.
    db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value INTEGER NOT NULL
        )
    `);
    db.prepare(`
        INSERT OR IGNORE INTO sync_state (key, value)
        VALUES ('contract_bags_cursor', -1)
    `).run();

    db.exec(`
        CREATE TABLE IF NOT EXISTS registration_attempts (
            id TEXT PRIMARY KEY,
            idempotency_key TEXT UNIQUE NOT NULL,
            trace_id TEXT,
            wallet_address TEXT NOT NULL,
            bag_id TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            payload_hash TEXT NOT NULL,
            payload_boc TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            baseline_index INTEGER NOT NULL,
            external_message_hash TEXT UNIQUE,
            wallet_tx_hash TEXT,
            registry_tx_hash TEXT,
            bag_index INTEGER,
            bag_item_address TEXT,
            state TEXT NOT NULL CHECK (state IN ('PREPARED', 'BROADCAST', 'CONFIRMING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
            exit_code INTEGER,
            error_code TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            next_check_at INTEGER NOT NULL DEFAULT 0,
            expires_at INTEGER NOT NULL
        )
    `);

    ensureColumn(db, 'registration_attempts', 'next_check_at', 'INTEGER NOT NULL DEFAULT 0');
    db.exec(`
        UPDATE registration_attempts
        SET next_check_at = CASE WHEN state = 'PREPARED' THEN expires_at ELSE updated_at END
        WHERE next_check_at = 0
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_registration_attempts_state ON registration_attempts(state, expires_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_registration_attempts_due ON registration_attempts(state, next_check_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_registration_attempts_wallet ON registration_attempts(wallet_address, created_at)`);
}

function publicationsSchema(db) {
    // V3 identities are publications, not globally unique bags. Keep the v2 table intact.
    db.exec(`
        CREATE TABLE IF NOT EXISTS publications_v3 (
            item_address TEXT PRIMARY KEY,
            registry_address TEXT NOT NULL,
            uploader_wallet TEXT NOT NULL,
            bag_id TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            visible INTEGER NOT NULL,
            revision TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            size TEXT,
            files_count INTEGER,
            description TEXT,
            UNIQUE(registry_address, uploader_wallet, bag_id)
        );
        CREATE TABLE IF NOT EXISTS v3_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS v3_pending_items (item_address TEXT PRIMARY KEY, next_check INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS idx_v3_category ON publications_v3(category, visible);
    `);
}

function workerSchema(db) {
    // Additive migrations: existing publication identities and cursors stay intact.
    db.exec(`
        CREATE TABLE IF NOT EXISTS worker_jobs (
            key TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'queued',
            run_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT,
            attempts INTEGER NOT NULL DEFAULT 0, result TEXT, error TEXT, updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_worker_jobs_due ON worker_jobs(state,run_at,priority);
        CREATE TABLE IF NOT EXISTS runtime_state (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS bag_metadata (
            bag_id TEXT PRIMARY KEY, details_json TEXT NOT NULL, fetched_at INTEGER NOT NULL,
            peers_count INTEGER, peers_checked_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rpc_budget (id INTEGER PRIMARY KEY CHECK(id=1),next_at INTEGER NOT NULL,cooldown_until INTEGER NOT NULL DEFAULT 0);
        INSERT OR IGNORE INTO rpc_budget(id,next_at) VALUES(1,0);
    `);

    ensureColumn(db, 'publications_v3', 'verified_at', 'INTEGER NOT NULL DEFAULT 0');
}

function jobLifecycleSchema(db) {
    ensureColumn(db, 'worker_jobs', 'created_at', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(db, 'worker_jobs', 'started_at', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn(db, 'worker_jobs', 'error_status', 'INTEGER');
    db.exec('UPDATE worker_jobs SET created_at=updated_at WHERE created_at=0');
    db.prepare("UPDATE worker_jobs SET started_at=? WHERE state='running' AND started_at=0").run(Date.now());
}

const migrations = [legacySchema, publicationsSchema, workerSchema, jobLifecycleSchema];
export const SCHEMA_VERSION = migrations.length;
export function migrateDatabase(db) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    if ((db.prepare('SELECT MAX(version) version FROM schema_migrations').get().version ?? 0) > SCHEMA_VERSION) {
        throw new Error('database_schema_newer_than_application');
    }
    for (const [index, apply] of migrations.entries()) {
        db.transaction(() => {
            const version = index + 1;
            if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) return;
            apply(db);
            db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version, Date.now());
        }).immediate();
    }
    // Fail startup on structural corruption instead of silently serving partial data.
    db.prepare('SELECT bag_id,name,category,uploader_wallet,contract_index,files_count FROM bags LIMIT 0').all();
    db.prepare('SELECT item_address,revision,verified_at FROM publications_v3 LIMIT 0').all();
    db.prepare('SELECT key,state,created_at,started_at,error_status FROM worker_jobs LIMIT 0').all();
}
