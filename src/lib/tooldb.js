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
  
  // Expose for debugging
  window.toolDb = db;
  
  return db;
}

/**
 * Check if a user has a specific permission
 */
function userHasPermission(userAddress, permission) {
  if (!userAddress) return false;
  
  // Creator always has all permissions
  if (ownershipCache?.creator === userAddress) {
    return true;
  }
  
  // Check admins cache
  const adminData = adminsCache?.[userAddress];
  if (!adminData) return false;
  
  const perms = adminData.permissions || 0;
  return hasPermission(perms, permission);
}

/**
 * Get user's permission value
 */
function getUserPermissions(userAddress) {
  if (!userAddress) return 0;
  
  // Creator always has all permissions
  if (ownershipCache?.creator === userAddress) {
    return ALL_PERMISSIONS;
  }
  
  return adminsCache?.[userAddress]?.permissions || 0;
}

/**
 * Verificator for file blocklist - requires BLOCK_FILES permission
 */
function blocklistVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    if (userHasPermission(writerAddress, PERMISSIONS.BLOCK_FILES)) {
      console.log("Blocklist write allowed for:", writerAddress);
      resolve(true);
    } else {
      console.warn("Blocklist write REJECTED - no BLOCK_FILES permission:", writerAddress);
      resolve(false);
    }
  });
}

/**
 * Verificator for categories - requires CREATE_CATEGORIES permission for new entries
 */
function categoriesVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    if (userHasPermission(writerAddress, PERMISSIONS.CREATE_CATEGORIES)) {
      console.log("Categories write allowed for:", writerAddress);
      resolve(true);
    } else {
      // Allow if not adding new keys (just syncing existing)
      const newValue = msg.v || {};
      const oldValue = previousData?.v || {};
      const newKeys = Object.keys(newValue).filter(k => !(k in oldValue));
      
      if (newKeys.length === 0) {
        resolve(true);
      } else {
        console.warn("Categories write REJECTED - no CREATE_CATEGORIES permission:", writerAddress);
        resolve(false);
      }
    }
  });
}

/**
 * Verificator for channel meta/settings - requires EDIT_CHANNEL permission
 */
function metaVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    // Allow first write (channel creation)
    if (!previousData?.v) {
      console.log("Meta write allowed (initial creation):", writerAddress);
      resolve(true);
      return;
    }
    
    if (userHasPermission(writerAddress, PERMISSIONS.EDIT_CHANNEL)) {
      console.log("Meta write allowed for:", writerAddress);
      resolve(true);
    } else {
      console.warn("Meta write REJECTED - no EDIT_CHANNEL permission:", writerAddress);
      resolve(false);
    }
  });
}

/**
 * Verificator for admins - requires PROMOTE_ADMINS permission
 */
function adminsVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    // Allow first write (channel creation by owner)
    if (!previousData?.v) {
      console.log("Admins write allowed (initial creation):", writerAddress);
      resolve(true);
      return;
    }
    
    if (userHasPermission(writerAddress, PERMISSIONS.PROMOTE_ADMINS)) {
      console.log("Admins write allowed for:", writerAddress);
      resolve(true);
    } else {
      console.warn("Admins write REJECTED - no PROMOTE_ADMINS permission:", writerAddress);
      resolve(false);
    }
  });
}

/**
 * Verificator for user blocklist - requires BLOCK_USERS permission
 */
function userBlocklistVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    // Allow first write
    if (!previousData?.v) {
      resolve(true);
      return;
    }
    
    if (userHasPermission(writerAddress, PERMISSIONS.BLOCK_USERS)) {
      console.log("User blocklist write allowed for:", writerAddress);
      resolve(true);
    } else {
      console.warn("User blocklist write REJECTED - no BLOCK_USERS permission:", writerAddress);
      resolve(false);
    }
  });
}

/**
 * Set up custom verificators for permission enforcement
 */
function setupVerificators(dbInstance) {
  // File blocklist (e.g., "ch:channelId:categoryId_blocklist")
  dbInstance.addCustomVerification("_blocklist", blocklistVerificator);
  
  // Categories
  dbInstance.addCustomVerification(":categories", categoriesVerificator);
  
  // Channel meta/settings (but not ownership which is frozen)
  dbInstance.addCustomVerification(":meta", metaVerificator);
  
  // Admins
  dbInstance.addCustomVerification(":admins", adminsVerificator);
  
  // User blocklist
  dbInstance.addCustomVerification(":blocklist", userBlocklistVerificator);
  
  console.log("Custom verificators registered for permission enforcement");
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
