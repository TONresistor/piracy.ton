tolk 1.5

import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/events"
import "@contracts/messages"
import "@contracts/storage"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test publish at exact quote initializes child and emits confirmation`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(
        registry,
        uploader.address,
        1,
        presentation("title", "custom-category1"),
    );
    expect(result).toHaveAllSuccessfulTxs();
    expect(result).toHaveSuccessfulDeploy({ to: child.address });
    val data = child.getPublication();
    expect(data.initialized).toBeTrue();
    expect(data.uploader).toEqual(uploader.address);
    expect(data.registry).toEqual(registry.address);
    expect(data.bagId).toEqual(1);
    expect(data.createdAt).toBeGreater(0);
    expect(data.revision).toEqual(0);
    expect(data.presentation.load().category).toEqual("custom-category1");
    expect(data.presentation.load().title).toEqual("title");
    expect(
        result.findExternalOutMessage<PublicationCreated>({ from: child.address }),
    ).toBeNotNull();
    expect(registry.getVersion()).toEqual(3);
    expect(child.getVersion()).toEqual(3);
}

get fun `test retry is same address without duplicate event or overwrite`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address, 1, presentation("original", "video"));
    val (retried, result) = publish(
        registry,
        uploader.address,
        1,
        presentation("replacement", "audio"),
    );
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.address).toEqual(retried.address);
    expect(child.getPublication().presentation.load().title).toEqual("original");
    expect(result.findExternalOutMessage<PublicationCreated>({ from: child.address })).toBeNull();
}

get fun `test identities differ by wallet bag and registry and are independently derivable`() {
    val (registry, uploader, stranger) = setupRegistry();
    val (first, _) = publish(registry, uploader.address);
    val (second, _) = publish(registry, stranger.address);
    val (third, _) = publish(registry, uploader.address, 2);
    expect(first.address).toNotEqual(second.address);
    expect(first.address).toNotEqual(third.address);
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    expect(first.address).toEqual(
        publicationAddress(identity, build("BagItem")).calculateAddress(),
    );
    val other = testing.treasury("other registry");
    expect(first.address).toNotEqual(
        publicationAddress(
            {
                registry: other.address,
                uploader: uploader.address,
                bagId: 1,
            },
            build("BagItem"),
        ).calculateAddress(),
    );
}

get fun `test update hide reactivate keep identity and creation time`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val created = child.getPublication().createdAt;
    val changed = update(child, uploader.address, 0, presentation("renamed", "images", false));
    expect(changed).toHaveAllSuccessfulTxs();
    expect(child.getPublication().revision).toEqual(1);
    expect(child.getPublication().presentation.load().visible).toBeFalse();
    expect(
        changed.findExternalOutMessage<PublicationUpdated>({ from: child.address }),
    ).toBeNotNull();
    expect(
        update(child, uploader.address, 1, presentation("renamed", "images", true)),
    ).toHaveAllSuccessfulTxs();
    expect(child.getPublication().revision).toEqual(2);
    expect(child.getPublication().presentation.load().visible).toBeTrue();
    expect(child.getPublication().createdAt).toEqual(created);
}

get fun `test identical update emits no event and does not increment revision`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val result = update(child, uploader.address, 0, presentation());
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.getPublication().revision).toEqual(0);
    expect(result.findExternalOutMessage<PublicationUpdated>({ from: child.address })).toBeNull();
}

get fun `test stranger and stale revision cannot update`() {
    val (registry, uploader, stranger) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    expect(
        update(child, stranger.address, 0, presentation("stolen")),
    ).toHaveFailedTx({ to: child.address, exitCode: 271 });
    expect(
        update(child, uploader.address, 1, presentation("stale")),
    ).toHaveFailedTx({ to: child.address, exitCode: 273 });
    expect(child.getPublication().revision).toEqual(0);
}

get fun `test zero bag and underpayment do not deploy a publication`() {
    val (registry, uploader, _) = setupRegistry();
    expect(
        registry.sendPublish(uploader.address, 1, 0, presentation(), { value: grams("0.1") }),
    ).toHaveFailedTx({ to: registry.address, exitCode: 257 });
    val quote = registry.getPublishFunding(uploader.address, 1, presentation());
    val result = registry.sendPublish(
        uploader.address,
        1,
        1,
        presentation(),
        { value: quote.minimumValue - 1 },
    );
    expect(result).toHaveFailedTx({ to: registry.address, exitCode: 256 });
    expect(result).toNotHaveTx({ deploy: true });
}

get fun `test title maximum succeeds and over maximum fails`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(registry, uploader.address, 1, presentation(titleBytes(256)));
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().title).toEqual(titleBytes(256));
    expect(
        registry.sendPublish(
            uploader.address,
            1,
            2,
            presentation(titleBytes(257)),
            { value: grams("0.2") },
        ),
    ).toHaveFailedTx({ to: registry.address, exitCode: 259 });
}

get fun `test title rejects branches unaligned bits and noncanonical snake`() {
    val (registry, uploader, _) = setupRegistry();
    val bad = beginCell()
        .storeRef(beginCell().endCell())
        .storeRef(beginCell().endCell())
        .endCell() as unknown as string;
    expect(
        registry.sendPublish(uploader.address, 1, 1, presentation(bad), { value: grams("0.2") }),
    ).toHaveFailedTx({ to: registry.address, exitCode: 259 });
    val unaligned = beginCell().storeUint(1, 1).endCell() as unknown as string;
    expect(
        registry.sendPublish(
            uploader.address,
            1,
            1,
            presentation(unaligned),
            { value: grams("0.2") },
        ),
    ).toHaveFailedTx({ to: registry.address, exitCode: 259 });
    val split = beginCell()
        .storeUint(0x61, 8)
        .storeRef(beginCell().storeUint(0x62, 8).endCell())
        .endCell() as unknown as string;
    expect(
        registry.sendPublish(uploader.address, 1, 1, presentation(split), { value: grams("0.2") }),
    ).toHaveFailedTx({ to: registry.address, exitCode: 259 });
}

get fun `test unknown short and trailing messages are rejected`() {
    val (registry, uploader, _) = setupRegistry();
    expect(
        registry.sendAny(uploader.address, beginCell().storeUint(0xDEADBEEF, 32).endCell()),
    ).toHaveFailedTx({ to: registry.address, exitCode: 65535 });
    val trailing: Publish = {
        queryId: 1,
        bagId: 1,
        presentation: presentation().toCell(),
    };
    val extra = beginCell().storeSlice(trailing.toCell().beginParse()).storeUint(1, 1).endCell();
    expect(
        registry.sendAny(uploader.address, extra),
    ).toNotHaveTx({ to: registry.address, success: true });
    val (child, _) = publish(registry, uploader.address);
    expect(
        child.sendAny(uploader.address, beginCell().storeUint(0xDEADBEEF, 32).endCell()),
    ).toHaveFailedTx({ to: child.address, exitCode: 65535 });
    expect(
        registry.sendAny(uploader.address, beginCell().storeUint(1, 8).endCell()),
    ).toNotHaveTx({ to: registry.address, success: true });
}

get fun `test predeployed uninitialized child can only be initialized by registry`() {
    val (registry, uploader, stranger) = setupRegistry();
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    val child = BagItem.fromStorage({ identity: identity.toCell(), content: null });
    expect(child.deploy(stranger.address, { value: grams("0.1") })).toHaveAllSuccessfulTxs();
    expect(child.getPublication().initialized).toBeFalse();
    expect(
        child.sendInitializePublication(stranger.address, 1, uploader.address, 1, presentation()),
    ).toHaveFailedTx({ to: child.address, exitCode: 270 });
    expect(
        update(child, uploader.address, 0, presentation()),
    ).toHaveFailedTx({ to: child.address, exitCode: 272 });
    val (_, result) = publish(registry, uploader.address);
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.getPublication().initialized).toBeTrue();
}

get fun `test direct initialization from registry with wrong identity fails`() {
    val (registry, uploader, stranger) = setupRegistry();
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    val child = BagItem.fromStorage({ identity: identity.toCell(), content: null });
    child.deploy(stranger.address);
    expect(
        child.sendInitializePublication(registry.address, 1, stranger.address, 1, presentation()),
    ).toHaveFailedTx({ to: child.address, exitCode: 274 });
    expect(
        child.sendInitializePublication(registry.address, 1, uploader.address, 2, presentation()),
    ).toHaveFailedTx({ to: child.address, exitCode: 274 });
    expect(child.getPublication().initialized).toBeFalse();
}

get fun `test payload hashes match generated TypeScript serializers`() {
    // Vectors produced by the generated Publish.toCell and UpdatePublication.toCell.
    val fields = presentation("Piracy v3", "video").toCell();
    val publishBody: Publish = {
        queryId: 42,
        bagId: 123,
        presentation: fields,
    };
    val updateBody: UpdatePublication = {
        queryId: 43,
        expectedRevision: 7,
        presentation: fields,
    };
    expect(
        publishBody.toCell().hash(),
    ).toEqual(0x8aa150cc75b733523d7c7a23cee6b4b32502db0ec505571b92bae49a90992ad0);
    expect(
        updateBody.toCell().hash(),
    ).toEqual(0x8b13ec143713512fab42bd029d1a4365f7cc4abc2288489de755b36398be70a5);
}

get fun `test open text categories can be created and changed without a central list`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(registry, uploader.address, 1, presentation("title", "datasets"));
    expect(result).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().category).toEqual("datasets");
    expect(
        update(child, uploader.address, 0, presentation("title", "images")),
    ).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().category).toEqual("images");
    expect(child.getPublication().revision).toEqual(1);
}

get fun `test categories accept one and sixteen ASCII characters`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(registry, uploader.address, 1, presentation("", "a"));
    expect(result).toHaveAllSuccessfulTxs();
    expect(
        update(child, uploader.address, 0, presentation("", "az09-example-123")),
    ).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.load().category).toEqual("az09-example-123");
}

get fun `test empty oversized uppercase accented and punctuation categories are rejected`() {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    val invalid = [
        "",
        "abcdefghijklmnopq",
        "Video",
        "sci fi",
        "vidéo",
        "a_b",
        "a/b",
        "a.b",
    ];
    var i = 0;
    while (i < invalid.size()) {
        val fields = presentation("", invalid.get(i));
        expect(
            registry.sendPublish(uploader.address, 1, 2, fields, { value: grams("0.2") }),
        ).toHaveFailedTx({ to: registry.address, exitCode: 258 });
        expect(
            child.sendUpdatePublication(uploader.address, 1, 0, fields, { value: grams("0.2") }),
        ).toHaveFailedTx({ to: child.address, exitCode: 258 });
        i += 1;
    }
    expect(child.getPublication().revision).toEqual(0);
    expect(child.getPublication().presentation.load().category).toEqual("other");
}

get fun `test category cell rejects partial bytes and references`() {
    val (registry, uploader, _) = setupRegistry();
    val unaligned = beginCell().storeUint(1, 1).endCell() as unknown as string;
    val referenced = beginCell()
        .storeUint(0x61, 8)
        .storeRef(beginCell().storeUint(0x62, 8).endCell())
        .endCell() as unknown as string;
    expect(
        registry.sendPublish(uploader.address, 1, 1, presentation("", unaligned)),
    ).toHaveFailedTx({ to: registry.address, exitCode: 258 });
    expect(
        registry.sendPublish(uploader.address, 1, 1, presentation("", referenced)),
    ).toHaveFailedTx({ to: registry.address, exitCode: 258 });
}

get fun `test category membership matches the format for all 256 byte values`() {
    val (registry, uploader, _) = setupRegistry();
    var c = 0;
    while (c < 256) {
        val category = beginCell().storeUint(c, 8).endCell() as unknown as string;
        val result = registry.sendPublish(
            uploader.address,
            1,
            (c + 1) as uint256,
            presentation("", category),
        );
        val allowed = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 45;
        if (allowed) {
            expect(result).toHaveAllSuccessfulTxs();
        } else {
            expect(result).toHaveFailedTx({ to: registry.address, exitCode: 258 });
        }
        c += 1;
    }
}
