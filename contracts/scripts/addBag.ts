import { Address, toNano } from '@ton/core';
import { BagRegistry } from '../wrappers/BagRegistry';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const contractAddress = Address.parse(args[0] || 'EQ...');  // Replace with actual address
    const bagIdHex = args[1] || '0';
    const name = args[2] || 'Test Bag';
    const category = parseInt(args[3] || '5');  // default: other

    const bagRegistry = provider.open(BagRegistry.createFromAddress(contractAddress));

    const bagId = BigInt('0x' + bagIdHex);

    console.log('Adding bag...');
    console.log('  Bag ID:', bagIdHex);
    console.log('  Name:', name);
    console.log('  Category:', category);

    await bagRegistry.sendAddBag(provider.sender(), {
        value: toNano('0.05'),  // Just gas, no protocol fee
        bagId,
        name,
        category,
    });

    console.log('Bag added! Check the contract for confirmation.');
}
