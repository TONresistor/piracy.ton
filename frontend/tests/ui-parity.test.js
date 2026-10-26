import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const expected = JSON.parse(await readFile(new URL('./fixtures/ui-baseline.json', import.meta.url), 'utf8'));
const assets = JSON.parse(await readFile(new URL('../dist/asset-manifest.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const markup = html => html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>/g, '').replace(/<link rel="stylesheet"[^>]*>/g, '').replace(/\s+/g, ' ').trim();
test('all four pages preserve their original markup including prepaint theme handling', async () => {
    for (const [name, digest] of Object.entries(expected.markup)) {
        const html = await readFile(new URL('../dist/' + name, import.meta.url), 'utf8');
        assert.equal(hash(markup(html)), digest, name);
        assert.equal((html.match(/<script type="module" src=/g) || []).length, 1);
        assert.ok(html.includes(assets.entries[name]));
        assert.ok(!html.includes('?v=' + '22'), 'stylesheet no longer uses a manual cache counter');
    }
});
test('theme, components, page styles and responsive rules concatenate byte-for-byte', async () => {
    const css = await readFile(new URL('../dist/' + assets.stylesheet, import.meta.url));
    assert.equal(hash(css), expected.css);
    assert.ok(assets.stylesheet.includes(expected.css.slice(0, 12)));
});
test('all original public artwork, animation and TON Connect identity are unchanged', async () => {
    for (const [name, digest] of Object.entries(expected.public)) {
        assert.equal(hash(await readFile(new URL('../dist/' + name, import.meta.url))), digest, name);
    }
});
test('all six translations are unchanged and have content-addressed URLs', async () => {
    for (const [language, url] of Object.entries(assets.locales)) {
        const source = await readFile(new URL('../src/i18n/locales/' + language + '.json', import.meta.url));
        assert.ok(url.includes(hash(source).slice(0, 12)));
        assert.deepEqual(await readFile(new URL('../dist' + url, import.meta.url)), source);
    }
});
