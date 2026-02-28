import { useState, useEffect } from "react";
import { getSeedingTorrents, formatBytes, formatSpeed } from "../lib/torrentService";
import { Upload, ChevronUp, ChevronDown, Copy, Check, Info } from "lucide-react";

function SeedingStatus() {
  const [seeds, setSeeds] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeeds(getSeedingTorrents());
    }, 2000);

    setSeeds(getSeedingTorrents());
    
    return () => clearInterval(interval);
  }, []);

  const copyMagnet = async (infohash, e) => {
    e.stopPropagation();
    try {
      const magnetURI = `magnet:?xt=urn:btih:${infohash}`;
      await navigator.clipboard.writeText(magnetURI);
      setCopiedHash(infohash);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (seeds.length === 0) return null;

  const totalPeers = seeds.reduce((acc, s) => acc + (s.peers || 0), 0);
  const totalUploadSpeed = seeds.reduce((acc, s) => acc + (s.uploadSpeed || 0), 0);

  return (
    <div className="seeding-status">
      <button 
        className="seeding-status__toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <Upload size={14} className="seeding-status__icon" />
        <span className="seeding-status__count">
          Seeding {seeds.length} file{seeds.length !== 1 ? "s" : ""}
        </span>
        {totalPeers > 0 && (
          <span className="seeding-status__peers">
            • {totalPeers} peer{totalPeers !== 1 ? "s" : ""}
          </span>
        )}
        {totalUploadSpeed > 0 && (
          <span className="seeding-status__speed">
            • {formatSpeed(totalUploadSpeed)}
          </span>
        )}
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      
      {expanded && (
        <div className="seeding-status__list">
          {seeds.map((seed) => (
            <div key={seed.infohash} className="seeding-status__item">
              <div className="seeding-status__item-header">
                <span className="seeding-status__name" title={seed.name}>
                  {seed.name}
                </span>
                <button
                  className="seeding-status__copy"
                  onClick={(e) => copyMagnet(seed.infohash, e)}
                  title={copiedHash === seed.infohash ? "Copied!" : "Copy magnet link"}
                >
                  {copiedHash === seed.infohash ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <span className="seeding-status__meta">
                {formatBytes(seed.size)}
                {seed.peers > 0 && ` • ${seed.peers} peers`}
                {seed.uploadSpeed > 0 && ` • ↑${formatSpeed(seed.uploadSpeed)}`}
              </span>
            </div>
          ))}
          <div className="seeding-status__tip">
            <Info size={12} />
            <span>Add magnet to a torrent app for 24/7 seeding</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SeedingStatus;
