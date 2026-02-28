import { UserAvatar } from "./Avatar";
import { useProfile } from "../hooks/useProfile";
import { getPermissionsList } from "../lib/permissions";
import { Crown, Edit2, Trash2, ChevronDown, ChevronUp } from "lucide-react";

function AdminItem({ 
  address, 
  permissions, 
  isCreator, 
  isCurrentUser,
  canEdit,
  isEditing,
  onEdit,
  onRemove,
}) {
  const { profile, loading } = useProfile(address);
  
  const displayName = profile?.username;
  const shortAddress = address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "Unknown";
  const permCount = getPermissionsList(permissions).length;

  return (
    <div className={`admin-item ${isEditing ? "admin-item--editing" : ""}`}>
      <UserAvatar address={address} name={displayName} size={40} src={profile?.avatar} />
      <div className="admin-item__info">
        <div className="admin-item__name-row">
          <span className="admin-item__name">
            {loading ? "Loading..." : (displayName || shortAddress)}
          </span>
          {isCreator && <span className="creator-badge"><Crown size={12} /> Creator</span>}
          {isCurrentUser && <span className="you-badge">You</span>}
        </div>
        {displayName && (
          <span className="admin-item__address" title={address}>
            {shortAddress}
          </span>
        )}
      </div>
      <div className="admin-item__meta">
        <span className="admin-item__perm-count" title="Number of permissions">
          {isCreator ? "All" : permCount} perms
        </span>
      </div>
      <div className="admin-item__actions">
        {canEdit && !isCreator && (
          <>
            <button 
              className={`btn-icon ${isEditing ? "btn-icon--active" : ""}`}
              onClick={onEdit}
              title={isEditing ? "Close" : "Edit permissions"}
            >
              {isEditing ? <ChevronUp size={16} /> : <Edit2 size={14} />}
            </button>
            <button 
              className="btn-icon btn-icon--danger"
              onClick={onRemove}
              title="Remove admin"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminItem;
