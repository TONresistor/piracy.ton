import { Address, Cell, beginCell, loadMessage, storeMessage } from '@ton/core';
import { BagRegistry, Publish, InitializePublication, PublicationPresentation } from '../../../contracts/v3/wrappers-ts/BagRegistry.gen';
import { BagItem, UpdatePublication, PublicationIdentity } from '../../../contracts/v3/wrappers-ts/BagItem.gen';

import type { PublicationInput, PublicationFields, ProviderClient, TransactionInput, PendingPublication, IndexedPublication } from './types.js';

export const CHAIN = '-239';
const registry = BagRegistry.fromStorage({ version: 3n });
export const REGISTRY_ADDRESS = registry.address.toRawString();
export const REGISTRY_CODE_HASH = BagRegistry.CodeCell.hash().toString('hex');
export const ITEM_CODE_HASH = BagItem.CodeCell.hash().toString('hex');
export const SUGGESTED_CATEGORIES = ['video', 'audio', 'apps', 'games', 'books', 'other'];
export function normalizeAddress(value: string) { return Address.parse(value).toRawString(); }
export function validatePublication(input: PublicationInput) {
    const bagId = String(input.bagId || '').trim().toLowerCase();
    const title = String(input.title ?? '').trim();
    const category = String(input.category ?? '').trim();
    if (!/^[a-f0-9]{64}$/.test(bagId) || /^0+$/.test(bagId)) throw new Error('invalid_bagid');
    if (new TextEncoder().encode(title).length > 256) throw new Error('title_too_large');
    if (!/^[a-z0-9-]{1,16}$/.test(category)) throw new Error('invalid_category');
    if (input.visible !== undefined && typeof input.visible !== 'boolean') throw new Error('invalid_visibility');
    return { bagId, title, category, visible: input.visible ?? true };
}
export function publicationAddress(wallet: string, bagId: string) {
    const item = BagItem.fromStorage({ identity: { ref: PublicationIdentity.create({ registry: registry.address, uploader: Address.parse(wallet), bagId: BigInt('0x' + bagId) }) }, content: null });
    return item.address.toRawString();
}
function presentation(input: PublicationFields) {
    return { ref: PublicationPresentation.create({ title: input.title, category: input.category, visible: input.visible }) };
}
export function publishPayload(input: PublicationInput, queryId: string) {
    const fields = validatePublication(input);
    return Publish.toCell(Publish.create({ queryId: BigInt(queryId), bagId: BigInt('0x' + fields.bagId), presentation: presentation(fields) })).toBoc().toString('base64');
}
export function updatePayload(input: PublicationInput, revision: string, queryId: string) {
    const fields = validatePublication(input);
    if (!/^\d+$/.test(revision) || BigInt(revision) > 0xffffffffffffffffn) throw new Error('invalid_revision');
    return UpdatePublication.toCell(UpdatePublication.create({ queryId: BigInt(queryId), expectedRevision: BigInt(revision), presentation: presentation(fields) })).toBoc().toString('base64');
}
export function buildTransaction(input: TransactionInput) {
    const owner = normalizeAddress(input.wallet);
    if (input.network !== CHAIN) throw new Error('wrong_network');
    if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n || BigInt(input.amount) > 1000000000n) throw new Error('invalid_amount');
    let message: { address: string; amount: string; payload: string } | null;
    {
        const fields = validatePublication(input);
        message = input.operation === 'publish'
            ? { address: REGISTRY_ADDRESS, amount: input.amount, payload: publishPayload(fields, input.queryId) }
            : input.operation === 'update'
                ? { address: publicationAddress(owner, fields.bagId), amount: input.amount, payload: updatePayload(fields, input.revision, input.queryId) }
                : null;
        if (!message) throw new Error('invalid_operation');
    }
    message.address = Address.parse(message.address).toString({ bounceable: true, testOnly: false });
    return { validUntil: Math.floor(Date.now() / 1000) + 600, network: CHAIN, from: owner, messages: [message] };
}
export async function readPublication(client: ProviderClient, address: string) {
    const item = BagItem.fromAddress(Address.parse(address));
    const result = await item.getPublication(client.provider(item.address));
    const fields = result.presentation.ref;
    return { initialized: result.initialized, registry: result.registry.toRawString(), uploader: result.uploader.toRawString(), bagId: result.bagId.toString(16).padStart(64, '0'), createdAt: Number(result.createdAt), revision: result.revision.toString(), title: fields.title, category: fields.category, visible: fields.visible };
}
export async function readFunding(client: ProviderClient, owner: string, input: PublicationInput, operation: string) {
    const fields = validatePublication(input);
    const result = operation === 'publish'
        ? await registry.getPublishFunding(client.provider(registry.address), Address.parse(owner), BigInt('0x' + fields.bagId), presentation(fields))
        : await BagItem.fromAddress(Address.parse(publicationAddress(owner, fields.bagId))).getFunding(client.provider(Address.parse(publicationAddress(owner, fields.bagId))), presentation(fields));
    return { minimumValue: result.minimumValue.toString(), storageReserve: result.storageReserve.toString() };
}
export async function verifyRegistry(client: ProviderClient) {
    const version = await registry.getVersion(client.provider(registry.address));
    const itemCode = await registry.getItemCode(client.provider(registry.address));
    return version === 3n && itemCode.hash().toString('hex') === ITEM_CODE_HASH;
}
export function decodeInitialization(body: string) {
    const msg = InitializePublication.fromSlice(Cell.fromBase64(body).beginParse());
    return { uploader: msg.uploader.toRawString(), bagId: msg.bagId.toString(16).padStart(64, '0') };
}

export function confirmationState(attempt: PendingPublication, item: IndexedPublication) {
    if (item.item_address !== attempt.address || item.uploader_wallet !== attempt.wallet || item.bag_id !== attempt.bagId) return 'pending';
    if (BigInt(item.revision) < BigInt(attempt.expectedRevision)) return 'pending';
    return item.title === attempt.title && item.category === attempt.category && item.visible === attempt.visible ? 'confirmed' : 'superseded';
}

export function transactionReceipt(boc: string, wallet: string) {
    if (typeof boc !== 'string' || boc.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(boc)) throw new Error('invalid_transaction_boc');
    const roots = Cell.fromBoc(Buffer.from(boc, 'base64'));
    if (roots.length !== 1) throw new Error('invalid_transaction_boc');
    const message = loadMessage(roots[0].beginParse());
    if (message.info.type !== 'external-in' || !message.info.dest.equals(Address.parse(wallet))) throw new Error('invalid_transaction_boc');
    const normalized = { ...message, init: null, info: { ...message.info, src: undefined, importFee: 0n } };
    return { externalMessageHash: beginCell().store(storeMessage(normalized, { forceRef: true })).endCell().hash().toString('hex') };
}
