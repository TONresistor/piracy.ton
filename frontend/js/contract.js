
const CONTRACT_ADDRESS = 'EQBWQyOuZimuWhx5w0lOvPnfXYZLzICzV_EL7rWBLRQVPI9g';

const OP_ADD_BAG = 0x41444247;

const REGISTRATION_FEE = '150000000';

const CATEGORY_MAP = { video: 0, audio: 1, apps: 2, games: 3, books: 4, other: 5 };

let tonCorePromise = null;
function getTonCore() {
    if (!tonCorePromise) {
        tonCorePromise = import('https://esm.run/@ton/core@0.62.0');
    }
    return tonCorePromise;
}
getTonCore();

async function buildAddBagPayload(params) {
    const { beginCell } = await getTonCore();

    const {
        bagId,
        name,
        category,
        description,
        bagSize,
        filesCount,
        files,
        pieceSize,
        merkleHash,
        dirName
    } = params;

    const categoryNum = CATEGORY_MAP[category] ?? 5;

    const nameCell = beginCell().storeStringTail(name || '').endCell();
    const descCell = beginCell().storeStringTail(description || '').endCell();
    const dirNameCell = beginCell().storeStringTail(dirName || '').endCell();
    const filesCell = files || beginCell().endCell();

    const metadataCell = beginCell()
        .storeRef(descCell)
        .storeUint(BigInt(bagSize || 0), 64)
        .storeUint(filesCount || 0, 32)
        .storeRef(filesCell)
        .storeUint(pieceSize || 131072, 32)
        .storeUint(merkleHash ? BigInt('0x' + merkleHash) : 0n, 256)
        .storeRef(dirNameCell)
        .endCell();

    const root = beginCell()
        .storeUint(OP_ADD_BAG, 32)
        .storeUint(BigInt('0x' + bagId), 256)
        .storeUint(categoryNum, 8)
        .storeRef(nameCell)
        .storeRef(metadataCell)
        .endCell();

    const bocBuffer = root.toBoc();
    return btoa(String.fromCharCode(...new Uint8Array(bocBuffer)));
}

window.ContractHelper = {
    CONTRACT_ADDRESS,
    REGISTRATION_FEE,
    buildAddBagPayload,
    CATEGORY_MAP
};
