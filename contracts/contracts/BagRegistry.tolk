// BagRegistry - Master contract for TON Storage bag index
// Architecture: Parent-Child (like NFT Collection/Item)
// Fully decentralized - no owner, no fees, no authority

import "errors.tolk"
import "storage.tolk"
import "messages.tolk"
import "events.tolk"

const ITEM_DEPLOY_AMOUNT: coins = 10000000;     // 0.01 TON to deploy child

// Deploy a BagItem child contract
fun deployBagItem(bagIndex: uint64, bagItemCode: cell, initParams: BagItemInitParams) {
    val deployMsg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        dest: calcDeployedBagItem(bagIndex, contract.getAddress(), bagItemCode),
        value: ITEM_DEPLOY_AMOUNT,
        body: initParams,
    });
    deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    // Handle deploy (empty body) - just accept and return
    if (in.body.remainingBitsCount() == 0) {
        return;
    }

    // Only AddBag message is accepted
    val msg = AddBag.fromSlice(in.body);

    // Validate inputs
    assert (msg.bagId != 0) throw ERROR_INVALID_BAG_ID;
    assert (msg.category <= 5) throw ERROR_INVALID_CATEGORY;

    var storage = lazy BagRegistryStorage.load();
    val bagIndex = storage.nextBagIndex;

    // Create init params for child
    val initParams: BagItemInitParams = {
        bagId: msg.bagId,
        name: msg.name,
        category: msg.category,
        uploaderAddress: in.senderAddress,
        timestamp: blockchain.now(),

        // TON Storage metadata
        description: msg.description,
        bagSize: msg.bagSize,
        filesCount: msg.filesCount,
        files: msg.files,
        pieceSize: msg.pieceSize,
        merkleHash: msg.merkleHash,
        dirName: msg.dirName,
    };

    // Deploy child contract
    deployBagItem(bagIndex, storage.bagItemCode, initParams);

    // Emit event for indexers
    emitBagIndexed(
        bagIndex,
        msg.bagId,
        msg.category,
        in.senderAddress,
        blockchain.now(),
        msg.name,
        msg.description,
        msg.bagSize,
        msg.filesCount,
        msg.files,
        msg.pieceSize,
        msg.merkleHash,
        msg.dirName
    );

    // Update storage
    storage.nextBagIndex += 1;
    storage.save();
}

// ============================================
// BOUNCE HANDLER
// ============================================

fun onBounce(in: InMessage) {
    var storage = lazy BagRegistryStorage.load();

    if (storage.nextBagIndex == 0) {
        return;
    }

    // Calculate expected address of the last deployed BagItem
    val lastIndex = storage.nextBagIndex - 1;
    val expectedAddress = calcDeployedBagItem(
        lastIndex,
        contract.getAddress(),
        storage.bagItemCode
    ).calculateAddress();

    // Only decrement if bounce came from that exact address
    if (in.senderAddress == expectedAddress) {
        storage.nextBagIndex = lastIndex;
        storage.save();
    }
    // Silently ignore invalid bounces (attack attempts or stale bounces)
}

// ============================================
// GET METHODS
// ============================================

get fun get_total(): int {
    val storage = lazy BagRegistryStorage.load();
    return storage.nextBagIndex;
}

get fun get_bag_address(bagIndex: int): address {
    val storage = lazy BagRegistryStorage.load();
    val deployed = calcDeployedBagItem(bagIndex as uint64, contract.getAddress(), storage.bagItemCode);
    return deployed.calculateAddress();
}

get fun get_balance(): int {
    return contract.getOriginalBalance();
}

get fun get_item_code(): cell {
    val storage = lazy BagRegistryStorage.load();
    return storage.bagItemCode;
}
