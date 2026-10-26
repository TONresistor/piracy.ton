import { createTonClient } from '../rpc.js';
import sdk from '../v3-sdk.cjs';
import { getBagInfo } from '../storage.js';

const client = createTonClient({
    endpoint: process.env.TON_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TONCENTER_MAINNET_API_KEY || process.env.TON_API_KEY,
    timeout: 10000
});
export const deps = custom => ({ client, read: sdk.readPublication, funding: sdk.readFunding, verify: sdk.verifyRegistry, metadata: getBagInfo, ...custom });

