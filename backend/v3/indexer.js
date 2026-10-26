import { Address } from '@ton/core';
import sdk from '../v3-sdk.cjs';
import { deps } from './context.js';
import { now, readCache } from './cache.js';
import { getV3Config, refreshPublication } from './publications.js';
import { readScanState, saveDiscoveries, duePendingItems, postponePendingItem, completePendingItem, pendingItemAddresses, readRefreshCursor, saveRefreshCursor, knownRefreshBatch } from './repository.js';

async function forEachBounded(rows, operation, stopped) {
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(2, rows.length) }, async () => {
        while (index < rows.length && !stopped()) await operation(rows[index++]);
    }));
}
let syncing = false;
export async function syncV3(custom = {}) {
    if (syncing) return;
    syncing = true;
    try {
        const d = deps(custom);
        if (!(await getV3Config(custom)).ready) return { ready: false };
        const cursorKey = sdk.REGISTRY_ADDRESS;
        const { last, scan } = readScanState(cursorKey);
        let { lt, hash, newest } = scan;
        let completed = false;
        const addresses = new Set();
        for (let page = 0; page < 10; page++) {
            const batch = await d.client.getTransactions(Address.parse(cursorKey), { limit: 50, archival: true, ...(lt ? { lt, hash } : {}) });
            if (!batch.length) { completed = true; break; }
            newest ||= batch[0].lt.toString();
            for (const tx of batch) {
                if (last && BigInt(tx.lt) <= BigInt(last)) { completed = true; break; }
                for (const msg of tx.outMessages.values()) {
                    if (msg.info.type !== 'internal' || msg.body.beginParse().remainingBits < 32) continue;
                    if (msg.body.beginParse().preloadUint(32) !== 0x494e4933) continue;
                    const decoded = sdk.decodeInitialization(msg.body.toBoc().toString('base64'));
                    const expected = sdk.publicationAddress(decoded.uploader, decoded.bagId);
                    if (msg.info.dest.toRawString() === expected) addresses.add(expected);
                }
            }
            if (completed) break;
            const tail = batch.at(-1);
            const nextLt = tail.lt.toString();
            if (nextLt === lt) throw new Error('transaction_pagination_stalled');
            lt = nextLt; hash = tail.hash().toString('base64');
            if (batch.length < 50) { completed = true; break; }
        }
        // Discoveries are durable before moving the history cursor. A failed child
        // stays pending without blocking unrelated publications or future pages.
        saveDiscoveries.immediate(cursorKey, addresses, { completed, newest, lt, hash });
        const cache = readCache(custom);
        const stopped = () => cache && cache.retryUntil > now(custom);
        const processed = new Set();
        let refreshed = 0, refreshErrors = 0;
        const pending = duePendingItems(now(custom));
        await forEachBounded(pending, async row => {
            processed.add(row.item_address);
            postponePendingItem(row.item_address, now(custom) + 60000);
            try {
                if (await refreshPublication(row.item_address, custom)) { completePendingItem(row.item_address); refreshed++; }
            } catch { refreshErrors++; /* Continue other publications before reporting degraded indexing. */ }
        }, stopped);
        const refreshKey = cursorKey + ':refresh';
        const cursor = readRefreshCursor(refreshKey);
        const batch = knownRefreshBatch(cursorKey, cursor);
        const pendingAddresses = pendingItemAddresses();
        let lastVisited;
        await forEachBounded(batch, async row => {
            lastVisited = row.item_address;
            if (processed.has(row.item_address) || pendingAddresses.has(row.item_address)) return;
            try { if (await refreshPublication(row.item_address, custom)) refreshed++; }
            catch { refreshErrors++; }
        }, stopped);
        if (lastVisited) saveRefreshCursor(refreshKey, lastVisited);
        return { ready: true, refreshed, refreshErrors };
    } finally { syncing = false; }
}
