import { randomUUID } from 'node:crypto';
import db from './db.js';
import { recurringPolicy } from './job-policy.js';

export class JobError extends Error {
    constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

export const JOB_LIMIT = 5000;
export const LEASE_MS = 60000;
export function readJob(key) {
    const row = db.prepare('SELECT * FROM worker_jobs WHERE key=?').get(key);
    return row ? { ...row, payload: JSON.parse(row.payload), result: row.result ? JSON.parse(row.result) : null } : null;
}
export const enqueueJob = db.transaction((key, kind, payload, { priority = 0, ttl = 0, time = Date.now() } = {}) => {
    const existing = readJob(key);
    if (existing && (!['done', 'failed'].includes(existing.state) || existing.updated_at + (existing.state === 'failed' ? 86400000 : ttl) > time)) {
        if (existing.state === 'queued' && priority > existing.priority) {
            db.prepare('UPDATE worker_jobs SET priority=? WHERE key=?').run(priority, key);
            return readJob(key);
        }
        return existing;
    }
    if (!existing) {
        db.prepare("DELETE FROM worker_jobs WHERE state IN ('done','failed') AND updated_at<?").run(time - 86400000);
        const limit = key.startsWith('periodic:') ? JOB_LIMIT + 16 : JOB_LIMIT;
        if (db.prepare('SELECT COUNT(*) n FROM worker_jobs').get().n >= limit) {
            db.prepare("DELETE FROM worker_jobs WHERE key IN (SELECT key FROM worker_jobs WHERE state IN ('done','failed') AND priority>=10 AND key NOT LIKE 'periodic:%' ORDER BY updated_at LIMIT 100)").run();
            if (db.prepare('SELECT COUNT(*) n FROM worker_jobs').get().n >= limit) throw new Error('queue_full');
        }
    }
    db.prepare(`INSERT INTO worker_jobs(key,kind,payload,priority,run_at,updated_at,created_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,priority=excluded.priority,state='queued',
        run_at=excluded.run_at,lease_until=0,lease_token=NULL,attempts=0,result=NULL,error=NULL,error_status=NULL,started_at=0,updated_at=excluded.updated_at`)
        .run(key, kind, JSON.stringify(payload), priority, time, time, time);
    return readJob(key);
});
export const claimJob = db.transaction((interactive, time = Date.now()) => {
    const row = db.prepare(`SELECT key FROM worker_jobs WHERE ((state='queued' AND run_at<=?)
        OR (state='running' AND lease_until<=?)) AND ${interactive ? 'priority>=10' : 'priority<10'}
        ORDER BY CASE WHEN priority>=10 THEN priority+MIN(20,MAX(0,(?-run_at)/1000)) ELSE priority END DESC,run_at,key LIMIT 1`).get(time, time, time);
    if (!row) return null;
    db.prepare(`UPDATE worker_jobs SET state='running',lease_until=?,lease_token=?,started_at=?,attempts=attempts+1 WHERE key=?`)
        .run(time + LEASE_MS, randomUUID(), time, row.key);
    return readJob(row.key);
});
export function renewJob(job, time = Date.now()) {
    return db.prepare("UPDATE worker_jobs SET lease_until=? WHERE key=? AND state='running' AND lease_token=?")
        .run(time + LEASE_MS, job.key, job.lease_token).changes === 1;
}
export function finishJob(job, result, { retryMs = null, error = null, terminal = false, errorStatus = null, time = Date.now() } = {}) {
    return db.prepare(`UPDATE worker_jobs SET state=?,result=?,error=?,error_status=?,run_at=?,lease_until=0,lease_token=NULL,updated_at=?
        WHERE key=? AND state='running' AND lease_token=?`)
        .run(terminal ? 'failed' : retryMs === null ? 'done' : 'queued', result === undefined ? null : JSON.stringify(result), error, errorStatus,
            time + (retryMs ?? 0), time, job.key, job.lease_token).changes === 1;
}
export function writeRuntime(key, value, time = Date.now()) {
    db.prepare(`INSERT INTO runtime_state VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
        .run(key, JSON.stringify(value), time);
}
export function readRuntime(key) {
    const row = db.prepare('SELECT * FROM runtime_state WHERE key=?').get(key);
    return row ? { value: JSON.parse(row.value), updatedAt: row.updated_at } : null;
}
export async function waitForJob(key, timeoutMs = 6000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const job = readJob(key);
        if (job?.state === 'done') return job.result;
        if (job?.error) throw new JobError(job.error, job.error_status ?? 503);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new JobError('worker_pending');
}
export function workerHealth(time = Date.now()) {
    const heartbeat = readRuntime('worker');
    const queue = db.prepare("SELECT COUNT(*) count,MIN(run_at) oldest FROM worker_jobs WHERE state IN ('queued','running')").get();
    const rows = db.prepare("SELECT key,updated_at,error,state,created_at,started_at FROM worker_jobs WHERE key LIKE 'periodic:%'").all();
    const jobs = recurringPolicy.map(policy => {
        const key = 'periodic:' + policy.kind;
        const row = rows.find(job => job.key === key);
        const lastSuccess = readRuntime('success:' + policy.kind)?.updatedAt ?? null;
        const issues = [];
        if (!row) issues.push('job_missing');
        else {
            if (row.error) issues.push('job_error');
            if (time - (lastSuccess ?? row.created_at) > policy.maxStale) issues.push('stale_success');
            if (row.state === 'running' && time - row.started_at > policy.maxRun) issues.push('execution_timeout');
        }
        return { ...row, key, last_success_at: lastSuccess, issues };
    });
    const storage = db.prepare(`SELECT COUNT(*) failed_jobs,MIN(updated_at) oldest_failure_at FROM worker_jobs
        WHERE kind='storage' AND state IN ('queued','running') AND error IS NOT NULL`).get();
    return { healthy: Boolean(heartbeat && time - heartbeat.updatedAt < 30000 && !heartbeat.value.stopping),
        degraded: jobs.some(job => job.issues.length > 0) || storage.failed_jobs > 0,
        storage,
        chain: readRuntime('v3-config'),
        heartbeat_at: heartbeat?.updatedAt ?? null, pending: queue.count,
        oldest_due_seconds: queue.oldest ? Math.max(0, Math.floor((time - queue.oldest) / 1000)) : 0, jobs };
}
