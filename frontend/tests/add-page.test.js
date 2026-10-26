import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Address, beginCell, storeMessage } from '@ton/core';

const addPage = await readFile(new URL('../add.html', import.meta.url), 'utf8');

test('durable registration status remains visible when the wallet-gated form is hidden', () => {
    const formStart = addPage.indexOf('<form id="upload-form"');
    const formEnd = addPage.indexOf('</form>', formStart);
    const status = addPage.indexOf('id="upload-status"');

    assert.ok(formStart >= 0 && formEnd > formStart && status >= 0, 'expected add form and status element');
    assert.ok(
        status < formStart || status > formEnd,
        'upload-status must not be hidden with the wallet-gated form'
    );
});

// Execute the real controller without a browser or wallet transport.
import { createPublishingController } from '../src/publishing/controller.js';
import { createApi } from '../src/services/api.js';
const sdk = await import('../../shared/contract-sdk/dist/browser.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
const owner = '0:' + '12'.repeat(32);
const fields = { bagId: '34'.repeat(32), title: 'Example', category: 'video', visible: true };
const attempt = { ...fields, operation: 'publish', wallet: owner, address: sdk.publicationAddress(owner, fields.bagId), expectedRevision: '0', validUntil: Math.floor(Date.now() / 1000) + 600 };
const boc = beginCell().store(storeMessage({ info: { type: 'external-in', dest: Address.parse(owner), importFee: 0n }, body: beginCell().storeUint(42, 32).endCell() })).endCell().toBoc().toString('base64');
function controllerHarness({ saved = null, fail = '', sendError, fetcher } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', style: {}, dataset: {}, hidden: false, handlers: {},
            addEventListener(name, fn) { this.handlers[name] = fn; }, querySelectorAll() { return []; },
            setAttribute() {}, removeAttribute() {}, append() {}, contains() { return false; } });
        return elements.get(id);
    };
    let stored = saved, sends = 0, statusChange;
    const timers = [], calls = [];
    const wallet = { account: { chain: sdk.CHAIN, address: owner } };
    const ui = { wallet, setConnectionNetwork() {}, onStatusChange(fn) { statusChange = fn; }, connectionRestored: Promise.resolve(),
        async sendTransaction() { sends++; if (sendError) throw sendError; return { boc }; }, async openModal() {} };
    const doc = { getElementById: element, createElement: () => element('link') };
    const browser = { addEventListener() {} };
    const storage = {
        getItem(key) { if (fail === 'read') throw new Error('denied'); return key === 'piracy.v3.pending' ? stored : null; },
        setItem(_key, value) { if (fail === 'write') throw new Error('denied'); stored = value; },
        removeItem() { if (fail === 'remove') throw new Error('denied'); stored = null; }
    };
    const fetch = async (url, options) => {
            calls.push(url);
            if (fetcher) return fetcher(url, options);
            const data = url.endsWith('/config') ? { ready: true } : url.endsWith('/prepare') ? {
                network: sdk.CHAIN, address: attempt.address, operation: 'publish', amount: '10000000', queryId: '1', revision: '0'
            } : { item_address: attempt.address, uploader_wallet: owner, bag_id: fields.bagId, title: fields.title, category: fields.category, visible: true, revision: '0' };
            return { ok: true, json: async () => data };
        };
    const context = createPublishingController({ ui, doc, browser, storage, api: createApi(fetch), translate: key => key, search: '', schedule(fn) { timers.push(fn); } });
    element('bag-id').value = fields.bagId; element('bag-name').value = fields.title;
    element('bag-category').value = fields.category; element('bag-visible').checked = true;
    return { context, element, timers, calls, get stored() { return stored; }, get sends() { return sends; },
        changeWallet(value) { ui.wallet = value; statusChange(value); },
        submit() { return element('upload-form').handlers.submit({ preventDefault() {} }); } };
}

test('invalid pending data is discarded while legacy valid data restores without resigning', async () => {
    for (const saved of ['{', '{}', JSON.stringify({ ...attempt, validUntil: 'invalid' }), JSON.stringify({ ...attempt, version: 99 })]) {
        const h = controllerHarness({ saved }); await flush();
        assert.equal(h.stored, null);
        assert.equal(h.element('submit-bag').disabled, false);
    }
    const h = controllerHarness({ saved: JSON.stringify(attempt), fetcher: async url => {
        if (url.endsWith('/config')) return { ok: true, json: async () => ({ ready: true }) };
        return { ok: false, json: async () => ({ code: 'chain_unavailable' }) };
    } });
    await flush(); await h.submit();
    assert.equal(h.sends, 0);
    assert.equal(h.element('submit-bag').disabled, true);
    assert.ok(h.stored);
});

test('storage failure blocks signing and removal failure retains a confirmed attempt', async () => {
    for (const fail of ['read', 'write']) {
        const h = controllerHarness({ fail }); await flush(); await h.submit();
        assert.equal(h.sends, 0);
        assert.equal(h.element('submit-bag').disabled, true);
        assert.equal(h.element('upload-status').textContent, 'v3_storage_error');
    }
    const h = controllerHarness({ saved: JSON.stringify(attempt), fail: 'remove' }); await flush();
    assert.ok(h.stored);
    assert.equal(h.element('submit-bag').disabled, true);
    assert.equal(h.element('upload-status').textContent, 'v3_storage_error');
});

test('ambiguous wallet errors retain pending state while explicit cancellation clears it', async () => {
    for (const [message, retained] of [['unknown', true], ['cancel', false]]) {
        const h = controllerHarness({ sendError: Object.assign(new Error(message), message === 'cancel' ? { code: 300 } : {}) }); await flush(); await h.submit();
        assert.equal(h.sends, 1);
        assert.equal(Boolean(h.stored), retained);
        if (retained) assert.equal(JSON.parse(h.stored).version, 1);
    }
});

test('refresh and observation are single-flight and scheduling waits for completion', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const h = controllerHarness({ saved: JSON.stringify(attempt), fetcher: async url => {
        await gate;
        return { ok: true, json: async () => url.endsWith('/config') ? { ready: true } : {} };
    } });
    const first = h.context.refresh();
    assert.equal(first, h.context.refresh());
    assert.equal(h.calls.length, 1); assert.equal(h.timers.length, 0);
    const observe = h.context.observe();
    assert.equal(observe, h.context.observe());
    assert.equal(h.calls.filter(url => url.includes('/publications/')).length, 1);
    release(); await first; await observe; await flush();
    assert.equal(h.timers.length, 1);
});

test('a wallet change during preparation prevents opening the signing request', async () => {
    let release;
    const h = controllerHarness({ fetcher: async url => {
        if (url.endsWith('/prepare')) return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ network: sdk.CHAIN, address: attempt.address }) }); });
        return { ok: true, json: async () => ({ ready: true }) };
    } });
    await flush(); const submission = h.submit(); await flush();
    h.changeWallet({ account: { chain: sdk.CHAIN, address: '0:' + '56'.repeat(32) } });
    release(); await submission;
    assert.equal(h.sends, 0); assert.equal(h.stored, null);
});

test('signed BoC survives reload and rejected contract execution releases the pending attempt', async () => {
    let rejected = false;
    const fetcher = async url => {
        const data = url.endsWith('/config') ? { ready: true } : url.endsWith('/prepare') ? {
            network: sdk.CHAIN, address: attempt.address, operation: 'publish', amount: '10000000', queryId: '1', revision: '0'
        } : url.endsWith('/transaction') ? { state: rejected ? 'rejected' : 'executed', exitCode: 403 } : { code: 'publication_not_found' };
        return { ok: !url.includes('/publications/'), json: async () => data };
    };
    const h = controllerHarness({ fetcher }); await flush(); await h.submit();
    const saved = JSON.parse(h.stored);
    assert.equal(saved.boc, boc);
    assert.ok(saved.payload);
    assert.equal(h.element('submit-bag').disabled, true, 'executed receipt alone is not publication confirmation');
    const restored = controllerHarness({ saved: h.stored, fetcher }); await flush();
    assert.equal(restored.sends, 0);
    assert.ok(restored.calls.some(url => url.endsWith('/transaction')));
    rejected = true; await restored.context.observe();
    assert.equal(restored.stored, null);
    assert.equal(restored.element('upload-status').textContent, 'tx_rejected_contract');
    assert.equal(restored.element('submit-bag').disabled, false);
});

test('lookup failure keeps the signed attempt and never resends', async () => {
    const h = controllerHarness({ saved: JSON.stringify({ ...attempt, boc, payload: sdk.publishPayload(fields, '1') }), fetcher: async url => ({
        ok: url.endsWith('/config'), json: async () => url.endsWith('/config') ? { ready: true } : { code: url.includes('/publications/') ? 'publication_not_found' : 'chain_unavailable' }
    }) });
    await flush(); await h.context.observe(); await h.submit();
    assert.equal(JSON.parse(h.stored).boc, boc);
    assert.equal(h.sends, 0);
    assert.equal(h.element('submit-bag').disabled, true);
});
