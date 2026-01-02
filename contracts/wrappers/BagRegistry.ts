import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type BagRegistryConfig = {
    bagItemCode: Cell;
};

export const Opcodes = {
    addBag: 0x00000001,
};

export function bagRegistryConfigToCell(config: BagRegistryConfig): Cell {
    return beginCell()
        .storeUint(0, 64)  // nextBagIndex = 0
        .storeRef(config.bagItemCode)
        .endCell();
}

export class BagRegistry implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new BagRegistry(address);
    }

    static createFromConfig(config: BagRegistryConfig, code: Cell, workchain = 0) {
        const data = bagRegistryConfigToCell(config);
        const init = { code, data };
        return new BagRegistry(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendAddBag(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            bagId: bigint;
            name: string;
            category: number;
            // TON Storage metadata
            description: string;
            bagSize: bigint;
            filesCount: number;
            files: Cell;  // Dict of files
            pieceSize: number;
            merkleHash: bigint;
            dirName: string;
        }
    ) {
        const nameCell = beginCell().storeStringTail(opts.name).endCell();
        const descriptionCell = beginCell().storeStringTail(opts.description).endCell();
        const dirNameCell = beginCell().storeStringTail(opts.dirName).endCell();

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.addBag, 32)
                .storeUint(opts.bagId, 256)
                .storeRef(nameCell)
                .storeUint(opts.category, 8)
                // TON Storage metadata
                .storeRef(descriptionCell)
                .storeUint(opts.bagSize, 64)
                .storeUint(opts.filesCount, 32)
                .storeRef(opts.files)
                .storeUint(opts.pieceSize, 32)
                .storeUint(opts.merkleHash, 256)
                .storeRef(dirNameCell)
                .endCell(),
        });
    }

    async getTotal(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_total', []);
        return result.stack.readBigNumber();
    }

    async getBagAddress(provider: ContractProvider, bagIndex: bigint): Promise<Address> {
        const result = await provider.get('get_bag_address', [
            { type: 'int', value: bagIndex }
        ]);
        return result.stack.readAddress();
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_balance', []);
        return result.stack.readBigNumber();
    }

    async getItemCode(provider: ContractProvider): Promise<Cell> {
        const result = await provider.get('get_item_code', []);
        return result.stack.readCell();
    }
}
