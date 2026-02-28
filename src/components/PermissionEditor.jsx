import { useState } from "react";
import { 
  PERMISSIONS, 
  PERMISSION_LABELS, 
  PERMISSION_DESCRIPTIONS,
  hasPermission,
  togglePermission,
  ALL_PERMISSIONS,
} from "../lib/permissions";
import { Copy, Check, Save, X } from "lucide-react";

const PERMISSION_LIST = [
  PERMISSIONS.BLOCK_FILES,
  PERMISSIONS.BLOCK_USERS,
  PERMISSIONS.CREATE_CATEGORIES,
  PERMISSIONS.DELETE_CATEGORIES,
  PERMISSIONS.PROMOTE_ADMINS,
  PERMISSIONS.DEMOTE_ADMINS,
  PERMISSIONS.EDIT_CHANNEL,
];

function PermissionToggle({ permission, enabled, onChange, disabled }) {
  return (
    <label className={`permission-toggle ${enabled ? "enabled" : ""} ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={() => onChange(permission)}
        disabled={disabled}
      />
      <div className="permission-info">
        <span className="permission-name">{PERMISSION_LABELS[permission]}</span>
        <span className="permission-desc">{PERMISSION_DESCRIPTIONS[permission]}</span>
      </div>
    </label>
  );
}

function PermissionEditor({ 
  currentPermissions, 
  onSave, 
  onCancel, 
  isCreator = false,
  isSaving = false,
  userAddress = "",
}) {
  const [permissions, setPermissions] = useState(currentPermissions);
  const [copied, setCopied] = useState(false);

  const handleToggle = (permission) => {
    setPermissions(prev => togglePermission(prev, permission));
  };

  const handleSelectAll = () => {
    setPermissions(ALL_PERMISSIONS);
  };

  const handleSelectNone = () => {
    setPermissions(0);
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(userAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const hasChanges = permissions !== currentPermissions;

  return (
    <div className="permission-editor">
      <div className="permission-editor__address-section">
        <span className="permission-editor__label">Address</span>
        <div className="permission-editor__address-row">
          <code className="permission-editor__address">{userAddress}</code>
          <button 
            className="btn-icon btn-icon--sm"
            onClick={handleCopyAddress}
            title={copied ? "Copied!" : "Copy address"}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="permission-editor__header">
        <span className="permission-editor__label">Permissions</span>
        <div className="permission-editor__presets">
          <button 
            type="button" 
            className="btn btn-xs btn-ghost"
            onClick={handleSelectAll}
            disabled={isCreator}
          >
            All
          </button>
          <button 
            type="button" 
            className="btn btn-xs btn-ghost"
            onClick={handleSelectNone}
            disabled={isCreator}
          >
            None
          </button>
        </div>
      </div>

      <div className="permission-list">
        {PERMISSION_LIST.map((perm) => (
          <PermissionToggle
            key={perm}
            permission={perm}
            enabled={hasPermission(permissions, perm)}
            onChange={handleToggle}
            disabled={isCreator}
          />
        ))}
      </div>

      {isCreator && (
        <p className="permission-editor__hint">
          Creator permissions cannot be modified
        </p>
      )}

      <div className="permission-editor__actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onSave(permissions)}
          disabled={!hasChanges || isSaving || isCreator}
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

export default PermissionEditor;
