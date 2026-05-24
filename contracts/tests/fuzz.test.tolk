import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/testing/fuzz"

import "@contracts/errors"
import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

fun chainOf(cells: int): cell {
    var c = beginCell().endCell();
    var i = 1; // first cell already built
    while (i < cells) {
        c = beginCell().storeRef(c).endCell();
        i += 1;
    }
    return c;
}

fun flatCellOfBits(bits: int): cell {
    var remaining = bits < 0 ? 0 : (bits > 1023 ? 1023 : bits);
    var b = beginCell();
    while (remaining > 0) {
        val chunk = remaining > 256 ? 256 : remaining;
        b = b.storeUint(0, chunk);
        remaining -= chunk;
    }
    return b.endCell();
}

@test.fuzz(256)
get fun `test fuzz addbag any nonzero bagId is accepted and stored`(rawBagId: uint256) {
    val maxId = ((1 << 255) - 1) | (1 << 255);
    val bagId = fuzz.bound(rawBagId, 1, maxId);

    val (registry, uploader, _) = setupRegistry();
    expect(registry.getTotal()).toEqual(0);

    val res = addBag(registry, uploader.address, bagId, 0, ton("0.2"));

    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);

    val child = BagItem.fromAddress(registry.getBagAddress(0));
    val data = child.getBagData();
    expect(data.isInitialized).toBeTrue();
    expect(data.bagId).toEqual(bagId);
}

@test.fuzz(128)
get fun `test fuzz addbag with zero bagId always fails 257 and allocates nothing`(
    rawCategory: uint8,
) {
    val category = fuzz.bound(rawCategory, 0, 5);

    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0, category, ton("0.2"));

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_INVALID_BAG_ID,
    });
    expect(registry.getTotal()).toEqual(0);
    expect(res).toNotHaveTx({ deploy: true });
}

@test.fuzz(256)
get fun `test fuzz addbag category in range is accepted out of range fails 258`(
    rawCategory: uint8,
) {
    val category = rawCategory;

    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0xF00D, category, ton("0.2"));

    if (category <= 5) {
        expect(res).toHaveAllSuccessfulTxs();
        expect(registry.getTotal()).toEqual(1);
        val child = BagItem.fromAddress(registry.getBagAddress(0));
        expect(child.getBagData().category).toEqual(category);
    } else {
        expect(res).toHaveFailedTx<AddBag>({
            from: uploader.address,
            to: registry.address,
            exitCode: ERR_INVALID_CATEGORY,
        });
        expect(registry.getTotal()).toEqual(0);
        expect(res).toNotHaveTx({ deploy: true });
    }
}

@test.fuzz(256)
get fun `test fuzz addbag value below minimum always rejected with 256`(rawValue: coins) {
    val value = fuzz.bound(rawValue, ton("0.03"), T_MIN_ADD_BAG_VALUE - 1);

    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0x1234, 1, value);

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_INSUFFICIENT_VALUE,
    });
    expect(registry.getTotal()).toEqual(0);
    expect(res).toNotHaveTx({ deploy: true });
}

@test.fuzz(256)
get fun `test fuzz addbag value at or above minimum always succeeds`(rawValue: coins) {
    val value = fuzz.bound(rawValue, T_MIN_ADD_BAG_VALUE, T_MIN_ADD_BAG_VALUE + ton("5"));

    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0x5678, 2, value);

    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

@test.fuzz(256)
get fun `test fuzz registry never accumulates and uploader is refunded`(rawValue: coins) {
    val value = fuzz.bound(rawValue, T_MIN_ADD_BAG_VALUE, ton("20"));

    val (registry, uploader, _) = setupRegistry();
    val uploaderBefore = testing.getAccountBalance(uploader.address);

    val res = addBag(registry, uploader.address, 0xCAFE, 3, value);
    expect(res).toHaveAllSuccessfulTxs();

    val registryBal = testing.getAccountBalance(registry.address);
    expect(registryBal).toBeLessOrEqual(T_MIN_REGISTRY_BALANCE + ton("0.01"));
    expect(registryBal).toBeGreaterOrEqual(T_MIN_REGISTRY_BALANCE - ton("0.01"));

    val uploaderAfter = testing.getAccountBalance(uploader.address);
    val netCost = uploaderBefore - uploaderAfter;
    expect(netCost).toBeLessOrEqual(T_ITEM_FUNDING + ton("0.05"));

    expect(res).toHaveTx({ from: registry.address, to: uploader.address, success: true });
}

@test.fuzz(256)
get fun `test fuzz get_bag_address in range returns the matching child`(rawIndex: int) {
    val (registry, uploader, _) = setupRegistry();
    var i = 0;
    while (i < 4) {
        addBag(registry, uploader.address, (0x100 + i) as uint256, 1, ton("0.2"));
        i += 1;
    }
    expect(registry.getTotal()).toEqual(4);

    val index = fuzz.bound(rawIndex, 0, 3);
    val addr = registry.getBagAddress(index);

    expect(testing.isDeployed(addr)).toBeTrue();
    val child = BagItem.fromAddress(addr);
    expect(child.getStaticData().bagIndex).toEqual(index);
}

@test.fail_with(260)
@test.fuzz(256)
get fun `test fuzz get_bag_address above total always throws 260`(rawIndex: int) {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 0, ton("0.2"));
    addBag(registry, uploader.address, 0x2, 1, ton("0.2"));
    expect(registry.getTotal()).toEqual(2);

    val index = fuzz.bound(rawIndex, 2, 1 << 40);

    var aborted = false;
    try {
        registry.getBagAddress(index);
    } catch {
        aborted = true;
    }
    assert (!aborted) throw BagError.IndexOutOfRange;
}

@test.fail_with(260)
@test.fuzz(256)
get fun `test fuzz get_bag_address negative index always throws 260`(rawIndex: int) {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x3, 2, ton("0.2"));
    expect(registry.getTotal()).toEqual(1);

    val index = fuzz.bound(rawIndex, -(1 << 40), -1);

    var aborted = false;
    try {
        registry.getBagAddress(index);
    } catch {
        aborted = true;
    }
    assert (!aborted) throw BagError.IndexOutOfRange;
}

@test.fuzz(128)
get fun `test fuzz addbag name cell within cell cap is accepted`(rawCells: int) {
    val cells = fuzz.bound(rawCells, 1, 200);
    val name = chainOf(cells);

    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xBEEF,
        1,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );

    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

@test.fuzz(128)
get fun `test fuzz addbag oversized name cell always rejected with 259`(rawCells: int) {
    val cells = fuzz.bound(rawCells, 300, 900);
    val name = chainOf(cells);

    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xDEAD,
        1,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_METADATA_TOO_LARGE,
    });
    expect(registry.getTotal()).toEqual(0);
    expect(res).toNotHaveTx({ deploy: true });
}

@test.fuzz(64)
get fun `test fuzz addbag small flat name cell is accepted`(rawBits: int) {
    val bits = fuzz.bound(rawBits, 0, 1023);
    val name = flatCellOfBits(bits);

    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xABCD,
        2,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );

    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

@test.fuzz(128)
get fun `test fuzz deactivate from non uploader always fails 271`(rawHash: uint256) {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x42, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val senderHash = fuzz.bound(rawHash, 1, ((1 << 255) - 1) | (1 << 255));
    val sender = address.fromWorkchainAndHash(0, senderHash as uint256);

    fuzz.assume(sender != uploader.address, "sender must differ from the uploader");

    val res = child.sendDeactivateBag(sender, { value: ton("0.1") });

    expect(res).toHaveFailedTx<DeactivateBag>({
        from: sender,
        to: child.address,
        exitCode: ERR_NOT_FROM_UPLOADER,
    });
    expect(child.isActive()).toBeTrue();
}

@test.fuzz(256)
get fun `test fuzz unknown opcode to registry always fails 0xFFFF`(rawOpcode: uint32) {
    val opcode = rawOpcode;
    fuzz.assume(opcode != 0x41444247, "opcode must not be the real AddBag opcode");

    val (registry, uploader, _) = setupRegistry();
    val body = beginCell().storeUint(opcode, 32).endCell();
    val res = registry.sendAny(uploader.address, body, { value: ton("0.2") });

    expect(res).toHaveFailedTx({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_UNKNOWN_OPCODE,
    });
    expect(registry.getTotal()).toEqual(0);
    expect(res).toNotHaveTx({ deploy: true });
}

fun bitChain20(bitsPer: int): cell {
    val per = bitsPer < 0 ? 0 : (bitsPer > 1023 ? 1023 : bitsPer);
    var cur = beginCell();
    var w = per;
    while (w > 0) {
        val chunk = w > 256 ? 256 : w;
        cur = cur.storeUint(0, chunk);
        w -= chunk;
    }
    var c = cur.endCell();
    var i = 1;
    while (i < 20) {
        var b = beginCell().storeRef(c);
        var w2 = per;
        while (w2 > 0) {
            val chunk2 = w2 > 256 ? 256 : w2;
            b = b.storeUint(0, chunk2);
            w2 -= chunk2;
        }
        c = b.endCell();
        i += 1;
    }
    return c;
}

@test.fuzz(192)
get fun `test fuzz name bit count bound is enforced at 16384`(rawBits: int) {
    val bitsPer = fuzz.bound(rawBits, 600, 1023);
    val totalBits = 20 * bitsPer;
    val name = bitChain20(bitsPer);

    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xB175F0,
        1,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );

    if (totalBits <= 16384) {
        expect(res).toHaveAllSuccessfulTxs();
        expect(registry.getTotal()).toEqual(1);
    } else {
        expect(res).toHaveFailedTx<AddBag>({
            from: uploader.address,
            to: registry.address,
            exitCode: ERR_METADATA_TOO_LARGE,
        });
        expect(registry.getTotal()).toEqual(0);
    }
}

@test.fuzz(192)
get fun `test fuzz child resident balance is fixed regardless of addbag value`(rawValue: coins) {
    val value = fuzz.bound(rawValue, T_MIN_ADD_BAG_VALUE, ton("15"));

    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0xF00D1, 4, value);
    expect(res).toHaveAllSuccessfulTxs();

    val childAddr = registry.getBagAddress(0);
    val childBal = testing.getAccountBalance(childAddr);
    expect(childBal).toBeGreaterOrEqual(ton("0.04"));
    expect(childBal).toBeLessOrEqual(T_ITEM_FUNDING + ton("0.01"));
}
