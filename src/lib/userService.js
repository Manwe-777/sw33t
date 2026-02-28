import { getToolDb } from "./tooldb";

/**
 * Get the profile key for a user address
 * Format: {address}_profile (dots not allowed in ToolDB keys)
 */
function getProfileKey(address) {
  return `${address}_profile`;
}

/**
 * Get the current user's profile from ToolDB
 */
export async function getMyProfile() {
  const db = getToolDb();
  if (!db || !db.userAccount) return null;
  
  const address = db.userAccount.getAddress();
  return getProfile(address);
}

/**
 * Get a user's profile by their address
 */
export async function getProfile(address) {
  const db = getToolDb();
  if (!db || !address) {
    console.log("getProfile: db or address missing", { db: !!db, address });
    return null;
  }
  
  try {
    const key = getProfileKey(address);
    console.log("getProfile: fetching key", key);
    const profile = await db.getData(key);
    console.log("getProfile: result for", address.slice(0, 8), ":", profile);
    return profile || null;
  } catch (err) {
    console.error("Failed to get profile:", err);
    return null;
  }
}

/**
 * Update the current user's profile
 */
export async function updateMyProfile(updates) {
  const db = getToolDb();
  if (!db || !db.userAccount) throw new Error("Not authenticated");
  
  const address = db.userAccount.getAddress();
  const existing = await getProfile(address) || {};
  
  const newProfile = {
    ...existing,
    ...updates,
    address,
    updatedAt: Date.now(),
  };
  
  await db.putData(getProfileKey(address), newProfile);
  console.log("Profile updated:", newProfile);
  return newProfile;
}

/**
 * Set username in profile
 */
export async function setUsername(username) {
  return updateMyProfile({ username });
}

/**
 * Set avatar in profile
 */
export async function setAvatar(avatar) {
  return updateMyProfile({ avatar });
}

/**
 * Subscribe to a user's profile changes
 */
export function subscribeToProfile(address, callback) {
  const db = getToolDb();
  if (!db || !address) return () => {};
  
  const key = getProfileKey(address);
  db.subscribeData(key);
  
  const listener = (msg) => {
    callback(msg.v || null);
  };
  
  db.addKeyListener(key, listener);
  
  return () => {};
}

/**
 * Get multiple profiles at once
 */
export async function getProfiles(addresses) {
  const profiles = {};
  
  await Promise.all(
    addresses.map(async (addr) => {
      const profile = await getProfile(addr);
      if (profile) {
        profiles[addr] = profile;
      }
    })
  );
  
  return profiles;
}

/**
 * Cache for profiles to avoid repeated lookups
 */
const profileCache = new Map();
const profileListeners = new Map();

/**
 * Get a profile with caching and auto-subscription
 */
export async function getCachedProfile(address) {
  if (!address) return null;
  
  // Return cached if available
  if (profileCache.has(address)) {
    return profileCache.get(address);
  }
  
  // Fetch and cache
  const profile = await getProfile(address);
  if (profile) {
    profileCache.set(address, profile);
  }
  
  // Subscribe for updates if not already
  if (!profileListeners.has(address)) {
    const unsub = subscribeToProfile(address, (newProfile) => {
      if (newProfile) {
        profileCache.set(address, newProfile);
      }
    });
    profileListeners.set(address, unsub);
  }
  
  return profile;
}

/**
 * Get username from cache or return shortened address
 */
export function getDisplayName(address, fallbackToAddress = true) {
  if (!address) return "Unknown";
  
  const cached = profileCache.get(address);
  if (cached?.username) {
    return cached.username;
  }
  
  if (fallbackToAddress) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  
  return null;
}
