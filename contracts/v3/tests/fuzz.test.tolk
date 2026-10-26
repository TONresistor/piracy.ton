tolk 1.5

import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/testing/fuzz"

import "@contracts/events"
import "@contracts/messages"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

@test.fuzz(128)
get fun `test fuzz identity category title and retry`(
    rawId: uint256,
    categorySeed: uint256,
    rawLength: uint16,
    visible: bool,
) {
    val category = categoryText(categorySeed, (rawLength % 16) + 1);
    val bagId = rawId == 0 ? (1 as uint256) : rawId;
    val fields = presentation(titleBytes(fuzz.bound(rawLength, 0, 256)), category, visible);
    val (registry, uploader, _) = setupRegistry();
    val (child, result) = publish(registry, uploader.address, bagId, fields);
    expect(result).toHaveAllSuccessfulTxs();
    val stored = child.getPublication();
    expect(stored.bagId).toEqual(bagId);
    expect(stored.uploader).toEqual(uploader.address);
    expect(stored.presentation.hash()).toEqual(fields.toCell().hash());
    val (_, retry) = publish(registry, uploader.address, bagId, presentation("retry"));
    expect(retry).toHaveAllSuccessfulTxs();
    expect(child.getPublication().presentation.hash()).toEqual(stored.presentation.hash());
    expect(retry.findExternalOutMessage<PublicationCreated>({ from: child.address })).toBeNull();
}

@test.fuzz(128)
get fun `test fuzz oversized title rejected without deployment`(rawLength: uint16) {
    val (registry, uploader, _) = setupRegistry();
    val title = titleBytes(fuzz.bound(rawLength, 257, 381));
    val result = registry.sendPublish(
        uploader.address,
        1,
        1,
        presentation(title),
        { value: grams("1") },
    );
    expect(result).toHaveFailedTx({ to: registry.address, exitCode: 259 });
    expect(result).toNotHaveTx({ deploy: true });
}

@test.fuzz(128)
get fun `test fuzz underpayment never creates a publication`(rawValue: uint64) {
    val (registry, uploader, _) = setupRegistry();
    val quote = registry.getPublishFunding(uploader.address, 1, presentation());
    val attached = fuzz.bound(rawValue as int, 1, (quote.minimumValue as int) - 1) as coins;
    val result = registry.sendPublish(uploader.address, 1, 1, presentation(), { value: attached });
    expect(result).toNotHaveTx({ to: registry.address, success: true });
    expect(testing.isDeployed(registry.getPublicationAddress(uploader.address, 1))).toBeFalse();
}

@test.fuzz(128)
get fun `test fuzz surplus never drains donated reserves`(rawExtra: uint64, categorySeed: uint256) {
    val (registry, uploader, donor) = setupRegistry();
    testing.topUp(registry.address, grams("1"));
    val rootBefore = registry.getBalance();
    val category = categoryText(categorySeed, (rawExtra % 16) + 1);
    val fields = presentation("random overpayment", category);
    val quote = registry.getPublishFunding(uploader.address, 1, fields);
    val attached = quote.minimumValue +
        (fuzz.bound(rawExtra as int, 0, grams("3") as int) as coins);
    val result = registry.sendPublish(uploader.address, 1, 1, fields, { value: attached });
    expect(result).toHaveAllSuccessfulTxs();
    val child = BagItem.fromAddress(registry.getPublicationAddress(uploader.address, 1));
    expect(registry.getBalance()).toBeGreaterOrEqual(rootBefore - grams("0.00001"));
    expect(child.getBalance()).toBeGreaterOrEqual(child.getFunding(fields).storageReserve);
    testing.topUp(child.address, grams("1"));
    val before = child.getBalance();
    expect(
        update(child, uploader.address, 0, presentation("changed", category, false)),
    ).toHaveAllSuccessfulTxs();
    expect(child.getBalance()).toBeGreaterOrEqual(before - grams("0.00001"));
    expect(
        update(child, donor.address, 1, fields),
    ).toHaveFailedTx({ to: child.address, exitCode: 271 });
}

@test.fuzz(128)
get fun `test fuzz lifecycle revisions and replay`(rawSeed: uint32) {
    val (registry, uploader, _) = setupRegistry();
    val (child, _) = publish(registry, uploader.address);
    var seed = rawSeed as int;
    var revision = 0;
    var i = 0;
    while (i < 4) {
        seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
        val fields = presentation(
            titleBytes(seed % 257),
            categoryText(seed as uint256, (seed % 16) + 1),
            seed % 2 == 0,
        );
        val old = child.getPublication();
        val changed = old.presentation.hash() != fields.toCell().hash();
        expect(
            update(child, uploader.address, revision as uint64, fields),
        ).toHaveAllSuccessfulTxs();
        if (changed) {
            revision += 1;
        }
        expect(child.getPublication().revision).toEqual(revision);
        expect(child.getPublication().presentation.hash()).toEqual(fields.toCell().hash());
        if (changed) {
            expect(
                update(
                    child,
                    uploader.address,
                    (revision - 1) as uint64,
                    presentation("old request"),
                ),
            ).toHaveFailedTx({ to: child.address, exitCode: 273 });
        }
        i += 1;
    }
}

@test.fuzz(128)
get fun `test fuzz category rejects every byte outside lowercase digits hyphen`(raw: uint8) {
    val valid = (raw >= 97 && raw <= 122) || (raw >= 48 && raw <= 57) || raw == 45;
    val invalid = valid ? 65 : raw as int;
    val category = beginCell().storeUint(invalid, 8).endCell() as unknown as string;
    val (registry, uploader, _) = setupRegistry();
    expect(
        registry.sendPublish(
            uploader.address,
            1,
            1,
            presentation("", category),
            { value: grams("0.2") },
        ),
    ).toHaveFailedTx({ to: registry.address, exitCode: 258 });
    expect(testing.isDeployed(registry.getPublicationAddress(uploader.address, 1))).toBeFalse();
}
