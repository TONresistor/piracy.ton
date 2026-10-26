import db from '../db.js';
import { normalizeSizeBytes } from '../storage.js';

const upsert = db.prepare(`INSERT INTO publications_v3
    (item_address,registry_address,uploader_wallet,bag_id,title,category,visible,revision,created_at,size,files_count,description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_address) DO UPDATE SET
    title=excluded.title,category=excluded.category,visible=excluded.visible,revision=excluded.revision,
    size=COALESCE(excluded.size,publications_v3.size),files_count=COALESCE(excluded.files_count,publications_v3.files_count),
    description=COALESCE(excluded.description,publications_v3.description)`);
export function publicV3Row(row) {
    return { ...row, size_bytes: normalizeSizeBytes(row.size), version: 'v3', name: row.title || row.description || row.bag_id.slice(0, 16), visible: Boolean(row.visible),
        indexed_at: row.verified_at ?? 0, created_at: new Date(row.created_at * 1000).toISOString() };
}
const readStoredPublication = db.prepare('SELECT * FROM publications_v3 WHERE item_address=?');
export const persistPublication = db.transaction((address, item, info) => {
    const stored = readStoredPublication.get(address);
    if (stored && BigInt(stored.revision) > BigInt(item.revision)) return publicV3Row(stored);
    upsert.run(address, item.registry, item.uploader, item.bagId, item.title, item.category,
        item.visible ? 1 : 0, item.revision, item.createdAt, info?.size ?? info?.bag_size ?? null,
        info?.files_count ?? null, info?.description ?? null);
    db.prepare('UPDATE publications_v3 SET verified_at=? WHERE item_address=?').run(Date.now(), address);
    return publicV3Row(readStoredPublication.get(address));
});

export function readScanState(registry) {
    const last = db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(registry)?.value;
    const saved = db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(registry + ':scan');
    return { last, scan: saved ? JSON.parse(saved.value) : {} };
}
export const saveDiscoveries = db.transaction((registry, addresses, { completed, newest, lt, hash }) => {
    for (const address of addresses) db.prepare('INSERT OR IGNORE INTO v3_pending_items(item_address) VALUES (?)').run(address);
    if (completed) {
        if (newest) saveRefreshCursor(registry, newest);
        db.prepare('DELETE FROM v3_sync_state WHERE key=?').run(registry + ':scan');
    } else saveRefreshCursor(registry + ':scan', JSON.stringify({ lt, hash, newest }));
});
export function duePendingItems(time) {
    return db.prepare('SELECT item_address FROM v3_pending_items WHERE next_check<=? ORDER BY next_check,item_address LIMIT 50').all(time);
}
export function postponePendingItem(address, time) {
    db.prepare('UPDATE v3_pending_items SET next_check=? WHERE item_address=?').run(time, address);
}
export function completePendingItem(address) { db.prepare('DELETE FROM v3_pending_items WHERE item_address=?').run(address); }
export function pendingItemAddresses() { return new Set(db.prepare('SELECT item_address FROM v3_pending_items').all().map(row => row.item_address)); }
export function readRefreshCursor(key) { return db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(key)?.value ?? ''; }
export function saveRefreshCursor(key, value) {
    db.prepare('INSERT INTO v3_sync_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
export function knownRefreshBatch(registry, cursor) {
    const batch = db.prepare('SELECT item_address FROM publications_v3 WHERE registry_address=? AND item_address>? ORDER BY item_address LIMIT 50').all(registry, cursor);
    if (batch.length < 50) batch.push(...db.prepare('SELECT item_address FROM publications_v3 WHERE registry_address=? AND item_address<=? ORDER BY item_address LIMIT ?').all(registry, cursor, 50 - batch.length));
    return batch;
}
