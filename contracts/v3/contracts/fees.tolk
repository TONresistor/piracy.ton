tolk 1.5

import "@stdlib/gas-payments"

import "errors"
import "messages"

import "storage"

const STORAGE_SECONDS: uint32 = 157680000 // Five 365-day years, at current config prices.
const ITEM_GAS_BUDGET: int = 60000
const REGISTRY_GAS_BUDGET: int = 40000
// Membership table for exactly a-z, 0-9 and hyphen.
const CATEGORY_ASCII_MASK: int = 0x7fffffe0000000003ff200000000000

// Canonical byte-aligned snake: <=256 bytes, <=3 cells, 127 bytes in non-final cells.
// Text decoding belongs to clients; no arbitrary cell graphs can enter storage.
fun validatePresentation(presentation: Cell<PublicationPresentation>) {
    val value = presentation.load();
    var category = value.category.beginParse();
    val categoryBits = category.remainingBitsCount();
    assert (
        category.remainingRefsCount() == 0 && categoryBits >= 8 && categoryBits <= 128 &&
        categoryBits % 8 == 0
    ) throw PublicationError.InvalidCategory;
    repeat (categoryBits / 8) {
        val c = category.loadUint(8);
        assert (((CATEGORY_ASCII_MASK >> c) & 1) != 0) throw PublicationError.InvalidCategory;
    }
    var part = value.title.beginParse();
    var total = 0;
    var count = 0;
    while (true) {
        count += 1;
        val bits = part.remainingBitsCount();
        val refs = part.remainingRefsCount();
        assert (count <= 3 && bits % 8 == 0 && refs <= 1) throw PublicationError.InvalidTitle;
        total += bits / 8;
        assert (total <= 256) throw PublicationError.InvalidTitle;
        if (refs == 0) {
            assert (count == 1 || bits > 0) throw PublicationError.InvalidTitle;
            return;
        }
        assert (bits == 1016) throw PublicationError.InvalidTitle;
        part = part.loadRef().beginParse();
    }
}

fun codeFootprint(code: cell): CodeFootprint {
    val (cells, bits, _) = code.calculateSizeStrict(2048);
    return { bits: bits as uint32, cells: cells as uint16 };
}

fun storageReserve(code: CodeFootprint, data: cell): coins {
    val (cells, bits, _) = data.calculateSizeStrict(32);
    // Summing code and data may count shared subtrees twice, never underestimates rent.
    return calculateStorageFee(0, STORAGE_SECONDS, code.bits + bits + 512, code.cells + cells + 2);
}

fun itemExecutionBudget(): coins {
    return calculateGasFee(0, ITEM_GAS_BUDGET) + calculateForwardFee(0, 4096, 8) * 2;
}

// Getter/factory helper. The factory validates before forwarding; the child trusts
// only that authenticated factory at initialization and validates owner updates.
fun itemFunding(
    identity: Cell<PublicationIdentity>,
    presentation: Cell<PublicationPresentation>,
    code: CodeFootprint,
): FundingReply {
    val content: PublicationContent = {
        createdAt: 0,
        revision: 0,
        presentation,
    };
    val state: BagItemStorage = {
        identity,
        content: content.toCell(),
        codeFootprint: code,
    };
    val reserve = storageReserve(code, state.toCell());
    val budget = itemExecutionBudget();
    return {
        minimumValue: reserve + budget,
        storageReserve: reserve,
        executionBudget: budget,
        storageSeconds: STORAGE_SECONDS,
    };
}

fun retainedBalance(incomingValue: coins, target: coins): coins {
    val previous = contract.getOriginalBalance() - incomingValue;
    return previous > target ? previous : target;
}

fun refundIncomingSurplus(
    uploader: address,
    incomingValue: coins,
    target: coins,
    eventFee: coins = 0,
) {
    val keep = retainedBalance(incomingValue, target);
    reserveGramsOnBalance(keep, RESERVE_MODE_EXACT_AMOUNT);
    // The empty refund always fits in the message root. No message construction
    // or SENDMSG estimate is needed until a positive net refund can be sent.
    val forwarding = calculateForwardFee(0, 0, 0);
    val remainingCosts = calculateGasFee(0, getGasConsumedAtTheMoment() + 1500) + eventFee +
        forwarding;
    if (contract.getOriginalBalance() - keep > remainingCosts) {
        val refund = createMessage({ bounce: BounceMode.NoBounce, dest: uploader, value: 0 });
        // SAFETY: exact reserve protects all prior funds and storage; send failures leave surplus funded.
        refund.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
    }
}
