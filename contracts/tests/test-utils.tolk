import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/messages"
import "@contracts/storage"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

const T_ITEM_FUNDING: coins = ton("0.07")
const T_MIN_REGISTRY_BALANCE: coins = ton("0.05")
const T_MIN_ADD_BAG_VALUE: coins = ton("0.1")

const ERR_INSUFFICIENT_VALUE: int = 256
const ERR_INVALID_BAG_ID: int = 257
const ERR_INVALID_CATEGORY: int = 258
const ERR_METADATA_TOO_LARGE: int = 259
const ERR_INDEX_OUT_OF_RANGE: int = 260
const ERR_NOT_FROM_REGISTRY: int = 270
const ERR_NOT_FROM_UPLOADER: int = 271
const ERR_ALREADY_INACTIVE: int = 272
const ERR_UNKNOWN_OPCODE: int = 0xFFFF

fun textCell(tag: int): cell {
    return beginCell().storeUint(tag, 32).endCell();
}

fun sampleMetadata(): BagMetadata {
    return {
        description: textCell(0xDE5C),
        bagSize: 1048576,
        filesCount: 3,
        files: beginCell().storeUint(0x1111, 16).endCell(),
        pieceSize: 131072,
        merkleHash: 0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789,
        dirName: textCell(0xD12E),
    };
}

fun deepCell(depth: int): cell {
    var c = beginCell().endCell();
    var i = 0;
    while (i < depth) {
        c = beginCell().storeRef(c).endCell();
        i += 1;
    }
    return c;
}

fun oversizedMetadata(): BagMetadata {
    return {
        description: textCell(0xDE5C),
        bagSize: 1,
        filesCount: 0,
        files: deepCell(400), // 401 cells > 256-cell cap
        pieceSize: 1,
        merkleHash: 1,
        dirName: textCell(0xD12E),
    };
}

fun setupRegistry(): (BagRegistry, Treasury, Treasury) {
    val deployer = testing.treasury("deployer");
    val uploader = testing.treasury("uploader");
    val stranger = testing.treasury("stranger");

    val registry = BagRegistry.fromStorage({ nextBagIndex: 0 });
    val res = registry.deploy(deployer.address, { value: ton("0.1") });
    expect(res).toHaveSuccessfulDeploy({ to: registry.address });

    return (registry, uploader, stranger);
}

fun addBag(
    registry: BagRegistry,
    from: address,
    bagId: uint256,
    category: uint8,
    value: coins,
): SendResultList {
    return registry.sendAddBag(
        from,
        bagId,
        category,
        textCell(0xBABE),
        sampleMetadata(),
        { value },
    );
}

fun bagItemAddressFor(bagIndex: uint64, registryAddress: address): address {
    val preInit: BagItemData = BagItemDataNotInitialized { bagIndex, registryAddress };
    val stateInit = ContractState {
        code: build("BagItem"),
        data: serializeBagItemData(preInit),
    };
    return AutoDeployAddress { stateInit }.calculateAddress();
}

fun deployUninitBagItem(
    from: address,
    bagIndex: uint64,
    registryAddress: address,
    value: coins,
): (BagItem, SendResultList) {
    val preInit: BagItemData = BagItemDataNotInitialized { bagIndex, registryAddress };
    val stateInit = ContractState {
        code: build("BagItem"),
        data: serializeBagItemData(preInit),
    };
    val addr = AutoDeployAddress { stateInit }.calculateAddress();
    val deployMsg = createMessage({ bounce: false, value, dest: { stateInit } });
    val res = net.send(from, deployMsg);
    return (BagItem.fromAddress(addr), res);
}

fun buildInitParamsBody(
    bagId: uint256,
    category: uint8,
    uploaderAddress: address,
    timestamp: uint64,
): cell {
    val params: BagItemInitParams = {
        bagId,
        category,
        uploaderAddress,
        timestamp,
        name: textCell(0xBABE),
        metadata: sampleMetadata().toCell(),
    };
    return params.toCell();
}
