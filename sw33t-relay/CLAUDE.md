# Sw33t Relay - Development Guide

## Overview

The sw33t-relay is a Node.js server that acts as an always-on peer for Sw33t channels. It uses the same ToolDB/WebRTC stack as browsers but runs headlessly with LevelDB for persistence.

## Tech Stack

- **Runtime**: Node.js 18+
- **P2P Database**: ToolDB with `@tool-db/webrtc-network`
- **Storage**: `@tool-db/leveldb-store` (LevelDB)
- **Auth**: `@tool-db/ecdsa-user` (anonymous relay identity)
- **WebRTC**: `wrtc` (native WebRTC for Node.js) + `simple-peer`
- **Container**: Docker (Debian Bullseye base)

## Architecture

```
src/index.js
├── parseArgs()           # CLI argument parsing
├── createChannelRelay()  # Create ToolDB instance per channel
│   ├── ToolDb config     # server:true, webrtc adapter, leveldb storage
│   ├── anonSignIn()      # Anonymous identity for relay
│   ├── subscribeData()   # Subscribe to channel meta + categories
│   └── keyListeners      # Log received data
└── main()                # Entry point, start all relays
```

## Key Configuration

```javascript
const db = new ToolDb({
  server: true,           // Enable WebSocket server mode
  host: "0.0.0.0",        // Listen on all interfaces
  port: 8080,             // WebSocket port
  topic: "sw33t-{channel}", // Same topic format as browser
  networkAdapter: ToolDbWebrtc,
  storageAdapter: ToolDbLeveldb,
  userAdapter: ToolDbEcdsaUser,
  wrtc: wrtc,             // Native WebRTC for Node.js
});
```

## Peer Discovery

The relay uses the same discovery mechanisms as browsers:

1. **WebTorrent Trackers** - Announces to public trackers
   - `wss://tracker.webtorrent.dev`
   - `wss://tracker.openwebtorrent.com`
   - `wss://tracker.btorrent.xyz`
   - `wss://tracker.files.fm:7073/announce`

2. **Nostr Relays** - Ephemeral events for peer discovery
   - `wss://nos.lol`
   - `wss://relay.damus.io`
   - `wss://nostr.data.haus`
   - `wss://relay.nostromo.social`
   - `wss://relay.fountain.fm`

## Data Flow

1. Browser creates/updates data → signs with ECDSA
2. Browser broadcasts via WebRTC to connected peers
3. Relay receives message → verifies signature → stores in LevelDB
4. Relay relays to other connected peers
5. New browsers connecting get data synced from relay

## Docker Build

The Dockerfile:
1. Uses `node:18-bullseye` (includes build tools for wrtc)
2. Installs `@mapbox/node-pre-gyp` globally (required by wrtc)
3. Installs npm dependencies including native wrtc module
4. Runs as non-root `sw33t` user for security

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHANNELS` | Comma-separated channels to relay | Required |
| `PORT` | Base WebSocket port | 8080 |
| `DATA_DIR` | LevelDB storage path | /data |
| `DEBUG` | Verbose logging | false |
| `SYNC_INTERVAL` | Full sync interval in ms | 30000 |

## Active Sync Mechanism

ToolDB is pull-based - peers don't automatically share all data on connect. The relay implements active sync to ensure it has all data:

### How It Works

1. **Periodic Sync** - Every `SYNC_INTERVAL` ms (default 30s):
   - Query all keys from connected peers via `queryKeys("")`
   - Fetch each key via `getData()` to get latest version
   
2. **On New Peer Connect** - Triggers sync after 2s delay

3. **Auto-Subscribe** - When new keys are discovered via PUT/CRDT events, automatically subscribe to them

### Why This Is Needed

Without active sync:
- Peer A (browser) has data
- Relay B connects, doesn't have data
- Peer C connects to both A and B
- C might get response from B first (no data) instead of A (has data)

With active sync:
- Relay B periodically queries A for all keys
- B fetches all data from A
- When C connects, both A and B have the data

## Multiple Channels

When running multiple channels, each gets a sequential port:
- Channel 1: PORT + 0
- Channel 2: PORT + 1
- Channel 3: PORT + 2

## Known Issues

### ICE Gathering Timeout
```
ICE gathering timeout, destroying peer
```
Normal when WebRTC offers don't get answered. Happens when there are no other peers or they're unreachable.

### Tracker Errors
```
Tracker error: wss://tracker.btorrent.xyz, will retry...
```
Some trackers go down. Relay retries with exponential backoff (3s, 6s, 12s...).

### RTCDataChannel Not Open
```
[ERROR] Unhandled rejection: DOMException [InvalidStateError]: RTCDataChannel.readyState is not 'open'
```
Race condition in `@tool-db/webrtc-network` when sending to a closing channel. **Handled** - logged but doesn't crash the relay.

**Root cause**: `clientToSend[id]()` is called after the peer disconnected but before cleanup. Proper fix would be to check `peer.connected` before sending in `webrtc-network/dist/index.js:611`.

The relay has global error handlers (`uncaughtException` and `unhandledRejection`) to catch these errors and continue running.

## File Structure

```
sw33t-relay/
├── src/
│   └── index.js       # Main entry point
├── package.json       # Dependencies
├── Dockerfile         # Docker build
├── docker-compose.yml # Easy deployment
├── README.md          # User documentation
├── CLAUDE.md          # This file
├── .dockerignore
└── .gitignore
```

## Testing

```bash
# Build
docker build -t sw33t-relay .

# Run with debug
docker run -p 8080:8080 -e CHANNELS=test -e DEBUG=true sw33t-relay

# Check logs
docker logs -f sw33t-relay

# Verify connection from browser
# Open sw33t app, join "test" channel, check peer count
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `tool-db` | Core P2P database |
| `@tool-db/webrtc-network` | WebRTC networking with tracker/Nostr discovery |
| `@tool-db/leveldb-store` | LevelDB persistence adapter |
| `@tool-db/ecdsa-user` | ECDSA authentication |
| `simple-peer` | WebRTC peer connections |
| `wrtc` | Native WebRTC for Node.js |
| `ws` | WebSocket implementation |
