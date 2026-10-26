import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BadRequestError,
    UnknownAppError,
    UserRejectsError,
    WalletMissingRequiredFeaturesError,
    WalletNotConnectedError,
    WalletNotSupportFeatureError,
    WalletWrongNetworkError
} from '@tonconnect/ui';
import {
    MAINNET_CHAIN_ID,
    MANIFEST_URL,
    CONTRACT_ADDRESS,
    REGISTRATION_FEE,
    RegistrationValidationError,
    assertValidBagId,
    buildTonConnectTransaction,
    classifyTonConnectError,
    createRequestId,
    isTerminalAttemptState,
    metadataFromBagInfo,
    validateRegistrationFields
} from '../src/legacy/registration.js';

const BAG_ID = '12'.repeat(32);
const WALLET = 'EQBWQyOuZimuWhx5w0lOvPnfXYZLzICzV_EL7rWBLRQVPI9g';

test('TON Connect is pinned to the public HTTPS manifest and mainnet', () => {
    assert.equal(MAINNET_CHAIN_ID, '-239');
    assert.equal(MANIFEST_URL, 'https://piracy.resistance.dog/tonconnect-manifest.json?v=4');
    assert.equal(CONTRACT_ADDRESS, WALLET);
    assert.equal(REGISTRATION_FEE, '100000000');
});

test('request IDs remain cryptographically random without randomUUID', () => {
    const id = createRequestId({
        getRandomValues(bytes) {
            bytes.set(Array.from({ length: 16 }, (_, index) => index));
            return bytes;
        }
    });
    assert.equal(id, '00010203-0405-4607-8809-0a0b0c0d0e0f');
});

test('Bag IDs are canonical, non-zero uint256 hex values', () => {
    assert.equal(assertValidBagId(`  ${BAG_ID.toUpperCase()}  `), BAG_ID);
    for (const invalid of ['', '0'.repeat(64), 'ab', 'g'.repeat(64)]) {
        assert.throws(() => assertValidBagId(invalid), error => (
            error instanceof RegistrationValidationError && error.code === 'invalid_bagid'
        ));
    }
});

test('registration fields enforce UTF-8 and known categories', () => {
    assert.deepEqual(validateRegistrationFields({
        bagId: BAG_ID,
        name: 'Icy Tower',
        category: 'games'
    }), {
        bagId: BAG_ID,
        name: 'Icy Tower',
        category: 'games'
    });
    assert.throws(
        () => validateRegistrationFields({ bagId: BAG_ID, name: 'x'.repeat(513), category: 'games' }),
        error => error.code === 'name_required'
    );
    assert.throws(
        () => validateRegistrationFields({ bagId: BAG_ID, name: 'Icy Tower', category: 'unknown' }),
        error => error.code === 'category_required'
    );
    assert.throws(
        () => validateRegistrationFields({ bagId: BAG_ID, name: 'Icy Tower', category: 'toString' }),
        error => error.code === 'category_required'
    );
});

test('TON Storage metadata is bound to the requested Bag ID and TL-B widths', () => {
    const metadata = metadataFromBagInfo({
        bag_id: BAG_ID,
        description: 'Classic platform game',
        bag_size: '4404019',
        files_count: 1,
        piece_size: 131072,
        merkle_hash: 'ab'.repeat(32),
        dir_name: 'Icy Tower',
        peers_count: 2,
        size: '4.2 MB'
    }, BAG_ID);
    assert.equal(metadata.bagSize, '4404019');
    assert.equal(metadata.filesCount, 1);
    assert.equal(metadata.formattedSize, '4.2 MB');
    assert.throws(
        () => metadataFromBagInfo({ ...metadata, bag_id: '34'.repeat(32) }, BAG_ID),
        error => error.code === 'bag_changed'
    );
    assert.throws(
        () => metadataFromBagInfo({
            bag_id: BAG_ID,
            bag_size: (1n << 64n).toString(),
            files_count: 1,
            piece_size: 1,
            merkle_hash: 'ab'.repeat(32)
        }, BAG_ID),
        error => error.code === 'invalid_storage_metadata'
    );
});

test('transaction request binds sender, mainnet, registry, fee and payload', () => {
    const before = Math.floor(Date.now() / 1000);
    const transaction = buildTonConnectTransaction({ walletAddress: WALLET, payload: 'payload', validForSeconds: 600 });
    assert.equal(transaction.network, MAINNET_CHAIN_ID);
    assert.equal(transaction.from, WALLET);
    assert.equal(transaction.messages.length, 1);
    assert.deepEqual(transaction.messages[0], {
        address: WALLET,
        amount: '100000000',
        payload: 'payload'
    });
    assert.ok(transaction.validUntil >= before + 599 && transaction.validUntil <= before + 601);
});

test('TON Connect errors and attempt terminal states are classified explicitly', () => {
    assert.equal(classifyTonConnectError(new UserRejectsError('test')), 'tx_cancelled');
    assert.equal(classifyTonConnectError({ code: 300 }), 'tx_cancelled');
    assert.equal(classifyTonConnectError(new WalletWrongNetworkError('test')), 'wrong_network');
    assert.equal(classifyTonConnectError(new WalletNotConnectedError('test')), 'connect_wallet');
    assert.equal(classifyTonConnectError(new WalletMissingRequiredFeaturesError('test')), 'wallet_unsupported');
    assert.equal(classifyTonConnectError(new WalletNotSupportFeatureError('test')), 'wallet_unsupported');
    assert.equal(classifyTonConnectError(new UnknownAppError('test')), 'session_expired');
    assert.equal(classifyTonConnectError(new BadRequestError('test')), 'tx_bad_request');
    assert.equal(classifyTonConnectError({ code: 2 }), 'manifest_error');
    assert.equal(classifyTonConnectError(new Error('network')), 'tx_failed');
    assert.equal(isTerminalAttemptState('CONFIRMED'), true);
    assert.equal(isTerminalAttemptState('CONFIRMING'), false);
});
