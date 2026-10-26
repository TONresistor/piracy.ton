tolk 1.5

import "messages"

// No growing global index: discovery uses successful child creation events.
struct CodeFootprint {
    bits: uint32
    cells: uint16
}

struct RegistryFootprint {
    ownCode: CodeFootprint
    itemCode: CodeFootprint
}

struct BagRegistryStorage {
    version: uint16 = 3
    footprint: RegistryFootprint? = null
}

fun BagRegistryStorage.load(): BagRegistryStorage {
    return BagRegistryStorage.fromCell(contract.getData());
}

struct PublicationIdentity {
    registry: address
    uploader: address
    bagId: uint256
}

struct BagItemStorage {
    identity: Cell<PublicationIdentity>
    content: Cell<PublicationContent>?
    codeFootprint: CodeFootprint? = null
}

struct PublicationContent {
    createdAt: uint32
    revision: uint64
    presentation: Cell<PublicationPresentation>
}

fun BagItemStorage.load(): BagItemStorage {
    return BagItemStorage.fromCell(contract.getData());
}

fun publicationInitialState(identity: PublicationIdentity, code: cell): ContractState {
    val data: BagItemStorage = { identity: identity.toCell(), content: null };
    return { code, data: data.toCell() };
}

fun publicationAddress(identity: PublicationIdentity, code: cell): AutoDeployAddress {
    return { stateInit: publicationInitialState(identity, code) };
}
