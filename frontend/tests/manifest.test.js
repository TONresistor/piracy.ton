import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const manifest = JSON.parse(await readFile(new URL('../public/tonconnect-manifest.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../tonconnect-manifest.schema.json', import.meta.url), 'utf8'));

test('manifest conforms to the official TON Connect schema copy', () => {
    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
    assert.equal(new URL(manifest.url).origin, new URL(manifest.iconUrl).origin);
    assert.equal(manifest.name, 'piracy.ton');
});

test('manifest icon is a square PNG suitable for wallet trust UI', async () => {
    const png = await readFile(new URL('../public/piracy.png', import.meta.url));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 500);
    assert.equal(png.readUInt32BE(20), 500);
});

test('generated assets have stable content fingerprints', async () => {
    const inventory = JSON.parse(await readFile(new URL('../dist/asset-manifest.json', import.meta.url), 'utf8'));
    for (const [path, expected] of Object.entries(inventory.files)) {
        const bytes = await readFile(new URL('../dist/' + path, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path);
    }
});

test('every locale contains the complete TON Connect state vocabulary', async () => {
    const localeNames = ['ar', 'en', 'es', 'fr', 'ru', 'zh'];
    const required = [
        'wallet_restoring', 'wallet_connected_mainnet', 'wallet_changed', 'wrong_network', 'session_expired',
        'wallet_unsupported', 'manifest_error', 'chain_unavailable', 'storage_unavailable', 'rate_limited',
        'bag_ready', 'invalid_storage_metadata', 'metadata_too_large', 'tx_waiting_wallet',
        'tx_confirming', 'tx_confirmation_delayed', 'tx_cancelled', 'tx_rejected_contract',
        'tx_attempt_lost', 'tx_expired', 'tx_bad_request', 'bag_added', 'bag_already_indexed'
    ];
    for (const localeName of localeNames) {
        const locale = JSON.parse(await readFile(new URL(`../src/i18n/locales/${localeName}.json`, import.meta.url), 'utf8'));
        for (const key of required) assert.equal(typeof locale[key], 'string', `${localeName}.${key}`);
    }
});
