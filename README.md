# Sw33t

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![P2P](https://img.shields.io/badge/P2P-WebRTC-green.svg)](https://webrtc.org/)
[![Decentralized](https://img.shields.io/badge/Decentralized-ToolDB-purple.svg)](https://github.com/Manwe-777/tool-db)

A decentralized, censorship-resistant file sharing platform built with React and [ToolDB](https://github.com/Manwe-777/tool-db). Users join channels, browse categories, share files via links or P2P torrents, and interact through comments and upvotes - all without any central server.

**Live Demo**: https://manwe-777.github.io/sw33t/

## Why Sw33t?

**No servers. No censorship. No single point of failure.**

Sw33t is built for freedom. There's no central server to shut down, no IP to block, no company to pressure. Data flows directly between users through encrypted WebRTC connections. Even if you run a relay server, it's discovered through decentralized signaling (WebTorrent trackers + Nostr relays) - not tied to any fixed IP or domain that can be blocked.

## Features

- **Decentralized Channels**: Each channel is a separate P2P network. Join by entering a channel ID - no registration required.
- **Peer-to-Peer**: All data syncs directly between users via WebRTC. No central server stores your data.
- **Censorship Resistant**: No central point to block - multiple discovery mechanisms, easy relay migration, data replicated across all peers.
- **Multiple Link Types**: Share files via URLs, magnet links, or upload directly using WebTorrent.
- **WebTorrent Integration**: Upload files directly from your browser and share them P2P with other users.
- **Categories**: Organize files into categories within each channel.
- **Authentication**: Sign up with username/password (ECDSA keys).
- **Admin System**: Channel creators get admin permissions with granular permission controls.
- **Persistent Storage**: Data persists locally via IndexedDB.
- **Self-Hosted Relay**: Run your own always-on peer to keep channels alive 24/7.

## Tech Stack

- **Frontend**: React 19 + Vite
- **Routing**: React Router v7
- **P2P Database**: [ToolDB](https://github.com/Manwe-777/tool-db) with CRDTs for conflict-free sync
- **Networking**: WebRTC via WebTorrent trackers + Nostr relays
- **File Sharing**: WebTorrent for browser-based P2P file transfers
- **Storage**: IndexedDB for browser persistence

## Getting Started

### Prerequisites

- Node.js 16+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Manwe-777/sw33t.git
cd sw33t

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Usage

1. Enter a channel name on the home page and click "Join Channel"
2. Sign up or sign in to create/share content
3. Create categories to organize files
4. Share files by adding links or uploading via WebTorrent
5. Open another browser tab with the same channel to see P2P sync in action

## How It Works

### ToolDB

Sw33t uses [ToolDB](https://github.com/Manwe-777/tool-db), a decentralized database that syncs data between peers using CRDTs (Conflict-free Replicated Data Types). This means:

- No central server - peers connect directly
- Offline-first - changes sync when you reconnect
- Conflict-free - concurrent edits merge automatically
- Write-only - data can't be deleted (prevents tampering)

### WebTorrent

Files can be shared directly from your browser using WebTorrent:

1. Select a file to upload
2. WebTorrent creates a torrent and starts seeding
3. The infohash is stored in ToolDB
4. Other users download the file P2P via WebRTC

**Recommended seeding workflow**: Browser-based seeding requires keeping your tab open. For long-term availability, we recommend:

1. Upload your file with Sw33t to get the magnet link
2. Copy the magnet link and open it in a desktop torrent client (qBittorrent, Transmission, etc.)
3. Seed from the desktop client instead

This way you don't need to keep the browser tab open, and your files remain available 24/7.

### Permissions

Channel creators become admins and can promote other users to help moderate. Admins can block files/users, edit channel settings, and manage categories.

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Self-Hosted Relay

Want to keep a channel alive 24/7? Run your own relay server:

```bash
cd sw33t-relay
docker build -t sw33t-relay .
docker run -d -p 8080:8080 -e CHANNELS=your-channel -v sw33t-data:/data sw33t-relay
```

The relay acts as an always-on peer that:
- Persists channel data in LevelDB
- Syncs with browser peers via WebRTC
- Discovered automatically through trackers/Nostr (no fixed IP needed)
- Can be moved to any host without disrupting the network

See [sw33t-relay/README.md](sw33t-relay/README.md) for full documentation.

## Censorship Resistance

Sw33t is designed to be resilient:

| Attack Vector | Why It Fails |
|--------------|--------------|
| Block the server | There is no server - data is peer-to-peer |
| Block an IP | Peers discover each other via trackers/Nostr, not direct IPs |
| Shut down a relay | Anyone can run a relay, data exists on all synced peers |
| Block a domain | Browser app works from any host, relay needs no domain |
| Pressure the operator | No single operator controls the network |

## License

Apache-2.0

## Related Projects

- [ToolDB](https://github.com/Manwe-777/tool-db) - The decentralized database powering Sw33t
