import { getToolDb, getChannelKey } from "./tooldb";

/**
 * Upvote Service
 * 
 * Data Structure:
 * Key: ch:{channelId}:upvotes_{fileId}
 * Value: { [userAddress]: boolean }
 * 
 * Each user can only have one upvote per file.
 * The key is the user's address, ensuring one vote per user.
 * 
 * Note: Since ToolDB is write-only (no delete), we use boolean values:
 * - true = upvoted
 * - We track "removed" upvotes by setting to false or just not counting them
 * 
 * For simplicity, we count all truthy values as upvotes.
 */

function sanitizeKey(key) {
  return key.replace(/\./g, "_");
}

function getUpvotesKey(fileId) {
  return getChannelKey(`upvotes_${sanitizeKey(fileId)}`);
}

// Local listeners for immediate UI updates
const localUpvoteListeners = new Map(); // fileId -> Set of callbacks

function notifyUpvoteListeners(fileId, data) {
  const listeners = localUpvoteListeners.get(fileId);
  if (listeners) {
    listeners.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error("Upvote listener error:", err);
      }
    });
  }
}

/**
 * Get all upvotes for a file
 */
export async function getUpvotes(fileId) {
  const db = getToolDb();
  if (!db) return {};
  
  try {
    const upvotes = await db.getData(getUpvotesKey(fileId));
    return upvotes || {};
  } catch (err) {
    console.error("Failed to get upvotes:", err);
    return {};
  }
}

/**
 * Toggle upvote for a file
 * If user has upvoted, remove the upvote (set to false)
 * If user hasn't upvoted, add the upvote (set to true)
 */
export async function toggleUpvote(fileId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const existing = await getUpvotes(fileId);
  const currentVote = existing[userAddress];
  
  // Toggle: if true -> false, if false/undefined -> true
  const newVote = !currentVote;
  
  const updated = { ...existing, [userAddress]: newVote };
  
  await db.putData(getUpvotesKey(fileId), updated);
  notifyUpvoteListeners(fileId, updated);
  
  return { upvoted: newVote, upvotes: updated };
}

/**
 * Check if current user has upvoted a file
 */
export async function hasUserUpvoted(fileId) {
  const db = getToolDb();
  if (!db) return false;
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) return false;
  
  const upvotes = await getUpvotes(fileId);
  return !!upvotes[userAddress];
}

/**
 * Get upvote count for a file
 */
export function getUpvoteCount(upvotesData) {
  if (!upvotesData) return 0;
  // Count only truthy values (active upvotes)
  return Object.values(upvotesData).filter(v => v).length;
}

/**
 * Check if a specific user has upvoted (from data)
 */
export function isUpvotedBy(upvotesData, userAddress) {
  if (!upvotesData || !userAddress) return false;
  return !!upvotesData[userAddress];
}

/**
 * Subscribe to upvotes for a file
 * Returns unsubscribe function
 */
export function subscribeToUpvotes(fileId, callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  const key = getUpvotesKey(fileId);
  db.subscribeData(key);
  
  // Network/storage listener
  const listener = (msg) => {
    callback(msg.v || {});
  };
  db.addKeyListener(key, listener);
  
  // Local listener for immediate updates
  if (!localUpvoteListeners.has(fileId)) {
    localUpvoteListeners.set(fileId, new Set());
  }
  localUpvoteListeners.get(fileId).add(callback);
  
  return () => {
    const listeners = localUpvoteListeners.get(fileId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        localUpvoteListeners.delete(fileId);
      }
    }
  };
}

/**
 * Get list of users who upvoted (for display)
 */
export function getUpvoters(upvotesData) {
  if (!upvotesData) return [];
  return Object.entries(upvotesData)
    .filter(([, v]) => v)
    .map(([address]) => address);
}
