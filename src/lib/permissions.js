/**
 * Bitwise Permission System
 * 
 * Each permission is a power of 2, allowing them to be combined:
 * - Single permission: BLOCK_FILES = 1
 * - Combined: BLOCK_FILES | BLOCK_USERS = 3
 * - Check: (perms & BLOCK_FILES) !== 0
 * 
 * Binary representation example:
 * 0b00011111 (31) = All permissions
 * 0b00000011 (3)  = BLOCK_FILES + BLOCK_USERS
 */

export const PERMISSIONS = {
  BLOCK_FILES:       1 << 0,  // 1  - Can block/unblock files
  BLOCK_USERS:       1 << 1,  // 2  - Can add users to blocklist
  PROMOTE_ADMINS:    1 << 2,  // 4  - Can promote users to admin
  DEMOTE_ADMINS:     1 << 3,  // 8  - Can demote admins (except creator)
  EDIT_CHANNEL:      1 << 4,  // 16 - Can edit channel name/description/avatar
  CREATE_CATEGORIES: 1 << 5,  // 32 - Can create new categories
  DELETE_CATEGORIES: 1 << 6,  // 64 - Can delete/archive categories
  // Future permissions can be added: 128, 256, etc.
};

export const PERMISSION_LABELS = {
  [PERMISSIONS.BLOCK_FILES]: "Block Files",
  [PERMISSIONS.BLOCK_USERS]: "Block Users",
  [PERMISSIONS.PROMOTE_ADMINS]: "Promote Admins",
  [PERMISSIONS.DEMOTE_ADMINS]: "Demote Admins",
  [PERMISSIONS.EDIT_CHANNEL]: "Edit Channel",
  [PERMISSIONS.CREATE_CATEGORIES]: "Create Categories",
  [PERMISSIONS.DELETE_CATEGORIES]: "Delete Categories",
};

export const PERMISSION_DESCRIPTIONS = {
  [PERMISSIONS.BLOCK_FILES]: "Can hide files from all users",
  [PERMISSIONS.BLOCK_USERS]: "Can block users from the channel",
  [PERMISSIONS.PROMOTE_ADMINS]: "Can grant admin roles to users",
  [PERMISSIONS.DEMOTE_ADMINS]: "Can remove admin roles from users",
  [PERMISSIONS.EDIT_CHANNEL]: "Can change channel name, description, avatar",
  [PERMISSIONS.CREATE_CATEGORIES]: "Can create new categories",
  [PERMISSIONS.DELETE_CATEGORIES]: "Can archive/delete categories",
};

// All permissions combined
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((a, b) => a | b, 0);

// Default permission sets
export const CREATOR_PERMISSIONS = ALL_PERMISSIONS; // Creator has everything

export const DEFAULT_ADMIN_PERMISSIONS = 
  PERMISSIONS.BLOCK_FILES | 
  PERMISSIONS.BLOCK_USERS |
  PERMISSIONS.CREATE_CATEGORIES;

export const MODERATOR_PERMISSIONS = 
  PERMISSIONS.BLOCK_FILES | 
  PERMISSIONS.BLOCK_USERS;

/**
 * Check if a permission set includes a specific permission
 */
export function hasPermission(permissions, permission) {
  if (permissions === undefined || permissions === null) return false;
  return (permissions & permission) !== 0;
}

/**
 * Check if a permission set includes ALL of the specified permissions
 */
export function hasAllPermissions(permissions, ...requiredPermissions) {
  const combined = requiredPermissions.reduce((a, b) => a | b, 0);
  return (permissions & combined) === combined;
}

/**
 * Check if a permission set includes ANY of the specified permissions
 */
export function hasAnyPermission(permissions, ...checkPermissions) {
  const combined = checkPermissions.reduce((a, b) => a | b, 0);
  return (permissions & combined) !== 0;
}

/**
 * Add permission(s) to a permission set
 */
export function addPermission(permissions, ...toAdd) {
  const combined = toAdd.reduce((a, b) => a | b, 0);
  return permissions | combined;
}

/**
 * Remove permission(s) from a permission set
 */
export function removePermission(permissions, ...toRemove) {
  const combined = toRemove.reduce((a, b) => a | b, 0);
  return permissions & ~combined;
}

/**
 * Toggle a permission on/off
 */
export function togglePermission(permissions, permission) {
  return permissions ^ permission;
}

/**
 * Get an array of individual permissions from a combined permission set
 */
export function getPermissionsList(permissions) {
  return Object.values(PERMISSIONS).filter(p => hasPermission(permissions, p));
}

/**
 * Convert permissions to a human-readable string
 */
export function permissionsToString(permissions) {
  const perms = getPermissionsList(permissions);
  return perms.map(p => PERMISSION_LABELS[p]).join(", ") || "None";
}

/**
 * Convert permissions to binary string for debugging
 */
export function permissionsToBinary(permissions) {
  return `0b${(permissions >>> 0).toString(2).padStart(8, '0')} (${permissions})`;
}
