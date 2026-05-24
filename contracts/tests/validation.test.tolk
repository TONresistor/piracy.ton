import "@acton/emulation/network"
import "@acton/testing/expect"

import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagRegistry.gen"

get fun `test addbag below minimum value fails with 256`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0x1, 1, ton("0.05"));

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_INSUFFICIENT_VALUE,
    });
}

get fun `test under payment allocates no index`() {
    val (registry, uploader, _) = setupRegistry();
    expect(registry.getTotal()).toEqual(0);

    addBag(registry, uploader.address, 0x1, 1, ton("0.05"));

    expect(registry.getTotal()).toEqual(0);
}

get fun `test under payment deploys no child`() {
    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0x1, 1, ton("0.09"));

    expect(res).toNotHaveTx({ deploy: true });
}

get fun `test addbag at exactly minimum value succeeds`() {
    val (registry, uploader, _) = setupRegistry();
    val res = addBag(registry, uploader.address, 0x1, 1, T_MIN_ADD_BAG_VALUE);
    expect(res).toHaveAllSuccessfulTxs();
    expect(registry.getTotal()).toEqual(1);
}

get fun `test addbag with zero bagId fails with 257`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0, 1, ton("0.2"));

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_INVALID_BAG_ID,
    });
    expect(registry.getTotal()).toEqual(0);
}

get fun `test addbag with category above five fails with 258`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0x1, 6, ton("0.2"));

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_INVALID_CATEGORY,
    });
    expect(registry.getTotal()).toEqual(0);
}

get fun `test addbag accepts every category in range`() {
    val (registry, uploader, _) = setupRegistry();
    var cat = 0;
    while (cat <= 5) {
        val res = addBag(registry, uploader.address, 0x500 + cat, cat as uint8, ton("0.2"));
        expect(res).toHaveAllSuccessfulTxs();
        cat += 1;
    }
    expect(registry.getTotal()).toEqual(6);
}

get fun `test addbag with oversized metadata fails with 259`() {
    val (registry, uploader, _) = setupRegistry();

    val res = registry.sendAddBag(
        uploader.address,
        0x1,
        1,
        textCell(0xBABE),
        oversizedMetadata(),
        { value: ton("0.2") },
    );

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_METADATA_TOO_LARGE,
    });
    expect(registry.getTotal()).toEqual(0);
}

get fun `test addbag with oversized name cell fails with 259`() {
    val (registry, uploader, _) = setupRegistry();

    val res = registry.sendAddBag(
        uploader.address,
        0x1,
        1,
        deepCell(400),
        sampleMetadata(),
        { value: ton("0.2") },
    );

    expect(res).toHaveFailedTx<AddBag>({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_METADATA_TOO_LARGE,
    });
}

get fun `test addbag with oversized metadata deploys no child`() {
    val (registry, uploader, _) = setupRegistry();
    val res = registry.sendAddBag(
        uploader.address,
        0x1,
        1,
        textCell(0xBABE),
        oversizedMetadata(),
        { value: ton("0.2") },
    );
    expect(res).toNotHaveTx({ deploy: true });
}

get fun `test unknown opcode to registry fails with 0xFFFF`() {
    val (registry, uploader, _) = setupRegistry();

    val body = beginCell().storeUint(0xDEADBEEF, 32).endCell();
    val res = registry.sendAny(uploader.address, body, { value: ton("0.2") });

    expect(res).toHaveFailedTx({
        from: uploader.address,
        to: registry.address,
        exitCode: ERR_UNKNOWN_OPCODE,
    });
}

get fun `test short non-empty body to registry is not accepted`() {
    val (registry, uploader, _) = setupRegistry();

    val body = beginCell().storeUint(0x7, 8).endCell();
    val res = registry.sendAny(uploader.address, body, { value: ton("0.2") });

    expect(res).toNotHaveTx({
        from: uploader.address,
        to: registry.address,
        success: true,
    });
    expect(registry.getTotal()).toEqual(0);
}
