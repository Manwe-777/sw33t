import { useState, useEffect } from "react";
import { 
  getFiles, 
  subscribeToFiles, 
  formatLink,
  getBlockedFiles,
  subscribeToBlocklist,
  blockFile,
  isFileBlocked,
} from "../lib/fileService";
import { 
  downloadTorrent, 
  getTorrentStatus, 
  isSeeding,
  formatBytes,
  formatSpeed,
} from "../lib/torrentService";
import { useAuth } from "../context/AuthContext";
import { UserAvatar } from "./Avatar";
import { 
  Link2, Magnet, Package, ExternalLink, Clock, Copy, Check, Trash2,
  Upload, Download, Users, HardDrive, X,
} from "lucide-react";
import IconButton from "./IconButton";

function getLinkIcon(linkType) {
  switch (linkType) {
    case "www":
      return <Link2 size={16} />;
    case "magnet":
      return <Magnet size={16} />;
    case "tooldb":
      return <Package size={16} />;
    case "torrent":
      return <Upload size={16} />;
    default:
      return <Link2 size={16} />;
  }
}

function TorrentFileCard({ file, canDelete, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadState, setDownloadState] = useState(null); // null | "downloading" | "complete"
  const [progress, setProgress] = useState(null);
  const [downloadedFile, setDownloadedFile] = useState(null); // { url, name }
  
  const timeAgo = getTimeAgo(file.createdAt);
  const seeding = isSeeding(file.link);
  const status = getTorrentStatus(file.link);
  
  const copyLink = async () => {
    try {
      const magnetURI = file.magnetURI || `magnet:?xt=urn:btih:${file.link}`;
      await navigator.clipboard.writeText(magnetURI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = async () => {
    if (downloadState === "downloading") return;
    
    setDownloadState("downloading");
    setProgress({ progress: 0, peers: 0, status: "searching" });
    setDownloadedFile(null);
    
    try {
      console.log("Starting downloadTorrent for:", file.link);
      const result = await downloadTorrent(file.link, (stats) => {
        setProgress(stats);
      });
      
      console.log("downloadTorrent resolved with:", result);
      const { blob, name } = result;
      console.log("Download complete, blob size:", blob?.size, "name:", name);
      
      // Create blob URL and store for manual download
      const fileName = name || file.name;
      const url = URL.createObjectURL(blob);
      console.log("Created blob URL:", url);
      
      setDownloadedFile({ url, name: fileName });
      setDownloadState("complete");
      
      // Try auto-download
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      
      setTimeout(() => {
        console.log("Triggering download click for:", fileName);
        a.click();
        document.body.removeChild(a);
      }, 100);
      
      // Don't auto-hide - let user dismiss or click save link
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed: " + err.message);
      setDownloadState(null);
      setProgress(null);
    }
  };
  
  const handleDismissDownload = () => {
    if (downloadedFile?.url) {
      URL.revokeObjectURL(downloadedFile.url);
    }
    setDownloadState(null);
    setProgress(null);
    setDownloadedFile(null);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Block "${file.name}"? This will hide it from all users.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(file.id);
    } catch (err) {
      console.error("Failed to block file:", err);
      alert("Failed to block file: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`file-card file-card--torrent ${seeding ? "file-card--seeding" : ""}`}>
      <div className="file-card__icon file-card__icon--torrent">
        {seeding ? <Upload size={16} /> : <HardDrive size={16} />}
      </div>
      
      <div className="file-card__content">
        <h4 className="file-card__name">{file.name}</h4>
        {file.description && (
          <p className="file-card__description">{file.description}</p>
        )}
        <div className="file-card__meta">
          <span className="file-card__type file-card__type--torrent">
            {seeding ? "SEEDING" : "P2P"}
          </span>
          {file.size && (
            <span className="file-card__size">
              <HardDrive size={12} />
              {formatBytes(file.size)}
            </span>
          )}
          <span className="file-card__time">
            <Clock size={12} />
            {timeAgo}
          </span>
          {(seeding || status) && (
            <span className="file-card__peers">
              <Users size={12} />
              {status?.peers || 0} peers
            </span>
          )}
        </div>
        
        {downloadState === "downloading" && progress && (
          <div className="file-card__progress">
            {progress.status === "searching" ? (
              <div className="file-card__searching">
                <span className="searching-spinner"></span>
                <span>Searching for peers... {progress.peers || 0} found</span>
              </div>
            ) : (
              <>
                <div className="progress-bar">
                  <div 
                    className="progress-bar__fill" 
                    style={{ width: `${progress.progress || 0}%` }}
                  />
                </div>
                <span className="progress-text">
                  {Math.round(progress.progress || 0)}% 
                  {progress.peers > 0 && ` • ${progress.peers} peer${progress.peers !== 1 ? 's' : ''}`}
                  {progress.downloadSpeed > 0 && ` • ${formatSpeed(progress.downloadSpeed)}`}
                </span>
              </>
            )}
            {progress.error && (
              <span className="progress-error">{progress.error}</span>
            )}
          </div>
        )}
        
        {downloadState === "complete" && downloadedFile && (
          <div className="file-card__complete">
            <Check size={14} /> 
            <span>Ready!</span>
            <a 
              href={downloadedFile.url} 
              download={downloadedFile.name}
              className="file-card__save-link"
            >
              Click to save
            </a>
            <button 
              className="file-card__dismiss"
              onClick={handleDismissDownload}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      
      <div className="file-card__actions">
        <IconButton
          variant="ghost"
          size="md"
          onClick={copyLink}
          title={copied ? "Copied!" : "Copy magnet link"}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </IconButton>
        <IconButton
          variant={downloadState === "downloading" ? "ghost" : "primary"}
          size="md"
          onClick={handleDownload}
          title={downloadState === "downloading" ? "Downloading..." : "Download file"}
          disabled={downloadState === "downloading"}
        >
          <Download size={16} />
        </IconButton>
        {canDelete && (
          <IconButton
            variant="danger"
            size="md"
            onClick={handleDelete}
            title="Block file"
            disabled={isDeleting}
          >
            <Trash2 size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function FileCard({ file, canDelete, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const formattedLink = formatLink(file.link, file.linkType);
  const timeAgo = getTimeAgo(file.createdAt);
  
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(formattedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const openLink = () => {
    if (file.linkType === "magnet") {
      window.location.href = formattedLink;
    } else {
      window.open(formattedLink, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Block "${file.name}"? This will hide it from all users.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(file.id);
    } catch (err) {
      console.error("Failed to block file:", err);
      alert("Failed to block file: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="file-card">
      <div className="file-card__icon">
        {getLinkIcon(file.linkType)}
      </div>
      
      <div className="file-card__content">
        <h4 className="file-card__name">{file.name}</h4>
        {file.description && (
          <p className="file-card__description">{file.description}</p>
        )}
        <div className="file-card__meta">
          <span className="file-card__type">{file.linkType.toUpperCase()}</span>
          <span className="file-card__time">
            <Clock size={12} />
            {timeAgo}
          </span>
          <span className="file-card__uploader">
            <UserAvatar address={file.uploader} size={16} />
            {file.uploader?.slice(0, 6)}...
          </span>
        </div>
      </div>
      
      <div className="file-card__actions">
        <IconButton
          variant="ghost"
          size="md"
          onClick={copyLink}
          title={copied ? "Copied!" : "Copy link"}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </IconButton>
        <IconButton
          variant="default"
          size="md"
          onClick={openLink}
          title="Open link"
        >
          <ExternalLink size={16} />
        </IconButton>
        {canDelete && (
          <IconButton
            variant="danger"
            size="md"
            onClick={handleDelete}
            title="Block file"
            disabled={isDeleting}
          >
            <Trash2 size={16} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

function FileList({ categoryId, onAddFile, canBlockFiles }) {
  const { isAuthenticated } = useAuth();
  const [files, setFiles] = useState({});
  const [blocklist, setBlocklist] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!categoryId) return;
    
    const loadData = async () => {
      setLoading(true);
      const [filesData, blocklistData] = await Promise.all([
        getFiles(categoryId),
        getBlockedFiles(categoryId),
      ]);
      setFiles(filesData);
      setBlocklist(blocklistData);
      setLoading(false);
    };
    
    loadData();
    
    const unsubFiles = subscribeToFiles(categoryId, (data) => {
      setFiles(data);
    });
    
    const unsubBlocklist = subscribeToBlocklist(categoryId, (data) => {
      setBlocklist(data);
    });
    
    return () => {
      unsubFiles();
      unsubBlocklist();
    };
  }, [categoryId]);

  const handleBlockFile = async (fileId) => {
    await blockFile(categoryId, fileId);
  };

  const fileList = Object.values(files)
    .filter((file) => !isFileBlocked(file.id, blocklist))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (loading) {
    return (
      <div className="file-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="file-card file-card--skeleton">
            <div className="file-card__icon skeleton-box" />
            <div className="file-card__content">
              <div className="skeleton-text skeleton-text--title" />
              <div className="skeleton-text skeleton-text--desc" />
              <div className="file-card__meta">
                <div className="skeleton-text skeleton-text--meta" />
                <div className="skeleton-text skeleton-text--meta" />
              </div>
            </div>
            <div className="file-card__actions">
              <div className="skeleton-box skeleton-box--btn" />
              <div className="skeleton-box skeleton-box--btn" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (fileList.length === 0) {
    return (
      <div className="file-list__empty">
        <p>No files shared yet in this category.</p>
        {isAuthenticated && (
          <button className="btn btn-primary" onClick={onAddFile}>
            Share a Link
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="file-list">
      {fileList.map((file) => (
        file.linkType === "torrent" ? (
          <TorrentFileCard
            key={file.id}
            file={file}
            canDelete={canBlockFiles}
            onDelete={handleBlockFile}
          />
        ) : (
          <FileCard 
            key={file.id} 
            file={file} 
            canDelete={canBlockFiles}
            onDelete={handleBlockFile}
          />
        )
      ))}
    </div>
  );
}

export default FileList;
