import { Buffer as BrowserBuffer } from 'buffer';
import { CATEGORY_MAP, CONTRACT_ADDRESS, REGISTRATION_FEE, RegistrationValidationError } from './registration.js';
export { CONTRACT_ADDRESS, REGISTRATION_FEE };
export const OP_ADD_BAG = 0x41444247;
const MAX_USER_CELL_BITS = 16384;
const MAX_USER_CELL_CELLS = 256;
let tonCorePromise = null;
function getTonCore() {
    if (!tonCorePromise) {
        tonCorePromise = import('@ton/core').then(core => ({ ...core, Buffer: BrowserBuffer }));
    }
    return tonCorePromise;
}
function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function assertFullyConsumed(slice, label) {
    if (slice.remainingBits !== 0 || slice.remainingRefs !== 0) {
        throw new Error(`${label} contains trailing data`);
    }
}
function assertContractCellBounds(root) {
    let bits = 0;
    let cells = 0;
    const visited = new Set();
    const visit = cell => {
        if (visited.has(cell))
            return;
        visited.add(cell);
        cells += 1;
        bits += cell.bits.length;
        if (cells > MAX_USER_CELL_CELLS || bits > MAX_USER_CELL_BITS) {
            throw new RegistrationValidationError('metadata_too_large');
        }
        for (const ref of cell.refs)
            visit(ref);
    };
    visit(root);
}
export async function buildAddBagPayload(params) {
    const { beginCell, Buffer } = await getTonCore();
    const categoryNum = CATEGORY_MAP[params.category];
    if (categoryNum === undefined)
        throw new Error('Invalid category');
    const nameCell = beginCell().storeStringTail(params.name).endCell();
    const descriptionCell = beginCell().storeStringTail(params.description || params.name).endCell();
    const dirNameCell = beginCell().storeStringTail(params.dirName || '').endCell();
    const filesCell = beginCell().endCell();
    const metadataCell = beginCell()
        .storeRef(descriptionCell)
        .storeUint(BigInt(params.bagSize), 64)
        .storeUint(params.filesCount, 32)
        .storeRef(filesCell)
        .storeUint(params.pieceSize, 32)
        .storeUint(BigInt(`0x${params.merkleHash}`), 256)
        .storeRef(dirNameCell)
        .endCell();
    assertContractCellBounds(nameCell);
    assertContractCellBounds(metadataCell);
    const root = beginCell()
        .storeUint(OP_ADD_BAG, 32)
        .storeUint(BigInt(`0x${params.bagId}`), 256)
        .storeUint(categoryNum, 8)
        .storeRef(nameCell)
        .storeRef(metadataCell)
        .endCell();
    return Buffer.from(root.toBoc()).toString('base64');
}
export async function decodeAddBagPayload(payload) {
    const { Cell, Buffer } = await getTonCore();
    const roots = Cell.fromBoc(Buffer.from(payload, 'base64'));
    if (roots.length !== 1)
        throw new Error('Payload must contain one root cell');
    const root = roots[0];
    const slice = root.beginParse();
    const opcode = slice.loadUint(32);
    const bagId = slice.loadUintBig(256).toString(16).padStart(64, '0');
    const category = slice.loadUint(8);
    const nameCell = slice.loadRef();
    const metadataCell = slice.loadRef();
    assertFullyConsumed(slice, 'AddBag');
    assertContractCellBounds(nameCell);
    assertContractCellBounds(metadataCell);
    const metadata = metadataCell.beginParse();
    const descriptionCell = metadata.loadRef();
    const bagSize = metadata.loadUintBig(64);
    const filesCount = metadata.loadUint(32);
    const filesCell = metadata.loadRef();
    const pieceSize = metadata.loadUint(32);
    const merkleHash = metadata.loadUintBig(256).toString(16).padStart(64, '0');
    const dirNameCell = metadata.loadRef();
    assertFullyConsumed(metadata, 'BagMetadata');
    if (filesCell.bits.length !== 0 || filesCell.refs.length !== 0) {
        throw new Error('Unsupported non-empty files cell');
    }
    return {
        opcode,
        bagId,
        category,
        name: nameCell.beginParse().loadStringTail(),
        description: descriptionCell.beginParse().loadStringTail(),
        bagSize: bagSize.toString(),
        filesCount,
        pieceSize,
        merkleHash,
        dirName: dirNameCell.beginParse().loadStringTail(),
        payloadHash: bytesToHex(root.hash())
    };
}
export async function hashAddBagPayload(payload) {
    return (await decodeAddBagPayload(payload)).payloadHash;
}
