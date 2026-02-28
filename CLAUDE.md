# Sw33t - Development Guide

## Project Overview

Sw33t is a decentralized file sharing app built with React and ToolDB. Users join channels (ToolDB namespaces), browse categories, share file links, and interact via comments/upvotes.

## Tech Stack

- **Frontend**: React (Vite) + React Router
- **P2P Database**: ToolDB (npm packages)
- **Network**: `@tool-db/webrtc-network` (WebRTC via WebTorrent trackers + Nostr relays)
- **Storage**: `@tool-db/indexeddb-store` (browser persistence)
- **Auth**: `@tool-db/web3-user` (preferred) or `@tool-db/ecdsa-user` (fallback)

## URL Structure

```
/                       - Home page (join channel form)
/c/{channelId}          - Channel page (connects to sw33t-{channelId} topic)
/c/{channelId}/{categoryId} - Category view within channel (future)
```

The channel ID in the URL maps to the ToolDB topic: `sw33t-{channelId}`

## ToolDB Reference

### Package Versions (npm)

| Package | npm Name | Version |
|---------|----------|---------|
| Core | `tool-db` | ^2.6.3 |
| WebRTC Network | `@tool-db/webrtc-network` | ^1.1.3 |
| IndexedDB Store | `@tool-db/indexeddb-store` | ^1.1.3 |
| ECDSA User | `@tool-db/ecdsa-user` | ^1.1.3 |
| Web3 User | `@tool-db/web3-user` | ^1.1.3 |

Source repo (for reference): `C:\Users\manue\OneDrive\Documentos\GitHub\tool-db\`

### Initialization Pattern

```typescript
import { ToolDb, MapCrdt, ListCrdt } from "tool-db";
import ToolDbWebrtc from "@tool-db/webrtc-network";
import ToolDbIndexedb from "@tool-db/indexeddb-store";
import ToolDbEcdsaUser from "@tool-db/ecdsa-user";

const db = new ToolDb({
  networkAdapter: ToolDbWebrtc,
  storageAdapter: ToolDbIndexedb,
  userAdapter: ToolDbEcdsaUser,
  topic: "sw33t-{channelId}",  // Channel = namespace/topic
  debug: true,
});
```

### Namespace Types

| Type | Format | Use Case |
|------|--------|----------|
| Public | `key` | Anyone can write |
| Private | `:address.key` | Only owner can write |
| Frozen | `==key` | First writer owns permanently |

### CRDT Operations

**MapCRDT** (for categories, files, comments, upvotes):
```typescript
const map = new MapCrdt<T>(userAddress);
map.SET("key", value);  // Add/update
map.DEL("key");         // Delete (we block this via verificator)
map.value;              // Get current state as object

await db.putCrdt("namespace-key", map, false);  // false = public
await db.getCrdt("namespace-key", map, false);  // Fetch & merge
```

**ListCRDT** (if needed):
```typescript
const list = new ListCrdt<T>(userAddress);
list.PUSH(value);       // Add to end
list.INS(value, index); // Insert at position
list.DEL(index);        // Delete by index
list.value;             // Get current state as array
```

### Write-Only Verificator (Block Deletions)

```typescript
import { VerificationData, MapChanges } from "tool-db";

function writeOnlyVerificator(
  msg: VerificationData<MapChanges<any>[]>
): Promise<boolean> {
  return new Promise((resolve) => {
    const isValid = msg.v.every((change) => change.t !== "DEL");
    resolve(isValid);
  });
}

// Apply to all keys starting with prefix
db.addCustomVerification<MapChanges<any>[]>("categories", writeOnlyVerificator);
db.addCustomVerification<MapChanges<any>[]>("files-", writeOnlyVerificator);
```

### Owner-Only Edit Verificator (For Comments)

```typescript
function ownerEditVerificator(
  msg: VerificationData<MapChanges<any>[]>
): Promise<boolean> {
  return new Promise((resolve) => {
    const isValid = msg.v.every((change) => {
      if (change.t === "DEL") return false;  // No deletes
      // Key must start with author's address (owner can edit own)
      return change.k.startsWith(change.a);
    });
    resolve(isValid);
  });
}

db.addCustomVerification<MapChanges<any>[]>("comments-", ownerEditVerificator);
```

### Authentication

```typescript
// ECDSA (username + password)
await db.signUp("username", "password");
await db.signIn("username", "password");
await db.anonSignIn();  // Anonymous
await db.keysSignIn(privateKeyHex, "username");  // Import keys

// Get current user
const address = db.userAccount.getAddress();
const username = db.userAccount.getUsername();
```

### Data Subscriptions

```typescript
// Subscribe to updates
db.subscribeData("categories");

// Listen for changes
db.addKeyListener("categories", (msg) => {
  console.log("Data:", msg.v);
  console.log("Author:", msg.a);
  console.log("Timestamp:", msg.t);
});

// Initial fetch
await db.getData("categories");
```

### Message Metadata

Every ToolDB message contains:
- `msg.a` - Author address (uploader)
- `msg.t` - Timestamp
- `msg.s` - Signature
- `msg.v` - Value/data

## Data Model

### Channel Metadata (Frozen Namespace)
```typescript
// Key: ==channel-meta
interface ChannelMeta {
  name: string;
  description: string;
  admins: string[];      // Array of admin addresses
  blocklist: string[];   // Blocked user addresses
  createdBy: string;
  createdAt: number;
}
```

### Categories (MapCRDT)
```typescript
// Key: categories
// MapCRDT<CategoryData>
interface CategoryData {
  id: string;
  name: string;
  description: string;
}
```

### Files (MapCRDT per category)
```typescript
// Key: files-{categoryId}
// MapCRDT<FileData>
interface FileData {
  id: string;
  name: string;
  description: string;
  linkType: "www" | "magnet" | "tooldb";
  link: string;
}
// Uploader + timestamp from message metadata (msg.a, msg.t)
```

### Comments (MapCRDT per file)
```typescript
// Key: comments-{fileId}
// MapCRDT<CommentData>
// Map key = {userAddress}-{timestamp}
interface CommentData {
  text: string;
  editedAt?: number;
}
```

### Upvotes (MapCRDT per file)
```typescript
// Key: upvotes-{fileId}
// MapCRDT<boolean>
// Map key = userAddress (one vote per user)
```

## Implementation Phases

### Phase 1: Connection Test (Complete)
- [x] Initialize React app with Vite
- [x] Install ToolDB packages (using local packages from ../tool-db)
- [x] Create connection UI (enter channel name)
- [x] Display peer count and status (using `db.network.clientToSend`)
- [x] Test two tabs syncing
- [x] URL-based routing (/c/{channelId})

### Phase 2: Authentication (Complete)
- [x] ECDSA auth integration (via @tool-db/ecdsa-user)
- [x] Sign up / Sign in UI (AuthModal component)
- [x] Display user address and username (UserPanel component)
- [x] Key export (download encrypted keys as JSON)
- [x] Key import from file for account restoration
- [x] Session restore from localStorage

### Phase 3: Channel Admin + Categories (Complete)
- [x] First user = admin logic
- [x] Channel metadata (frozen namespace)
- [x] Admin panel UI
- [x] Bitwise permission system (6 permissions)
- [x] Permission management UI for creator
- [x] Server-side verificators for permission enforcement
- [ ] Blocklist management UI (users)
- [x] Categories CRUD (write-only)
- [x] Categories UI (sidebar list + create form)

### Phase 4: Files (Complete)
- [x] Files per category (write-only MapCRDT)
- [x] Add file form (name, description, linkType, link)
- [x] File listing with metadata
- [x] Link types: www, magnet, tooldb
- [x] Copy link and open link actions
- [x] Admin file blocklist (soft delete via `{categoryId}_blocklist`)

### Phase 5: Comments & Upvotes
- [ ] Comments with owner-edit verificator
- [ ] Upvotes (one per user)
- [ ] UI for commenting and voting

## Key Files to Reference

**ToolDB Example:**
- `tool-db/example/src/index.tsx` - Initialization with verificators
- `tool-db/example/src/components/Login.tsx` - Auth flow
- `tool-db/example/src/components/Group.tsx` - CRDT patterns
- `tool-db/example/src/components/WebRtcDebug.tsx` - Peer count display
- `tool-db/packages/tool-db/lib/crdt/mapCrdt.ts` - MapCRDT implementation
- `tool-db/packages/webrtc-network/lib/index.ts` - Network adapter

**Sw33t Source:**
- `src/lib/tooldb.js` - ToolDB connection manager
- `src/lib/channelService.js` - Channel metadata and categories service
- `src/lib/fileService.js` - File CRUD operations per category
- `src/lib/permissions.js` - Bitwise permission system constants and helpers
- `src/lib/userService.js` - User profile storage and lookup via ToolDB
- `src/lib/torrentService.js` - WebTorrent client for P2P file sharing
- `src/hooks/useProfile.js` - React hook for fetching user profiles
- `src/context/AuthContext.jsx` - Authentication context provider
- `src/components/HomePage.jsx` - Channel join form
- `src/components/ChannelPage.jsx` - Connected channel view with sidebar
- `src/components/AuthModal.jsx` - Sign up/Sign in modal
- `src/components/UserPanel.jsx` - User info and key export
- `src/components/CategoryList.jsx` - Category sidebar with create form
- `src/components/FileList.jsx` - File listing in a category (supports torrent downloads)
- `src/components/AddFileModal.jsx` - Form to share links or upload files via WebTorrent
- `src/components/PermissionEditor.jsx` - UI for editing admin permissions
- `src/components/AdminItem.jsx` - Admin list item with profile lookup
- `src/App.jsx` - Router configuration
- `src/App.css` - Main stylesheet

## ToolDB Constraints

### Key Naming
ToolDB keys **cannot include dots (`.`)**. When constructing keys from user input (like category names), sanitize them:

```javascript
function sanitizeKey(key) {
  return key.replace(/\./g, "_");
}

// Example: "leagues-of-votann.files" → "leagues-of-votann_files"
const filesKey = `${sanitizeKey(categoryId)}_files`;
```

### No Delete Operations
ToolDB CRDTs are write-only (no delete) to prevent data tampering. To "delete" items, use a **blocklist pattern**:

```javascript
// Store blocked file IDs in a separate key
const blocklistKey = `${categoryId}_blocklist`;

// Block a file (admin only)
await db.putData(blocklistKey, { ...existing, [fileId]: { blockedBy, blockedAt } });

// Filter blocked files in UI
const visibleFiles = files.filter(f => !(f.id in blocklist));
```

## Permission System

### Bitwise Permissions
Permissions are stored as a single number using bitwise flags. This allows multiple permissions to be combined compactly:

```javascript
// Permission constants (powers of 2)
BLOCK_FILES:        1   // 0b0000001
BLOCK_USERS:        2   // 0b0000010
PROMOTE_ADMINS:     4   // 0b0000100
DEMOTE_ADMINS:      8   // 0b0001000
EDIT_CHANNEL:      16   // 0b0010000
CREATE_CATEGORIES: 32   // 0b0100000
DELETE_CATEGORIES: 64   // 0b1000000 - Can archive/delete categories

// Combine: BLOCK_FILES + BLOCK_USERS = 3 (0b0000011)
// Check: (permissions & BLOCK_FILES) !== 0
```

### Category Deletion
Categories can be "soft deleted" (archived) by admins with DELETE_CATEGORIES permission. Since ToolDB uses CRDTs and data can't be truly deleted, deleted categories are marked with metadata:

```javascript
category.deleted = {
  deletedAt: timestamp,
  deletedBy: userAddress
};
```

- Deleted categories appear greyed out with strikethrough to admins
- Admins with DELETE_CATEGORIES permission can restore deleted categories
- Regular users don't see deleted categories at all
- Files within deleted categories still exist but are inaccessible via the category

### Admin Structure
Admins are stored as an object mapping addresses to permission numbers:

```javascript
{
  creator: "0x123...",
  admins: {
    "0x123...": 63,  // Creator - all permissions (0b111111)
    "0x456...": 3,   // Moderator - block files + users (0b000011)
    "0x789...": 35,  // Admin - block files + create categories (0b100011)
  }
}
```

### Permission Checks
```javascript
import { userHasPermission, PERMISSIONS } from "./channelService";

// Check specific permission
if (userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_FILES)) {
  // Can block files
}

// Check in UI
canBlockFiles={userHasPermission(channelMeta, user?.address, PERMISSIONS.BLOCK_FILES)}
```

### Server-Side Verification (Verificators)
Client-side permission checks can be bypassed. ToolDB uses **verificators** - validation functions that run on each peer before accepting writes:

```javascript
// Verificator function signature
function blocklistVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a; // Who is writing
    const key = msg.k;           // Key being written to
    const value = msg.v;         // Value being written
    
    // Check permission and resolve(true) or resolve(false)
    if (hasPermission(userPerms, PERMISSIONS.BLOCK_FILES)) {
      resolve(true);  // Accept write
    } else {
      resolve(false); // Reject write
    }
  });
}

// Register verificator for keys matching prefix
db.addCustomVerification("_blocklist", blocklistVerificator);
```

**Current verificators:**
- `_blocklist` keys: Requires `BLOCK_FILES` permission
- `categories` key: Requires `CREATE_CATEGORIES` permission for new entries

**Note:** The `==channel-meta` key uses ToolDB's built-in frozen namespace (`==` prefix) - only the original creator can write to it.

## User Profiles

User profiles are stored in ToolDB so other users can see display names and avatars.

### Profile Storage
```javascript
// Profile key format: {address}_profile
const profileKey = `${address}_profile`;

// Profile structure
{
  address: "0x123...",
  username: "Alice",
  avatar: "https://...",
  updatedAt: 1234567890
}
```

### Looking Up Other Users
```javascript
import { getProfile, useProfile } from "../lib/userService";

// Async function
const profile = await getProfile(address);

// React hook (auto-subscribes to updates)
const { profile, loading } = useProfile(address);
const displayName = profile?.username || "Unknown";
```

### Updating Own Profile
Profile updates happen automatically when changing username/avatar in AuthContext:
```javascript
const { changeUsername, changeAvatar } = useAuth();
await changeUsername("New Name");  // Saves to ToolDB
await changeAvatar("https://...");  // Saves to ToolDB
```

## WebTorrent Integration (P2P File Sharing)

Users can upload files directly from their browser and share them via WebTorrent.

### How It Works
1. User selects a file → WebTorrent creates a torrent and starts seeding
2. Infohash + metadata stored in ToolDB
3. Other users see the file in the list and can download via WebTorrent
4. Downloads happen peer-to-peer via WebRTC

### File Metadata Schema (torrent type)
```javascript
{
  id: "abc123",
  name: "game-assets.zip",
  description: "...",
  linkType: "torrent",
  link: "infohash",           // 40-char hex
  magnetURI: "magnet:?xt=...", // Full magnet URI
  size: 1024000,              // File size in bytes
  uploader: "0x...",
  createdAt: 1234567890
}
```

### Key Functions (torrentService.js)
```javascript
import { seedFile, downloadTorrent, isSeeding, getTorrentStatus } from "../lib/torrentService";

// Seed a file (returns infohash, magnetURI, size)
const result = await seedFile(file, onProgress);

// Download a torrent (returns blob + filename)
const { blob, name } = await downloadTorrent(infohash, onProgress);

// Check seeding status
if (isSeeding(infohash)) { /* ... */ }
```

### Important Notes
- **Tab must stay open**: WebTorrent runs in browser; closing tab stops seeding
- **File in memory**: Selected files stay in browser memory while seeding
- **WebRTC trackers**: Uses public WebTorrent trackers for peer discovery

## Common Patterns

### Creating a new ToolDB instance per channel
```typescript
// Each channel is a separate ToolDB topic
const connectToChannel = (channelId: string) => {
  return new ToolDb({
    topic: `sw33t-${channelId}`,
    networkAdapter: ToolDbWebrtc,
    storageAdapter: ToolDbIndexedb,
    userAdapter: ToolDbEcdsaUser,
  });
};
```

### Filtering blocked users
```typescript
const filterBlockedMessages = (data: any[], blocklist: string[]) => {
  return data.filter(item => !blocklist.includes(item.author));
};
```

### Generating unique IDs
```typescript
import { sha1 } from "tool-db";  // Or use crypto.randomUUID()
const id = sha1(name + Date.now() + userAddress);
```
