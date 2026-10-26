import "@acton/emulation/network"
import "@acton/testing/expect"

import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagRegistry.gen"

fun chainN(n: int): cell {
    var c = beginCell().endCell();
    var i = 1;
    while (i < n) {
        c = beginCell().storeRef(c).endCell();
        i += 1;
    }
    return c;
}

fun fillBits(b: builder, bits: int): builder {
    var rem = bits;
    var bb = b;
    while (rem > 0) {
        val chunk = rem > 256 ? 256 : rem;
        bb = bb.storeUint(0, chunk);
        rem -= chunk;
    }
    return bb;
}

fun chainNBits(n: int, bitsPer: int): cell {
    var cur = fillBits(beginCell(), bitsPer).endCell();
    var i = 1;
    while (i < n) {
        cur = fillBits(beginCell().storeRef(cur), bitsPer).endCell();
        i += 1;
    }
    return cur;
}

fun cellWithRootRefs(refs: int): cell {
    var b = beginCell();
    var i = 0;
    while (i < refs) {
        b = b.storeRef(beginCell().endCell());
        i += 1;
    }
    return b.endCell();
}

get fun `test name cell at exactly the 256 cell limit is accepted`() {
    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xC0FFEE,
        1,
        chainN(257),
        sampleMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

get fun `test name cell one cell over the 256 limit is rejected 259`() {
    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0xC0FFEE,
        1,
        chainN(258),
        sampleMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_METADATA_TOO_LARGE,
    });
    expect(registry.getTotal()).toEqual(0);
}

get fun `test name cell at exactly the 16384 bit limit is accepted`() {
    val (registry, uploader, _) = setupRegistry();
    val name = chainNBits(64, 256);
    val res = registry.sendAddBag(
        uploader.address,
        0xB175,
        2,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

get fun `test name cell over the bit limit but within cell limit is rejected 259`() {
    val (registry, uploader, _) = setupRegistry();
    val name = chainNBits(18, 1023);
    val res = registry.sendAddBag(
        uploader.address,
        0xB175,
        2,
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
}

get fun `test name cell with exactly four root refs is accepted`() {
    val (registry, uploader, _) = setupRegistry();
    val name = cellWithRootRefs(4);
    val res = registry.sendAddBag(
        uploader.address,
        0x4EF5,
        3,
        name,
        sampleMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

get fun `test name cell with three root refs is accepted`() {
    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0x3EF5,
        3,
        cellWithRootRefs(3),
        sampleMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

get fun `test metadata description at exactly the 256 cell limit is accepted`() {
    val (registry, uploader, _) = setupRegistry();
    val meta: BagMetadata = {
        description: textCell(0xDE5C),
        bagSize: 1,
        filesCount: 1,
        files: chainN(250),
        pieceSize: 1,
        merkleHash: 1,
        dirName: textCell(0xD12E),
    };
    val res = registry.sendAddBag(
        uploader.address,
        0x3E7A,
        1,
        textCell(0xBABE),
        meta,
        { value: ton("0.2") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}
