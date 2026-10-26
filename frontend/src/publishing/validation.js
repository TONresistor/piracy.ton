import * as sdk from '../../../shared/contract-sdk/dist/browser.js';
export const validatePublication = sdk.validatePublication;
export function validatePending(value) {
    if (value === null)
        return null;
    if (!value || typeof value !== 'object' || ![undefined, 1].includes(value.version))
        throw new Error('invalid_pending');
    const fields = sdk.validatePublication(value);
    if (!['publish', 'update'].includes(value.operation)
        || !Number.isSafeInteger(value.validUntil) || value.validUntil <= 0
        || typeof value.expectedRevision !== 'string'
        || !/^(0|[1-9]\d*)$/.test(value.expectedRevision)
        || BigInt(value.expectedRevision) > 0xffffffffffffffffn
        || sdk.normalizeAddress(value.wallet) !== value.wallet
        || sdk.publicationAddress(value.wallet, fields.bagId) !== value.address)
        throw new Error('invalid_pending');
    if (value.boc !== undefined) {
        sdk.transactionReceipt(value.boc, value.wallet);
        if (typeof value.payload !== 'string' || value.payload.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.payload)) throw new Error('invalid_pending');
    }
    return { ...value, ...fields, version: 1 };
}
