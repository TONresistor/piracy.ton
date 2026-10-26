import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const testDirectory = mkdtempSync(join(tmpdir(), 'piracy-storage-'));
process.env.DB_PATH = join(testDirectory, 'test.sqlite');
process.env.STORAGE_API_URL = 'http://127.0.0.1:18195/api/v1';
process.env.STORAGE_API_LOGIN = 'test-login';
process.env.STORAGE_API_PASSWORD = 'test-password';

const originalFetch = globalThis.fetch;
let fetchCount = 0;
globalThis.fetch = async (url, options) => {
    fetchCount += 1;
    assert.equal(options.headers.Authorization, 'Basic dGVzdC1sb2dpbjp0ZXN0LXBhc3N3b3Jk');
    const bagId = new URL(url).searchParams.get('bag_id');
    if (bagId === '34'.repeat(32)) return new Response('', { status: 503 });
    assert.equal(bagId, '12'.repeat(32));
    return new Response(JSON.stringify({
        description: 'Icy Tower',
        bag_size: '4404019',
        files_count: 1,
        piece_size: 131072,
        merkle_hash: 'ab'.repeat(32),
        dir_name: 'Icy Tower',
        files: [{ name: 'Icy Tower v1.5.1.exe', size: 4404019 }],
        peers: [{ id: 'peer-1' }],
        seeding: true,
        active: true
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};

const db = (await import('../db.js')).default;
const {
    BAG_DETAILS_TTL_MS,
    TonStorageUnavailableError,
    getCachedBagSummary,
    getBagInfo
} = await import('../storage.js');

after(() => {
    globalThis.fetch = originalFetch;
    db.close();
    rmSync(testDirectory, { recursive: true, force: true });
});

test('TON Storage HTTP details use Basic auth and immutable metadata is cached for 24h', async () => {
    assert.equal(BAG_DETAILS_TTL_MS, 24 * 60 * 60 * 1000);
    const bagId = '12'.repeat(32);
    const first = await getBagInfo(bagId, true);
    const second = await getBagInfo(bagId, true);

    assert.equal(fetchCount, 1);
    assert.equal(first.bag_size, '4404019');
    assert.equal(first.files_count, 1);
    assert.equal(first.peers_count, 2);
    assert.deepEqual(first.files, [{ name: 'Icy Tower v1.5.1.exe', size: 4404019 }]);
    assert.deepEqual(second, first);

    const summary = getCachedBagSummary(bagId);
    assert.equal(fetchCount, 1);
    assert.deepEqual(summary, { size: '4404019', files_count: 1, peers_count: 2 });

    await assert.rejects(
        () => getBagInfo('34'.repeat(32), true, true),
        error => error instanceof TonStorageUnavailableError && error.status === 503
    );
    assert.equal(fetchCount, 2);
});

test('Storage coalesces concurrent reads, separates files from summary and retries failures', async () => {
    const bagId = '78'.repeat(32);
    let calls = 0, fail = true;
    globalThis.fetch = async () => {
        calls++;
        await new Promise(resolve => setImmediate(resolve));
        return new Response(JSON.stringify({ bag_size: '1024', files: [{ name: 'a', size: 1024 }] }), { status: fail ? 503 : 200 });
    };
    const failed = await Promise.allSettled([getBagInfo(bagId, true, true), getBagInfo(bagId, true, true)]);
    assert.ok(failed.every(result => result.status === 'rejected'));
    assert.equal(calls, 1);
    fail = false;
    const [summary, files] = await Promise.all([getBagInfo(bagId), getBagInfo(bagId, true)]);
    assert.equal(calls, 2);
    assert.equal(summary.files, undefined);
    assert.equal(files.files.length, 1);
});

test('durable Storage cache survives memory eviction and expires after 24h', async () => {
    const { STORAGE_CACHE_LIMIT } = await import('../storage.js');
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ bag_size: '1024' })); };
    const id = number => number.toString(16).padStart(64, '0');
    await getBagInfo(id(1000));
    for (let i = 1001; i <= 1000 + STORAGE_CACHE_LIMIT; i++) await getBagInfo(id(i));
    const before = calls;
    await getBagInfo(id(1000));
    assert.equal(calls, before);
    const clock = Date.now;
    try {
        const future = clock() + BAG_DETAILS_TTL_MS + 1;
        Date.now = () => future;
        await getBagInfo(id(1000));
        assert.equal(calls, before + 1);
    } finally { Date.now = clock; }
});

test('byte normalization supports legacy units, zero and uint64 without losing precision', async () => {
    const { normalizeSizeBytes } = await import('../storage.js');
    for (const [input, expected] of [['4.2 MB', '4404019'], ['4404019', '4404019'], [0, '0'],
        ['18446744073709551615', '18446744073709551615'], ['18446744073709551616', null],
        [null, null], ['', null], ['invalid', null], [-1, null]]) {
        assert.equal(normalizeSizeBytes(input), expected);
    }
});
