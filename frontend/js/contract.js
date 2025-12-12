// BagRegistry Contract Helper
const CONTRACT_ADDRESS = 'EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz';
const ADDBAG_OPCODE = 3304532695;
const CATEGORY_MAP = { video: 0, audio: 1, apps: 2, games: 3, books: 4, other: 5 };

// Preload ton-core
let tonCorePromise = null;

function getTonCore() {
    if (!tonCorePromise) {
        tonCorePromise = import('https://esm.run/@ton/core@0.59.0');
    }
    return tonCorePromise;
}

// Preload immediately
getTonCore();

// Build AddBag message payload
async function buildAddBagPayload(bagIdHex, name, category) {
    const { beginCell } = await getTonCore();

    const bagId = BigInt('0x' + bagIdHex);
    const categoryNum = CATEGORY_MAP[category] ?? 5;

    // Match Tact's storeAddBag exactly:
    // opcode (32) + bag_id (256) + name ref (storeStringRefTail) + category (8)
    const cell = beginCell()
        .storeUint(ADDBAG_OPCODE, 32)
        .storeUint(bagId, 256)
        .storeStringRefTail(name)
        .storeUint(categoryNum, 8)
        .endCell();

    // Get BOC as Uint8Array and convert to base64
    const bocBuffer = cell.toBoc();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bocBuffer)));

    return base64;
}

// Export
window.ContractHelper = {
    CONTRACT_ADDRESS,
    REGISTRATION_FEE: '120000000',
    buildAddBagPayload
};
