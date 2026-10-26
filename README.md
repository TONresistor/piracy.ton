# piracy.ton

[![TON](https://img.shields.io/badge/TON-Mainnet-0088CC?logo=ton&logoColor=white)](https://ton.org)
[![Tolk](https://img.shields.io/badge/Tolk-1.5-purple)](https://docs.ton.org/develop/tolk)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

```
 ____  _                       _
|  _ \(_)_ __ __ _  ___ _   _ | |_ ___  _ __
| |_) | | '__/ _` |/ __| | | || __/ _ \| '_ \
|  __/| | | | (_| | (__| |_| || || (_) | | | |
|_|   |_|_|  \__,_|\___|\__, (_)__\___/|_| |_|
                        |___/
```

## About

piracy.ton is a registry for [TON Storage](https://docs.ton.org/develop/dapps/ton-storage) bags. Think of it as a torrent index, but stored entirely on blockchain.

The files themselves live on TON Storage, a peer-to-peer network similar to BitTorrent. The index - the registry of what bags exist, their Bag IDs, titles, categories, and visibility - lives on the TON blockchain as a smart contract. The frontend is hosted on a .ton domain. The backend keeps a cached index for the frontend.

**Decentralized** - The index is replicated across every node in the TON network. The on-chain records do not depend on the website backend.

**Censorship-resistant** - Data stored on blockchain is immutable. A registered Bag ID cannot be changed. The wallet that registered it can edit its title, category and visibility.

**Trustless** - The smart contract has no owner and no admin. No one has special privileges. It runs autonomously according to its code.

**Permissionless** - Anyone can register a bag. No account needed, no approval process. Connect a wallet and fund the registration in GRAM. The amount covers execution and storage; surplus is refunded automatically.

The problem with torrent indexes has always been centralization - servers get seized, domains get blocked, operators get arrested. piracy.ton solves this by putting the index on blockchain, making it truly unstoppable.

## Smart Contract

### Architecture

The contract uses the Master-Item pattern, similar to NFT Collections on TON. A single BagRegistry contract (master) deploys a new BagItem contract (child) for each registered bag. Each wallet can register a given Bag ID once. The same bag can be registered by different wallets, with separate contracts.

### Features

- Permissionless - anyone can add bags
- Fully decentralized - no owner, no admin
- Fees - execution and storage funding, with automatic surplus refunds
- Immutable - contract code cannot be changed
- Editable - the registering wallet controls the title, category and visibility

V3 handles new registrations. Bags registered through V2 remain available in read-only mode in the app.

### Categories

Categories are text labels of 1–16 characters (`a-z`, `0-9`, `-`). The frontend suggests:

| Name | Description |
|------|-------------|
| video | Movies, TV shows |
| audio | Music, podcasts |
| apps | Software |
| games | Video games |
| books | E-books, documents |
| other | Everything else |

### Messages

**Publish (`0x50554233`)** - Register a bag (sent to BagRegistry).

```
queryId: uint64, bagId: uint256, presentation: cell
```

**UpdatePublication (`0x55504433`)** - Update a registered bag (sent to BagItem, registering wallet only).

```
queryId: uint64, expectedRevision: uint64, presentation: cell
```

Both messages use the same presentation fields:

```
title: string, category: string, visible: bool
```

### Storage Layout

Data stored on-chain in smart contracts.

**BagRegistry (Master)**

| Field | Type | Description |
|-------|------|-------------|
| `version` | uint16 | Contract version |
| `footprint` | RegistryFootprint? | Cached code sizes used to calculate funding |

**BagItem (Child)**

| Field | Type | Description |
|-------|------|-------------|
| `identity` | cell | Registry address, registering wallet and Bag ID |
| `content` | cell? | Registration time, revision and presentation |
| `codeFootprint` | CodeFootprint? | Cached code size used to calculate funding |

**Identity and content**

| Field | Type | Description |
|-------|------|-------------|
| `registry` | address | Parent registry |
| `uploader` | address | Wallet that registered the bag |
| `bagId` | uint256 | TON Storage bag hash |
| `createdAt` | uint32 | Registration time (Unix) |
| `revision` | uint64 | Revision checked on updates |
| `presentation` | cell | Title, category and visibility |

File sizes, file lists and other TON Storage metadata are fetched by the backend, rather than stored in V3 contracts.

### Getters

**BagRegistry:**

| Method | Returns |
|--------|---------|
| `get_publication_address(uploader, bagId)` | BagItem contract address |
| `get_publish_funding(uploader, bagId, presentation)` | Required registration funding and storage reserve |
| `get_version()` | Contract version |
| `get_item_code()` | BagItem code |
| `get_balance()` | Contract balance |

**BagItem:**

| Method | Returns |
|--------|---------|
| `get_publication()` | Identity, initialization status, registration time, revision and presentation |
| `get_funding(presentation)` | Required update funding and storage reserve |
| `get_version()` | Contract version |
| `get_balance()` | Contract balance |

### Events

External out messages for indexers:

| Event | Opcode |
|-------|--------|
| `PublicationCreated` | `0x30000001` |
| `PublicationUpdated` | `0x30000002` |

## Live

| | |
|---|---|
| **V1 contract (legacy)** | [`EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S`](https://tonviewer.com/EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S) |
| **Website** | [piracy.ton](http://piracy.ton) (requires TON Proxy) |

| **V3 source** | [BagRegistry](contracts/v3/contracts/BagRegistry.tolk) · [BagItem](contracts/v3/contracts/BagItem.tolk) |

## Frontend / Backend

**Frontend** - Static HTML/CSS/JS hosted on TON Storage
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect) for wallet integration
- Builds transaction payloads client-side

**Backend** - Node.js API and worker
- Express API serving the cached bag index
- Worker syncing V2/V3 contracts and following transactions via TonCenter
- TON Storage metadata fetched through a local Storage API
- SQLite for the index, cache and persistent tasks

## How to Run a Mirror

Anyone can run their own mirror. The contract is the source of truth.

### Polling

1. Read BagRegistry transactions for `InitializePublication` messages (`0x494E4933`)
2. Derive each BagItem address with `get_publication_address(uploader, bagId)`
3. Read `get_publication()` on the BagItem and check that it is initialized
4. Store the bag data and recheck known BagItems for updates

### Webhooks

Listen for external out messages from BagItem contracts:

| Opcode | Event | Action |
|--------|-------|--------|
| `0x30000001` | `PublicationCreated` | New bag registered, fetch its data |
| `0x30000002` | `PublicationUpdated` | Bag updated, refresh its data |

Check the final contract state before updating the index.

## Philosophy

> "Information is power. But like all power, there are those who want to keep it for themselves."
> — Aaron Swartz

This project exists because knowledge should be free and censorship resistance matters.

## Contributing

Fork, code, PR. Keep it simple.

## License

[MIT](LICENSE)

## Links

- [TON Storage](https://docs.ton.org/develop/dapps/ton-storage)
- [Tolk Language](https://docs.ton.org/develop/tolk)
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect)
