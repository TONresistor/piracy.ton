import "errors.tolk"
import "events.tolk"
import "messages.tolk"
import "storage.tolk"

const DEACTIVATED_FLOOR: coins = ton("0.005")
const OP_DEACTIVATE_BAG: int = 0x44454143

contract BagItem {
    author: "piracy.ton"
    version: "2.0.0"
    description: "Child contract for one indexed TON Storage bag"

    storage: BagItemData
    storageAtDeployment: BagItemDataNotInitialized
    incomingMessages: BagItemMessage
    thrownErrors: BagError
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }

    val data = BagItemData.load();
    match (data) {
        BagItemDataNotInitialized => {
            assert (in.senderAddress == data.registryAddress) throw BagError.NotFromRegistry;

            val params = BagItemInitParams.fromSlice(in.body);

            val initialized: BagItemData = BagItemDataInitialized {
                bagIndex: data.bagIndex,
                registryAddress: data.registryAddress,
                bagId: params.bagId,
                name: params.name,
                category: params.category,
                uploaderAddress: params.uploaderAddress,
                timestamp: params.timestamp,
                isActive: true,
                metadata: params.metadata,
            };
            initialized.save();
        }

        BagItemDataInitialized => {
            assert (in.body.preloadUint(32) == OP_DEACTIVATE_BAG) throw 0xFFFF;
            val _msg = DeactivateBag.fromSlice(in.body);

            assert (in.senderAddress == data.uploaderAddress) throw BagError.NotFromUploader;
            assert (data.isActive) throw BagError.AlreadyInactive;

            var updated = data;
            updated.isActive = false;
            updated.save();

            emitBagRemoved({
                bagIndex: data.bagIndex,
                removedBy: in.senderAddress,
            });

            reserveToncoinsOnBalance(DEACTIVATED_FLOOR, RESERVE_MODE_EXACT_AMOUNT);
            val refundMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
            });
            // SAFETY: mode 128 carries all remaining balance and runs only after
            // reserveToncoinsOnBalance(DEACTIVATED_FLOOR, EXACT), so the contract
            // can never be drained below its rent floor. Mode 2 ignores action
            // errors so a failed refund cannot revert the committed state.
            refundMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
        }
    }
}

get fun get_bag_data(): BagDataReply {
    val data = BagItemData.load();
    match (data) {
        BagItemDataNotInitialized => {
            return {
                isInitialized: false,
                bagIndex: data.bagIndex,
                registryAddress: data.registryAddress,
                bagId: 0,
                name: createEmptyCell(),
                category: 0,
                uploaderAddress: createAddressNone() as address,
                timestamp: 0,
                isActive: false,
            };
        }
        BagItemDataInitialized => {
            return {
                isInitialized: true,
                bagIndex: data.bagIndex,
                registryAddress: data.registryAddress,
                bagId: data.bagId,
                name: data.name,
                category: data.category,
                uploaderAddress: data.uploaderAddress,
                timestamp: data.timestamp,
                isActive: data.isActive,
            };
        }
    }
}

get fun get_static_data(): StaticDataReply {
    val data = BagItemData.load();
    match (data) {
        BagItemDataNotInitialized => {
            return { bagIndex: data.bagIndex, registryAddress: data.registryAddress };
        }
        BagItemDataInitialized => {
            return { bagIndex: data.bagIndex, registryAddress: data.registryAddress };
        }
    }
}

get fun get_storage_metadata(): StorageMetadataReply {
    val data = BagItemData.load();
    match (data) {
        BagItemDataNotInitialized => {
            return {
                isInitialized: false,
                description: createEmptyCell(),
                bagSize: 0,
                filesCount: 0,
                files: createEmptyCell(),
                pieceSize: 0,
                merkleHash: 0,
                dirName: createEmptyCell(),
            };
        }
        BagItemDataInitialized => {
            val m = data.metadata.load();
            return {
                isInitialized: true,
                description: m.description,
                bagSize: m.bagSize,
                filesCount: m.filesCount,
                files: m.files,
                pieceSize: m.pieceSize,
                merkleHash: m.merkleHash,
                dirName: m.dirName,
            };
        }
    }
}

get fun is_active(): bool {
    val data = BagItemData.load();
    return match (data) {
        BagItemDataNotInitialized => false,
        BagItemDataInitialized => data.isActive,
    };
}
