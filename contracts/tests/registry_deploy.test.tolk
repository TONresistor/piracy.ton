import "@acton/emulation/network"
import "@acton/testing/expect"
import "@acton/types/message"

import "@contracts/errors"
import "@contracts/events"
import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test fresh registry has total zero`() {
    val (registry, _, _) = setupRegistry();
    expect(registry.getTotal()).toEqual(0);
}

get fun `test fresh registry exposes embedded item code`() {
    val (registry, _, _) = setupRegistry();
    val code = registry.getItemCode();
    expect(code.beginParse().remainingRefsCount()).toBeGreaterOrEqual(0);
}

get fun `test addbag with sufficient value fully succeeds`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0xABCDEF, 3, ton("0.2"));

    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toHaveSuccessfulTx<AddBag>({
        from: uploader.address,
        to: registry.address,
    });
    expect(registry.getTotal()).toEqual(1);
}

get fun `test addbag emits BagIndexedEvent`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0x1111, 1, ton("0.2"));

    expect(res).toEmitExternalMessage<BagIndexedEvent>();

    val event = res.findExternalOutMessage<BagIndexedEvent>({ from: registry.address });
    expect(event).toBeNotNull();

    val body = event!.loadBody();
    expect(body.bagIndex).toEqual(0);
    expect(body.bagId).toEqual(0x1111);
    expect(body.category).toEqual(1);
    expect(body.uploader).toEqual(uploader.address);
    expect(body.timestamp).toBeGreater(0);
    expect(body.name.hash()).toEqual(textCell(0xBABE).hash());
}

get fun `test successive addbag allocate contiguous indices`() {
    val (registry, uploader, _) = setupRegistry();

    addBag(registry, uploader.address, 0x100, 0, ton("0.2"));
    expect(registry.getTotal()).toEqual(1);

    addBag(registry, uploader.address, 0x200, 1, ton("0.2"));
    expect(registry.getTotal()).toEqual(2);

    addBag(registry, uploader.address, 0x300, 2, ton("0.2"));
    expect(registry.getTotal()).toEqual(3);

    val item0 = BagItem.fromAddress(registry.getBagAddress(0));
    val item1 = BagItem.fromAddress(registry.getBagAddress(1));
    val item2 = BagItem.fromAddress(registry.getBagAddress(2));
    expect(item0.getStaticData().bagIndex).toEqual(0);
    expect(item1.getStaticData().bagIndex).toEqual(1);
    expect(item2.getStaticData().bagIndex).toEqual(2);
}

get fun `test index never decreases across many addbag`() {
    val (registry, uploader, _) = setupRegistry();
    var prev = registry.getTotal();
    var i = 0;
    while (i < 6) {
        addBag(registry, uploader.address, 0x1000 + i, (i % 6) as uint8, ton("0.2"));
        val now = registry.getTotal();
        expect(now).toEqual(prev + 1);
        prev = now;
        i += 1;
    }
    expect(registry.getTotal()).toEqual(6);
}

get fun `test get_bag_address valid index returns child address`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x55, 2, ton("0.2"));

    val addr = registry.getBagAddress(0);
    val item = BagItem.fromAddress(addr);
    expect(item.getStaticData().bagIndex).toEqual(0);
}

@test.fail_with(260)
get fun `test get_bag_address out of range fails with 260`() {
    val (registry, _, _) = setupRegistry();
    var aborted = false;
    try {
        registry.getBagAddress(0);
    } catch {
        aborted = true;
    }
    assert (!aborted) throw BagError.IndexOutOfRange;
}

@test.fail_with(260)
get fun `test get_bag_address negative index fails with 260`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x77, 1, ton("0.2"));
    var aborted = false;
    try {
        registry.getBagAddress(-1);
    } catch {
        aborted = true;
    }
    assert (!aborted) throw BagError.IndexOutOfRange;
}

@test.fail_with(260)
get fun `test get_bag_address index equal to total fails with 260`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x88, 1, ton("0.2"));
    var aborted = false;
    try {
        registry.getBagAddress(1);
    } catch {
        aborted = true;
    }
    assert (!aborted) throw BagError.IndexOutOfRange;
}
