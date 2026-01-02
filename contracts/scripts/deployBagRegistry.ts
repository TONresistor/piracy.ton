import { toNano } from '@ton/core';
import { BagRegistry } from '../wrappers/BagRegistry';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    // Compile both contracts
    const bagItemCode = await compile('BagItem');
    const bagRegistryCode = await compile('BagRegistry');

    const bagRegistry = provider.open(
        BagRegistry.createFromConfig(
            {
                bagItemCode,
            },
            bagRegistryCode
        )
    );

    console.log('========================================');
    console.log('Deploying BagRegistry (Tolk)');
    console.log('Fully decentralized - no owner');
    console.log('========================================');
    console.log('Contract address:', bagRegistry.address.toString());
    console.log('');

    await bagRegistry.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(bagRegistry.address);

    console.log('');
    console.log('BagRegistry deployed successfully!');
    console.log('');

    // Verify deployment
    const total = await bagRegistry.getTotal();

    console.log('Verification:');
    console.log('  Total bags:', total.toString());
    console.log('');
    console.log('========================================');
    console.log('Update these files with new address:');
    console.log('  - frontend/js/contract.js');
    console.log('  - backend/contract-sync.js');
    console.log('========================================');
}
