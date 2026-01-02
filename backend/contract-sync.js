// Contract Sync - Fetches bags from BagRegistry (Tolk) and syncs to SQLite
// Architecture: Master-Item (parent-child)
// Fully decentralized - no owner

import { TonClient, Address } from '@ton/ton';
import db from './db.js';

const CONTRACT_ADDRESS = 'EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S';

// Mainnet endpoint with API key
const ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const API_KEY = process.env.TON_API_KEY || 'ef398f0b49392f753989912e93420f94715ed7ef5806dd93bffae75f3f706dc0';

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

// Category names
const CATEGORY_NAMES = ['video', 'audio', 'apps', 'games', 'books', 'other'];

// Call getter on master contract
async function callMasterGetter(method, args = []) {
    const address = Address.parse(CONTRACT_ADDRESS);
    try {
        const result = await client.runMethod(address, method, args);
        return result.stack;
    } catch (err) {
        console.error('Error calling ' + method + ':', err.message);
        return null;
    }
}

// Call getter on item contract
async function callItemGetter(itemAddress, method, args = []) {
    try {
        const result = await client.runMethod(itemAddress, method, args);
        return result.stack;
    } catch (err) {
        console.error('Error calling ' + method + ' on ' + itemAddress.toString() + ':', err.message);
        return null;
    }
}

// Get total bags count from master
async function getTotalBags() {
    const stack = await callMasterGetter('get_total');
    if (stack && stack.remaining > 0) {
        return stack.readNumber();
    }
    return 0;
}

// Get item address by index from master
async function getBagAddressByIndex(index) {
    const { TupleBuilder } = await import('@ton/core');
    const builder = new TupleBuilder();
    builder.writeNumber(BigInt(index));

    const stack = await callMasterGetter('get_bag_address', builder.build());
    if (!stack || stack.remaining === 0) return null;

    return stack.readAddress();
}

// Get bag data from item contract
// Structure: (init, bagIndex, registryAddress, bagId, nameCell, category, uploader, timestamp, active)
async function getBagDataFromItem(itemAddress) {
    const stack = await callItemGetter(itemAddress, 'get_bag_data');
    if (!stack || stack.remaining < 9) return null;

    try {
        const init = stack.readNumber() !== 0;
        const bagIndex = stack.readBigNumber();
        const registryAddress = stack.readAddress();
        const bagIdBigInt = stack.readBigNumber();
        const nameCell = stack.readCell();
        const category = stack.readNumber();
        const uploader = stack.readAddress();
        const timestamp = stack.readNumber();
        const active = stack.readNumber() !== 0;

        // Skip if not initialized
        if (!init) return null;

        // Parse bag_id to hex string
        const bagId = bagIdBigInt.toString(16).padStart(64, '0');

        // Parse name from cell
        let name = '';
        try {
            const slice = nameCell.beginParse();
            const remaining = slice.remainingBits;
            const bytes = slice.loadBuffer(Math.floor(remaining / 8));
            name = bytes.toString('utf-8');
        } catch (e) {
            console.error('Error decoding name:', e.message);
            name = 'Unknown';
        }

        const categoryName = CATEGORY_NAMES[category] || 'other';

        console.log('Decoded bag: ' + bagId.slice(0, 8) + '... name="' + name + '" category=' + categoryName + ' active=' + active);

        return {
            bag_id: bagId,
            bag_index: Number(bagIndex),
            name,
            category: categoryName,
            uploader_wallet: uploader.toString(),
            timestamp,
            active
        };
    } catch (e) {
        console.error('Error decoding bag data:', e.message);
        return null;
    }
}

// Get storage metadata from item contract
// Structure: (descriptionCell, bagSize, filesCount, files, pieceSize, merkleHash, dirNameCell)
async function getStorageMetadataFromItem(itemAddress) {
    const stack = await callItemGetter(itemAddress, 'get_storage_metadata');
    if (!stack || stack.remaining < 7) return null;

    try {
        const descriptionCell = stack.readCell();
        const bagSize = stack.readBigNumber();
        const filesCount = stack.readNumber();
        const files = stack.readCell();
        const pieceSize = stack.readNumber();
        const merkleHash = stack.readBigNumber();
        const dirNameCell = stack.readCell();

        return {
            size: Number(bagSize),
            files_count: filesCount
        };
    } catch (e) {
        console.error('Error decoding storage metadata:', e.message);
        return null;
    }
}

// Sync new bags from contract to database
export async function syncFromContract() {
    console.log('Starting contract sync (Master-Item architecture)...');
    console.log('Contract: ' + CONTRACT_ADDRESS);

    try {
        const total = await getTotalBags();
        console.log('Total bags in contract: ' + total);

        if (total === 0) {
            console.log('No bags in contract yet');
            return { synced: 0, total: 0 };
        }

        let synced = 0;
        const startIndex = lastSyncedIndex + 1;

        for (let i = startIndex; i < total; i++) {
            // Get item address from master
            const itemAddress = await getBagAddressByIndex(i);
            if (!itemAddress) {
                console.log('Could not get address for bag ' + i + ', skipping');
                continue;
            }

            console.log('Bag ' + i + ' address: ' + itemAddress.toString());

            // Get bag data from item contract
            const bag = await getBagDataFromItem(itemAddress);

            if (!bag || !bag.active) {
                console.log('Bag ' + i + ' is null or inactive, skipping');
                lastSyncedIndex = i;
                continue;
            }

            // Get storage metadata (size, files_count)
            const metadata = await getStorageMetadataFromItem(itemAddress);

            // Check if already exists
            const existing = db.prepare('SELECT id FROM bags WHERE bag_id = ?').get(bag.bag_id);
            if (existing) {
                // Update contract_index and metadata if not set
                db.prepare('UPDATE bags SET contract_index = ?, size = COALESCE(size, ?), files_count = COALESCE(files_count, ?) WHERE bag_id = ?')
                    .run(i, metadata?.size || null, metadata?.files_count || null, bag.bag_id);
                lastSyncedIndex = i;
                continue;
            }

            // Insert new bag with metadata
            try {
                const stmt = db.prepare(`
                    INSERT INTO bags (bag_id, name, category, uploader_wallet, contract_index, size, files_count, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
                `);
                stmt.run(
                    bag.bag_id,
                    bag.name,
                    bag.category,
                    bag.uploader_wallet,
                    i,
                    metadata?.size || null,
                    metadata?.files_count || null,
                    bag.timestamp
                );
                synced++;
                console.log('Synced bag ' + i + ': ' + bag.name + ' (' + (metadata?.files_count || 0) + ' files, ' + (metadata?.size || 0) + ' bytes)');
            } catch (err) {
                if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
                    console.error('Error inserting bag ' + i + ':', err.message);
                }
            }

            lastSyncedIndex = i;

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        console.log('Sync complete. Synced ' + synced + ' new bags.');
        return { synced, total };
    } catch (err) {
        console.error('Sync error:', err);
        return { synced: 0, total: 0, error: err.message };
    }
}

// Check for deleted/deactivated bags
export async function syncDeletions() {
    console.log('Checking for deactivated bags...');

    const rows = db.prepare('SELECT id, bag_id, contract_index FROM bags WHERE contract_index IS NOT NULL').all();

    for (const row of rows) {
        if (row.contract_index === null) continue;

        try {
            const itemAddress = await getBagAddressByIndex(row.contract_index);
            if (!itemAddress) continue;

            const bag = await getBagDataFromItem(itemAddress);
            if (bag && !bag.active) {
                db.prepare('DELETE FROM bags WHERE id = ?').run(row.id);
                console.log('Deleted inactive bag: ' + row.bag_id);
            }
        } catch (err) {
            console.error('Error checking bag ' + row.contract_index + ':', err.message);
        }

        await new Promise(resolve => setTimeout(resolve, 150));
    }
}

// Run sync periodically
export function startSyncLoop(intervalMs = 60000) {
    console.log('Starting sync loop (interval: ' + intervalMs + 'ms)');
    console.log('Contract: ' + CONTRACT_ADDRESS);

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
