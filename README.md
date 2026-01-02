# piracy.ton

[![TON](https://img.shields.io/badge/TON-Mainnet-0088CC?logo=ton&logoColor=white)](https://ton.org)
[![Tolk](https://img.shields.io/badge/Tolk-1.0-purple)](https://docs.ton.org/develop/tolk)
[![Contract](https://img.shields.io/badge/Contract-Verified-brightgreen)](https://tonviewer.com/EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S)
[![License](https://img.shields.io/badge/License-Unlicense-blue)](LICENSE)

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

The files themselves live on TON Storage, a peer-to-peer network similar to BitTorrent. The index - the registry of what bags exist, their names, sizes, and hashes - lives on the TON blockchain as a smart contract. The frontend is hosted on a .ton domain. There is no central server anywhere in the stack.

**Decentralized** - The index is replicated across every node in the TON network. There is no server to take down.

**Censorship-resistant** - Data stored on blockchain is immutable. Once a bag is registered, it cannot be deleted or modified by anyone.

**Trustless** - The smart contract has no owner and no admin. No one has special privileges. It runs autonomously according to its code.

**Permissionless** - Anyone can register a bag. No account needed, no approval process. Connect a wallet, pay ~0.015 TON in gas, and your bag is indexed permanently.

The problem with torrent indexes has always been centralization - servers get seized, domains get blocked, operators get arrested. piracy.ton solves this by putting the index on blockchain, making it truly unstoppable.

## Smart Contract

### Architecture

The contract uses the Master-Item pattern, similar to NFT Collections on TON. A single BagRegistry contract (master) deploys a new BagItem contract (child) for each registered bag. Each bag has its own contract address, enabling unlimited scalability without dictionary size limits.

### Features

- Permissionless - anyone can add bags
- Fully decentralized - no owner, no admin
- Low cost - ~0.015 TON per registration (gas only)
- Immutable - contract code cannot be changed

### Categories

| ID | Name | Description |
|----|------|-------------|
| 0 | video | Movies, TV shows |
| 1 | audio | Music, podcasts |
| 2 | apps | Software |
| 3 | games | Video games |
| 4 | books | E-books, documents |
| 5 | other | Everything else |

### Messages

**AddBag (0x00000001)** - Register a new bag (sent to BagRegistry)

```
bag_id: uint256, name: cell, category: uint8, description: cell,
bag_size: uint64, files_count: uint32, files: cell,
piece_size: uint32, merkle_hash: uint256, dir_name: cell
```

**DeactivateBag (0x00000010)** - Deactivate a bag (sent to BagItem, uploader only)

### Getters

**BagRegistry:**

| Method | Returns |
|--------|---------|
| `get_total()` | Total bags count |
| `get_bag_address(index)` | BagItem contract address |
| `get_balance()` | Contract balance |

**BagItem:**

| Method | Returns |
|--------|---------|
| `get_bag_data()` | (init, index, registry, bag_id, name, category, uploader, timestamp, active) |
| `get_storage_metadata()` | (description, size, files_count, files, piece_size, merkle_hash, dir_name) |
| `is_active()` | -1 active, 0 inactive |

### Events

External out messages for indexers:

| Event | Opcode |
|-------|--------|
| BagIndexed | `0x10000001` |
| BagRemoved | `0x10000002` |

## Live

| | |
|---|---|
| **Contract** | [`EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S`](https://tonviewer.com/EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S) |
| **Website** | [piracy.ton](https://piracy.ton) (requires TON Proxy) |

## Frontend / Backend

**Frontend** - Static HTML/CSS/JS hosted on TON Storage
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect) for wallet integration
- Builds transaction payloads client-side

**Backend** - Node.js API server
- Express API serving bag data
- SQLite database for caching
- Syncs from blockchain via TonCenter API

## How to Run a Mirror

Anyone can run their own mirror. The contract is the source of truth.

### Polling

1. Call `get_total()` on BagRegistry to get bag count
2. For each index, call `get_bag_address(index)` to get BagItem address
3. Call `get_bag_data()` and `get_storage_metadata()` on each BagItem
4. Store in your database

### Webhooks

Listen for external out messages from BagItem contracts:

| Opcode | Event | Action |
|--------|-------|--------|
| `0x10000001` | BagIndexed | New bag added, fetch its data |
| `0x10000002` | BagRemoved | Bag deactivated, update status |

Use TONAPI webhooks or similar service to receive these events.

## Philosophy

> "Information is power. But like all power, there are those who want to keep it for themselves."
> — Aaron Swartz

This project exists because knowledge should be free and censorship resistance matters.

## Contributing

Fork, code, PR. Keep it simple.

## License

Unlicense (Public Domain)

## Links

- [TON Storage](https://docs.ton.org/develop/dapps/ton-storage)
- [Tolk Language](https://docs.ton.org/develop/tolk)
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect)
