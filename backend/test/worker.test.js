import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtempSync, rmSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Address, Cell, beginCell, storeMessage, TupleBuilder, TupleReader } from '@ton/core';

const directory = mkdtempSync(join(tmpdir(), 'piracy-worker-'));
process.env.DB_PATH = join(directory, 'test.sqlite');
process.env.TON_ENDPOINT = 'http://127.0.0.1:1';
process.env.TON_RPC_MIN_INTERVAL_MS = '100';
const db = (await import('../db.js')).default;
const jobs = await import('../jobs.js');
const { runNextJob, scheduleRecurring } = await import('../worker.js');
const { getApiPublication, getApiReceipt, getApiConfig, getApiBagInfo } = await import('../api.js');
const { backupDatabase } = await import('../backup.js');
const { scheduleRpc } = await import('../rpc.js');
const { startServer } = await import('../server.js');
const sdk = (await import('../v3.js')).v3Sdk;
const wallet = '0:' + '11'.repeat(32), bagId = '12'.repeat(32);
const fields = { bagId, title: 'Example', category: 'video', visible: true };
const address = sdk.publicationAddress(wallet, bagId);

beforeEach(() => {
    db.exec('DELETE FROM worker_jobs; DELETE FROM runtime_state; DELETE FROM bag_metadata; DELETE FROM publications_v3; DELETE FROM bags; UPDATE rpc_budget SET next_at=0,cooldown_until=0;');
});
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test('durable jobs deduplicate, promote interactive work, retry and fence expired leases', async () => {
    jobs.enqueueJob.immediate('one', 'test', { value: 1 }, { time: 100 });
    jobs.enqueueJob.immediate('one', 'test', { value: 2 }, { priority: 20, time: 101 });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_jobs').get().n, 1);
    assert.equal(jobs.claimJob.immediate(false, 102), null);
    const first = jobs.claimJob.immediate(true, 102);
    assert.equal(first.payload.value, 1);
    assert.equal(jobs.claimJob.immediate(true, 103), null);
    const restarted = jobs.claimJob.immediate(true, 102 + jobs.LEASE_MS);
    assert.notEqual(restarted.lease_token, first.lease_token);
    assert.equal(jobs.finishJob(first, 'stale'), false);
    assert.equal(jobs.renewJob(first), false);
    assert.equal(jobs.finishJob(restarted, null, { retryMs: 10, time: 200 }), true);
    assert.equal(jobs.claimJob.immediate(true, 209), null);
    const retry = jobs.claimJob.immediate(true, 210);
    jobs.finishJob(retry, { success: true });
    assert.equal(jobs.readJob('one').state, 'done');
    jobs.enqueueJob.immediate('fail', 'test', {}, { priority: 20 });
    await runNextJob(true, { test: async () => { throw new Error('offline'); } });
    const failed = jobs.readJob('fail');
    assert.equal(failed.state, 'queued'); assert.ok(failed.run_at > failed.updated_at);
    assert.equal(failed.error, 'dependency_unavailable');
});

test('another process resumes a persisted queued job after a restart', () => {
    jobs.enqueueJob.immediate('restart', 'test', {}, { priority: 20 });
    const url = new URL('../jobs.js', import.meta.url).href;
    const script = `const j=await import(${JSON.stringify(url)}); const job=j.claimJob.immediate(true); j.finishJob(job,{resumed:true});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(jobs.readJob('restart').result, { resumed: true });
});

test('worker lanes keep interactive work independent and preserve pending transaction diagnostics', async () => {
    jobs.enqueueJob.immediate('background', 'slow', {}, { priority: 0 });
    jobs.enqueueJob.immediate('receipt', 'transaction', { validUntil: Math.floor(Date.now() / 1000) + 600 }, { priority: 30 });
    let release;
    const background = runNextJob(false, { slow: () => new Promise(resolve => { release = resolve; }) });
    await runNextJob(true, { transaction: async () => ({ state: 'pending' }) });
    assert.equal(jobs.readJob('receipt').state, 'queued');
    assert.equal(jobs.readJob('receipt').result.state, 'pending');
    release(); await background;
    scheduleRecurring(); scheduleRecurring();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM worker_jobs WHERE key LIKE 'periodic:%'").get().n, 7);
});

test('API serves cached publications and metadata through worker outages, failing signing readiness closed', async () => {
    db.prepare(`INSERT INTO publications_v3(item_address,registry_address,uploader_wallet,bag_id,title,category,visible,revision,created_at)
        VALUES(?,?,?,?,?,?,1,'0',1700000000)`).run(address, sdk.REGISTRY_ADDRESS, wallet, bagId, fields.title, fields.category);
    assert.equal((await getApiPublication(address)).item_address, address);
    assert.equal(jobs.readJob('publication:' + address).state, 'queued');
    const details = { size: '123', files_count: 1, files: [{ name: 'test', size: 123 }] };
    db.prepare('INSERT INTO bag_metadata VALUES(?,?,?,?,?)').run(bagId, JSON.stringify(details), 1, 2, 1);
    const stored = await getApiBagInfo(bagId, true);
    assert.equal(stored.size, '123'); assert.equal(stored.files.length, 1); assert.equal(stored.peers_count, null);
    jobs.writeRuntime('v3-config', { ready: true, network: sdk.CHAIN });
    assert.equal(getApiConfig().ready, false);
    jobs.writeRuntime('worker', { stopping: false });
    assert.equal(getApiConfig().ready, true);
    jobs.writeRuntime('worker', { stopping: false }, Date.now() - 31000);
    assert.equal(getApiConfig().ready, false);
    db.exec('DELETE FROM worker_jobs');
    const insert = db.prepare("INSERT INTO worker_jobs(key,kind,payload,run_at,updated_at) VALUES(?,'test','{}',0,0)");
    db.transaction(() => { for (let i = 0; i < jobs.JOB_LIMIT; i++) insert.run('full:' + i); })();
    assert.equal((await getApiPublication(address)).item_address, address, 'queue saturation must not hide cached publications');
    assert.equal((await getApiBagInfo(bagId, true)).size, '123', 'queue saturation must not hide cached metadata');
    assert.throws(() => jobs.enqueueJob.immediate('overflow', 'test', {}), /queue_full/);
    scheduleRecurring();
    assert.equal(db.prepare("SELECT COUNT(*) n FROM worker_jobs WHERE key LIKE 'periodic:%'").get().n, 7, 'queue pressure must not prevent worker recovery');
});

test('API queues a signed receipt once without RPC and reports worker results', () => {
    const boc = beginCell().store(storeMessage({ info: { type: 'external-in', dest: Address.parse(wallet), importFee: 0n }, body: Cell.EMPTY })).endCell().toBoc().toString('base64');
    const input = { ...fields, wallet, boc, payload: sdk.publishPayload(fields, '1'), operation: 'publish', validUntil: Math.floor(Date.now() / 1000) + 600 };
    assert.deepEqual(getApiReceipt(input), { state: 'pending' });
    assert.deepEqual(getApiReceipt(input), { state: 'pending' });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_jobs').get().n, 1);
    const job = jobs.claimJob.immediate(true);
    jobs.finishJob(job, { state: 'rejected', exitCode: 403 });
    assert.deepEqual(getApiReceipt(input), { state: 'rejected', exitCode: 403 });
    assert.throws(() => getApiReceipt({ ...input, wallet: 'bad' }), /invalid_transaction_boc/);
});

test('API startup runs no indexers, remains readable without worker, and exposes health', async () => {
    const server = startServer(0);
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
        assert.equal(db.prepare('SELECT COUNT(*) n FROM worker_jobs').get().n, 0);
        for (const route of ['bags', 'health/live', 'health/ready']) {
            const response = await fetch(base + '/api/' + route);
            assert.equal(response.status, 200);
        }
        const worker = await fetch(base + '/api/health/worker');
        assert.equal(worker.status, 503); assert.match(worker.headers.get('cache-control'), /no-store/);
        assert.equal((await (await fetch(base + '/api/v3/config')).json()).ready, false);
        jobs.writeRuntime('worker', { stopping: false });
        scheduleRecurring();
        assert.equal((await fetch(base + '/api/health/worker')).status, 200);
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('RPC budget is persistent across processes and propagates provider cooldown', async () => {
    const first = Date.now();
    await scheduleRpc(async () => 'first');
    await scheduleRpc(async () => 'second');
    assert.ok(Date.now() - first >= 90);
    const error = Object.assign(new Error('limited'), { response: { status: 429, headers: { 'retry-after': '2' } } });
    await assert.rejects(scheduleRpc(async () => { throw error; }), /limited/);
    assert.ok(db.prepare('SELECT cooldown_until FROM rpc_budget').get().cooldown_until > Date.now());
});

test('daily SQLite backup can be restored independently with publication data intact', async () => {
    db.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet) VALUES(?,?,?,?)').run(bagId, 'Legacy', 'video', wallet);
    const backups = join(directory, 'backups');
    assert.equal((await backupDatabase(backups)).verified, true);
    const file = readdirSync(backups).find(name => name.endsWith('.sqlite'));
    const destination = join(directory, 'restored.sqlite');
    copyFileSync(join(backups, file), destination);
    const restored = new Database(destination);
    try {
        assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
        assert.equal(restored.prepare('SELECT name FROM bags WHERE bag_id=?').get(bagId).name, 'Legacy');
    } finally { restored.close(); }
});

test('real API and worker processes share state, restart cleanly, and isolate RPC outages', async () => {
    const path = join(directory, 'processes.sqlite');
    const wrapperCode = name => Cell.fromBase64(readFileSync(new URL(`../../contracts/v3/wrappers-ts/${name}.gen.ts`, import.meta.url), 'utf8').match(/CodeCell\s*=\s*c.Cell.fromBase64\('([^']+)'/)[1]);
    let offline = false, calls = 0;
    const rpc = createServer(async (req, res) => {
        calls++;
        let body = ''; for await (const chunk of req) body += chunk;
        const { method, params } = JSON.parse(body);
        if (offline) { res.writeHead(503); res.end('{}'); return; }
        let result;
        if (method === 'getAddressInformation') result = {
            balance: '100000000', state: 'active', code: wrapperCode('BagRegistry').toBoc().toString('base64'), data: '',
            last_transaction_id: { '@type': 'internal.transactionId', lt: '0', hash: '' }, sync_utime: 1700000000,
            block_id: { '@type': 'ton.blockIdExt', workchain: -1, shard: '0', seqno: 1, root_hash: '', file_hash: '' }
        };
        else if (method === 'getTransactions') result = [];
        else if (method === 'runGetMethod') result = { gas_used: 1, exit_code: 0,
            stack: params.method === 'get_item_code' ? [['cell', { bytes: wrapperCode('BagItem').toBoc().toString('base64') }]] : [['num', params.method === 'get_version' ? '0x3' : '0x0']] };
        else { res.writeHead(400); res.end('{}'); return; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
    });
    rpc.listen(0, '127.0.0.1'); await once(rpc, 'listening');
    const env = { ...process.env, DB_PATH: path, PORT: '0', TON_ENDPOINT: `http://127.0.0.1:${rpc.address().port}`, TON_RPC_MIN_INTERVAL_MS: '100' };
    const cwd = fileURLToPath(new URL('..', import.meta.url));
    const children = [];
    const launch = file => {
        const child = spawn(process.execPath, [file], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.output = ''; child.stdout.on('data', data => { child.output += data; }); child.stderr.on('data', data => { child.output += data; });
        children.push(child); return child;
    };
    const until = async condition => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
        throw new Error('process integration timeout: ' + children.map(child => child.output).join('\n'));
    };
    const stop = async child => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit'); child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        try { const [code] = await exited; assert.equal(code, 0, child.output); }
        finally { clearTimeout(timer); }
    };
    let shared;
    try {
        const api = launch('server.js');
        await until(() => api.output.includes('api_listening'));
        const port = JSON.parse(api.output.split('\n').find(line => line.startsWith('{'))).port;
        const base = `http://127.0.0.1:${port}/api/`;
        assert.equal(calls, 0, 'API startup must not run indexers');
        const worker = launch('worker.js');
        await until(async () => (await (await fetch(base + 'v3/config')).json()).ready);
        shared = new Database(path);
        shared.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet) VALUES(?,?,?,?)').run(bagId, 'Cached', 'video', wallet);
        await stop(worker);
        const count = calls;
        assert.equal((await (await fetch(base + 'bags')).json()).total, 1);
        assert.equal((await fetch(base + 'health/worker')).status, 503);
        assert.equal((await (await fetch(base + 'v3/config')).json()).ready, false);
        assert.equal(calls, count, 'cached reads must not contact TON');
        offline = true;
        const quote = await fetch(base + 'v3/prepare', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...fields, wallet_address: wallet, operation: 'publish' }) });
        assert.equal(quote.status, 503);
        assert.equal((await fetch(base + 'bags')).status, 200);
        offline = false;
        const restarted = launch('worker.js');
        await until(async () => (await fetch(base + 'health/worker')).status === 200);
        assert.equal(shared.prepare('SELECT COUNT(*) n FROM bags').get().n, 1);
        await stop(restarted); await stop(api);
    } finally {
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        shared?.close();
        await new Promise(resolve => rpc.close(resolve));
    }
});

test('permanent publication failures terminate once and retain their diagnostic', async () => {
    const { V3Error } = await import('../v3/errors.js');
    const key = 'publication:' + address;
    jobs.enqueueJob.immediate(key, 'publication', { address }, { priority: 20 });
    let calls = 0;
    await runNextJob(true, { publication: async () => { calls++; throw new V3Error('wrong_publication_code'); } });
    const failed = jobs.readJob(key);
    assert.equal(failed.state, 'failed'); assert.equal(failed.error, 'wrong_publication_code'); assert.equal(failed.error_status, 422);
    jobs.enqueueJob.immediate(key, 'publication', { address }, { priority: 20, ttl: 0 });
    assert.equal(await runNextJob(true, { publication: async () => { calls++; } }), false);
    assert.equal(calls, 1);
    assert.equal(jobs.workerHealth().pending, 0);
    await assert.rejects(getApiPublication(address), error => error.status === 422 && error.code === 'wrong_publication_code');
});

test('HTTP publication reads distinguish proven absence, unavailable dependency and pending work', async () => {
    const key = 'publication:' + address;
    const enqueue = () => jobs.enqueueJob.immediate(key, 'publication', { address }, { priority: 20 });
    const server = startServer(0); await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/api/v3/publications/${encodeURIComponent(address)}`;
    try {
        enqueue(); const absent = jobs.claimJob.immediate(true); jobs.finishJob(absent, null);
        const missing = await fetch(url);
        assert.equal(missing.status, 404); assert.equal((await missing.json()).code, 'publication_not_found');
        db.prepare('DELETE FROM worker_jobs WHERE key=?').run(key);
        enqueue(); const retry = jobs.claimJob.immediate(true);
        jobs.finishJob(retry, null, { retryMs: 60000, error: 'dependency_unavailable', errorStatus: 503 });
        const offline = await fetch(url);
        assert.equal(offline.status, 503); assert.equal(offline.headers.get('retry-after'), '2');
        assert.equal((await offline.json()).code, 'dependency_unavailable');
        db.prepare('DELETE FROM worker_jobs WHERE key=?').run(key);
        enqueue();
        const pending = await fetch(url);
        assert.equal(pending.status, 503); assert.equal((await pending.json()).code, 'worker_pending');
        assert.equal(jobs.readJob(key).state, 'queued', 'waiting must not cancel or recreate work');
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('fresh heartbeat cannot hide stale indexing or an execution renewed indefinitely', () => {
    const time = Date.now(); scheduleRecurring(time); jobs.writeRuntime('worker', { stopping: false }, time);
    assert.equal(jobs.workerHealth(time).degraded, false);
    jobs.writeRuntime('success:index-v3', {}, time - 300001);
    let health = jobs.workerHealth(time);
    assert.equal(health.healthy, true); assert.equal(health.degraded, true);
    assert.ok(health.jobs.find(job => job.key === 'periodic:index-v3').issues.includes('stale_success'));
    jobs.writeRuntime('success:index-v3', {}, time);
    db.prepare("UPDATE worker_jobs SET state='running',lease_token='test',started_at=? WHERE key='periodic:index-v3'").run(time - 180001);
    const running = jobs.readJob('periodic:index-v3');
    assert.equal(jobs.renewJob(running, time), true);
    health = jobs.workerHealth(time);
    assert.ok(health.jobs.find(job => job.key === 'periodic:index-v3').issues.includes('execution_timeout'));
    db.prepare("UPDATE worker_jobs SET state='queued',started_at=0 WHERE key='periodic:index-v3'").run();
    assert.equal(jobs.workerHealth(time).degraded, false);
});

test('v2 deletions continue after failed reads, retry without false success, and recover', async () => {
    const { TonClient } = await import('@ton/ton');
    const { syncDeletions } = await import('../contract-sync.js');
    assert.deepEqual(await syncDeletions(), { checked: 0, deleted: 0, readErrors: 0 });
    const children = [1,2,3,4].map(value => new Address(0, Buffer.alloc(32, value)));
    const ids = [1,2,3,4].map(value => value.toString(16).padStart(64, '0'));
    for (let i = 0; i < 4; i++) db.prepare('INSERT INTO bags(bag_id,name,category,uploader_wallet,contract_index) VALUES(?,?,?,?,?)').run(ids[i], 'Legacy', 'video', wallet, i);
    const original = TonClient.prototype.runMethod;
    let phase = 'mixed';
    TonClient.prototype.runMethod = async (address, method, args) => {
        if (phase === 'offline') throw new Error('simulated dependency outage');
        const tuple = new TupleBuilder();
        if (method === 'get_bag_address') {
            const index = Number(args[0].value);
            if (phase === 'mixed' && index === 0) throw new Error('simulated address read failure');
            tuple.writeAddress(children[index]);
        } else {
            const index = children.findIndex(child => child.equals(address));
            if (phase === 'mixed' && index === 1) return { stack: new TupleReader([]) };
            tuple.writeNumber(1); tuple.writeNumber(index); tuple.writeAddress(Address.parse(sdk.REGISTRY_ADDRESS));
            tuple.writeNumber(BigInt('0x' + ids[index])); tuple.writeCell(beginCell().storeStringTail('Legacy').endCell());
            tuple.writeNumber(0); tuple.writeAddress(Address.parse(wallet)); tuple.writeNumber(1700000000);
            tuple.writeNumber(phase === 'mixed' && index === 2 ? 0 : 1);
        }
        return { stack: new TupleReader(tuple.build()) };
    };
    try {
        assert.deepEqual(await syncDeletions(), { checked: 2, deleted: 1, readErrors: 2 });
        assert.deepEqual(db.prepare('SELECT bag_id FROM bags ORDER BY contract_index').all().map(row => row.bag_id), [ids[0], ids[1], ids[3]]);
        const key = 'periodic:deletions-v2';
        jobs.enqueueJob.immediate(key, 'deletions-v2', {}, { priority: 4 });
        phase = 'offline'; await runNextJob(false);
        assert.equal(jobs.readJob(key).state, 'queued');
        assert.equal(jobs.readJob(key).error, 'dependency_unavailable');
        assert.equal(jobs.readRuntime('success:deletions-v2'), null);
        assert.ok(jobs.workerHealth().jobs.find(job => job.key === key).issues.includes('job_error'));
        assert.equal(db.prepare('SELECT COUNT(*) n FROM bags').get().n, 3);
        phase = 'healthy'; db.prepare('UPDATE worker_jobs SET run_at=0 WHERE key=?').run(key);
        await runNextJob(false);
        assert.equal(jobs.readJob(key).state, 'done');
        assert.deepEqual(jobs.readJob(key).result, { checked: 3, deleted: 0, readErrors: 0 });
        assert.ok(jobs.readRuntime('success:deletions-v2'));
        assert.deepEqual(jobs.workerHealth().jobs.find(job => job.key === key).issues, []);
    } finally { TonClient.prototype.runMethod = original; }
});

test('v2 indexing distinguishes an empty registry from failed or incomplete reads and resumes its cursor', async () => {
    const { TonClient } = await import('@ton/ton');
    const { syncFromContract } = await import('../contract-sync.js');
    const original = TonClient.prototype.runMethod;
    const children = [new Address(0, Buffer.alloc(32, 5)), new Address(0, Buffer.alloc(32, 6))];
    let phase = 'empty';
    TonClient.prototype.runMethod = async (address, method, args) => {
        const tuple = new TupleBuilder();
        if (method === 'get_total') {
            if (phase === 'total') throw new Error('simulated registry failure');
            tuple.writeNumber(phase === 'empty' ? 0 : 2);
        } else if (method === 'get_bag_address') {
            const index = Number(args[0].value);
            if (phase === 'address' && index === 1) throw new Error('simulated address failure');
            tuple.writeAddress(children[index]);
        } else if (method === 'get_bag_data') {
            if (phase === 'data') return { stack: new TupleReader([]) };
            const index = children.findIndex(child => child.equals(address));
            tuple.writeNumber(1); tuple.writeNumber(index); tuple.writeAddress(Address.parse(sdk.REGISTRY_ADDRESS));
            tuple.writeNumber(BigInt('0x' + bagId)); tuple.writeCell(beginCell().storeStringTail('Legacy').endCell());
            tuple.writeNumber(0); tuple.writeAddress(Address.parse(wallet)); tuple.writeNumber(1700000000); tuple.writeNumber(index);
        } else {
            if (phase === 'metadata') return { stack: new TupleReader([]) };
            tuple.writeNumber(1); tuple.writeCell(Cell.EMPTY); tuple.writeNumber(1234); tuple.writeNumber(1);
            tuple.writeCell(Cell.EMPTY); tuple.writeNumber(128); tuple.writeNumber(0); tuple.writeCell(Cell.EMPTY);
        }
        return { stack: new TupleReader(tuple.build()) };
    };
    const key = 'periodic:index-v2';
    try {
        assert.deepEqual(await syncFromContract(), { synced: 0, total: 0 });
        jobs.enqueueJob.immediate(key, 'index-v2', {}, { priority: 7 });
        for (phase of ['total', 'address', 'data', 'metadata']) {
            db.prepare('UPDATE worker_jobs SET run_at=0 WHERE key=?').run(key);
            await runNextJob(false);
            assert.equal(jobs.readJob(key).state, 'queued', phase);
            assert.equal(jobs.readJob(key).error, 'dependency_unavailable', phase);
            assert.equal(jobs.readRuntime('success:index-v2'), null, phase);
            const cursor = db.prepare("SELECT value FROM sync_state WHERE key='contract_bags_cursor'").get().value;
            assert.equal(cursor, phase === 'total' ? -1 : 0, phase);
        }
        phase = 'healthy';
        db.exec("CREATE TRIGGER refuse_bag BEFORE INSERT ON bags BEGIN SELECT RAISE(ABORT,'simulated write failure'); END");
        db.prepare('UPDATE worker_jobs SET run_at=0 WHERE key=?').run(key); await runNextJob(false);
        assert.equal(jobs.readJob(key).state, 'queued');
        assert.equal(db.prepare("SELECT value FROM sync_state WHERE key='contract_bags_cursor'").get().value, 0);
        db.exec('DROP TRIGGER refuse_bag');
        db.prepare('UPDATE worker_jobs SET run_at=0 WHERE key=?').run(key); await runNextJob(false);
        assert.equal(jobs.readJob(key).state, 'done');
        assert.deepEqual(jobs.readJob(key).result, { synced: 1, total: 2 });
        assert.equal(db.prepare("SELECT value FROM sync_state WHERE key='contract_bags_cursor'").get().value, 1);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM bags').get().n, 1);
        assert.ok(jobs.readRuntime('success:index-v2'));
    } finally { TonClient.prototype.runMethod = original; }
});

test('Storage failures degrade worker health despite successful scheduling and clear after recovery', async () => {
    scheduleRecurring(); jobs.writeRuntime('worker', { stopping: false });
    db.prepare("UPDATE worker_jobs SET state='done'").run();
    const fetch = globalThis.fetch;
    const key = 'storage:' + bagId;
    try {
        globalThis.fetch = async () => new Response('', { status: 503 });
        jobs.enqueueJob.immediate(key, 'storage', { bagId }, { priority: 15 });
        await runNextJob(true);
        let health = jobs.workerHealth();
        assert.equal(health.healthy, true); assert.equal(health.degraded, true);
        assert.equal(health.storage.failed_jobs, 1);
        assert.ok(health.jobs.every(job => job.issues.length === 0), 'the scheduler itself remains healthy');
        const server = startServer(0); await once(server, 'listening');
        try {
            const url = `http://127.0.0.1:${server.address().port}/api/health/worker`;
            assert.equal((await fetch(url)).status, 503);
            globalThis.fetch = async () => new Response(JSON.stringify({ bag_size: '1234', files_count: 1, files: [] }));
            db.prepare('UPDATE worker_jobs SET run_at=0 WHERE key=?').run(key); await runNextJob(true);
            health = jobs.workerHealth();
            assert.equal(health.storage.failed_jobs, 0); assert.equal(health.degraded, false);
            assert.equal((await fetch(url)).status, 200);
        } finally { await new Promise(resolve => server.close(resolve)); }
    } finally { globalThis.fetch = fetch; }
});
