# piracy.ton

[![TON](https://img.shields.io/badge/TON-Mainnet-0088CC?logo=ton&logoColor=white)](https://ton.org)
[![Tact](https://img.shields.io/badge/Tact-1.0-green)](https://tact-lang.org)
[![Contract](https://img.shields.io/badge/Contract-Verified-brightgreen)](https://tonviewer.com/EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz)
[![License](https://img.shields.io/badge/License-Unlicense-blue)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)

A decentralized, censorship-resistant index for TON Storage. Inspired by The Pirate Bay, built for the Web3 era.

```
 ____  _                       _
|  _ \(_)_ __ __ _  ___ _   _ | |_ ___  _ __
| |_) | | '__/ _` |/ __| | | || __/ _ \| '_ \
|  __/| | | | (_| | (__| |_| || || (_) | | | |
|_|   |_|_|  \__,_|\___|\__, (_)__\___/|_| |_|
                        |___/
```

## What is this?

piracy.ton is a permissionless registry for [TON Storage](https://docs.ton.org/develop/dapps/ton-storage) bags. Think BitTorrent meets blockchain:

- **Bags** are stored on TON Storage (P2P network, like torrents)
- **Index** is stored on TON Blockchain (immutable, censorship-resistant)
- **Frontend** is hosted on .ton domain (decentralized DNS)

No central server can be taken down. No single point of failure.

## Live

| | |
|---|---|
| **Website** | [piracy.ton](https://piracy.ton) (requires TON Proxy) |
| **Contract** | [`EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz`](https://tonviewer.com/EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz) |

---

## Project Structure

```
piracy.ton/
├── frontend/             # Static website (HTML/CSS/JS)
│   ├── index.html        # Homepage - bag listing
│   ├── add.html          # Add new bag form
│   ├── bag.html          # Single bag details
│   ├── css/style.css     # Stylesheets
│   ├── js/               # Client-side JavaScript
│   │   ├── app.js        # Homepage logic
│   │   ├── add.js        # Add bag + wallet
│   │   ├── bag.js        # Bag details
│   │   ├── contract.js   # Contract encoder
│   │   └── i18n.js       # Internationalization
│   └── lang/             # Translations (en, fr, ru, zh, es, ar)
├── backend/              # Node.js API server
│   ├── server.js         # Express API
│   ├── db.js             # SQLite database
│   └── contract-sync.js  # Blockchain sync
├── contracts/            # Tact smart contracts
│   ├── BagRegistry.tact  # Main contract source
│   └── build/            # Compiled output
└── wallet/               # Deployment scripts
```

---

## Quick Start

### Backend

```bash
cd backend
npm install
npm start
```

Server runs on `http://localhost:3005`

**Environment variables:**
- `PORT` - Server port (default: 3005)
- `TON_API_KEY` - Toncenter API key (optional)
- `TON_STORAGE_API` - TON Storage gateway (default: `http://127.0.0.1:9090/api/v1`)

### Frontend

Serve the `frontend/` directory with any static server:

```bash
cd frontend
python3 -m http.server 8080
```

No build step required - vanilla HTML/CSS/JS.

---

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │ ←──→ │   Backend   │ ←──→ │  TON Chain  │
│  (Frontend) │      │  (Node.js)  │      │  (Contract) │
└─────────────┘      └─────────────┘      └─────────────┘
       │                    │
       │                    ↓
       │             ┌─────────────┐
       └───────────→ │ TON Storage │
                     │    (P2P)    │
                     └─────────────┘
```

**Data flow:**
1. User adds bag via frontend → TON Connect → Smart Contract
2. Backend syncs contract → SQLite (cache for fast queries)
3. Frontend displays bags from backend API
4. Downloads go directly to TON Storage P2P

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bags` | List bags (paginated) |
| GET | `/api/bags/:id` | Get bag by ID |
| GET | `/api/bag-info/:bagId` | Get TON Storage metadata |
| GET | `/api/search?q=` | Search by name |
| GET | `/api/categories` | List categories |

**Pagination:** `?page=1&limit=20&category=video`

---

## Smart Contract

### Deployed

| Network | Address |
|---------|---------|
| **Mainnet** | `EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz` |

**Explorer**: [tonviewer.com](https://tonviewer.com/EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz)

### Overview

BagRegistry is a permissionless smart contract that maintains an on-chain index of TON Storage bags. Anyone can register a bag by paying 0.1 TON. The contract stores metadata while actual files remain on TON Storage P2P.

**Features:**
- Permissionless - anyone can add bags
- Censorship-resistant - data is on-chain, immutable
- Transparent - all entries publicly readable
- Low cost - 0.1 TON per registration

### Data Structure

```tact
struct BagEntry {
    bag_id: Int as uint256;    // TON Storage bag ID (64 hex chars)
    name: String;               // Human-readable name
    category: Int as uint8;     // Category (0-5)
    uploader: Address;          // Wallet that registered
    timestamp: Int as uint64;   // Unix timestamp
    active: Bool;               // Soft-delete flag
}
```

### Categories

| ID | Name | Description |
|----|------|-------------|
| 0 | video | Movies, TV shows, clips |
| 1 | audio | Music, podcasts, audiobooks |
| 2 | apps | Software, applications |
| 3 | games | Video games |
| 4 | books | E-books, documents, PDFs |
| 5 | other | Everything else |

### Messages

#### AddBag

Register a new bag in the registry.

```tact
message AddBag {
    bag_id: Int as uint256;
    name: String;
    category: Int as uint8;
}
```

| | |
|---|---|
| Opcode | `0xc4f72ad7` (3304532695) |
| Fee | 0.1 TON minimum |
| Access | Anyone |

**Validation:** bag_id not zero, not duplicate, name not empty, category 0-5

#### DeleteBag

Soft-delete a bag (marks as inactive).

```tact
message DeleteBag {
    index: Int as uint64;
}
```

| | |
|---|---|
| Opcode | `0x43045b6a` |
| Access | Owner only |

#### Withdraw

Withdraw accumulated fees.

```tact
message Withdraw {
    amount: Int as coins;
}
```

| | |
|---|---|
| Opcode | `0xaff90f57` |
| Access | Owner only |

### Getters

| Method | Returns | Description |
|--------|---------|-------------|
| `get_total()` | Int | Total registered bags |
| `get_bag(index)` | BagEntry? | Bag at index (0-based) |
| `bag_exists(bag_id)` | Bool | Check if bag_id exists |
| `get_fee()` | Int | Registration fee (nanoTON) |
| `get_balance()` | Int | Contract balance |

### Usage Example

```javascript
import { beginCell } from '@ton/core';

const CONTRACT = 'EQClKvQu64-7WOj8z5M_JF2cpG1oqH6yaZlGxdAnXWPqVBTz';
const ADDBAG_OPCODE = 3304532695;

// Build AddBag payload
function buildAddBagPayload(bagIdHex, name, category) {
    return beginCell()
        .storeUint(ADDBAG_OPCODE, 32)
        .storeUint(BigInt('0x' + bagIdHex), 256)
        .storeStringRefTail(name)
        .storeUint(category, 8)
        .endCell();
}

// Send via TON Connect
await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{
        address: CONTRACT,
        amount: '120000000',  // 0.12 TON
        payload: buildAddBagPayload(bagId, 'My File', 0).toBoc().toString('base64')
    }]
});
```

### Reading from Contract

```javascript
import { TonClient, Address } from '@ton/ton';
import { TupleBuilder } from '@ton/core';

const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
const address = Address.parse(CONTRACT);

// Get total bags
const totalResult = await client.runMethod(address, 'get_total');
const total = totalResult.stack.readNumber();

// Get bag by index
const builder = new TupleBuilder();
builder.writeNumber(0n);
const bagResult = await client.runMethod(address, 'get_bag', builder.build());
const tuple = bagResult.stack.readTuple();

const bagId = tuple.items[0].toString(16).padStart(64, '0');
const category = Number(tuple.items[2]);
const timestamp = Number(tuple.items[4]);
const active = tuple.items[5] !== 0n;
```

### Building Contract

```bash
cd contracts
npm install
npx @tact-lang/compiler BagRegistry.tact
```

### Security Considerations

- **No content moderation** - contract does not validate bag contents
- **Immutable entries** - once added, entries cannot be fully deleted (only soft-deleted by admin)
- **Admin powers** - owner can soft-delete entries and withdraw fees
- **No upgradability** - contract code is immutable after deployment

---

## Self-Hosting

### Run Your Own Mirror

1. Clone this repo
2. Deploy `frontend/` to any static hosting (IPFS, GitHub Pages, etc.)
3. Update `tonconnect-manifest.json` with your URL
4. (Optional) Run backend for faster listing

The frontend can work standalone by reading directly from the contract.

### Deploy Your Own Contract

```bash
cd wallet
npm install
node generate.js          # Create wallet
# Send TON to wallet address
node deploy-contract.js   # Deploy
```

---

## Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/xyz`)
3. Commit changes (`git commit -am 'Add xyz'`)
4. Push (`git push origin feature/xyz`)
5. Open Pull Request

Or just deploy your own mirror and share the link.

---

## Philosophy

> "Information is power. But like all power, there are those who want to keep it for themselves."
> — Aaron Swartz, Guerilla Open Access Manifesto

This project exists because:
- Knowledge should be free
- Sharing is a moral imperative
- Censorship resistance matters
- Decentralization is resilience

---

## License

**Unlicense** (Public Domain)

```
This is free and unencumbered software released into the public domain.
Anyone is free to copy, modify, publish, use, compile, sell, or distribute
this software, for any purpose, commercial or non-commercial, and by any means.
```

---

## Links

- [TON Storage Docs](https://docs.ton.org/develop/dapps/ton-storage)
- [Tact Language](https://tact-lang.org/)
- [TON Connect](https://docs.ton.org/develop/dapps/ton-connect)
- [Guerilla Open Access Manifesto](https://archive.org/details/GuerillaOpenAccessManifesto)
