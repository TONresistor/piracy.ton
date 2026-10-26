export const PENDING_KEY = 'piracy.v3.pending';
export const LEGACY_PENDING_KEY = 'piracy.registration-attempt.v1';
export function readPreference(key) { try {
    return localStorage.getItem(key);
}
catch {
    return null;
} }
export function savePreference(key, value) { try {
    localStorage.setItem(key, value);
}
catch { /* Apply for this page. */ } }
export function readPending(storage, validate) {
    const saved = storage.getItem(PENDING_KEY);
    try {
        return { pending: validate(JSON.parse(saved || 'null')), discarded: false };
    }
    catch {
        storage.removeItem(PENDING_KEY);
        return { pending: null, discarded: true };
    }
}
export function savePending(storage, attempt) { storage.setItem(PENDING_KEY, JSON.stringify(attempt)); }
export function clearPending(storage) { storage.removeItem(PENDING_KEY); }
