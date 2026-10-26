import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Address, Cell, beginCell, storeMessage, internal } from '@ton/core';
const directory = mkdtempSync(join(tmpdir(), 'piracy-v3-'));
process.env.DB_PATH = join(directory, 'test.sqlite');
process.env.TONCENTER_MAINNET_API_KEY = 'test';
const db = (await import('../db.js')).default;
const { v3Sdk: sdk, getV3Config, prepareV3, lookupV3Transaction, refreshPublication, syncV3, createV3ReadCache } = await import('../v3.js');
const { listCatalog, legacyBag } = await import('../catalog.js');
const { app } = await import('../server.js');
const wrapperCode = name => {
    const wrapper = readFileSync(new URL(`../../contracts/v3/wrappers-ts/${name}.gen.ts`, import.meta.url), 'utf8');
    return Cell.fromBase64(wrapper.match(/CodeCell\s*=\s*c.Cell.fromBase64\('([^']+)'/)[1]).toBoc();
};
const rootCode = wrapperCode('BagRegistry');
const itemCode = wrapperCode('BagItem');
const owner = '0:' + '11'.repeat(32), other = '0:' + '22'.repeat(32), bagId = '12'.repeat(32);
const fields = { bagId, title: 'Example', category: 'custom-topic', visible: true };
let items, transactions, state;
const custom = {
    client: {
        async getContractState(address) { return address.toRawString() === sdk.REGISTRY_ADDRESS ? state : { state: items.has(address.toRawString()) ? 'active' : 'uninitialized', code: itemCode }; },
        async getTransactions(_address, options) { return transactions(options); }
    },
    verify: async () => true,
    read: async (_client, address) => items.get(address),
    funding: async () => ({ minimumValue: '12000000', storageReserve: '9000000' }),
    metadata: async () => ({ size: '1234', files_count: 2, description: 'Storage description' })
};
function addItem(wallet = owner, changes = {}) {
    const address = sdk.publicationAddress(wallet, bagId);
    items.set(address, { initialized: true, registry: sdk.REGISTRY_ADDRESS, uploader: wallet, ...fields, createdAt: 1700000000, revision: '0', ...changes });
    return address;
}
beforeEach(() => { db.exec('DELETE FROM bags;DELETE FROM publications_v3;DELETE FROM v3_sync_state;DELETE FROM v3_pending_items;'); items = new Map(); state = { state: 'active', code: rootCode }; transactions = () => []; });
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test('v3 activates only after matching root code, version and child code', async () => {
    assert.equal((await getV3Config(custom)).ready, true);
    state = { state: 'uninitialized' }; assert.equal((await getV3Config(custom)).status, 'undeployed');
    state = { state: 'frozen' }; assert.equal((await getV3Config(custom)).status, 'frozen');
    state = { state: 'active', code: itemCode }; assert.equal((await getV3Config(custom)).status, 'wrong_code');
    state = { state: 'active', code: rootCode }; assert.equal((await getV3Config({ ...custom, verify: async () => false })).ready, false);
    assert.equal((await getV3Config({ ...custom, client: { getContractState: async () => { throw Error('offline'); } } })).status, 'unavailable');
});

test('funding quote binds wallet, text categories, deterministic child and revision', async () => {
    const quote = await prepareV3({ ...fields, wallet_address: owner, operation: 'publish' }, custom);
    assert.equal(quote.amount, '14400000'); assert.equal(quote.transaction.from, owner);
    assert.equal(quote.transaction.network, '-239'); assert.equal(quote.address, sdk.publicationAddress(owner, bagId));
    addItem();
    assert.equal((await prepareV3({ ...fields, wallet_address: owner, operation: 'publish' }, custom)).existing, true);
    await assert.rejects(prepareV3({ ...fields, wallet_address: owner, operation: 'update', revision: '1' }, custom), /stale_revision/);
    const edit = await prepareV3({ ...fields, wallet_address: owner, operation: 'update', revision: '0', visible: false }, custom);
    assert.equal(Address.parseFriendly(edit.transaction.messages[0].address).address.toRawString(), quote.address);
    assert.equal((await prepareV3({ ...fields, wallet_address: other, operation: 'publish' }, custom)).existing, undefined);
});

test('two users can publish the same bag; hiding one leaves the other and v2 intact', async () => {
    db.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet,contract_index) VALUES (?,?,?,?,?)').run(bagId, 'Legacy', 'video', owner, 0);
    const first = addItem(), second = addItem(other);
    await refreshPublication(first, custom); await refreshPublication(second, custom);
    assert.equal(listCatalog().total, 3); assert.equal(listCatalog({ version: 'v3' }).total, 2);
    items.get(first).visible = false; items.get(first).revision = '1';
    await refreshPublication(first, custom);
    assert.equal(listCatalog({ version: 'v3' }).total, 1);
    assert.equal(listCatalog({ version: 'v3' }).bags[0].item_address, second);
    assert.equal(legacyBag(bagId).name, 'Legacy'); assert.equal(legacyBag(bagId).contract_index, 0);
    assert.equal(listCatalog({ category: 'custom-topic' }).total, 1);
});

test('foreign registry identity and wrong child bytecode are rejected before indexing', async () => {
    const address = addItem(owner, { registry: owner });
    await assert.rejects(refreshPublication(address, custom), /invalid_publication_identity/);
    await assert.rejects(refreshPublication(address, { ...custom, client: { getContractState: async () => ({ state: 'active', code: rootCode }) } }), /wrong_publication_code/);
    assert.equal(listCatalog({ version: 'v3' }).total, 0);
});

test('discovered children are durable when initialization has not landed yet', async () => {
    const address = sdk.publicationAddress(owner, bagId);
    // InitializePublication header: query id, uploader, bag id, presentation reference.
    const { beginCell } = await import('@ton/core');
    const presentation = beginCell().storeRef(beginCell().storeStringTail('Example').endCell()).storeRef(beginCell().storeStringTail('custom-topic').endCell()).storeBit(true).endCell();
    const body = beginCell().storeUint(0x494e4933,32).storeUint(1,64).storeAddress(Address.parse(owner)).storeUint(BigInt('0x'+bagId),256).storeRef(presentation).endCell();
    transactions = () => [{ lt: 20n, outMessages: new Map([[0, { info: { type: 'internal', dest: Address.parse(address) }, body }]]), hash: () => Buffer.alloc(32,1) }];
    await syncV3(custom);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM v3_pending_items').get().n, 1);
    assert.equal(db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(sdk.REGISTRY_ADDRESS).value, '20');
    addItem(); db.prepare('UPDATE v3_pending_items SET next_check=0').run();
    await syncV3(custom);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM v3_pending_items').get().n, 0);
    assert.equal(listCatalog({ version: 'v3' }).total, 1);
});

test('HTTP forbids new v2 writes while keeping legacy reads', async () => {
    db.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet) VALUES (?,?,?,?)').run(bagId,'Legacy','video',owner);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
        const write = await fetch(base + '/api/registration-attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert.equal(write.status,409); assert.equal((await write.json()).code,'v2_read_only');
        const read = await fetch(base + '/api/bags/' + bagId); assert.equal((await read.json()).version, 'v2');
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('history scan resumes its bounded pagination after restart without losing the newest cursor', async () => {
    let calls = 0;
    transactions = options => {
        const start = options.lt ? Number(options.lt) - 1 : 1000;
        calls++;
        return Array.from({ length: 50 }, (_, i) => ({ lt: BigInt(start-i), outMessages: new Map(), hash: () => Buffer.alloc(32,1) }));
    };
    await syncV3(custom);
    assert.equal(calls,10);
    assert.equal(db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(sdk.REGISTRY_ADDRESS),undefined);
    const scan = JSON.parse(db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(sdk.REGISTRY_ADDRESS+':scan').value);
    assert.equal(scan.newest,'1000'); assert.equal(scan.lt,'501');
    transactions = options => { assert.equal(options.lt,'501'); return []; };
    await syncV3(custom);
    assert.equal(db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(sdk.REGISTRY_ADDRESS).value,'1000');
});

test('one failed pending child does not block another publication', async () => {
    const broken = addItem(owner, { registry: owner }); const working = addItem(other);
    for (const address of [broken,working]) db.prepare('INSERT INTO v3_pending_items(item_address) VALUES (?)').run(address);
    const result = await syncV3(custom);
    assert.equal(result.refreshErrors, 1);
    assert.equal(result.refreshed, 1);
    assert.equal(listCatalog({ version:'v3' }).bags[0].item_address,working);
    assert.equal(db.prepare('SELECT item_address FROM v3_pending_items').get().item_address,broken);
});

test('legacy duplicate bag sync never retargets the first publication or deletes it for the second owner', async () => {
    const { TonClient } = await import('@ton/ton');
    const { TupleBuilder, TupleReader, beginCell } = await import('@ton/core');
    const { syncFromContract, syncDeletions } = await import('../contract-sync.js');
    const original = TonClient.prototype.runMethod;
    const childAddresses = [Address.parse('0:'+'33'.repeat(32)),Address.parse('0:'+'44'.repeat(32))];
    let secondActive = true;
    TonClient.prototype.runMethod = async (address,method,args) => {
        const b = new TupleBuilder(); const index = childAddresses[1].equals(address) ? 1 : 0;
        if (method === 'get_total') b.writeNumber(2);
        else if (method === 'get_bag_address') b.writeAddress(childAddresses[Number(args[0].value)]);
        else if (method === 'get_bag_data') {
            b.writeNumber(1); b.writeNumber(index); b.writeAddress(Address.parse(sdk.REGISTRY_ADDRESS));
            b.writeNumber(BigInt('0x'+bagId)); b.writeCell(beginCell().storeStringTail(index ? 'Second':'First').endCell()); b.writeNumber(0);
            b.writeAddress(Address.parse(index ? other:owner)); b.writeNumber(1700000000); b.writeNumber(index ? Number(secondActive):1);
        } else {
            b.writeNumber(1); b.writeCell(beginCell().endCell()); b.writeNumber(1234); b.writeNumber(2); b.writeCell(beginCell().endCell());
            b.writeNumber(128); b.writeNumber(0); b.writeCell(beginCell().endCell());
        }
        return { stack:new TupleReader(b.build()) };
    };
    try {
        await syncFromContract(); secondActive = false; await syncDeletions();
        assert.equal(legacyBag(bagId).name,'First'); assert.equal(legacyBag(bagId).contract_index,0);
    } finally { TonClient.prototype.runMethod = original; }
});

const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('late snapshots cannot roll back revision, title, category or visibility', async () => {
    const address = addItem();
    const snapshot = { ...items.get(address) }, started = defer(), delayed = defer();
    const late = refreshPublication(address, {
        ...custom, read: async () => snapshot,
        metadata: async () => { started.resolve(); await delayed.promise; return null; }
    });
    await started.promise;
    Object.assign(items.get(address), { title: 'Updated', category: 'books', visible: false, revision: '1' });
    await refreshPublication(address, custom);
    delayed.resolve();
    const result = await late;
    assert.equal(result.revision, '1'); assert.equal(result.title, 'Updated');
    assert.equal(result.category, 'books'); assert.equal(result.visible, false);
    assert.equal(listCatalog({ version: 'v3' }).total, 0);
});

test('revision comparisons preserve full uint64 precision and equal revisions can refresh metadata', async () => {
    const address = addItem(owner, { revision: '9007199254740993' });
    await refreshPublication(address, custom);
    Object.assign(items.get(address), { revision: '9007199254740992', title: 'Older' });
    assert.equal((await refreshPublication(address, custom)).title, fields.title);
    Object.assign(items.get(address), { revision: '18446744073709551615', title: 'Latest' });
    await refreshPublication(address, custom);
    items.get(address).revision = '18446744073709551614';
    assert.equal((await refreshPublication(address, custom)).revision, '18446744073709551615');
    items.get(address).revision = '18446744073709551615';
    const result = await refreshPublication(address, { ...custom, metadata: async () => ({ size: '4321' }) });
    assert.equal(result.size, '4321'); assert.equal(result.title, 'Latest');
});

test('registry reads are shared, expire after 15 seconds and fresh reads bypass a successful cache', async () => {
    let clock = 0, reads = 0;
    const d = { ...custom, readCache: createV3ReadCache(), now: () => clock,
        client: { ...custom.client, getContractState: async address => { reads++; return custom.client.getContractState(address); } } };
    const values = await Promise.all(Array.from({ length: 5 }, () => getV3Config(d)));
    assert.ok(values.every(value => value.ready)); assert.equal(reads, 1);
    clock = 14999; await getV3Config(d); assert.equal(reads, 1);
    clock = 15000; await getV3Config(d); assert.equal(reads, 2);
    state = { state: 'frozen' };
    assert.equal((await getV3Config(d)).ready, true);
    assert.equal((await getV3Config(d, { fresh: true })).status, 'frozen');
    assert.equal(reads, 3);
    clock += 2000; state = { state: 'active', code: rootCode };
    assert.equal((await getV3Config(d)).ready, true); assert.equal(reads, 4);
});

test('publication reads coalesce, expire and allow fresh reads for transaction preparation', async () => {
    const address = addItem(); let reads = 0, clock = 0, fundingReads = 0;
    const d = { ...custom, readCache: createV3ReadCache(), now: () => clock,
        read: async (_client, address) => { reads++; return { ...items.get(address) }; },
        funding: async () => ({ minimumValue: String(12000000 + (++fundingReads * 1000000)), storageReserve: '9000000' }) };
    await Promise.all([refreshPublication(address, d), refreshPublication(address, d)]);
    assert.equal(reads, 1);
    items.get(address).revision = '1';
    assert.equal((await refreshPublication(address, d)).revision, '0');
    clock = 2000; assert.equal((await refreshPublication(address, d)).revision, '1');
    const first = await prepareV3({ ...fields, wallet_address: owner, operation: 'update', revision: '1' }, d);
    const second = await prepareV3({ ...fields, wallet_address: owner, operation: 'update', revision: '1' }, d);
    assert.equal(fundingReads, 2); assert.notEqual(first.amount, second.amount);
    assert.equal(reads, 4);
});

test('a fresh publication read waits for an older in-flight snapshot then rereads the chain', async () => {
    const address = addItem(), entered = defer(), delayed = defer(); let reads = 0;
    const d = { ...custom, readCache: createV3ReadCache(),
        read: async () => { reads++; return { ...items.get(address) }; },
        metadata: async () => { if (reads === 1) { entered.resolve(); await delayed.promise; } return null; } };
    const old = refreshPublication(address, d); await entered.promise;
    items.get(address).revision = '1';
    const fresh = refreshPublication(address, d, { fresh: true });
    delayed.resolve(); await old;
    assert.equal((await fresh).revision, '1'); assert.equal(reads, 2);
});

test('RPC rate limits honor Retry-After across reads and recover without caching failure forever', async () => {
    const address = addItem(); let clock = 0, calls = 0;
    const limited = Object.assign(new Error('rate limited'), { response: { status: 429, headers: { 'retry-after': '10' } } });
    const d = { ...custom, readCache: createV3ReadCache(), now: () => clock,
        client: { ...custom.client, getContractState: async address => {
            calls++; if (clock < 10000) throw limited;
            return custom.client.getContractState(address);
        } } };
    assert.equal((await getV3Config(d)).status, 'unavailable');
    clock = 9000; assert.equal((await getV3Config(d, { fresh: true })).status, 'unavailable');
    await assert.rejects(refreshPublication(address, d), /rate limited/); assert.equal(calls, 1);
    clock = 10000; assert.equal((await getV3Config(d)).ready, true);
    assert.equal((await refreshPublication(address, d)).revision, '0'); assert.equal(calls, 3);
});

test('ordinary RPC failures are retried after a short backoff', async () => {
    let clock = 0, calls = 0;
    const d = { ...custom, readCache: createV3ReadCache(), now: () => clock,
        client: { getContractState: async () => { calls++; if (calls === 1) throw Error('offline'); return state; } } };
    assert.equal((await getV3Config(d)).ready, false);
    clock = 1999; assert.equal((await getV3Config(d)).ready, false); assert.equal(calls, 1);
    clock = 2000; assert.equal((await getV3Config(d)).ready, true); assert.equal(calls, 2);
});

function seedPublication(index, changes = {}) {
    const wallet = '0:' + index.toString(16).padStart(64, '0');
    const address = addItem(wallet, changes), item = items.get(address);
    db.prepare(`INSERT INTO publications_v3
        (item_address,registry_address,uploader_wallet,bag_id,title,category,visible,revision,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(address, item.registry, wallet, item.bagId, item.title, item.category, Number(item.visible), item.revision, item.createdAt);
    return address;
}

test('known publications refresh in bounded rotating batches with at most two concurrent reads', async () => {
    const expected = new Set(Array.from({ length: 55 }, (_, i) => seedPublication(i + 1)));
    let active = 0, maximum = 0; const visited = [];
    const d = { ...custom, read: async (_client, address) => {
        active++; maximum = Math.max(maximum, active); visited.push(address);
        await new Promise(setImmediate); active--; return items.get(address);
    } };
    await syncV3(d); assert.equal(visited.length, 50); assert.equal(maximum, 2);
    await syncV3(d); assert.equal(visited.length, 100);
    assert.deepEqual(new Set(visited), expected);
    assert.ok(db.prepare('SELECT value FROM v3_sync_state WHERE key=?').get(sdk.REGISTRY_ADDRESS + ':refresh'));
});

test('a confirmed pending publication is not read twice in the same sync cycle', async () => {
    const address = seedPublication(1); let reads = 0;
    db.prepare('INSERT INTO v3_pending_items(item_address) VALUES (?)').run(address);
    await syncV3({ ...custom, read: async (_client, address) => { reads++; return items.get(address); } });
    assert.equal(reads, 1);
});

test('catalog pagination covers all rows at boundaries and keeps v2/v3 ties stable', () => {
    const insert = db.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet,created_at) VALUES (?,?,?,?,?)');
    for (const count of [0, 1, 50, 51, 100, 101]) {
        db.prepare('DELETE FROM bags').run();
        for (let i = 1; i <= count; i++) insert.run(i.toString(16).padStart(64, '0'), 'Bag ' + i, 'other', owner, '2023-11-14 22:13:20');
        const ids = [];
        for (let page = 1; page <= Math.max(1, Math.ceil(count / 50)); page++) {
            const result = listCatalog({ page }); assert.equal(result.total, count); ids.push(...result.bags.map(row => row.id));
        }
        assert.equal(ids.length, count); assert.equal(new Set(ids).size, count);
        assert.deepEqual(listCatalog().bags.map(row => row.id), ids.slice(0, 50));
    }
    seedPublication(1); seedPublication(2, { visible: false });
    assert.equal(listCatalog().total, 102); assert.equal(listCatalog({ version: 'v3' }).total, 1);
    assert.equal(listCatalog({ category: 'custom-topic' }).bags[0].version, 'v3');
});

test('transaction preparation rechecks registry readiness even when the cached config was ready', async () => {
    const d = { ...custom, readCache: createV3ReadCache() };
    assert.equal((await getV3Config(d)).ready, true);
    state = { state: 'frozen' };
    await assert.rejects(prepareV3({ ...fields, wallet_address: owner, operation: 'publish' }, d), /v3_not_ready/);
});

test('rate-limited sync stops scheduling more reads and honors long Retry-After before recovering', async () => {
    for (let i = 1; i <= 6; i++) seedPublication(i);
    let clock = 0, reads = 0;
    const d = { ...custom, readCache: createV3ReadCache(), now: () => clock,
        read: async (_client, address) => {
            reads++;
            if (clock < 120000) throw Object.assign(new Error('rate limited'), { response: { status: 429, headers: { 'retry-after': '120' } } });
            return items.get(address);
        } };
    await syncV3(d); assert.ok(reads > 0 && reads <= 2);
    const before = reads; clock = 119999; await syncV3(d); assert.equal(reads, before);
    clock = 120000; await syncV3(d); assert.equal(reads, before + 6);
});

test('BoC receipt uses normalized external hash and validates the signer', () => {
    const external = { info: { type: 'external-in', dest: Address.parse(owner), importFee: 0n }, body: beginCell().storeUint(7, 32).endCell() };
    const encode = msg => beginCell().store(storeMessage(msg)).endCell().toBoc().toString('base64');
    const hash = sdk.transactionReceipt(encode(external), owner).externalMessageHash;
    assert.equal(sdk.transactionReceipt(encode({ ...external, init: { code: Cell.EMPTY } }), owner).externalMessageHash, hash);
    assert.throws(() => sdk.transactionReceipt(encode(external), other), /invalid_transaction_boc/);
    for (const boc of ['', '!', 'A'.repeat(65537)]) assert.throws(() => sdk.transactionReceipt(boc, owner));
});

test('lookup follows the exact wallet, registry and child messages, retaining uncertainty', async () => {
    const external = { info: { type: 'external-in', dest: Address.parse(owner), importFee: 0n }, body: beginCell().storeUint(7, 32).endCell() };
    const boc = beginCell().store(storeMessage(external)).endCell().toBoc().toString('base64');
    const payload = sdk.publishPayload(fields, '1');
    const child = sdk.publicationAddress(owner, bagId);
    const message = (src, dest, body, lt) => {
        const msg = internal({ to: dest, value: 10000000n, body });
        msg.info.src = Address.parse(src); msg.info.createdLt = lt;
        return msg;
    };
    const publish = message(owner, sdk.REGISTRY_ADDRESS, Cell.fromBase64(payload), 1n);
    const initialize = message(sdk.REGISTRY_ADDRESS, child, Cell.EMPTY, 2n);
    const tx = (inMessage, out = []) => ({ inMessage, outMessages: new Map(out.map((m, i) => [i, m])),
        now: Math.floor(Date.now() / 1000), lt: 100n, hash: () => Buffer.alloc(32, 1),
        description: { type: 'generic', computePhase: { type: 'vm', success: true, exitCode: 0 }, aborted: false } });
    const walletTx = tx(external, [publish]), registryTx = tx(publish, [initialize]), childTx = tx(initialize);
    const input = { ...fields, operation: 'publish', wallet: owner, boc, payload, validUntil: Math.floor(Date.now() / 1000) + 600 };
    let locateCalls = 0;
    const client = { getTransactions: async () => [walletTx], async tryLocateResultTx(src, dest, lt) {
        locateCalls++;
        assert.equal(src.toRawString(), lt === '1' ? owner : sdk.REGISTRY_ADDRESS);
        assert.equal(dest.toRawString(), lt === '1' ? sdk.REGISTRY_ADDRESS : child);
        return lt === '1' ? registryTx : childTx;
    } };
    assert.equal((await lookupV3Transaction(input, { client })).state, 'executed');
    assert.equal(locateCalls, 2);
    childTx.description.computePhase = { type: 'vm', success: false, exitCode: 403 };
    const rejected = await lookupV3Transaction(input, { client });
    assert.equal(rejected.state, 'rejected'); assert.equal(rejected.exitCode, 403);
    registryTx.description.aborted = true;
    assert.equal((await lookupV3Transaction(input, { client })).state, 'rejected');
    registryTx.description.aborted = false;
    assert.equal((await lookupV3Transaction(input, { client: { ...client, tryLocateResultTx: async () => { throw new Error('index lag'); } } })).state, 'pending');
    assert.equal((await lookupV3Transaction({ ...input, payload: Cell.EMPTY.toBoc().toString('base64') }, { client })).state, 'pending');
    const different = tx({ ...external, body: Cell.EMPTY });
    assert.equal((await lookupV3Transaction(input, { client: { ...client, getTransactions: async () => [different] } })).state, 'pending');
    assert.equal((await lookupV3Transaction(input, { client: { ...client, tryLocateResultTx: async () => tx(initialize) } })).state, 'pending');
    await assert.rejects(lookupV3Transaction({ ...input, wallet: other }, { client }), /invalid_transaction_boc/);
    await assert.rejects(lookupV3Transaction({ ...input, validUntil: input.validUntil + 10000 }, { client }), /invalid_transaction_boc/);
    assert.equal((await lookupV3Transaction(input, { client: { getTransactions() { throw new Error('must not query expired attempt'); } }, now: () => (input.validUntil + 1801) * 1000 })).state, 'pending');
    const updatePayload = sdk.updatePayload(fields, '0', '1');
    const update = message(owner, child, Cell.fromBase64(updatePayload), 3n);
    const updateTx = tx(update);
    assert.equal((await lookupV3Transaction({ ...input, operation: 'update', payload: updatePayload }, { client: {
        getTransactions: async () => [tx(external, [update])], tryLocateResultTx: async () => updateTx
    } })).state, 'executed');
});
