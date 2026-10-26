
import { createTonClient } from './rpc.js';
import { Address, TupleBuilder, beginCell, storeMessage } from '@ton/core';
import db from './db.js';

export const CONTRACT_ADDRESS = 'EQBWQyOuZimuWhx5w0lOvPnfXYZLzICzV_EL7rWBLRQVPI9g';
export const REGISTRATION_FEE = 100000000n;

const ENDPOINT = process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC';
const API_KEY = process.env.TONCENTER_MAINNET_API_KEY || process.env.TON_API_KEY;
const configuredTimeout = Number(process.env.TON_RPC_TIMEOUT_MS || 10000);
const RPC_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10000;
const TRANSACTION_PAGE_SIZE = 50;
const TRANSACTION_LOOKUP_RETRIES = 3;
const TRANSACTION_LOOKUP_RETRY_DELAY_MS = 1000;

if (!API_KEY) {
    console.warn('[contract-sync] No TONCENTER_MAINNET_API_KEY set — TonCenter will rate-limit aggressively.');
}

const client = createTonClient({ endpoint: ENDPOINT, apiKey: API_KEY, timeout: RPC_TIMEOUT_MS });

// Verbose sync logs are gated behind DEBUG to keep production logs clean.
// Errors/warnings always use console.error/console.warn and are never gated.
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
const log = (...args) => { if (DEBUG) console.log(...args); };

async function retryTonRpc(operation, dependencies = {}) {
    const sleep = dependencies.sleep || (delay => new Promise(resolve => setTimeout(resolve, delay)));
    let lastError;
    for (let attempt = 0; attempt < TRANSACTION_LOOKUP_RETRIES; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt + 1 < TRANSACTION_LOOKUP_RETRIES) {
                await sleep(TRANSACTION_LOOKUP_RETRY_DELAY_MS);
            }
        }
    }
    throw lastError;
}

let lastSyncedIndex = getLastSyncedIndex();

// Concurrency guards: a sync can take longer than the loop interval (RPC + a
// 150ms delay per bag). Without these, the interval loop and a manual /api/sync
// trigger could overlap and race on lastSyncedIndex, producing duplicates/skips.
let isSyncing = false;
let isSyncingDeletions = false;

function getLastSyncedIndex() {
    const row = db.prepare(`
        SELECT value FROM sync_state WHERE key = 'contract_bags_cursor'
    `).get();
    return row?.value ?? -1;
}

function advanceSyncCursor(index) {
    db.prepare(`
        UPDATE sync_state SET value = ?
        WHERE key = 'contract_bags_cursor' AND value < ?
    `).run(index, index);
    lastSyncedIndex = index;
}

const CATEGORY_NAMES = ['video', 'audio', 'apps', 'games', 'books', 'other'];

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

async function callItemGetter(itemAddress, method, args = []) {
    try {
        const result = await client.runMethod(itemAddress, method, args);
        return result.stack;
    } catch (err) {
        console.error('Error calling ' + method + ' on ' + itemAddress.toString() + ':', err.message);
        return null;
    }
}

export async function getTotalBagsStrict() {
    const stack = await callMasterGetter('get_total');
    if (!stack || stack.remaining === 0) throw new Error('Could not read BagRegistry.get_total');
    return stack.readNumber();
}

export async function getBagAddressByIndex(index) {
    const builder = new TupleBuilder();
    builder.writeNumber(BigInt(index));

    const stack = await callMasterGetter('get_bag_address', builder.build());
    if (!stack || stack.remaining === 0) return null;
    return stack.readAddress();
}

function decodeTextCell(cell) {
    try {
        return cell.beginParse().loadStringTail();
    } catch {
        return '';
    }
}

export async function getBagDataFromItem(itemAddress) {
    const stack = await callItemGetter(itemAddress, 'get_bag_data');
    if (!stack || stack.remaining < 9) return null;

    try {
        const isInitialized = stack.readNumber() !== 0;
        const bagIndex = stack.readBigNumber();
        stack.readAddress();

        if (!isInitialized) {
            return null;
        }

        const bagIdBigInt = stack.readBigNumber();
        const nameCell = stack.readCell();
        const category = stack.readNumber();
        const uploader = stack.readAddress();
        const timestamp = stack.readNumber();
        const active = stack.readNumber() !== 0;

        const bagId = bagIdBigInt.toString(16).padStart(64, '0');

        const name = decodeTextCell(nameCell);

        const categoryName = CATEGORY_NAMES[category] || 'other';

        log('Decoded bag: ' + bagId.slice(0, 8) + '... name="' + name + '" category=' + categoryName + ' active=' + active);

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

export async function getStorageMetadataFromItem(itemAddress) {
    const stack = await callItemGetter(itemAddress, 'get_storage_metadata');
    if (!stack || stack.remaining < 8) return null;

    try {
        const isInitialized = stack.readNumber() !== 0;
        if (!isInitialized) return null;

        const descriptionCell = stack.readCell();
        const bagSize = stack.readBigNumber();
        const filesCount = stack.readNumber();
        stack.readCell();
        const pieceSize = stack.readNumber();
        const merkleHash = stack.readBigNumber();
        const dirNameCell = stack.readCell();

        return {
            size: bagSize.toString(),
            bag_size: bagSize.toString(),
            files_count: filesCount,
            piece_size: pieceSize,
            merkle_hash: merkleHash.toString(16).padStart(64, '0'),
            description: decodeTextCell(descriptionCell),
            dir_name: decodeTextCell(dirNameCell)
        };
    } catch (e) {
        console.error('Error decoding storage metadata:', e.message);
        return null;
    }
}

export function normalizedExternalMessageHash(message) {
    if (message?.info?.type !== 'external-in') {
        throw new Error('Expected an external-in message');
    }
    const normalized = {
        ...message,
        init: null,
        info: {
            ...message.info,
            src: undefined,
            importFee: 0n
        }
    };
    return beginCell()
        .store(storeMessage(normalized, { forceRef: true }))
        .endCell()
        .hash()
        .toString('hex');
}

export function transactionOutcome(transaction) {
    const description = transaction.description;
    if (description.type !== 'generic') {
        return { success: false, exitCode: -1 };
    }
    const compute = description.computePhase;
    if (compute.type !== 'vm' || !compute.success || compute.exitCode !== 0) {
        return { success: false, exitCode: compute.type === 'vm' ? compute.exitCode : -1 };
    }
    if (description.aborted || (description.actionPhase && !description.actionPhase.success)) {
        return {
            success: false,
            exitCode: description.actionPhase?.resultCode ?? -1
        };
    }
    return { success: true, exitCode: 0 };
}

function findRegistryMessage(transaction, payloadHash) {
    const registry = Address.parse(CONTRACT_ADDRESS);
    for (const message of transaction.outMessages.values()) {
        if (message.info.type !== 'internal') continue;
        if (!message.info.dest.equals(registry)) continue;
        if (message.info.value.coins < REGISTRATION_FEE) continue;
        if (message.body.hash().toString('hex') !== payloadHash) continue;
        return message;
    }
    return null;
}

export async function locateRegistrationTransactions({
    walletAddress,
    payloadHash,
    externalMessageHash,
    createdAfter
}, dependencies = {}) {
    const transactionClient = dependencies.client || client;
    const wallet = Address.parse(walletAddress);
    const cutoff = createdAfter - 60;
    let lt;
    let hash;
    let previousCursor;

    while (true) {
        const options = { limit: TRANSACTION_PAGE_SIZE, archival: true };
        if (lt && hash) Object.assign(options, { lt, hash });
        const transactions = await retryTonRpc(
            () => transactionClient.getTransactions(wallet, options),
            dependencies
        );
        if (transactions.length === 0) return { state: 'PENDING' };

        for (const transaction of transactions) {
            // Account history is returned newest first. Once the lookup crosses
            // the attempt boundary, every following transaction is too old.
            if (transaction.now < cutoff) return { state: 'PENDING' };
            if (externalMessageHash) {
                if (!transaction.inMessage || transaction.inMessage.info.type !== 'external-in') continue;
                if (normalizedExternalMessageHash(transaction.inMessage) !== externalMessageHash) continue;
            }

            const registryMessage = findRegistryMessage(transaction, payloadHash);
            if (!registryMessage) {
                if (externalMessageHash) {
                    const outcome = transactionOutcome(transaction);
                    return {
                        state: 'REJECTED',
                        exitCode: outcome.exitCode,
                        errorCode: 'wallet_did_not_send_registry_message',
                        walletTxHash: transaction.hash().toString('hex')
                    };
                }
                continue;
            }

            const walletOutcome = transactionOutcome(transaction);
            if (!walletOutcome.success) {
                return {
                    state: 'REJECTED',
                    exitCode: walletOutcome.exitCode,
                    errorCode: 'wallet_transaction_failed',
                    walletTxHash: transaction.hash().toString('hex')
                };
            }

            try {
                const registryTransaction = await retryTonRpc(
                    () => transactionClient.tryLocateResultTx(
                        wallet,
                        Address.parse(CONTRACT_ADDRESS),
                        registryMessage.info.createdLt.toString()
                    ),
                    dependencies
                );
                const registryOutcome = transactionOutcome(registryTransaction);
                return {
                    state: registryOutcome.success ? 'EXECUTED' : 'REJECTED',
                    exitCode: registryOutcome.exitCode,
                    errorCode: registryOutcome.success ? null : 'registry_transaction_failed',
                    walletTxHash: transaction.hash().toString('hex'),
                    registryTxHash: registryTransaction.hash().toString('hex')
                };
            } catch {
                return {
                    state: 'PENDING',
                    walletTxHash: transaction.hash().toString('hex')
                };
            }
        }

        const last = transactions.at(-1);
        const nextLt = last.lt.toString();
        const nextHash = last.hash().toString('base64');
        const cursor = `${nextLt}:${nextHash}`;
        if (cursor === previousCursor) return { state: 'PENDING' };
        previousCursor = cursor;
        lt = nextLt;
        hash = nextHash;
    }
}

async function findRegisteredBagInSnapshot({
    baselineIndex,
    bagId,
    walletAddress,
    name,
    category,
    metadata,
    createdAfter
}, total, readItem) {
    const expectedUploader = Address.parse(walletAddress);
    const start = Math.max(0, Number(baselineIndex));

    for (let index = start; index < total; index += 1) {
        const item = await readItem(index);
        if (!item) continue;
        const { itemAddress, bag } = item;
        if (bag.bag_id !== bagId || bag.name !== name || bag.category !== category) continue;
        if (bag.timestamp < createdAfter - 60) continue;
        if (!Address.parse(bag.uploader_wallet).equals(expectedUploader)) continue;

        const stored = await item.readStorage();
        if (!stored) continue;
        if (stored.bag_size !== String(metadata.bagSize)) continue;
        if (stored.files_count !== Number(metadata.filesCount)) continue;
        if (stored.piece_size !== Number(metadata.pieceSize)) continue;
        if (stored.merkle_hash !== metadata.merkleHash) continue;
        if (stored.description !== metadata.description) continue;
        if (stored.dir_name !== metadata.dirName) continue;

        return {
            bagIndex: index,
            bagItemAddress: itemAddress.toString(),
            timestamp: bag.timestamp
        };
    }
    return null;
}

export async function createRegisteredBagLookup(dependencies = {}) {
    const readTotal = dependencies.getTotalBagsStrict || getTotalBagsStrict;
    const readAddress = dependencies.getBagAddressByIndex || getBagAddressByIndex;
    const readBag = dependencies.getBagDataFromItem || getBagDataFromItem;
    const readStorage = dependencies.getStorageMetadataFromItem || getStorageMetadataFromItem;
    const total = await readTotal();
    const itemReads = new Map();

    const readItem = index => {
        if (!itemReads.has(index)) {
            itemReads.set(index, (async () => {
                const itemAddress = await readAddress(index);
                if (!itemAddress) return null;
                const bag = await readBag(itemAddress);
                if (!bag) return null;
                let storageRead;
                return {
                    itemAddress,
                    bag,
                    readStorage() {
                        storageRead ||= readStorage(itemAddress);
                        return storageRead;
                    }
                };
            })());
        }
        return itemReads.get(index);
    };

    // BagItems are content-addressed and immutable. One reconciliation batch
    // can therefore safely share every registry and item read across attempts.
    return criteria => findRegisteredBagInSnapshot(criteria, total, readItem);
}

export async function findRegisteredBag(criteria) {
    const lookup = await createRegisteredBagLookup();
    return lookup(criteria);
}

export async function syncFromContract() {
    if (isSyncing) {
        log('Sync already in progress, skipping this run');
        return { synced: 0, total: 0, skipped: true };
    }
    isSyncing = true;

    log('Starting contract sync (Master-Item architecture)...');
    log('Contract: ' + CONTRACT_ADDRESS);

    try {
        const total = await getTotalBagsStrict();
        log('Total bags in contract: ' + total);

        if (total === 0) {
            log('No bags in contract yet');
            return { synced: 0, total: 0 };
        }

        let synced = 0;
        const startIndex = lastSyncedIndex + 1;

        for (let i = startIndex; i < total; i++) {
            const itemAddress = await getBagAddressByIndex(i);
            if (!itemAddress) {
                log('Could not get address for bag ' + i + '; keeping the cursor here for retry');
                return { synced, total, error: 'chain_unavailable' };
            }

            log('Bag ' + i + ' address: ' + itemAddress.toString());

            const bag = await getBagDataFromItem(itemAddress);

            if (!bag) {
                log('Could not read bag ' + i + '; keeping the cursor here for retry');
                return { synced, total, error: 'chain_unavailable' };
            }

            if (!bag.active) {
                advanceSyncCursor(i);
                log('Bag ' + i + ' is inactive, skipping');
                continue;
            }

            const metadata = await getStorageMetadataFromItem(itemAddress);
            if (!metadata) {
                log('Could not read storage metadata for bag ' + i + '; keeping the cursor here for retry');
                return { synced, total, error: 'chain_unavailable' };
            }

            const existing = db.prepare('SELECT id FROM bags WHERE bag_id = ?').get(bag.bag_id);
            if (existing) {
                db.prepare('UPDATE bags SET size = COALESCE(size, ?), files_count = COALESCE(files_count, ?) WHERE bag_id = ?')
                    .run(metadata.size, metadata.files_count, bag.bag_id);
                advanceSyncCursor(i);
                continue;
            }

            let persisted = false;
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
                    metadata.size,
                    metadata.files_count,
                    bag.timestamp
                );
                persisted = true;
                synced++;
                log('Synced bag ' + i + ': ' + bag.name + ' (' + metadata.files_count + ' files, ' + metadata.size + ' bytes)');
            } catch (err) {
                // Reconciliation can win the race after the existence check.
                // A duplicate bag_id is therefore already durable and safe to
                // advance; any other write failure must keep this index pending.
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') persisted = true;
                else console.error('Error inserting bag ' + i + ':', err.message);
            }

            if (!persisted) return { synced, total, error: 'index_write_failed' };
            advanceSyncCursor(i);
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        log('Sync complete. Synced ' + synced + ' new bags.');
        return { synced, total };
    } catch (err) {
        console.error('Sync error:', err);
        return { synced: 0, total: 0, error: err.message };
    } finally {
        isSyncing = false;
    }
}

export async function syncDeletions() {
    if (isSyncingDeletions) {
        log('Deletion check already in progress, skipping this run');
        return;
    }
    isSyncingDeletions = true;

    log('Checking for deactivated bags...');

    try {
        const rows = db.prepare('SELECT id, bag_id, contract_index FROM bags WHERE contract_index IS NOT NULL').all();

        let checked = 0, deleted = 0, readErrors = 0;
        for (const row of rows) {
            try {
                const itemAddress = await getBagAddressByIndex(row.contract_index);
                if (!itemAddress) { readErrors++; continue; }

                const bag = await getBagDataFromItem(itemAddress);
                if (!bag) { readErrors++; continue; }
                checked++;
                if (!bag.active) {
                    deleted += db.prepare('DELETE FROM bags WHERE id = ?').run(row.id).changes;
                    log('Deleted inactive bag: ' + row.bag_id);
                }
            } catch (err) {
                readErrors++;
                console.error('Error checking bag ' + row.contract_index + ':', err.message);
            }

            await new Promise(resolve => setTimeout(resolve, 150));
        }
        return { checked, deleted, readErrors };
    } finally {
        isSyncingDeletions = false;
    }
}
