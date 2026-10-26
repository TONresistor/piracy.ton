tolk 1.5

import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/fees"
import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test donations stay in factory and child during publish retry and update`() {
    val (registry, uploader, donor) = setupRegistry();
    net.send(
        donor.address,
        createMessage({ bounce: BounceMode.NoBounce, dest: registry.address, value: grams("2") }),
    );
    val factoryBefore = registry.getBalance();
    val (child, result) = publish(registry, uploader.address);
    expect(result).toHaveAllSuccessfulTxs();
    expect(registry.getBalance()).toBeGreaterOrEqual(factoryBefore - grams("0.00001"));
    net.send(
        donor.address,
        createMessage({ bounce: BounceMode.NoBounce, dest: child.address, value: grams("2") }),
    );
    val childBefore = child.getBalance();
    val (_, retry) = publish(registry, uploader.address);
    expect(retry).toHaveAllSuccessfulTxs();
    expect(update(child, uploader.address, 0, presentation("changed"))).toHaveAllSuccessfulTxs();
    expect(child.getBalance()).toBeGreaterOrEqual(childBefore - grams("0.00001"));
}

get fun `test large overpayment refunded from child and reserve funded for five years`() {
    val (registry, uploader, _) = setupRegistry();
    val result = registry.sendPublish(
        uploader.address,
        1,
        1,
        presentation(),
        { value: grams("2") },
    );
    val child = BagItem.fromAddress(registry.getPublicationAddress(uploader.address, 1));
    expect(result).toHaveAllSuccessfulTxs();
    expect(result).toHaveTx({ from: child.address, to: uploader.address, success: true });
    val quote = child.getFunding(presentation());
    expect(child.getBalance()).toBeGreaterOrEqual(quote.storageReserve);
    expect(child.getBalance()).toBeLess(quote.storageReserve + grams("0.001"));
    expect(netAttachedCost(result, grams("2"), uploader.address)).toBeLess(grams("0.1"));
    val actualRent = testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!;
    expect(quote.storageReserve).toBeGreaterOrEqual(actualRent);
    testing.setNow(testing.getNow() + STORAGE_SECONDS);
    expect(
        update(child, uploader.address, 0, presentation("after five years")),
    ).toHaveAllSuccessfulTxs();
    expect(child.getPublication().revision).toEqual(1);
}

get fun `test underfunded update cannot spend prior publication funds`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val quote = child.getFunding(presentation("changed"));
    val result = child.sendUpdatePublication(
        uploader.address,
        1,
        0,
        presentation("changed"),
        { value: quote.minimumValue - 1 },
    );
    expect(result).toHaveFailedTx({ to: child.address, exitCode: 256 });
    expect(child.getPublication().revision).toEqual(0);
}

get fun `test measure empty and maximum title lifecycle fees`() {
    val (registry, uploader, _) = setupRegistry();
    var i = 0;
    while (i < 2) {
        val title = i == 0 ? "" : titleBytes(256);
        val fields = presentation(title);
        val quote = registry.getPublishFunding(uploader.address, i + 1, fields);
        val (child, result) = publish(registry, uploader.address, i + 1, fields);
        expect(result).toHaveAllSuccessfulTxs();
        val debit = netAttachedCost(result, quote.minimumValue, uploader.address);
        println(
            "title_case={} create_quote={:gram} net_debit={:gram} reserve={:gram}",
            i,
            quote.minimumValue,
            debit,
            child.getFunding(fields).storageReserve,
        );
        println(
            "factory_gas={} child_gas={}",
            result.getUsedGas<Publish>({ to: registry.address }),
            result.getUsedGas<InitializePublication>({ to: child.address }),
        );
        expect(result.getUsedGas<Publish>({ to: registry.address })).toBeLess(REGISTRY_GAS_BUDGET);
        expect(result.getUsedGas<InitializePublication>({ to: child.address })).toBeLess(
            ITEM_GAS_BUDGET,
        );
        val change = presentation(title, "custom-category1", false);
        val updateQuote = child.getFunding(change);
        val changed = update(child, uploader.address, 0, change);
        expect(changed).toHaveAllSuccessfulTxs();
        println(
            "title_case={} update_net_debit={:gram} child_gas={} storage_5y={:gram}",
            i,
            netAttachedCost(changed, updateQuote.minimumValue, uploader.address),
            changed.getUsedGas<UpdatePublication>({ to: child.address }),
            testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!,
        );
        expect(changed.getUsedGas<UpdatePublication>({ to: child.address })).toBeLess(
            ITEM_GAS_BUDGET,
        );
        i += 1;
    }
}
