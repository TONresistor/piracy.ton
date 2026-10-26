import { mkdir, readdir, rename, unlink, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import db from './db.js';

export async function backupDatabase(directory = join(dirname(db.name), 'backups')) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const name = 'piracy-' + new Date().toISOString().slice(0, 10) + '.sqlite';
    const temporary = join(directory, name + '.partial');
    await db.backup(temporary);
    await chmod(temporary, 0o600);
    const restored = new Database(temporary, { readonly: true });
    try {
        if (restored.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('backup_integrity_failed');
        restored.prepare('SELECT COUNT(*) FROM publications_v3').get();
        restored.prepare('SELECT COUNT(*) FROM bags').get();
    } finally { restored.close(); }
    await rename(temporary, join(directory, name));
    const backups = (await readdir(directory)).filter(file => /^piracy-\d{4}-\d{2}-\d{2}\.sqlite$/.test(file)).sort().reverse();
    for (const obsolete of backups.slice(7)) await unlink(join(directory, obsolete));
    return { verified: true, date: name.slice(7, 17), retained: Math.min(backups.length, 7) };
}
