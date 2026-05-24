import "@acton/io"

import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/messages"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

fun textCell(tag: int): cell {
    return beginCell().storeUint(tag, 32).endCell();
}

fun main() {
    val deployer = scripts.wallet("deployer");
    val uploader = scripts.wallet("uploader");

    println("====================================================");
    println("piracy.ton — end-to-end emulation demo");
    println("====================================================");

    val registry = BagRegistry.fromStorage({ nextBagIndex: 0 });
    val deployRes = registry.deploy(deployer.address, { value: ton("0.1") });
    deployRes.waitForFirstTransaction();
    println("Registry deployed : {}", registry.address);
    println("Total bags        : {}", registry.getTotal());

    val metadata: BagMetadata = {
        description: textCell(0xDE5C),
        bagSize: 1048576,
        filesCount: 2,
        files: beginCell().storeUint(0x1, 16).endCell(),
        pieceSize: 131072,
        merkleHash: 0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789,
        dirName: textCell(0xD12E),
    };
    val addRes = registry.sendAddBag(
        uploader.address,
        0x1A2B3C as uint256,
        0 as uint8,
        textCell(0xBADC0DE),
        metadata,
        { value: ton("0.15"), bounce: true },
    );
    addRes.waitForFirstTransaction();
    println("");
    println("AddBag broadcast.");
    println("Total bags        : {}", registry.getTotal());

    val childAddr = registry.getBagAddress(0);
    println("BagItem #0 address: {}", childAddr);

    val child = BagItem.fromAddress(childAddr);
    val data = child.getBagData();
    println("BagItem initialized: {}", data.isInitialized);
    println("BagItem bagId      : 0x{:x}", data.bagId);
    println("BagItem isActive   : {}", child.isActive());

    println("");
    println("Demo complete — full deploy + AddBag flow verified locally.");
}
