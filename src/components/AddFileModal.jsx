import { useState, useRef } from "react";
import { addFile } from "../lib/fileService";
import { seedFile, formatBytes } from "../lib/torrentService";
import { Link2, Magnet, Package, Upload, X, AlertTriangle, HardDrive } from "lucide-react";

const LINK_TYPES = [
  { id: "www", label: "Web Link", icon: Link2, placeholder: "https://example.com/file.zip" },
  { id: "magnet", label: "Magnet", icon: Magnet, placeholder: "magnet:?xt=urn:btih:..." },
  { id: "tooldb", label: "ToolDB", icon: Package, placeholder: "tooldb://..." },
];

function AddFileModal({ isOpen, onClose, categoryId, categoryName, onSuccess }) {
  const [mode, setMode] = useState("link"); // "link" or "upload"
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkType, setLinkType] = useState("www");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  const handleSubmitLink = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!link.trim()) {
      setError("Link is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await addFile(categoryId, {
        name: name.trim(),
        description: description.trim(),
        linkType,
        link: link.trim(),
      });
      
      resetForm();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to add file");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedFile) {
      setError("Please select a file");
      return;
    }

    const fileName = name.trim() || selectedFile.name;

    setIsSubmitting(true);
    setUploadProgress({ status: "creating", percent: 0 });
    
    try {
      const result = await seedFile(selectedFile, (stats) => {
        setUploadProgress({
          status: "seeding",
          uploaded: stats.uploaded,
          uploadSpeed: stats.uploadSpeed,
          peers: stats.peers,
        });
      });

      setUploadProgress({ status: "saving", percent: 100 });

      await addFile(categoryId, {
        name: fileName,
        description: description.trim(),
        linkType: "torrent",
        link: result.infohash,
        size: result.size,
        magnetURI: result.magnetURI,
      });
      
      resetForm();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to share file");
      setUploadProgress(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!name.trim()) {
        setName(file.name);
      }
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setLink("");
    setLinkType("www");
    setSelectedFile(null);
    setUploadProgress(null);
    setError("");
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  const selectedType = LINK_TYPES.find((t) => t.id === linkType);

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-content--wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} disabled={isSubmitting}>
          <X size={20} />
        </button>

        <h2>Share Content</h2>
        <p className="modal-subtitle">
          Add to <strong>{categoryName}</strong>
        </p>

        <div className="share-mode-tabs">
          <button
            type="button"
            className={`share-mode-tab ${mode === "link" ? "active" : ""}`}
            onClick={() => setMode("link")}
            disabled={isSubmitting}
          >
            <Link2 size={16} />
            Share Link
          </button>
          <button
            type="button"
            className={`share-mode-tab ${mode === "upload" ? "active" : ""}`}
            onClick={() => setMode("upload")}
            disabled={isSubmitting}
          >
            <Upload size={16} />
            Upload File
          </button>
        </div>

        {mode === "link" ? (
          <form onSubmit={handleSubmitLink}>
            <div className="form-group">
              <label>Link Type</label>
              <div className="link-type-selector">
                {LINK_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      className={`link-type-btn ${linkType === type.id ? "active" : ""}`}
                      onClick={() => setLinkType(type.id)}
                    >
                      <Icon size={18} />
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ubuntu 24.04 ISO"
                required
              />
            </div>

            <div className="form-group">
              <label>Link *</label>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={selectedType?.placeholder}
                required
              />
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add some details about this file..."
                rows={3}
              />
            </div>

            {error && <p className="error">{error}</p>}

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sharing..." : "Share Link"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitUpload}>
            <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {selectedFile ? (
                <div className="upload-zone__selected">
                  <HardDrive size={32} />
                  <span className="upload-zone__filename">{selectedFile.name}</span>
                  <span className="upload-zone__size">{formatBytes(selectedFile.size)}</span>
                </div>
              ) : (
                <div className="upload-zone__empty">
                  <Upload size={32} />
                  <span>Click to select a file</span>
                  <span className="upload-zone__hint">or drag and drop</span>
                </div>
              )}
            </div>

            <div className="upload-warning">
              <AlertTriangle size={16} />
              <div className="upload-warning__text">
                <span>Keep this tab open to seed. Others can only download while you're sharing.</span>
                <span className="upload-warning__tip">
                  Tip: Copy the magnet link and add it to a torrent app (qBittorrent, Transmission) for 24/7 seeding.
                </span>
              </div>
            </div>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="File name (auto-filled from file)"
              />
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add some details about this file..."
                rows={3}
              />
            </div>

            {uploadProgress && (
              <div className="upload-progress">
                {uploadProgress.status === "creating" && (
                  <span>Creating torrent...</span>
                )}
                {uploadProgress.status === "seeding" && (
                  <span>
                    Seeding • {uploadProgress.peers || 0} peers
                  </span>
                )}
                {uploadProgress.status === "saving" && (
                  <span>Saving to channel...</span>
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || !selectedFile}
              >
                {isSubmitting ? "Processing..." : "Share File"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default AddFileModal;
