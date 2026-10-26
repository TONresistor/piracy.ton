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

type uint16 = bigint
type uint32 = bigint
type uint64 = bigint
type uint256 = bigint

/**
 > enum PublicationError { 11 variants }
 */
export type PublicationError = bigint

export const PublicationError = {
    InsufficientValue: 256n,
    InvalidBagId: 257n,
    InvalidCategory: 258n,
    InvalidTitle: 259n,
    NotFromRegistry: 270n,
    NotFromUploader: 271n,
    NotInitialized: 272n,
    StaleRevision: 273n,
    InvalidIdentity: 274n,
    RevisionOverflow: 275n,
    InvalidBounce: 276n,

    fromSlice(s: c.Slice): PublicationError {
        return s.loadUintBig(9);
    },
    store(self: PublicationError, b: c.Builder): void {
        b.storeUint(self, 9);
    },
    toCell(self: PublicationError): c.Cell {
        return makeCellFrom<PublicationError>(self, PublicationError.store);
    }
}

/**
 > struct PublicationPresentation {
 >     title: string
 >     category: string
 >     visible: bool
 > }
 */
export interface PublicationPresentation {
    readonly $: 'PublicationPresentation'
    title: string
    category: string
    visible: boolean
}

export const PublicationPresentation = {
    create(args: {
        title: string
        category: string
        visible: boolean
    }): PublicationPresentation {
        return {
            $: 'PublicationPresentation',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationPresentation {
        return {
            $: 'PublicationPresentation',
            title: s.loadStringRefTail(),
            category: s.loadStringRefTail(),
            visible: s.loadBoolean(),
        }
    },
    store(self: PublicationPresentation, b: c.Builder): void {
        b.storeStringRefTail(self.title);
        b.storeStringRefTail(self.category);
        b.storeBit(self.visible);
    },
    toCell(self: PublicationPresentation): c.Cell {
        return makeCellFrom<PublicationPresentation>(self, PublicationPresentation.store);
    }
}

/**
 > struct (0x50554233) Publish {
 >     queryId: uint64
 >     bagId: uint256
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface Publish {
    readonly $: 'Publish'
    queryId: uint64
    bagId: uint256
    presentation: CellRef<PublicationPresentation>
}

export const Publish = {
    PREFIX: 0x50554233,

    create(args: {
        queryId: uint64
        bagId: uint256
        presentation: CellRef<PublicationPresentation>
    }): Publish {
        return {
            $: 'Publish',
            ...args
        }
    },
    fromSlice(s: c.Slice): Publish {
        loadAndCheckPrefix32(s, 0x50554233, 'Publish');
        return {
            $: 'Publish',
            queryId: s.loadUintBig(64),
            bagId: s.loadUintBig(256),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: Publish, b: c.Builder): void {
        b.storeUint(0x50554233, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.bagId, 256);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: Publish): c.Cell {
        return makeCellFrom<Publish>(self, Publish.store);
    }
}

/**
 > struct (0x494e4933) InitializePublication {
 >     queryId: uint64
 >     uploader: address
 >     bagId: uint256
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface InitializePublication {
    readonly $: 'InitializePublication'
    queryId: uint64
    uploader: c.Address
    bagId: uint256
    presentation: CellRef<PublicationPresentation>
}

export const InitializePublication = {
    PREFIX: 0x494e4933,

    create(args: {
        queryId: uint64
        uploader: c.Address
        bagId: uint256
        presentation: CellRef<PublicationPresentation>
    }): InitializePublication {
        return {
            $: 'InitializePublication',
            ...args
        }
    },
    fromSlice(s: c.Slice): InitializePublication {
        loadAndCheckPrefix32(s, 0x494e4933, 'InitializePublication');
        return {
            $: 'InitializePublication',
            queryId: s.loadUintBig(64),
            uploader: s.loadAddress(),
            bagId: s.loadUintBig(256),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: InitializePublication, b: c.Builder): void {
        b.storeUint(0x494e4933, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.uploader);
        b.storeUint(self.bagId, 256);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: InitializePublication): c.Cell {
        return makeCellFrom<InitializePublication>(self, InitializePublication.store);
    }
}

/**
 > type RegistryMessage = Publish
 */
export type RegistryMessage = Publish

export const RegistryMessage = {
    fromSlice(s: c.Slice): RegistryMessage {
        return Publish.fromSlice(s);
    },
    store(self: RegistryMessage, b: c.Builder): void {
        Publish.store(self, b);
    },
    toCell(self: RegistryMessage): c.Cell {
        return makeCellFrom<RegistryMessage>(self, RegistryMessage.store);
    }
}

/**
 > struct FundingReply {
 >     minimumValue: coins
 >     storageReserve: coins
 >     executionBudget: coins
 >     storageSeconds: uint32
 > }
 */
export interface FundingReply {
    readonly $: 'FundingReply'
    minimumValue: coins
    storageReserve: coins
    executionBudget: coins
    storageSeconds: uint32
}

export const FundingReply = {
    create(args: {
        minimumValue: coins
        storageReserve: coins
        executionBudget: coins
        storageSeconds: uint32
    }): FundingReply {
        return {
            $: 'FundingReply',
            ...args
        }
    },
    fromSlice(s: c.Slice): FundingReply {
        return {
            $: 'FundingReply',
            minimumValue: s.loadCoins(),
            storageReserve: s.loadCoins(),
            executionBudget: s.loadCoins(),
            storageSeconds: s.loadUintBig(32),
        }
    },
    store(self: FundingReply, b: c.Builder): void {
        b.storeCoins(self.minimumValue);
        b.storeCoins(self.storageReserve);
        b.storeCoins(self.executionBudget);
        b.storeUint(self.storageSeconds, 32);
    },
    toCell(self: FundingReply): c.Cell {
        return makeCellFrom<FundingReply>(self, FundingReply.store);
    }
}

/**
 > struct CodeFootprint {
 >     bits: uint32
 >     cells: uint16
 > }
 */
export interface CodeFootprint {
    readonly $: 'CodeFootprint'
    bits: uint32
    cells: uint16
}

export const CodeFootprint = {
    create(args: {
        bits: uint32
        cells: uint16
    }): CodeFootprint {
        return {
            $: 'CodeFootprint',
            ...args
        }
    },
    fromSlice(s: c.Slice): CodeFootprint {
        return {
            $: 'CodeFootprint',
            bits: s.loadUintBig(32),
            cells: s.loadUintBig(16),
        }
    },
    store(self: CodeFootprint, b: c.Builder): void {
        b.storeUint(self.bits, 32);
        b.storeUint(self.cells, 16);
    },
    toCell(self: CodeFootprint): c.Cell {
        return makeCellFrom<CodeFootprint>(self, CodeFootprint.store);
    }
}

/**
 > struct RegistryFootprint {
 >     ownCode: CodeFootprint
 >     itemCode: CodeFootprint
 > }
 */
export interface RegistryFootprint {
    readonly $: 'RegistryFootprint'
    ownCode: CodeFootprint
    itemCode: CodeFootprint
}

export const RegistryFootprint = {
    create(args: {
        ownCode: CodeFootprint
        itemCode: CodeFootprint
    }): RegistryFootprint {
        return {
            $: 'RegistryFootprint',
            ...args
        }
    },
    fromSlice(s: c.Slice): RegistryFootprint {
        return {
            $: 'RegistryFootprint',
            ownCode: CodeFootprint.fromSlice(s),
            itemCode: CodeFootprint.fromSlice(s),
        }
    },
    store(self: RegistryFootprint, b: c.Builder): void {
        CodeFootprint.store(self.ownCode, b);
        CodeFootprint.store(self.itemCode, b);
    },
    toCell(self: RegistryFootprint): c.Cell {
        return makeCellFrom<RegistryFootprint>(self, RegistryFootprint.store);
    }
}

/**
 > struct BagRegistryStorage {
 >     version: uint16
 >     footprint: RegistryFootprint?
 > }
 */
export interface BagRegistryStorage {
    readonly $: 'BagRegistryStorage'
    version: uint16 /* = 3 */
    footprint: RegistryFootprint | null /* = null */
}

export const BagRegistryStorage = {
    create(args: {
        version?: uint16 /* = 3 */
        footprint?: RegistryFootprint | null /* = null */
    }): BagRegistryStorage {
        return {
            $: 'BagRegistryStorage',
            version: 3n,
            footprint: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): BagRegistryStorage {
        return {
            $: 'BagRegistryStorage',
            version: s.loadUintBig(16),
            footprint: s.loadBoolean() ? RegistryFootprint.fromSlice(s) : null,
        }
    },
    store(self: BagRegistryStorage, b: c.Builder): void {
        b.storeUint(self.version, 16);
        storeTolkNullable<RegistryFootprint>(self.footprint, b, RegistryFootprint.store);
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
    static CodeCell = c.Cell.fromBase64('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');

    static Errors = {
        'PublicationError.InsufficientValue': 256,
        'PublicationError.InvalidBagId': 257,
        'PublicationError.InvalidCategory': 258,
        'PublicationError.InvalidTitle': 259,
        'PublicationError.NotFromRegistry': 270,
        'PublicationError.NotFromUploader': 271,
        'PublicationError.NotInitialized': 272,
        'PublicationError.StaleRevision': 273,
        'PublicationError.InvalidIdentity': 274,
        'PublicationError.RevisionOverflow': 275,
        'PublicationError.InvalidBounce': 276,
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
        version?: uint16 /* = 3 */
        footprint?: RegistryFootprint | null /* = null */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BagRegistry.CodeCell,
            data: BagRegistryStorage.toCell(BagRegistryStorage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BagRegistry(address, initialState);
    }

    static createCellOfRegistryMessage(body: RegistryMessage) {
        return RegistryMessage.toCell(body);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendRegistryMessage(provider: ContractProvider, via: Sender, msgValue: coins, body: RegistryMessage, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: RegistryMessage.toCell(body),
            ...extraOptions
        });
    }

    async getPublicationAddress(provider: ContractProvider, uploader: c.Address, bagId: uint256): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_publication_address', [
            { type: 'slice', cell: makeCellFrom<c.Address>(uploader,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: bagId },
        ]));
        return r.readSlice().loadAddress();
    }

    async getPublishFunding(provider: ContractProvider, uploader: c.Address, bagId: uint256, presentation: CellRef<PublicationPresentation>): Promise<FundingReply> {
        const r = StackReader.fromGetMethod(4, await provider.get('get_publish_funding', [
            { type: 'slice', cell: makeCellFrom<c.Address>(uploader,
                (v,b) => b.storeAddress(v)
            ) },
            { type: 'int', value: bagId },
            { type: 'cell', cell: PublicationPresentation.toCell(presentation.ref) },
        ]));
        return ({
            $: 'FundingReply',
            minimumValue: r.readBigInt(),
            storageReserve: r.readBigInt(),
            executionBudget: r.readBigInt(),
            storageSeconds: r.readBigInt(),
        });
    }

    async getVersion(provider: ContractProvider): Promise<bigint> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_version', []));
        return r.readBigInt();
    }

    async getItemCode(provider: ContractProvider): Promise<c.Cell> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_item_code', []));
        return r.readCell();
    }

    async getBalance(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_balance', []));
        return r.readBigInt();
    }
}
