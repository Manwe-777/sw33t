import { getToolDb, getChannelKey } from "./tooldb";
import * as tooldb from "tool-db";

const MapCrdt = tooldb.MapCrdt;

/**
 * Comment Service (MapCRDT-backed)
 *
 * Data Structure:
 * Key: ch:{channelId}:comments_{fileId}
 * CRDT Type: MapCrdt<CommentData>
 * Map key = {userAddress}_{timestamp}
 *
 * This ensures:
 * - Each comment is uniquely identified
 * - Users can only add/edit their own comments (key prefix = their address)
 * - No deletes allowed (write-only, enforced by verificator)
 * - Concurrent comments from different users merge correctly
 *
 * CommentData: {
 *   text: string,
 *   editedAt?: number  // Set when comment is edited
 * }
 */

// Comment length limits (must match tooldb.js verificator)
export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_MIN_LENGTH = 1;

function sanitizeKey(key) {
  return key.replace(/\./g, "_");
}

function getCommentsKey(fileId) {
  return getChannelKey(`comments_${sanitizeKey(fileId)}`);
}

// Local listeners for immediate UI updates
const localCommentListeners = new Map(); // fileId -> Set of callbacks

function notifyCommentListeners(fileId, data) {
  const listeners = localCommentListeners.get(fileId);
  if (listeners) {
    listeners.forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error("Comment listener error:", err);
      }
    });
  }
}

/**
 * Reconstruct a MapCrdt value from a raw CRDT message.
 * Handles both CRDT format (msg.c = "MAP", msg.v = changes[])
 * and legacy putData format (msg.v = plain object) for migration.
 */
function valueFromCrdtMsg(msg) {
  if (msg && msg.c === "MAP" && Array.isArray(msg.v)) {
    const map = new MapCrdt("", msg.v);
    return map.value;
  }
  // Fallback for legacy putData format
  if (msg && msg.v && !Array.isArray(msg.v)) {
    return msg.v;
  }
  return {};
}

/**
 * Store CRDT data locally after putCrdt.
 * putCrdt only broadcasts to the network — it does NOT write to
 * local storage (unlike putData). We need to persist manually
 * for local-first reads via getCrdt.
 */
async function storeLocally(db, key, map) {
  try {
    const data = {
      k: key,
      a: db.userAccount.getAddress() || "",
      t: Date.now(),
      v: map.getChanges(),
      c: map.type,
      h: "",
      s: "",
      n: 0,
    };
    await db.store.put(key, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to store CRDT locally:", err);
  }
}

/**
 * Get all comments for a file
 */
export async function getComments(fileId) {
  const db = getToolDb();
  if (!db) return {};

  const userAddress = db.userAccount?.getAddress() || "";

  try {
    const map = new MapCrdt(userAddress);
    await db.getCrdt(getCommentsKey(fileId), map, false);
    return map.value;
  } catch (err) {
    console.error("Failed to get comments:", err);
    return {};
  }
}

/**
 * Add a new comment to a file
 */
export async function addComment(fileId, text) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");

  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");

  const trimmedText = text.trim();
  if (trimmedText.length < COMMENT_MIN_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmedText.length > COMMENT_MAX_LENGTH) {
    throw new Error(`Comment too long (max ${COMMENT_MAX_LENGTH} characters)`);
  }

  // Comment key format: {userAddress}_{timestamp}
  const timestamp = Date.now();
  const commentKey = `${userAddress}_${timestamp}`;

  const commentData = {
    text: trimmedText,
  };

  const key = getCommentsKey(fileId);

  // Hydrate CRDT with existing data
  const map = new MapCrdt(userAddress);
  try {
    await db.getCrdt(key, map, false);
  } catch {
    // No existing data, start fresh
  }

  map.SET(commentKey, commentData);

  await db.putCrdt(key, map, false);
  await storeLocally(db, key, map);

  const currentValue = map.value;
  notifyCommentListeners(fileId, currentValue);

  return { key: commentKey, ...commentData };
}

/**
 * Edit an existing comment
 * Only the comment owner can edit their own comment
 */
export async function editComment(fileId, commentKey, newText) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");

  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");

  // Verify ownership: comment key must start with user's address
  if (!commentKey.startsWith(userAddress)) {
    throw new Error("You can only edit your own comments");
  }

  const trimmedText = newText.trim();
  if (trimmedText.length < COMMENT_MIN_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmedText.length > COMMENT_MAX_LENGTH) {
    throw new Error(`Comment too long (max ${COMMENT_MAX_LENGTH} characters)`);
  }

  const key = getCommentsKey(fileId);

  // Hydrate CRDT with existing data
  const map = new MapCrdt(userAddress);
  try {
    await db.getCrdt(key, map, false);
  } catch {
    // No existing data
  }

  if (!map.value[commentKey]) {
    throw new Error("Comment not found");
  }

  const updatedComment = {
    ...map.value[commentKey],
    text: trimmedText,
    editedAt: Date.now(),
  };

  // SET overwrites the existing key in the MapCrdt (increments index)
  map.SET(commentKey, updatedComment);

  await db.putCrdt(key, map, false);
  await storeLocally(db, key, map);

  const currentValue = map.value;
  notifyCommentListeners(fileId, currentValue);

  return updatedComment;
}

/**
 * Subscribe to comments for a file
 * Returns unsubscribe function
 */
export function subscribeToComments(fileId, callback) {
  const db = getToolDb();
  if (!db) return () => {};

  const key = getCommentsKey(fileId);
  db.subscribeData(key);

  // Network/storage listener — reconstruct CRDT value from changes
  const listener = (msg) => {
    const value = valueFromCrdtMsg(msg);
    callback(value);
  };
  db.addKeyListener(key, listener);

  // Local listener for immediate updates
  if (!localCommentListeners.has(fileId)) {
    localCommentListeners.set(fileId, new Set());
  }
  localCommentListeners.get(fileId).add(callback);

  return () => {
    const listeners = localCommentListeners.get(fileId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        localCommentListeners.delete(fileId);
      }
    }
  };
}

/**
 * Parse comment key to extract author and timestamp
 */
export function parseCommentKey(commentKey) {
  const lastUnderscore = commentKey.lastIndexOf("_");
  if (lastUnderscore === -1) {
    return { author: commentKey, timestamp: 0 };
  }

  const author = commentKey.substring(0, lastUnderscore);
  const timestamp = parseInt(commentKey.substring(lastUnderscore + 1), 10);

  return { author, timestamp };
}

/**
 * Get comments as a sorted array
 */
export function getCommentsArray(commentsData) {
  if (!commentsData) return [];

  return Object.entries(commentsData)
    .map(([key, data]) => {
      const { author, timestamp } = parseCommentKey(key);
      return {
        key,
        author,
        timestamp,
        text: data.text,
        editedAt: data.editedAt,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp); // Oldest first
}

/**
 * Get comment count for a file
 */
export function getCommentCount(commentsData) {
  if (!commentsData) return 0;
  return Object.keys(commentsData).length;
}
