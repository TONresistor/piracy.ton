# piracy.ton

[![TON](https://img.shields.io/badge/TON-Mainnet-0088CC?logo=ton&logoColor=white)](https://ton.org)
[![Tolk](https://img.shields.io/badge/Tolk-1.0-purple)](https://docs.ton.org/develop/tolk)
[![Acton](https://img.shields.io/badge/Acton-1.0-orange)](https://acton.build)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

## About

On-chain registry of [TON Storage]([https://docs.ton.org/develop/dapps/ton-storage](https://docs.ton.org/blockchain-basics/primitives/web3/ton-storage)) bags. Files live on the TON Storage peer-to-peer network; the index (bag IDs, names, sizes, hashes) lives on the TON blockchain. The frontend is served from a `.ton` domain.

The smart contract has no owner and no admin. Anyone can register a bag. The registry never accumulates funds: the uploader pays for the child contract's storage rent, the surplus is refunded automatically, and deactivation refunds the residual balance back to the uploader.

## Smart Contract

### Architecture

Master-Item pattern (like NFT Collections on TON). A single `BagRegistry` deploys a new `BagItem` per registered bag, so each bag has its own contract address and the design scales without dictionary-size limits.

Tolk 1.0 contracts built with Acton 1.0. The `BagItem` bytecode is embedded into `BagRegistry` at compile time (`gen/BagItem.code`), so the child code is immutable and not a storage field.

### Features

- Permissionless: anyone can register a bag.
- Owner-less: no admin, no privileged role, no upgrade path.
- No locked funds: every surplus is refunded; deactivation refunds the child's residual balance.
- Rechargeable: `BagItem` accepts empty-body top-ups so storage rent can always be paid.

### Economics

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_ADD_BAG_VALUE` | 0.10 TON | Minimum value an `AddBag` must carry |
| `ITEM_FUNDING` | 0.07 TON | Value forwarded to each new `BagItem` |
| `MIN_REGISTRY_BALANCE` | 0.05 TON | Registry's own rent reserve |
| `DEACTIVATED_FLOOR` | 0.005 TON | Rent floor kept by a deactivated `BagItem` |

On every `AddBag` the registry reserves exactly `MIN_REGISTRY_BALANCE`, deploys the child with `ITEM_FUNDING`, emits an indexer event, and refunds the rest to the uploader (send mode `128 | 2`). On `DeactivateBag` the child does the same, keeping only `DEACTIVATED_FLOOR` and refunding the rest. Real cost of a registration: about `ITEM_FUNDING` plus gas. Deactivation typically nets the uploader's gas back to near zero.

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

**AddBag** (opcode `0x41444247`, "ADBG"). Registers a new bag. Sent to `BagRegistry`. Must carry at least `MIN_ADD_BAG_VALUE`.

| Field | Type | Description |
|-------|------|-------------|
| `bagId` | uint256 | TON Storage bag hash (non-zero) |
| `category` | uint8 | Category ID, 0..5 |
| `name` | cell | Bag display name (snake-format string cell) |
| `metadata` | Cell\<BagMetadata\> | TON Storage technical metadata (one ref) |

**DeactivateBag** (opcode `0x44454143`, "DEAC"). Sent to a `BagItem` by its uploader. Reverts with `NotFromUploader` (271) for any other sender, or `AlreadyInactive` (272) on a re-call.

**BagItemInitParams** (opcode `0x42495F49`, "BI_I"). Internal one-shot init from `BagRegistry` to a freshly deployed `BagItem`. Not user-facing.

### Storage layout

`BagRegistry`: a single counter. The `BagItem` code is embedded in the contract code, not in storage.

| Field | Type |
|-------|------|
| `nextBagIndex` | uint64 |

`BagItem`: union with a 1-bit `Either` discriminant. Tag `0` is not yet initialized, tag `1` is initialized.

Variant 0, `BagItemDataNotInitialized`:

| Field | Type |
|-------|------|
| `bagIndex` | uint64 |
| `registryAddress` | address |

Variant 1, `BagItemDataInitialized`:

| Field | Type |
|-------|------|
| `bagIndex` | uint64 |
| `registryAddress` | address |
| `bagId` | uint256 |
| `name` | cell (ref) |
| `category` | uint8 |
| `uploaderAddress` | address |
| `timestamp` | uint64 |
| `isActive` | bool |
| `metadata` | Cell\<BagMetadata\> |

`BagMetadata`, referenced from `AddBag.metadata`, `BagItemInitParams.metadata`, and `BagItemDataInitialized.metadata`:

| Field | Type | Description |
|-------|------|-------------|
| `description` | cell (ref) | Bag description |
| `bagSize` | uint64 | Total size in bytes |
| `filesCount` | uint32 | Number of files |
| `files` | cell (ref) | Dictionary: file index to (name, size) |
| `pieceSize` | uint32 | TON Storage piece size |
| `merkleHash` | uint256 | Merkle root hash |
| `dirName` | cell (ref) | Root directory name |

### Getters

`BagRegistry`:

| Method | Returns | Notes |
|--------|---------|-------|
| `get_total()` | `int` | Total bags ever registered |
| `get_bag_address(bagIndex)` | `address` | Throws `IndexOutOfRange` (260) outside `[0, nextBagIndex)` |
| `get_balance()` | `int` | Hovers around `MIN_REGISTRY_BALANCE` |
| `get_item_code()` | `cell` | The embedded BagItem code |

`BagItem`:

| Method | Returns | Notes |
|--------|---------|-------|
| `get_bag_data()` | `BagDataReply` | Full identity and status; clean sentinels while uninitialized |
| `get_static_data()` | `StaticDataReply` | `bagIndex`, `registryAddress`; valid in both states |
| `get_storage_metadata()` | `StorageMetadataReply` | TON Storage technical fields |
| `is_active()` | `bool` | `false` while uninitialized or deactivated |

`BagDataReply` fields: `isInitialized: bool`, `bagIndex: uint64`, `registryAddress: address`, `bagId: uint256`, `name: cell`, `category: uint8`, `uploaderAddress: address` (none-address while uninitialized), `timestamp: uint64`, `isActive: bool`.

`StaticDataReply` fields: `bagIndex: uint64`, `registryAddress: address`.

`StorageMetadataReply` fields: `isInitialized: bool`, `description: cell`, `bagSize: uint64`, `filesCount: uint32`, `files: cell`, `pieceSize: uint32`, `merkleHash: uint256`, `dirName: cell`.

### Events

External-out messages for indexers and mirrors.

**BagIndexedEvent** (opcode `0x10000001`). Emitted by `BagRegistry` on registration. Slim payload; indexers fetch the full TON Storage metadata via `BagItem.get_storage_metadata` on demand.

| Field | Type |
|-------|------|
| `bagIndex` | uint64 |
| `bagId` | uint256 |
| `category` | uint8 |
| `uploader` | address |
| `timestamp` | uint64 |
| `name` | cell (ref) |

**BagRemovedEvent** (opcode `0x10000002`). Emitted by `BagItem` on deactivation.

| Field | Type |
|-------|------|
| `bagIndex` | uint64 |
| `removedBy` | address |

### Error codes

User exit codes in the 256..399 range. Unknown opcodes throw the standard `0xFFFF`.

| Code | Name | Source | Condition |
|------|------|--------|-----------|
| 256 | `InsufficientValue` | BagRegistry | `AddBag` value below `MIN_ADD_BAG_VALUE` |
| 257 | `InvalidBagId` | BagRegistry | `bagId == 0` |
| 258 | `InvalidCategory` | BagRegistry | `category > 5` |
| 259 | `MetadataTooLarge` | BagRegistry | User cell tree exceeds size bounds |
| 260 | `IndexOutOfRange` | BagRegistry | `get_bag_address` out of `[0, nextBagIndex)` |
| 270 | `NotFromRegistry` | BagItem | Init not from the recorded registry |
| 271 | `NotFromUploader` | BagItem | `DeactivateBag` not from the recorded uploader |
| 272 | `AlreadyInactive` | BagItem | `DeactivateBag` on a bag already inactive |

## Live

| | |
|---|---|
| Website | [piracy.ton](https://piracy.ton) (requires TON Proxy) |
| Contract (v1, deprecated) | [`EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S`](https://tonviewer.com/EQCLM6BxxUbWnuLCGzIXdADeMRduf4z4P-WoJe-nNhASSs9S), frozen at git tag `v1.0.0` |
| Contract (v2) | Pending redeploy. v2 has a different code hash, so the address changes. Run `acton script scripts/deployRegistry.tolk --net mainnet` and update this field. |

## Frontend / Backend

- Frontend: static HTML/CSS/JS hosted on TON Storage. TON Connect for wallet integration. Transaction payloads built client-side.
- Backend: Node.js, Express, SQLite. Syncs from the chain via TonCenter and serves a cached read API.

## Development

All contract commands run from `contracts/`.

```sh
acton build
acton test                                      # 81 tests
acton test --coverage                           # gated >= 85% (Acton.toml)
acton test --baseline-snapshot gas-baseline.json \
           --fail-on-diff --exclude 'tests/fuzz.test.tolk'
acton test --mutate --mutate-contract BagItem   # gated >= 80%
acton test --mutate --mutate-contract BagRegistry
acton test --fork-net testnet                   # economic invariants vs real fees
acton check                                     # lint
acton fmt --check
acton script scripts/deployRegistry.tolk                    # local emulation
acton script scripts/deployRegistry.tolk --net testnet      # broadcast
acton verify BagRegistry --address <addr> --net mainnet     # publish sources
```

The pre-commit hook (`.githooks/pre-commit`) runs `acton check` and `acton fmt --check` on commits that touch contract sources. Enable with `acton hooks install --project-root .`. CI (`.github/workflows/contracts.yml`) gates on build, lint, fmt, tests with coverage, gas baseline (no drift), and mutation (on PR).

### Verification status

| Gate | Result |
|------|--------|
| Tests | 81 pass in 7 files |
| Line coverage | 99.4% |
| Mutation, non-equivalent | 100% on both contracts |
| Fuzz | 256 runs x 2 seeds, no crashes |
| Fork tests | testnet and mainnet, economic invariants hold |
| Gas baseline | committed, CI no-drift gate |

## Running a mirror

The contract is the source of truth. Two strategies.

Polling: for each `i` in `[0, get_total())`, call `BagRegistry.get_bag_address(i)`, then `BagItem.get_bag_data()` and `get_storage_metadata()`. Skip entries where `isInitialized == false` (transient) or `isActive == false` (deactivated). `get_bag_address` throws `IndexOutOfRange` (260) for any index outside the range; bound your loop with `get_total()`.

Webhooks: subscribe to external-out messages and route on the 32-bit opcode prefix.

| Opcode | Event | Payload |
|--------|-------|---------|
| `0x10000001` | `BagIndexedEvent` | `bagIndex`, `bagId`, `category`, `uploader`, `timestamp`, `name` (ref) |
| `0x10000002` | `BagRemovedEvent` | `bagIndex`, `removedBy` |

The event is intentionally slim. Resolve the TON Storage metadata on demand via `BagItem.get_storage_metadata`.

## License

[MIT](LICENSE), Copyright (c) 2026 Digital Resistance.

## Links

- [TON Storage](https://docs.ton.org/develop/dapps/ton-storage)
- [Tolk](https://docs.ton.org/develop/tolk)
- [Acton](https://acton.build)
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect)
