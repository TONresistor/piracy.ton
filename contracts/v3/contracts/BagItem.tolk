tolk 1.5

import "@stdlib/gas-payments"

import "errors"
import "events"
import "fees"
import "messages"
import "storage"

contract BagItem {
    author: "piracy.ton"
    version: "3.0.0"
    description: "One uploader and bag publication"
    storage: BagItemStorage
    incomingMessages: PublicationMessage
    thrownErrors: PublicationError
}

fun savePublication(data: Cell<BagItemStorage>) {
    contract.setData(data);
}

fun requireItemFunding(incoming: coins, reserve: coins) {
    val previous = contract.getOriginalBalance() - incoming;
    val keep = previous > reserve ? previous : reserve;
    assert (
        incoming >= itemExecutionBudget() + keep - previous
    ) throw PublicationError.InsufficientValue;
}

fun itemCodeSize(storage: BagItemStorage): CodeFootprint {
    return storage.codeFootprint ?? codeFootprint(contract.getCode());
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    var storage = BagItemStorage.load();
    val identity = lazy storage.identity.load();
    val msg = lazy PublicationMessage.fromSlice(in.body);
    match (msg) {
        InitializePublication => {
            msg.forceLoadLazyObject().assertEnd();
            assert (in.senderAddress == identity.registry) throw PublicationError.NotFromRegistry;
            assert (
                msg.uploader == identity.uploader && msg.bagId == identity.bagId
            ) throw PublicationError.InvalidIdentity;
            val sizes = itemCodeSize(storage);
            if (storage.content != null) {
                // Authenticated retry never reads or validates replacement presentation.
                val reserve = storageReserve(sizes, storage.toCell());
                requireItemFunding(in.valueCoins, reserve);
                refundIncomingSurplus(identity.uploader, in.valueCoins, reserve);
                return;
            }
            // Only the immutable factory can initialize. It validates the presentation
            // before sending this message; owner updates below still validate independently.
            storage.codeFootprint = sizes;
            val content: PublicationContent = {
                createdAt: blockchain.now(),
                revision: 0,
                presentation: msg.presentation,
            };
            storage.content = content.toCell();
            val data = storage.toCell();
            val reserve = storageReserve(sizes, data);
            requireItemFunding(in.valueCoins, reserve);
            savePublication(data);
            val eventFee = emitCreated({ queryId: msg.queryId, uploader: identity.uploader, bagId: identity.bagId, createdAt: content.createdAt, presentation: msg.presentation });
            refundIncomingSurplus(identity.uploader, in.valueCoins, reserve, eventFee);
        }
        UpdatePublication => {
            msg.forceLoadLazyObject().assertEnd();
            assert (in.senderAddress == identity.uploader) throw PublicationError.NotFromUploader;
            assert (storage.content != null) throw PublicationError.NotInitialized;
            var content = storage.content.load();
            assert (msg.expectedRevision == content.revision) throw PublicationError.StaleRevision;
            val sizes = itemCodeSize(storage);
            if (msg.presentation.hash() == content.presentation.hash()) {
                // Equal cell hash means the already-validated presentation is unchanged.
                val reserve = storageReserve(sizes, storage.toCell());
                requireItemFunding(in.valueCoins, reserve);
                refundIncomingSurplus(identity.uploader, in.valueCoins, reserve);
                return;
            }
            validatePresentation(msg.presentation);
            assert (content.revision < 0xFFFFFFFFFFFFFFFF) throw PublicationError.RevisionOverflow;
            content.revision += 1;
            content.presentation = msg.presentation;
            storage.content = content.toCell();
            storage.codeFootprint = sizes;
            val data = storage.toCell();
            val reserve = storageReserve(sizes, data);
            requireItemFunding(in.valueCoins, reserve);
            savePublication(data);
            val eventFee = emitUpdated({ queryId: msg.queryId, revision: content.revision, presentation: msg.presentation });
            refundIncomingSurplus(identity.uploader, in.valueCoins, reserve, eventFee);
        }
        else => {
            throw 0xFFFF;
        }
    }
}

get fun get_publication(): PublicationReply {
    val storage = lazy BagItemStorage.load();
    val identity = storage.identity.load();
    var content: PublicationContent = {
        createdAt: 0,
        revision: 0,
        presentation: PublicationPresentation {
            title: "",
            category: "",
            visible: false,
        }.toCell(),
    };
    if (storage.content != null) {
        content = storage.content.load();
    }
    return {
        initialized: storage.content != null,
        registry: identity.registry,
        uploader: identity.uploader,
        bagId: identity.bagId,
        createdAt: content.createdAt,
        revision: content.revision,
        presentation: content.presentation,
    };
}

get fun get_funding(presentation: Cell<PublicationPresentation>): FundingReply {
    validatePresentation(presentation);
    val storage = BagItemStorage.load();
    val sizes = itemCodeSize(storage);
    val funding = itemFunding(storage.identity, presentation, sizes);
    var projectedBalance = contract.getOriginalBalance() as int;
    if (storage.content != null) {
        // Conservative bound since creation includes debt and the maximum prior title.
        val elapsed = blockchain.now() - storage.content.load().createdAt;
        val (cells, bits, _) = contract.getData().calculateSizeStrict(32);
        val rent = calculateStorageFee(
            0,
            elapsed,
            sizes.bits + bits + 2560,
            sizes.cells + cells + 5,
        );
        projectedBalance -= rent as int;
    }
    val deficit = (funding.storageReserve as int) > projectedBalance
        ? ((funding.storageReserve as int) - projectedBalance) as coins
        : (0 as coins);
    return {
        minimumValue: deficit + funding.executionBudget,
        storageReserve: funding.storageReserve,
        executionBudget: funding.executionBudget,
        storageSeconds: STORAGE_SECONDS,
    };
}

get fun get_version(): int {
    return 3;
}

get fun get_balance(): coins {
    return contract.getOriginalBalance();
}
