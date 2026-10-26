import './env.js'; // MUST stay first — loads .env before db.js / contract-sync.js read process.env
import express from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listCatalog, legacyBag } from './catalog.js';
import { prepareV3 } from './v3/publications.js';
import { V3Error } from './v3/errors.js';
import { getApiConfig, getApiPublication, getApiBagInfo, getApiReceipt } from './api.js';
import { enqueueJob, workerHealth, waitForJob } from './jobs.js';
import db from './db.js';
import {
    formatSize,
    normalizeSizeBytes,
    getCachedBagSummary,
    TonStorageUnavailableError
} from './storage.js';
import {
    RegistrationAttemptError,
    cancelRegistrationAttempt,
    getRegistrationAttempt,
    getRegistrationHealth,
    markRegistrationUnknown,
    submitRegistrationBoc
} from './registration-attempts.js';

export const app = express();
// The public service is reached through a reverse proxy on loopback. Trust
// only that local hop so req.ip is per-client without accepting spoofed XFF
// headers from arbitrary direct peers.
app.set('trust proxy', 'loopback');

// CORS from CORS_ORIGIN (comma-separated). '*' = allow all (wildcard),
// a list of origins = restrict to those, empty/unset = same-origin only.
// NOTE: .env currently ships '*' (allow all). Set it to your real origin
// (e.g. tonsite://piracy.ton) to actually restrict cross-origin access.
const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const corsOrigin = corsOrigins.includes('*')
    ? '*'
    : (corsOrigins.length ? corsOrigins : false);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '128kb' }));
app.use('/api', rateLimit({ limit: 300, windowMs: 60000 }));

// Constant-time comparison of the x-sync-secret header against SYNC_SECRET.
function isSyncAuthorized(req) {
    const secret = process.env.SYNC_SECRET;
    if (!secret) return false;
    const provided = Buffer.from(req.get('x-sync-secret') || '');
    const expected = Buffer.from(secret);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}

app.get('/api/bags', (req, res) => {
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000000);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    try {
        const result = listCatalog({ version: req.query.version || 'all', category: req.query.category, q: req.query.q, page, limit });
        for (const bag of result.bags) bag.peers_count = getCachedBagSummary(bag.bag_id)?.peers_count ?? null;
        res.json(result);
    } catch { res.status(400).json({ code: 'invalid_catalog_query' }); }
});
app.get('/api/bags/:id', (req, res) => {
    const row = legacyBag(req.params.id);
    return row ? res.json(row) : res.status(404).json({ error: 'Bag not found' });
});

app.get('/api/bag-info/:bagId', async (req, res, next) => {
    const { bagId } = req.params;

    if (!/^[a-fA-F0-9]{64}$/.test(bagId)) {
        return res.status(400).json({ error: 'Invalid bag_id format' });
    }

    const normalizedBagId = bagId.toLowerCase();
    const includeFiles = req.query.include_files !== '0';
    let info;
    try {
        info = await getApiBagInfo(normalizedBagId, includeFiles);
    } catch (error) {
        if (error instanceof TonStorageUnavailableError) {
            return res.status(503).json({ error: 'TON Storage unavailable', code: 'storage_unavailable' });
        }
        return next(error);
    }
    if (!info) {
        return res.status(404).json({ error: 'Bag not found in TON Storage' });
    }

    res.json({
        bag_id: normalizedBagId,
        metadata_updated_at: info.metadata_updated_at,
        description: info.description,
        size: formatSize(info.size),
        size_bytes: normalizeSizeBytes(info.size),
        files_count: info.files_count,
        peers_count: info.peers_count,
        files: includeFiles ? (info.files || []) : undefined,
        bag_size: info.bag_size,
        piece_size: info.piece_size,
        merkle_hash: info.merkle_hash,
        dir_name: info.dir_name
    });
});

function rateLimit({ limit, windowMs }) {
    const buckets = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;
        if (bucket.count > limit) {
            res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
            return res.status(429).json({ error: 'rate_limited', code: 'rate_limited' });
        }
        if (buckets.size > 1000) {
            for (const [candidate, value] of buckets) {
                if (value.resetAt <= now) buckets.delete(candidate);
            }
        }
        next();
    };
}

const registrationReadLimit = rateLimit({ limit: 120, windowMs: 60_000 });
const registrationWriteLimit = rateLimit({ limit: 20, windowMs: 60_000 });

function disableCaching(_req, res, next) {
    // The public reverse proxy caches other GET APIs. Registration state is
    // mutable and must always reach this process or a wallet can remain stuck
    // on an obsolete BROADCAST/CONFIRMING response.
    res.set({
        'Cache-Control': 'private, no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
        Pragma: 'no-cache',
        Expires: '0'
    });
    next();
}

function sendRegistrationError(res, error) {
    if (error instanceof RegistrationAttemptError) {
        return res.status(error.status).json({ error: error.code, code: error.code });
    }
    console.error('[tonconnect] Registration API failed:', error);
    return res.status(500).json({ error: 'internal_error', code: 'internal_error' });
}

app.use('/api/registration-attempts', disableCaching);
app.use('/api/health/tonconnect', disableCaching);

app.post('/api/registration-attempts', registrationWriteLimit, (_req, res) => {
    res.status(409).json({ code: 'v2_read_only', error: 'v2_read_only' });
});

app.get('/api/registration-attempts/:id', registrationReadLimit, (req, res) => {
    const attempt = getRegistrationAttempt(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'attempt_not_found', code: 'attempt_not_found' });
    res.json(attempt);
});

app.post('/api/registration-attempts/:id/submission', registrationWriteLimit, (req, res) => {
    try {
        res.json(submitRegistrationBoc(req.params.id, req.body?.boc));
    } catch (error) {
        sendRegistrationError(res, error);
    }
});

app.post('/api/registration-attempts/:id/unknown', registrationWriteLimit, (req, res) => {
    try {
        res.json(markRegistrationUnknown(req.params.id));
    } catch (error) {
        sendRegistrationError(res, error);
    }
});

app.post('/api/registration-attempts/:id/cancel', registrationWriteLimit, (req, res) => {
    try {
        res.json(cancelRegistrationAttempt(req.params.id));
    } catch (error) {
        sendRegistrationError(res, error);
    }
});

app.use('/api/v3', disableCaching);
app.get('/api/v3/config', registrationReadLimit, async (_req, res) => res.json(getApiConfig()));
app.post('/api/v3/prepare', registrationWriteLimit, async (req, res) => {
    try { res.json(await prepareV3(req.body || {})); }
    catch (error) { res.status(error instanceof V3Error ? error.status : 503).json({ code: error.code || 'chain_unavailable' }); }
});
app.post('/api/v3/transaction', registrationWriteLimit, async (req, res) => {
    try { res.json(getApiReceipt(req.body || {})); }
    catch (error) { res.status(error instanceof V3Error ? error.status : 503).json({ code: error.code || 'chain_unavailable' }); }
});
app.get('/api/v3/publications/:address', registrationReadLimit, async (req, res) => {
    try {
        const publication = await getApiPublication(req.params.address);
        publication ? res.json(publication) : res.status(404).json({ code: 'publication_not_found' });
    } catch (error) {
        const status = error instanceof V3Error ? error.status : 503;
        if (status === 503) res.set('Retry-After', '2');
        res.status(status).json({ code: error.code || 'chain_unavailable' });
    }
});

app.get('/api/health/tonconnect', (_req, res) => {
    res.json(getRegistrationHealth());
});

app.post('/api/sync', async (req, res, next) => {
    if (!isSyncAuthorized(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        enqueueJob.immediate('periodic:index-v2', 'index-v2', {}, { priority: 10 });
        const result = await waitForJob('periodic:index-v2', 10000);
        res.json({ synced: result?.synced ?? 0, total: result?.total ?? db.prepare('SELECT COUNT(*) n FROM bags').get().n });
    } catch (error) { next(error); }
});

app.use('/api/health', disableCaching);
app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health/worker', (_req, res) => {
    const health = workerHealth();
    res.status(health.healthy && !health.degraded ? 200 : 503).json(health);
});
app.get('/api/health/ready', (_req, res) => {
    try { db.prepare('SELECT 1').get(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
});

app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'request_too_large', code: 'request_too_large' });
    }
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'invalid_json', code: 'invalid_json' });
    }
    if (['queue_full', 'rpc_busy', 'worker_pending', 'dependency_unavailable'].includes(error.message)) return res.status(503).json({ code: 'service_busy' });
    console.error('[http] Unhandled request error:', error?.message || error);
    return res.status(500).json({ error: 'internal_error', code: 'internal_error' });
});

const PORT = process.env.PORT || 3005;
export function startServer(port = PORT) {
    const server = app.listen(port, '127.0.0.1', () => {
        console.log(JSON.stringify({ event: 'api_listening', port: server.address().port }));
    });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = startServer();
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
        const deadline = setTimeout(() => process.exit(1), 12000); deadline.unref();
        server.close(() => { db.close(); process.exit(0); });
    });
}
