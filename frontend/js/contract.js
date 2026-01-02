// Contract configuration for BagRegistry (Tolk version)
// Architecture: Master-Item (parent-child)
// Fully decentralized - no owner

const CONTRACT_ADDRESS = 'EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S';

// Opcodes matching BagRegistry.tolk
const OP_ADD_BAG = 0x00000001;

// Category mapping
const CATEGORY_MAP = { video: 0, audio: 1, apps: 2, games: 3, books: 4, other: 5 };

// Lazy load @ton/core
let tonCorePromise = null;

function getTonCore() {
    if (!tonCorePromise) {
        tonCorePromise = import('https://esm.run/@ton/core@0.59.0');
    }
    return tonCorePromise;
}

// Preload
getTonCore();

/**
 * Build AddBag payload for Tolk contract
 * 
 * Message format:
 *   op (32) + bag_id (256) + name (ref) + category (8)
 *   + description (ref) + bagSize (64) + filesCount (32)
 *   + files (ref) + pieceSize (32) + merkleHash (256) + dirName (ref)
 */
async function buildAddBagPayload(params) {
    const { beginCell } = await getTonCore();
    
    const {
        bagId,           // hex string (64 chars)
        name,            // string
        category,        // string: video, audio, etc.
        description,     // string
        bagSize,         // bigint or number (bytes)
        filesCount,      // number
        files,           // Cell or null (empty cell if null)
        pieceSize,       // number (default 128KB = 131072)
        merkleHash,      // bigint (default 0)
        dirName          // string
    } = params;

    const bagIdBigInt = BigInt('0x' + bagId);
    const categoryNum = CATEGORY_MAP[category] ?? 5;
    
    // Build cells for strings
    const nameCell = beginCell().storeStringTail(name || '').endCell();
    const descCell = beginCell().storeStringTail(description || '').endCell();
    const dirNameCell = beginCell().storeStringTail(dirName || '').endCell();
    
    // Files cell - empty dict if not provided
    const filesCell = files || beginCell().endCell();
    
    // Build the message
    const cell = beginCell()
        .storeUint(OP_ADD_BAG, 32)
        .storeUint(bagIdBigInt, 256)
        .storeRef(nameCell)
        .storeUint(categoryNum, 8)
        .storeRef(descCell)
        .storeUint(BigInt(bagSize || 0), 64)
        .storeUint(filesCount || 0, 32)
        .storeRef(filesCell)
        .storeUint(pieceSize || 131072, 32)
        .storeUint(merkleHash ? BigInt('0x' + merkleHash) : 0n, 256)
        .storeRef(dirNameCell)
        .endCell();

    const bocBuffer = cell.toBoc();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bocBuffer)));

    return base64;
}

// Export to window
window.ContractHelper = {
    CONTRACT_ADDRESS,
    // Gas only: 0.1 TON (deploys child contract + message forwarding)
    REGISTRATION_FEE: '15000000',  // 0.015 TON (gas + child deploy)
    buildAddBagPayload,
    CATEGORY_MAP
};
