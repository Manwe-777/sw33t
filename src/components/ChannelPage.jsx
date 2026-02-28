import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { connectToChannel, getToolDb } from "../lib/tooldb";
import { 
  initializeChannel, 
  getChannelMeta, 
  isAdmin, 
  isCreator, 
  userHasPermission,
  getUserPermissions,
  PERMISSIONS,
  subscribeToChannelMeta, 
  getCategories, 
  updateChannelMeta, 
  promoteToAdmin, 
  demoteAdmin,
  updateAdminPermissions,
  migrateAdminsFormat,
  deleteCategory,
  restoreCategory,
  isCategoryDeleted,
} from "../lib/channelService";
import { permissionsToString, permissionsToBinary } from "../lib/permissions";
import { useAuth } from "../context/AuthContext";
import AuthModal from "./AuthModal";
import UserPanel from "./UserPanel";
import SeedingStatus from "./SeedingStatus";
import CategoryList from "./CategoryList";
import FileList from "./FileList";
import AddFileModal from "./AddFileModal";
import PermissionEditor from "./PermissionEditor";
import AdminItem from "./AdminItem";
import { Shield, Settings, Users, Ban, Folder, Plus, Save, X, Crown, UserPlus } from "lucide-react";
import { ChannelAvatar, UserAvatar } from "./Avatar";

function ChannelPage() {
  const { channelId, categoryId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, updateUserState, anonSignIn, restoreSession, hasStoredSession } = useAuth();
  
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [peerCount, setPeerCount] = useState(0);
  const [error, setError] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  
  const [channelMeta, setChannelMeta] = useState(null);
  const [categories, setCategories] = useState({});
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [userIsCreator, setUserIsCreator] = useState(false);
  const [userPermissions, setUserPermissions] = useState(0);
  
  const [editingChannel, setEditingChannel] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const [newAdminAddress, setNewAdminAddress] = useState("");
  const [isPromoting, setIsPromoting] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [editingAdminPerms, setEditingAdminPerms] = useState(null); // address being edited
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      try {
        const db = connectToChannel(channelId);
        await db.ready;

        if (!mounted) return;
        setDbReady(true);
        setConnected(true);
        setConnecting(false);
        console.log("Connected to channel:", channelId);
      } catch (err) {
        console.error("Connection error:", err);
        if (mounted) {
          setError(err.message || "Failed to connect");
          setConnecting(false);
        }
      }
    };

    connect();

    return () => {
      mounted = false;
    };
  }, [channelId]);

  useEffect(() => {
    if (!dbReady || sessionRestored) return;

    const tryRestore = async () => {
      if (hasStoredSession()) {
        const restored = await restoreSession();
        if (restored) {
          console.log("Session restored from localStorage");
          setSessionRestored(true);
          return;
        }
      }
      setSessionRestored(true);
      if (!isAuthenticated) {
        setShowAuthModal(true);
      }
    };

    tryRestore();
  }, [dbReady, sessionRestored, hasStoredSession, restoreSession, isAuthenticated]);

  useEffect(() => {
    if (!dbReady || !isAuthenticated || !user?.address) return;

    const init = async () => {
      try {
        const meta = await initializeChannel(channelId, user.address, user.username);
        setChannelMeta(meta);
        setUserIsAdmin(isAdmin(meta, user.address));
        setUserIsCreator(isCreator(meta, user.address));
        setUserPermissions(getUserPermissions(meta, user.address));
        
        const cats = await getCategories();
        setCategories(cats);
      } catch (err) {
        console.error("Failed to initialize channel:", err);
      }
    };

    init();

    const unsubMeta = subscribeToChannelMeta((meta) => {
      console.log("Channel meta updated (raw):", meta);
      const migratedMeta = migrateAdminsFormat(meta);
      console.log("Channel meta updated (migrated):", migratedMeta);
      setChannelMeta(migratedMeta);
      setUserIsAdmin(isAdmin(migratedMeta, user?.address));
      setUserIsCreator(isCreator(migratedMeta, user?.address));
      setUserPermissions(getUserPermissions(migratedMeta, user?.address));
    });

    return () => {
      unsubMeta();
    };
  }, [dbReady, isAuthenticated, user?.address, user?.username, channelId]);

  const handleAuthSuccess = useCallback(() => {
    const db = getToolDb();
    if (db) {
      updateUserState(db);
      console.log("User authenticated:", db.userAccount.getAddress());
    }
  }, [updateUserState]);

  const handleSkipAuth = useCallback(async () => {
    try {
      await anonSignIn();
      setShowAuthModal(false);
    } catch (err) {
      console.error("Anonymous sign in failed:", err);
    }
  }, [anonSignIn]);

  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(() => {
      const db = getToolDb();
      if (db && db.network && db.network.clientToSend) {
        const peers = Object.keys(db.network.clientToSend);
        setPeerCount(peers.length);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [connected]);

  const startEditingChannel = () => {
    setEditName(channelMeta?.name || channelId);
    setEditDescription(channelMeta?.description || "");
    setEditAvatar(channelMeta?.avatar || "");
    setEditingChannel(true);
  };

  const saveChannelSettings = async () => {
    setIsSaving(true);
    try {
      await updateChannelMeta({
        name: editName.trim() || channelId,
        description: editDescription.trim(),
        avatar: editAvatar.trim() || null,
      });
      setEditingChannel(false);
    } catch (err) {
      console.error("Failed to save channel settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromoteAdmin = async () => {
    if (!newAdminAddress.trim()) return;
    
    setIsPromoting(true);
    try {
      await promoteToAdmin(newAdminAddress.trim());
      setNewAdminAddress("");
    } catch (err) {
      console.error("Failed to promote admin:", err);
      alert(err.message);
    } finally {
      setIsPromoting(false);
    }
  };

  const handleDemoteAdmin = async (address) => {
    if (!confirm(`Remove ${address.slice(0, 8)}... as admin?`)) return;
    
    try {
      await demoteAdmin(address);
    } catch (err) {
      console.error("Failed to demote admin:", err);
      alert(err.message);
    }
  };

  const handleDeleteCategory = async (catId) => {
    const cat = categories[catId];
    if (!confirm(`Delete category "${cat?.name || catId}"? Files will still exist but the category will be hidden.`)) return;
    
    try {
      await deleteCategory(catId);
      if (categoryId === catId) {
        navigate(`/channel/${channelId}`);
      }
    } catch (err) {
      console.error("Failed to delete category:", err);
      alert(err.message);
    }
  };

  const handleRestoreCategory = async (catId) => {
    try {
      await restoreCategory(catId);
    } catch (err) {
      console.error("Failed to restore category:", err);
      alert(err.message);
    }
  };

  const canEditChannel = userIsCreator || userHasPermission(channelMeta, user?.address, PERMISSIONS.EDIT_CHANNEL);
  const currentCategory = categoryId ? categories[categoryId] : null;

  if (connecting) {
    return (
      <>
        <header>
          <div className="header-content">
            <div className="header-left">
              <h1><Link to="/">Sw33t</Link></h1>
            </div>
          </div>
        </header>
        <main>
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Connecting to {channelId}...</p>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <header>
          <div className="header-content">
            <div className="header-left">
              <h1><Link to="/">Sw33t</Link></h1>
            </div>
          </div>
        </header>
        <main>
          <div className="loading-container">
            <p className="error">{error}</p>
            <button className="btn btn-primary" onClick={() => navigate("/")}>Back to Home</button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header>
        <div className="header-content">
          <div className="header-left">
            <h1><Link to="/">Sw33t</Link></h1>
            <div className="channel-badge">
              <span className="status-dot"></span>
              <span>{channelMeta?.name || channelId}</span>
              <span className="peer-badge">{peerCount} peers</span>
            </div>
          </div>
          <SeedingStatus />
          {isAuthenticated && <UserPanel />}
        </div>
      </header>

      <main>
        <div className="main-content">
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="channel-header-row">
                <ChannelAvatar 
                  channel={channelId} 
                  size={48}
                  src={channelMeta?.avatar}
                />
                <div className="channel-header-text">
                  <h2>{channelMeta?.name || channelId}</h2>
                  <p>{channelMeta?.description || "A decentralized channel"}</p>
                </div>
                {canEditChannel && (
                  <button 
                    className="btn-icon channel-settings-btn"
                    onClick={() => {
                      if (categoryId) {
                        navigate(`/c/${channelId}`);
                      }
                      startEditingChannel();
                      setTimeout(() => {
                        document.querySelector('.admin-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    title="Channel settings"
                  >
                    <Settings size={18} />
                  </button>
                )}
              </div>
            </div>
            
            <CategoryList 
              canDelete={userHasPermission(channelMeta, user?.address, PERMISSIONS.DELETE_CATEGORIES)}
              onDelete={handleDeleteCategory}
              onRestore={handleRestoreCategory}
              showDeleted={userHasPermission(channelMeta, user?.address, PERMISSIONS.DELETE_CATEGORIES)}
            />

            <div className="debug-section">
              <details>
                <summary>Debug Info</summary>
                <p>User: {user?.address?.slice(0, 12)}...</p>
                <p>Creator: {userIsCreator ? "Yes" : "No"}</p>
                <p>Admin: {userIsAdmin ? "Yes" : "No"}</p>
                <p>Permissions: {permissionsToBinary(userPermissions)}</p>
                <p>Can: {permissionsToString(userPermissions) || "None"}</p>
                <p>Peers: {peerCount}</p>
                <p>Channel creator: {channelMeta?.creator?.slice(0, 12)}...</p>
                <p>Admins count: {channelMeta?.admins ? Object.keys(channelMeta.admins).length : 0}</p>
              </details>
            </div>
          </aside>

          <div className="content-area">
            {!isAuthenticated && (
              <div className="auth-prompt">
                <p>Sign in to create categories and share files</p>
                <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
                  Sign In / Sign Up
                </button>
                <button className="btn btn-secondary" onClick={handleSkipAuth}>
                  Continue Anonymously
                </button>
              </div>
            )}

            {currentCategory ? (
              <>
                <div className="content-header">
                  <h2>
                    <Folder size={24} style={{ marginRight: 10, verticalAlign: "middle" }} />
                    {currentCategory.name}
                  </h2>
                  <div className="content-header__actions">
                    <p>Browse and share files in this category</p>
                    {isAuthenticated && (
                      <button className="btn btn-primary" onClick={() => setShowAddFile(true)}>
                        <Plus size={16} style={{ marginRight: 6 }} />
                        Share Link
                      </button>
                    )}
                  </div>
                </div>
                
                <FileList 
                  categoryId={currentCategory.id} 
                  onAddFile={() => setShowAddFile(true)}
                  canBlockFiles={userHasPermission(channelMeta, user?.address, PERMISSIONS.BLOCK_FILES)}
                />
              </>
            ) : (
              <>
                <div className="content-header">
                  <h2>Welcome to {channelMeta?.name || channelId}</h2>
                  <p>Select a category from the sidebar or create one to get started</p>
                </div>

                {userIsAdmin && (
                  <div className="admin-dashboard">
                    <div className={`admin-badge ${userIsCreator ? "creator" : ""}`}>
                      {userIsCreator ? <Crown size={18} /> : <Shield size={18} />}
                      <span>{userIsCreator ? "Channel Creator" : "Channel Admin"}</span>
                    </div>

                    <div className="admin-cards">
                      <div className="card admin-card">
                        <div className="card-header">
                          <h3>
                            <Settings size={18} style={{ marginRight: 8 }} />
                            Channel Settings
                          </h3>
                          {canEditChannel && !editingChannel && (
                            <button className="btn btn-secondary btn-sm" onClick={startEditingChannel}>
                              Edit
                            </button>
                          )}
                        </div>
                        
                        {editingChannel && canEditChannel ? (
                          <>
                            <div className="avatar-edit-row">
                              <ChannelAvatar 
                                channel={channelId} 
                                size={64} 
                                src={editAvatar || undefined}
                              />
                              <div className="avatar-edit-input">
                                <label>Avatar URL</label>
                                <input 
                                  type="url" 
                                  value={editAvatar}
                                  onChange={(e) => setEditAvatar(e.target.value)}
                                  placeholder="https://example.com/image.png"
                                />
                                <span className="hint">Leave empty for auto-generated avatar</span>
                              </div>
                            </div>
                            <div className="form-row">
                              <label>Channel Name</label>
                              <input 
                                type="text" 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Channel name"
                              />
                            </div>
                            <div className="form-row">
                              <label>Description</label>
                              <textarea 
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="What is this channel about?"
                                rows={3}
                              />
                            </div>
                            <div className="form-actions">
                              <button 
                                className="btn btn-primary btn-sm" 
                                onClick={saveChannelSettings}
                                disabled={isSaving}
                              >
                                <Save size={16} style={{ marginRight: 6 }} />
                                {isSaving ? "Saving..." : "Save"}
                              </button>
                              <button 
                                className="btn btn-secondary btn-sm" 
                                onClick={() => setEditingChannel(false)}
                              >
                                <X size={16} style={{ marginRight: 6 }} />
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="channel-info">
                            <p><strong>Name:</strong> {channelMeta?.name || channelId}</p>
                            <p><strong>Description:</strong> {channelMeta?.description || "No description set"}</p>
                            {!canEditChannel && (
                              <p className="hint">You need the Edit Channel permission to change settings</p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="card admin-card">
                        <div className="card-header">
                          <h3>
                            <Users size={18} style={{ marginRight: 8 }} />
                            Admins ({channelMeta?.admins ? Object.keys(channelMeta.admins).length : 0})
                          </h3>
                        </div>
                        <div className="admin-list">
                          {channelMeta?.admins && Object.entries(channelMeta.admins).map(([addr, perms]) => (
                            <div key={addr} className="admin-item-wrapper">
                              <AdminItem
                                address={addr}
                                permissions={perms}
                                isCreator={addr === channelMeta?.creator}
                                isCurrentUser={addr === user?.address}
                                canEdit={userIsCreator}
                                isEditing={editingAdminPerms === addr}
                                onEdit={() => setEditingAdminPerms(editingAdminPerms === addr ? null : addr)}
                                onRemove={() => handleDemoteAdmin(addr)}
                              />
                              {editingAdminPerms === addr && (
                                <PermissionEditor
                                  userAddress={addr}
                                  currentPermissions={perms}
                                  isCreator={addr === channelMeta?.creator}
                                  isSaving={isSavingPerms}
                                  onSave={async (newPerms) => {
                                    setIsSavingPerms(true);
                                    try {
                                      await updateAdminPermissions(addr, newPerms);
                                      setEditingAdminPerms(null);
                                    } catch (err) {
                                      alert("Failed to update permissions: " + err.message);
                                    } finally {
                                      setIsSavingPerms(false);
                                    }
                                  }}
                                  onCancel={() => setEditingAdminPerms(null)}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {userIsCreator && (
                          <div className="add-admin-form">
                            <div className="form-row" style={{ marginBottom: 10 }}>
                              <input
                                type="text"
                                value={newAdminAddress}
                                onChange={(e) => setNewAdminAddress(e.target.value)}
                                placeholder="Paste user address to promote..."
                                style={{ fontSize: "0.85rem" }}
                              />
                            </div>
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={handlePromoteAdmin}
                              disabled={isPromoting || !newAdminAddress.trim()}
                            >
                              <UserPlus size={14} style={{ marginRight: 6 }} />
                              {isPromoting ? "Adding..." : "Add Admin"}
                            </button>
                          </div>
                        )}
                        
                        {!userIsCreator && (
                          <p className="hint">Only the channel creator can manage admins</p>
                        )}
                      </div>

                      <div className="card admin-card">
                        <div className="card-header">
                          <h3>
                            <Ban size={18} style={{ marginRight: 8 }} />
                            Blocklist
                          </h3>
                        </div>
                        <p className="empty-state">No blocked addresses</p>
                        {userIsCreator ? (
                          <p className="hint">Blocklist management coming soon</p>
                        ) : (
                          <p className="hint">Only the channel creator can manage blocklist</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!userIsAdmin && Object.keys(categories).length === 0 && isAuthenticated && (
                  <div className="card">
                    <h3>Get Started</h3>
                    <p style={{ color: "#888" }}>Create a category from the sidebar to start sharing files.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />

      <AddFileModal
        isOpen={showAddFile}
        onClose={() => setShowAddFile(false)}
        categoryId={currentCategory?.id}
        categoryName={currentCategory?.name}
        onSuccess={() => {}}
      />
    </>
  );
}

export default ChannelPage;
