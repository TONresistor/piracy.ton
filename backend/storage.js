import db from './db.js';

const TON_STORAGE_API = process.env.STORAGE_API_URL || 'http://127.0.0.1:8195/api/v1';
const STORAGE_HEADERS = (process.env.STORAGE_API_LOGIN && process.env.STORAGE_API_PASSWORD)
    ? { Authorization: 'Basic ' + Buffer.from(`${process.env.STORAGE_API_LOGIN}:${process.env.STORAGE_API_PASSWORD}`).toString('base64') }
    : {};

export class TonStorageUnavailableError extends Error {
    constructor(status = null) {
        super('TON Storage API unavailable');
        this.name = 'TonStorageUnavailableError';
        this.status = status;
    }
}

export const STORAGE_CACHE_LIMIT = 512;
function cacheGet(cache, key, ttl) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at >= ttl) { cache.delete(key); return null; }
    cache.delete(key);
    cache.set(key, entry);
    return entry;
}
function cacheSet(cache, key, entry, ttl) {
    for (const [candidate, value] of cache) {
        if (Date.now() - value.at >= ttl) cache.delete(candidate);
    }
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > STORAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
}
const detailsInFlight = new Map();
const bagDetailsCache = new Map();
const bagInfoCache = new Map();
export const BAG_DETAILS_TTL_MS = 24 * 60 * 60 * 1000;
export const BAG_INFO_TTL_MS = 60_000;

const persistMissingBagMetadata = db.prepare(`
    UPDATE bags
    SET size = ?, files_count = ?
    WHERE bag_id = ?
      AND (size IS NULL OR CAST(size AS INTEGER) <= 0 OR files_count IS NULL OR files_count <= 0)
`);

function storageUrl(bagId) {
    return `${TON_STORAGE_API}/details?bag_id=${encodeURIComponent(bagId)}`;
}

function fetchStorageDetails(bagId, timeoutMs) {
    const key = `${bagId}:${timeoutMs}`;
    if (detailsInFlight.has(key)) return detailsInFlight.get(key);
    const request = requestStorageDetails(bagId, timeoutMs).finally(() => detailsInFlight.delete(key));
    detailsInFlight.set(key, request);
    return request;
}
async function requestStorageDetails(bagId, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(storageUrl(bagId), {
            signal: controller.signal,
            headers: STORAGE_HEADERS
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new TonStorageUnavailableError(response.status);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function immutableDetails(data, includeFiles) {
    const details = {
        description: data.description || null,
        size: data.size ?? data.bag_size ?? null,
        bag_size: data.bag_size ?? data.size ?? null,
        files_count: data.files_count ?? null,
        piece_size: data.piece_size ?? null,
        merkle_hash: data.merkle_hash || null,
        dir_name: data.dir_name || ''
    };
    if (includeFiles && Array.isArray(data.files)) details.files = data.files;
    return details;
}

function peerCount(data) {
    const remotes = Array.isArray(data.peers) ? data.peers.length : 0;
    return remotes + (data.seeding && data.active ? 1 : 0);
}

export function readBagMetadata(bagId, includeFiles = false, allowStale = false) {
    const row = db.prepare('SELECT * FROM bag_metadata WHERE bag_id=?').get(bagId);
    if (!row || (!allowStale && Date.now() - row.fetched_at >= BAG_DETAILS_TTL_MS)) return null;
    const info = JSON.parse(row.details_json);
    if (includeFiles && !Array.isArray(info.files)) return null;
    if (!includeFiles) delete info.files;
    return { ...info, peers_count: Date.now() - row.peers_checked_at < BAG_INFO_TTL_MS ? row.peers_count : null };
}
function persistMetadata(bagId, data, includeFiles) {
    const existing = db.prepare('SELECT details_json FROM bag_metadata WHERE bag_id=?').get(bagId);
    const details = { ...(existing ? JSON.parse(existing.details_json) : {}), ...immutableDetails(data, includeFiles) };
    const time = Date.now();
    db.prepare(`INSERT INTO bag_metadata VALUES(?,?,?,?,?) ON CONFLICT(bag_id) DO UPDATE SET
        details_json=excluded.details_json,fetched_at=excluded.fetched_at,peers_count=excluded.peers_count,peers_checked_at=excluded.peers_checked_at`)
        .run(bagId, JSON.stringify(details), time, peerCount(data), time);
    db.prepare(`UPDATE publications_v3 SET size=?,files_count=?,description=? WHERE bag_id=?`)
        .run(details.size, details.files_count, details.description, bagId);
    persistMissingBagMetadata.run(details.size, details.files_count, bagId);
}
export async function refreshBagMetadata(bagId) {
    const data = await fetchStorageDetails(bagId, 5000);
    if (!data) return null;
    persistMetadata(bagId, data, true);
    return readBagMetadata(bagId, true);
}

export async function getBagInfo(bagId, includeFiles = false, strict = false) {
    const durable = readBagMetadata(bagId, includeFiles);
    if (durable) return durable;
    const cacheKey = `${bagId}:${includeFiles ? 'files' : 'summary'}`;
    const cached = cacheGet(bagDetailsCache, cacheKey, BAG_DETAILS_TTL_MS);
    if (cached) {
        return {
            ...cached.value,
            peers_count: cacheGet(bagInfoCache, bagId, BAG_INFO_TTL_MS)?.value.peers_count ?? null
        };
    }

    try {
        const data = await fetchStorageDetails(bagId, 5000);
        if (!data) return null;
        persistMetadata(bagId, data, includeFiles);
        const immutable = immutableDetails(data, includeFiles);
        const peers_count = peerCount(data);
        cacheSet(bagDetailsCache, cacheKey, { value: immutable, at: Date.now() }, BAG_DETAILS_TTL_MS);
        cacheSet(bagInfoCache, bagId, {
            value: {
                size: immutable.size,
                files_count: immutable.files_count,
                peers_count
            },
            at: Date.now()
        }, BAG_INFO_TTL_MS);
        return { ...immutable, peers_count };
    } catch (error) {
        if (error.name !== 'AbortError' && !(error instanceof TonStorageUnavailableError)) {
            console.warn('Could not fetch bag details from TON Storage:', error.message);
        }
        if (strict) {
            throw error instanceof TonStorageUnavailableError
                ? error
                : new TonStorageUnavailableError();
        }
        return null;
    }
}

export function formatSize(bytes) {
    let value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[index];
}

export function getCachedBagSummary(bagId) {
    const stored = db.prepare('SELECT details_json,peers_count,peers_checked_at FROM bag_metadata WHERE bag_id=?').get(bagId);
    if (stored) {
        const details = JSON.parse(stored.details_json);
        return { size: details.size, files_count: details.files_count, peers_count: Date.now() - stored.peers_checked_at < BAG_INFO_TTL_MS ? stored.peers_count : null };
    }
    return cacheGet(bagInfoCache, bagId, BAG_INFO_TTL_MS)?.value || null;
}

// Decimal strings preserve integer byte counts beyond JavaScript's safe range.
export function normalizeSizeBytes(value) {
    if (value === null || value === undefined || value === '') return null;
    const match = String(value).trim().match(/^(\d+)(?:\.(\d+))?\s*(B|KB|MB|GB|TB)?$/i);
    if (!match) return null;
    const unit = ['B', 'KB', 'MB', 'GB', 'TB'].indexOf((match[3] || 'B').toUpperCase());
    const fraction = match[2] || '';
    const bytes = BigInt(match[1] + fraction) * 1024n ** BigInt(unit) / 10n ** BigInt(fraction.length);
    return bytes <= 0xffffffffffffffffn ? bytes.toString() : null;
}
