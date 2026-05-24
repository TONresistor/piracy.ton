import * as c from '@ton/core';
import { beginCell, contractAddress } from '@ton/core';
import {
    BagItem as GeneratedBagItem,
    BagItemData,
    BagItemDataNotInitialized,
} from './BagItem.gen';

export * from './BagItem.gen';

export interface BagItemPreInit {
    bagIndex: bigint;
    registryAddress: c.Address;
}

export function buildBagItemPreInitData(preInit: BagItemPreInit): c.Cell {
    const notInit: BagItemDataNotInitialized = BagItemDataNotInitialized.create({
        bagIndex: preInit.bagIndex,
        registryAddress: preInit.registryAddress,
    });
    const asUnion: BagItemData = notInit;
    return BagItemData.toCell(asUnion);
}

export function buildBagItemStateInit(
    preInit: BagItemPreInit,
    code: c.Cell = GeneratedBagItem.CodeCell,
): { code: c.Cell; data: c.Cell } {
    return { code, data: buildBagItemPreInitData(preInit) };
}

export function deriveBagItemAddress(
    preInit: BagItemPreInit,
    code: c.Cell = GeneratedBagItem.CodeCell,
    workchain: number = 0,
): c.Address {
    const init = buildBagItemStateInit(preInit, code);
    return contractAddress(workchain, init);
}

export function bagItemFromPreInit(
    preInit: BagItemPreInit,
    code: c.Cell = GeneratedBagItem.CodeCell,
    workchain: number = 0,
): GeneratedBagItem {
    const init = buildBagItemStateInit(preInit, code);
    const address = contractAddress(workchain, init);
    const instance = GeneratedBagItem.fromAddress(address);
    (instance as unknown as { init: { code: c.Cell; data: c.Cell } }).init = init;
    return instance;
}
