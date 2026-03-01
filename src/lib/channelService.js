import { getToolDb, getChannelKey, getCurrentChannelId } from "./tooldb";
import { 
  PERMISSIONS, 
  ALL_PERMISSIONS, 
  DEFAULT_ADMIN_PERMISSIONS,
  hasPermission as checkPermission,
  permissionsToString,
} from "./permissions";

/**
 * NEW DATA STRUCTURE:
 * 
 * ==ch:{id}:owner              (frozen) - Immutable ownership
 *   └── { creator, createdAt }
 * 
 * ch:{id}:meta                 (regular key) - Editable settings
 *   └── { name, description, avatar }
 * 
 * ch:{id}:admins               (regular key) - Admin permissions with audit trail
 *   └── { [address]: { permissions, promotedBy, promotedAt } }
 * 
 * ch:{id}:blocklist            (regular key) - Blocked users
 *   └── { [address]: { blockedBy, blockedAt, reason? } }
 * 
 * ch:{id}:categories           (regular key) - Already exists
 *   └── { [id]: { name, icon, createdBy, createdAt, deleted? } }
 */

// Key helpers
function getOwnerKey() {
  const channelId = getCurrentChannelId();
  if (!channelId) return "==channel-owner";
  return `==ch:${channelId}:owner`;
}

function getMetaKey() {
  return getChannelKey("meta");
}

function getAdminsKey() {
  return getChannelKey("admins");
}

function getBlocklistKey() {
  return getChannelKey("blocklist");
}

function getCategoriesKey() {
  return getChannelKey("categories");
}

// Cache for combined channel data
let ownershipCache = null;
let settingsCache = null;
let adminsCache = null;
let blocklistCache = null;

// Local listeners for immediate UI updates
let channelDataListeners = [];

// Notify listeners with combined data
function notifyListeners() {
  const combinedData = getCombinedChannelData();
  channelDataListeners.forEach(cb => {
    try {
      cb(combinedData);
    } catch (err) {
      console.error("Channel data listener error:", err);
    }
  });
}

// Combine all channel data into the old meta format for backwards compatibility
function getCombinedChannelData() {
  if (!ownershipCache) return null;
  
  return {
    // From ownership (immutable)
    creator: ownershipCache.creator,
    createdAt: ownershipCache.createdAt,
    // From settings (editable)
    name: settingsCache?.name || getCurrentChannelId(),
    description: settingsCache?.description || "",
    avatar: settingsCache?.avatar || null,
    // From admins (with audit trail)
    admins: buildAdminsObject(),
    // From blocklist
    blocklist: blocklistCache ? Object.keys(blocklistCache) : [],
    // Full data for audit trail
    _adminsAudit: adminsCache,
    _blocklistAudit: blocklistCache,
  };
}

// Build simple admins object { address: permissions } for backwards compatibility
function buildAdminsObject() {
  const admins = {};
  
  // Creator always has all permissions
  if (ownershipCache?.creator) {
    admins[ownershipCache.creator] = ALL_PERMISSIONS;
  }
  
  // Add other admins
  if (adminsCache) {
    for (const [address, data] of Object.entries(adminsCache)) {
      if (address !== ownershipCache?.creator) {
        admins[address] = data.permissions || 0;
      }
    }
  }
  
  return admins;
}

// Re-export permissions for convenience
export { PERMISSIONS } from "./permissions";

export function getChannelMetaSync() {
  return getCombinedChannelData();
}

export async function getChannelMeta() {
  const db = getToolDb();
  if (!db) return null;
  
  try {
    const [ownership, settings, admins, blocklist] = await Promise.all([
      db.getData(getOwnerKey()),
      db.getData(getMetaKey()),
      db.getData(getAdminsKey()),
      db.getData(getBlocklistKey()),
    ]);
    
    ownershipCache = ownership;
    settingsCache = settings;
    adminsCache = admins;
    blocklistCache = blocklist;
    
    return getCombinedChannelData();
  } catch (err) {
    console.error("Failed to get channel data:", err);
    return null;
  }
}

export async function waitForChannelSync(timeoutMs = 5000) {
  const db = getToolDb();
  if (!db) return null;

  return new Promise((resolve) => {
    let resolved = false;
    
    const ownerKey = getOwnerKey();
    db.subscribeData(ownerKey);
    
    const listener = (msg) => {
      if (!resolved && msg.v) {
        resolved = true;
        ownershipCache = msg.v;
        resolve(getCombinedChannelData());
      }
    };
    
    db.addKeyListener(ownerKey, listener);
    
    // Try multiple times with increasing delays
    const tryGetData = async (attempt = 1) => {
      if (resolved) return;
      
      try {
        const ownership = await db.getData(ownerKey, false, 2000);
        if (!resolved && ownership) {
          resolved = true;
          ownershipCache = ownership;
          
          // Also fetch other data
          const [settings, admins, blocklist] = await Promise.all([
            db.getData(getMetaKey()).catch(() => null),
            db.getData(getAdminsKey()).catch(() => null),
            db.getData(getBlocklistKey()).catch(() => null),
          ]);
          
          settingsCache = settings;
          adminsCache = admins;
          blocklistCache = blocklist;
          
          resolve(getCombinedChannelData());
          return;
        }
      } catch (e) {
        // Ignore errors, will retry
      }
      
      if (attempt < 3 && !resolved) {
        setTimeout(() => tryGetData(attempt + 1), 1000);
      }
    };
    
    tryGetData();
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);
  });
}

export async function initializeChannel(channelId, userAddress, username) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  console.log("Waiting for channel sync...");
  const existingData = await waitForChannelSync(5000);
  
  if (existingData) {
    console.log("Channel already exists, created by:", existingData.creator);
    return existingData;
  }
  
  console.log("No existing channel found, creating new one...");
  
  const now = Date.now();
  
  // 1. Create immutable ownership (frozen namespace)
  const ownership = {
    creator: userAddress,
    createdAt: now,
  };
  await db.putData(getOwnerKey(), ownership);
  ownershipCache = ownership;
  
  // 2. Create initial settings
  const settings = {
    name: channelId,
    description: "",
    avatar: null,
  };
  await db.putData(getMetaKey(), settings);
  settingsCache = settings;
  
  // 3. Create initial admins (creator with full permissions and audit trail)
  const admins = {
    [userAddress]: {
      permissions: ALL_PERMISSIONS,
      promotedBy: userAddress,  // Self (creator)
      promotedAt: now,
    },
  };
  await db.putData(getAdminsKey(), admins);
  adminsCache = admins;
  
  // 4. Initialize empty blocklist
  await db.putData(getBlocklistKey(), {});
  blocklistCache = {};
  
  const combinedData = getCombinedChannelData();
  console.log("Channel initialized, user is creator:", userAddress);
  notifyListeners();
  
  return combinedData;
}

/**
 * Check if user has any admin permissions
 */
export function isAdmin(meta, userAddress) {
  if (!meta || !userAddress) return false;
  return userAddress in (meta.admins || {});
}

/**
 * Check if user is the channel creator
 */
export function isCreator(meta, userAddress) {
  if (!meta || !userAddress) return false;
  return meta.creator === userAddress;
}

/**
 * Get user's permission value (0 if not admin)
 */
export function getUserPermissions(meta, userAddress) {
  if (!meta || !userAddress) return 0;
  
  // Creator ALWAYS has all permissions
  if (meta.creator === userAddress) {
    return ALL_PERMISSIONS;
  }
  
  return meta.admins?.[userAddress] || 0;
}

/**
 * Check if user has a specific permission
 */
export function userHasPermission(meta, userAddress, permission) {
  const perms = getUserPermissions(meta, userAddress);
  return checkPermission(perms, permission);
}

/**
 * Get formatted permission string for a user
 */
export function getUserPermissionsString(meta, userAddress) {
  const perms = getUserPermissions(meta, userAddress);
  return permissionsToString(perms);
}

/**
 * Get the audit trail for an admin
 */
export function getAdminAuditInfo(meta, userAddress) {
  if (!meta?._adminsAudit?.[userAddress]) return null;
  return meta._adminsAudit[userAddress];
}

/**
 * Get full admin history (for time travel view)
 */
export function getAdminHistory(meta) {
  if (!meta?._adminsAudit) return [];
  
  const history = [];
  for (const [address, data] of Object.entries(meta._adminsAudit)) {
    history.push({
      address,
      permissions: data.permissions,
      promotedBy: data.promotedBy,
      promotedAt: data.promotedAt,
      isCreator: address === meta.creator,
    });
  }
  
  // Sort by promotion time
  return history.sort((a, b) => a.promotedAt - b.promotedAt);
}

export async function updateChannelSettings(updates) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!meta) {
    throw new Error("Channel not initialized");
  }
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.EDIT_CHANNEL)) {
    throw new Error("You don't have permission to edit channel settings");
  }
  
  // Only update settings (not ownership)
  const newSettings = {
    ...settingsCache,
    ...updates,
  };
  
  // Don't allow changing ownership-related fields through this method
  delete newSettings.creator;
  delete newSettings.createdAt;
  
  await db.putData(getMetaKey(), newSettings);
  settingsCache = newSettings;
  notifyListeners();
  
  return getCombinedChannelData();
}

// Backwards compatibility alias
export const updateChannelMeta = updateChannelSettings;

export async function promoteToAdmin(targetAddress, permissions = DEFAULT_ADMIN_PERMISSIONS) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.PROMOTE_ADMINS)) {
    throw new Error("You don't have permission to promote admins");
  }
  
  // Can't give more permissions than you have (unless you're creator)
  const myPerms = getUserPermissions(meta, userAddress);
  if (!isCreator(meta, userAddress) && (permissions & ~myPerms) !== 0) {
    throw new Error("Cannot grant permissions you don't have");
  }
  
  const now = Date.now();
  const newAdmins = {
    ...adminsCache,
    [targetAddress]: {
      permissions,
      promotedBy: userAddress,
      promotedAt: now,
    },
  };
  
  await db.putData(getAdminsKey(), newAdmins);
  adminsCache = newAdmins;
  notifyListeners();
  
  return getCombinedChannelData();
}

export async function updateAdminPermissions(targetAddress, permissions) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.PROMOTE_ADMINS)) {
    throw new Error("You don't have permission to modify admin permissions");
  }
  
  if (targetAddress === meta.creator) {
    throw new Error("Cannot modify creator's permissions");
  }
  
  if (!adminsCache?.[targetAddress]) {
    throw new Error("User is not an admin");
  }
  
  // Can't give more permissions than you have (unless you're creator)
  const myPerms = getUserPermissions(meta, userAddress);
  if (!isCreator(meta, userAddress) && (permissions & ~myPerms) !== 0) {
    throw new Error("Cannot grant permissions you don't have");
  }
  
  const now = Date.now();
  const existingData = adminsCache[targetAddress];
  
  const newAdmins = {
    ...adminsCache,
    [targetAddress]: {
      ...existingData,
      permissions,
      // Keep original promotedBy/At, add update info
      updatedBy: userAddress,
      updatedAt: now,
    },
  };
  
  await db.putData(getAdminsKey(), newAdmins);
  adminsCache = newAdmins;
  notifyListeners();
  
  return getCombinedChannelData();
}

export async function demoteAdmin(targetAddress) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.DEMOTE_ADMINS)) {
    throw new Error("You don't have permission to demote admins");
  }
  
  if (targetAddress === meta.creator) {
    throw new Error("Cannot demote the channel creator");
  }
  
  // Mark as demoted instead of deleting (audit trail)
  const now = Date.now();
  const existingData = adminsCache?.[targetAddress];
  
  if (!existingData) {
    throw new Error("User is not an admin");
  }
  
  const newAdmins = {
    ...adminsCache,
    [targetAddress]: {
      ...existingData,
      permissions: 0,  // Remove all permissions
      demotedBy: userAddress,
      demotedAt: now,
    },
  };
  
  await db.putData(getAdminsKey(), newAdmins);
  adminsCache = newAdmins;
  notifyListeners();
  
  return getCombinedChannelData();
}

export async function addToBlocklist(targetAddress, reason = "") {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_USERS)) {
    throw new Error("You don't have permission to block users");
  }
  
  if (blocklistCache?.[targetAddress]) {
    return meta; // Already blocked
  }
  
  const now = Date.now();
  const newBlocklist = {
    ...blocklistCache,
    [targetAddress]: {
      blockedBy: userAddress,
      blockedAt: now,
      reason,
    },
  };
  
  await db.putData(getBlocklistKey(), newBlocklist);
  blocklistCache = newBlocklist;
  notifyListeners();
  
  return getCombinedChannelData();
}

export async function removeFromBlocklist(targetAddress) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_USERS)) {
    throw new Error("You don't have permission to unblock users");
  }
  
  if (!blocklistCache?.[targetAddress]) {
    return meta; // Not blocked
  }
  
  // Mark as unblocked (audit trail)
  const now = Date.now();
  const existingData = blocklistCache[targetAddress];
  
  const newBlocklist = {
    ...blocklistCache,
    [targetAddress]: {
      ...existingData,
      unblockedBy: userAddress,
      unblockedAt: now,
    },
  };
  
  // Actually remove from blocklist for active check
  delete newBlocklist[targetAddress];
  
  await db.putData(getBlocklistKey(), newBlocklist);
  blocklistCache = newBlocklist;
  notifyListeners();
  
  return getCombinedChannelData();
}

export async function getCategories() {
  const db = getToolDb();
  if (!db) return {};
  
  try {
    const categories = await db.getData(getCategoriesKey());
    return categories || {};
  } catch (err) {
    console.error("Failed to get categories:", err);
    return {};
  }
}

// Local categories cache
let localCategoriesCache = null;
let categoriesListeners = [];

function notifyCategoriesListeners(categories) {
  localCategoriesCache = categories;
  categoriesListeners.forEach(cb => cb(categories));
}

export async function createCategory(id, name, icon = "folder") {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const existing = await getCategories();
  
  if (existing[id]) {
    throw new Error("Category already exists");
  }
  
  const category = {
    id,
    name,
    icon,
    createdBy: userAddress,
    createdAt: Date.now(),
  };
  
  const updated = { ...existing, [id]: category };
  await db.putData(getCategoriesKey(), updated);
  notifyCategoriesListeners(updated);
  
  return category;
}

export async function deleteCategory(categoryId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.DELETE_CATEGORIES)) {
    throw new Error("You don't have permission to delete categories");
  }
  
  const categories = await getCategories();
  
  if (!categories[categoryId]) {
    throw new Error("Category not found");
  }
  
  const updated = {
    ...categories,
    [categoryId]: {
      ...categories[categoryId],
      deleted: {
        deletedAt: Date.now(),
        deletedBy: userAddress,
      },
    },
  };
  
  await db.putData(getCategoriesKey(), updated);
  notifyCategoriesListeners(updated);
  
  return updated;
}

export async function restoreCategory(categoryId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = getCombinedChannelData();
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.DELETE_CATEGORIES)) {
    throw new Error("You don't have permission to restore categories");
  }
  
  const categories = await getCategories();
  
  if (!categories[categoryId]) {
    throw new Error("Category not found");
  }
  
  const { deleted, ...categoryData } = categories[categoryId];
  
  const updated = {
    ...categories,
    [categoryId]: categoryData,
  };
  
  await db.putData(getCategoriesKey(), updated);
  notifyCategoriesListeners(updated);
  
  return updated;
}

export function isCategoryDeleted(category) {
  return category?.deleted != null;
}

export function subscribeToChannelMeta(callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  // Add to listeners
  channelDataListeners.push(callback);
  
  // If we have cached data, call immediately
  const current = getCombinedChannelData();
  if (current) {
    callback(current);
  }
  
  // Subscribe to all relevant keys
  const ownerKey = getOwnerKey();
  const metaKey = getMetaKey();
  const adminsKey = getAdminsKey();
  const blocklistKey = getBlocklistKey();
  
  db.subscribeData(ownerKey);
  db.subscribeData(metaKey);
  db.subscribeData(adminsKey);
  db.subscribeData(blocklistKey);
  
  // Ownership listener
  db.addKeyListener(ownerKey, (msg) => {
    if (msg.v) {
      ownershipCache = msg.v;
      notifyListeners();
    }
  });
  
  // Settings listener
  db.addKeyListener(metaKey, (msg) => {
    if (msg.v) {
      settingsCache = msg.v;
      notifyListeners();
    }
  });
  
  // Admins listener
  db.addKeyListener(adminsKey, (msg) => {
    if (msg.v) {
      adminsCache = msg.v;
      notifyListeners();
    }
  });
  
  // Blocklist listener
  db.addKeyListener(blocklistKey, (msg) => {
    if (msg.v) {
      blocklistCache = msg.v;
      notifyListeners();
    }
  });
  
  return () => {
    channelDataListeners = channelDataListeners.filter(cb => cb !== callback);
  };
}

export function subscribeToCategories(callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  categoriesListeners.push(callback);
  
  if (localCategoriesCache) {
    callback(localCategoriesCache);
  }
  
  const key = getCategoriesKey();
  db.subscribeData(key);
  db.addKeyListener(key, (msg) => {
    const categories = msg.v || {};
    localCategoriesCache = categories;
    callback(categories);
  });
  
  return () => {
    categoriesListeners = categoriesListeners.filter(cb => cb !== callback);
  };
}

// Reset caches when switching channels
export function resetChannelCache() {
  ownershipCache = null;
  settingsCache = null;
  adminsCache = null;
  blocklistCache = null;
  localCategoriesCache = null;
  channelDataListeners = [];
  categoriesListeners = [];
}

/**
 * No-op for backwards compatibility - new format doesn't need migration
 */
export function migrateAdminsFormat(meta) {
  return meta;
}
