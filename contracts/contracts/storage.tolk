// Storage definitions for BagRegistry and BagItem

// ============================================
// BAG REGISTRY STORAGE (Master)
// Fully decentralized - no owner
// ============================================

struct BagRegistryStorage {
    nextBagIndex: uint64
    bagItemCode: cell
}

fun BagRegistryStorage.load(): BagRegistryStorage {
    return BagRegistryStorage.fromCell(contract.getData())
}

fun BagRegistryStorage.save(self) {
    contract.setData(self.toCell())
}

// ============================================
// BAG ITEM STORAGE (Child)
// ============================================

// TON Storage metadata (stored as ref cell)
struct BagStorageMetadata {
    description: cell       // Description du bag
    bagSize: uint64         // Taille totale en bytes
    filesCount: uint32      // Nombre de fichiers
    files: cell             // Dict des fichiers {index -> (name, size)}
    pieceSize: uint32       // Taille d'un piece
    merkleHash: uint256     // Hash merkle pour vérification
    dirName: cell           // Nom du dossier racine
}

// Initialized storage
struct BagItemStorage {
    bagIndex: uint64
    registryAddress: address
    bagId: uint256
    name: cell
    category: uint8
    uploaderAddress: address
    timestamp: uint64
    isActive: bool
    metadata: Cell<BagStorageMetadata>  // TON Storage metadata as ref
}

// Not initialized storage (before init message from registry)
struct BagItemStorageNotInitialized {
    bagIndex: uint64
    registryAddress: address
}

// Helper to detect init state
struct BagItemStorageMaybeNotInitialized {
    contractData: slice
}

fun BagItemStorageMaybeNotInitialized.isInitialized(self): int {
    // When initialized, we have name cell as ref
    return self.contractData.remainingRefsCount()
}

fun BagItemStorageMaybeNotInitialized.parseNotInitialized(self): BagItemStorageNotInitialized {
    return BagItemStorageNotInitialized.fromSlice(self.contractData)
}

fun BagItemStorageMaybeNotInitialized.parseInitialized(self): BagItemStorage {
    return BagItemStorage.fromSlice(self.contractData)
}

fun startLoadingBagItemStorage(): BagItemStorageMaybeNotInitialized {
    return {
        contractData: contract.getData().beginParse()
    }
}

fun BagItemStorage.save(self) {
    contract.setData(self.toCell())
}

// ============================================
// ADDRESS CALCULATION
// ============================================

fun calcDeployedBagItem(bagIndex: uint64, registryAddress: address, bagItemCode: cell): AutoDeployAddress {
    val emptyBagItemStorage: BagItemStorageNotInitialized = {
        bagIndex,
        registryAddress,
    };

    return {
        stateInit: {
            code: bagItemCode,
            data: emptyBagItemStorage.toCell()
        }
    }
}
