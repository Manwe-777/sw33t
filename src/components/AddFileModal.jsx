import { useState, useRef } from "react";
import { addFile } from "../lib/fileService";
import { seedFile, formatBytes } from "../lib/torrentService";
import { Link2, Magnet, Package, Upload, X, AlertTriangle, HardDrive, Image, Trash2 } from "lucide-react";

const MAX_IMAGE_SIZE = 100 * 1024; // 100KB max for base64 images
const MAX_IMAGE_DIMENSION = 400; // Max width/height for thumbnails

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
  
  // Image state
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState(null); // base64 or URL
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef(null);

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
      const fileData = {
        name: name.trim(),
        description: description.trim(),
        linkType,
        link: link.trim(),
      };
      
      // Add image if provided
      if (imagePreview) {
        fileData.image = imagePreview;
      }
      
      await addFile(categoryId, fileData);
      
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

      const fileData = {
        name: fileName,
        description: description.trim(),
        linkType: "torrent",
        link: result.infohash,
        size: result.size,
        magnetURI: result.magnetURI,
      };
      
      // Add image if provided
      if (imagePreview) {
        fileData.image = imagePreview;
      }
      
      await addFile(categoryId, fileData);
      
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

  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      const canvas = document.createElement("canvas");
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          let { width, height } = img;
          
          // Calculate new dimensions
          if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            if (width > height) {
              height = (height / width) * MAX_IMAGE_DIMENSION;
              width = MAX_IMAGE_DIMENSION;
            } else {
              width = (width / height) * MAX_IMAGE_DIMENSION;
              height = MAX_IMAGE_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Try JPEG first (smaller), fall back to PNG
          let dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          if (dataUrl.length > MAX_IMAGE_SIZE) {
            dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          }
          
          if (dataUrl.length > MAX_IMAGE_SIZE) {
            reject(new Error("Image too large. Please use a smaller image."));
          } else {
            resolve(dataUrl);
          }
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImageError("Please select an image file");
      return;
    }

    setImageError("");
    try {
      const dataUrl = await resizeImage(file);
      setImagePreview(dataUrl);
      setImageUrl(""); // Clear URL if uploading
    } catch (err) {
      setImageError(err.message);
    }
  };

  const handleImageUrlChange = (url) => {
    setImageUrl(url);
    if (url.trim()) {
      setImagePreview(url.trim());
    } else {
      setImagePreview(null);
    }
  };

  const clearImage = () => {
    setImageUrl("");
    setImagePreview(null);
    setImageError("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
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
    setImageUrl("");
    setImagePreview(null);
    setImageError("");
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

            <div className="form-group">
              <label>Preview Image (optional)</label>
              <div className="image-input-group">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => handleImageUrlChange(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="image-url-input"
                />
                <span className="image-input-or">or</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Image size={14} />
                  Upload
                </button>
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  style={{ display: "none" }}
                />
              </div>
              {imageError && <p className="error" style={{ marginTop: "4px" }}>{imageError}</p>}
              {imagePreview && (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button
                    type="button"
                    className="image-preview__remove"
                    onClick={clearImage}
                    title="Remove image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
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

            <div className="form-group">
              <label>Preview Image (optional)</label>
              <div className="image-input-group">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => handleImageUrlChange(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="image-url-input"
                />
                <span className="image-input-or">or</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Image size={14} />
                  Upload
                </button>
                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  style={{ display: "none" }}
                />
              </div>
              {imageError && <p className="error" style={{ marginTop: "4px" }}>{imageError}</p>}
              {imagePreview && (
                <div className="image-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button
                    type="button"
                    className="image-preview__remove"
                    onClick={clearImage}
                    title="Remove image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
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
