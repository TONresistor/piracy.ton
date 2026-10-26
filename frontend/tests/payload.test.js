import assert from 'node:assert/strict';
import test from 'node:test';
import { beginCell } from '@ton/core';
import {
    OP_ADD_BAG,
    buildAddBagPayload,
    decodeAddBagPayload
} from '../src/legacy/contract.js';

const FIXTURE = Object.freeze({
    bagId: '12'.repeat(32),
    name: 'Icy Tower v1.5.1.exe',
    category: 'games',
    description: 'Classic platform game',
    bagSize: '4404019',
    filesCount: 1,
    pieceSize: 131072,
    merkleHash: 'ab'.repeat(32),
    dirName: 'Icy Tower'
});

const GOLDEN_PAYLOAD = 'te6cckEBBgEAmAACSkFEQkcSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEgMBAgAoSWN5IFRvd2VyIHYxLjUuMS5leGUDYAAAAAAAQzMzAAAAAQACAACrq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urqwMEBQAqQ2xhc3NpYyBwbGF0Zm9ybSBnYW1lAAAAEkljeSBUb3dlcj439AU=';
const GOLDEN_HASH = 'bfc74c01520ef2f51f4ed630cd5ba8c549abbfd6f8b9f44974dd5f4d7fb1c964';

test('AddBag encoder stays byte-for-byte compatible with the deployed TL-B schema', async () => {
    const payload = await buildAddBagPayload(FIXTURE);
    assert.equal(payload, GOLDEN_PAYLOAD);

    const decoded = await decodeAddBagPayload(payload);
    assert.deepEqual(decoded, {
        opcode: OP_ADD_BAG,
        bagId: FIXTURE.bagId,
        category: 3,
        name: FIXTURE.name,
        description: FIXTURE.description,
        bagSize: FIXTURE.bagSize,
        filesCount: FIXTURE.filesCount,
        pieceSize: FIXTURE.pieceSize,
        merkleHash: FIXTURE.merkleHash,
        dirName: FIXTURE.dirName,
        payloadHash: GOLDEN_HASH
    });
});

test('decoder rejects a non-empty legacy files cell', async () => {
    const name = beginCell().storeStringTail(FIXTURE.name).endCell();
    const description = beginCell().storeStringTail(FIXTURE.description).endCell();
    const files = beginCell().storeBit(1).endCell();
    const dirName = beginCell().storeStringTail(FIXTURE.dirName).endCell();
    const metadata = beginCell()
        .storeRef(description)
        .storeUint(BigInt(FIXTURE.bagSize), 64)
        .storeUint(FIXTURE.filesCount, 32)
        .storeRef(files)
        .storeUint(FIXTURE.pieceSize, 32)
        .storeUint(BigInt(`0x${FIXTURE.merkleHash}`), 256)
        .storeRef(dirName)
        .endCell();
    const payload = beginCell()
        .storeUint(OP_ADD_BAG, 32)
        .storeUint(BigInt(`0x${FIXTURE.bagId}`), 256)
        .storeUint(3, 8)
        .storeRef(name)
        .storeRef(metadata)
        .endCell()
        .toBoc()
        .toString('base64');

    await assert.rejects(() => decodeAddBagPayload(payload), /files cell/);
});

test('encoder enforces the deployed contract cell-tree limit before payment', async () => {
    await assert.rejects(
        () => buildAddBagPayload({ ...FIXTURE, description: 'x'.repeat(2200) }),
        error => error.code === 'metadata_too_large'
    );
});
