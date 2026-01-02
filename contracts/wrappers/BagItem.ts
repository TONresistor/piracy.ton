import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from '@ton/core';

export type BagItemConfig = {
    bagIndex: bigint;
    registryAddress: Address;
};

export const Opcodes = {
    deactivateBag: 0x00000010,  // Only uploader can deactivate (sent directly to BagItem)
};

export function bagItemConfigToCell(config: BagItemConfig): Cell {
    return beginCell()
        .storeUint(config.bagIndex, 64)
        .storeAddress(config.registryAddress)
        .endCell();
}

export interface BagData {
    isInitialized: boolean;
    bagIndex: bigint;
    registryAddress: Address;
    bagId: bigint;
    name: string;
    category: number;
    uploaderAddress: Address;
    timestamp: bigint;
    isActive: boolean;
}

export interface StorageMetadata {
    description: string;
    bagSize: bigint;
    filesCount: number;
    files: Cell;
    pieceSize: number;
    merkleHash: bigint;
    dirName: string;
}

export interface FileInfo {
    index: number;
    name: string;
    size: bigint;
}

export class BagItem implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new BagItem(address);
    }

    static createFromConfig(config: BagItemConfig, code: Cell, workchain = 0) {
        const data = bagItemConfigToCell(config);
        const init = { code, data };
        return new BagItem(contractAddress(workchain, init), init);
    }

    // Deactivate bag - only uploader can call this
    async sendDeactivate(
        provider: ContractProvider,
        via: Sender,
        value: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deactivateBag, 32)
                .endCell(),
        });
    }

    // Alias for backwards compatibility
    async sendSelfDeactivate(
        provider: ContractProvider,
        via: Sender,
        value: bigint
    ) {
        return this.sendDeactivate(provider, via, value);
    }

    async getBagData(provider: ContractProvider): Promise<BagData> {
        const result = await provider.get('get_bag_data', []);
        const stack = result.stack;

        const isInitialized = stack.readNumber() !== 0;
        const bagIndex = stack.readBigNumber();
        const registryAddress = stack.readAddress();
        const bagId = stack.readBigNumber();
        const nameCell = stack.readCell();
        const category = stack.readNumber();
        const uploaderAddress = stack.readAddress();
        const timestamp = stack.readBigNumber();
        const isActive = stack.readNumber() !== 0;

        // Parse name from cell
        let name = '';
        try {
            const slice = nameCell.beginParse();
            const bytes = slice.loadBuffer(Math.floor(slice.remainingBits / 8));
            name = bytes.toString('utf-8');
        } catch {
            name = '';
        }

        return {
            isInitialized,
            bagIndex,
            registryAddress,
            bagId,
            name,
            category,
            uploaderAddress,
            timestamp,
            isActive,
        };
    }

    async getStaticData(provider: ContractProvider): Promise<{ bagIndex: bigint; registryAddress: Address }> {
        const result = await provider.get('get_static_data', []);
        return {
            bagIndex: result.stack.readBigNumber(),
            registryAddress: result.stack.readAddress(),
        };
    }

    async isActive(provider: ContractProvider): Promise<boolean> {
        const result = await provider.get('is_active', []);
        return result.stack.readNumber() !== 0;
    }

    async getBagId(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_bag_id', []);
        return result.stack.readBigNumber();
    }

    async getUploader(provider: ContractProvider): Promise<Address> {
        const result = await provider.get('get_uploader', []);
        return result.stack.readAddress();
    }

    async getCategory(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_category', []);
        return result.stack.readNumber();
    }

    async getStorageMetadata(provider: ContractProvider): Promise<StorageMetadata> {
        const result = await provider.get('get_storage_metadata', []);
        const stack = result.stack;

        const descriptionCell = stack.readCell();
        const bagSize = stack.readBigNumber();
        const filesCount = stack.readNumber();
        const files = stack.readCell();
        const pieceSize = stack.readNumber();
        const merkleHash = stack.readBigNumber();
        const dirNameCell = stack.readCell();

        // Parse description from cell
        let description = '';
        try {
            const slice = descriptionCell.beginParse();
            const bytes = slice.loadBuffer(Math.floor(slice.remainingBits / 8));
            description = bytes.toString('utf-8');
        } catch {
            description = '';
        }

        // Parse dirName from cell
        let dirName = '';
        try {
            const slice = dirNameCell.beginParse();
            const bytes = slice.loadBuffer(Math.floor(slice.remainingBits / 8));
            dirName = bytes.toString('utf-8');
        } catch {
            dirName = '';
        }

        return {
            description,
            bagSize,
            filesCount,
            files,
            pieceSize,
            merkleHash,
            dirName,
        };
    }

    async getBagSize(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_bag_size', []);
        return result.stack.readBigNumber();
    }

    async getFilesCount(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_files_count', []);
        return result.stack.readNumber();
    }

    async getMerkleHash(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_merkle_hash', []);
        return result.stack.readBigNumber();
    }

    async getDescription(provider: ContractProvider): Promise<string> {
        const result = await provider.get('get_description', []);
        const descCell = result.stack.readCell();
        try {
            const slice = descCell.beginParse();
            const bytes = slice.loadBuffer(Math.floor(slice.remainingBits / 8));
            return bytes.toString('utf-8');
        } catch {
            return '';
        }
    }

    async getPieceSize(provider: ContractProvider): Promise<number> {
        const result = await provider.get('get_piece_size', []);
        return result.stack.readNumber();
    }

    async getDirName(provider: ContractProvider): Promise<string> {
        const result = await provider.get('get_dir_name', []);
        const dirCell = result.stack.readCell();
        try {
            const slice = dirCell.beginParse();
            const bytes = slice.loadBuffer(Math.floor(slice.remainingBits / 8));
            return bytes.toString('utf-8');
        } catch {
            return '';
        }
    }
}
