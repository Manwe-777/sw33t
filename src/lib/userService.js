import { getToolDb } from "./tooldb";

/**
 * User profile data is stored in ToolDB's private namespace.
 * Private namespace format: :{address}.{key}
 * Only the address owner can write, but anyone can read.
 * 
 * We store: name, avatar as separate keys for efficiency
 */

/**
 * Get a user's username from their private namespace
 */
export async function getProfile(address) {
  const db = getToolDb();
  if (!db || !address) {
    console.log("getProfile: db or address missing", { db: !!db, address });
    return null;
  }
  
  try {
    // Fetch name from private namespace
    const nameKey = `:${address}.name`;
    const avatarKey = `:${address}.avatar`;
    
    console.log("getProfile: fetching keys", nameKey, avatarKey);
    
    const [username, avatar] = await Promise.all([
      db.getData(nameKey),
      db.getData(avatarKey),
    ]);
    
    const profile = {
      address,
      username: username || null,
      avatar: avatar || null,
    };
    
    console.log("getProfile: result for", address.slice(0, 8), ":", profile);
    return profile;
  } catch (err) {
    console.error("Failed to get profile:", err);
    return null;
  }
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
 * Set the current user's username (stored in private namespace)
 */
export async function setUsername(username) {
  const db = getToolDb();
  if (!db || !db.userAccount) throw new Error("Not authenticated");
  
  // putData with true = private namespace (automatically prefixes with :address.)
  await db.putData("name", username, true);
  console.log("Username saved to ToolDB:", username);
  
  // Update cache
  const address = db.userAccount.getAddress();
  updateProfileCache(address, { username });
  
  return username;
}

/**
 * Set the current user's avatar (stored in private namespace)
 */
export async function setAvatar(avatar) {
  const db = getToolDb();
  if (!db || !db.userAccount) throw new Error("Not authenticated");
  
  // putData with true = private namespace
  await db.putData("avatar", avatar, true);
  console.log("Avatar saved to ToolDB:", avatar);
  
  // Update cache
  const address = db.userAccount.getAddress();
  updateProfileCache(address, { avatar });
  
  return avatar;
}

/**
 * Subscribe to a user's profile changes
 */
export function subscribeToProfile(address, callback) {
  const db = getToolDb();
  if (!db || !address) return () => {};
  
  const nameKey = `:${address}.name`;
  const avatarKey = `:${address}.avatar`;
  
  // Subscribe to both keys
  db.subscribeData(nameKey);
  db.subscribeData(avatarKey);
  
  let currentProfile = { address, username: null, avatar: null };
  
  const nameListener = (msg) => {
    currentProfile = { ...currentProfile, username: msg.v || null };
    updateProfileCache(address, { username: msg.v });
    callback(currentProfile);
  };
  
  const avatarListener = (msg) => {
    currentProfile = { ...currentProfile, avatar: msg.v || null };
    updateProfileCache(address, { avatar: msg.v });
    callback(currentProfile);
  };
  
  db.addKeyListener(nameKey, nameListener);
  db.addKeyListener(avatarKey, avatarListener);
  
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
 * Update profile cache
 */
function updateProfileCache(address, updates) {
  const existing = profileCache.get(address) || { address, username: null, avatar: null };
  profileCache.set(address, { ...existing, ...updates });
}

/**
 * Get a profile with caching and auto-subscription
 */
export async function getCachedProfile(address) {
  if (!address) return null;
  
  // Return cached if available and has data
  const cached = profileCache.get(address);
  if (cached && (cached.username || cached.avatar)) {
    return cached;
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

/**
 * Save username on login/signup (called from AuthContext)
 */
export async function saveUsernameOnAuth(username) {
  if (!username) return;
  
  const db = getToolDb();
  if (!db || !db.userAccount) return;
  
  try {
    await setUsername(username);
  } catch (err) {
    console.error("Failed to save username to ToolDB:", err);
  }
}
