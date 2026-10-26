import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const contractModuleUrl = new URL('../.cache/legacy-browser.js', import.meta.url).href;

test('generated TON Core bundle works in browsers without a global Buffer', () => {
    const browserRuntimeScript = `
        globalThis.Buffer = undefined;
        globalThis.window = globalThis;
        const { buildAddBagPayload, decodeAddBagPayload } = await import(
            ${JSON.stringify(contractModuleUrl)} + '?browser-runtime-test=' + Date.now()
        );
        const fixture = {
            bagId: '12'.repeat(32),
            name: 'Icy Tower v1.5.1.exe',
            category: 'games',
            description: 'Classic platform game',
            bagSize: '4404019',
            filesCount: 1,
            pieceSize: 131072,
            merkleHash: 'ab'.repeat(32),
            dirName: 'Icy Tower'
        };
        const payload = await buildAddBagPayload(fixture);
        const decoded = await decodeAddBagPayload(payload);
        if (decoded.bagId !== fixture.bagId || decoded.filesCount !== fixture.filesCount) {
            throw new Error('Browser payload round-trip mismatch');
        }
    `;

    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', browserRuntimeScript], {
        encoding: 'utf8'
    });

    const diagnostic = (result.stderr || result.stdout).slice(-4000);
    assert.equal(result.status, 0, diagnostic);
});
