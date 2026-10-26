tolk 1.5

struct PublicationPresentation {
    title: string
    category: string
    visible: bool
}

struct (0x50554233) Publish {
    queryId: uint64
    bagId: uint256
    presentation: Cell<PublicationPresentation>
}

struct (0x494E4933) InitializePublication {
    queryId: uint64
    uploader: address
    bagId: uint256
    presentation: Cell<PublicationPresentation>
}

struct (0x55504433) UpdatePublication {
    queryId: uint64
    expectedRevision: uint64
    presentation: Cell<PublicationPresentation>
}

type RegistryMessage = Publish

type PublicationMessage = InitializePublication | UpdatePublication

struct PublicationReply {
    initialized: bool
    registry: address
    uploader: address
    bagId: uint256
    createdAt: uint32
    revision: uint64
    presentation: Cell<PublicationPresentation>
}

struct FundingReply {
    minimumValue: coins
    storageReserve: coins
    executionBudget: coins
    storageSeconds: uint32
}
