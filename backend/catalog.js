import { normalizeSizeBytes } from './storage.js';
import db from './db.js';
import sdk from './v3-sdk.cjs';
import { publicV3Row } from './v3/repository.js';

const v2Select = `SELECT id,bag_id,name,category,size,files_count,uploader_wallet,contract_index,created_at,
    'v2' AS version,NULL AS item_address,1 AS visible,NULL AS indexed_at FROM bags`;
const v3Select = `SELECT NULL AS id,bag_id,COALESCE(NULLIF(title,''),description,SUBSTR(bag_id,1,16)) AS name,
    category,size,files_count,uploader_wallet,NULL AS contract_index,datetime(created_at,'unixepoch') AS created_at,
    'v3' AS version,item_address,visible,verified_at AS indexed_at FROM publications_v3 WHERE visible=1 AND registry_address=?`;
export function listCatalog({ version = 'all', category, q, page = 1, limit = 50 } = {}) {
    if (!['all','v2','v3'].includes(version)) throw new Error('invalid_version');
    const args = [];
    const sql = version === 'v2' ? v2Select : version === 'v3' ? v3Select : `${v2Select} UNION ALL ${v3Select}`;
    if (version !== 'v2') args.push(sdk.REGISTRY_ADDRESS);
    const where = [];
    if (typeof category === 'string' && category) { where.push('category=?'); args.push(category); }
    if (typeof q === 'string' && q) { where.push('name LIKE ?'); args.push('%' + q + '%'); }
    const condition = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const source = `SELECT * FROM (${sql})${condition}`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM (${source})`).get(...args).n;
    const bags = db.prepare(`${source} ORDER BY created_at DESC,version,item_address,id LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
    return { bags: bags.map(row => ({ ...row, size_bytes: normalizeSizeBytes(row.size) })), total, page, limit };
}
export function legacyBag(id) {
    const row = /^[a-fA-F0-9]{64}$/.test(id)
        ? db.prepare('SELECT * FROM bags WHERE bag_id=?').get(id.toLowerCase())
        : db.prepare('SELECT * FROM bags WHERE id=?').get(id);
    return row ? { ...row, size_bytes: normalizeSizeBytes(row.size), version: 'v2', visible: true } : null;
}
export function cachedPublication(address) {
    try {
        const row = db.prepare('SELECT * FROM publications_v3 WHERE item_address=? AND registry_address=?').get(sdk.normalizeAddress(address), sdk.REGISTRY_ADDRESS);
        return row ? publicV3Row(row) : null;
    } catch { return null; }
}
