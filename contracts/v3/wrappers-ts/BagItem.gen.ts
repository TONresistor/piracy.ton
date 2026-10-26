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

    readCellRef<T>(loadFn_T: LoadCallback<T>): CellRef<T> {
        return { ref: loadFn_T(this.readCell().beginParse()) };
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
 > struct (0x30000001) PublicationCreated {
 >     queryId: uint64
 >     uploader: address
 >     bagId: uint256
 >     createdAt: uint32
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface PublicationCreated {
    readonly $: 'PublicationCreated'
    queryId: uint64
    uploader: c.Address
    bagId: uint256
    createdAt: uint32
    presentation: CellRef<PublicationPresentation>
}

export const PublicationCreated = {
    PREFIX: 0x30000001,

    create(args: {
        queryId: uint64
        uploader: c.Address
        bagId: uint256
        createdAt: uint32
        presentation: CellRef<PublicationPresentation>
    }): PublicationCreated {
        return {
            $: 'PublicationCreated',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationCreated {
        loadAndCheckPrefix32(s, 0x30000001, 'PublicationCreated');
        return {
            $: 'PublicationCreated',
            queryId: s.loadUintBig(64),
            uploader: s.loadAddress(),
            bagId: s.loadUintBig(256),
            createdAt: s.loadUintBig(32),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: PublicationCreated, b: c.Builder): void {
        b.storeUint(0x30000001, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.uploader);
        b.storeUint(self.bagId, 256);
        b.storeUint(self.createdAt, 32);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: PublicationCreated): c.Cell {
        return makeCellFrom<PublicationCreated>(self, PublicationCreated.store);
    }
}

/**
 > struct (0x30000002) PublicationUpdated {
 >     queryId: uint64
 >     revision: uint64
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface PublicationUpdated {
    readonly $: 'PublicationUpdated'
    queryId: uint64
    revision: uint64
    presentation: CellRef<PublicationPresentation>
}

export const PublicationUpdated = {
    PREFIX: 0x30000002,

    create(args: {
        queryId: uint64
        revision: uint64
        presentation: CellRef<PublicationPresentation>
    }): PublicationUpdated {
        return {
            $: 'PublicationUpdated',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationUpdated {
        loadAndCheckPrefix32(s, 0x30000002, 'PublicationUpdated');
        return {
            $: 'PublicationUpdated',
            queryId: s.loadUintBig(64),
            revision: s.loadUintBig(64),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: PublicationUpdated, b: c.Builder): void {
        b.storeUint(0x30000002, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.revision, 64);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: PublicationUpdated): c.Cell {
        return makeCellFrom<PublicationUpdated>(self, PublicationUpdated.store);
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
 > struct (0x55504433) UpdatePublication {
 >     queryId: uint64
 >     expectedRevision: uint64
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface UpdatePublication {
    readonly $: 'UpdatePublication'
    queryId: uint64
    expectedRevision: uint64
    presentation: CellRef<PublicationPresentation>
}

export const UpdatePublication = {
    PREFIX: 0x55504433,

    create(args: {
        queryId: uint64
        expectedRevision: uint64
        presentation: CellRef<PublicationPresentation>
    }): UpdatePublication {
        return {
            $: 'UpdatePublication',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdatePublication {
        loadAndCheckPrefix32(s, 0x55504433, 'UpdatePublication');
        return {
            $: 'UpdatePublication',
            queryId: s.loadUintBig(64),
            expectedRevision: s.loadUintBig(64),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: UpdatePublication, b: c.Builder): void {
        b.storeUint(0x55504433, 32);
        b.storeUint(self.queryId, 64);
        b.storeUint(self.expectedRevision, 64);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: UpdatePublication): c.Cell {
        return makeCellFrom<UpdatePublication>(self, UpdatePublication.store);
    }
}

/**
 > struct PublicationReply {
 >     initialized: bool
 >     registry: address
 >     uploader: address
 >     bagId: uint256
 >     createdAt: uint32
 >     revision: uint64
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface PublicationReply {
    readonly $: 'PublicationReply'
    initialized: boolean
    registry: c.Address
    uploader: c.Address
    bagId: uint256
    createdAt: uint32
    revision: uint64
    presentation: CellRef<PublicationPresentation>
}

export const PublicationReply = {
    create(args: {
        initialized: boolean
        registry: c.Address
        uploader: c.Address
        bagId: uint256
        createdAt: uint32
        revision: uint64
        presentation: CellRef<PublicationPresentation>
    }): PublicationReply {
        return {
            $: 'PublicationReply',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationReply {
        return {
            $: 'PublicationReply',
            initialized: s.loadBoolean(),
            registry: s.loadAddress(),
            uploader: s.loadAddress(),
            bagId: s.loadUintBig(256),
            createdAt: s.loadUintBig(32),
            revision: s.loadUintBig(64),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: PublicationReply, b: c.Builder): void {
        b.storeBit(self.initialized);
        b.storeAddress(self.registry);
        b.storeAddress(self.uploader);
        b.storeUint(self.bagId, 256);
        b.storeUint(self.createdAt, 32);
        b.storeUint(self.revision, 64);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: PublicationReply): c.Cell {
        return makeCellFrom<PublicationReply>(self, PublicationReply.store);
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
 > struct PublicationIdentity {
 >     registry: address
 >     uploader: address
 >     bagId: uint256
 > }
 */
export interface PublicationIdentity {
    readonly $: 'PublicationIdentity'
    registry: c.Address
    uploader: c.Address
    bagId: uint256
}

export const PublicationIdentity = {
    create(args: {
        registry: c.Address
        uploader: c.Address
        bagId: uint256
    }): PublicationIdentity {
        return {
            $: 'PublicationIdentity',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationIdentity {
        return {
            $: 'PublicationIdentity',
            registry: s.loadAddress(),
            uploader: s.loadAddress(),
            bagId: s.loadUintBig(256),
        }
    },
    store(self: PublicationIdentity, b: c.Builder): void {
        b.storeAddress(self.registry);
        b.storeAddress(self.uploader);
        b.storeUint(self.bagId, 256);
    },
    toCell(self: PublicationIdentity): c.Cell {
        return makeCellFrom<PublicationIdentity>(self, PublicationIdentity.store);
    }
}

/**
 > struct BagItemStorage {
 >     identity: Cell<PublicationIdentity>
 >     content: Cell<PublicationContent>?
 >     codeFootprint: CodeFootprint?
 > }
 */
export interface BagItemStorage {
    readonly $: 'BagItemStorage'
    identity: CellRef<PublicationIdentity>
    content: CellRef<PublicationContent> | null
    codeFootprint: CodeFootprint | null /* = null */
}

export const BagItemStorage = {
    create(args: {
        identity: CellRef<PublicationIdentity>
        content: CellRef<PublicationContent> | null
        codeFootprint?: CodeFootprint | null /* = null */
    }): BagItemStorage {
        return {
            $: 'BagItemStorage',
            codeFootprint: null,
            ...args
        }
    },
    fromSlice(s: c.Slice): BagItemStorage {
        return {
            $: 'BagItemStorage',
            identity: loadCellRef<PublicationIdentity>(s, PublicationIdentity.fromSlice),
            content: s.loadBoolean() ? loadCellRef<PublicationContent>(s, PublicationContent.fromSlice) : null,
            codeFootprint: s.loadBoolean() ? CodeFootprint.fromSlice(s) : null,
        }
    },
    store(self: BagItemStorage, b: c.Builder): void {
        storeCellRef<PublicationIdentity>(self.identity, b, PublicationIdentity.store);
        storeTolkNullable<CellRef<PublicationContent>>(self.content, b,
            (v,b) => storeCellRef<PublicationContent>(v, b, PublicationContent.store)
        );
        storeTolkNullable<CodeFootprint>(self.codeFootprint, b, CodeFootprint.store);
    },
    toCell(self: BagItemStorage): c.Cell {
        return makeCellFrom<BagItemStorage>(self, BagItemStorage.store);
    }
}

/**
 > struct PublicationContent {
 >     createdAt: uint32
 >     revision: uint64
 >     presentation: Cell<PublicationPresentation>
 > }
 */
export interface PublicationContent {
    readonly $: 'PublicationContent'
    createdAt: uint32
    revision: uint64
    presentation: CellRef<PublicationPresentation>
}

export const PublicationContent = {
    create(args: {
        createdAt: uint32
        revision: uint64
        presentation: CellRef<PublicationPresentation>
    }): PublicationContent {
        return {
            $: 'PublicationContent',
            ...args
        }
    },
    fromSlice(s: c.Slice): PublicationContent {
        return {
            $: 'PublicationContent',
            createdAt: s.loadUintBig(32),
            revision: s.loadUintBig(64),
            presentation: loadCellRef<PublicationPresentation>(s, PublicationPresentation.fromSlice),
        }
    },
    store(self: PublicationContent, b: c.Builder): void {
        b.storeUint(self.createdAt, 32);
        b.storeUint(self.revision, 64);
        storeCellRef<PublicationPresentation>(self.presentation, b, PublicationPresentation.store);
    },
    toCell(self: PublicationContent): c.Cell {
        return makeCellFrom<PublicationContent>(self, PublicationContent.store);
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
    static CodeCell = c.Cell.fromBase64('te6ccgECGAEABLEAART/APSkE/S88sgLAQIBYgIDAgLOBAUCASAPEAIBIAYHAIFPgnbxBQA6FTAbwC4wQgcPsCcFMA+Dhw+AeBBdygAfg2UAOgWKD4J28QWKG5jhDIz4UI+lJwzwtuyYEAgvsA4DCAKLPiR8kAgxwCRMODtRNDU9ATTAAGX0x/TD4EAhZRtbVhw4gHRJND6SPpI1wv/CNcsIkpySZzjAjI31ywiqoIhnOMChA/y8IAgJAfc7aLt+9DU1NIAMdHQINdJIddKkXCVIMIHwwDiliCDBrvDAJFw4pggqTgCwADDAJFw4vLhAqsCjhfTB4JAP///8AAAAAAf+aosWK1xsPLhAuQw0HAg66Qi10kj10oiwQSYIak4AsAAwwCRcOKVIMECwwCRcOLy4QMhqwIUgDgL60z/6SNP/1NH4klAGxwXy4Q5RE8cFlCm6wwCSMHDi8uESI5JTVJj4KoMK+UEwAeIobuMDNTU1NVMh+CNTMMjLH3DPCz/MyQnIzBn0AM+DEssfyw/JIIAg+UEwBKCmAlBDoIMIoBKCEAlmAYBw+Df4l/gnbxAhoVMCvFMT4wQKCwL+0z/TP9TR+JIpxwXy4Q8mbvLRECbQ0x/TP9TRUUG68uERJZJTdpj4KoMK+UEwAeIk+QAG+QAWuuMCNjY2NiXwASOEP7ny4RMDpCUFyMsfIc8LPxXMyVMjCMjMEvQAz4PLHxbLD8kggCD5QTAEoKYCUCOggwigEoIQCWYBgHD4NwwNALgyMzgGyMwV9AABl8+DEssfyw+UbCHPgeLJgCD5QTAEoKYCA6CDCKASghAJZgGAcPg3+Jf4J28QIaFTArxTE+MEggDqYHD4NniDC3D4OKoAoKCivvLhAPiXAXDwAgCOggDqYHD4NniDC3D4OKoAoKCivvLhAALtVIsCyM+QwAAABhTLP1JA+lIWy/8Uyx8UzMnIz4cgFM5xzwthE8zJcPsI+JdZ8AIAtjVfAwbIzBX0AAGXz4MSyx/LD5RsIc+B4smAIPlBMAOgpgICoIMIoIIQCWYBgHD4N/iX+CdvECGhUwK8UxPjBIIA6mBw+DZ4gwtw+DiqAKCgor7y4QD4lwFw8AIAjviX+CdvECGhUwK8UxPjBIIA6mBw+DZ4gwtw+DiqAKCgor7y4QAB7VSLAsjPhyDOghAwAAACzwuBFMs/yz/MyXD7CPiXWfACAFSgIIMHu/LhAwOOEjMxwAGSMH+UwgDDAOLy4QPbMeGBA/i68uEDAtdM0AICASAREgIBWBUWAvW4uMIPAB7UTQ1PQE0wABl9Mf0w+BAIWUbW1YcOIB0Zlb+CqDCvlBMAHfcMjLXxXMyVMUBcjMEvQAz4PLHxPLD8mAIPlBMFJCoKYCUjKggwigghAJZgGAcPg3ggDqYHD4NniDC3D4OKoAoFygMPgnbxAjbpJsM+MOUyC8gTFAAHuBkHOABM+CME0NMf0z8x1DHRFKHtRIAg+UEwB6CmBVBWoIEKAKBFBHD4N6EAIJIiopIwcOIhoFmCEAlmAYACXbT8faiaGp6AoDofSR9JGn/6LgQREQA5GZmZ8DkkzdNL4GR6GmP6Z/qaO+DN1mDQFxcADbek/wTt4hAAAA==');

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
        return new BagItem(address);
    }

    static fromStorage(emptyStorage: {
        identity: CellRef<PublicationIdentity>
        content: CellRef<PublicationContent> | null
        codeFootprint?: CodeFootprint | null /* = null */
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? BagItem.CodeCell,
            data: BagItemStorage.toCell(BagItemStorage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new BagItem(address, initialState);
    }

    static createCellOfInitializePublication(body: {
        queryId: uint64
        uploader: c.Address
        bagId: uint256
        presentation: CellRef<PublicationPresentation>
    }) {
        return InitializePublication.toCell(InitializePublication.create(body));
    }

    static createCellOfUpdatePublication(body: {
        queryId: uint64
        expectedRevision: uint64
        presentation: CellRef<PublicationPresentation>
    }) {
        return UpdatePublication.toCell(UpdatePublication.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendInitializePublication(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        uploader: c.Address
        bagId: uint256
        presentation: CellRef<PublicationPresentation>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: InitializePublication.toCell(InitializePublication.create(body)),
            ...extraOptions
        });
    }

    async sendUpdatePublication(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        expectedRevision: uint64
        presentation: CellRef<PublicationPresentation>
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UpdatePublication.toCell(UpdatePublication.create(body)),
            ...extraOptions
        });
    }

    async getPublication(provider: ContractProvider): Promise<PublicationReply> {
        const r = StackReader.fromGetMethod(7, await provider.get('get_publication', []));
        return ({
            $: 'PublicationReply',
            initialized: r.readBoolean(),
            registry: r.readSlice().loadAddress(),
            uploader: r.readSlice().loadAddress(),
            bagId: r.readBigInt(),
            createdAt: r.readBigInt(),
            revision: r.readBigInt(),
            presentation: r.readCellRef<PublicationPresentation>(PublicationPresentation.fromSlice),
        });
    }

    async getFunding(provider: ContractProvider, presentation: CellRef<PublicationPresentation>): Promise<FundingReply> {
        const r = StackReader.fromGetMethod(4, await provider.get('get_funding', [
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

    async getBalance(provider: ContractProvider): Promise<coins> {
        const r = StackReader.fromGetMethod(1, await provider.get('get_balance', []));
        return r.readBigInt();
    }
}
