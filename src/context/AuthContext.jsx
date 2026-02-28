import { createContext, useContext, useState, useCallback } from "react";
import { getToolDb } from "../lib/tooldb";
import { updateMyProfile, getMyProfile } from "../lib/userService";

const AuthContext = createContext(null);

const SESSION_KEY = "sw33t-session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const saveSession = useCallback(async (db, displayName = null) => {
    if (!db || !db.userAccount || !db.userAccount._keys) return;
    
    try {
      const keys = db.userAccount._keys;
      const pubHex = await crypto.subtle.exportKey("spki", keys.publicKey)
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
      const privHex = await crypto.subtle.exportKey("pkcs8", keys.privateKey)
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      const existingSession = localStorage.getItem(SESSION_KEY);
      let existingDisplayName = null;
      let existingAvatar = null;
      if (existingSession) {
        try {
          const parsed = JSON.parse(existingSession);
          existingDisplayName = parsed.displayName;
          existingAvatar = parsed.avatar;
        } catch {}
      }

      const session = {
        loginName: db.userAccount.getUsername(),
        displayName: displayName || existingDisplayName || db.userAccount.getUsername(),
        avatar: existingAvatar,
        pub: pubHex,
        priv: privHex,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    } catch (err) {
      console.error("Failed to save session:", err);
    }
  }, []);

  const updateUserState = useCallback((db, save = true) => {
    if (db && db.userAccount) {
      const stored = localStorage.getItem(SESSION_KEY);
      let displayName = db.userAccount.getUsername();
      let avatar = null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.displayName) displayName = parsed.displayName;
          if (parsed.avatar) avatar = parsed.avatar;
        } catch {}
      }

      setUser({
        address: db.userAccount.getAddress(),
        username: displayName,
        loginName: db.userAccount.getUsername(),
        avatar: avatar,
      });
      setIsAuthenticated(true);
      if (save) {
        saveSession(db);
      }
    }
  }, [saveSession]);

  const restoreSession = useCallback(async () => {
    const db = getToolDb();
    if (!db) return false;

    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return false;

    try {
      const session = JSON.parse(stored);
      if (!session.pub || !session.priv) return false;

      const loginName = session.loginName || session.name;
      await db.userAccount.setUser({ pub: session.pub, priv: session.priv, name: loginName }, loginName);
      
      const displayName = session.displayName || loginName;
      const avatar = session.avatar || null;
      
      // Sync profile to this channel's ToolDB (profile is per-channel)
      try {
        await updateMyProfile({ 
          username: displayName,
          avatar: avatar,
        });
        console.log("Profile synced to channel");
      } catch (profileErr) {
        console.warn("Failed to sync profile to channel:", profileErr);
      }
      
      setUser({
        address: db.userAccount.getAddress(),
        username: displayName,
        loginName: loginName,
        avatar: avatar,
      });
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      console.error("Failed to restore session:", err);
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  }, []);

  const signUp = useCallback(async (username, password) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    setIsLoading(true);
    setError(null);

    try {
      await db.signUp(username, password);
      // Explicitly set the username since signUp may not do it
      db.userAccount._username = username;
      
      // Save profile to ToolDB so other users can see it
      await updateMyProfile({ username });
      
      setUser({
        address: db.userAccount.getAddress(),
        username: username,
        loginName: username,
      });
      setIsAuthenticated(true);
      await saveSession(db, username);
      return true;
    } catch (err) {
      setError(err.message || "Sign up failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const signIn = useCallback(async (username, password) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    setIsLoading(true);
    setError(null);

    try {
      await db.signIn(username, password);
      // Explicitly set the username since signIn may not do it
      db.userAccount._username = username;
      
      // Get profile from ToolDB (source of truth for display name)
      const profile = await getMyProfile();
      let displayName = profile?.username || username;
      let avatar = profile?.avatar || null;
      
      // If no profile exists yet, create one
      if (!profile) {
        await updateMyProfile({ username });
      }
      
      setUser({
        address: db.userAccount.getAddress(),
        username: displayName,
        loginName: username,
        avatar: avatar,
      });
      setIsAuthenticated(true);
      await saveSession(db, displayName);
      return true;
    } catch (err) {
      setError(err.message || "Sign in failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const anonSignIn = useCallback(async () => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    setIsLoading(true);
    setError(null);

    try {
      await db.anonSignIn();
      
      // Create profile for anonymous user
      const username = "Anonymous";
      try {
        await updateMyProfile({ username });
      } catch (profileErr) {
        console.warn("Failed to create anon profile:", profileErr);
      }
      
      updateUserState(db);
      return true;
    } catch (err) {
      setError(err.message || "Anonymous sign in failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [updateUserState]);

  const importKeys = useCallback(async (encryptedAccount, password) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    setIsLoading(true);
    setError(null);

    try {
      const decrypted = await db.userAccount.decryptAccount(encryptedAccount, password);
      await db.userAccount.setUser(decrypted, decrypted.name);
      db.userAccount._username = encryptedAccount.name;
      
      setUser({
        address: db.userAccount.getAddress(),
        username: encryptedAccount.name,
        loginName: encryptedAccount.name,
      });
      setIsAuthenticated(true);
      await saveSession(db, encryptedAccount.name);
      return true;
    } catch (err) {
      setError(err.message || "Key import failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  const exportKeys = useCallback(async (password) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    try {
      const encrypted = await db.userAccount.encryptAccount(password);
      return encrypted;
    } catch (err) {
      setError(err.message || "Key export failed");
      throw err;
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  const hasStoredSession = useCallback(() => {
    return localStorage.getItem(SESSION_KEY) !== null;
  }, []);

  const getStoredUsername = useCallback(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return parsed.displayName || parsed.loginName || parsed.name;
    } catch {
      return null;
    }
  }, []);

  const changeUsername = useCallback(async (newDisplayName) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");
    if (!newDisplayName.trim()) throw new Error("Display name cannot be empty");

    const trimmedName = newDisplayName.trim();
    
    // Save to ToolDB so other users can see it
    await updateMyProfile({ username: trimmedName });
    
    setUser((prev) => ({
      ...prev,
      username: trimmedName,
    }));
    
    await saveSession(db, trimmedName);
    return true;
  }, [saveSession]);

  const changeAvatar = useCallback(async (avatarUrl) => {
    const db = getToolDb();
    if (!db) throw new Error("Not connected to a channel");

    const url = avatarUrl?.trim() || null;
    
    // Save to ToolDB so other users can see it
    await updateMyProfile({ avatar: url });
    
    setUser((prev) => ({
      ...prev,
      avatar: url,
    }));
    
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        session.avatar = url;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {}
    }
    
    return true;
  }, []);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    error,
    signUp,
    signIn,
    anonSignIn,
    importKeys,
    exportKeys,
    restoreSession,
    signOut,
    hasStoredSession,
    getStoredUsername,
    changeUsername,
    changeAvatar,
    updateUserState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
