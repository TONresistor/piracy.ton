import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalogController } from '../src/catalog/controller.js';
import test from 'node:test';

const flush = () => new Promise(setImmediate);
function harness() {
    const nodes = new Map();
    const requests = [], rendered = [], messages = [];
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, {
            value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', events: {},
            addEventListener(name, callback) { this.events[name] = callback; },
            setAttribute() {}
        });
        return nodes.get(id);
    };
    const context = {
        document: { getElementById: node, querySelector: () => ({ value: '' }), querySelectorAll: () => [] },
        window: { addEventListener() {} },
        console: { error() {} }, URLSearchParams, AbortController, API_URL: '/api',
        t: key => key === 'pagination_status' ? '{start}–{end} of {total} · Page {page}/{pages}' : key,
        // Deliberately ignore abort: even a response already in flight must be discarded.
        fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
    };
    const controller = createCatalogController({ doc: context.document, browser: context.window, fetcher: context.fetch, translate: context.t,
        view: { renderBags: bags => rendered.push(bags), setTableMessage: key => messages.push(key), setTableSkeleton() {} } });
    function reply(index, { total = 51, page = 1, limit = 50, bags = [] } = {}) {
        requests[index].resolve({ ok: true, json: async () => ({ total, page, limit, bags }) });
    }
    return { context: controller, requests, rendered, messages, node, reply };
}
async function ready() {
    const h = harness(); h.reply(0); await flush(); return h;
}

test('late search results and failures cannot replace the latest results', async () => {
    const h = await ready();
    const old = h.context.loadBags('old'), latest = h.context.loadBags('latest');
    assert.equal(h.requests[1].options.signal.aborted, true);
    h.reply(2, { bags: [{ name: 'latest' }] }); await latest;
    h.reply(1, { bags: [{ name: 'old' }] }); await old;
    assert.equal(h.rendered.at(-1)[0].name, 'latest');
    const failure = h.context.loadBags('will fail'), success = h.context.loadBags('success');
    h.reply(4, { bags: [{ name: 'success' }] }); await success;
    h.requests[3].reject(new Error('offline')); await failure;
    assert.equal(h.rendered.at(-1)[0].name, 'success');
    assert.equal(h.messages.length, 0);
});

test('pagination preserves filters, resets on a new search and disables duplicate navigation', async () => {
    const h = await ready();
    const search = h.context.loadBags('music', 'audio'); h.reply(1, { total: 101 }); await search;
    h.node('next-page').events.click(); h.node('next-page').events.click();
    assert.equal(h.requests.length, 3);
    const url = new URL(h.requests[2].url, 'https://example.test');
    assert.equal(url.searchParams.get('q'), 'music'); assert.equal(url.searchParams.get('category'), 'audio');
    assert.equal(url.searchParams.get('page'), '2');
    h.reply(2, { total: 101, page: 2 }); await flush();
    assert.equal(h.node('page-status').textContent, '51–100 of 101 · Page 2/3');
    const changed = h.context.loadBags('books', 'books');
    assert.equal(new URL(h.requests[3].url, 'https://example.test').searchParams.get('page'), '1');
    h.reply(3, { total: 1 }); await changed;
    assert.equal(h.node('previous-page').disabled, true); assert.equal(h.node('next-page').disabled, true);
});

test('empty and page-boundary result counts expose exactly the available navigation', async () => {
    const h = await ready();
    for (const total of [0, 1, 50, 51, 100, 101]) {
        const request = h.context.loadBags(); h.reply(h.requests.length - 1, { total }); await request;
        assert.equal(h.node('catalog-pagination').hidden, total === 0);
        assert.equal(h.node('previous-page').disabled, true);
        assert.equal(h.node('next-page').disabled, total <= 50);
    }
});

test('a vanished last page redirects once to the last remaining page', async () => {
    const h = await ready();
    const pending = h.context.loadBags('music', 'audio', 3);
    h.reply(1, { total: 100, page: 3 }); await flush();
    assert.equal(h.requests.length, 3);
    assert.equal(new URL(h.requests[2].url, 'https://example.test').searchParams.get('page'), '2');
    h.reply(2, { total: 100, page: 2 }); await pending;
    assert.equal(h.node('page-status').textContent, '51–100 of 100 · Page 2/2');
    assert.equal(h.node('next-page').disabled, true);
});

test('every locale supplies pagination labels and all interpolation fields', () => {
    for (const lang of ['en', 'fr', 'es', 'ru', 'zh', 'ar']) {
        const strings = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
        for (const key of ['pagination_label', 'pagination_previous', 'pagination_next', 'pagination_status']) assert.ok(strings[key], lang + ':' + key);
        for (const field of ['start', 'end', 'total', 'page', 'pages']) assert.ok(strings.pagination_status.includes('{' + field + '}'));
    }
});
