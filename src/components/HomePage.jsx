import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Palette } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import SettingsModal from "./SettingsModal";
import Logo from "./Logo";
import { getRecentChannels } from "../lib/recentChannels";

function HomePage() {
  const [channelInput, setChannelInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [recentChannels, setRecentChannels] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentChannels(getRecentChannels());
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    const channel = channelInput.trim();
    if (channel) {
      navigate(`/c/${encodeURIComponent(channel)}`);
    }
  };

  return (
    <>
      <header>
        <div className="header-content">
          <div className="header-left">
            <Logo className="header-logo" size={28} />
            <h1>Sw33t</h1>
          </div>
          <div className="header-right">
            <button 
              className="settings-btn" 
              onClick={() => setShowSettings(true)}
              title="Theme settings"
            >
              <Palette size={18} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        <div className="home-container">
          <Logo className="home-logo" size={100} />
          <h1>Sw33t</h1>
          <p className="tagline">Decentralized File Sharing</p>

          <div className="join-card">
            <h2>Join a Channel</h2>
            <p>Enter a channel name to connect to the P2P network</p>

            <form className="join-form" onSubmit={handleJoin}>
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder="Channel name (e.g., movies)"
              />
              <button type="submit" className="btn btn-primary">Join</button>
            </form>

            {recentChannels.length > 0 && (
              <div className="recent-channels">
                <span className="recent-label">Recent:</span>
                {recentChannels.map((channel, i) => (
                  <span key={channel.id}>
                    <Link to={`/c/${encodeURIComponent(channel.id)}`}>
                      {channel.name}
                    </Link>
                    {i < recentChannels.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}

            <div className="instructions">
              <h4>How it works</h4>
              <ol>
                <li>Enter a channel name and click Join</li>
                <li>Share the URL with others to join the same channel</li>
                <li>All data syncs peer-to-peer, no central server</li>
              </ol>
            </div>
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}

export default HomePage;
