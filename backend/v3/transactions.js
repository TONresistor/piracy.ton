import { Address, Cell } from '@ton/core';
import sdk from '../v3-sdk.cjs';
import { normalizedExternalMessageHash, transactionOutcome } from '../contract-sync.js';
import { deps } from './context.js';
import { now } from './cache.js';
import { V3Error } from './errors.js';

// Diagnostic only: publication success is still verified from contract state.
export function validateV3Transaction(input, custom = {}) {
    let wallet, address, externalMessageHash, payloadHash;
    try {
        wallet = Address.parse(input.wallet);
        if (!/^[a-f0-9]{64}$/.test(input.bagId) || !['publish', 'update'].includes(input.operation)
            || !Number.isSafeInteger(input.validUntil) || input.validUntil <= 0
            || input.validUntil > Math.floor(now(custom) / 1000) + 660
            || typeof input.payload !== 'string' || input.payload.length > 8192) throw new Error();
        address = Address.parse(sdk.publicationAddress(input.wallet, input.bagId));
        ({ externalMessageHash } = sdk.transactionReceipt(input.boc, input.wallet));
        payloadHash = Cell.fromBase64(input.payload).hash().toString('hex');
    } catch { throw new V3Error('invalid_transaction_boc'); }
    return { wallet, address, externalMessageHash, payloadHash };
}
export async function lookupV3Transaction(input, custom = {}) {
    const { wallet, address, externalMessageHash, payloadHash } = validateV3Transaction(input, custom);
    if (Math.floor(now(custom) / 1000) > input.validUntil + 1800) return { state: 'pending' };
    const d = deps(custom);
    let cursor = {}, walletTx;
    for (let page = 0; page < 3 && !walletTx; page++) {
        const history = await d.client.getTransactions(wallet, { limit: 50, archival: true, ...cursor });
        walletTx = history.find(tx => tx.inMessage?.info.type === 'external-in'
            && normalizedExternalMessageHash(tx.inMessage) === externalMessageHash);
        const last = history.at(-1);
        if (!last || last.now < input.validUntil - 660) break;
        const next = { lt: last.lt.toString(), hash: last.hash().toString('base64') };
        if (next.lt === cursor.lt && next.hash === cursor.hash) break;
        cursor = next;
    }
    if (!walletTx) return { state: 'pending' };
    const receipt = { walletTxHash: walletTx.hash().toString('hex'), externalMessageHash };
    const failed = tx => ({ ...receipt, state: 'rejected', exitCode: transactionOutcome(tx).exitCode, transactionHash: tx.hash().toString('hex') });
    if (!transactionOutcome(walletTx).success) return failed(walletTx);
    const target = input.operation === 'publish' ? Address.parse(sdk.REGISTRY_ADDRESS) : address;
    let message = [...walletTx.outMessages.values()].find(msg => msg.info.type === 'internal'
        && msg.info.dest.equals(target) && msg.body.hash().toString('hex') === payloadHash);
    // A different signed operation must never clear this publication's pending state.
    if (!message) return { ...receipt, state: 'pending' };
    for (let step = 0; step < (input.operation === 'publish' ? 2 : 1); step++) {
        let tx;
        try { tx = await d.client.tryLocateResultTx(message.info.src, message.info.dest, message.info.createdLt.toString()); }
        catch { return { ...receipt, state: 'pending' }; }
        if (tx?.inMessage?.info.type !== 'internal' || !tx.inMessage.info.src.equals(message.info.src)
            || !tx.inMessage.info.dest.equals(message.info.dest) || tx.inMessage.info.createdLt !== message.info.createdLt
            || !tx.inMessage.body.equals(message.body)) return { ...receipt, state: 'pending' };
        if (!transactionOutcome(tx).success) return failed(tx);
        receipt.transactionHash = tx.hash().toString('hex');
        if (input.operation === 'publish' && step === 0) {
            message = [...tx.outMessages.values()].find(msg => msg.info.type === 'internal' && msg.info.dest.equals(address));
            if (!message) return { ...receipt, state: 'pending' };
        }
    }
    return { ...receipt, state: 'executed' };
}
