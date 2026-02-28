import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCategories, createCategory, subscribeToCategories, isCategoryDeleted } from "../lib/channelService";
import { useAuth } from "../context/AuthContext";
import { 
  Folder, Film, Music, BookOpen, Gamepad2, Camera, 
  Monitor, Palette, Package, Star, Plus, X, Trash2, RotateCcw
} from "lucide-react";

const ICON_OPTIONS = [
  { id: "folder", icon: Folder, label: "Folder" },
  { id: "film", icon: Film, label: "Movies" },
  { id: "music", icon: Music, label: "Music" },
  { id: "book", icon: BookOpen, label: "Books" },
  { id: "game", icon: Gamepad2, label: "Games" },
  { id: "camera", icon: Camera, label: "Photos" },
  { id: "monitor", icon: Monitor, label: "Software" },
  { id: "palette", icon: Palette, label: "Art" },
  { id: "package", icon: Package, label: "Other" },
  { id: "star", icon: Star, label: "Featured" },
];

function getIconComponent(iconId) {
  const found = ICON_OPTIONS.find((opt) => opt.id === iconId);
  return found ? found.icon : Folder;
}

function CategoryList({ canDelete = false, onDelete, onRestore, showDeleted = false }) {
  const { channelId, categoryId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  const [categories, setCategories] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("folder");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCategories = async () => {
      const cats = await getCategories();
      setCategories(cats);
    };
    loadCategories();
    
    const unsub = subscribeToCategories((cats) => {
      setCategories(cats);
    });
    
    return unsub;
  }, [channelId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    
    const id = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    
    if (!id) {
      setError("Invalid name");
      return;
    }
    
    setIsCreating(true);
    try {
      await createCategory(id, newName.trim(), newIcon);
      setNewName("");
      setNewIcon("folder");
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const allCategories = Object.values(categories).sort((a, b) => a.createdAt - b.createdAt);
  const activeCategories = allCategories.filter(cat => !isCategoryDeleted(cat));
  const deletedCategories = allCategories.filter(cat => isCategoryDeleted(cat));
  
  const categoryList = showDeleted ? allCategories : activeCategories;

  return (
    <div className="sidebar-section">
      <h3>
        Categories
        {isAuthenticated && (
          <button onClick={() => setShowForm(!showForm)} title={showForm ? "Cancel" : "Add category"}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
          </button>
        )}
      </h3>

      {showForm && (
        <form onSubmit={handleCreate} className="category-form">
          <div className="form-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              autoFocus
            />
          </div>
          <div className="icon-picker">
            {ICON_OPTIONS.map((opt) => {
              const IconComponent = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNewIcon(opt.id)}
                  className={`icon-option ${newIcon === opt.id ? "selected" : ""}`}
                  title={opt.label}
                >
                  <IconComponent size={18} />
                </button>
              );
            })}
          </div>
          {error && <p className="error" style={{ margin: "8px 0", fontSize: "0.8rem" }}>{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </button>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {categoryList.length === 0 ? (
        <div className="empty-state">
          No categories yet.
          {isAuthenticated && !showForm && (
            <button 
              onClick={() => setShowForm(true)}
              className="create-link"
            >
              Create one
            </button>
          )}
        </div>
      ) : (
        <ul className="category-list">
          {categoryList.map((cat) => {
            const IconComponent = getIconComponent(cat.icon);
            const isDeleted = isCategoryDeleted(cat);
            
            return (
              <li
                key={cat.id}
                className={`category-item ${categoryId === cat.id ? "active" : ""} ${isDeleted ? "deleted" : ""}`}
                onClick={() => !isDeleted && navigate(`/c/${channelId}/${cat.id}`)}
              >
                <IconComponent size={18} className="icon" />
                <span>{cat.name}</span>
                {canDelete && !isDeleted && onDelete && (
                  <button 
                    className="category-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(cat.id);
                    }}
                    title="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {canDelete && isDeleted && onRestore && (
                  <button 
                    className="category-restore-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(cat.id);
                    }}
                    title="Restore category"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      
      {canDelete && deletedCategories.length > 0 && !showDeleted && (
        <p className="deleted-count">{deletedCategories.length} deleted categor{deletedCategories.length === 1 ? 'y' : 'ies'}</p>
      )}
    </div>
  );
}

export default CategoryList;
