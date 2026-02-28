import { getToolDb, getChannelKey, getChannelMetaKey } from "./tooldb";
import { 
  PERMISSIONS, 
  ALL_PERMISSIONS, 
  DEFAULT_ADMIN_PERMISSIONS,
  hasPermission as checkPermission,
  permissionsToString,
} from "./permissions";

// Categories need to be namespaced by channel
function getCategoriesKey() {
  return getChannelKey("categories");
}

let channelMetaListeners = [];
let currentChannelMeta = null;

// Re-export permissions for convenience
export { PERMISSIONS } from "./permissions";

export function getChannelMetaSync() {
  return currentChannelMeta;
}

export async function getChannelMeta() {
  const db = getToolDb();
  if (!db) return null;
  
  try {
    const meta = await db.getData(getChannelMetaKey());
    return meta || null;
  } catch (err) {
    console.error("Failed to get channel meta:", err);
    return null;
  }
}

export async function waitForChannelSync(timeoutMs = 3000) {
  const db = getToolDb();
  if (!db) return null;

  return new Promise((resolve) => {
    let resolved = false;
    
    db.subscribeData(getChannelMetaKey());
    
    const listener = (msg) => {
      if (!resolved && msg.v) {
        resolved = true;
        currentChannelMeta = msg.v;
        resolve(msg.v);
      }
    };
    
    db.addKeyListener(getChannelMetaKey(), listener);
    
    db.getData(getChannelMetaKey()).then((existing) => {
      if (!resolved && existing) {
        resolved = true;
        currentChannelMeta = existing;
        resolve(existing);
      }
    });
    
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
  const existingMeta = await waitForChannelSync(2000);
  
  if (existingMeta) {
    // Migrate old array-based admins to object-based if needed
    const migratedMeta = migrateAdminsFormat(existingMeta);
    console.log("Channel already exists, created by:", migratedMeta.creator);
    
    // Persist migration if format changed (only creator should do this to avoid conflicts)
    const wasArray = Array.isArray(existingMeta.admins);
    if (wasArray && existingMeta.creator === userAddress) {
      console.log("Persisting migrated admin format to database...");
      await db.putData(getChannelMetaKey(), migratedMeta);
    }
    
    currentChannelMeta = migratedMeta;
    return migratedMeta;
  }
  
  console.log("No existing channel found, creating new one...");
  
  const meta = {
    name: channelId,
    description: "",
    createdAt: Date.now(),
    creator: userAddress,
    admins: {
      [userAddress]: ALL_PERMISSIONS, // Creator gets all permissions
    },
    blocklist: [],
  };
  
  await db.putData(getChannelMetaKey(), meta);
  currentChannelMeta = meta;
  console.log("Channel initialized, user is creator with all permissions:", userAddress);
  return meta;
}

/**
 * Migrate old array-based admins format to new object-based format
 */
export function migrateAdminsFormat(meta) {
  if (!meta) return meta;
  
  // Already in new format (object)
  if (meta.admins && typeof meta.admins === 'object' && !Array.isArray(meta.admins)) {
    return meta;
  }
  
  // Migrate from array format
  if (Array.isArray(meta.admins)) {
    const newAdmins = {};
    meta.admins.forEach((addr, index) => {
      // First admin (creator) gets all permissions, others get default
      newAdmins[addr] = (addr === meta.creator) ? ALL_PERMISSIONS : DEFAULT_ADMIN_PERMISSIONS;
    });
    return { ...meta, admins: newAdmins };
  }
  
  return meta;
}

/**
 * Check if user has any admin permissions (is in admins object)
 */
export function isAdmin(meta, userAddress) {
  if (!meta || !meta.admins || !userAddress) return false;
  const migrated = migrateAdminsFormat(meta);
  return userAddress in migrated.admins;
}

/**
 * Check if user is the channel creator
 */
export function isCreator(meta, userAddress) {
  if (!meta || !meta.creator || !userAddress) return false;
  return meta.creator === userAddress;
}

/**
 * Get user's permission value (0 if not admin)
 */
export function getUserPermissions(meta, userAddress) {
  if (!meta || !meta.admins || !userAddress) return 0;
  const migrated = migrateAdminsFormat(meta);
  return migrated.admins[userAddress] || 0;
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

export async function updateChannelMeta(updates) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const existingMeta = await getChannelMeta();
  
  if (!existingMeta) {
    throw new Error("Channel not initialized");
  }
  
  if (!userHasPermission(existingMeta, userAddress, PERMISSIONS.EDIT_CHANNEL)) {
    throw new Error("You don't have permission to edit channel settings");
  }
  
  const newMeta = { ...migrateAdminsFormat(existingMeta), ...updates };
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function promoteToAdmin(targetAddress, permissions = DEFAULT_ADMIN_PERMISSIONS) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = migrateAdminsFormat(await getChannelMeta());
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.PROMOTE_ADMINS)) {
    throw new Error("You don't have permission to promote admins");
  }
  
  // Can't give more permissions than you have (unless you're creator)
  const myPerms = getUserPermissions(meta, userAddress);
  if (!isCreator(meta, userAddress) && (permissions & ~myPerms) !== 0) {
    throw new Error("Cannot grant permissions you don't have");
  }
  
  const newMeta = {
    ...meta,
    admins: {
      ...meta.admins,
      [targetAddress]: permissions,
    },
  };
  
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function updateAdminPermissions(targetAddress, permissions) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = migrateAdminsFormat(await getChannelMeta());
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.PROMOTE_ADMINS)) {
    throw new Error("You don't have permission to modify admin permissions");
  }
  
  if (targetAddress === meta.creator) {
    throw new Error("Cannot modify creator's permissions");
  }
  
  if (!(targetAddress in meta.admins)) {
    throw new Error("User is not an admin");
  }
  
  // Can't give more permissions than you have (unless you're creator)
  const myPerms = getUserPermissions(meta, userAddress);
  if (!isCreator(meta, userAddress) && (permissions & ~myPerms) !== 0) {
    throw new Error("Cannot grant permissions you don't have");
  }
  
  const newMeta = {
    ...meta,
    admins: {
      ...meta.admins,
      [targetAddress]: permissions,
    },
  };
  
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function demoteAdmin(targetAddress) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = migrateAdminsFormat(await getChannelMeta());
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.DEMOTE_ADMINS)) {
    throw new Error("You don't have permission to demote admins");
  }
  
  if (targetAddress === meta.creator) {
    throw new Error("Cannot demote the channel creator");
  }
  
  const { [targetAddress]: _, ...remainingAdmins } = meta.admins;
  
  const newMeta = {
    ...meta,
    admins: remainingAdmins,
  };
  
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function addToBlocklist(targetAddress) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = migrateAdminsFormat(await getChannelMeta());
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_USERS)) {
    throw new Error("You don't have permission to block users");
  }
  
  if (meta.blocklist?.includes(targetAddress)) {
    return meta;
  }
  
  const newMeta = {
    ...meta,
    blocklist: [...(meta.blocklist || []), targetAddress],
  };
  
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function removeFromBlocklist(targetAddress) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  const meta = migrateAdminsFormat(await getChannelMeta());
  
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_USERS)) {
    throw new Error("You don't have permission to unblock users");
  }
  
  const newMeta = {
    ...meta,
    blocklist: (meta.blocklist || []).filter(a => a !== targetAddress),
  };
  
  await db.putData(getChannelMetaKey(), newMeta);
  currentChannelMeta = newMeta;
  return newMeta;
}

export async function getCategories() {
  const db = getToolDb();
  if (!db) return {};
  
  try {
    const key = getCategoriesKey();
    const categories = await db.getData(key);
    return categories || {};
  } catch (err) {
    console.error("Failed to get categories:", err);
    return {};
  }
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
  
  return category;
}

/**
 * Delete (archive) a category - marks it as deleted
 * In P2P systems we can't truly delete, so this is a soft delete
 */
export async function deleteCategory(categoryId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = migrateAdminsFormat(await getChannelMeta());
  
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
  return updated;
}

/**
 * Restore a deleted category
 */
export async function restoreCategory(categoryId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = migrateAdminsFormat(await getChannelMeta());
  
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
  return updated;
}

/**
 * Check if a category is deleted
 */
export function isCategoryDeleted(category) {
  return category?.deleted != null;
}

export function subscribeToChannelMeta(callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  db.subscribeData(getChannelMetaKey());
  
  const listener = (msg) => {
    if (msg.v) {
      currentChannelMeta = msg.v;
      callback(msg.v);
    }
  };
  
  db.addKeyListener(getChannelMetaKey(), listener);
  channelMetaListeners.push(listener);
  
  return () => {
    channelMetaListeners = channelMetaListeners.filter(l => l !== listener);
  };
}

export function subscribeToCategories(callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  const key = getCategoriesKey();
  db.subscribeData(key);
  db.addKeyListener(key, (msg) => {
    callback(msg.v || {});
  });
  
  return () => {};
}
