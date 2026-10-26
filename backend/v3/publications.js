import { randomUUID } from 'node:crypto';
import { Address, Cell } from '@ton/core';
import sdk from '../v3-sdk.cjs';
import { readBagMetadata } from '../storage.js';
import { deps } from './context.js';
import { cachedRead, publicationEntry, readCache } from './cache.js';
import { persistPublication } from './repository.js';
import { V3Error } from './errors.js';

const codeHash = state => state.code ? Cell.fromBoc(state.code)[0].hash().toString('hex') : null;
export async function getV3Config(custom = {}, { fresh = false } = {}) {
    const d = deps(custom);
    const cache = readCache(custom);
    try {
        return await cachedRead(cache, cache?.config ?? {}, custom, fresh, async () => {
            const state = await d.client.getContractState(Address.parse(sdk.REGISTRY_ADDRESS));
            if (state.state === 'frozen') return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, status: 'frozen', ready: false };
            if (state.state !== 'active') return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, status: 'undeployed', ready: false };
            if (codeHash(state) !== sdk.REGISTRY_CODE_HASH || !await d.verify(d.client)) {
                return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, status: 'wrong_code', ready: false };
            }
            return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, status: 'ready', ready: true };
        }, value => value.ready ? 15000 : 2000);
    } catch {
        return { network: sdk.CHAIN, registry: sdk.REGISTRY_ADDRESS, status: 'unavailable', ready: false };
    }
}
export async function refreshPublication(address, custom = {}, { fresh = false } = {}) {
    const d = deps(custom);
    let normalized;
    try { normalized = sdk.normalizeAddress(address); } catch { throw new V3Error('invalid_address'); }
    const cache = readCache(custom);
    return cachedRead(cache, publicationEntry(cache, normalized), custom, fresh, async () => {
        const state = await d.client.getContractState(Address.parse(normalized));
        if (state.state !== 'active') return null;
        if (codeHash(state) !== sdk.ITEM_CODE_HASH) throw new V3Error('wrong_publication_code');
        const item = await d.read(d.client, normalized);
        if (!item.initialized) return null;
        if (item.registry !== sdk.REGISTRY_ADDRESS || sdk.publicationAddress(item.uploader, item.bagId) !== normalized) {
            throw new V3Error('invalid_publication_identity');
        }
        sdk.validatePublication(item);
        if (!/^(0|[1-9]\d*)$/.test(item.revision) || BigInt(item.revision) > 0xffffffffffffffffn) {
            throw new V3Error('invalid_revision');
        }
        const info = await d.metadata(item.bagId, false).catch(() => null);
        return persistPublication.immediate(normalized, item, info);
    }, () => 2000);
}
export async function prepareV3(input, custom = {}) {
    const d = deps(custom);
    const config = await getV3Config(custom, { fresh: true });
    if (!config.ready) throw new V3Error(config.status === 'unavailable' ? 'chain_unavailable' : 'v3_not_ready', 503);
    let owner, fields;
    try { owner = sdk.normalizeAddress(input.wallet_address); fields = sdk.validatePublication(input); }
    catch (error) { throw new V3Error(error.message); }
    const address = sdk.publicationAddress(owner, fields.bagId);
    const existing = await refreshPublication(address, { ...custom, metadata: custom.metadata ?? (async bagId => readBagMetadata(bagId, false, true)) }, { fresh: true });
    const operation = input.operation;
    if (!['publish', 'update'].includes(operation)) throw new V3Error('invalid_operation');
    if (operation === 'publish' && existing) return { existing: true, publication: existing, network: sdk.CHAIN };
    if (operation === 'update' && !existing) throw new V3Error('publication_not_found', 404);
    if (operation === 'update' && String(input.revision) !== existing.revision) throw new V3Error('stale_revision', 409);
    const funding = await d.funding(d.client, owner, fields, operation);
    const minimum = BigInt(funding.minimumValue);
    const margin = minimum / 5n > 2000000n ? minimum / 5n : 2000000n;
    const amount = (minimum + margin).toString();
    const queryId = BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 16)).toString();
    const transaction = sdk.buildTransaction({ ...fields, operation, wallet: owner, network: sdk.CHAIN, amount, revision: String(input.revision ?? 0), queryId });
    return { operation, address, network: sdk.CHAIN, amount, minimum: minimum.toString(), storageReserve: funding.storageReserve,
        queryId, revision: String(input.revision ?? 0), fields, transaction };
}

