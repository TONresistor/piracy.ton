// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a BagRegistry contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint8 = bigint
type uint32 = bigint
type uint64 = bigint
type uint256 = bigint

/**
 > enum BagError { 7 variants }
 */
export type BagError = bigint

export const BagError = {
    InsufficientValue: 256n,
    InvalidBagId: 257n,
    InvalidCategory: 258n,
    MetadataTooLarge: 259n,
    IndexOutOfRange: 260n,
    NotFromRegistry: 270n,
    NotFromUploader: 271n,

    fromSlice(s: c.Slice): BagError {
        return s.loadUintBig(9);
    },
    store(self: BagError, b: c.Builder): void {
        b.storeUint(self, 9);
    },
    toCell(self: BagError): c.Cell {
        return makeCellFrom<BagError>(self, BagError.store);
    }
}

/**
 > struct (0x10000001) BagIndexedEvent {
 >     bagIndex: uint64
 >     bagId: uint256
 >     category: uint8
 >     uploader: address
 >     timestamp: uint64
 >     name: cell
 > }
 */
export interface BagIndexedEvent {
    readonly $: 'BagIndexedEvent'
    bagIndex: uint64
    bagId: uint256
    category: uint8
    uploader: c.Address
    timestamp: uint64
    name: c.Cell
}

export const BagIndexedEvent = {
    PREFIX: 0x10000001,

    create(args: {
        bagIndex: uint64
        bagId: uint256
        category: uint8
        uploader: c.Address
        timestamp: uint64
        name: c.Cell
    }): BagIndexedEvent {
        return {
            $: 'BagIndexedEvent',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagIndexedEvent {
        loadAndCheckPrefix32(s, 0x10000001, 'BagIndexedEvent');
        return {
            $: 'BagIndexedEvent',
            bagIndex: s.loadUintBig(64),
            bagId: s.loadUintBig(256),
            category: s.loadUintBig(8),
            uploader: s.loadAddress(),
            timestamp: s.loadUintBig(64),
            name: s.loadRef(),
        }
    },
    store(self: BagIndexedEvent, b: c.Builder): void {
        b.storeUint(0x10000001, 32);
        b.storeUint(self.bagIndex, 64);
        b.storeUint(self.bagId, 256);
        b.storeUint(self.category, 8);
        b.storeAddress(self.uploader);
        b.storeUint(self.timestamp, 64);
        b.storeRef(self.name);
    },
    toCell(self: BagIndexedEvent): c.Cell {
        return makeCellFrom<BagIndexedEvent>(self, BagIndexedEvent.store);
    }
}

/**
 > struct BagMetadata {
 >     description: cell
 >     bagSize: uint64
 >     filesCount: uint32
 >     files: cell
 >     pieceSize: uint32
 >     merkleHash: uint256
 >     dirName: cell
 > }
 */
export interface BagMetadata {
    readonly $: 'BagMetadata'
    description: c.Cell
    bagSize: uint64
    filesCount: uint32
    files: c.Cell
    pieceSize: uint32
    merkleHash: uint256
    dirName: c.Cell
}

export const BagMetadata = {
    create(args: {
        description: c.Cell
        bagSize: uint64
        filesCount: uint32
        files: c.Cell
        pieceSize: uint32
        merkleHash: uint256
        dirName: c.Cell
    }): BagMetadata {
        return {
            $: 'BagMetadata',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagMetadata {
        return {
            $: 'BagMetadata',
            description: s.loadRef(),
            bagSize: s.loadUintBig(64),
            filesCount: s.loadUintBig(32),
            files: s.loadRef(),
            pieceSize: s.loadUintBig(32),
            merkleHash: s.loadUintBig(256),
            dirName: s.loadRef(),
        }
    },
    store(self: BagMetadata, b: c.Builder): void {
        b.storeRef(self.description);
        b.storeUint(self.bagSize, 64);
        b.storeUint(self.filesCount, 32);
        b.storeRef(self.files);
        b.storeUint(self.pieceSize, 32);
        b.storeUint(self.merkleHash, 256);
        b.storeRef(self.dirName);
    },
    toCell(self: BagMetadata): c.Cell {
        return makeCellFrom<BagMetadata>(self, BagMetadata.store);
    }
}

/**
 > struct (0x42495f49) BagItemInitParams {
 >     bagId: uint256
 >     category: uint8
 >     uploaderAddress: address
 >     timestamp: uint64
 >     name: cell
 >     metadata: Cell<BagMetadata>
 > }
 */
export interface BagItemInitParams {
    readonly $: 'BagItemInitParams'
    bagId: uint256
    category: uint8
    uploaderAddress: c.Address
    timestamp: uint64
    name: c.Cell
    metadata: CellRef<BagMetadata>
}

export const BagItemInitParams = {
    PREFIX: 0x42495f49,

    create(args: {
        bagId: uint256
        category: uint8
        uploaderAddress: c.Address
        timestamp: uint64
        name: c.Cell
        metadata: CellRef<BagMetadata>
    }): BagItemInitParams {
        return {
            $: 'BagItemInitParams',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagItemInitParams {
        loadAndCheckPrefix32(s, 0x42495f49, 'BagItemInitParams');
        return {
            $: 'BagItemInitParams',
            bagId: s.loadUintBig(256),
            category: s.loadUintBig(8),
            uploaderAddress: s.loadAddress(),
            timestamp: s.loadUintBig(64),
            name: s.loadRef(),
            metadata: loadCellRef<BagMetadata>(s, BagMetadata.fromSlice),
        }
    },
    store(self: BagItemInitParams, b: c.Builder): void {
        b.storeUint(0x42495f49, 32);
        b.storeUint(self.bagId, 256);
        b.storeUint(self.category, 8);
        b.storeAddress(self.uploaderAddress);
        b.storeUint(self.timestamp, 64);
        b.storeRef(self.name);
        storeCellRef<BagMetadata>(self.metadata, b, BagMetadata.store);
    },
    toCell(self: BagItemInitParams): c.Cell {
        return makeCellFrom<BagItemInitParams>(self, BagItemInitParams.store);
    }
}

/**
 > struct (0x41444247) AddBag {
 >     bagId: uint256
 >     category: uint8
 >     name: cell
 >     metadata: Cell<BagMetadata>
 > }
 */
export interface AddBag {
    readonly $: 'AddBag'
    bagId: uint256
    category: uint8
    name: c.Cell
    metadata: CellRef<BagMetadata>
}

export const AddBag = {
    PREFIX: 0x41444247,

    create(args: {
        bagId: uint256
        category: uint8
        name: c.Cell
        metadata: CellRef<BagMetadata>
    }): AddBag {
        return {
            $: 'AddBag',
            ...args
        }
    },
    fromSlice(s: c.Slice): AddBag {
        loadAndCheckPrefix32(s, 0x41444247, 'AddBag');
        return {
            $: 'AddBag',
            bagId: s.loadUintBig(256),
            category: s.loadUintBig(8),
            name: s.loadRef(),
            metadata: loadCellRef<BagMetadata>(s, BagMetadata.fromSlice),
        }
    },
    store(self: AddBag, b: c.Builder): void {
        b.storeUint(0x41444247, 32);
        b.storeUint(self.bagId, 256);
        b.storeUint(self.category, 8);
        b.storeRef(self.name);
        storeCellRef<BagMetadata>(self.metadata, b, BagMetadata.store);
    },
    toCell(self: AddBag): c.Cell {
        return makeCellFrom<AddBag>(self, AddBag.store);
    }
}

/**
 > type BagRegistryMessage = AddBag
 */
export type BagRegistryMessage = AddBag

export const BagRegistryMessage = {
    fromSlice(s: c.Slice): BagRegistryMessage {
        return AddBag.fromSlice(s);
    },
    store(self: BagRegistryMessage, b: c.Builder): void {
        AddBag.store(self, b);
    },
    toCell(self: BagRegistryMessage): c.Cell {
        return makeCellFrom<BagRegistryMessage>(self, BagRegistryMessage.store);
    }
}

/**
 > struct BagRegistryStorage {
 >     nextBagIndex: uint64
 > }
 */
export interface BagRegistryStorage {
    readonly $: 'BagRegistryStorage'
    nextBagIndex: uint64 /* = 0 */
}

export const BagRegistryStorage = {
    create(args: {
        nextBagIndex?: uint64 /* = 0 */
    }): BagRegistryStorage {
        return {
            $: 'BagRegistryStorage',
            nextBagIndex: 0n,
            ...args
        }
    },
    fromSlice(s: c.Slice): BagRegistryStorage {
        return {
            $: 'BagRegistryStorage',
            nextBagIndex: s.loadUintBig(64),
        }
    },
    store(self: BagRegistryStorage, b: c.Builder): void {
        b.storeUint(self.nextBagIndex, 64);
    },
    toCell(self: BagRegistryStorage): c.Cell {
        return makeCellFrom<BagRegistryStorage>(self, BagRegistryStorage.store);
    }
}

// ————————————————————————————————————————————
//    class BagRegistry
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class BagRegistry implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECGgEABAcAART/APSkE/S88sgLAQIBYgIDAfLQ+JHyQCDHAJEw4IQPIdcLH4IQQURCR7ry9NcsIgoiEjzyv9P/0wfU1NH4l4IQBfXhAL7y4QAj8uEBIsEG8uECIdCDB/lCb6VvoVshbpQxgQEBkQHiIW6UMYFAAZEB4gGDB7vy4QODDbvy4QMg0IMH+UJvpW+hWyFuBAIBIAcIA/6UMYEBAZEB4iFulDGBQAGRAeIBgwe78uEDgw278uED7UTQ0z/R+CP4klR2USf4KIgoyM+Byz8S+lLJghAELB2AyM+RCSV9JhfL/xXLBxb6UhLLP8wWzMnIz4kIAVNjyM+E0MzM+RbPC/9Y+gKBAI3PC3ASzBTME8zJcfsA+JKJDQUGAAEgAJLIz5BAAAAGI88LPxfL/xXLBxT6Uss/zMnIz4cgE85xzwthEszJcPsAggr68IBw+wL4ksjPhQj6UnDPC27JgQCC+wCkyMs/ye1UAWu+61dqJoaZ/okOF/yhDeYYBJGDhxeXCCfBREZGfAieWf/SlkgORnwmhmZnyLZGfFACBl/+eoQNAgHnCQoAEa5+9qJoaZ/owAIBIAsMAQaqFYgNAAypJ/gnbxABFP8A9KQT9LzyyAsOAgFiDxAC+ND4kfJAIMcAkTDg7UTQ0wABjhPTP/pI0//U0wf6SNM/0gDUgQCDjhbTP/pIbQNtbVBDbW1QQ21tVSAEgQCC4gHRgQCCuuMCMYQPKdcLH4IQREVBQ7ry9AjXLCIiKgoc8r/R+JIixwXy4Q8myM+Dyz8W+lIUy/8SzMsH+lIREgIBIBMUAHhQeF8H+JIixwXy4Q4C1ywiEkr6TPK/0//TB/pI0z/U1NHIz4MYyz8W+lIUy/8UzMsHEvpSyz/Pg8zJ7VQAfMs/z4ESzMntVPiSiwLIz4cgzoIQEAAAAs8LgRLLP/pSyXD7AIIITEtAcPsC+JLIz4UI+lJwzwtuyYEAgvsAAaO+msdqJoaYAAxwnpn/0kaf/qaYP9JGmf6QBqQIBBxwtpn/0kNoG2tqghtraoIba2qpACQIBBcQDowIBBXUdHKDwvg7g4RBDFgRCIK7hwGD+quEGQIBIBUWAHW4FQ7UTQ0wABjhjTP/pI0/8x1DHTBzH6SDHTPzHSANSBAIOb0z/6SG1tVSGBAILiAdGBAIK6kmwi4FuAIBIBcYAHO3mV2omhpgADHDemfmP0kGOn/mOoY6YOY/SQY6Z+Y6QBqGMCAQcxpn/0kGMCAQXEA6MCAQV1JGDhvQA6O0Qt2omhpgADHDemfmP0kGOn/mOoY6YOY/SQY6Z+Y6QAY6kCAQcxpn5j9JECAQXEA6MCAQV1HxJg4RDgQRCmIxHBoammf6Y/qaY/p/+pov6qwQGRkZAAA=');

    static Errors = {
        'BagError.InsufficientValue': 256,
        'BagError.InvalidBagId': 257,
        'BagError.InvalidCategory': 258,
        'BagError.MetadataTooLarge': 259,
        'BagError.IndexOutOfRange': 260,
        'BagError.NotFromRegistry': 270,
        'BagError.NotFromUploader': 271,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new BagRegistry(address);
    }

    static fromStorage(emptyStorage: {
        nextBagIndex?: uint64 /* = 0 */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BagRegistry.CodeCell,
            data: BagRegistryStorage.toCell(BagRegistryStorage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BagRegistry(address, initialState);
    }

    static createCellOfBagRegistryMessage(body: BagRegistryMessage) {
        return BagRegistryMessage.toCell(body);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendBagRegistryMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: BagRegistryMessage, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: BagRegistryMessage.toCell(body),
            ...extraOptions
        });
    }

    async getTotal(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_total', []));
        return r.readBigInt();
    }

    async getBagAddress(provider: ContractProvider, bagIndex: bigint): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_bag_address', [
            { type: 'int', value: bagIndex },
        ]));
        return r.readSlice().loadAddress();
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_balance', []));
        return r.readBigInt();
    }

    async getItemCode(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_item_code', []));
        return r.readCell();
    }
}
