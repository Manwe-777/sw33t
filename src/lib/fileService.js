import { getToolDb, getChannelKey } from "./tooldb";
import { userHasPermission, getChannelMetaSync, PERMISSIONS } from "./channelService";

function sanitizeKey(key) {
  return key.replace(/\./g, "_");
}

function getFilesKey(categoryId) {
  // Namespace by channel: ch:{channelId}:{categoryId}_files
  return getChannelKey(`${sanitizeKey(categoryId)}_files`);
}

function getBlocklistKey(categoryId) {
  // Namespace by channel: ch:{channelId}:{categoryId}_blocklist
  return getChannelKey(`${sanitizeKey(categoryId)}_blocklist`);
}

export async function getFiles(categoryId) {
  const db = getToolDb();
  if (!db) return {};
  
  try {
    const files = await db.getData(getFilesKey(categoryId));
    return files || {};
  } catch (err) {
    console.error("Failed to get files:", err);
    return {};
  }
}

export async function addFile(categoryId, file) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newFile = {
    id,
    name: file.name,
    description: file.description || "",
    linkType: file.linkType,
    link: file.link,
    uploader: userAddress,
    createdAt: Date.now(),
  };

  // Add torrent-specific fields
  if (file.linkType === "torrent") {
    newFile.size = file.size;
    newFile.magnetURI = file.magnetURI;
  }
  
  // Add optional image
  if (file.image) {
    newFile.image = file.image;
  }
  
  const existing = await getFiles(categoryId);
  const updated = { ...existing, [id]: newFile };
  
  await db.putData(getFilesKey(categoryId), updated);

  return newFile;
}

export async function updateFile(categoryId, fileId, updates) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const existing = await getFiles(categoryId);
  const file = existing[fileId];
  
  if (!file) throw new Error("File not found");
  
  if (file.uploader !== userAddress) {
    throw new Error("Only the uploader can edit this file");
  }
  
  const updatedFile = {
    ...file,
    ...updates,
    updatedAt: Date.now(),
  };
  
  const updated = { ...existing, [fileId]: updatedFile };
  await db.putData(getFilesKey(categoryId), updated);

  return updatedFile;
}

export function subscribeToFiles(categoryId, callback) {
  const db = getToolDb();
  if (!db) return () => {};

  const key = getFilesKey(categoryId);
  db.subscribeData(key);

  // putData already triggers key listeners, so this single path
  // handles both local writes and remote updates
  const listener = (msg) => {
    callback(msg.v || {});
  };
  const listenerId = db.addKeyListener(key, listener);

  return () => {
    db.removeKeyListener(listenerId);
  };
}

export function getLinkTypeIcon(linkType) {
  switch (linkType) {
    case "www":
      return "🔗";
    case "magnet":
      return "🧲";
    case "torrent":
      return "📤";
    default:
      return "📄";
  }
}

export function getLinkTypeLabel(linkType) {
  switch (linkType) {
    case "www":
      return "Web Link";
    case "magnet":
      return "Magnet Link";
    case "torrent":
      return "P2P File";
    default:
      return "Link";
  }
}

export function formatLink(link, linkType) {
  if (linkType === "magnet") {
    return link.startsWith("magnet:") ? link : `magnet:?xt=urn:btih:${link}`;
  }
  if (linkType === "torrent") {
    return link.startsWith("magnet:") ? link : `magnet:?xt=urn:btih:${link}`;
  }
  if (linkType === "www") {
    if (!link.startsWith("http://") && !link.startsWith("https://")) {
      return `https://${link}`;
    }
  }
  return link;
}

export async function getBlockedFiles(categoryId) {
  const db = getToolDb();
  if (!db) return {};
  
  try {
    const blocklist = await db.getData(getBlocklistKey(categoryId));
    return blocklist || {};
  } catch (err) {
    console.error("Failed to get blocklist:", err);
    return {};
  }
}

export async function blockFile(categoryId, fileId, reason = "") {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = getChannelMetaSync();
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_FILES)) {
    throw new Error("You don't have permission to block files");
  }
  
  const existing = await getBlockedFiles(categoryId);
  const updated = {
    ...existing,
    [fileId]: {
      blockedBy: userAddress,
      blockedAt: Date.now(),
      reason,
    },
  };
  
  await db.putData(getBlocklistKey(categoryId), updated);
  return updated;
}

export async function unblockFile(categoryId, fileId) {
  const db = getToolDb();
  if (!db) throw new Error("Not connected");
  
  const userAddress = db.userAccount?.getAddress();
  if (!userAddress) throw new Error("Not authenticated");
  
  const meta = getChannelMetaSync();
  if (!userHasPermission(meta, userAddress, PERMISSIONS.BLOCK_FILES)) {
    throw new Error("You don't have permission to unblock files");
  }
  
  const existing = await getBlockedFiles(categoryId);
  const { [fileId]: _, ...remaining } = existing;
  
  await db.putData(getBlocklistKey(categoryId), remaining);
  return remaining;
}

export function subscribeToBlocklist(categoryId, callback) {
  const db = getToolDb();
  if (!db) return () => {};
  
  const key = getBlocklistKey(categoryId);
  db.subscribeData(key);
  
  const listener = (msg) => {
    callback(msg.v || {});
  };
  
  db.addKeyListener(key, listener);
  
  return () => {};
}

export function isFileBlocked(fileId, blocklist) {
  return fileId in (blocklist || {});
}
