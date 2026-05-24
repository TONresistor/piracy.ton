import "@acton/io"

import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/messages"
import "@wrappers/BagRegistry.gen"

const ADD_BAG_VALUE: coins = ton("0.15")

fun textCell(tag: int): cell {
    return beginCell().storeUint(tag, 32).endCell();
}

fun main(registryAddr: address, bagId: int, category: int) {
    assert (bagId != 0) throw 257;
    assert (category >= 0 && category <= 5) throw 258;

    val sender = scripts.wallet("deployer");
    val registry = BagRegistry.fromAddress(registryAddr);

    val name: cell = textCell(0xBADC0DE);
    val metadata: BagMetadata = {
        description: textCell(0xDE5C),
        bagSize: 1048576,
        filesCount: 1,
        files: beginCell().storeUint(0x1, 16).endCell(),
        pieceSize: 131072,
        merkleHash: 0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789,
        dirName: textCell(0xD12E),
    };

    println("====================================================");
    println("AddBag — register a bag in BagRegistry");
    println("====================================================");
    println("Registry : {}", registry.address);
    println("Sender   : {}", sender.address);
    println("bagId    : 0x{:x}", bagId);
    println("category : {}", category);
    println("value    : {:ton}  (>= 0.10 TON minimum; surplus refunded)", ADD_BAG_VALUE);
    println("");

    if (!scripts.isContractDeployed(registry.address)) {
        println("ERROR: no contract deployed at the registry address. Aborting.");
        return;
    }

    val totalBefore = registry.getTotal();
    println("Registry total before: {}", totalBefore);

    println("Broadcasting AddBag (no-op locally without --net)...");
    val result = registry.sendAddBag(
        sender.address,
        bagId as uint256,
        category as uint8,
        name,
        metadata,
        { value: ADD_BAG_VALUE, bounce: true },
    );
    result.waitForFirstTransaction();

    val totalAfter = registry.getTotal();
    println("");
    println("AddBag broadcast complete.");
    println("Registry total after : {}", totalAfter);

    if (totalAfter > totalBefore) {
        val bagAddr = registry.getBagAddress(totalBefore);
        println("New BagItem index    : {}", totalBefore);
        println("New BagItem address  : {}", bagAddr);
    }
}
