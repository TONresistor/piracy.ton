// Message definitions for BagRegistry and BagItem

import "storage.tolk"

// ============================================
// INIT PARAMS (sent from registry to item at deploy)
// ============================================

struct BagItemInitParams {
    bagId: uint256
    name: cell
    category: uint8
    uploaderAddress: address
    timestamp: uint64

    // TON Storage metadata
    description: cell
    bagSize: uint64
    filesCount: uint32
    files: cell
    pieceSize: uint32
    merkleHash: uint256
    dirName: cell
}

// ============================================
// MESSAGES TO BAG REGISTRY
// ============================================

// Add a new bag - public, anyone can call (pays gas only)
struct (0x00000001) AddBag {
    bagId: uint256
    name: cell
    category: uint8

    // TON Storage metadata
    description: cell
    bagSize: uint64
    filesCount: uint32
    files: cell
    pieceSize: uint32
    merkleHash: uint256
    dirName: cell
}

// ============================================
// MESSAGES TO BAG ITEM
// ============================================

// Deactivate bag - uploader only (sent directly to BagItem)
struct (0x00000010) DeactivateBag {}
