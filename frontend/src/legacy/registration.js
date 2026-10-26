import { MAINNET_CHAIN_ID } from '../services/wallet.js';
export { MAINNET_CHAIN_ID, MANIFEST_URL, classifyTonConnectError } from '../services/wallet.js';
export const CONTRACT_ADDRESS = 'EQBWQyOuZimuWhx5w0lOvPnfXYZLzICzV_EL7rWBLRQVPI9g';
export const REGISTRATION_FEE = '100000000';
export const CATEGORY_MAP = Object.freeze({
    video: 0,
    audio: 1,
    apps: 2,
    games: 3,
    books: 4,
    other: 5
});
const MAX_UINT32 = (1n << 32n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;
const ZERO_BAG_ID = /^0{64}$/;
export class RegistrationValidationError extends Error {
    constructor(code, message = code) {
        super(message);
        this.name = 'RegistrationValidationError';
        this.code = code;
    }
}
export function normalizeBagId(value) {
    return String(value || '').trim().toLowerCase();
}
export function createRequestId(cryptoApi = globalThis.crypto) {
    if (typeof cryptoApi?.randomUUID === 'function')
        return cryptoApi.randomUUID();
    if (typeof cryptoApi?.getRandomValues !== 'function') {
        throw new RegistrationValidationError('tx_failed');
    }
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function assertValidBagId(value) {
    const bagId = normalizeBagId(value);
    if (!/^[a-f0-9]{64}$/.test(bagId) || ZERO_BAG_ID.test(bagId)) {
        throw new RegistrationValidationError('invalid_bagid');
    }
    return bagId;
}
function parseUnsigned(value, max, code) {
    let parsed;
    try {
        if (typeof value === 'number' && !Number.isSafeInteger(value)) {
            throw new Error('unsafe integer');
        }
        parsed = BigInt(value);
    }
    catch {
        throw new RegistrationValidationError(code);
    }
    if (parsed <= 0n || parsed > max) {
        throw new RegistrationValidationError(code);
    }
    return parsed;
}
function assertUtf8(value, maxBytes, code) {
    const text = String(value || '').trim();
    if (!text || new TextEncoder().encode(text).length > maxBytes) {
        throw new RegistrationValidationError(code);
    }
    return text;
}
export function normalizeMerkleHash(value) {
    const hash = String(value || '').trim().toLowerCase().replace(/^0x/, '');
    if (!/^[a-f0-9]{64}$/.test(hash) || /^0{64}$/.test(hash)) {
        throw new RegistrationValidationError('invalid_storage_metadata');
    }
    return hash;
}
export function metadataFromBagInfo(info, expectedBagId) {
    if (!info || typeof info !== 'object') {
        throw new RegistrationValidationError('bag_not_found_storage');
    }
    const bagId = assertValidBagId(info.bag_id || expectedBagId);
    if (expectedBagId && bagId !== assertValidBagId(expectedBagId)) {
        throw new RegistrationValidationError('bag_changed');
    }
    const bagSize = parseUnsigned(info.bag_size, MAX_UINT64, 'invalid_storage_metadata');
    const filesCount = parseUnsigned(info.files_count, MAX_UINT32, 'invalid_storage_metadata');
    const pieceSize = parseUnsigned(info.piece_size, MAX_UINT32, 'invalid_storage_metadata');
    const merkleHash = normalizeMerkleHash(info.merkle_hash);
    const description = String(info.description || '').trim();
    const dirName = String(info.dir_name || '').trim();
    if (new TextEncoder().encode(description).length > 4096
        || new TextEncoder().encode(dirName).length > 1024) {
        throw new RegistrationValidationError('invalid_storage_metadata');
    }
    return Object.freeze({
        bagId,
        fetchedAt: Date.now(),
        description,
        bagSize: bagSize.toString(),
        filesCount: Number(filesCount),
        pieceSize: Number(pieceSize),
        merkleHash,
        dirName,
        peersCount: Number.isInteger(info.peers_count) ? info.peers_count : null,
        formattedSize: info.size || null
    });
}
export function validateRegistrationFields({ bagId, name, category }) {
    const normalizedBagId = assertValidBagId(bagId);
    const normalizedName = assertUtf8(name, 512, 'name_required');
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category)) {
        throw new RegistrationValidationError('category_required');
    }
    return { bagId: normalizedBagId, name: normalizedName, category };
}
export function buildTonConnectTransaction({ walletAddress, payload, validForSeconds = 600 }) {
    if (!walletAddress || !payload) {
        throw new RegistrationValidationError('tx_failed');
    }
    return {
        validUntil: Math.floor(Date.now() / 1000) + validForSeconds,
        network: MAINNET_CHAIN_ID,
        from: walletAddress,
        messages: [{
                address: CONTRACT_ADDRESS,
                amount: REGISTRATION_FEE,
                payload
            }]
    };
}
export function isTerminalAttemptState(state) {
    return ['CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(state);
}
