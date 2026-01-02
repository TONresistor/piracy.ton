import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { BagRegistry } from '../wrappers/BagRegistry';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

describe('Gas Analysis', () => {
    it('should measure AddBag gas cost', async () => {
        const bagRegistryCode = await compile('BagRegistry');
        const bagItemCode = await compile('BagItem');
        
        const blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
        const user = await blockchain.treasury('user');
        
        const bagRegistry = blockchain.openContract(
            BagRegistry.createFromConfig(
                { bagItemCode },
                bagRegistryCode
            )
        );
        
        await bagRegistry.sendDeploy(deployer.getSender(), toNano('0.1'));
        
        const balanceBefore = await user.getBalance();
        
        const result = await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId: 123n,
            name: 'Test Movie',
            category: 0,
            description: 'A test movie description',
            bagSize: 1024n * 1024n * 1024n,
            filesCount: 5,
            files: beginCell().endCell(),
            pieceSize: 131072,
            merkleHash: 12345n,
            dirName: 'movies',
        });
        
        const balanceAfter = await user.getBalance();
        const totalCost = balanceBefore - balanceAfter;
        
        let totalFees = 0n;
        for (const tx of result.transactions) {
            totalFees += tx.totalFees.coins;
        }
        
        const bagItemAddress = await bagRegistry.getBagAddress(0n);
        const bagItemContract = await blockchain.getContract(bagItemAddress);
        
        console.log('\n========== GAS ANALYSIS ==========');
        console.log('User envoyé:        0.1 TON');
        console.log('Coût total:        ', (Number(totalCost) / 1e9).toFixed(4), 'TON');
        console.log('Total fees:        ', (Number(totalFees) / 1e9).toFixed(4), 'TON');
        console.log('BagItem balance:   ', (Number(bagItemContract.balance) / 1e9).toFixed(4), 'TON');
        console.log('===================================\n');
        
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: bagRegistry.address,
            success: true,
        });
    });
});
