// BagItem - Child contract for individual bag entries
// Deployed by BagRegistry (parent) for each bag

import "errors.tolk"
import "storage.tolk"
import "messages.tolk"
import "events.tolk"

fun onInternalMessage(in: InMessage) {
    var loadingStorage = startLoadingBagItemStorage();

    // Check if not yet initialized
    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();

        // Only registry can initialize
        assert (in.senderAddress == uninitedSt.registryAddress) throw ERROR_NOT_FROM_REGISTRY;

        // Parse init params from message body
        val initParams = BagItemInitParams.fromSlice(in.body);

        // Create metadata struct
        val metadata: BagStorageMetadata = {
            description: initParams.description,
            bagSize: initParams.bagSize,
            filesCount: initParams.filesCount,
            files: initParams.files,
            pieceSize: initParams.pieceSize,
            merkleHash: initParams.merkleHash,
            dirName: initParams.dirName,
        };

        // Create initialized storage
        val storage: BagItemStorage = {
            bagIndex: uninitedSt.bagIndex,
            registryAddress: uninitedSt.registryAddress,
            bagId: initParams.bagId,
            name: initParams.name,
            category: initParams.category,
            uploaderAddress: initParams.uploaderAddress,
            timestamp: initParams.timestamp,
            isActive: true,
            metadata: metadata.toCell(),
        };
        storage.save();
        return;
    }

    // Already initialized - handle deactivation
    var storage = loadingStorage.parseInitialized();

    // Parse message - only uploader can deactivate
    val msg = DeactivateBag.fromSlice(in.body);
    assert (in.senderAddress == storage.uploaderAddress) throw ERROR_NOT_FROM_UPLOADER;

    storage.isActive = false;
    storage.save();

    // Emit event for indexers
    emitBagRemoved(storage.bagIndex, in.senderAddress);
}

// ============================================
// GET METHODS
// ============================================

// Returns tuple: (isInitialized, bagIndex, registryAddress, bagId, name, category, uploaderAddress, timestamp, isActive)
get fun get_bag_data(): (int, int, address, int, cell, int, address, int, int) {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        return (
            0,  // not initialized
            uninitedSt.bagIndex,
            uninitedSt.registryAddress,
            0,  // bagId
            beginCell().endCell(),  // empty name
            0,  // category
            uninitedSt.registryAddress,  // placeholder uploader
            0,  // timestamp
            0   // not active
        );
    }

    val storage = loadingStorage.parseInitialized();
    return (
        -1,  // initialized (TVM true)
        storage.bagIndex,
        storage.registryAddress,
        storage.bagId,
        storage.name,
        storage.category,
        storage.uploaderAddress,
        storage.timestamp,
        storage.isActive ? -1 : 0
    );
}

get fun get_static_data(): (int, address) {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        return (uninitedSt.bagIndex, uninitedSt.registryAddress);
    }

    val storage = loadingStorage.parseInitialized();
    return (storage.bagIndex, storage.registryAddress);
}

get fun is_active(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    return storage.isActive ? -1 : 0;
}

get fun get_bag_id(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    return storage.bagId;
}

get fun get_uploader(): address {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        val uninitedSt = loadingStorage.parseNotInitialized();
        return uninitedSt.registryAddress;  // placeholder
    }

    val storage = loadingStorage.parseInitialized();
    return storage.uploaderAddress;
}

get fun get_category(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    return storage.category;
}

// ============================================
// TON STORAGE METADATA GETTERS
// ============================================

get fun get_description(): cell {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return beginCell().endCell();
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.description;
}

get fun get_bag_size(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.bagSize;
}

get fun get_files_count(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.filesCount;
}

get fun get_files(): cell {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return beginCell().endCell();
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.files;
}

get fun get_piece_size(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.pieceSize;
}

get fun get_merkle_hash(): int {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return 0;
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.merkleHash;
}

get fun get_dir_name(): cell {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return beginCell().endCell();
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return metadata.dirName;
}

// Full metadata getter
get fun get_storage_metadata(): (cell, int, int, cell, int, int, cell) {
    var loadingStorage = startLoadingBagItemStorage();

    if (!loadingStorage.isInitialized()) {
        return (
            beginCell().endCell(),  // description
            0,                       // bagSize
            0,                       // filesCount
            beginCell().endCell(),  // files
            0,                       // pieceSize
            0,                       // merkleHash
            beginCell().endCell()   // dirName
        );
    }

    val storage = loadingStorage.parseInitialized();
    val metadata = BagStorageMetadata.fromCell(storage.metadata);
    return (
        metadata.description,
        metadata.bagSize,
        metadata.filesCount,
        metadata.files,
        metadata.pieceSize,
        metadata.merkleHash,
        metadata.dirName
    );
}
