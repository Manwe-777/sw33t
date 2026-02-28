import WebTorrent from "webtorrent";

const TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz", 
  "wss://tracker.webtorrent.dev",
];

let client = null;
const seedingTorrents = new Map(); // infohash -> torrent
const downloadingTorrents = new Map(); // infohash -> torrent

export function getClient() {
  if (!client) {
    client = new WebTorrent();
    
    client.on("error", (err) => {
      console.error("WebTorrent client error:", err);
    });
    
    console.log("WebTorrent client initialized");
  }
  return client;
}

export function destroyClient() {
  if (client) {
    client.destroy();
    client = null;
    seedingTorrents.clear();
    downloadingTorrents.clear();
    console.log("WebTorrent client destroyed");
  }
}

/**
 * Create a torrent from a File and start seeding
 * @param {File} file - The file to seed
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<{infohash: string, magnetURI: string, name: string, size: number}>}
 */
export function seedFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const wt = getClient();
    
    console.log("Creating torrent for file:", file.name, file.size);
    
    wt.seed(file, { 
      announce: TRACKERS,
    }, (torrent) => {
      console.log("Seeding started:", torrent.infoHash);
      console.log("Magnet URI:", torrent.magnetURI);
      console.log("Trackers:", torrent.announce);
      
      seedingTorrents.set(torrent.infoHash, torrent);
      
      torrent.on("wire", (wire) => {
        console.log("Seeder: peer connected:", wire.peerId?.slice(0, 8));
      });
      
      torrent.on("upload", (bytes) => {
        console.log("Uploaded", bytes, "bytes to peer");
        if (onProgress) {
          onProgress({
            uploaded: torrent.uploaded,
            uploadSpeed: torrent.uploadSpeed,
            ratio: torrent.ratio,
            peers: torrent.numPeers,
          });
        }
      });
      
      torrent.on("warning", (warn) => {
        console.warn("Seed warning:", warn);
      });
      
      torrent.on("error", (err) => {
        console.error("Seed error:", err);
      });
      
      resolve({
        infohash: torrent.infoHash,
        magnetURI: torrent.magnetURI,
        name: torrent.name,
        size: torrent.length,
      });
    });
    
    wt.on("error", (err) => {
      console.error("WebTorrent seed error:", err);
      reject(err);
    });
  });
}

/**
 * Extract infohash from magnet URI or return as-is
 */
function extractInfohash(torrentId) {
  if (torrentId.startsWith("magnet:")) {
    const match = torrentId.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
    return match ? match[1].toLowerCase() : torrentId;
  }
  return torrentId.toLowerCase();
}

/**
 * Download a torrent by infohash or magnet URI
 * @param {string} torrentId - Infohash or magnet URI
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>}
 */
export function downloadTorrent(torrentId, onProgress) {
  return new Promise((resolve, reject) => {
    const wt = getClient();
    const infohash = extractInfohash(torrentId);
    
    console.log("downloadTorrent called with:", torrentId);
    console.log("Extracted infohash:", infohash);
    
    // Check if already have this torrent (seeding or downloading)
    const existing = downloadingTorrents.get(infohash) || 
                     seedingTorrents.get(infohash);
    if (existing) {
      console.log("Found existing torrent:", existing.infoHash, "done:", existing.done);
      if (existing.done) {
        const file = existing.files[0];
        file.blob((err, blob) => {
          if (err) reject(err);
          else resolve({ blob, name: file.name });
        });
        return;
      }
      // Already downloading, wait for it
      existing.on("done", () => {
        const file = existing.files[0];
        file.blob((err, blob) => {
          if (err) reject(err);
          else resolve({ blob, name: file.name });
        });
      });
      return;
    }
    
    // Check if torrent is already in client
    const clientTorrent = wt.get(infohash);
    if (clientTorrent) {
      console.log("Torrent already in client:", clientTorrent.infoHash);
      if (clientTorrent.done) {
        const file = clientTorrent.files[0];
        file.blob((err, blob) => {
          if (err) reject(err);
          else resolve({ blob, name: file.name });
        });
        return;
      }
    }
    
    // Build magnet URI with trackers
    const trackerParams = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join("");
    const magnetURI = `magnet:?xt=urn:btih:${infohash}${trackerParams}`;
    
    console.log("Adding torrent with magnet:", magnetURI);
    
    let torrent;
    try {
      torrent = wt.add(magnetURI, {
        announce: TRACKERS,
      });
    } catch (err) {
      console.error("Failed to add torrent:", err);
      reject(err);
      return;
    }
    
    console.log("Torrent object created, infoHash:", torrent.infoHash);
    console.log("Torrent announce list:", torrent.announce);
    
    let metadataReceived = false;
    let progressInterval;
    
    // Timeout for metadata (60 seconds)
    const metadataTimeout = setTimeout(() => {
      if (!metadataReceived) {
        console.error("Metadata timeout - no peers found or metadata not received");
        if (onProgress) {
          onProgress({
            progress: 0,
            peers: torrent.numPeers,
            status: "timeout",
            error: "Could not find peers. The seeder may be offline.",
          });
        }
      }
    }, 60000);
    
    torrent.on("infoHash", () => {
      console.log("InfoHash confirmed:", torrent.infoHash);
    });
    
    torrent.on("metadata", () => {
      metadataReceived = true;
      clearTimeout(metadataTimeout);
      console.log("Got metadata for:", torrent.name, "files:", torrent.files.length);
      downloadingTorrents.set(torrent.infoHash, torrent);
    });
    
    torrent.on("ready", () => {
      console.log("Torrent ready:", torrent.name, "size:", torrent.length);
    });
    
    torrent.on("wire", (wire) => {
      console.log("Connected to peer:", wire.peerId?.slice(0, 8), "type:", wire.type);
    });
    
    torrent.on("noPeers", (announceType) => {
      console.log("No peers found via:", announceType);
    });
    
    torrent.on("download", (bytes) => {
      if (onProgress) {
        onProgress({
          progress: torrent.progress * 100,
          downloaded: torrent.downloaded,
          downloadSpeed: torrent.downloadSpeed,
          peers: torrent.numPeers,
          timeRemaining: torrent.timeRemaining,
          status: "downloading",
        });
      }
    });
    
    torrent.on("done", () => {
      console.log("Download complete:", torrent.name);
      clearTimeout(metadataTimeout);
      if (progressInterval) clearInterval(progressInterval);
      
      const file = torrent.files[0];
      console.log("Getting blob from file:", file.name, "size:", file.length);
      
      // Use streaming approach (more reliable across browsers)
      const chunks = [];
      const stream = file.createReadStream();
      
      stream.on("data", (chunk) => {
        chunks.push(chunk);
        console.log("Stream chunk received, total chunks:", chunks.length);
      });
      
      stream.on("end", () => {
        console.log("Stream ended, creating blob from", chunks.length, "chunks");
        const blob = new Blob(chunks, { type: "application/octet-stream" });
        console.log("Blob created via stream, size:", blob.size);
        resolve({ blob, name: file.name });
      });
      
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        reject(err);
      });
    });
    
    torrent.on("error", (err) => {
      console.error("Torrent error:", err);
      clearTimeout(metadataTimeout);
      if (progressInterval) clearInterval(progressInterval);
      reject(err);
    });
    
    torrent.on("warning", (warn) => {
      console.warn("Torrent warning:", warn);
    });
    
    // Update progress periodically
    progressInterval = setInterval(() => {
      if (torrent.destroyed) {
        clearInterval(progressInterval);
        return;
      }
      console.log("Progress update - peers:", torrent.numPeers, "progress:", (torrent.progress * 100).toFixed(1) + "%");
      if (onProgress) {
        onProgress({
          progress: torrent.progress * 100,
          downloaded: torrent.downloaded,
          downloadSpeed: torrent.downloadSpeed,
          peers: torrent.numPeers,
          timeRemaining: torrent.timeRemaining,
          status: metadataReceived ? "downloading" : "searching",
        });
      }
    }, 2000);
  });
}

/**
 * Get torrent status by infohash
 */
export function getTorrentStatus(infohash) {
  const torrent = seedingTorrents.get(infohash) || downloadingTorrents.get(infohash);
  if (!torrent) return null;
  
  return {
    infohash: torrent.infoHash,
    name: torrent.name,
    size: torrent.length,
    progress: torrent.progress * 100,
    downloaded: torrent.downloaded,
    uploaded: torrent.uploaded,
    downloadSpeed: torrent.downloadSpeed,
    uploadSpeed: torrent.uploadSpeed,
    peers: torrent.numPeers,
    seeding: seedingTorrents.has(infohash),
    done: torrent.done,
  };
}

/**
 * Check if we're seeding a torrent
 */
export function isSeeding(infohash) {
  return seedingTorrents.has(infohash);
}

/**
 * Stop seeding a torrent
 */
export function stopSeeding(infohash) {
  const torrent = seedingTorrents.get(infohash);
  if (torrent) {
    torrent.destroy();
    seedingTorrents.delete(infohash);
    console.log("Stopped seeding:", infohash);
  }
}

/**
 * Get all seeding torrents
 */
export function getSeedingTorrents() {
  return Array.from(seedingTorrents.values()).map(t => ({
    infohash: t.infoHash,
    name: t.name,
    size: t.length,
    uploaded: t.uploaded,
    uploadSpeed: t.uploadSpeed,
    peers: t.numPeers,
  }));
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format speed to human readable
 */
export function formatSpeed(bytesPerSec) {
  return formatBytes(bytesPerSec) + "/s";
}

// Cache for peer counts to avoid repeated lookups
const peerCountCache = new Map(); // infohash -> { count, timestamp, torrent }
const PEER_COUNT_CACHE_TTL = 30000; // 30 seconds

/**
 * Get the number of seeders/peers for a torrent without downloading
 * @param {string} torrentId - Infohash or magnet URI
 * @param {Function} onUpdate - Callback when peer count updates
 * @returns {Promise<{ peers: number, infohash: string }>}
 */
export function getPeerCount(torrentId, onUpdate) {
  return new Promise((resolve) => {
    const wt = getClient();
    const infohash = extractInfohash(torrentId);
    
    // Check cache first
    const cached = peerCountCache.get(infohash);
    if (cached && Date.now() - cached.timestamp < PEER_COUNT_CACHE_TTL) {
      if (onUpdate) onUpdate(cached.count);
      resolve({ peers: cached.count, infohash });
      return;
    }
    
    // Check if we already have this torrent (seeding or downloading)
    const existing = seedingTorrents.get(infohash) || downloadingTorrents.get(infohash);
    if (existing) {
      const count = existing.numPeers;
      peerCountCache.set(infohash, { count, timestamp: Date.now(), torrent: null });
      if (onUpdate) onUpdate(count);
      resolve({ peers: count, infohash });
      return;
    }
    
    // Check if torrent is already in client
    const clientTorrent = wt.get(infohash);
    if (clientTorrent) {
      const count = clientTorrent.numPeers;
      peerCountCache.set(infohash, { count, timestamp: Date.now(), torrent: null });
      if (onUpdate) onUpdate(count);
      resolve({ peers: count, infohash });
      return;
    }
    
    // Build magnet URI with trackers
    const trackerParams = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join("");
    const magnetURI = `magnet:?xt=urn:btih:${infohash}${trackerParams}`;
    
    // Add torrent just to get peer count (we'll keep it for potential download)
    let torrent;
    try {
      torrent = wt.add(magnetURI, {
        announce: TRACKERS,
      });
    } catch (err) {
      console.error("Failed to add torrent for peer count:", err);
      resolve({ peers: 0, infohash });
      return;
    }
    
    let resolved = false;
    let lastCount = 0;
    
    // Update peer count as peers connect
    const updatePeerCount = () => {
      const count = torrent.numPeers;
      if (count !== lastCount) {
        lastCount = count;
        peerCountCache.set(infohash, { count, timestamp: Date.now(), torrent });
        if (onUpdate) onUpdate(count);
      }
    };
    
    torrent.on("wire", () => {
      updatePeerCount();
      if (!resolved) {
        resolved = true;
        resolve({ peers: torrent.numPeers, infohash });
      }
    });
    
    // Periodically check peer count
    const interval = setInterval(() => {
      if (torrent.destroyed) {
        clearInterval(interval);
        return;
      }
      updatePeerCount();
    }, 2000);
    
    // Resolve after a timeout even if no peers found
    setTimeout(() => {
      clearInterval(interval);
      if (!resolved) {
        resolved = true;
        peerCountCache.set(infohash, { count: torrent.numPeers, timestamp: Date.now(), torrent });
        resolve({ peers: torrent.numPeers, infohash });
      }
    }, 10000); // 10 second timeout for initial peer discovery
  });
}

/**
 * Subscribe to peer count updates for a torrent
 * Returns an unsubscribe function
 */
export function subscribeToPeerCount(torrentId, onUpdate) {
  const infohash = extractInfohash(torrentId);
  let active = true;
  
  // Start peer discovery
  getPeerCount(torrentId, (count) => {
    if (active) onUpdate(count);
  });
  
  // Set up periodic updates
  const interval = setInterval(() => {
    if (!active) {
      clearInterval(interval);
      return;
    }
    
    const wt = getClient();
    const torrent = wt.get(infohash) || seedingTorrents.get(infohash) || downloadingTorrents.get(infohash);
    if (torrent) {
      onUpdate(torrent.numPeers);
    }
  }, 5000);
  
  // Return unsubscribe function
  return () => {
    active = false;
    clearInterval(interval);
  };
}
