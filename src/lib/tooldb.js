import * as tooldb from "tool-db";
import * as webrtcNetwork from "@tool-db/webrtc-network";
import * as indexeddbStore from "@tool-db/indexeddb-store";
import * as ecdsaUser from "@tool-db/ecdsa-user";
import { hasPermission, PERMISSIONS, ALL_PERMISSIONS } from "./permissions";

const ToolDb = tooldb.ToolDb || tooldb.default || tooldb;
const ToolDbWebrtc = webrtcNetwork.default || webrtcNetwork;
const ToolDbIndexedb = indexeddbStore.default || indexeddbStore;
const ToolDbEcdsaUser = ecdsaUser.default || ecdsaUser;

let db = null;
let currentTopic = null;
let currentChannelId = null;

// Cache for permission verification
let ownershipCache = null;
let adminsCache = null;

/**
 * NEW KEY STRUCTURE:
 * 
 * ==ch:{channelId}:owner       (frozen) - Immutable ownership
 * ch:{channelId}:meta          (regular) - Editable settings
 * ch:{channelId}:admins        (regular) - Admin permissions
 * ch:{channelId}:blocklist     (regular) - Blocked users
 * ch:{channelId}:categories    (regular) - Categories
 */

/**
 * Get the channel owner key (frozen namespace)
 * Format: ==ch:{channelId}:owner
 */
export function getChannelOwnerKey() {
  if (!currentChannelId) return "==channel-owner";
  return `==ch:${currentChannelId}:owner`;
}

/**
 * Get the channel meta key (for backwards compatibility)
 * Now points to owner key for frozen namespace behavior
 */
export function getChannelMetaKey() {
  return getChannelOwnerKey();
}

/**
 * Get or create a ToolDB instance for a channel
 * @param {string} channelId - The channel/topic to connect to
 * @returns {ToolDb} The ToolDB instance
 */
export function connectToChannel(channelId) {
  const topic = `sw33t-${channelId}`;
  
  // If already connected to this topic, return existing instance
  if (db && currentTopic === topic) {
    return db;
  }
  
  // Close existing connection if any
  if (db) {
    db = null;
    ownershipCache = null;
    adminsCache = null;
  }
  
  currentTopic = topic;
  currentChannelId = channelId;
  
  db = new ToolDb({
    peers: [],
    userAdapter: ToolDbEcdsaUser,
    networkAdapter: ToolDbWebrtc,
    storageAdapter: ToolDbIndexedb,
    debug: true,
    topic: topic,
  });
  
  // Subscribe to ownership for permission verification
  const ownerKey = getChannelOwnerKey();
  const adminsKey = getChannelKey("admins");
  
  console.log("Subscribing to channel keys:", { ownerKey, adminsKey });
  
  db.subscribeData(ownerKey);
  db.subscribeData(adminsKey);
  
  db.addKeyListener(ownerKey, (msg) => {
    if (msg.v) {
      ownershipCache = msg.v;
      console.log("Channel ownership cached:", ownershipCache);
    }
  });
  
  db.addKeyListener(adminsKey, (msg) => {
    if (msg.v) {
      adminsCache = msg.v;
      console.log("Channel admins cached:", adminsCache);
    }
  });
  
  // Add custom verificators for permission enforcement
  setupVerificators(db);
  
  // Set up periodic sync for frozen namespace conflict resolution
  setupFrozenNamespaceSync(db, ownerKey);
  
  // Expose for debugging
  window.toolDb = db;
  
  return db;
}

/**
 * Set up periodic sync to resolve frozen namespace conflicts.
 * 
 * Problem: If user A creates a channel first, and user B creates it second
 * (offline), when B comes online, B won't receive A's ownership because:
 * - A won't PUT again (frozen namespace, already written)
 * - B has local data, so getData returns local copy immediately
 * 
 * Solution: Send GET requests to peers and listen for PUT responses.
 * When a peer responds with data, ToolDB's handlePut will compare timestamps
 * and update local storage if the peer's data is older.
 */
function setupFrozenNamespaceSync(dbInstance, ownerKey) {
  let syncAttempts = 0;
  const maxAttempts = 5;
  const syncIntervals = [2000, 5000, 10000, 30000, 60000]; // Backoff
  
  const attemptSync = async () => {
    if (syncAttempts >= maxAttempts) {
      return;
    }
    
    // clientToSend is an object, not a Map, so use Object.keys
    const clientToSend = dbInstance.network?.clientToSend || {};
    const connectedPeers = Object.keys(clientToSend).length;
    
    if (connectedPeers === 0) {
      const delay = syncIntervals[Math.min(syncAttempts, syncIntervals.length - 1)];
      syncAttempts++;
      setTimeout(attemptSync, delay);
      return;
    }
    
    // Send GET request to all peers - the response will come as a PUT message
    // which will be handled by handlePut and compared against our local data
    const msgId = Math.random().toString(36).substring(2, 12);
    
    // Send GET to all peers
    dbInstance.network.sendToAll({
      type: "get",
      to: [],
      key: ownerKey,
      id: msgId,
    });
    
    // Clean up listener after timeout
    setTimeout(() => {
      dbInstance.removeIdListener(msgId);
    }, 5000);
    
    syncAttempts++;
    scheduleNextSync();
  };
  
  const scheduleNextSync = () => {
    if (syncAttempts < maxAttempts) {
      const delay = syncIntervals[Math.min(syncAttempts, syncIntervals.length - 1)];
      setTimeout(attemptSync, delay);
    }
  };
  
  // Start first sync attempt after a short delay (let connections establish)
  setTimeout(attemptSync, 1000);
}

/**
 * Get ownership data from storage (async, for verificators)
 * This ensures we always check the latest synced data, not stale cache
 * Returns the FULL message including timestamp for conflict resolution
 */
async function getOwnershipFromStorage(channelId) {
  if (!db || !channelId) return null;
  
  const ownerKey = `==ch:${channelId}:owner`;
  try {
    const data = await db.store.get(ownerKey);
    if (data) {
      const parsed = JSON.parse(data);
      // Return full message so we can check timestamp
      return {
        creator: parsed.v?.creator,
        createdAt: parsed.v?.createdAt,
        messageTimestamp: parsed.t, // The PUT message timestamp
        author: parsed.a, // Who wrote this record
      };
    }
  } catch (e) {
    // Not found
  }
  return null;
}

/**
 * Get admins data from storage (async, for verificators)
 */
async function getAdminsFromStorage(channelId) {
  if (!db || !channelId) return null;
  
  const adminsKey = `ch:${channelId}:admins`;
  try {
    const data = await db.store.get(adminsKey);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.v;
    }
  } catch (e) {
    // Not found
  }
  return null;
}

/**
 * Check if a user has a specific permission (async version for verificators)
 * Always reads from storage to ensure we have the latest synced data
 */
async function userHasPermissionAsync(userAddress, permission, channelId) {
  if (!userAddress || !channelId) return false;
  
  const ownership = await getOwnershipFromStorage(channelId);
  
  // Creator always has all permissions
  if (ownership?.creator === userAddress) {
    return true;
  }
  
  // Check admins from storage
  const admins = await getAdminsFromStorage(channelId);
  const adminData = admins?.[userAddress];
  if (!adminData) return false;
  
  const perms = adminData.permissions || 0;
  return hasPermission(perms, permission);
}

/**
 * Extract channel ID from a key like "ch:channelId:something" or "==ch:channelId:something"
 */
function extractChannelId(key) {
  const match = key.match(/^=?=?ch:([^:]+):/);
  return match ? match[1] : null;
}

/**
 * Set up custom verificators for permission enforcement
 * 
 * NOTE: ToolDB uses startsWith matching for verificator keys.
 * Our keys are formatted as "ch:{channelId}:{type}" so we register "ch:" prefix
 * and filter by suffix inside each verificator.
 */
function setupVerificators(dbInstance) {
  // Register a single verificator for all "ch:" keys and route by suffix
  dbInstance.addCustomVerification("ch:", channelKeyVerificator);
  
  console.log("Custom verificators registered for permission enforcement");
}

/**
 * Main verificator for all channel keys (ch:{channelId}:{type})
 * Routes to specific verificators based on key suffix
 */
function channelKeyVerificator(msg, previousData) {
  return new Promise(async (resolve) => {
    const key = msg.k;
    
    // Route based on key suffix
    if (key.endsWith(":meta")) {
      resolve(await metaVerificatorLogic(msg, previousData));
    } else if (key.endsWith(":admins")) {
      resolve(await adminsVerificatorLogic(msg, previousData));
    } else if (key.endsWith(":blocklist")) {
      resolve(await userBlocklistVerificatorLogic(msg, previousData));
    } else if (key.endsWith(":categories")) {
      resolve(await categoriesVerificatorLogic(msg, previousData));
    } else if (key.includes("_blocklist")) {
      // File blocklist: ch:{channelId}:{categoryId}_blocklist
      resolve(await blocklistVerificatorLogic(msg, previousData));
    } else if (key.includes("comments_")) {
      // Comments: ch:{channelId}:comments_{fileId}
      resolve(await commentsVerificatorLogic(msg, previousData));
    } else if (key.includes("upvotes_")) {
      // Upvotes: ch:{channelId}:upvotes_{fileId}
      resolve(await upvotesVerificatorLogic(msg, previousData));
    } else {
      // Unknown key type, allow by default
      console.log("Unknown channel key type, allowing:", key);
      resolve(true);
    }
  });
}

/**
 * Logic for file blocklist - requires BLOCK_FILES permission
 */
async function blocklistVerificatorLogic(msg, previousData) {
  const writerAddress = msg.a;
  const channelId = extractChannelId(msg.k) || currentChannelId;
  
  if (await userHasPermissionAsync(writerAddress, PERMISSIONS.BLOCK_FILES, channelId)) {
    console.log("Blocklist write allowed for:", writerAddress);
    return true;
  } else {
    console.warn("Blocklist write REJECTED - no BLOCK_FILES permission:", writerAddress);
    return false;
  }
}

/**
 * Logic for comments (MapCRDT) - owner-edit only, no deletes, length limits
 *
 * CRDT format: msg.v is an array of MapChanges, each with:
 *   { t: "SET"|"DEL", k: commentKey, a: changeAuthor, v: commentData, i: index }
 *
 * Comment key format: {userAddress}_{timestamp}
 * Rules:
 * - Each change's map key (change.k) must start with the change's author (change.a)
 * - No DEL operations allowed (write-only)
 * - Comment text must be between 1 and 500 characters
 */
const COMMENT_MAX_LENGTH = 500;
const COMMENT_MIN_LENGTH = 1;

async function commentsVerificatorLogic(msg) {
  // Must be a CRDT message
  if (msg.c !== "MAP" || !Array.isArray(msg.v)) {
    console.warn("Comment write REJECTED - not a MAP CRDT");
    return false;
  }

  for (const change of msg.v) {
    // No deletes allowed
    if (change.t === "DEL") {
      console.warn("Comment write REJECTED - DEL not allowed");
      return false;
    }

    // Each change's key must start with the change's own author
    // (users can only add/edit their own comments)
    if (!change.k.startsWith(change.a)) {
      console.warn("Comment write REJECTED - key doesn't match change author:", change.k, change.a);
      return false;
    }

    // Validate comment text
    const text = change.v?.text;
    if (typeof text !== "string") {
      console.warn("Comment write REJECTED - text is not a string:", change.k);
      return false;
    }

    const textLength = text.trim().length;
    if (textLength < COMMENT_MIN_LENGTH) {
      console.warn("Comment write REJECTED - text too short:", textLength, "chars");
      return false;
    }

    if (textLength > COMMENT_MAX_LENGTH) {
      console.warn("Comment write REJECTED - text too long:", textLength, "chars (max", COMMENT_MAX_LENGTH, ")");
      return false;
    }
  }

  console.log("Comments CRDT write allowed for:", msg.a);
  return true;
}

/**
 * Logic for upvotes (MapCRDT) - users can only modify their own vote
 *
 * CRDT format: msg.v is an array of MapChanges, each with:
 *   { t: "SET"|"DEL", k: userAddress, a: changeAuthor, v: boolean, i: index }
 *
 * Rules:
 * - Each change's map key (change.k) must equal the change's author (change.a)
 *   (one vote per user, can only modify your own key)
 * - No DEL operations allowed
 */
async function upvotesVerificatorLogic(msg) {
  // Must be a CRDT message
  if (msg.c !== "MAP" || !Array.isArray(msg.v)) {
    console.warn("Upvote write REJECTED - not a MAP CRDT");
    return false;
  }

  for (const change of msg.v) {
    // No deletes allowed
    if (change.t === "DEL") {
      console.warn("Upvote write REJECTED - DEL not allowed");
      return false;
    }

    // Each change's key must equal the change's own author
    // (users can only vote as themselves)
    if (change.k !== change.a) {
      console.warn("Upvote write REJECTED - key doesn't match change author:", change.k, change.a);
      return false;
    }
  }

  console.log("Upvotes CRDT write allowed for:", msg.a);
  return true;
}

/**
 * Logic for categories - requires CREATE_CATEGORIES permission for new entries
 */
async function categoriesVerificatorLogic(msg, previousData) {
  const writerAddress = msg.a;
  const channelId = extractChannelId(msg.k) || currentChannelId;
  
  if (await userHasPermissionAsync(writerAddress, PERMISSIONS.CREATE_CATEGORIES, channelId)) {
    console.log("Categories write allowed for:", writerAddress);
    return true;
  } else {
    // Allow if not adding new keys (just syncing existing)
    const newValue = msg.v || {};
    const oldValue = previousData?.v || {};
    const newKeys = Object.keys(newValue).filter(k => !(k in oldValue));
    
    if (newKeys.length === 0) {
      return true;
    } else {
      console.warn("Categories write REJECTED - no CREATE_CATEGORIES permission:", writerAddress);
      return false;
    }
  }
}

/**
 * Logic for channel meta/settings - requires EDIT_CHANNEL permission
 */
async function metaVerificatorLogic(msg, previousData) {
  const writerAddress = msg.a;
  const channelId = extractChannelId(msg.k) || currentChannelId;
  
  // Allow first write (channel creation)
  if (!previousData?.v) {
    console.log("Meta write allowed (initial creation):", writerAddress);
    return true;
  }
  
  if (await userHasPermissionAsync(writerAddress, PERMISSIONS.EDIT_CHANNEL, channelId)) {
    console.log("Meta write allowed for:", writerAddress);
    return true;
  } else {
    console.warn("Meta write REJECTED - no EDIT_CHANNEL permission:", writerAddress);
    return false;
  }
}

/**
 * Logic for admins - requires PROMOTE_ADMINS permission or being the owner
 */
async function adminsVerificatorLogic(msg, previousData) {
  const writerAddress = msg.a;
  const channelId = extractChannelId(msg.k) || currentChannelId;
  
  // Check if writer is the owner
  const ownership = await getOwnershipFromStorage(channelId);
  
  if (ownership?.creator === writerAddress) {
    console.log("Admins write allowed (writer is owner):", writerAddress);
    return true;
  }
  
  // If writer is not owner, check message timestamp vs ownership timestamp
  // If admins write is BEFORE ownership was established, reject it
  if (ownership?.messageTimestamp && msg.t < ownership.messageTimestamp) {
    console.warn("Admins write REJECTED - written before ownership was established:", writerAddress);
    return false;
  }
  
  // Allow first write only if no previous data
  if (!previousData?.v) {
    console.log("Admins write allowed (initial creation, no owner found):", writerAddress);
    return true;
  }
  
  // For subsequent writes, check PROMOTE_ADMINS permission
  if (await userHasPermissionAsync(writerAddress, PERMISSIONS.PROMOTE_ADMINS, channelId)) {
    console.log("Admins write allowed for:", writerAddress);
    return true;
  } else {
    console.warn("Admins write REJECTED - no PROMOTE_ADMINS permission:", writerAddress);
    return false;
  }
}

/**
 * Logic for user blocklist - requires BLOCK_USERS permission
 */
async function userBlocklistVerificatorLogic(msg, previousData) {
  const writerAddress = msg.a;
  const channelId = extractChannelId(msg.k) || currentChannelId;
  
  // Allow first write
  if (!previousData?.v) {
    return true;
  }
  
  if (await userHasPermissionAsync(writerAddress, PERMISSIONS.BLOCK_USERS, channelId)) {
    console.log("User blocklist write allowed for:", writerAddress);
    return true;
  } else {
    console.warn("User blocklist write REJECTED - no BLOCK_USERS permission:", writerAddress);
    return false;
  }
}

/**
 * Get the current ToolDB instance
 */
export function getToolDb() {
  return db;
}

/**
 * Get the current topic/channel
 */
export function getCurrentTopic() {
  return currentTopic;
}

/**
 * Get the current channel ID (without sw33t- prefix)
 */
export function getCurrentChannelId() {
  if (!currentTopic) return null;
  return currentTopic.replace(/^sw33t-/, "");
}

/**
 * Create a channel-namespaced key
 */
export function getChannelKey(key) {
  const channelId = getCurrentChannelId();
  if (!channelId) {
    console.warn("No channel connected, using key without namespace:", key);
    return key;
  }
  return `ch:${channelId}:${key}`;
}

/**
 * Reset caches (called when switching channels)
 */
export function resetToolDbCache() {
  ownershipCache = null;
  adminsCache = null;
}
