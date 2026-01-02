import { toNano, Address, internal } from '@ton/core';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { BagRegistry } from '../wrappers/BagRegistry';
import { compile } from '@ton/blueprint';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    // Load from environment variables
    const mnemonicStr = process.env.DEPLOYER_MNEMONIC;
    const apiKey = process.env.TONCENTER_API_KEY;

    if (!mnemonicStr) {
        throw new Error('DEPLOYER_MNEMONIC not set in environment');
    }
    if (!apiKey) {
        throw new Error('TONCENTER_API_KEY not set in environment');
    }

    const MNEMONIC = mnemonicStr.split(' ');

    console.log('========================================');
    console.log('Deploying BagRegistry to MAINNET');
    console.log('Fully decentralized - no owner');
    console.log('========================================\n');

    // Connect to mainnet via TonCenter with API key
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey,
    });

    // Load wallet from mnemonic
    const keyPair = await mnemonicToPrivateKey(MNEMONIC);
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });
    const walletContract = client.open(wallet);

    console.log('Wallet:', wallet.address.toString());
    const balance = await walletContract.getBalance();
    console.log('Balance:', (Number(balance) / 1e9).toFixed(4), 'TON\n');

    if (balance < toNano('0.1')) {
        throw new Error('Insufficient balance. Need at least 0.1 TON');
    }

    // Compile contracts
    console.log('Compiling contracts...');
    const bagItemCode = await compile('BagItem');
    const bagRegistryCode = await compile('BagRegistry');
    console.log('Compiled!\n');

    // Create registry
    const bagRegistry = BagRegistry.createFromConfig(
        { bagItemCode },
        bagRegistryCode
    );

    console.log('Registry address:', bagRegistry.address.toString());
    console.log('');

    // Check if already deployed
    const contractState = await client.getContractState(bagRegistry.address);
    if (contractState.state === 'active') {
        console.log('Contract already deployed!');
        const registry = client.open(bagRegistry);
        const total = await registry.getTotal();
        console.log('Total bags:', total.toString());
        return;
    }

    // Deploy
    console.log('Deploying...');
    const seqno = await walletContract.getSeqno();

    await walletContract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno,
        messages: [
            internal({
                to: bagRegistry.address,
                value: toNano('0.05'),
                init: bagRegistry.init,
                body: bagRegistry.init?.data ? undefined : undefined,
            })
        ]
    });

    console.log('Transaction sent! Waiting for confirmation...\n');

    // Wait for deployment
    let attempts = 0;
    while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const state = await client.getContractState(bagRegistry.address);
        if (state.state === 'active') {
            console.log('========================================');
            console.log('DEPLOYED SUCCESSFULLY!');
            console.log('========================================');
            console.log('Contract:', bagRegistry.address.toString());
            console.log('');
            console.log('Update these files with new address:');
            console.log('  - frontend/js/contract.js');
            console.log('  - backend/contract-sync.js');
            console.log('========================================');
            return;
        }
        attempts++;
        process.stdout.write('.');
    }

    console.log('\nTimeout waiting for deployment. Check manually.');
}

main().catch(console.error);
