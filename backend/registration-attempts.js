import { Address, Cell, loadMessage } from '@ton/core';
import db from './db.js';
import { readJob } from './jobs.js';
import {
    createRegisteredBagLookup,
    findRegisteredBag,
    locateRegistrationTransactions,
    normalizedExternalMessageHash
} from './contract-sync.js';

function positiveDuration(name, fallback) {
    const value = Number(process.env[name] || fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

const CHAIN_CONFIRMATION_TTL_MS = positiveDuration('REGISTRATION_CHAIN_CONFIRMATION_TTL_MS', 24 * 60 * 60 * 1000);
const ATTEMPT_RETENTION_MS = positiveDuration('REGISTRATION_ATTEMPT_RETENTION_MS', 30 * 24 * 60 * 60 * 1000);
const ABANDONED_ATTEMPT_RETENTION_MS = positiveDuration('REGISTRATION_ABANDONED_RETENTION_MS', 24 * 60 * 60 * 1000);
const MAX_TRANSACTION_BASE64_LENGTH = 96_000;
const HASHED_RECHECK_DELAYS_MS = [5_000, 15_000, 60_000];
const HASHLESS_RECHECK_DELAYS_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000];

const getAttemptStatement = db.prepare('SELECT * FROM registration_attempts WHERE id = ?');
const getAttemptByExternalHashStatement = db.prepare('SELECT id FROM registration_attempts WHERE external_message_hash = ?');
const listPendingAttemptsStatement = db.prepare(`
    SELECT * FROM registration_attempts
    WHERE state IN ('PREPARED', 'BROADCAST', 'CONFIRMING')
      AND next_check_at <= ?
    ORDER BY CASE WHEN external_message_hash IS NOT NULL THEN 0 ELSE 1 END,
             next_check_at ASC,
             updated_at ASC
    LIMIT 25
`);
const scheduleAttemptCheckStatement = db.prepare(`
    UPDATE registration_attempts
    SET updated_at = ?, next_check_at = ?
    WHERE id = ? AND state IN ('PREPARED', 'BROADCAST', 'CONFIRMING')
`);

export class RegistrationAttemptError extends Error {
    constructor(status, code, message = code) {
        super(message);
        this.name = 'RegistrationAttemptError';
        this.status = status;
        this.code = code;
    }
}

function decodeSingleRoot(base64, maxLength, code) {
    if (typeof base64 !== 'string' || base64.length === 0 || base64.length > maxLength) {
        throw new RegistrationAttemptError(422, code);
    }
    let roots;
    try {
        roots = Cell.fromBoc(Buffer.from(base64, 'base64'));
    } catch {
        throw new RegistrationAttemptError(422, code);
    }
    if (roots.length !== 1) throw new RegistrationAttemptError(422, code);
    return roots[0];
}

export function decodeTransactionBoc(boc, expectedWalletAddress) {
    const root = decodeSingleRoot(boc, MAX_TRANSACTION_BASE64_LENGTH, 'invalid_transaction_boc');
    let message;
    try {
        message = loadMessage(root.beginParse());
    } catch {
        throw new RegistrationAttemptError(422, 'invalid_transaction_boc');
    }
    if (message.info.type !== 'external-in') {
        throw new RegistrationAttemptError(422, 'invalid_transaction_boc');
    }
    let expectedWallet;
    try {
        expectedWallet = Address.parse(expectedWalletAddress);
    } catch {
        throw new RegistrationAttemptError(422, 'invalid_wallet');
    }
    if (!message.info.dest.equals(expectedWallet)) {
        throw new RegistrationAttemptError(422, 'wallet_mismatch');
    }
    return {
        externalMessageHash: normalizedExternalMessageHash(message),
        walletAddress: message.info.dest.toString()
    };
}

function serializeAttempt(row) {
    if (!row) return null;
    return {
        id: row.id,
        trace_id: row.trace_id,
        bag_id: row.bag_id,
        wallet_address: row.wallet_address,
        state: row.state,
        exit_code: row.exit_code,
        error_code: row.error_code,
        bag_index: row.bag_index,
        bag_item_address: row.bag_item_address,
        wallet_tx_hash: row.wallet_tx_hash,
        registry_tx_hash: row.registry_tx_hash,
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at
    };
}

export function getRegistrationAttempt(id) {
    return serializeAttempt(getAttemptStatement.get(String(id || '')));
}

export function submitRegistrationBoc(id, boc) {
    const row = getAttemptStatement.get(String(id || ''));
    if (!row) throw new RegistrationAttemptError(404, 'attempt_not_found');
    if (['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(row.state)) {
        return serializeAttempt(row);
    }

    if (row.expires_at <= Date.now()) {
        updateAttempt(row.id, { state: 'EXPIRED', error_code: 'confirmation_timeout' });
        return serializeAttempt(getAttemptStatement.get(row.id));
    }

    const decoded = decodeTransactionBoc(boc, row.wallet_address);
    if (row.external_message_hash && row.external_message_hash !== decoded.externalMessageHash) {
        throw new RegistrationAttemptError(409, 'transaction_mismatch');
    }
    if (row.external_message_hash === decoded.externalMessageHash
        && ['BROADCAST', 'CONFIRMING'].includes(row.state)) {
        return serializeAttempt(row);
    }
    const owner = getAttemptByExternalHashStatement.get(decoded.externalMessageHash);
    if (owner && owner.id !== row.id) {
        throw new RegistrationAttemptError(409, 'transaction_already_tracked');
    }
    updateAttempt(row.id, {
        external_message_hash: decoded.externalMessageHash,
        state: 'BROADCAST',
        error_code: null,
        next_check_at: Date.now(),
        // Once a signed external message exists, an RPC/indexer outage must
        // not expire a transaction that may already be on-chain.
        expires_at: Math.max(row.expires_at, Date.now() + CHAIN_CONFIRMATION_TTL_MS)
    });
    return serializeAttempt(getAttemptStatement.get(row.id));
}

export function markRegistrationUnknown(id) {
    const row = getAttemptStatement.get(String(id || ''));
    if (!row) throw new RegistrationAttemptError(404, 'attempt_not_found');
    if (row.expires_at <= Date.now() && !['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(row.state)) {
        updateAttempt(row.id, { state: 'EXPIRED', error_code: 'confirmation_timeout' });
        return serializeAttempt(getAttemptStatement.get(row.id));
    }
    if (row.state === 'PREPARED') {
        updateAttempt(row.id, {
            state: 'CONFIRMING',
            next_check_at: Date.now(),
            // sendTransaction can fail locally after the wallet has already
            // broadcast. Preserve that ambiguity for the full chain window.
            expires_at: Math.max(row.expires_at, Date.now() + CHAIN_CONFIRMATION_TTL_MS)
        });
    }
    return serializeAttempt(getAttemptStatement.get(row.id));
}

export function cancelRegistrationAttempt(id) {
    const row = getAttemptStatement.get(String(id || ''));
    if (!row) throw new RegistrationAttemptError(404, 'attempt_not_found');
    if (row.state === 'PREPARED') {
        updateAttempt(row.id, { state: 'CANCELLED' });
        return serializeAttempt(getAttemptStatement.get(row.id));
    }
    if (row.state === 'CANCELLED') return serializeAttempt(row);
    throw new RegistrationAttemptError(409, 'attempt_may_be_broadcast');
}

function updateAttempt(id, values) {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;
    const setters = entries.map(([key]) => `${key} = ?`).join(', ');
    db.prepare(`UPDATE registration_attempts SET ${setters}, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, value]) => value), Date.now(), id);
    if (values.state) {
        console.info('[tonconnect] attempt ' + id + ' -> ' + values.state);
    }
}

function nextReconciliationDelay(row, now) {
    const age = Math.max(0, now - row.created_at);
    if (row.external_message_hash) {
        if (age < 60_000) return HASHED_RECHECK_DELAYS_MS[0];
        if (age < 10 * 60_000) return HASHED_RECHECK_DELAYS_MS[1];
        return HASHED_RECHECK_DELAYS_MS[2];
    }
    if (age < 60_000) return HASHLESS_RECHECK_DELAYS_MS[0];
    if (age < 10 * 60_000) return HASHLESS_RECHECK_DELAYS_MS[1];
    if (age < 60 * 60_000) return HASHLESS_RECHECK_DELAYS_MS[2];
    return HASHLESS_RECHECK_DELAYS_MS[3];
}

function scheduleNextReconciliation(row, now = Date.now()) {
    const nextCheckAt = Math.min(row.expires_at, now + nextReconciliationDelay(row, now));
    scheduleAttemptCheckStatement.run(now, nextCheckAt, row.id);
}

export async function reconcileRegistrationAttempt(row, dependencies = {}) {
    const lookupRegisteredBag = dependencies.findRegisteredBag || findRegisteredBag;
    const lookupTransactions = dependencies.locateRegistrationTransactions || locateRegistrationTransactions;
    const metadata = JSON.parse(row.metadata_json);
    const createdAfter = Math.floor(row.created_at / 1000);
    // PREPARED only means the server validated a request; the wallet has not
    // returned a result and the client has not reported ambiguity. Looking at
    // wallet history here can attach a retry to an older identical payload.
    if (row.state === 'PREPARED') {
        if (row.expires_at <= Date.now()) {
            updateAttempt(row.id, { state: 'EXPIRED', error_code: 'confirmation_timeout' });
        }
        return getAttemptStatement.get(row.id);
    }

    // Schedule before making RPC calls so failures and process interruption do
    // not turn an ambiguous request into a tight background polling loop.
    scheduleNextReconciliation(row);

    try {
        const registered = await lookupRegisteredBag({
            baselineIndex: row.baseline_index,
            bagId: row.bag_id,
            walletAddress: row.wallet_address,
            name: row.name,
            category: row.category,
            metadata,
            createdAfter
        });
        if (registered) {
            db.prepare(`
                INSERT INTO bags (
                    bag_id, name, category, size, files_count, uploader_wallet, contract_index, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
                ON CONFLICT(bag_id) DO UPDATE SET
                    size = COALESCE(bags.size, excluded.size),
                    files_count = COALESCE(bags.files_count, excluded.files_count)
            `).run(
                row.bag_id,
                row.name,
                row.category,
                metadata.bagSize,
                metadata.filesCount,
                row.wallet_address,
                registered.bagIndex,
                registered.timestamp || Math.floor(row.created_at / 1000)
            );
            updateAttempt(row.id, {
                state: 'CONFIRMED',
                bag_index: registered.bagIndex,
                bag_item_address: registered.bagItemAddress,
                exit_code: 0,
                error_code: null
            });
            return getAttemptStatement.get(row.id);
        }

        // Only a signed BoC gives us a transaction-specific external message
        // hash. A hashless UNKNOWN attempt is deliberately reconciled from the
        // final BagItem state only: wallet+payload+time is not unique across
        // retries and must never produce a false rejection.
        if (row.external_message_hash) {
            const transactions = await lookupTransactions({
                walletAddress: row.wallet_address,
                payloadHash: row.payload_hash,
                externalMessageHash: row.external_message_hash,
                createdAfter
            });
            if (transactions.state === 'REJECTED') {
                updateAttempt(row.id, {
                    state: 'REJECTED',
                    exit_code: transactions.exitCode,
                    error_code: transactions.errorCode,
                    wallet_tx_hash: transactions.walletTxHash,
                    registry_tx_hash: transactions.registryTxHash
                });
                return getAttemptStatement.get(row.id);
            }
            if (transactions.state === 'EXECUTED' || transactions.walletTxHash) {
                updateAttempt(row.id, {
                    state: 'CONFIRMING',
                    wallet_tx_hash: transactions.walletTxHash,
                    registry_tx_hash: transactions.registryTxHash,
                    expires_at: Math.max(row.expires_at, row.created_at + CHAIN_CONFIRMATION_TTL_MS)
                });
            }
        }
    } catch (error) {
        console.warn('[tonconnect] Confirmation read failed for attempt ' + row.id + ':', error.message);
    }

    const refreshed = getAttemptStatement.get(row.id);
    if (['PREPARED', 'BROADCAST', 'CONFIRMING'].includes(refreshed.state)
        && refreshed.expires_at <= Date.now()) {
        updateAttempt(row.id, { state: 'EXPIRED', error_code: 'confirmation_timeout' });
    }
    return getAttemptStatement.get(row.id);
}

let reconciliationRunning = false;
let lastRetentionCleanup = 0;

export async function reconcileRegistrationAttempts(dependencies = {}) {
    if (reconciliationRunning) return;
    reconciliationRunning = true;
    try {
        const rows = listPendingAttemptsStatement.all(Date.now());
        let batchDependencies = dependencies;
        if (!dependencies.findRegisteredBag && rows.some(row => row.state !== 'PREPARED')) {
            const createLookup = dependencies.createRegisteredBagLookup || createRegisteredBagLookup;
            let sharedLookup;
            try {
                sharedLookup = await createLookup();
            } catch (error) {
                sharedLookup = async () => { throw error; };
            }
            batchDependencies = { ...dependencies, findRegisteredBag: sharedLookup };
        }
        for (const row of rows) {
            await reconcileRegistrationAttempt(row, batchDependencies);
        }
        const now = Date.now();
        if (now - lastRetentionCleanup >= 60 * 60 * 1000) {
            db.prepare(`
                DELETE FROM registration_attempts
                WHERE (state IN ('CONFIRMED', 'REJECTED') AND updated_at < ?)
                   OR (state IN ('CANCELLED', 'EXPIRED') AND updated_at < ?)
            `).run(now - ATTEMPT_RETENTION_MS, now - ABANDONED_ATTEMPT_RETENTION_MS);
            lastRetentionCleanup = now;
        }
    } finally {
        reconciliationRunning = false;
    }
}

export function getRegistrationHealth() {
    const now = Date.now();
    const pending = db.prepare(`
        SELECT COUNT(*) AS count, MIN(created_at) AS oldest
        FROM registration_attempts
        WHERE state IN ('PREPARED', 'BROADCAST', 'CONFIRMING')
    `).get();
    const states = db.prepare(`
        SELECT state, COUNT(*) AS count
        FROM registration_attempts
        WHERE created_at >= ?
        GROUP BY state
    `).all(now - 24 * 60 * 60 * 1000);
    return {
        pending: pending.count,
        oldest_pending_seconds: pending.oldest ? Math.max(0, Math.floor((now - pending.oldest) / 1000)) : 0,
        states_24h: Object.fromEntries(states.map(row => [row.state, row.count])),
        reconciliation_running: reconciliationRunning || readJob('periodic:legacy-attempts')?.state === 'running'
    };
}
