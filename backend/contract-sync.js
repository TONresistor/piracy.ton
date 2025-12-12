// Contract Sync - Fetches bags from BagRegistry contract and syncs to SQLite
import { TonClient, Address } from '@ton/ton';
import db from './db.js';

// Contract address
const CONTRACT_ADDRESS = 'EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz';

// Mainnet endpoint
const ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const API_KEY = process.env.TON_API_KEY || '';

const client = new TonClient({
    endpoint: ENDPOINT,
    apiKey: API_KEY || undefined
});

// Track last synced index
let lastSyncedIndex = getLastSyncedIndex();

function getLastSyncedIndex() {
    const row = db.prepare('SELECT MAX(contract_index) as last_index FROM bags WHERE contract_index IS NOT NULL').get();
    return row?.last_index ?? -1;
}

// Decode BagEntry from contract response (TupleReader from tuple)
function decodeBagEntry(tuple) {
    // Tuple contains: bag_id (Int), name (Cell), category (Int), uploader (Slice/Cell), timestamp (Int), active (Int)
    if (!tuple || tuple.remaining < 6) return null;

    try {
        // Access items directly since TupleReader can be tricky
        const items = tuple.items;

        // 0: bag_id (bigint)
        const bagIdBigInt = items[0];
        const bagId = bagIdBigInt.toString(16).padStart(64, '0');

        // 1: name (Cell/Slice) - parse as raw string bytes
        let name = '';
        try {
            const nameCell = items[1];
            if (nameCell && typeof nameCell.beginParse === 'function') {
                const slice = nameCell.beginParse();
                const remaining = slice.remainingBits;
                const bytes = slice.loadBuffer(Math.floor(remaining / 8));
                name = bytes.toString('utf-8');
            }
        } catch (e) {
            console.error('Error decoding name:', e.message);
            name = 'Unknown';
        }

        // 2: category (bigint)
        const category = Number(items[2]);
        const categoryNames = ['video', 'audio', 'apps', 'games', 'books', 'other'];
        const categoryName = categoryNames[category] || 'other';

        // 3: uploader (Cell/Slice containing address)
        let uploaderStr = '';
        try {
            const uploaderCell = items[3];
            if (uploaderCell && typeof uploaderCell.beginParse === 'function') {
                const slice = uploaderCell.beginParse();
                const addr = slice.loadAddress();
                uploaderStr = addr ? addr.toString() : '';
            }
        } catch (e) {
            console.error('Error decoding uploader:', e.message);
        }

        // 4: timestamp (bigint)
        const timestamp = Number(items[4]);

        // 5: active (bigint, -1 = true, 0 = false in TVM)
        const active = items[5] !== 0n;

        console.log(`Decoded bag: ${bagId.slice(0, 8)}... name="${name}" category=${categoryName} active=${active}`);

        return {
            bag_id: bagId,
            name,
            category: categoryName,
            uploader_wallet: uploaderStr,
            timestamp,
            active
        };
    } catch (e) {
        console.error('Error decoding bag entry:', e.message);
        return null;
    }
}

// Call contract getter
async function callGetter(method, args = []) {
    const address = Address.parse(CONTRACT_ADDRESS);

    try {
        const result = await client.runMethod(address, method, args);
        return result.stack;
    } catch (err) {
        console.error(`Error calling ${method}:`, err.message);
        return null;
    }
}

// Get total bags count
async function getTotalBags() {
    const stack = await callGetter('get_total');
    if (stack && stack.remaining > 0) {
        return stack.readNumber();
    }
    return 0;
}

// Get bag by index
async function getBagByIndex(index) {
    const { TupleBuilder } = await import('@ton/core');
    const builder = new TupleBuilder();
    builder.writeNumber(BigInt(index));

    const stack = await callGetter('get_bag', builder.build());
    if (!stack || stack.remaining === 0) return null;

    // Result is a tuple, read it first
    const tuple = stack.readTuple();
    return decodeBagEntry(tuple);
}

// Sync new bags from contract to database
export async function syncFromContract() {
    console.log('Starting contract sync...');

    try {
        const total = await getTotalBags();
        console.log(`Total bags in contract: ${total}`);

        if (total === 0) {
            console.log('No bags in contract yet');
            return { synced: 0, total: 0 };
        }

        let synced = 0;
        const startIndex = lastSyncedIndex + 1;

        for (let i = startIndex; i < total; i++) {
            const bag = await getBagByIndex(i);

            if (!bag || !bag.active) {
                console.log(`Bag ${i} is null or inactive, skipping`);
                continue;
            }

            // Check if already exists
            const existing = db.prepare('SELECT id FROM bags WHERE bag_id = ?').get(bag.bag_id);
            if (existing) {
                // Update contract_index if not set
                db.prepare('UPDATE bags SET contract_index = ? WHERE bag_id = ?').run(i, bag.bag_id);
                continue;
            }

            // Insert new bag
            try {
                const stmt = db.prepare(`
                    INSERT INTO bags (bag_id, name, category, uploader_wallet, contract_index, created_at)
                    VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
                `);
                stmt.run(bag.bag_id, bag.name, bag.category, bag.uploader_wallet, i, bag.timestamp);
                synced++;
                console.log(`Synced bag ${i}: ${bag.name}`);
            } catch (err) {
                if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
                    console.error(`Error inserting bag ${i}:`, err.message);
                }
            }

            lastSyncedIndex = i;

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`Sync complete. Synced ${synced} new bags.`);
        return { synced, total };
    } catch (err) {
        console.error('Sync error:', err);
        return { synced: 0, total: 0, error: err.message };
    }
}

// Check for deleted bags (soft-delete sync)
export async function syncDeletions() {
    const rows = db.prepare('SELECT id, bag_id, contract_index FROM bags WHERE contract_index IS NOT NULL').all();

    for (const row of rows) {
        if (row.contract_index === null) continue;

        const bag = await getBagByIndex(row.contract_index);
        if (bag && !bag.active) {
            db.prepare('DELETE FROM bags WHERE id = ?').run(row.id);
            console.log(`Deleted inactive bag: ${row.bag_id}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Run sync periodically
export function startSyncLoop(intervalMs = 60000) {
    console.log(`Starting sync loop (interval: ${intervalMs}ms)`);

    // Initial sync
    syncFromContract();

    // Periodic sync
    setInterval(() => {
        syncFromContract();
    }, intervalMs);

    // Check deletions less frequently
    setInterval(() => {
        syncDeletions();
    }, intervalMs * 5);
}
