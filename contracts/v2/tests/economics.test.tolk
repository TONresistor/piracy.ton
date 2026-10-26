import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test registry balance stays near reserve after one addbag`() {
    val (registry, uploader, _) = setupRegistry();

    addBag(registry, uploader.address, 0x1, 0, ton("0.2"));

    val bal = testing.getAccountBalance(registry.address);
    expect(bal).toBeLessOrEqual(T_MIN_REGISTRY_BALANCE + ton("0.01"));
    expect(bal).toBeGreaterOrEqual(T_MIN_REGISTRY_BALANCE - ton("0.01"));
}

get fun `test registry balance does not grow over five addbag`() {
    val (registry, uploader, _) = setupRegistry();

    addBag(registry, uploader.address, 0x1, 0, ton("0.2"));
    val afterFirst = testing.getAccountBalance(registry.address);

    var i = 0;
    while (i < 5) {
        addBag(registry, uploader.address, 0x100 + i, 1, ton("0.2"));
        i += 1;
    }
    val afterSix = testing.getAccountBalance(registry.address);

    expect(afterSix).toBeLessOrEqual(afterFirst + ton("0.01"));
    expect(afterSix).toBeGreaterOrEqual(T_MIN_REGISTRY_BALANCE - ton("0.01"));
}

get fun `test get_balance getter is callable and returns a sane int`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x7, 1, ton("0.2"));

    expect(registry.getBalance()).toBeGreaterOrEqual(0);
}

get fun `test registry does not pocket large overpayment`() {
    val (registry, uploader, _) = setupRegistry();

    addBag(registry, uploader.address, 0x9, 2, ton("2"));

    val bal = testing.getAccountBalance(registry.address);
    expect(bal).toBeLessOrEqual(T_MIN_REGISTRY_BALANCE + ton("0.01"));
}

get fun `test uploader is refunded the overpayment surplus`() {
    val (registry, uploader, _) = setupRegistry();

    val before = testing.getAccountBalance(uploader.address);
    addBag(registry, uploader.address, 0xAA, 1, ton("1"));
    val after = testing.getAccountBalance(uploader.address);

    val netCost = before - after;
    expect(netCost).toBeLess(ton("0.2"));
}

get fun `test overpaying uploader keeps almost all the value`() {
    val (registry, uploader, _) = setupRegistry();

    val before = testing.getAccountBalance(uploader.address);
    addBag(registry, uploader.address, 0xA1, 1, ton("3"));
    val after = testing.getAccountBalance(uploader.address);

    expect(after).toBeGreater(before - ton("0.3"));
}

get fun `test addbag produces an empty-body refund to the uploader`() {
    val (registry, uploader, _) = setupRegistry();

    val res = addBag(registry, uploader.address, 0xBB, 1, ton("1"));

    expect(res).toHaveTx({
        from: registry.address,
        to: uploader.address,
        success: true,
    });
}

get fun `test deployed child holds resident balance near reserve`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0xCC, 2, ton("0.2"));

    val childAddr = registry.getBagAddress(0);
    val childBal = testing.getAccountBalance(childAddr);

    expect(childBal).toBeGreaterOrEqual(ton("0.04"));
    expect(childBal).toBeLessOrEqual(T_ITEM_FUNDING + ton("0.01"));
}

get fun `test empty body top up to registry succeeds and raises balance`() {
    val (registry, _, donor) = setupRegistry();

    val before = testing.getAccountBalance(registry.address);
    val topUp = createMessage({ bounce: false, value: ton("0.3"), dest: registry.address });
    val res = net.send(donor.address, topUp);

    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toNotHaveTx({ bounced: true });

    val after = testing.getAccountBalance(registry.address);
    expect(after).toBeGreater(before);
}

get fun `test empty body top up to initialized child succeeds`() {
    val (registry, uploader, donor) = setupRegistry();
    addBag(registry, uploader.address, 0xDD, 1, ton("0.2"));
    val childAddr = registry.getBagAddress(0);

    val before = testing.getAccountBalance(childAddr);
    val topUp = createMessage({ bounce: false, value: ton("0.5"), dest: childAddr });
    val res = net.send(donor.address, topUp);

    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toNotHaveTx({ bounced: true });

    val after = testing.getAccountBalance(childAddr);
    expect(after).toBeGreater(before);
}

get fun `test empty body top up to uninitialized child succeeds`() {
    val (registry, deployer, donor) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.05"));

    val before = testing.getAccountBalance(child.address);
    val topUp = createMessage({ bounce: false, value: ton("0.2"), dest: child.address });
    val res = net.send(donor.address, topUp);

    expect(res).toHaveAllSuccessfulTxs();
    val after = testing.getAccountBalance(child.address);
    expect(after).toBeGreater(before);
}
