tolk 1.5

import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/big_array"
import "@acton/types/message"
import "@acton/types/transaction"

import "@contracts/messages"
import "@contracts/storage"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

fun presentation(
    title: string = "",
    category: string = "other",
    visible: bool = true,
): PublicationPresentation {
    return {
        title,
        category,
        visible,
    };
}

fun setupRegistry(): (BagRegistry, Treasury, Treasury) {
    val deployer = testing.treasury("deployer");
    val uploader = testing.treasury("uploader");
    val stranger = testing.treasury("stranger");
    val registry = BagRegistry.fromStorage({ version: 3 });
    expect(
        registry.deploy(deployer.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: registry.address });
    return (registry, uploader, stranger);
}

fun publish(
    registry: BagRegistry,
    uploader: address,
    bagId: uint256 = 1,
    value: PublicationPresentation = {
        title: "",
        category: "other",
        visible: true,
    },
): (BagItem, SendResultList) {
    val quote = registry.getPublishFunding(uploader, bagId, value);
    val result = registry.sendPublish(uploader, 10, bagId, value, { value: quote.minimumValue });
    return (BagItem.fromAddress(registry.getPublicationAddress(uploader, bagId)), result);
}

fun update(
    item: BagItem,
    uploader: address,
    expectedRevision: uint64,
    value: PublicationPresentation,
): SendResultList {
    val quote = item.getFunding(value);
    return item.sendUpdatePublication(
        uploader,
        20,
        expectedRevision,
        value,
        { value: quote.minimumValue },
    );
}

fun titleBytes(n: int): string {
    var b = beginCell();
    var tail = beginCell();
    if (n <= 127) {
        repeat (n) {
            b.storeUint(0x61, 8);
        }
        return b.endCell() as unknown as string;
    }
    repeat (127) {
        b.storeUint(0x61, 8);
    }
    if (n <= 254) {
        repeat (n - 127) {
            tail.storeUint(0x61, 8);
        }
    } else {
        repeat (127) {
            tail.storeUint(0x61, 8);
        }
        var last = beginCell();
        repeat (n - 254) {
            last.storeUint(0x61, 8);
        }
        tail.storeRef(last.endCell());
    }
    return b.storeRef(tail.endCell()).endCell() as unknown as string;
}

// net.send injects its first message without debiting the synthetic sender.
// Measure attached value minus actual refund messages, not treasury balance deltas.
fun netAttachedCost(result: SendResultList, attached: coins, uploader: address): coins {
    var cost = attached;
    var i = 0;
    while (i < result.size()) {
        val tx = result.at(i).tx.load();
        val info = tx.loadInMsg<RemainingBitsAndRefs>().info;
        if (info is TlbInternalMessage) {
            if (info.dest == uploader) {
                cost -= info.value.grams;
            }
        }
        i += 1;
    }
    return cost;
}

fun categoryText(seed: uint256, length: int): string {
    var remaining = seed;
    var b = beginCell();
    repeat (length) {
        val index = remaining % 37;
        val ascii = index < 26 ? index + 97 : (index < 36 ? index - 26 + 48 : 45);
        b.storeUint(ascii, 8);
        remaining /= 37;
    }
    return b.endCell() as unknown as string;
}
