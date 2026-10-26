export function createV3ReadCache() {
    return { config: {}, publications: new Map(), retryUntil: 0, retryError: null };
}
const sharedReadCache = createV3ReadCache();
export const readCache = custom => custom.readCache ?? (custom.client ? null : sharedReadCache);
export const now = custom => custom.now?.() ?? Date.now();
function retryDelay(error, time) {
    const header = error.response?.headers?.['retry-after'];
    const seconds = Number(header);
    const delay = header ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - time) : 2000;
    return Math.max(2000, Number.isFinite(delay) ? delay : 2000);
}
export async function cachedRead(cache, entry, custom, fresh, load, ttl) {
    if (!cache) return load();
    // A transaction preparation must not reuse a snapshot that was already in flight.
    if (fresh && entry.pending) await entry.pending.catch(() => {});
    if (entry.pending) return entry.pending;
    const time = now(custom);
    if (entry.error && entry.until > time) throw entry.error;
    if (!fresh && entry.hasValue && entry.until > time) return entry.value;
    if (cache.retryUntil > time) throw cache.retryError;
    const pending = Promise.resolve().then(load).then(value => {
        Object.assign(entry, { value, hasValue: true, error: null, until: now(custom) + ttl(value) });
        return value;
    }, error => {
        const time = now(custom);
        const delay = retryDelay(error, time);
        Object.assign(entry, { hasValue: false, error, until: time + delay });
        if (error.response?.status === 429) {
            cache.retryUntil = time + delay;
            cache.retryError = error;
        }
        throw error;
    }).finally(() => { if (entry.pending === pending) entry.pending = null; });
    entry.pending = pending;
    return pending;
}
export function publicationEntry(cache, address) {
    if (!cache) return {};
    if (cache.publications.has(address)) {
        const entry = cache.publications.get(address);
        cache.publications.delete(address);
        cache.publications.set(address, entry);
        return entry;
    }
    if (cache.publications.size >= 512) {
        const oldest = [...cache.publications].find(([, entry]) => !entry.pending);
        if (oldest) cache.publications.delete(oldest[0]);
        else return {}; // Do not grow the cache when every retained read is in flight.
    }
    const entry = {};
    cache.publications.set(address, entry);
    return entry;
}

