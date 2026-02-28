const STORAGE_KEY = "sw33t-recent-channels";
const MAX_RECENT = 5;

/**
 * Get list of recently visited channels
 * @returns {Array<{id: string, name: string, visitedAt: number}>}
 */
export function getRecentChannels() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (err) {
    console.error("Failed to load recent channels:", err);
    return [];
  }
}

/**
 * Add a channel to the recent list
 * @param {string} channelId - The channel ID
 * @param {string} [name] - Optional display name for the channel
 */
export function addRecentChannel(channelId, name = null) {
  if (!channelId) return;
  
  try {
    let recent = getRecentChannels();
    
    // Remove if already exists
    recent = recent.filter(c => c.id !== channelId);
    
    // Add to front
    recent.unshift({
      id: channelId,
      name: name || channelId,
      visitedAt: Date.now(),
    });
    
    // Keep only the most recent
    recent = recent.slice(0, MAX_RECENT);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch (err) {
    console.error("Failed to save recent channel:", err);
  }
}

/**
 * Update the display name for a channel in the recent list
 * @param {string} channelId 
 * @param {string} name 
 */
export function updateRecentChannelName(channelId, name) {
  if (!channelId || !name) return;
  
  try {
    const recent = getRecentChannels();
    const channel = recent.find(c => c.id === channelId);
    if (channel) {
      channel.name = name;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    }
  } catch (err) {
    console.error("Failed to update recent channel name:", err);
  }
}

/**
 * Remove a channel from the recent list
 * @param {string} channelId 
 */
export function removeRecentChannel(channelId) {
  try {
    let recent = getRecentChannels();
    recent = recent.filter(c => c.id !== channelId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch (err) {
    console.error("Failed to remove recent channel:", err);
  }
}

/**
 * Clear all recent channels
 */
export function clearRecentChannels() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear recent channels:", err);
  }
}
