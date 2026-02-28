# Sw33t

A decentralized file sharing app built with React and [ToolDB](https://github.com/Manwe-777/tool-db). Users join channels, browse categories, share files via links or P2P torrents, and interact through comments and upvotes - all without any central server.

## Features

- **Decentralized Channels**: Each channel is a separate P2P network. Join by entering a channel ID - no registration required.
- **Peer-to-Peer**: All data syncs directly between users via WebRTC. No central server stores your data.
- **Multiple Link Types**: Share files via URLs, magnet links, or upload directly using WebTorrent.
- **WebTorrent Integration**: Upload files directly from your browser and share them P2P with other users.
- **Categories**: Organize files into categories within each channel.
- **Authentication**: Sign up with username/password (ECDSA keys).
- **Admin System**: Channel creators get admin permissions with granular permission controls.
- **Persistent Storage**: Data persists locally via IndexedDB.

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

## Project Structure

```
src/
├── components/       # React components
│   ├── HomePage.jsx       # Channel join form
│   ├── ChannelPage.jsx    # Main channel view
│   ├── CategoryList.jsx   # Category sidebar
│   ├── FileList.jsx       # File listing with torrent support
│   ├── AddFileModal.jsx   # Share links or upload files
│   ├── AuthModal.jsx      # Sign up/Sign in
│   └── UserPanel.jsx      # User info and settings
├── context/          # React context providers
│   └── AuthContext.jsx    # Authentication state
├── hooks/            # Custom React hooks
│   └── useProfile.js      # User profile lookup
├── lib/              # Core services
│   ├── tooldb.js          # ToolDB connection manager
│   ├── channelService.js  # Channel metadata & categories
│   ├── fileService.js     # File CRUD operations
│   ├── permissions.js     # Bitwise permission system
│   ├── userService.js     # User profiles
│   └── torrentService.js  # WebTorrent client
└── App.jsx           # Router configuration
```

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

**Note**: Your browser tab must stay open to seed files.

### Permissions

Channel creators are admins with full permissions. Admins can:

- Block files and users
- Promote/demote other admins
- Edit channel metadata
- Create/delete categories

Permissions use a bitwise system for efficient storage and checking.

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## License

Apache-2.0

## Related Projects

- [ToolDB](https://github.com/Manwe-777/tool-db) - The decentralized database powering Sw33t
