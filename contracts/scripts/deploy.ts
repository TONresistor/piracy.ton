import { toNano, Address } from '@ton/core';
import { BagRegistry } from '../build/BagRegistry_BagRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;

    if (!owner) {
        throw new Error('Wallet not connected');
    }

    const bagRegistry = provider.open(
        await BagRegistry.fromInit(owner)
    );

    console.log('Deploying BagRegistry...');
    console.log('Owner:', owner.toString());
    console.log('Contract address:', bagRegistry.address.toString());

    await bagRegistry.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(bagRegistry.address);

    console.log('BagRegistry deployed successfully!');
    console.log('Contract address:', bagRegistry.address.toString());

    // Verify deployment
    const total = await bagRegistry.getGetTotal();
    console.log('Total bags:', total.toString());
}
