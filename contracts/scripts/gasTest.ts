import { Blockchain } from '@ton/sandbox';
import { toNano, beginCell } from '@ton/core';
import { BagRegistry } from '../wrappers/BagRegistry';
import { compile } from '@ton/blueprint';

export async function run() {
    const bagRegistryCode = await compile('BagRegistry');
    const bagItemCode = await compile('BagItem');
    
    const blockchain = await Blockchain.create();
    const deployer = await blockchain.treasury('deployer');
    const user = await blockchain.treasury('user');
    
    const bagRegistry = blockchain.openContract(
        BagRegistry.createFromConfig(
            { ownerAddress: deployer.address, bagItemCode },
            bagRegistryCode
        )
    );
    
    await bagRegistry.sendDeploy(deployer.getSender(), toNano('0.1'));
    
    const metadata = {
        description: 'Test description for a movie',
        bagSize: 1024n * 1024n * 1024n,  // 1GB
        filesCount: 5,
        files: beginCell().endCell(),
        pieceSize: 131072,
        merkleHash: 12345n,
        dirName: 'my-movie-folder',
    };
    
    const balanceBefore = await user.getBalance();
    
    const result = await bagRegistry.sendAddBag(user.getSender(), {
        value: toNano('0.1'),
        bagId: 123n,
        name: 'Test Movie Collection',
        category: 0,
        ...metadata,
    });
    
    const balanceAfter = await user.getBalance();
    const totalCost = balanceBefore - balanceAfter;
    
    console.log('\n=== ANALYSE DES COÛTS ===\n');
    console.log('User a envoyé: 0.1 TON');
    console.log('Coût total (payé par user):', (Number(totalCost) / 1e9).toFixed(4), 'TON');
    
    let registryFees = 0n;
    let itemFees = 0n;
    
    for (const tx of result.transactions) {
        if (tx.description.type === 'generic' && tx.description.computePhase.type === 'vm') {
            const totalFees = tx.totalFees.coins;
            const dest = tx.inMessage?.info?.dest?.toString();

            if (dest === bagRegistry.address.toString()) {
                registryFees = totalFees;
            } else if (totalFees > 0n) {
                itemFees = totalFees;
            }
        }
    }
    
    console.log('\nRegistry fees:', (Number(registryFees) / 1e9).toFixed(4), 'TON');
    console.log('BagItem deploy fees:', (Number(itemFees) / 1e9).toFixed(4), 'TON');
    
    const bagItemAddress = await bagRegistry.getBagAddress(0n);
    const bagItemContract = await blockchain.getContract(bagItemAddress);
    console.log('\nBalance restante dans BagItem:', (Number(bagItemContract.balance) / 1e9).toFixed(4), 'TON');
    
    console.log('\n=== RECOMMANDATION ===');
    const minRequired = Number(registryFees + itemFees) / 1e9;
    console.log('Minimum requis:', minRequired.toFixed(4), 'TON');
    console.log('Avec marge sécurité (x2):', (minRequired * 2).toFixed(4), 'TON');
}
