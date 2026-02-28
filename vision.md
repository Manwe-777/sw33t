Sw33t is a decentralized files sharing app.

In Sw33t users can join or create channels.
these channels will be the tooldb namespaces to join.
Having channels be a tooldb namespace will separate all data between channels like servers.

Users in these cannels will be able to see or create new categories, categories will be an open access write only (no delete) CRDT list.

the list namespace `{category}.{files}` will have an openly editable files list.

im still thinking if we should have sub categories ? it needs to be a dead simple app

Comments are a must, users need to be able to comment and upvote on files.

Look at the patterns used in tooldb/example for how to make this, but write only CRDT MAP indexes are a must (no delete to avoid tampering the data)

Then if the crdt maps to a comment the owner of the comment is able to edit it.

Use the networking adapter used by the example.

Uses ECDSA user adapter for authentication

## Architecture Decisions

- **Channel ownership**: First user to join = admin, can promote others
- **Channel discovery**: Public (anyone can join by entering channel ID)
- **Authentication**: ECDSA adapter (username/password)
- **File schema**: `{ id, name, description, linkType, link }` (uploader/timestamp from message metadata)
- **Link types**: `www` | `magnet` | `tooldb`
- **Moderation**: Admin-maintained blocklist, clients filter messages locally
- **Upvotes**: MapCRDT with user address as key (one vote per user)
- **Comment editing**: Overwrite only, no version history
- **Structure**: Flat (channel > category > files, no sub-categories)

## Phases

### Phase 1: Connection Test
- Set up ToolDB with `@tool-db/webrtc-network`, `@tool-db/indexeddb-store`
- Simple UI to enter a channel name (topic/namespace)
- Connect to peers via WebRTC (WebTorrent trackers + Nostr relays)
- Display peer count and connection status
- Test: Two browser tabs can see each other as peers

### Phase 2: Authentication
- Integrate `@tool-db/ecdsa-user` for authentication
- Sign up / Sign in flow
- Display user address after login
- Key export button (download private key as JSON for backup)
- Key import option for account restoration

### Phase 3: Channel Admin + Categories
- First user to join a channel becomes admin (stored in frozen namespace `==channel-meta`)
- Admin can set channel name/description
- Admin can promote other users to admin
- Admin can add addresses to blocklist (spam filter)
- Categories as write-only MapCRDT (`categories` key)
- UI to create/browse categories
- Custom verificator: reject `DEL` operations on categories

### Phase 4: Files
- Files as write-only MapCRDT per category (`{categoryId}.files`)
- File schema: `{ id, name, description, linkType, link }`
- UI to add files, browse files in a category
- Display uploader address and timestamp from message metadata

### Phase 5: Comments & Upvotes
- Comments as MapCRDT (`file-{fileId}.comments`)
- Key = `{userAddress}-{timestamp}` (unique per comment)
- Owner can edit their own comment (verificator checks author)
- Upvotes as MapCRDT (`file-{fileId}.upvotes`)
- Key = user address (one vote per user)
- Display upvote count, highlight if current user upvoted

---

## Future: Decentralized File Hosting (Phase 6+)

### The Problem
Currently we only share **links** (URLs, magnet links). The actual files live elsewhere.
What if users could host files directly from their machines and share via P2P?

### Option A: Browser-Based P2P (WebRTC Data Channels)

**How it works:**
- ToolDB already uses WebRTC for peer communication
- WebRTC supports binary data channels (not just signaling)
- Files selected via browser file picker stay in memory
- Peers request chunks, sender streams them over data channel

**Architecture:**
```
1. User selects file → hash computed (SHA-256)
2. File metadata stored in ToolDB: { hash, name, size, chunkSize, chunkCount }
3. User marked as "seeder" in a MapCRDT: seeders[hash][address] = { online: true }
4. Downloaders find seeders via ToolDB, request chunks via WebRTC data channel
5. Chunks verified by hash, reassembled into Blob, offered as download
```

**Pros:**
- Works in browser, no install needed
- Leverages existing ToolDB WebRTC infrastructure
- True P2P, no central server

**Cons:**
- Browser tab must stay open to seed
- Files lost when tab closes (no persistence)
- Large files = high memory usage
- Browser may throttle background tabs

**Complexity:** Medium - needs chunk management, progress tracking, multi-peer download

---

### Option B: Desktop App (Electron or Tauri)

**How it works:**
- Same P2P logic as Option A, but runs as desktop app
- Full filesystem access (no file picker required)
- Background process keeps seeding even when UI closed
- Could integrate with system tray

**Architecture:**
```
1. User adds folder(s) to share
2. App indexes files, computes hashes, stores metadata in ToolDB
3. App runs in background, responds to chunk requests
4. Optional: DHT for peer discovery beyond ToolDB namespace
```

**Pros:**
- Persistent seeding (runs in background)
- Direct filesystem access
- Better performance (no browser sandbox)
- Could watch folders for new files

**Cons:**
- Requires install
- Cross-platform maintenance (Windows/Mac/Linux)
- More complex build/distribution

**Tech choices:**
- **Electron**: Easier (Chromium + Node.js), larger bundle (~150MB)
- **Tauri**: Smaller bundle (~10MB), uses system webview, Rust backend

**Complexity:** High - new codebase, installers, auto-updates

---

### Option C: Hybrid with IPFS

**How it works:**
- Files pinned to IPFS (local node or pinning service)
- CID (content identifier) shared via ToolDB
- Anyone with IPFS can fetch the file

**Architecture:**
```
1. User runs local IPFS node (or uses pinning service like Pinata/web3.storage)
2. File added to IPFS → returns CID
3. CID + metadata stored in ToolDB
4. Downloaders fetch via IPFS gateway or local node
```

**Pros:**
- Content-addressed (same file = same CID, deduplication)
- Large ecosystem, battle-tested
- Gateways provide HTTP fallback
- Persistence via pinning services

**Cons:**
- Extra dependency (IPFS node or service)
- Pinning services have storage limits/costs
- IPFS can be slow for cold content

**Complexity:** Medium - IPFS integration, optional desktop for local node

---

### Option D: WebTorrent Integration

**How it works:**
- WebTorrent creates browser-compatible torrents
- Torrent infohash shared via ToolDB
- Peers connect via WebRTC (same as regular BitTorrent but browser-friendly)

**Architecture:**
```
1. User creates WebTorrent from file(s) in browser
2. Infohash stored in ToolDB along with metadata
3. Other users load torrent via infohash
4. Standard BitTorrent protocol over WebRTC
```

**Pros:**
- Proven protocol (BitTorrent)
- Multi-peer swarm downloading
- Works in browser
- Existing WebTorrent library

**Cons:**
- Same browser limitations (tab must stay open)
- Torrent creation overhead
- Less control over the protocol

**Complexity:** Low-Medium - WebTorrent library handles most logic

---

### Recommendation: Phased Approach

**Phase 6a: WebTorrent (Quick Win)**
- Add "Create Torrent" option alongside existing link types
- Use WebTorrent to create/seed directly in browser
- Store infohash in ToolDB, others can join swarm
- Low effort, immediate value

**Phase 6b: Native Chunk Transfer (ToolDB Native)**
- Build chunk-based transfer over ToolDB's WebRTC
- More control, better integration with existing code
- Seeder status tracked in real-time via CRDT

**Phase 7: Desktop App (Long Term)**
- Tauri app for persistent background seeding
- Folder watching, system tray
- Same codebase (React) with Tauri backend
- Could also run as "headless seeder" on servers

---

### Data Structures for P2P Files

```javascript
// File metadata (stored in ToolDB)
{
  id: "abc123",
  name: "game-assets.zip",
  size: 1024000000, // 1GB
  hash: "sha256-...",
  chunkSize: 1048576, // 1MB chunks
  chunkCount: 977,
  chunkHashes: ["sha256-...", ...], // verify each chunk
  createdAt: 1234567890,
  uploader: "0x..."
}

// Seeder registry (MapCRDT)
// Key: `seeders-{fileHash}`
{
  "0xAddress1": { lastSeen: 1234567890, chunks: "all" },
  "0xAddress2": { lastSeen: 1234567880, chunks: [0, 1, 2, 50, 51] }
}

// Transfer protocol (over WebRTC data channel)
{ type: "REQUEST_CHUNK", fileHash: "...", chunkIndex: 42 }
{ type: "CHUNK_DATA", fileHash: "...", chunkIndex: 42, data: ArrayBuffer }
{ type: "HAVE", fileHash: "...", chunks: [0, 1, 2, ...] }
```

---

### Questions to Explore

1. **ToolDB data channel access**: Can we get raw WebRTC data channels from ToolDB, or need custom signaling?
2. **Chunk verification**: SHA-256 per chunk, or Merkle tree for efficiency?
3. **Incentives**: Should seeders get "reputation" points? (gamification)
4. **Encryption**: E2E encrypt files so only channel members can decrypt?
5. **Storage quotas**: Limit how much one user can share to prevent abuse?
6. **Offline resume**: How to resume partial downloads across sessions?
