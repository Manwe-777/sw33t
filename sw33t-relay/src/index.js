#!/usr/bin/env node

/**
 * Sw33t Relay Server
 * 
 * A self-hosted relay node for Sw33t P2P file sharing.
 * Connects to channels and persists/relays data for browser peers.
 * 
 * The relay runs as a WebSocket server. Browser peers using WebRTC
 * can discover and connect to this relay through the Nostr relay
 * signaling mechanism, or connect directly if they know the address.
 * 
 * Usage:
 *   sw33t-relay --channel gaming
 *   sw33t-relay --channels gaming,movies,music
 *   sw33t-relay --channel gaming --port 8080
 */

import tooldb from "tool-db";
import webrtcNetwork from "@tool-db/webrtc-network";
import leveldbStore from "@tool-db/leveldb-store";
import ecdsaUser from "@tool-db/ecdsa-user";
import wrtc from "wrtc";

// Handle ESM/CJS compatibility
const ToolDb = tooldb.ToolDb || tooldb.default || tooldb;
const ToolDbWebrtc = webrtcNetwork.default || webrtcNetwork;
const ToolDbLeveldb = leveldbStore.default || leveldbStore;
const ToolDbEcdsaUser = ecdsaUser.default || ecdsaUser;

// Global error handlers to prevent crashes from WebRTC race conditions
process.on("uncaughtException", (error) => {
  // Ignore RTCDataChannel errors - these are race conditions in webrtc-network
  if (error.name === "InvalidStateError" && error.message.includes("RTCDataChannel")) {
    console.warn("[WARN] RTCDataChannel race condition (non-fatal):", error.message);
    return;
  }
  // Log other errors but don't crash
  console.error("[ERROR] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[ERROR] Unhandled rejection:", reason);
});

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    channels: [],
    port: parseInt(process.env.PORT) || 8080,
    dataDir: process.env.DATA_DIR || "./data",
    debug: process.env.DEBUG === "true" || false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--channel":
      case "-c":
        if (next && !next.startsWith("-")) {
          config.channels.push(next);
          i++;
        }
        break;
      case "--channels":
        if (next && !next.startsWith("-")) {
          config.channels.push(...next.split(",").map(c => c.trim()));
          i++;
        }
        break;
      case "--port":
      case "-p":
        if (next && !next.startsWith("-")) {
          config.port = parseInt(next);
          i++;
        }
        break;
      case "--data-dir":
      case "-d":
        if (next && !next.startsWith("-")) {
          config.dataDir = next;
          i++;
        }
        break;
      case "--debug":
        config.debug = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  // Check environment variables for channels
  if (config.channels.length === 0 && process.env.CHANNELS) {
    config.channels = process.env.CHANNELS.split(",").map(c => c.trim());
  }

  if (config.channels.length === 0) {
    console.error("Error: At least one channel is required");
    console.error("Use --channel <name> or set CHANNELS environment variable");
    printHelp();
    process.exit(1);
  }

  return config;
}

function printHelp() {
  console.log(`
Sw33t Relay Server - Self-hosted node for P2P file sharing

USAGE:
  sw33t-relay --channel <name> [options]
  sw33t-relay --channels <name1,name2,...> [options]

OPTIONS:
  -c, --channel <name>      Channel to join (can be repeated)
  --channels <list>         Comma-separated list of channels
  -p, --port <number>       WebSocket server port (default: 8080)
  -d, --data-dir <path>     Data directory for persistence (default: ./data)
  --debug                   Enable debug logging
  -h, --help                Show this help message

ENVIRONMENT VARIABLES:
  CHANNELS                  Comma-separated list of channels
  PORT                      WebSocket server port
  DATA_DIR                  Data directory path
  DEBUG                     Enable debug logging (set to "true")

EXAMPLES:
  # Join a single channel
  sw33t-relay --channel gaming

  # Join multiple channels
  sw33t-relay --channels gaming,movies,music

  # Custom port and data directory
  sw33t-relay --channel gaming --port 9000 --data-dir /var/sw33t

  # Using environment variables (Docker)
  CHANNELS=gaming,movies PORT=8080 sw33t-relay
`);
}

// Create a relay instance for a channel
async function createChannelRelay(channelId, config, portOffset = 0) {
  const topic = `sw33t-${channelId}`;
  const port = config.port + portOffset;
  const storageName = `${config.dataDir}/${channelId}`;

  console.log(`[${channelId}] Starting relay on port ${port}...`);
  console.log(`[${channelId}] Topic: ${topic}`);
  console.log(`[${channelId}] Storage: ${storageName}`);

  const db = new ToolDb({
    server: true,
    host: "0.0.0.0",
    port: port,
    topic: topic,
    storageName: storageName,
    networkAdapter: ToolDbWebrtc,
    storageAdapter: ToolDbLeveldb,
    userAdapter: ToolDbEcdsaUser,
    debug: config.debug,
    wrtc: wrtc,
  });

  // Wait for initialization
  await new Promise((resolve) => {
    db.once("init", resolve);
  });

  // Sign in anonymously to participate in the network
  await db.anonSignIn();
  
  console.log(`[${channelId}] Relay address: ${db.userAccount.getAddress()}`);

  // Subscribe to channel metadata
  const metaKey = `==ch:${channelId}:meta`;
  db.subscribeData(metaKey);
  db.addKeyListener(metaKey, (msg) => {
    if (msg.v) {
      console.log(`[${channelId}] Channel meta received:`, msg.v.name || "unnamed");
    }
  });

  // Subscribe to categories
  const categoriesKey = `ch:${channelId}:categories`;
  db.subscribeData(categoriesKey);
  db.addKeyListener(categoriesKey, (msg) => {
    if (msg.v) {
      const count = Object.keys(msg.v).length;
      console.log(`[${channelId}] Categories synced: ${count} categories`);
    }
  });

  // Track connected peers
  let lastPeerCount = 0;
  setInterval(() => {
    const peerCount = Object.keys(db.network.clientToSend || {}).length;
    if (peerCount !== lastPeerCount) {
      console.log(`[${channelId}] Connected peers: ${peerCount}`);
      lastPeerCount = peerCount;
    }
  }, 5000);

  // Log received data for debugging
  if (config.debug) {
    db.on("put", (msg) => {
      console.log(`[${channelId}] Data received: ${msg.k}`);
    });

    db.on("crdtPut", (msg) => {
      console.log(`[${channelId}] CRDT received: ${msg.k}`);
    });
  }

  return { db, channelId, port };
}

// Main entry point
async function main() {
  const config = parseArgs();

  console.log("=".repeat(50));
  console.log("  Sw33t Relay Server");
  console.log("=".repeat(50));
  console.log(`Channels: ${config.channels.join(", ")}`);
  console.log(`Base port: ${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Debug: ${config.debug}`);
  console.log("=".repeat(50));

  const relays = [];

  for (let i = 0; i < config.channels.length; i++) {
    const channelId = config.channels[i];
    try {
      const relay = await createChannelRelay(channelId, config, i);
      relays.push(relay);
      console.log(`[${channelId}] Relay started successfully!`);
    } catch (error) {
      console.error(`[${channelId}] Failed to start relay:`, error.message);
    }
  }

  if (relays.length === 0) {
    console.error("No relays started. Exiting.");
    process.exit(1);
  }

  console.log("");
  console.log("=".repeat(50));
  console.log("  Relay servers running!");
  console.log("=".repeat(50));
  relays.forEach(({ channelId, port }) => {
    console.log(`  - ${channelId}: ws://localhost:${port}`);
  });
  console.log("");
  console.log("Browser peers can connect via WebRTC trackers + Nostr relays.");
  console.log("Press Ctrl+C to stop.");
  console.log("=".repeat(50));

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down relay servers...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down relay servers...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
