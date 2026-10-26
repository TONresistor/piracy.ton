import { createHash } from 'node:crypto';
import db from './db.js';
import sdk from './v3-sdk.cjs';
import { cachedPublication } from './catalog.js';
import { enqueueJob, readRuntime, waitForJob, workerHealth, JobError } from './jobs.js';
import { readBagMetadata, TonStorageUnavailableError } from './storage.js';
import { validateV3Transaction } from './v3/transactions.js';
import { V3Error } from './v3/errors.js';

export function getApiConfig() {
    const snapshot = readRuntime('v3-config');
    if (snapshot && Date.now() - snapshot.updatedAt < 60000 && workerHealth().healthy) return snapshot.value;
    return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, ready: false, status: 'unavailable' };
}
export async function getApiPublication(value) {
    let address;
    try { address = sdk.normalizeAddress(value); } catch { throw new V3Error('invalid_address'); }
    const key = 'publication:' + address;
    const cached = cachedPublication(address);
    try { enqueueJob.immediate(key, 'publication', { address }, { priority: 20, ttl: 2000 }); }
    catch (error) { if (!cached) throw error; }
    if (cached) return cached;
    try { await waitForJob(key); }
    catch (error) {
        if (error instanceof JobError) throw new V3Error(error.code, error.status);
        throw new V3Error('chain_unavailable', 503);
    }
    return cachedPublication(address);
}
export async function getApiBagInfo(bagId, includeFiles) {
    const key = 'storage:' + bagId;
    const cached = readBagMetadata(bagId, includeFiles, true);
    const row = db.prepare('SELECT fetched_at,peers_checked_at FROM bag_metadata WHERE bag_id=?').get(bagId);
    if (!row || Date.now() - row.peers_checked_at >= 60000 || !cached) {
        try { enqueueJob.immediate(key, 'storage', { bagId }, { priority: 15, ttl: cached ? 60000 : 2000 }); }
        catch (error) { if (!cached) throw error; }
    }
    if (cached) return { ...cached, metadata_updated_at: row.fetched_at };
    try {
        const result = await waitForJob(key);
        if (!result) return null;
        const info = readBagMetadata(bagId, includeFiles, true);
        const latest = db.prepare('SELECT fetched_at FROM bag_metadata WHERE bag_id=?').get(bagId);
        return info ? { ...info, metadata_updated_at: latest.fetched_at } : null;
    } catch { throw new TonStorageUnavailableError(); }
}
export function getApiReceipt(input) {
    const { externalMessageHash, payloadHash } = validateV3Transaction(input);
    if (Date.now() / 1000 > input.validUntil + 1800) return { state: 'pending' };
    const identity = createHash('sha256').update(externalMessageHash + payloadHash + input.operation + input.bagId + input.validUntil).digest('hex');
    const job = enqueueJob.immediate('transaction:' + identity, 'transaction', input, { priority: 30, ttl: 86400000 });
    return job.result || { state: 'pending' };
}
