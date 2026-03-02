import { getToolDb, getChannelKey } from "./tooldb";
import * as tooldb from "tool-db";

const MapCrdt = tooldb.MapCrdt;

/**
 * Upvote Service (MapCRDT-backed)
 *
 * Data Structure:
 * Key: ch:{channelId}:upvotes_{fileId}
 * CRDT Type: MapCrdt<boolean>
 * Map key = userAddress (one vote per user)
 *
 * Each user can only SET their own address key.
 * true = upvoted, false = un-upvoted.
 *
 * Uses putCrdt/getCrdt for proper P2P conflict resolution.
 * Concurrent upvotes from different users merge correctly
 * instead of last-write-wins overwriting.
 */

function sanitizeKey(key) {
  return key.replace(/\./g, "_");
}

function getUpvotesKey(fileId) {
  return getChannelKey(`upvotes_${sanitizeKey(fileId)}`);
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
 * Store CRDT data locally and trigger key listeners for immediate UI update.
 * putCrdt only broadcasts to the network — it does NOT write to
 * local storage (unlike putData) or trigger key listeners.
 * We persist manually for local-first reads, then trigger listeners
 * so the UI updates without waiting for a network echo.
 */
async function storeAndNotify(db, key, map) {
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
    db.triggerKeyListener(key, data);
  } catch (err) {
    console.error("Failed to store CRDT locally:", err);
  }
}

/**
 * Get all upvotes for a file
 */
export async function getUpvotes(fileId) {
  const db = getToolDb();
  if (!db) return {};

  const userAddress = db.userAccount?.getAddress() || "";

  try {
    const map = new MapCrdt(userAddress);
    await db.getCrdt(getUpvotesKey(fileId), map, false);
    return map.value;
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

  const key = getUpvotesKey(fileId);

  // Hydrate CRDT with existing data
  const map = new MapCrdt(userAddress);
  try {
    await db.getCrdt(key, map, false);
  } catch {
    // No existing data, start fresh
  }

  // Toggle: if true -> false, if false/undefined -> true
  const currentVote = map.value[userAddress];
  const newVote = !currentVote;

  map.SET(userAddress, newVote);

  await db.putCrdt(key, map, false);
  await storeAndNotify(db, key, map);

  return { upvoted: newVote, upvotes: map.value };
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

  // Single listener path: network updates + local triggerKeyListener
  const listener = (msg) => {
    const value = valueFromCrdtMsg(msg);
    callback(value);
  };
  const listenerId = db.addKeyListener(key, listener);

  return () => {
    db.removeKeyListener(listenerId);
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
