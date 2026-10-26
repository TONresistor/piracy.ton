import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSize } from '../src/format.js';
import { createBagDetailController } from '../src/bag/controller.js';

test('size formatting accepts bytes and legacy units and never renders invalid numbers', () => {
    for (const [input, expected] of [['4404019', '4.2 MB'], ['4.2 MB', '4.2 MB'], [0, '0 B'],
        [null, '-'], ['', '-'], ['invalid', '-'], [-1, '-']]) {
        assert.equal(formatSize(input), expected);
    }
});

test('bag details distinguish 404 from unavailable responses and allow retry', async () => {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { style: {}, dataset: {}, hidden: false, addEventListener() {},
            querySelector() { return node('message'); } });
        return nodes.get(id);
    };
    let code = 503;
    const context = createBagDetailController({ doc: { getElementById: node }, browser: { location: { search: '?id=example' } }, translate: key => key, fetcher: async () => ({ status: code, ok: false }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(node('message').textContent, 'chain_unavailable');
    assert.equal(node('retry-bag').hidden, false);
    code = 404;
    await context.loadBagDetail();
    assert.equal(node('message').textContent, 'bag_not_found');
    assert.equal(node('retry-bag').hidden, true);
});
