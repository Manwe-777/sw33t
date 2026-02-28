import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Download, LogOut, Settings, Save, X, Copy, Check } from "lucide-react";
import { UserAvatar } from "./Avatar";
import IconButton from "./IconButton";

function UserPanel() {
  const { user, isAuthenticated, signOut, exportKeys, changeUsername, changeAvatar } = useAuth();
  const [showDropdown, setShowDropdown] = useState(null);
  
  const [exportPassword, setExportPassword] = useState("");
  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const copyAddress = async (e) => {
    e?.stopPropagation();
    if (!user.address) return;
    
    try {
      await navigator.clipboard.writeText(user.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const openSettings = () => {
    setEditName(user.username || "");
    setEditAvatar(user.avatar || "");
    setSettingsError("");
    setShowDropdown("settings");
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSettingsError("");

    if (!editName.trim()) {
      setSettingsError("Display name cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      await changeUsername(editName.trim());
      await changeAvatar(editAvatar.trim());
      setShowDropdown(null);
    } catch (err) {
      setSettingsError(err.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (e) => {
    e.preventDefault();
    setExportError("");

    if (exportPassword.length < 4) {
      setExportError("Password must be at least 4 characters");
      return;
    }

    setIsExporting(true);
    try {
      const encrypted = await exportKeys(exportPassword);
      const blob = new Blob([JSON.stringify(encrypted, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sw33t-keys-${user.username || "account"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowDropdown(null);
      setExportPassword("");
    } catch (err) {
      setExportError(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  const shortAddress = user.address
    ? `${user.address.slice(0, 6)}...${user.address.slice(-4)}`
    : "Unknown";

  return (
    <div className="user-panel" ref={dropdownRef}>
      <div className="user-info" onClick={openSettings} style={{ cursor: "pointer" }}>
        <UserAvatar address={user.address} name={user.username} size={36} src={user.avatar} />
        <div className="user-details">
          <span className="user-name">{user.username || "Anonymous"}</span>
          <span className="user-address-row">
            <span className="user-address" title={user.address}>
              {shortAddress}
            </span>
            <IconButton 
              variant="ghost" 
              size="sm" 
              onClick={copyAddress}
              title={copied ? "Copied!" : "Copy address"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </IconButton>
          </span>
        </div>
      </div>

      <div className="user-actions">
        <IconButton
          variant="default"
          size="md"
          onClick={openSettings}
          title="User settings"
          active={showDropdown === "settings"}
        >
          <Settings size={14} />
        </IconButton>
        <IconButton
          variant="default"
          size="md"
          onClick={() => setShowDropdown(showDropdown === "export" ? null : "export")}
          title="Export keys for backup"
          active={showDropdown === "export"}
        >
          <Download size={14} />
        </IconButton>
        <IconButton
          variant="danger"
          size="md"
          onClick={signOut}
          title="Sign out"
        >
          <LogOut size={14} />
        </IconButton>
      </div>

      {showDropdown === "settings" && (
        <div className="user-panel-dropdown settings-dropdown">
          <h4>Profile Settings</h4>
          <form onSubmit={handleSaveSettings}>
            <div className="avatar-edit-section">
              <UserAvatar 
                address={user.address} 
                name={editName || user.username} 
                size={64} 
                src={editAvatar || undefined}
              />
              <div className="avatar-input">
                <label>Avatar URL</label>
                <input
                  type="url"
                  value={editAvatar}
                  onChange={(e) => setEditAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
                <span className="hint">Leave empty for auto-generated</span>
              </div>
            </div>
            
            <div className="form-row">
              <label>Display Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your display name"
                required
              />
            </div>
            
            <div className="form-row readonly">
              <label>Address</label>
              <div className="input-with-btn">
                <input type="text" value={user.address || ""} readOnly />
                <IconButton 
                  variant="inline" 
                  size="sm"
                  onClick={copyAddress}
                  title={copied ? "Copied!" : "Copy address"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
              </div>
            </div>
            
            {settingsError && <p className="error">{settingsError}</p>}
            
            <div className="dropdown-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
                <Save size={14} style={{ marginRight: 6 }} />
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDropdown(null)}
              >
                <X size={14} style={{ marginRight: 6 }} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showDropdown === "export" && (
        <div className="user-panel-dropdown">
          <h4>Export Keys</h4>
          <form onSubmit={handleExport}>
            <p className="dropdown-hint">
              Create an encrypted backup of your account keys.
            </p>
            <div className="form-row">
              <label>Encryption Password</label>
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Enter password"
                minLength={4}
                autoFocus
                required
              />
            </div>
            {exportError && <p className="error">{exportError}</p>}
            <div className="dropdown-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={isExporting}>
                <Download size={14} style={{ marginRight: 6 }} />
                {isExporting ? "Exporting..." : "Download"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDropdown(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default UserPanel;
