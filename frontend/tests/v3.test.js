import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { Address, Cell } from '@ton/core';
import * as sdk from '../../shared/contract-sdk/dist/browser.js';
const owner = '0:' + '11'.repeat(32);
const fields = { bagId: '12'.repeat(32), title: 'A title', category: 'new-category', visible: true };

test('publishing and editing preserve payload widths and identity per user and bag', () => {
    const input = { ...fields, wallet: owner, network: '-239', operation: 'publish', amount: '15000000', queryId: '42' };
    assert.throws(() => sdk.buildTransaction({ ...input, network: '-3' }), /wrong_network/);
    assert.throws(() => sdk.buildTransaction({ ...input, operation: 'deploy' }), /invalid_operation/);
    const publish = sdk.buildTransaction(input);
    let body = Cell.fromBase64(publish.messages[0].payload).beginParse();
    assert.equal(body.loadUint(32), 0x50554233); assert.equal(body.loadUintBig(64), 42n);
    assert.equal(body.loadUintBig(256), BigInt('0x' + fields.bagId));
    assert.equal(Address.parseFriendly(publish.messages[0].address).address.toRawString(), sdk.REGISTRY_ADDRESS);
    assert.equal(Address.parseFriendly(publish.messages[0].address).isTestOnly, false);
    assert.equal(Address.parseFriendly(publish.messages[0].address).isBounceable, true);
    const update = sdk.buildTransaction({ ...input, operation: 'update', revision: '3' });
    body = Cell.fromBase64(update.messages[0].payload).beginParse();
    assert.equal(body.loadUint(32), 0x55504433); assert.equal(body.loadUintBig(64), 42n); assert.equal(body.loadUintBig(64), 3n);
    assert.equal(Address.parseFriendly(update.messages[0].address).address.toRawString(), sdk.publicationAddress(owner, fields.bagId));
    assert.notEqual(sdk.publicationAddress(owner, fields.bagId), sdk.publicationAddress(new Address(0, Buffer.alloc(32, 2)).toRawString(), fields.bagId));
    for (const amount of ['0','-1','1000000001','1.2']) assert.throws(() => sdk.buildTransaction({ ...input, amount }), /invalid_amount/);
    assert.throws(() => sdk.buildTransaction({ ...input, operation: 'update', revision: '-1' }), /invalid_revision/);
});

test('text category, UTF-8 title and visibility follow v3 bounds', () => {
    assert.equal(sdk.validatePublication({ ...fields, title: 'é'.repeat(128) }).title.length, 128);
    assert.throws(() => sdk.validatePublication({ ...fields, title: 'é'.repeat(129) }), /title_too_large/);
    for (const category of ['', 'Upper', 'has space', 'x'.repeat(17)]) assert.throws(() => sdk.validatePublication({ ...fields, category }), /invalid_category/);
    assert.equal(sdk.validatePublication({ ...fields, title: '' }).title, '');
    assert.throws(() => sdk.validatePublication({ ...fields, visible: 'false' }), /invalid_visibility/);
});

test('confirmation requires matching chain identity, revision and presentation', () => {
    const pending = { ...fields, address: sdk.publicationAddress(owner, fields.bagId), wallet: owner, expectedRevision: '2' };
    const item = { item_address: pending.address, uploader_wallet: owner, bag_id: fields.bagId, title: fields.title, category: fields.category, visible: true, revision: '2' };
    assert.equal(sdk.confirmationState(pending, { ...item, revision: '1' }), 'pending');
    assert.equal(sdk.confirmationState(pending, { ...item, uploader_wallet: sdk.REGISTRY_ADDRESS }), 'pending');
    assert.equal(sdk.confirmationState(pending, { ...item, title: 'Later change', revision: '3' }), 'superseded');
    assert.equal(sdk.confirmationState(pending, item), 'confirmed');
});

test('v3 browser bundle runs without a global Buffer', () => {
    const url = new URL('../../shared/contract-sdk/dist/browser.js', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.Buffer=undefined; const s=await import(${JSON.stringify(url)}); s.publishPayload(${JSON.stringify(fields)},'1');`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr.slice(-3000));
});

test('generated SDK getters decode RPC tuples and use the generated presentation serializer', async () => {
    const { TupleBuilder, TupleReader, beginCell } = await import('@ton/core');
    const { readFile } = await import('node:fs/promises');
    const wrapper = await readFile(new URL('../../contracts/v3/wrappers-ts/BagItem.gen.ts', import.meta.url),'utf8');
    const itemCode = Cell.fromBase64(wrapper.match(/CodeCell\s*=\s*c.Cell.fromBase64\('([^']+)'/)[1]);
    const client = { provider: () => ({ get: async (method, args) => {
        const tuple = new TupleBuilder();
        if (method === 'get_version') tuple.writeNumber(3n);
        else if (method === 'get_item_code') tuple.writeCell(itemCode);
        else if (method === 'get_publication') {
            tuple.writeBoolean(true); tuple.writeAddress(Address.parse(sdk.REGISTRY_ADDRESS)); tuple.writeAddress(Address.parse(owner));
            tuple.writeNumber(BigInt('0x'+fields.bagId)); tuple.writeNumber(1700000000n); tuple.writeNumber(2n);
            tuple.writeCell(beginCell().storeStringRefTail(fields.title).storeStringRefTail(fields.category).storeBit(true).endCell());
        } else {
            const presentation = args.at(-1).cell.beginParse();
            assert.equal(presentation.loadStringRefTail(),fields.title); assert.equal(presentation.loadStringRefTail(),fields.category);
            for (const value of [12000000n,9000000n,3000000n,31536000n]) tuple.writeNumber(value);
        }
        return { stack: new TupleReader(tuple.build()) };
    } }) };
    assert.equal(await sdk.verifyRegistry(client),true);
    assert.equal((await sdk.readPublication(client,sdk.publicationAddress(owner,fields.bagId))).revision,'2');
    assert.equal((await sdk.readFunding(client,owner,fields,'publish')).minimumValue,'12000000');
    assert.equal((await sdk.readFunding(client,owner,fields,'update')).storageReserve,'9000000');
});
