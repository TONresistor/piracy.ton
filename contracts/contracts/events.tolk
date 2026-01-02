// Events for BagRegistry - External out messages for indexers
// These events are logged on-chain and can be parsed by any indexer

// ============================================
// EVENT OPCODES
// ============================================

const EVENT_BAG_INDEXED: int = 0x10000001;
const EVENT_BAG_REMOVED: int = 0x10000002;

// ============================================
// EVENT STRUCTURES
// ============================================

// BagIndexed event - emitted when a new bag is added
// Main cell: identification & filtering data
struct BagIndexedEvent {
    bagIndex: uint64
    bagId: uint256
    category: uint8
    uploader: address
}

// BagIndexed metadata - stored as ref cell
// Contains: timestamp, name, and TON Storage technical data
struct BagIndexedMetadata {
    timestamp: uint64
    name: cell
    description: cell
    bagSize: uint64
    filesCount: uint32
    files: cell
    pieceSize: uint32
    merkleHash: uint256
    dirName: cell
}

// BagRemoved event - emitted when uploader deactivates their bag
struct BagRemovedEvent {
    bagIndex: uint64
    removedBy: address
}

// ============================================
// EMIT FUNCTIONS
// ============================================

// Emit BagIndexed event with full metadata
fun emitBagIndexed(
    bagIndex: uint64,
    bagId: uint256,
    category: uint8,
    uploader: address,
    timestamp: uint64,
    name: cell,
    description: cell,
    bagSize: uint64,
    filesCount: uint32,
    files: cell,
    pieceSize: uint32,
    merkleHash: uint256,
    dirName: cell
) {
    // Build metadata ref cell (timestamp + name + TON Storage data)
    val metadata = beginCell()
        .storeUint(timestamp, 64)
        .storeRef(name)
        .storeRef(description)
        .storeUint(bagSize, 64)
        .storeUint(filesCount, 32)
        .storeRef(files)
        .storeUint(pieceSize, 32)
        .storeUint(merkleHash, 256)
        .storeRef(dirName)
        .endCell();

    // Build main event body (identification + filtering)
    val body = beginCell()
        .storeUint(EVENT_BAG_INDEXED, 32)
        .storeUint(bagIndex, 64)
        .storeUint(bagId, 256)
        .storeUint(category, 8)
        .storeAddress(uploader)
        .storeRef(metadata)
        .endCell();

    // Send as external out message (event)
    // ext_out_msg_info: 11 (2 bits) + addr_none (00, 2 bits) + addr_none (00, 2 bits)
    // + created_lt (0) + created_at (0) + init (0) + body (1 = ref)
    sendRawMessage(
        beginCell()
            .storeUint(0b11, 2)              // ext_out_msg_info tag
            .storeUint(0b00, 2)              // src addr_none
            .storeUint(0b00, 2)              // dest addr_none
            .storeUint(0, 64)                // created_lt
            .storeUint(0, 32)                // created_at
            .storeBool(false)                // no init
            .storeBool(true)                 // body as ref
            .storeRef(body)
            .endCell(),
        SEND_MODE_REGULAR
    );
}

// Emit BagRemoved event
fun emitBagRemoved(
    bagIndex: uint64,
    removedBy: address
) {
    val body = beginCell()
        .storeUint(EVENT_BAG_REMOVED, 32)
        .storeUint(bagIndex, 64)
        .storeAddress(removedBy)
        .endCell();

    // Send as external out message (event)
    sendRawMessage(
        beginCell()
            .storeUint(0b11, 2)              // ext_out_msg_info tag
            .storeUint(0b00, 2)              // src addr_none
            .storeUint(0b00, 2)              // dest addr_none
            .storeUint(0, 64)                // created_lt
            .storeUint(0, 32)                // created_at
            .storeBool(false)                // no init
            .storeBool(true)                 // body as ref
            .storeRef(body)
            .endCell(),
        SEND_MODE_REGULAR
    );
}
