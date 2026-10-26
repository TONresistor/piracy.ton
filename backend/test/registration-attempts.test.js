import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import {
    Address,
    Cell,
    beginCell,
    external,
    loadMessage,
    storeMessage
} from '@ton/core';

const testDirectory = mkdtempSync(join(tmpdir(), 'piracy-tonconnect-'));
process.env.DB_PATH = join(testDirectory, 'test.sqlite');
process.env.TONCENTER_MAINNET_API_KEY = 'test-only';

const db = (await import('../db.js')).default;
const {
    cancelRegistrationAttempt,
    decodeTransactionBoc,
    getRegistrationAttempt,
    getRegistrationHealth,
    markRegistrationUnknown,
    reconcileRegistrationAttempt,
    reconcileRegistrationAttempts,
    submitRegistrationBoc
} = await import('../registration-attempts.js');
const {
    createRegisteredBagLookup,
    locateRegistrationTransactions,
    normalizedExternalMessageHash,
    transactionOutcome
} = await import('../contract-sync.js');
const { app } = await import('../server.js');

const BAG_ID = '12'.repeat(32);
const PAYLOAD = 'te6cckEBBgEAmAACSkFEQkcSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEgMBAgAoSWN5IFRvd2VyIHYxLjUuMS5leGUDYAAAAAAAQzMzAAAAAQACAACrq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urqwMEBQAqQ2xhc3NpYyBwbGF0Zm9ybSBnYW1lAAAAEkljeSBUb3dlcj439AU=';
const WALLET = new Address(0, Buffer.alloc(32, 1)).toString();
const OTHER_WALLET = new Address(0, Buffer.alloc(32, 2)).toString();
const STORAGE_INFO = Object.freeze({
    description: 'Classic platform game',
    bag_size: '4404019',
    files_count: 1,
    piece_size: 131072,
    merkle_hash: 'ab'.repeat(32),
    dir_name: 'Icy Tower'
});
let requestSequence = 0;

function request(overrides = {}) {
    requestSequence += 1;
    return {
        idempotency_key: 'idem-' + requestSequence,
        trace_id: 'trace-test',
        wallet_address: WALLET,
        bag_id: BAG_ID,
        name: 'Icy Tower v1.5.1.exe',
        category: 'games',
        payload: PAYLOAD,
        ...overrides
    };
}

// Seed a historical v2 request; new v2 registrations are no longer supported.
function seedLegacyAttempt(input = request()) {
    const id = randomUUID(), time = Date.now(), expiresAt = time + 30 * 60 * 1000;
    const metadata = { description: STORAGE_INFO.description, bagSize: STORAGE_INFO.bag_size,
        filesCount: STORAGE_INFO.files_count, pieceSize: STORAGE_INFO.piece_size,
        merkleHash: STORAGE_INFO.merkle_hash, dirName: STORAGE_INFO.dir_name };
    db.prepare(`INSERT INTO registration_attempts
        (id,idempotency_key,trace_id,wallet_address,bag_id,name,category,payload_hash,payload_boc,metadata_json,
         baseline_index,state,created_at,updated_at,next_check_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,42,'PREPARED',?,?,?,?)`)
        .run(id,input.idempotency_key,input.trace_id,Address.parse(input.wallet_address).toString(),input.bag_id,
            input.name,input.category,Cell.fromBase64(input.payload).hash().toString('hex'),input.payload,
            JSON.stringify(metadata),time,time,expiresAt,expiresAt);
    return getRegistrationAttempt(id);
}

function makeTransactionBoc(walletAddress, marker = 1) {
    const message = external({
        to: Address.parse(walletAddress),
        body: beginCell().storeUint(marker, 32).endCell()
    });
    return beginCell()
        .store(storeMessage(message, { forceRef: true }))
        .endCell()
        .toBoc()
        .toString('base64');
}

function walletTransaction({ message, lt, hashByte }) {
    return {
        now: Math.floor(Date.now() / 1000),
        lt: BigInt(lt),
        inMessage: message,
        outMessages: new Map(),
        description: {
            type: 'generic',
            computePhase: { type: 'vm', success: true, exitCode: 0 },
            actionPhase: { success: true, resultCode: 0 },
            aborted: false
        },
        hash: () => Buffer.alloc(32, hashByte)
    };
}

beforeEach(() => {
    db.exec('DELETE FROM registration_attempts; DELETE FROM bags;');
});

after(() => {
    db.close();
    rmSync(testDirectory, { recursive: true, force: true });
});

test('signed wallet BoC is destination-bound, normalized and cannot be replaced', async () => {
    const attempt = await seedLegacyAttempt();
    const boc = makeTransactionBoc(WALLET, 1);
    const decoded = decodeTransactionBoc(boc, WALLET);
    assert.equal(decoded.externalMessageHash, '62fd85e46bb39e3c6dc6b8c3b60662a8b5ab66fbe302d31c4058823779072e0d');
    const message = loadMessage(beginCell()
        .store(storeMessage(external({
            to: Address.parse(WALLET),
            body: beginCell().storeUint(1, 32).endCell()
        }), { forceRef: true }))
        .endCell()
        .beginParse());
    assert.equal(decoded.externalMessageHash, normalizedExternalMessageHash(message));

    const submittedAt = Date.now();
    const submitted = submitRegistrationBoc(attempt.id, boc);
    assert.equal(submitted.state, 'BROADCAST');
    assert.ok(submitted.expires_at >= submittedAt + (23 * 60 * 60 * 1000));
    assert.ok(submitted.expires_at > attempt.expires_at);
    assert.equal(submitRegistrationBoc(attempt.id, boc).state, 'BROADCAST');
    db.prepare(`UPDATE registration_attempts SET state = 'CONFIRMING' WHERE id = ?`).run(attempt.id);
    assert.equal(submitRegistrationBoc(attempt.id, boc).state, 'CONFIRMING');
    assert.throws(
        () => submitRegistrationBoc(attempt.id, makeTransactionBoc(WALLET, 2)),
        error => error.code === 'transaction_mismatch'
    );
    assert.throws(
        () => decodeTransactionBoc(makeTransactionBoc(OTHER_WALLET), WALLET),
        error => error.code === 'wallet_mismatch'
    );
});

test('transaction lookup follows TON lt/hash pagination beyond the first page', async () => {
    const targetMessage = external({
        to: Address.parse(WALLET),
        body: beginCell().storeUint(7, 32).endCell()
    });
    const unrelatedMessage = external({
        to: Address.parse(WALLET),
        body: beginCell().storeUint(8, 32).endCell()
    });
    const firstPageLast = walletTransaction({ message: unrelatedMessage, lt: 200, hashByte: 2 });
    const targetTransaction = walletTransaction({ message: targetMessage, lt: 100, hashByte: 1 });
    const calls = [];
    const fakeClient = {
        async getTransactions(_wallet, options) {
            calls.push(options);
            if (calls.length === 1) return [firstPageLast];
            assert.equal(options.lt, firstPageLast.lt.toString());
            assert.equal(options.hash, firstPageLast.hash().toString('base64'));
            return [targetTransaction];
        }
    };

    const result = await locateRegistrationTransactions({
        walletAddress: WALLET,
        payloadHash: 'ff'.repeat(32),
        externalMessageHash: normalizedExternalMessageHash(targetMessage),
        createdAfter: Math.floor(Date.now() / 1000) - 60
    }, { client: fakeClient });

    assert.equal(calls.length, 2);
    assert.equal(result.state, 'REJECTED');
    assert.equal(result.errorCode, 'wallet_did_not_send_registry_message');
});

test('transaction lookup retries transient TON RPC failures and stops at the attempt boundary', async () => {
    let rpcCalls = 0;
    let sleeps = 0;
    const oldTransaction = walletTransaction({
        message: external({
            to: Address.parse(WALLET),
            body: beginCell().storeUint(9, 32).endCell()
        }),
        lt: 50,
        hashByte: 5
    });
    oldTransaction.now = Math.floor(Date.now() / 1000) - 600;
    const fakeClient = {
        async getTransactions() {
            rpcCalls += 1;
            if (rpcCalls < 3) throw new Error('temporary RPC failure');
            return [oldTransaction];
        }
    };

    const result = await locateRegistrationTransactions({
        walletAddress: WALLET,
        payloadHash: 'ff'.repeat(32),
        externalMessageHash: 'aa'.repeat(32),
        createdAfter: Math.floor(Date.now() / 1000)
    }, {
        client: fakeClient,
        sleep: async delay => {
            assert.equal(delay, 1000);
            sleeps += 1;
        }
    });

    assert.equal(result.state, 'PENDING');
    assert.equal(rpcCalls, 3);
    assert.equal(sleeps, 2);
});

test('only PREPARED attempts can be cancelled; ambiguous attempts remain tracked', async () => {
    const cancelled = await seedLegacyAttempt();
    assert.equal(cancelRegistrationAttempt(cancelled.id).state, 'CANCELLED');

    const ambiguous = await seedLegacyAttempt();
    const unknownAt = Date.now();
    const unknown = markRegistrationUnknown(ambiguous.id);
    assert.equal(unknown.state, 'CONFIRMING');
    assert.ok(unknown.expires_at >= unknownAt + (23 * 60 * 60 * 1000));
    assert.ok(unknown.expires_at > ambiguous.expires_at);
    assert.throws(
        () => cancelRegistrationAttempt(ambiguous.id),
        error => error.code === 'attempt_may_be_broadcast'
    );
});

test('reconciliation never attributes wallet history before a BoC-specific hash exists', async () => {
    const prepared = await seedLegacyAttempt();
    await reconcileRegistrationAttempt(
        db.prepare('SELECT * FROM registration_attempts WHERE id = ?').get(prepared.id),
        {
            findRegisteredBag: async () => { throw new Error('PREPARED must not scan final state'); },
            locateRegistrationTransactions: async () => { throw new Error('PREPARED must not scan transactions'); }
        }
    );
    assert.equal(getRegistrationAttempt(prepared.id).state, 'PREPARED');

    markRegistrationUnknown(prepared.id);
    await reconcileRegistrationAttempt(
        db.prepare('SELECT * FROM registration_attempts WHERE id = ?').get(prepared.id),
        {
            findRegisteredBag: async () => null,
            locateRegistrationTransactions: async () => {
                throw new Error('hashless UNKNOWN must not classify a similar wallet transaction');
            }
        }
    );
    assert.equal(getRegistrationAttempt(prepared.id).state, 'CONFIRMING');
});

test('hashless confirmation checks are backed off instead of rescanned every worker tick', async () => {
    const attempt = await seedLegacyAttempt();
    markRegistrationUnknown(attempt.id);
    let registryLookups = 0;
    const reconciliationDependencies = {
        findRegisteredBag: async () => {
            registryLookups += 1;
            return null;
        },
        locateRegistrationTransactions: async () => {
            throw new Error('hashless attempt must not inspect wallet history');
        }
    };

    await reconcileRegistrationAttempts(reconciliationDependencies);
    await reconcileRegistrationAttempts(reconciliationDependencies);

    assert.equal(registryLookups, 1);
});

test('a reconciliation batch reuses one immutable registry read per BagItem index', async () => {
    const reads = { total: 0, address: 0, bag: 0, storage: 0 };
    const lookup = await createRegisteredBagLookup({
        getTotalBagsStrict: async () => {
            reads.total += 1;
            return 1;
        },
        getBagAddressByIndex: async () => {
            reads.address += 1;
            return Address.parse(OTHER_WALLET);
        },
        getBagDataFromItem: async () => {
            reads.bag += 1;
            return {
                bag_id: BAG_ID,
                name: 'Icy Tower v1.5.1.exe',
                category: 'games',
                uploader_wallet: WALLET,
                timestamp: Math.floor(Date.now() / 1000)
            };
        },
        getStorageMetadataFromItem: async () => {
            reads.storage += 1;
            return STORAGE_INFO;
        }
    });
    const criteria = {
        baselineIndex: 0,
        bagId: BAG_ID,
        walletAddress: WALLET,
        name: 'Icy Tower v1.5.1.exe',
        category: 'games',
        metadata: {
            description: STORAGE_INFO.description,
            bagSize: STORAGE_INFO.bag_size,
            filesCount: STORAGE_INFO.files_count,
            pieceSize: STORAGE_INFO.piece_size,
            merkleHash: STORAGE_INFO.merkle_hash,
            dirName: STORAGE_INFO.dir_name
        },
        createdAfter: Math.floor(Date.now() / 1000) - 60
    };

    assert.equal((await lookup(criteria)).bagIndex, 0);
    assert.equal(await lookup({ ...criteria, bagId: '34'.repeat(32) }), null);
    assert.deepEqual(reads, { total: 1, address: 1, bag: 1, storage: 1 });
});

test('the worker creates one shared registry lookup for all due attempts', async () => {
    const first = await seedLegacyAttempt();
    const second = await seedLegacyAttempt();
    markRegistrationUnknown(first.id);
    markRegistrationUnknown(second.id);
    let factories = 0;
    let lookups = 0;

    await reconcileRegistrationAttempts({
        createRegisteredBagLookup: async () => {
            factories += 1;
            return async () => {
                lookups += 1;
                return null;
            };
        },
        locateRegistrationTransactions: async () => {
            throw new Error('hashless attempt must not inspect wallet history');
        }
    });

    assert.equal(factories, 1);
    assert.equal(lookups, 2);
});

test('BoC-specific confirmations keep priority when the bounded queue is full', async () => {
    for (let index = 0; index < 26; index += 1) {
        const hashless = await seedLegacyAttempt();
        markRegistrationUnknown(hashless.id);
    }
    const signed = await seedLegacyAttempt();
    submitRegistrationBoc(signed.id, makeTransactionBoc(WALLET, 99));
    let transactionLookups = 0;

    await reconcileRegistrationAttempts({
        findRegisteredBag: async () => null,
        locateRegistrationTransactions: async () => {
            transactionLookups += 1;
            return { state: 'PENDING' };
        }
    });

    assert.equal(transactionLookups, 1);
});

test('reconciliation confirms only final BagItem state and records definitive rejection', async () => {
    const confirmed = await seedLegacyAttempt();
    markRegistrationUnknown(confirmed.id);
    const confirmedRow = db.prepare('SELECT * FROM registration_attempts WHERE id = ?').get(confirmed.id);
    await reconcileRegistrationAttempt(confirmedRow, {
        findRegisteredBag: async input => {
            assert.equal(input.bagId, BAG_ID);
            assert.equal(input.metadata.merkleHash, 'ab'.repeat(32));
            return { bagIndex: 42, bagItemAddress: OTHER_WALLET };
        },
        locateRegistrationTransactions: async () => { throw new Error('must not inspect transactions after proof'); }
    });
    const confirmedResult = getRegistrationAttempt(confirmed.id);
    assert.equal(confirmedResult.state, 'CONFIRMED');
    assert.equal(confirmedResult.exit_code, 0);
    assert.equal(confirmedResult.bag_index, 42);
    assert.equal(confirmedResult.bag_item_address, OTHER_WALLET);
    const indexed = db.prepare('SELECT * FROM bags WHERE bag_id = ?').get(BAG_ID);
    assert.equal(indexed.contract_index, 42);
    assert.equal(indexed.size, '4404019');
    assert.equal(indexed.files_count, 1);
    assert.equal(
        db.prepare("SELECT value FROM sync_state WHERE key = 'contract_bags_cursor'").get().value,
        -1,
        'out-of-order reconciliation must not advance the sequential sync cursor'
    );
    db.prepare('DELETE FROM bags WHERE bag_id = ?').run(BAG_ID);

    const rejected = await seedLegacyAttempt();
    submitRegistrationBoc(rejected.id, makeTransactionBoc(WALLET, 3));
    const rejectedRow = db.prepare('SELECT * FROM registration_attempts WHERE id = ?').get(rejected.id);
    await reconcileRegistrationAttempt(rejectedRow, {
        findRegisteredBag: async () => null,
        locateRegistrationTransactions: async () => ({
            state: 'REJECTED',
            exitCode: 37,
            errorCode: 'registry_transaction_failed',
            walletTxHash: 'wallet-hash',
            registryTxHash: 'registry-hash'
        })
    });
    const result = getRegistrationAttempt(rejected.id);
    assert.equal(result.state, 'REJECTED');
    assert.equal(result.exit_code, 37);
    assert.equal(result.wallet_tx_hash, 'wallet-hash');
    assert.equal(result.registry_tx_hash, 'registry-hash');

    const health = getRegistrationHealth();
    assert.equal(health.pending, 0);
    assert.equal(health.states_24h.CONFIRMED, 1);
    assert.equal(health.states_24h.REJECTED, 1);
});

test('transaction outcome rejects compute, abort and action failures', () => {
    const successful = {
        description: {
            type: 'generic',
            computePhase: { type: 'vm', success: true, exitCode: 0 },
            actionPhase: { success: true, resultCode: 0 },
            aborted: false
        }
    };
    assert.deepEqual(transactionOutcome(successful), { success: true, exitCode: 0 });
    assert.deepEqual(transactionOutcome({
        description: { ...successful.description, computePhase: { type: 'vm', success: false, exitCode: 13 } }
    }), { success: false, exitCode: 13 });
    assert.deepEqual(transactionOutcome({
        description: { ...successful.description, actionPhase: { success: false, resultCode: 37 } }
    }), { success: false, exitCode: 37 });
});

test('HTTP API exposes durable attempt state and safe health metrics', async () => {
    assert.equal(app.get('trust proxy'), 'loopback');
    const trustProxy = app.get('trust proxy fn');
    assert.equal(trustProxy('127.0.0.1', 0), true);
    assert.equal(trustProxy('203.0.113.1', 0), false);
    const attempt = await seedLegacyAttempt();
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
        const { port } = server.address();
        const attemptResponse = await fetch(`http://127.0.0.1:${port}/api/registration-attempts/${attempt.id}`);
        assert.equal(attemptResponse.status, 200);
        assert.equal(attemptResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
        assert.equal(attemptResponse.headers.get('cdn-cache-control'), 'no-store');
        assert.equal(attemptResponse.headers.get('surrogate-control'), 'no-store');
        assert.equal((await attemptResponse.json()).state, 'PREPARED');

        const missingResponse = await fetch(`http://127.0.0.1:${port}/api/registration-attempts/missing`);
        assert.equal(missingResponse.status, 404);
        assert.equal((await missingResponse.json()).code, 'attempt_not_found');

        const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health/tonconnect`);
        assert.equal(healthResponse.status, 200);
        assert.equal(healthResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
        assert.equal((await healthResponse.json()).pending, 1);

        const invalidJsonResponse = await fetch(`http://127.0.0.1:${port}/api/registration-attempts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{'
        });
        assert.equal(invalidJsonResponse.status, 400);
        assert.equal((await invalidJsonResponse.json()).code, 'invalid_json');

        const oversizedResponse = await fetch(`http://127.0.0.1:${port}/api/registration-attempts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: 'x'.repeat(140_000) })
        });
        assert.equal(oversizedResponse.status, 413);
        assert.equal((await oversizedResponse.json()).code, 'request_too_large');
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
