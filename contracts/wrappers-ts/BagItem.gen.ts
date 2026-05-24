// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a BagItem contract in Tolk.
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
 > struct (0x10000002) BagRemovedEvent {
 >     bagIndex: uint64
 >     removedBy: address
 > }
 */
export interface BagRemovedEvent {
    readonly $: 'BagRemovedEvent'
    bagIndex: uint64
    removedBy: c.Address
}

export const BagRemovedEvent = {
    PREFIX: 0x10000002,

    create(args: {
        bagIndex: uint64
        removedBy: c.Address
    }): BagRemovedEvent {
        return {
            $: 'BagRemovedEvent',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagRemovedEvent {
        loadAndCheckPrefix32(s, 0x10000002, 'BagRemovedEvent');
        return {
            $: 'BagRemovedEvent',
            bagIndex: s.loadUintBig(64),
            removedBy: s.loadAddress(),
        }
    },
    store(self: BagRemovedEvent, b: c.Builder): void {
        b.storeUint(0x10000002, 32);
        b.storeUint(self.bagIndex, 64);
        b.storeAddress(self.removedBy);
    },
    toCell(self: BagRemovedEvent): c.Cell {
        return makeCellFrom<BagRemovedEvent>(self, BagRemovedEvent.store);
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
 > struct (0x44454143) DeactivateBag {
 > }
 */
export interface DeactivateBag {
    readonly $: 'DeactivateBag'
}

export const DeactivateBag = {
    PREFIX: 0x44454143,

    create(): DeactivateBag {
        return {
            $: 'DeactivateBag',
        }
    },
    fromSlice(s: c.Slice): DeactivateBag {
        loadAndCheckPrefix32(s, 0x44454143, 'DeactivateBag');
        return {
            $: 'DeactivateBag',
        }
    },
    store(self: DeactivateBag, b: c.Builder): void {
        b.storeUint(0x44454143, 32);
    },
    toCell(self: DeactivateBag): c.Cell {
        return makeCellFrom<DeactivateBag>(self, DeactivateBag.store);
    }
}

/**
 > type BagItemMessage = DeactivateBag
 */
export type BagItemMessage = DeactivateBag

export const BagItemMessage = {
    fromSlice(s: c.Slice): BagItemMessage {
        return DeactivateBag.fromSlice(s);
    },
    store(self: BagItemMessage, b: c.Builder): void {
        DeactivateBag.store(self, b);
    },
    toCell(self: BagItemMessage): c.Cell {
        return makeCellFrom<BagItemMessage>(self, BagItemMessage.store);
    }
}

/**
 > struct BagDataReply {
 >     isInitialized: bool
 >     bagIndex: uint64
 >     registryAddress: address
 >     bagId: uint256
 >     name: cell
 >     category: uint8
 >     uploaderAddress: address
 >     timestamp: uint64
 >     isActive: bool
 > }
 */
export interface BagDataReply {
    readonly $: 'BagDataReply'
    isInitialized: boolean
    bagIndex: uint64
    registryAddress: c.Address
    bagId: uint256
    name: c.Cell
    category: uint8
    uploaderAddress: c.Address
    timestamp: uint64
    isActive: boolean
}

export const BagDataReply = {
    create(args: {
        isInitialized: boolean
        bagIndex: uint64
        registryAddress: c.Address
        bagId: uint256
        name: c.Cell
        category: uint8
        uploaderAddress: c.Address
        timestamp: uint64
        isActive: boolean
    }): BagDataReply {
        return {
            $: 'BagDataReply',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagDataReply {
        return {
            $: 'BagDataReply',
            isInitialized: s.loadBoolean(),
            bagIndex: s.loadUintBig(64),
            registryAddress: s.loadAddress(),
            bagId: s.loadUintBig(256),
            name: s.loadRef(),
            category: s.loadUintBig(8),
            uploaderAddress: s.loadAddress(),
            timestamp: s.loadUintBig(64),
            isActive: s.loadBoolean(),
        }
    },
    store(self: BagDataReply, b: c.Builder): void {
        b.storeBit(self.isInitialized);
        b.storeUint(self.bagIndex, 64);
        b.storeAddress(self.registryAddress);
        b.storeUint(self.bagId, 256);
        b.storeRef(self.name);
        b.storeUint(self.category, 8);
        b.storeAddress(self.uploaderAddress);
        b.storeUint(self.timestamp, 64);
        b.storeBit(self.isActive);
    },
    toCell(self: BagDataReply): c.Cell {
        return makeCellFrom<BagDataReply>(self, BagDataReply.store);
    }
}

/**
 > struct StaticDataReply {
 >     bagIndex: uint64
 >     registryAddress: address
 > }
 */
export interface StaticDataReply {
    readonly $: 'StaticDataReply'
    bagIndex: uint64
    registryAddress: c.Address
}

export const StaticDataReply = {
    create(args: {
        bagIndex: uint64
        registryAddress: c.Address
    }): StaticDataReply {
        return {
            $: 'StaticDataReply',
            ...args
        }
    },
    fromSlice(s: c.Slice): StaticDataReply {
        return {
            $: 'StaticDataReply',
            bagIndex: s.loadUintBig(64),
            registryAddress: s.loadAddress(),
        }
    },
    store(self: StaticDataReply, b: c.Builder): void {
        b.storeUint(self.bagIndex, 64);
        b.storeAddress(self.registryAddress);
    },
    toCell(self: StaticDataReply): c.Cell {
        return makeCellFrom<StaticDataReply>(self, StaticDataReply.store);
    }
}

/**
 > struct StorageMetadataReply {
 >     isInitialized: bool
 >     description: cell
 >     bagSize: uint64
 >     filesCount: uint32
 >     files: cell
 >     pieceSize: uint32
 >     merkleHash: uint256
 >     dirName: cell
 > }
 */
export interface StorageMetadataReply {
    readonly $: 'StorageMetadataReply'
    isInitialized: boolean
    description: c.Cell
    bagSize: uint64
    filesCount: uint32
    files: c.Cell
    pieceSize: uint32
    merkleHash: uint256
    dirName: c.Cell
}

export const StorageMetadataReply = {
    create(args: {
        isInitialized: boolean
        description: c.Cell
        bagSize: uint64
        filesCount: uint32
        files: c.Cell
        pieceSize: uint32
        merkleHash: uint256
        dirName: c.Cell
    }): StorageMetadataReply {
        return {
            $: 'StorageMetadataReply',
            ...args
        }
    },
    fromSlice(s: c.Slice): StorageMetadataReply {
        return {
            $: 'StorageMetadataReply',
            isInitialized: s.loadBoolean(),
            description: s.loadRef(),
            bagSize: s.loadUintBig(64),
            filesCount: s.loadUintBig(32),
            files: s.loadRef(),
            pieceSize: s.loadUintBig(32),
            merkleHash: s.loadUintBig(256),
            dirName: s.loadRef(),
        }
    },
    store(self: StorageMetadataReply, b: c.Builder): void {
        b.storeBit(self.isInitialized);
        b.storeRef(self.description);
        b.storeUint(self.bagSize, 64);
        b.storeUint(self.filesCount, 32);
        b.storeRef(self.files);
        b.storeUint(self.pieceSize, 32);
        b.storeUint(self.merkleHash, 256);
        b.storeRef(self.dirName);
    },
    toCell(self: StorageMetadataReply): c.Cell {
        return makeCellFrom<StorageMetadataReply>(self, StorageMetadataReply.store);
    }
}

/**
 > struct BagItemDataNotInitialized {
 >     bagIndex: uint64
 >     registryAddress: address
 > }
 */
export interface BagItemDataNotInitialized {
    readonly $: 'BagItemDataNotInitialized'
    bagIndex: uint64
    registryAddress: c.Address
}

export const BagItemDataNotInitialized = {
    create(args: {
        bagIndex: uint64
        registryAddress: c.Address
    }): BagItemDataNotInitialized {
        return {
            $: 'BagItemDataNotInitialized',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagItemDataNotInitialized {
        return {
            $: 'BagItemDataNotInitialized',
            bagIndex: s.loadUintBig(64),
            registryAddress: s.loadAddress(),
        }
    },
    store(self: BagItemDataNotInitialized, b: c.Builder): void {
        b.storeUint(self.bagIndex, 64);
        b.storeAddress(self.registryAddress);
    },
    toCell(self: BagItemDataNotInitialized): c.Cell {
        return makeCellFrom<BagItemDataNotInitialized>(self, BagItemDataNotInitialized.store);
    }
}

/**
 > struct BagItemDataInitialized {
 >     bagIndex: uint64
 >     registryAddress: address
 >     bagId: uint256
 >     name: cell
 >     category: uint8
 >     uploaderAddress: address
 >     timestamp: uint64
 >     isActive: bool
 >     metadata: Cell<BagMetadata>
 > }
 */
export interface BagItemDataInitialized {
    readonly $: 'BagItemDataInitialized'
    bagIndex: uint64
    registryAddress: c.Address
    bagId: uint256
    name: c.Cell
    category: uint8
    uploaderAddress: c.Address
    timestamp: uint64
    isActive: boolean
    metadata: CellRef<BagMetadata>
}

export const BagItemDataInitialized = {
    create(args: {
        bagIndex: uint64
        registryAddress: c.Address
        bagId: uint256
        name: c.Cell
        category: uint8
        uploaderAddress: c.Address
        timestamp: uint64
        isActive: boolean
        metadata: CellRef<BagMetadata>
    }): BagItemDataInitialized {
        return {
            $: 'BagItemDataInitialized',
            ...args
        }
    },
    fromSlice(s: c.Slice): BagItemDataInitialized {
        return {
            $: 'BagItemDataInitialized',
            bagIndex: s.loadUintBig(64),
            registryAddress: s.loadAddress(),
            bagId: s.loadUintBig(256),
            name: s.loadRef(),
            category: s.loadUintBig(8),
            uploaderAddress: s.loadAddress(),
            timestamp: s.loadUintBig(64),
            isActive: s.loadBoolean(),
            metadata: loadCellRef<BagMetadata>(s, BagMetadata.fromSlice),
        }
    },
    store(self: BagItemDataInitialized, b: c.Builder): void {
        b.storeUint(self.bagIndex, 64);
        b.storeAddress(self.registryAddress);
        b.storeUint(self.bagId, 256);
        b.storeRef(self.name);
        b.storeUint(self.category, 8);
        b.storeAddress(self.uploaderAddress);
        b.storeUint(self.timestamp, 64);
        b.storeBit(self.isActive);
        storeCellRef<BagMetadata>(self.metadata, b, BagMetadata.store);
    },
    toCell(self: BagItemDataInitialized): c.Cell {
        return makeCellFrom<BagItemDataInitialized>(self, BagItemDataInitialized.store);
    }
}

/**
 > type BagItemData = BagItemDataNotInitialized | BagItemDataInitialized
 */
export type BagItemData =
    | BagItemDataNotInitialized
    | BagItemDataInitialized

export const BagItemData = {
    fromSlice(s: c.Slice): BagItemData {
        return s.loadBoolean() ? BagItemDataInitialized.fromSlice(s) : BagItemDataNotInitialized.fromSlice(s);
    },
    store(self: BagItemData, b: c.Builder): void {
        switch (self.$) {
            case 'BagItemDataNotInitialized':
                b.storeUint(0b0, 1);
                BagItemDataNotInitialized.store(self, b);
                break;
            case 'BagItemDataInitialized':
                b.storeUint(0b1, 1);
                BagItemDataInitialized.store(self, b);
                break;
        }
    },
    toCell(self: BagItemData): c.Cell {
        return makeCellFrom<BagItemData>(self, BagItemData.store);
    }
}

// ————————————————————————————————————————————
//    class BagItem
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

export class BagItem implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECDQEAAkYAART/APSkE/S88sgLAQIBYgIDAvjQ+JHyQCDHAJEw4O1E0NMAAY4T0z/6SNP/1NMH+kjTP9IA1IEAg44W0z/6SG0DbW1QQ21tUENtbVUgBIEAguIB0YEAgrrjAjGEDynXCx+CEERFQUO68vQI1ywiIioKHPK/0fiSIscF8uEPJsjPg8s/FvpSFMv/EszLB/pSBAUCASAGBwB4UHhfB/iSIscF8uEOAtcsIhJK+kzyv9P/0wf6SNM/1NTRyM+DGMs/FvpSFMv/FMzLBxL6Uss/z4PMye1UAHzLP8+BEszJ7VT4kosCyM+HIM6CEBAAAALPC4ESyz/6Uslw+wCCCExLQHD7AviSyM+FCPpScM8LbsmBAIL7AAGjvprHaiaGmAAMcJ6Z/9JGn/6mmD/SRpn+kAakCAQccLaZ/9JDaBtraoIba2qCG2tqqQAkCAQXEA6MCAQV1HRyg8L4O4OEQQxYEQiCu4cBg/qrhAwCASAICQB1uBUO1E0NMAAY4Y0z/6SNP/MdQx0wcx+kgx0z8x0gDUgQCDm9M/+khtbVUhgQCC4gHRgQCCupJsIuBbgCASAKCwBzt5ldqJoaYAAxw3pn5j9JBjp/5jqGOmDmP0kGOmfmOkAahjAgEHMaZ/9JBjAgEFxAOjAgEFdSRg4b0AOjtELdqJoaYAAxw3pn5j9JBjp/5jqGOmDmP0kGOmfmOkAGOpAgEHMaZ+Y/SRAgEFxAOjAgEFdR8SYOEQ4EEQpiMRwaGppn+mP6mmP6f/qaL+qsEAwMDAAA');

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
        return new BagItem(address);
    }

    static fromStorage(emptyStorage: {
        bagIndex: uint64
        registryAddress: c.Address
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BagItem.CodeCell,
            data: BagItemDataNotInitialized.toCell(BagItemDataNotInitialized.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BagItem(address, initialState);
    }

    static createCellOfBagItemMessage(body: BagItemMessage) {
        return BagItemMessage.toCell(body);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendBagItemMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: BagItemMessage, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: BagItemMessage.toCell(body),
            ...extraOptions
        });
    }

    async getBagData(provider: ContractProvider): Promise<BagDataReply> {
        const r = StackReader.fromGetMethod(9, await provider.get('get_bag_data', []));
        return ({
            $: 'BagDataReply',
            isInitialized: r.readBoolean(),
            bagIndex: r.readBigInt(),
            registryAddress: r.readSlice().loadAddress(),
            bagId: r.readBigInt(),
            name: r.readCell(),
            category: r.readBigInt(),
            uploaderAddress: r.readSlice().loadAddress(),
            timestamp: r.readBigInt(),
            isActive: r.readBoolean(),
        });
    }

    async getStaticData(provider: ContractProvider): Promise<StaticDataReply> {
        const r = StackReader.fromGetMethod(2, await provider.get('get_static_data', []));
        return ({
            $: 'StaticDataReply',
            bagIndex: r.readBigInt(),
            registryAddress: r.readSlice().loadAddress(),
        });
    }

    async getStorageMetadata(provider: ContractProvider): Promise<StorageMetadataReply> {
        const r = StackReader.fromGetMethod(8, await provider.get('get_storage_metadata', []));
        return ({
            $: 'StorageMetadataReply',
            isInitialized: r.readBoolean(),
            description: r.readCell(),
            bagSize: r.readBigInt(),
            filesCount: r.readBigInt(),
            files: r.readCell(),
            pieceSize: r.readBigInt(),
            merkleHash: r.readBigInt(),
            dirName: r.readCell(),
        });
    }

    async getIsActive(provider: ContractProvider): Promise<boolean> {
        const r = StackReader.fromGetMethod(1, await provider.get('is_active', []));
        return r.readBoolean();
    }
}
