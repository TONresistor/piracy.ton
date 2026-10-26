import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"

import "@contracts/events"
import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test uninitialized item reports not initialized`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, res) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.05"));
    expect(res).toHaveAllSuccessfulTxs();

    val data = child.getBagData();
    expect(data.isInitialized).toBeFalse();
    expect(data.isActive).toBeFalse();
}

get fun `test uninitialized getters return zero and none sentinels`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 3, registry.address, ton("0.05"));

    val data = child.getBagData();
    expect(data.bagIndex).toEqual(3);
    expect(data.registryAddress).toEqual(registry.address);
    expect(data.bagId).toEqual(0);
    expect(data.category).toEqual(0);
    expect(data.timestamp).toEqual(0);
    expect(data.uploaderAddress).toNotEqual(registry.address);
}

get fun `test uninitialized storage metadata is empty sentinels`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.05"));

    val m = child.getStorageMetadata();
    expect(m.isInitialized).toBeFalse();
    expect(m.bagSize).toEqual(0);
    expect(m.filesCount).toEqual(0);
    expect(m.pieceSize).toEqual(0);
    expect(m.merkleHash).toEqual(0);
}

get fun `test uninitialized item is not active`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.05"));
    expect(child.isActive()).toBeFalse();
}

get fun `test uninitialized static data still valid`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 7, registry.address, ton("0.05"));
    val s = child.getStaticData();
    expect(s.bagIndex).toEqual(7);
    expect(s.registryAddress).toEqual(registry.address);
}

get fun `test item becomes initialized after registry addbag`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0xFEED, 2, ton("0.2"));

    val child = BagItem.fromAddress(registry.getBagAddress(0));
    val data = child.getBagData();
    expect(data.isInitialized).toBeTrue();
    expect(data.isActive).toBeTrue();
    expect(data.bagId).toEqual(0xFEED);
    expect(data.category).toEqual(2);
    expect(data.uploaderAddress).toEqual(uploader.address);
}

get fun `test init from non registry fails with 270`() {
    val (registry, deployer, stranger) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.1"));

    val initBody = buildInitParamsBody(0x1234, 1, stranger.address, 1000);
    val res = child.sendAny(stranger.address, initBody, { value: ton("0.1") });

    expect(res).toHaveFailedTx({
        from: stranger.address,
        to: child.address,
        exitCode: ERR_NOT_FROM_REGISTRY,
    });
    expect(child.getBagData().isInitialized).toBeFalse();
}

get fun `test init from registry address succeeds`() {
    val (registry, deployer, _) = setupRegistry();
    val (child, _) = deployUninitBagItem(deployer.address, 0, registry.address, ton("0.1"));

    val initBody = buildInitParamsBody(0xC0DE, 3, deployer.address, 2000);
    val res = net.send(
        registry.address,
        createMessage({ bounce: false, value: ton("0.1"), dest: child.address, body: initBody }),
    );
    expect(res).toHaveAllSuccessfulTxs();

    val data = child.getBagData();
    expect(data.isInitialized).toBeTrue();
    expect(data.bagId).toEqual(0xC0DE);
    expect(data.uploaderAddress).toEqual(deployer.address);
}

get fun `test unknown opcode to initialized item fails with 0xFFFF`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val body = beginCell().storeUint(0xBADC0DE5, 32).endCell();
    val res = child.sendAny(uploader.address, body, { value: ton("0.1") });

    expect(res).toHaveFailedTx({
        from: uploader.address,
        to: child.address,
        exitCode: ERR_UNKNOWN_OPCODE,
    });
}

get fun `test uploader can deactivate the bag`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));
    expect(child.isActive()).toBeTrue();

    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.1") });
    expect(res).toHaveAllSuccessfulTxs();

    expect(child.isActive()).toBeFalse();
    expect(child.getBagData().isActive).toBeFalse();
}

get fun `test deactivation emits BagRemovedEvent`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.1") });

    expect(res).toEmitExternalMessage<BagRemovedEvent>();
    val event = res.findExternalOutMessage<BagRemovedEvent>({ from: child.address });
    expect(event).toBeNotNull();
    val body = event!.loadBody();
    expect(body.bagIndex).toEqual(0);
    expect(body.removedBy).toEqual(uploader.address);
}

get fun `test non uploader cannot deactivate fails with 271`() {
    val (registry, uploader, stranger) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val res = child.sendDeactivateBag(stranger.address, { value: ton("0.1") });

    expect(res).toHaveFailedTx<DeactivateBag>({
        from: stranger.address,
        to: child.address,
        exitCode: ERR_NOT_FROM_UPLOADER,
    });
    expect(child.isActive()).toBeTrue();
}

get fun `test deactivation does not emit event on failure`() {
    val (registry, uploader, stranger) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val res = child.sendDeactivateBag(stranger.address, { value: ton("0.1") });
    val event = res.findExternalOutMessage<BagRemovedEvent>({ from: child.address });
    expect(event).toBeNull();
}

get fun `test deactivation refunds residual to uploader`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val before = testing.getAccountBalance(uploader.address);
    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    expect(res).toHaveAllSuccessfulTxs();

    val after = testing.getAccountBalance(uploader.address);
    val netCost = before - after;
    expect(netCost).toBeLess(ton("0.02"));
}

get fun `test deactivated child balance shrinks to rent floor`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val childAddr = registry.getBagAddress(0);

    val balBefore = testing.getAccountBalance(childAddr);
    expect(balBefore).toBeGreaterOrEqual(ton("0.04"));

    val child = BagItem.fromAddress(childAddr);
    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    expect(res).toHaveAllSuccessfulTxs();

    val balAfter = testing.getAccountBalance(childAddr);
    expect(balAfter).toBeLessOrEqual(ton("0.01"));
}

get fun `test deactivated child remains queryable on chain`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x42, 2, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    expect(res).toHaveAllSuccessfulTxs();

    val data = child.getBagData();
    expect(data.isInitialized).toBeTrue();
    expect(data.isActive).toBeFalse();
    expect(data.bagId).toEqual(0x42);
    expect(data.uploaderAddress).toEqual(uploader.address);
}

get fun `test deactivation produces refund tx from child to uploader`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x33, 0, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val res = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });

    expect(res).toHaveTx({
        from: child.address,
        to: uploader.address,
        success: true,
    });
}

get fun `test second deactivation on inactive bag fails with 272`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val first = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    expect(first).toHaveAllSuccessfulTxs();
    expect(child.isActive()).toBeFalse();

    val recharge = createMessage({ bounce: false, value: ton("0.1"), dest: child.address });
    net.send(uploader.address, recharge);

    val second = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    expect(second).toHaveFailedTx<DeactivateBag>({
        from: uploader.address,
        to: child.address,
        exitCode: ERR_ALREADY_INACTIVE,
    });
}

get fun `test second deactivation emits no duplicate event`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    val recharge = createMessage({ bounce: false, value: ton("0.1"), dest: child.address });
    net.send(uploader.address, recharge);

    val second = child.sendDeactivateBag(uploader.address, { value: ton("0.05") });
    val event = second.findExternalOutMessage<BagRemovedEvent>({ from: child.address });
    expect(event).toBeNull();
}

get fun `test storage metadata round trips all fields`() {
    val (registry, uploader, _) = setupRegistry();
    addBag(registry, uploader.address, 0x1, 1, ton("0.2"));
    val child = BagItem.fromAddress(registry.getBagAddress(0));

    val m = child.getStorageMetadata();
    val expected = sampleMetadata();

    expect(m.isInitialized).toBeTrue();
    expect(m.bagSize).toEqual(expected.bagSize);
    expect(m.filesCount).toEqual(expected.filesCount);
    expect(m.pieceSize).toEqual(expected.pieceSize);
    expect(m.merkleHash).toEqual(expected.merkleHash);
    expect(m.description.hash()).toEqual(expected.description.hash());
    expect(m.files.hash()).toEqual(expected.files.hash());
    expect(m.dirName.hash()).toEqual(expected.dirName.hash());
}
