tolk 1.5

import "@acton/build"
import "@acton/io"
import "@acton/emulation/config"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@acton/types/transaction"

import "@contracts/events"
import "@contracts/fees"
import "@contracts/messages"
import "@contracts/storage"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test pending duplicate creations confirm once and first child initialization wins`() {
    val (registry, uploader, _) = setupRegistry();
    val quote = registry.getPublishFunding(uploader.address, 1, presentation("second"));
    val first = testing.createTraceIterationCursor(
        uploader.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            dest: registry.address,
            value: quote.minimumValue,
            body: Publish {
                queryId: 1,
                bagId: 1,
                presentation: presentation("first").toCell(),
            },
        }),
    );
    expect(first.executeTill<Publish>({ to: registry.address })).toHaveAllSuccessfulTxs();
    val (_, second) = publish(registry, uploader.address, 1, presentation("second"));
    expect(second).toHaveAllSuccessfulTxs();
    val child = BagItem.fromAddress(registry.getPublicationAddress(uploader.address, 1));
    expect(
        second.findExternalOutMessage<PublicationCreated>({ from: child.address }),
    ).toBeNotNull();
    val rest = first.executeAllRemaining();
    expect(rest).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().title).toEqual("second");
    expect(rest.findExternalOutMessage<PublicationCreated>({ from: child.address })).toBeNull();
}

get fun `test competing revisions apply once regardless of submitted order`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val quote = child.getFunding(presentation("pending"));
    val pending = testing.createTraceIterationCursor(
        uploader.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            dest: child.address,
            value: quote.minimumValue,
            body: UpdatePublication {
                queryId: 11,
                expectedRevision: 0,
                presentation: presentation("pending").toCell(),
            },
        }),
    );
    expect(
        update(child, uploader.address, 0, presentation("executed first")),
    ).toHaveAllSuccessfulTxs();
    expect(pending.executeAllRemaining()).toHaveFailedTx({ to: child.address, exitCode: 273 });
    expect(child.getPublication().revision).toEqual(1);
    expect(child.getPublication().presentation.load().title).toEqual("executed first");
}

get fun `test four publishers each publish eight bags with independent state and constant factory storage`() {
    val (registry, owner, other) = setupRegistry();
    val users = [
        owner.address,
        other.address,
        testing.treasury("publisher three").address,
        testing.treasury("publisher four").address,
    ];
    val originalData = testing.getAccountState(registry.address)!.storage.state;
    var seen: map<address, bool> = [];
    var count = 0;
    var u = 0;
    while (u < 4) {
        var bag = 1;
        while (bag <= 8) {
            val (child, result) = publish(registry, users.get(u), bag as uint256);
            expect(result).toHaveAllSuccessfulTxs();
            expect(seen.exists(child.address)).toBeFalse();
            seen.set(child.address, true);
            expect(
                update(
                    child,
                    users.get(u),
                    0,
                    presentation("classified", categoryText(bag as uint256, 8), bag % 2 == 0),
                ),
            ).toHaveAllSuccessfulTxs();
            expect(child.getPublication().uploader).toEqual(users.get(u));
            expect(child.getPublication().revision).toEqual(1);
            count += 1;
            bag += 1;
        }
        u += 1;
    }
    expect(count).toEqual(32);
    expect(testing.getAccountState(registry.address)!.storage.state.toCell().hash()).toEqual(
        originalData.toCell().hash(),
    );
}

get fun `test larger title replenishes reserve and shrinking never withdraws old funds`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    expect(
        update(child, uploader.address, 0, presentation(titleBytes(256))),
    ).toHaveAllSuccessfulTxs();
    val balance = child.getBalance();
    expect(balance).toBeGreaterOrEqual(
        testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!,
    );
    expect(update(child, uploader.address, 1, presentation())).toHaveAllSuccessfulTxs();
    expect(child.getBalance()).toBeGreaterOrEqual(balance - grams("0.00001"));
}

get fun `test storage price increases and aged account quotes remain sufficient`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val old = child.getFunding(presentation(titleBytes(256)));
    var config = testing.getConfig();
    // Replace the active schedule, not its historical timestamp-0 entry.
    // This also keeps the emulator's outside-contract fee helpers on the same rates.
    var active = config.getStoragePrices().findKeyLessOrEqual(testing.getNow()).loadValue();
    active.initialUnixTime = 0;
    active.bitPrice *= 3;
    active.cellPrice *= 3;
    var prices: StoragePricesDict = [];
    prices.setInitial(active);
    config.setStoragePrices(prices);
    expect(testing.setConfig(config)).toBeTrue();
    testing.setNow(testing.getNow() + STORAGE_SECONDS / 2);
    val refreshed = child.getFunding(presentation(titleBytes(256)));
    println(
        "old reserve={:gram}, new reserve={:gram}, new value={:gram}, actual rent={:gram}",
        old.storageReserve,
        refreshed.storageReserve,
        refreshed.minimumValue,
        testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!,
    );
    expect(refreshed.minimumValue).toBeGreater(old.minimumValue);
    expect(
        update(child, uploader.address, 0, presentation(titleBytes(256))),
    ).toHaveAllSuccessfulTxs();
    expect(child.getBalance()).toBeGreaterOrEqual(
        testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!,
    );
}

get fun `test retry underfunding and revision exhaustion are explicit failures`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val quote = child.getFunding(presentation());
    expect(
        child.sendInitializePublication(
            registry.address,
            1,
            uploader.address,
            1,
            presentation(),
            { value: quote.executionBudget - 1 },
        ),
    ).toHaveFailedTx({ to: child.address, exitCode: 256 });
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    val exhausted = BagItem.fromStorage({ identity: identity.toCell(), content: PublicationContent {
            createdAt: testing.getNow(),
            revision: 0xFFFFFFFFFFFFFFFF,
            presentation: presentation().toCell(),
        }.toCell() });
    exhausted.deploy(uploader.address, { value: grams("0.1") });
    expect(
        update(exhausted, uploader.address, 0xFFFFFFFFFFFFFFFF, presentation("overflow")),
    ).toHaveFailedTx({ to: exhausted.address, exitCode: 275 });
    expect(exhausted.getPublication().revision).toEqual(0xFFFFFFFFFFFFFFFF);
}

get fun `test zero bag address getter is rejected`() {
    val (registry, uploader, _) = setupRegistry();
    val result = net.runGetMethodExt<address>(
        registry.address,
        "get_publication_address",
        [uploader.address, 0],
    );
    expect(result.meta.exitCode).toEqual(257);
}

get fun `test empty trailing title cell is rejected`() {
    val (registry, uploader, _) = setupRegistry();
    val full = titleBytes(127) as unknown as cell;
    val invalid = beginCell()
        .storeSlice(full.beginParse())
        .storeRef(beginCell().endCell())
        .endCell() as unknown as string;
    expect(
        registry.sendPublish(uploader.address, 1, 1, presentation(invalid)),
    ).toHaveFailedTx({ to: registry.address, exitCode: 259 });
}

get fun `test direct initialization and retry accept exact minimum funding`() {
    val (registry, uploader, stranger) = setupRegistry();
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    val child = BagItem.fromStorage({ identity: identity.toCell(), content: null });
    child.deploy(stranger.address, { value: grams("0.001") });
    val initial = child.getPublication();
    expect(initial.initialized).toBeFalse();
    expect(initial.createdAt).toEqual(0);
    expect(initial.revision).toEqual(0);
    expect(initial.presentation.load().visible).toBeFalse();
    expect(initial.presentation.load().title).toEqual("");
    expect(initial.presentation.load().category).toEqual("");
    val quote = child.getFunding(presentation());
    expect(
        child.sendInitializePublication(
            registry.address,
            1,
            uploader.address,
            1,
            presentation(),
            { value: quote.minimumValue },
        ),
    ).toHaveAllSuccessfulTxs();
    val retryQuote = child.getFunding(presentation());
    expect(
        child.sendInitializePublication(
            registry.address,
            2,
            uploader.address,
            1,
            presentation("ignored"),
            { value: retryQuote.executionBudget },
        ),
    ).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().title).toEqual("");
    expect(child.getPublication().revision).toEqual(0);
}

get fun `test nonzero bit storage prices are included in creation reserves`() {
    var config = testing.getConfig();
    var active = config.getStoragePrices().findKeyLessOrEqual(testing.getNow()).loadValue();
    active.initialUnixTime = 0;
    active.bitPrice = 1;
    active.cellPrice *= 2;
    var prices: StoragePricesDict = [];
    prices.setInitial(active);
    config.setStoragePrices(prices);
    expect(testing.setConfig(config)).toBeTrue();
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(registry, uploader.address, 1, presentation(titleBytes(256)));
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.getFunding(presentation(titleBytes(256))).storageReserve).toBeGreaterOrEqual(
        testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!,
    );
    expect(
        registry
            .getPublishFunding(uploader.address, 1, presentation(titleBytes(256)))
            .storageReserve,
    ).toBeGreaterOrEqual(testing.getAccountStorageFee(child.address, STORAGE_SECONDS)!);
}

get fun `test depleted factory quotes include its own reserve without double charging`() {
    val uploader = testing.treasury("low balance publisher");
    val registry = BagRegistry.fromStorage({ version: 3 });
    expect(registry.deploy(uploader.address, { value: grams("0.001") })).toHaveAllSuccessfulTxs();
    val before = registry.getPublishFunding(uploader.address, 1, presentation());
    expect(before.minimumValue).toEqual(before.storageReserve + before.executionBudget);
    val priorBalance = registry.getBalance();
    testing.topUp(registry.address, grams("0.001"));
    val received = registry.getBalance() - priorBalance;
    val topped = registry.getPublishFunding(uploader.address, 1, presentation());
    expect(before.minimumValue - topped.minimumValue).toEqual(received);
    expect(before.executionBudget - topped.executionBudget).toEqual(received);
    expect(topped.minimumValue).toEqual(topped.storageReserve + topped.executionBudget);
    val (_, result) = publish(registry, uploader.address);
    expect(result).toHaveAllSuccessfulTxs();
    expect(registry.getBalance()).toBeGreaterOrEqual(
        testing.getAccountStorageFee(registry.address, STORAGE_SECONDS)!,
    );
}

get fun `test cold publish initializes accurate constant caches and warm publish uses less gas`() {
    val uploader = testing.treasury("cold publisher");
    val registry = BagRegistry.fromStorage({ version: 3 });
    val cold = net.send(
        uploader.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            dest: { stateInit: registry.stateInit! },
            value: grams("0.1"),
            body: Publish {
                queryId: 1,
                bagId: 1,
                presentation: presentation().toCell(),
            },
        }),
    );
    expect(cold).toHaveAllSuccessfulTxs();
    val child = BagItem.fromAddress(registry.getPublicationAddress(uploader.address, 1));
    expect(child.getPublication().initialized).toBeTrue();
    val rootState = testing.getAccountState(registry.address)!.storage.state;
    if (rootState is TlbAccountStateActive) {
        val cache = BagRegistryStorage.fromCell(rootState.stateInit.data!).footprint!;
        val (rootCells, rootBits, _) = build("BagRegistry").calculateSizeStrict(2048);
        val (itemCells, itemBits, _) = build("BagItem").calculateSizeStrict(2048);
        expect(cache.ownCode.cells).toEqual(rootCells);
        expect(cache.ownCode.bits).toEqual(rootBits);
        expect(cache.itemCode.cells).toEqual(itemCells);
        expect(cache.itemCode.bits).toEqual(itemBits);
        val childState = testing.getAccountState(child.address)!.storage.state;
        assert (childState is TlbAccountStateActive) throw 9;
        val childCache = BagItemStorage.fromCell(childState.stateInit.data!).codeFootprint!;
        expect(childCache.cells).toEqual(itemCells);
        expect(childCache.bits).toEqual(itemBits);
    } else {
        throw 9;
    }
    val (_, warm) = publish(registry, uploader.address, 2);
    expect(warm).toHaveAllSuccessfulTxs();
    expect(warm.getUsedGas<Publish>({ to: registry.address })).toBeLess(
        cold.getUsedGas<Publish>({ to: registry.address }),
    );
    // Fixed empty-title/other fixture: a warm publication must not walk either code graph.
    expect(warm.getUsedGas<Publish>({ to: registry.address })).toBeLess(16000);
    expect(testing.getAccountState(registry.address)!.storage.state.toCell().hash()).toEqual(
        rootState.toCell().hash(),
    );
}
