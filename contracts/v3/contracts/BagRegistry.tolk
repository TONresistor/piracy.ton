tolk 1.5

import "@stdlib/gas-payments"

import "errors"
import "fees"
import "messages"
import "storage"
import "gen/BagItem.code"

contract BagRegistry {
    author: "piracy.ton"
    version: "3.0.0"
    description: "Constant-state factory for uploader and bag publications"
    storage: BagRegistryStorage
    incomingMessages: RegistryMessage
    thrownErrors: PublicationError
}

fun BagRegistryStorage.save(self) {
    contract.setData(self.toCell());
}

fun loadRegistry(): BagRegistryStorage {
    var state = BagRegistryStorage.load();
    if (state.footprint == null) {
        state.footprint = RegistryFootprint {
            ownCode: codeFootprint(contract.getCode()),
            itemCode: codeFootprint(bagItemCompiledCode()),
        };
    }
    return state;
}

// Both callers reuse the same terms; the balance-dependent deficit is added once.
fun registryTerms(
    state: BagRegistryStorage,
    uploader: address,
    bagId: uint256,
    presentation: Cell<PublicationPresentation>,
): (FundingReply, coins, coins) {
    assert (bagId != 0) throw PublicationError.InvalidBagId;
    validatePresentation(presentation);
    val identity: PublicationIdentity = {
        registry: contract.getAddress(),
        uploader,
        bagId,
    };
    val sizes = state.footprint!;
    val child = itemFunding(identity.toCell(), presentation, sizes.itemCode);
    val budget = calculateGasFee(0, REGISTRY_GAS_BUDGET) +
        calculateForwardFee(0, sizes.itemCode.bits + 8192, sizes.itemCode.cells + 16);
    val reserve = storageReserve(sizes.ownCode, state.toCell());
    return (child, budget, reserve);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        if (BagRegistryStorage.load().footprint == null) {
            loadRegistry().save();
        }
        return;
    }
    val msg = lazy RegistryMessage.fromSlice(in.body);
    match (msg) {
        Publish => {
            msg.forceLoadLazyObject().assertEnd();
            val state = loadRegistry();
            val (child, budget, reserve) = registryTerms(
                state,
                in.senderAddress,
                msg.bagId,
                msg.presentation,
            );
            val previous = contract.getOriginalBalance() - in.valueCoins;
            val keep = previous > reserve ? previous : reserve;
            assert (
                in.valueCoins >= child.minimumValue + budget + keep - previous
            ) throw PublicationError.InsufficientValue;
            if (BagRegistryStorage.load().footprint == null) {
                state.save();
            }
            val identity: PublicationIdentity = {
                registry: contract.getAddress(),
                uploader: in.senderAddress,
                bagId: msg.bagId,
            };
            reserveGramsOnBalance(keep, RESERVE_MODE_EXACT_AMOUNT);
            val deploy = createMessage({
                bounce: BounceMode.RichBounce,
                dest: publicationAddress(identity, bagItemCompiledCode()),
                value: 0,
                body: InitializePublication {
                    queryId: msg.queryId,
                    uploader: in.senderAddress,
                    bagId: msg.bagId,
                    presentation: msg.presentation,
                },
            });
            // SAFETY: reserve above protects prior balance; only incoming surplus is forwarded.
            deploy.send(SEND_MODE_CARRY_ALL_BALANCE);
        }
        else => {
            throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    val bounced = RichBounceBody.fromSlice(in.bouncedBody);
    val original = InitializePublication.fromCell(bounced.originalBody);
    val identity: PublicationIdentity = {
        registry: contract.getAddress(),
        uploader: original.uploader,
        bagId: original.bagId,
    };
    assert (
        in.senderAddress == publicationAddress(identity, bagItemCompiledCode()).calculateAddress()
    ) throw PublicationError.InvalidBounce;
    refundIncomingSurplus(original.uploader, in.valueCoins, 0);
}

get fun get_publication_address(uploader: address, bagId: uint256): address {
    assert (bagId != 0) throw PublicationError.InvalidBagId;
    return publicationAddress(
        {
            registry: contract.getAddress(),
            uploader,
            bagId,
        },
        bagItemCompiledCode(),
    ).calculateAddress();
}

get fun get_publish_funding(
    uploader: address,
    bagId: uint256,
    presentation: Cell<PublicationPresentation>,
): FundingReply {
    val state = loadRegistry();
    val (child, budget, reserve) = registryTerms(state, uploader, bagId, presentation);
    val balance = contract.getOriginalBalance();
    val deficit = reserve > balance ? reserve - balance : (0 as coins);
    return {
        minimumValue: child.minimumValue + budget + deficit,
        storageReserve: child.storageReserve,
        executionBudget: child.executionBudget + budget + deficit,
        storageSeconds: STORAGE_SECONDS,
    };
}

get fun get_version(): int {
    return 3;
}

get fun get_item_code(): cell {
    return bagItemCompiledCode();
}

get fun get_balance(): coins {
    return contract.getOriginalBalance();
}
