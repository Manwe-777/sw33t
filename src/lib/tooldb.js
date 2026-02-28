import * as tooldb from "tool-db";
import * as webrtcNetwork from "@tool-db/webrtc-network";
import * as indexeddbStore from "@tool-db/indexeddb-store";
import * as ecdsaUser from "@tool-db/ecdsa-user";
import { hasPermission, PERMISSIONS } from "./permissions";

const ToolDb = tooldb.ToolDb || tooldb.default || tooldb;
const ToolDbWebrtc = webrtcNetwork.default || webrtcNetwork;
const ToolDbIndexedb = indexeddbStore.default || indexeddbStore;
const ToolDbEcdsaUser = ecdsaUser.default || ecdsaUser;

let db = null;
let currentTopic = null;
let channelMetaCache = null;

const CHANNEL_META_KEY = "==channel-meta";

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
    // ToolDB doesn't have a close method, but we can replace the instance
    db = null;
  }
  
  currentTopic = topic;
  
  db = new ToolDb({
    peers: [],
    userAdapter: ToolDbEcdsaUser,
    networkAdapter: ToolDbWebrtc,
    storageAdapter: ToolDbIndexedb,
    debug: true,
    topic: topic,
  });
  
  // Subscribe to channel meta for permission verification
  db.subscribeData(CHANNEL_META_KEY);
  db.addKeyListener(CHANNEL_META_KEY, (msg) => {
    if (msg.v) {
      channelMetaCache = migrateAdminsFormat(msg.v);
      console.log("Channel meta cached for verification:", channelMetaCache);
    }
  });
  
  // Add custom verificators for permission enforcement
  setupVerificators(db);
  
  // Expose for debugging
  window.toolDb = db;
  
  return db;
}

/**
 * Migrate old array-based admins format to new object format
 */
function migrateAdminsFormat(meta) {
  if (!meta) return meta;
  if (meta.admins && typeof meta.admins === 'object' && !Array.isArray(meta.admins)) {
    return meta;
  }
  if (Array.isArray(meta.admins)) {
    const ALL_PERMISSIONS = 63; // All bits set
    const DEFAULT_ADMIN_PERMISSIONS = 35; // BLOCK_FILES | BLOCK_USERS | CREATE_CATEGORIES
    const newAdmins = {};
    meta.admins.forEach((addr) => {
      newAdmins[addr] = (addr === meta.creator) ? ALL_PERMISSIONS : DEFAULT_ADMIN_PERMISSIONS;
    });
    return { ...meta, admins: newAdmins };
  }
  return meta;
}

/**
 * Check if a user has a specific permission
 */
function userHasPermission(userAddress, permission) {
  if (!channelMetaCache || !channelMetaCache.admins || !userAddress) return false;
  const perms = channelMetaCache.admins[userAddress] || 0;
  return hasPermission(perms, permission);
}

/**
 * Verificator for file blocklist - requires BLOCK_FILES permission
 */
function blocklistVerificator(msg, previousData) {
  return new Promise((resolve) => {
    const writerAddress = msg.a;
    
    // Check if writer has BLOCK_FILES permission
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
    
    // If adding new categories, check permission
    if (userHasPermission(writerAddress, PERMISSIONS.CREATE_CATEGORIES)) {
      console.log("Categories write allowed for:", writerAddress);
      resolve(true);
    } else {
      // Allow if not adding new keys (just syncing existing)
      const newValue = msg.v || {};
      const oldValue = previousData?.v || {};
      const newKeys = Object.keys(newValue).filter(k => !(k in oldValue));
      
      if (newKeys.length === 0) {
        resolve(true); // No new categories, allow sync
      } else {
        console.warn("Categories write REJECTED - no CREATE_CATEGORIES permission:", writerAddress);
        resolve(false);
      }
    }
  });
}

/**
 * Set up custom verificators for permission enforcement
 */
function setupVerificators(dbInstance) {
  // Verificator for blocklist keys (e.g., "ch:channelId:categoryId_blocklist")
  // The key pattern will match any key containing "_blocklist"
  dbInstance.addCustomVerification("_blocklist", blocklistVerificator);
  
  // Verificator for categories (e.g., "ch:channelId:categories")
  // The key pattern will match any key containing "categories"
  dbInstance.addCustomVerification("categories", categoriesVerificator);
  
  console.log("Custom verificators registered for permission enforcement");
}

/**
 * Get the current ToolDB instance
 * @returns {ToolDb|null}
 */
export function getToolDb() {
  return db;
}

/**
 * Get the current topic/channel
 * @returns {string|null}
 */
export function getCurrentTopic() {
  return currentTopic;
}

/**
 * Get the current channel ID (without sw33t- prefix)
 * @returns {string|null}
 */
export function getCurrentChannelId() {
  if (!currentTopic) return null;
  return currentTopic.replace(/^sw33t-/, "");
}

/**
 * Create a channel-namespaced key
 * @param {string} key - The base key
 * @returns {string} The namespaced key
 */
export function getChannelKey(key) {
  const channelId = getCurrentChannelId();
  if (!channelId) {
    console.warn("No channel connected, using key without namespace:", key);
    return key;
  }
  // Use format: ch:{channelId}:{key}
  return `ch:${channelId}:${key}`;
}
