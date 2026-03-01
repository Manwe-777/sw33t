# Sw33t Relay Server

A self-hosted relay node for Sw33t P2P file sharing. The relay acts as an always-on peer that persists channel data, ensuring availability even when all browser users leave.

## Why Use a Relay?

Sw33t is fully peer-to-peer - data syncs directly between browsers via WebRTC. The problem: when all users leave a channel, data exists only in their browser storage. New users joining an empty channel get nothing until someone returns.

A relay solves this by:
- **Staying online 24/7** - Always available to sync with new peers
- **Persisting data** - Stores everything in LevelDB (survives restarts)
- **Using the same protocol** - Connects via WebRTC like any browser peer

## Censorship Resistance

The Sw33t network is designed to be resilient against censorship and blocking:

### No Central Server to Block
- There is no central server - data flows directly between peers
- Blocking any single IP doesn't affect the network
- The relay is just another peer, not a required component

### Multiple Discovery Mechanisms
Peers find each other through redundant channels:
- **WebTorrent Trackers** - Multiple public trackers worldwide
- **Nostr Relays** - Decentralized relay network for signaling
- If some are blocked, others still work

### Relay Flexibility
- **Run anywhere** - VPS, home server, cloud, Raspberry Pi
- **No fixed IP required** - Peers discover via trackers/Nostr, not direct IP
- **Easy to migrate** - Move to a new host anytime, peers find you automatically
- **Multiple relays** - Anyone can run a relay, no single point of failure

### Browser Access
- Users access via WebRTC which uses encrypted peer-to-peer connections
- No specific domain or IP to block - peers connect directly
- Works from any browser without special software

### Data Replication
- Data exists on every peer that syncs it
- Blocking one peer doesn't delete the data
- New relays can resync from any existing peer

## Quick Start

### Docker (Recommended)

```bash
# Build the image
docker build -t sw33t-relay .

# Run for a single channel
docker run -d \
  --name sw33t-relay \
  -p 8080:8080 \
  -e CHANNELS=your-channel \
  -v sw33t-data:/data \
  sw33t-relay

# Run for multiple channels (each gets its own port)
docker run -d \
  --name sw33t-relay \
  -p 8080-8082:8080-8082 \
  -e CHANNELS=gaming,movies,music \
  -v sw33t-data:/data \
  sw33t-relay
```

### Docker Compose

```bash
# Edit docker-compose.yml to set your channels
docker-compose up -d
```

### Node.js

```bash
npm install
npm start -- --channel your-channel

# Multiple channels
npm start -- --channels gaming,movies,music --port 8080
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHANNELS` | Comma-separated channel list | Required |
| `PORT` | Base port for WebSocket server | 8080 |
| `DATA_DIR` | Data persistence directory | /data |
| `DEBUG` | Enable verbose logging | false |
| `SYNC_INTERVAL` | Full sync interval in milliseconds | 30000 |

### CLI Arguments

| Argument | Description |
|----------|-------------|
| `-c, --channel <name>` | Channel to relay (repeatable) |
| `--channels <list>` | Comma-separated channels |
| `-p, --port <number>` | Base port |
| `-d, --data-dir <path>` | Data directory |
| `--debug` | Verbose logging |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     SW33T RELAY                              │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐             │
│  │  WebRTC   │   │  LevelDB  │   │ WebSocket │             │
│  │  (P2P)    │   │  Storage  │   │  Server   │             │
│  └─────┬─────┘   └───────────┘   └─────┬─────┘             │
└────────│───────────────────────────────│────────────────────┘
         │                               │
    ┌────┴────┐                    ┌─────┴─────┐
    │ Browser │←───── WebRTC ─────→│  Browser  │
    │  Peer   │                    │   Peer    │
    └─────────┘                    └───────────┘
```

1. **Peer Discovery** - Connects to WebTorrent trackers + Nostr relays
2. **WebRTC Connections** - Establishes P2P connections with browsers
3. **Data Sync** - Receives and stores all channel data via CRDTs
4. **Active Sync** - Periodically queries peers for all keys and fetches missing data
5. **Persistence** - LevelDB keeps data across restarts

Browser peers discover the relay automatically through the same mechanisms they use to find each other. No special configuration needed in the browser app.

## Production Deployment

```bash
docker run -d \
  --name sw33t-relay \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /var/lib/sw33t:/data \
  -e CHANNELS=my-channel \
  sw33t-relay
```

## Known Issues

### Normal/Expected

- **ICE gathering timeout** - WebRTC offers that don't get answered (no peers). Normal.
- **Tracker errors** - Some WebTorrent trackers go down. Relay retries automatically.

### Bugs (Non-Fatal)

- **RTCDataChannel.readyState is not 'open'** - Race condition when sending to a closing channel. Logs errors but doesn't affect functionality. Fix needed in `@tool-db/webrtc-network`.

## Data Storage

Channel data stored in LevelDB at `DATA_DIR/<channel>/`:

```
/data/
  gaming/
    000001.log
    CURRENT
    LOCK
  movies/
    ...
```

Backup: copy the data directory.

## License

Apache-2.0
