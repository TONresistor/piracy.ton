import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Dictionary } from '@ton/core';
import { BagRegistry } from '../wrappers/BagRegistry';
import { BagItem } from '../wrappers/BagItem';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

// Helper to create default storage metadata for tests
function createDefaultMetadata() {
    return {
        description: 'Test description',
        bagSize: 1024n * 1024n,  // 1MB
        filesCount: 1,
        files: beginCell().endCell(),  // Empty files dict for simplicity
        pieceSize: 131072,  // 128KB default
        merkleHash: 0n,
        dirName: 'test-dir',
    };
}

describe('BagRegistry', () => {
    let bagRegistryCode: Cell;
    let bagItemCode: Cell;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let bagRegistry: SandboxContract<BagRegistry>;

    beforeAll(async () => {
        bagRegistryCode = await compile('BagRegistry');
        bagItemCode = await compile('BagItem');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');

        bagRegistry = blockchain.openContract(
            BagRegistry.createFromConfig(
                {
                    bagItemCode: bagItemCode,
                },
                bagRegistryCode
            )
        );

        const deployResult = await bagRegistry.sendDeploy(deployer.getSender(), toNano('0.1'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: bagRegistry.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy with correct initial state', async () => {
        const total = await bagRegistry.getTotal();
        expect(total).toBe(0n);
    });

    it('should add a bag and deploy child contract', async () => {
        const bagId = BigInt('0x' + '17853966ac0efaed6c07deb8c887162fb8b113abcb4759f2936e89cda186a744');
        const name = 'Test Bag';
        const category = 1; // audio
        const metadata = createDefaultMetadata();

        const addResult = await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId,
            name,
            category,
            ...metadata,
        });

        expect(addResult.transactions).toHaveTransaction({
            from: user.address,
            to: bagRegistry.address,
            success: true,
        });

        // Check total increased
        const total = await bagRegistry.getTotal();
        expect(total).toBe(1n);

        // Get child address
        const bagItemAddress = await bagRegistry.getBagAddress(0n);
        expect(bagItemAddress).toBeDefined();

        // Check child contract was deployed
        const bagItem = blockchain.openContract(BagItem.createFromAddress(bagItemAddress));
        const bagData = await bagItem.getBagData();

        expect(bagData.isInitialized).toBe(true);
        expect(bagData.bagId).toBe(bagId);
        expect(bagData.name).toBe(name);
        expect(bagData.category).toBe(category);
        expect(bagData.uploaderAddress.equals(user.address)).toBe(true);
        expect(bagData.isActive).toBe(true);

        // Check storage metadata
        const storageMetadata = await bagItem.getStorageMetadata();
        expect(storageMetadata.description).toBe(metadata.description);
        expect(storageMetadata.bagSize).toBe(metadata.bagSize);
        expect(storageMetadata.filesCount).toBe(metadata.filesCount);
        expect(storageMetadata.pieceSize).toBe(metadata.pieceSize);
        expect(storageMetadata.dirName).toBe(metadata.dirName);
    });

    it('should add multiple bags', async () => {
        const metadata = createDefaultMetadata();
        const bags = [
            { bagId: 1n, name: 'Bag 1', category: 0, ...metadata },
            { bagId: 2n, name: 'Bag 2', category: 1, ...metadata },
            { bagId: 3n, name: 'Bag 3', category: 2, ...metadata },
        ];

        for (const bag of bags) {
            await bagRegistry.sendAddBag(user.getSender(), {
                value: toNano('0.1'),
                ...bag,
            });
        }

        const total = await bagRegistry.getTotal();
        expect(total).toBe(3n);

        // Verify each bag
        for (let i = 0; i < bags.length; i++) {
            const bagItemAddress = await bagRegistry.getBagAddress(BigInt(i));
            const bagItem = blockchain.openContract(BagItem.createFromAddress(bagItemAddress));
            const bagData = await bagItem.getBagData();

            expect(bagData.bagId).toBe(bags[i].bagId);
            expect(bagData.name).toBe(bags[i].name);
            expect(bagData.category).toBe(bags[i].category);
        }
    });

    it('should reject invalid bag_id (0)', async () => {
        const metadata = createDefaultMetadata();
        const addResult = await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId: 0n,
            name: 'Invalid Bag',
            category: 0,
            ...metadata,
        });

        expect(addResult.transactions).toHaveTransaction({
            from: user.address,
            to: bagRegistry.address,
            success: false,
            exitCode: 101, // ERROR_INVALID_BAG_ID
        });
    });

    it('should reject invalid category (> 5)', async () => {
        const metadata = createDefaultMetadata();
        const addResult = await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId: 123n,
            name: 'Invalid Category',
            category: 10,
            ...metadata,
        });

        expect(addResult.transactions).toHaveTransaction({
            from: user.address,
            to: bagRegistry.address,
            success: false,
            exitCode: 102, // ERROR_INVALID_CATEGORY
        });
    });

    it('should allow uploader to deactivate their bag', async () => {
        const metadata = createDefaultMetadata();
        await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId: 1n,
            name: 'My Bag',
            category: 0,
            ...metadata,
        });

        const bagItemAddress = await bagRegistry.getBagAddress(0n);
        const bagItem = blockchain.openContract(BagItem.createFromAddress(bagItemAddress));

        // User (uploader) deactivates
        await bagItem.sendSelfDeactivate(user.getSender(), toNano('0.05'));

        const isActive = await bagItem.isActive();
        expect(isActive).toBe(false);
    });

    it('should reject self-deactivate from non-uploader', async () => {
        const metadata = createDefaultMetadata();
        await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.1'),
            bagId: 1n,
            name: 'User Bag',
            category: 0,
            ...metadata,
        });

        const bagItemAddress = await bagRegistry.getBagAddress(0n);
        const bagItem = blockchain.openContract(BagItem.createFromAddress(bagItemAddress));

        // Deployer (not uploader) tries to deactivate
        const result = await bagItem.sendSelfDeactivate(deployer.getSender(), toNano('0.05'));

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: bagItemAddress,
            success: false,
            exitCode: 202, // ERROR_NOT_FROM_UPLOADER
        });
    });

    it('should store and retrieve storage metadata correctly', async () => {
        const bagId = 12345n;
        const name = 'Movie Collection';
        const category = 0; // video
        const description = 'A collection of classic movies';
        const bagSize = 5n * 1024n * 1024n * 1024n; // 5GB
        const filesCount = 10;
        const pieceSize = 131072;
        const merkleHash = BigInt('0xabcdef1234567890');
        const dirName = 'movies';

        // Create a simple files dict (in real usage this would contain actual file info)
        const filesCell = beginCell()
            .storeUint(filesCount, 32)  // Just store count for this test
            .endCell();

        await bagRegistry.sendAddBag(user.getSender(), {
            value: toNano('0.15'),
            bagId,
            name,
            category,
            description,
            bagSize,
            filesCount,
            files: filesCell,
            pieceSize,
            merkleHash,
            dirName,
        });

        const bagItemAddress = await bagRegistry.getBagAddress(0n);
        const bagItem = blockchain.openContract(BagItem.createFromAddress(bagItemAddress));

        // Verify all metadata
        const storedDescription = await bagItem.getDescription();
        expect(storedDescription).toBe(description);

        const storedBagSize = await bagItem.getBagSize();
        expect(storedBagSize).toBe(bagSize);

        const storedFilesCount = await bagItem.getFilesCount();
        expect(storedFilesCount).toBe(filesCount);

        const storedPieceSize = await bagItem.getPieceSize();
        expect(storedPieceSize).toBe(pieceSize);

        const storedMerkleHash = await bagItem.getMerkleHash();
        expect(storedMerkleHash).toBe(merkleHash);

        const storedDirName = await bagItem.getDirName();
        expect(storedDirName).toBe(dirName);

        // Test get_storage_metadata combined getter
        const metadata = await bagItem.getStorageMetadata();
        expect(metadata.description).toBe(description);
        expect(metadata.bagSize).toBe(bagSize);
        expect(metadata.filesCount).toBe(filesCount);
        expect(metadata.pieceSize).toBe(pieceSize);
        expect(metadata.merkleHash).toBe(merkleHash);
        expect(metadata.dirName).toBe(dirName);
    });
});
