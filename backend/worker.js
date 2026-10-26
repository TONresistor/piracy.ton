import './env.js';
import { pathToFileURL } from 'node:url';
import db from './db.js';
import { backupDatabase } from './backup.js';
import { enqueueJob, claimJob, renewJob, finishJob, writeRuntime } from './jobs.js';
import { getV3Config, refreshPublication } from './v3/publications.js';
import { lookupV3Transaction } from './v3/transactions.js';
import { syncV3 } from './v3/indexer.js';
import v3Sdk from './v3-sdk.cjs';
import { syncFromContract, syncDeletions } from './contract-sync.js';
import { reconcileRegistrationAttempts } from './registration-attempts.js';
import { refreshBagMetadata } from './storage.js';
import { recurringPolicy, classifyJobError } from './job-policy.js';

export function scheduleRecurring(time = Date.now()) {
    for (const { kind, interval: ttl, priority } of recurringPolicy) {
        enqueueJob.immediate('periodic:' + kind, kind, {}, { ttl, time, priority });
    }
}
export const handlers = {
    async config() {
        const config = await getV3Config({}, { fresh: true });
        writeRuntime('v3-config', config);
        if (!config.ready) throw new Error('chain_unavailable');
        return config;
    },
    async 'index-v3'() {
        const result = await syncV3();
        if (result?.ready === false || result?.refreshErrors > 0) throw new Error('chain_unavailable');
        return result;
    },
    backup: () => backupDatabase(),
    async 'index-v2'() {
        const result = await syncFromContract();
        if (result?.error) throw new Error('chain_unavailable');
        return result;
    },
    async 'deletions-v2'() {
        const result = await syncDeletions();
        if (result?.readErrors > 0) throw new Error('chain_unavailable');
        return result;
    },
    'legacy-attempts': () => reconcileRegistrationAttempts(),
    metadata() {
        // A stable cursor spreads refresh work across large catalogues.
        const cursor = db.prepare("SELECT value FROM runtime_state WHERE key='metadata-cursor'").get();
        const last = cursor ? JSON.parse(cursor.value) : '';
        const all = 'SELECT bag_id FROM bags UNION SELECT bag_id FROM publications_v3';
        let rows = db.prepare(`SELECT bag_id FROM (${all}) WHERE bag_id>? ORDER BY bag_id LIMIT 50`).all(last);
        if (rows.length < 50) rows.push(...db.prepare(`SELECT bag_id FROM (${all}) WHERE bag_id<=? ORDER BY bag_id LIMIT ?`).all(last, 50 - rows.length));
        for (const { bag_id } of rows) enqueueJob.immediate('storage:' + bag_id, 'storage', { bagId: bag_id }, { ttl: 60000, priority: 1 });
        if (rows.length) writeRuntime('metadata-cursor', rows.at(-1).bag_id);
        return { scheduled: rows.length };
    },
    publication: payload => refreshPublication(payload.address, {}, { fresh: true }),
    async storage(payload) { return await refreshBagMetadata(payload.bagId) ? { found: true } : null; },
    async transaction(payload) {
        const result = await lookupV3Transaction(payload);
        // Publication state remains the authoritative confirmation.
        if (result.state === 'executed') {
            const address = v3Sdk.publicationAddress(payload.wallet, payload.bagId);
            enqueueJob.immediate('publication:' + address, 'publication', { address }, { priority: 20, ttl: 2000 });
        }
        return result;
    }
};
export async function runNextJob(interactive, operations = handlers, time = Date.now()) {
    const job = claimJob.immediate(interactive, time);
    if (!job) return false;
    const timer = setInterval(() => renewJob(job), 15000);
    try {
        const result = await operations[job.kind](job.payload);
        const pending = job.kind === 'transaction' && result?.state === 'pending' && Date.now() / 1000 <= job.payload.validUntil + 1800;
        if (finishJob(job, result, { retryMs: pending ? Math.min(30000, 3000 * job.attempts) : null }) && !pending) {
            writeRuntime('success:' + job.kind, { at: Date.now() });
        }
    } catch (error) {
        const delay = Math.min(job.kind === 'config' ? 30000 : 600000, 2000 * 2 ** Math.min(job.attempts, 8));
        const failure = classifyJobError(error);
        finishJob(job, job.result, { terminal: failure.terminal, retryMs: failure.terminal ? null : delay, error: failure.code, errorStatus: failure.status });
        console.warn(JSON.stringify({ event: failure.terminal ? 'job_failed' : 'job_retry', kind: job.kind, code: failure.code, attempt: job.attempts, retry_ms: failure.terminal ? null : delay }));
    } finally { clearInterval(timer); }
    return true;
}
export function startWorker() {
    let stopping = false;
    const active = new Set();
    writeRuntime('worker', { stopping: false });
    scheduleRecurring();
    const heartbeat = setInterval(() => {
        writeRuntime('worker', { stopping });
        if (!stopping) scheduleRecurring();
    }, 5000);
    async function lane(interactive) {
        while (!stopping) {
            const running = runNextJob(interactive);
            active.add(running);
            try { await running; } finally { active.delete(running); }
            if (!stopping) await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    const lanes = [lane(true), lane(false)];
    async function stop() {
        if (stopping) return;
        stopping = true;
        writeRuntime('worker', { stopping: true });
        await Promise.allSettled([...active, ...lanes]);
        clearInterval(heartbeat);
        db.close();
    }
    return { stop, done: Promise.all(lanes) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const worker = startWorker();
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
        const deadline = setTimeout(() => process.exit(1), 25000); deadline.unref();
        void worker.stop().then(() => process.exit(0));
    });
    worker.done.catch(error => { console.error('[worker] stopped:', error.message); process.exit(1); });
}
