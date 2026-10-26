tolk 1.5

import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/events"
import "@contracts/messages"
import "@contracts/storage"
import "@tests/test-utils"
import "@wrappers/BagItem.gen"
import "@wrappers/BagRegistry.gen"

get fun `test underfunded initialization generates real bounce refund and retry succeeds`() {
    val (registry, uploader, stranger) = setupRegistry();
    val identity: PublicationIdentity = {
        registry: registry.address,
        uploader: uploader.address,
        bagId: 1,
    };
    val child = BagItem.fromStorage({ identity: identity.toCell(), content: null });
    child.deploy(stranger.address, { value: grams("0.001") });
    val quote = child.getFunding(presentation());
    val before = registry.getBalance();
    // Fault injection at the initialization hop, not a fabricated bounce callback.
    // The emulator delivers the failed child transaction and its real rich bounce.
    val result = net.send(
        registry.address,
        createMessage({
            bounce: BounceMode.RichBounce,
            dest: child.address,
            value: quote.executionBudget - 1,
            body: InitializePublication {
                queryId: 1,
                uploader: uploader.address,
                bagId: 1,
                presentation: presentation().toCell(),
            },
        }),
    );
    expect(result).toHaveFailedTx<InitializePublication>({ to: child.address, exitCode: 256 });
    expect(
        result,
    ).toHaveTx({ from: child.address, to: registry.address, bounced: true, success: true });
    expect(result).toHaveTx({ from: registry.address, to: uploader.address, success: true });
    expect(result.findExternalOutMessage<PublicationCreated>({ from: child.address })).toBeNull();
    expect(registry.getBalance()).toBeGreaterOrEqual(before - grams("0.00001"));
    expect(child.getPublication().initialized).toBeFalse();
    val (retried, success) = publish(registry, uploader.address);
    expect(success).toHaveAllSuccessfulTxs();
    expect(retried.address).toEqual(child.address);
    expect(retried.getPublication().initialized).toBeTrue();
}

fun bounceBody(uploader: address): RichBounceBody {
    val original: InitializePublication = {
        queryId: 123,
        uploader,
        bagId: 1,
        presentation: presentation().toCell(),
    };
    return {
        originalBody: original.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.01"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 0,
        exitCode: 256,
        computePhase: null,
    };
}

get fun `test forged bounce cannot impersonate canonical child`() {
    val (registry, uploader, stranger) = setupRegistry();
    val message = createMessage({ bounce: BounceMode.NoBounce, dest: registry.address, value: grams("0.01"), body: bounceBody(
            uploader.address,
        ) }).bounced();
    val result = net.send(stranger.address, message);
    expect(result).toHaveFailedTx({ to: registry.address, exitCode: 276 });
    expect(result).toNotHaveTx({ from: registry.address, to: uploader.address });
}

get fun `test authenticated small bounce refunds its net surplus`() {
    val (registry, uploader, _) = setupRegistry();
    val before = registry.getBalance();
    val child = registry.getPublicationAddress(uploader.address, 1);
    val message = createMessage({ bounce: BounceMode.NoBounce, dest: registry.address, value: grams("0.0006"), body: bounceBody(
            uploader.address,
        ) }).bounced();
    val result = net.send(child, message);
    expect(result).toHaveAllSuccessfulTxs();
    expect(result).toHaveTx({ from: registry.address, to: uploader.address, success: true });
    expect(registry.getBalance()).toBeGreaterOrEqual(before);
}

get fun `test authenticated dust bounce stays funded instead of uneconomic refund`() {
    val (registry, uploader, _) = setupRegistry();
    val before = registry.getBalance();
    val child = registry.getPublicationAddress(uploader.address, 1);
    val message = createMessage({ bounce: BounceMode.NoBounce, dest: registry.address, value: grams("0.0004"), body: bounceBody(
            uploader.address,
        ) }).bounced();
    val result = net.send(child, message);
    expect(result).toHaveAllSuccessfulTxs();
    expect(result).toNotHaveTx({ from: registry.address, to: uploader.address });
    expect(registry.getBalance()).toBeGreaterOrEqual(before);
}
