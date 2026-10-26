tolk 1.5

import "messages"

struct (0x30000001) PublicationCreated {
    queryId: uint64
    uploader: address
    bagId: uint256
    createdAt: uint32
    presentation: Cell<PublicationPresentation>
}

struct (0x30000002) PublicationUpdated {
    queryId: uint64
    revision: uint64
    presentation: Cell<PublicationPresentation>
}

fun emitCreated(event: PublicationCreated): coins {
    return createExternalLogMessage({ dest: createAddressNone(), body: event }).sendAndEstimateFee(
        SEND_MODE_REGULAR,
    );
}

fun emitUpdated(event: PublicationUpdated): coins {
    return createExternalLogMessage({ dest: createAddressNone(), body: event }).sendAndEstimateFee(
        SEND_MODE_REGULAR,
    );
}
